import Homey from 'homey';
import { AguaIotClient, AguaIotDevice } from './agua-iot-client';
import { AIR_VARIANTS, DEFAULT_LANGUAGE, STATUS_IDLE, STATUS_OFF } from './constants';

export class AguaIotStoveDevice extends Homey.Device {
  private aguaDevice: AguaIotDevice | null = null;
  private aguaClient: AguaIotClient | null = null;
  private pollingTimer: NodeJS.Timeout | null = null;
  private updatingState = false;
  private failureCount = 0;
  private maxFailures = 5;
  private temperatureSetKey?: string;
  private temperatureGetKey?: string;

  async onInit() {
    this.log(`Agua IoT device [${this.getName()}] initializing`);
    this.failureCount = 0;

    try {
      const store = this.getStore();
      const settings = this.getSettings();

      this.maxFailures = Number(settings.max_number_of_errors_before_device_unavailable ?? 5);

      this.aguaClient = new AguaIotClient({
        apiUrl: store.apiUrl,
        customerCode: store.customerCode,
        email: store.email,
        password: store.password,
        uniqueId: store.uniqueId,
        loginApiUrl: store.loginApiUrl,
        brandId: store.brandId,
        brand: store.brand,
        airTempFix: settings.air_temp_fix,
        readingErrorFix: settings.reading_error_fix,
        language: settings.language ?? DEFAULT_LANGUAGE,
        httpTimeout: Number(settings.http_timeout ?? 30000),
        bufferReadTimeout: Number(settings.buffer_read_timeout ?? 30000)
      });

      this.aguaDevice = new AguaIotDevice(
        {
          id: store.id,
          idDevice: this.getData().id,
          idProduct: store.idProduct,
          productSerial: store.productSerial,
          name: this.getName(),
          isOnline: store.isOnline ?? true,
          nameProduct: store.nameProduct,
          idRegistersMap: store.idRegistersMap
        },
        this.aguaClient
      );

      await this.aguaClient.registerAppId();
      await this.aguaClient.login();
      await this.aguaDevice.initialize();

      this.temperatureGetKey = this.resolveTemperatureKey('get');
      this.temperatureSetKey = this.resolveTemperatureKey('set');

      this.registerCapabilityListener('onoff', async (value) => this.onCapability('onoff', value));
      this.registerCapabilityListener('target_temperature', async (value) => this.onCapability('target_temperature', value));

      await this.refreshState();
      this.setAvailable();

      this.initializePolling(Number(settings.polling_interval ?? 30));

      this.log(`Agua IoT device [${this.getName()}] initialized`);
    } catch (err) {
      const message = err instanceof Error ? err.message : JSON.stringify(err);
      this.error(`Cannot initialize device [${this.getName()}]: ${message}`);
      this.setUnavailable(`Cannot initialize device [${this.getName()}]: ${message}`);
    }
  }

  private resolveTemperatureKey(mode: 'get' | 'set'): string | undefined {
    if (!this.aguaDevice) {
      return undefined;
    }

    for (const variant of AIR_VARIANTS) {
      const key = `temp_${variant}_${mode}`;
      if (this.aguaDevice.registers.includes(key) && this.aguaDevice.getRegisterEnabled(key)) {
        const value = this.aguaDevice.getRegisterValue(key);
        if (value !== undefined) {
          return key;
        }
      }
    }

    return undefined;
  }

  private initializePolling(intervalSeconds: number) {
    if (this.pollingTimer) {
      this.homey.clearInterval(this.pollingTimer);
    }

    this.pollingTimer = this.homey.setInterval(async () => {
      try {
        await this.refreshState();
      } catch (err) {
        if (this.pollingTimer) {
          this.homey.clearInterval(this.pollingTimer);
        }
        const message = err instanceof Error ? err.message : JSON.stringify(err);
        this.error(`Error during polling: ${message}`);
        this.setUnavailable(`Device [${this.getName()}] is unavailable; failure count: ${this.failureCount}`);
      }
    }, intervalSeconds * 1000);
  }

  private async refreshState() {
    if (!this.aguaDevice) {
      return;
    }

    if (this.updatingState) {
      this.log('Skipping state refresh because another update is in progress');
      return;
    }

    try {
      await this.aguaDevice.update();
      this.updateCapabilities();
      this.failureCount = 0;
    } catch (err) {
      this.failureCount += 1;
      const message = err instanceof Error ? err.message : JSON.stringify(err);
      this.error(`Error during polling of device [${this.getName()}]; failure count=${this.failureCount}: ${message}`);
      if (this.failureCount >= this.maxFailures) {
        throw new Error(`Device [${this.getName()}] is failing multiple times; failure count: ${this.failureCount}`);
      }
    }
  }

  private updateCapabilities() {
    if (!this.aguaDevice) {
      return;
    }

    const statusDescription = this.aguaDevice.getRegisterValueDescription('status_get', 'ENG');
    const statusRaw = this.aguaDevice.getRegisterValue('status_get');
    const statusText = statusDescription?.toString().toUpperCase();
    const isOff = statusRaw === 0 || (statusText ? STATUS_OFF.includes(statusText) : false);
    const isIdle = statusText ? STATUS_IDLE.includes(statusText) : false;

    this.setCapabilityValue('onoff', !isOff && !isIdle);

    if (this.temperatureGetKey) {
      const currentTemp = this.aguaDevice.getRegisterValue(this.temperatureGetKey);
      if (currentTemp !== undefined) {
        this.setCapabilityValue('measure_temperature', currentTemp);
      }
    }

    if (this.temperatureSetKey) {
      const targetTemp = this.aguaDevice.getRegisterValue(this.temperatureSetKey);
      if (targetTemp !== undefined) {
        this.setCapabilityValue('target_temperature', targetTemp);
      }

      const minTemp = this.aguaDevice.getRegisterValueMin(this.temperatureSetKey);
      const maxTemp = this.aguaDevice.getRegisterValueMax(this.temperatureSetKey);
      const step = this.aguaDevice.getRegister(this.temperatureSetKey)?.step ?? 1;
      if (minTemp !== undefined && maxTemp !== undefined) {
        this.setCapabilityOptions('target_temperature', {
          min: minTemp,
          max: maxTemp,
          step
        });
      }
    }
  }

  async onSettings({
    changedKeys,
    newSettings
  }: {
    changedKeys: string[];
    newSettings: { [key: string]: boolean | string | number | undefined | null };
  }): Promise<string | void> {
    if (changedKeys.includes('polling_interval')) {
      this.initializePolling(Number(newSettings.polling_interval ?? 30));
    }

    if (changedKeys.some((key) => ['air_temp_fix', 'reading_error_fix', 'language', 'http_timeout', 'buffer_read_timeout'].includes(key))) {
      await this.onInit();
    }
  }

  async onDeleted() {
    if (this.pollingTimer) {
      this.homey.clearInterval(this.pollingTimer);
    }
    this.log(`Agua IoT device [${this.getName()}] deleted`);
  }

  private async onCapability(capability: string, value: any) {
    if (!this.aguaDevice) {
      return;
    }

    this.log(`Device::onCapability(${capability}, ${value})`);
    try {
      this.updatingState = true;

      if (capability === 'onoff') {
        await this.aguaDevice.setRegisterValueDescription(
          'status_managed_get',
          value ? 'ON' : 'OFF',
          value ? 85 : 170,
          'ENG'
        );
      }

      if (capability === 'target_temperature' && this.temperatureSetKey) {
        await this.aguaDevice.setRegisterValue(this.temperatureSetKey, Number(value));
      }

      await this.refreshState();
    } catch (err) {
      const message = err instanceof Error ? err.message : JSON.stringify(err);
      this.error(message);
      await this.refreshState();
      throw new Error(`Error during adjustment of settings from device [${this.getName()}]`);
    } finally {
      this.updatingState = false;
    }
  }
}

module.exports = AguaIotStoveDevice;

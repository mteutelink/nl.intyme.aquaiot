import Homey from 'homey';
import { AguaIotClient, AguaIotDevice } from './agua-iot-client';
import {
  AIR_VARIANTS,
  DEFAULT_LANGUAGE,
  STATUS_IDLE,
  STATUS_OFF,
  WATER_VARIANTS
} from './constants';

interface CapabilityMapping {
  capability: string;
  registerKey?: string;
  required: boolean;
}

export class AguaIotStoveDevice extends Homey.Device {
  private aguaDevice: AguaIotDevice | null = null;
  private aguaClient: AguaIotClient | null = null;
  private pollingTimer: NodeJS.Timeout | null = null;
  private updatingState = false;
  private failureCount = 0;
  private maxFailures = 5;
  private temperatureSetKey?: string;
  private temperatureGetKey?: string;
  private waterTemperatureGetKey?: string;
  private powerKey?: string;

  private lastStatus?: string;
  private lastAlarm?: string;
  private lastPower?: number;
  private lastPelletLevel?: number;
  private lastWaterTemperature?: number;

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log(`Agua IoT device [${this.getName()}] initializing`);
    this.failureCount = 0;

    try {
      const store = this.getStore();
      const settings = this.getSettings();

      this.maxFailures = Number(settings.max_number_of_errors_before_device_unavailable ?? 5);

      // Build the client to connect to Agua IOT cloud.
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

      // Create a device wrapper with the stored identifiers.
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

      this.temperatureGetKey = this.resolveTemperatureKey(AIR_VARIANTS, 'get');
      this.temperatureSetKey = this.resolveTemperatureKey(AIR_VARIANTS, 'set');
      this.waterTemperatureGetKey = this.resolveTemperatureKey(WATER_VARIANTS, 'get');
      this.powerKey = this.resolvePowerKey();

      await this.ensureCapabilities();

      // Register capability listeners for user-driven changes.
      this.registerCapabilityListener('onoff', async (value) => this.onCapability('onoff', value));
      if (this.hasCapability('target_temperature')) {
        this.registerCapabilityListener('target_temperature', async (value) => this.onCapability('target_temperature', value));
      }
      if (this.hasCapability('stove_power')) {
        this.registerCapabilityListener('stove_power', async (value) => this.onCapability('stove_power', value));
      }

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

  /**
   * Ensure optional capabilities match available registers.
   */
  private async ensureCapabilities() {
    if (!this.aguaDevice) {
      return;
    }

    const mappings: CapabilityMapping[] = [
      { capability: 'onoff', required: true },
      { capability: 'target_temperature', registerKey: this.temperatureSetKey, required: !!this.temperatureSetKey },
      { capability: 'measure_temperature', registerKey: this.temperatureGetKey, required: !!this.temperatureGetKey },
      { capability: 'water_temperature', registerKey: this.waterTemperatureGetKey, required: !!this.waterTemperatureGetKey },
      { capability: 'stove_status', registerKey: 'status_get', required: this.aguaDevice.registers.includes('status_get') },
      { capability: 'stove_alarm', registerKey: 'alarms_get', required: this.aguaDevice.registers.includes('alarms_get') },
      { capability: 'pellet_level', registerKey: 'pellet_level_get', required: this.aguaDevice.registers.includes('pellet_level_get') },
      { capability: 'stove_power', registerKey: this.powerKey, required: !!this.powerKey }
    ];

    for (const mapping of mappings) {
      const hasCapability = this.hasCapability(mapping.capability);
      if (mapping.required && !hasCapability) {
        await this.addCapability(mapping.capability);
      }
      if (!mapping.required && hasCapability) {
        await this.removeCapability(mapping.capability);
      }
    }
  }

  /**
   * Resolve temperature register keys using variants list.
   */
  private resolveTemperatureKey(variants: string[], mode: 'get' | 'set'): string | undefined {
    if (!this.aguaDevice) {
      return undefined;
    }

    for (const variant of variants) {
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

  /**
   * Decide which register controls stove power.
   */
  private resolvePowerKey(): string | undefined {
    if (!this.aguaDevice) {
      return undefined;
    }

    if (this.aguaDevice.registers.includes('power_set')) {
      return 'power_set';
    }

    if (this.aguaDevice.registers.includes('power_wood_set')) {
      return 'power_wood_set';
    }

    return undefined;
  }

  /**
   * Start polling the Agua IoT cloud for state updates.
   */
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

  /**
   * Refresh state and update all capabilities.
   */
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

  /**
   * Update capability values based on registers.
   */
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

    if (this.hasCapability('stove_status') && statusDescription !== undefined) {
      const statusValue = statusDescription.toString();
      this.setCapabilityValue('stove_status', statusValue);
      this.triggerIfChanged('stove_status_changed', 'status', statusValue, this.lastStatus, (value) => {
        this.lastStatus = value;
      });
    }

    if (this.hasCapability('stove_alarm')) {
      const alarmDescription = this.aguaDevice.getRegisterValueDescription('alarms_get', 'ENG');
      if (alarmDescription !== undefined) {
        const alarmValue = alarmDescription.toString();
        this.setCapabilityValue('stove_alarm', alarmValue);
        this.triggerIfChanged('stove_alarm_changed', 'alarm', alarmValue, this.lastAlarm, (value) => {
          this.lastAlarm = value;
        });
      }
    }

    if (this.temperatureGetKey && this.hasCapability('measure_temperature')) {
      const currentTemp = this.aguaDevice.getRegisterValue(this.temperatureGetKey);
      if (currentTemp !== undefined) {
        this.setCapabilityValue('measure_temperature', currentTemp);
      }
    }

    if (this.waterTemperatureGetKey && this.hasCapability('water_temperature')) {
      const currentWaterTemp = this.aguaDevice.getRegisterValue(this.waterTemperatureGetKey);
      if (currentWaterTemp !== undefined) {
        this.setCapabilityValue('water_temperature', currentWaterTemp);
        this.triggerIfChanged('water_temperature_changed', 'water_temperature', currentWaterTemp, this.lastWaterTemperature, (value) => {
          this.lastWaterTemperature = value;
        });
      }
    }

    if (this.temperatureSetKey && this.hasCapability('target_temperature')) {
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

    if (this.powerKey && this.hasCapability('stove_power')) {
      const power = this.aguaDevice.getRegisterValue(this.powerKey);
      if (power !== undefined) {
        this.setCapabilityValue('stove_power', power);
        this.triggerIfChanged('stove_power_changed', 'power', power, this.lastPower, (value) => {
          this.lastPower = value;
        });
      }

      const minPower = this.aguaDevice.getRegisterValueMin(this.powerKey);
      const maxPower = this.aguaDevice.getRegisterValueMax(this.powerKey);
      if (minPower !== undefined && maxPower !== undefined) {
        this.setCapabilityOptions('stove_power', {
          min: minPower,
          max: maxPower,
          step: 1
        });
      }
    }

    if (this.hasCapability('pellet_level')) {
      const pelletLevel = this.aguaDevice.getRegisterValue('pellet_level_get');
      if (pelletLevel !== undefined) {
        this.setCapabilityValue('pellet_level', pelletLevel);
        this.triggerIfChanged('pellet_level_changed', 'pellet_level', pelletLevel, this.lastPelletLevel, (value) => {
          this.lastPelletLevel = value;
        });
      }
    }
  }

  /**
   * Trigger a flow card when a state value changes.
   */
  private triggerIfChanged<TValue>(
    cardId: string,
    tokenName: string,
    value: TValue,
    previous: TValue | undefined,
    commit: (value: TValue) => void
  ) {
    if (previous !== value) {
      const card = this.homey.flow.getDeviceTriggerCard(cardId);
      card.trigger(this, { [tokenName]: value }, { [tokenName]: value }).catch(this.error);
      commit(value);
    }
  }

  /**
   * Handle changes in device settings.
   */
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

  /**
   * Called when the device is removed.
   */
  async onDeleted() {
    if (this.pollingTimer) {
      this.homey.clearInterval(this.pollingTimer);
    }
    this.log(`Agua IoT device [${this.getName()}] deleted`);
  }

  /**
   * Handle capability changes originating from Homey.
   */
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

      if (capability === 'stove_power' && this.powerKey) {
        await this.aguaDevice.setRegisterValue(this.powerKey, Number(value));
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

  /**
   * Flow action: set target temperature.
   */
  async setTargetTemperature(value: number) {
    await this.onCapability('target_temperature', value);
  }

  /**
   * Flow action: set power level.
   */
  async setPower(value: number) {
    await this.onCapability('stove_power', value);
  }

  /**
   * Flow action: turn on the stove.
   */
  async turnOn() {
    await this.onCapability('onoff', true);
  }

  /**
   * Flow action: turn off the stove.
   */
  async turnOff() {
    await this.onCapability('onoff', false);
  }

  /**
   * Flow action: synchronize the stove clock.
   */
  async syncClock() {
    if (!this.aguaDevice) {
      return;
    }

    const now = new Date();
    await this.aguaDevice.setRegisterValues(
      {
        clock_hour_set: now.getHours(),
        clock_minute_set: now.getMinutes(),
        calendar_day_set: now.getDate(),
        calendar_month_set: now.getMonth() + 1,
        calendar_year_set: now.getFullYear()
      },
      true
    );

    await this.refreshState();
  }

  /**
   * Flow action: refresh stove status registers.
   */
  async refreshStatus() {
    await this.refreshState();
  }

  /**
   * Flow action: refresh stove alarm registers.
   */
  async refreshAlarm() {
    await this.refreshState();
  }

  /**
   * Flow action: refresh water temperature registers.
   */
  async refreshWaterTemperature() {
    await this.refreshState();
  }

  /**
   * Flow action: refresh pellet level registers.
   */
  async refreshPelletLevel() {
    await this.refreshState();
  }
}

module.exports = AguaIotStoveDevice;

import Homey from 'homey';
import { randomUUID } from 'crypto';
import { AguaIotClient } from './agua-iot-client';
import { DEFAULT_LANGUAGE, ENDPOINTS } from './constants';

class AguaIotDriver extends Homey.Driver {
  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('Agua IoT driver initialized');

    // Flow conditions.
    this.homey.flow.getConditionCard('stove_is_on').registerRunListener(async ({ device }) => {
      return device.getCapabilityValue('onoff') === true;
    });

    this.homey.flow.getConditionCard('stove_status_is').registerRunListener(async ({ device, status }) => {
      return (device.getCapabilityValue('stove_status') ?? '').toString() === status;
    });

    this.homey.flow.getConditionCard('stove_alarm_is').registerRunListener(async ({ device, alarm }) => {
      return (device.getCapabilityValue('stove_alarm') ?? '').toString() === alarm;
    });

    this.homey.flow.getConditionCard('stove_power_is').registerRunListener(async ({ device, power }) => {
      return Number(device.getCapabilityValue('stove_power')) === Number(power);
    });

    this.homey.flow.getConditionCard('pellet_level_is').registerRunListener(async ({ device, pellet_level }) => {
      return Number(device.getCapabilityValue('pellet_level')) === Number(pellet_level);
    });

    this.homey.flow.getConditionCard('water_temperature_is').registerRunListener(async ({ device, water_temperature }) => {
      return Number(device.getCapabilityValue('water_temperature')) === Number(water_temperature);
    });

    // Flow actions.
    this.homey.flow.getActionCard('stove_turn_on').registerRunListener(async ({ device }) => {
      await device.turnOn();
    });

    this.homey.flow.getActionCard('stove_turn_off').registerRunListener(async ({ device }) => {
      await device.turnOff();
    });

    this.homey.flow.getActionCard('stove_set_target_temperature').registerRunListener(async ({ device, temperature }) => {
      await device.setTargetTemperature(temperature);
    });

    this.homey.flow.getActionCard('stove_set_power').registerRunListener(async ({ device, power }) => {
      await device.setPower(power);
    });

    this.homey.flow.getActionCard('stove_sync_clock').registerRunListener(async ({ device }) => {
      await device.syncClock();
    });

    this.homey.flow.getActionCard('stove_refresh_status').registerRunListener(async ({ device }) => {
      await device.refreshStatus();
    });

    this.homey.flow.getActionCard('stove_refresh_alarm').registerRunListener(async ({ device }) => {
      await device.refreshAlarm();
    });

    this.homey.flow.getActionCard('stove_refresh_water_temperature').registerRunListener(async ({ device }) => {
      await device.refreshWaterTemperature();
    });

    this.homey.flow.getActionCard('stove_refresh_pellet_level').registerRunListener(async ({ device }) => {
      await device.refreshPelletLevel();
    });
  }

  /**
   * onPair handles the pairing wizard.
   */
  async onPair(session: any) {
    let availableDevices: any[] = [];

    session.setHandler('get_endpoints', async () => {
      return ENDPOINTS.map((endpoint) => ({
        id: endpoint.key,
        name: endpoint.name
      }));
    });

    session.setHandler('login', async (data: { endpoint: string; email: string; password: string }) => {
      const endpoint = ENDPOINTS.find((entry) => entry.key === data.endpoint);
      if (!endpoint) {
        throw new Error('Unknown endpoint selected');
      }

      let uniqueId = this.homey.settings.get('agua_unique_id');
      if (!uniqueId) {
        uniqueId = randomUUID();
        this.homey.settings.set('agua_unique_id', uniqueId);
      }

      const client = new AguaIotClient({
        apiUrl: endpoint.apiUrl,
        customerCode: endpoint.customerCode,
        email: data.email,
        password: data.password,
        uniqueId,
        loginApiUrl: endpoint.loginApiUrl,
        brandId: endpoint.brandId,
        brand: endpoint.brand,
        language: DEFAULT_LANGUAGE
      });

      const devices = await client.connect();
      availableDevices = devices.map((device) => ({
        name: device.data.name,
        data: {
          id: device.data.idDevice
        },
        store: {
          id: device.data.id,
          idProduct: device.data.idProduct,
          idRegistersMap: device.data.idRegistersMap,
          productSerial: device.data.productSerial,
          nameProduct: device.data.nameProduct,
          apiUrl: endpoint.apiUrl,
          customerCode: endpoint.customerCode,
          loginApiUrl: endpoint.loginApiUrl,
          brandId: endpoint.brandId,
          brand: endpoint.brand,
          uniqueId,
          email: data.email,
          password: data.password
        }
      }));

      return true;
    });

    session.setHandler('list_devices', async () => {
      return availableDevices;
    });
  }
}

module.exports = AguaIotDriver;

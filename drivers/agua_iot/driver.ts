import Homey from 'homey';
import { randomUUID } from 'crypto';
import { AguaIotClient } from './agua-iot-client';
import { DEFAULT_LANGUAGE, ENDPOINTS } from './constants';

class AguaIotDriver extends Homey.Driver {
  async onInit() {
    this.log('Agua IoT driver initialized');
  }

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

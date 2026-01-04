'use strict';

import Homey from 'homey';

class AguaIotApp extends Homey.App {
  async onInit() {
    this.log('Agua IoT app initialized');
  }
}

module.exports = AguaIotApp;

'use strict';

import Homey from 'homey';

class AguaIotApp extends Homey.App {
  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.log('Agua IoT app initialized');
  }
}

module.exports = AguaIotApp;

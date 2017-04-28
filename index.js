'use strict';

let Service, Characteristic, uuid, Accessory, hap;

module.exports = (homebridge) => {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  uuid = homebridge.hap.uuid;
  Accessory = homebridge.platformAccessory;
  hap = homebridge.hap;

  homebridge.registerPlatform('homebridge-lutron', 'Lutron', LutronPlatform, true);
};

class LutronPlatform {
  constructor(log, config, api) {
    if (!config) return;
    
    log('Arlo Platform Plugin starting', config);
    this.log = log;
    this.api = api;
    this.config = config;
    this.name = config.name || 'Lutron';
    this.platformAccessories = [];

    for (let accessory of config.accessories) {
      if (accessory.type == 'light')
        this.platformAccessories.push(new LightAccessory(log, accessory, api))
      else if (accessory.type == 'shade')
        this.platformAccessories.push(new ShadeAccessory(log, accessory, api))
      else
        log('Unsupported accessory', config);
    }
  }

  accessories(cb) {
    cb(this.platformAccessories);
  }
}

class LightAccessory {
  constructor(log, config, api) {
    this.log = log;
    this.api = api;
    config = config || {};
    this.name = config.name || 'Light';
    this.id = config.id

    this.lastOnBrigthness = 100
    this.brightness = 0
  }

  getPowerOn(cb) {
    cb(null, this.brightness != 0)
  }

  setPowerOn(value, cb) {
    if (value) {
      this.brightness = this.lastOnBrigthness
    }
    else {
      this.lastOnBrigthness = this.brightness > 0 ? this.brightness : 100
      this.brightness = 0
    }
    cb()
  }

  getBrightness(cb) {
    cb(null, this.brightness)
  }

  setBrightness(value, cb) {
    this.brightness = value
    cb()
  }

  getServices() {
    let service = new Service.Lightbulb(this.name);
    service
      .getCharacteristic(Characteristic.On)
      .on('get', this.getPowerOn.bind(this))
      .on('set', this.setPowerOn.bind(this));
    service
      .getCharacteristic(Characteristic.Brightness)
      .on('get', this.getBrightness.bind(this))
      .on('set', this.setBrightness.bind(this));
    return [service];
  }
}

class ShadeAccessory {
  constructor(log, config, api) {
    this.log = log;
    this.api = api;
    config = config || {};
    this.name = config.name_motion || 'Shade';

    this.currentPosition = 0;
    this.targetPosition = 0;
  }

  getCurrentPosition(cb) {
    cb(null, this.currentPosition);
  }

  getTargetPosition(cb) {
    cb(null, this.targetPosition);
  }

  setTargetPosition(value, cb) {
    this.targetPosition = value;
    this.service.setCharacteristic(Characteristic.PositionState, Characteristic.PositionState.STOPPED);
    this.currentPosition = value;
    this.service.setCharacteristic(Characteristic.CurrentPosition, value);
    cb();
  }

  getPositionState(cb) {
    let state = Characteristic.PositionState.STOPPED;
    if (this.targetPosition > this.currentPosition)
      state = Characteristic.PositionState.INCREASING;
    if (this.targetPosition < this.currentPosition)
      state = Characteristic.PositionState.DECREASING;

    cb(null, state);
  }

  getServices() {
    let service = new Service.WindowCovering(this.name);
    service
      .getCharacteristic(Characteristic.CurrentPosition)
      .on('get', this.getCurrentPosition.bind(this));
    service
      .getCharacteristic(Characteristic.TargetPosition)
      .on('get', this.getTargetPosition.bind(this))
      .on('set', this.setTargetPosition.bind(this));
    service
      .getCharacteristic(Characteristic.PositionState)
      .on('get', this.getPositionState.bind(this));
    this.service = service;
    return [service];
  }
}

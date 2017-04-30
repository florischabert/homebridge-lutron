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

class LutronSerial {
  constructor(port, platform, log) {
    let SerialPort = require('serialport');
    let serial = new SerialPort(port, {
      baudrate: 9600,
      parser: SerialPort.parsers.readline("\n")
    });
    this.platform = platform;
    this.serial = serial;
    this.queue = []
		  
    serial.on('open', () => {
      log(`Opened ${port}`)
      while (this.queue.length > 0) {
        let fun = this.queue.shift();
        fun();
      }
    });

    serial.on('data', (data) => {
      let split = data.toString('ascii').split(',');
      if (split.length != 4)
        return;
      if (split[0] !== '~OUTPUT' || split[2] !== '1')
        return;
      let id = parseInt(split[1]);
      let level = parseInt(split[3]);

      let accessory = this.platform.accessoryForId[id]
      if (accessory) {
        log(`Lutron device ${id} set to ${level}`);
        accessory.setLevel(level);
      }
    });
  }

  setOutput(id, value) {
    let fun = () => this.serial.write(`#OUTPUT,${id},1,${value}\r\n`);
    if (this.serial.isOpen())
      fun();
    else
      this.queue.push(fun);    
  }

  getOutput(id) {
    let fun = () => this.serial.write(`?OUTPUT,${id}\r\n`);
    if (this.serial.isOpen())
      fun();
    else
      this.queue.push(fun);    
  }

}

class LutronPlatform {
  constructor(log, config, api) {
    if (!config) return;
    
    log('Arlo Platform Plugin starting', config);
    this.log = log;
    this.api = api;
    this.config = config;
    this.name = config.name || 'Lutron';
    this.platformAccessories = [];
    this.accessoryForId = {};

    this.lutron = new LutronSerial(config.port, this, log);

    for (let accessory of config.accessories) {
      let newAccessory = null;
      if (accessory.type == 'light')
        newAccessory = new LightAccessory(log, accessory, api, this.lutron);
      else if (accessory.type == 'shade')
        newAccessory = new ShadeAccessory(log, accessory, api, this.lutron);
      else
        log('Unsupported accessory', config);

      if (newAccessory) {
        this.accessoryForId[newAccessory.id] = newAccessory;
        this.platformAccessories.push(newAccessory);
      }
    }
  }

  accessories(cb) {
    cb(this.platformAccessories);
  }
}

class LightAccessory {
  constructor(log, config, api, lutron) {
    this.log = log;
    this.api = api;
    this.lutron = lutron;
    config = config || {};
    this.name = config.name || `Light ${config.id}`;
    this.id = config.id

    this.brightness = 0
    this.lastOnBrigthness = 100

    this.lutron.getOutput(this.id)
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
    this.lutron.setOutput(this.id, this.brightness);
    cb()
  }

  getBrightness(cb) {
    cb(null, this.brightness)
  }

  setBrightness(value, cb) {
    this.brightness = value
    this.lutron.setOutput(this.id, this.brightness);
    cb()
  }

  setLevel(value) {
    this.service
      .setCharacteristic(Characteristic.Brightness, value);
    if (value == 0 || value == 100) {
      this.service
        .setCharacteristic(Characteristic.On, value === 100);
    }
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
    this.service = service;
    return [service];
  }
}

class ShadeAccessory {
  constructor(log, config, api, lutron) {
    this.log = log;
    this.api = api;
    this.lutron = lutron;
    config = config || {};
    this.name = config.name || `Shade ${config.id}`;
    this.id = config.id

    this.currentPosition = 0;
    this.targetPosition = 0;
    this.lutron.getOutput(this.id)
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
    this.lutron.setOutput(this.id, this.targetPosition);
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

  setLevel(value) {
    this.service
      .setCharacteristic(Characteristic.currentPosition, value);
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

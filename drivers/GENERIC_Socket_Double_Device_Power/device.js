'use strict';

const Tuya = require('../../lib/tuya');
const Tuydriver = require('tuydriver');

class Device extends Tuya.Device {
    async onInit() {
        super.onInit();

        this.tuyapi.on('data', data => {
            Tuydriver.devicelog('Data from device:', data, 'onoff');
            Tuydriver.processdata(this, data, 'onoff');
        });

        this.registerCapabilityListener('onoff', async(value) => {
            Tuydriver.sendvalues(this, this.tuyapi, value, 'onoff');
        });

        this.registerCapabilityListener('onoff.soc1', async(value) => {
            Tuydriver.sendvalues(this, this.tuyapi, value, 'onoff.soc1');
        });

        this.registerCapabilityListener('onoff.soc2', async(value) => {
            Tuydriver.sendvalues(this, this.tuyapi, value, 'onoff.soc2');
        });

        this.registerCapabilityListener('onoff.lock', async(value) => {
            Tuydriver.sendvalues(this, this.tuyapi, value, 'onoff.lock');
        });

    }
};

module.exports = Device;

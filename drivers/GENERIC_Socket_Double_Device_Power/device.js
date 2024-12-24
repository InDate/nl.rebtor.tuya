'use strict';

const Tuya = require('../../lib/tuya');

class Device extends Tuya.Device {

    setSingleAPIValue = (dps, setValue) => {
        this.tuyapi.emit('debug', `Changing dps: ${JSON.stringify({ dps, set: setValue })}`);
        return this.tuyapi.set({ dps, set: setValue }).catch(error => this.tuyapi.emit('error', `Setting dps failed: ${error}`));
    };

    setManyAPIValue = (data) => {
        this.tuyapi.emit('debug', `Changing many dps: ${JSON.stringify(data)}`);
        return this.tuyapi.set({
            multiple: true,
            data: data
        }).catch(error => this.tuyapi.emit('error', `Setting many DPS failed: ${error}`));
    };

    processDeviceData(data, device) {
        const setDeviceCapability = (capability, value) => {
            var current  = this.getCapabilityValue(capability);
            if (current != value) {
                this.setCapabilityValue(capability, value)
                    .catch(error => this.tuyapi.emit('error', `Setting capability ${capability} failed: ${error}`));
            }
        }

        const setMeasureCapability = (capability, value) => {
            this.setCapabilityValue(capability, value)
                .catch(error => this.tuyapi.emit('error', `Setting measure capability ${capability} failed: ${error}`));
        }

        if (device == "socket" && typeof data === 'object') {
            const logvalue = this.getSetting('DATAATLOG').length < 1500
            ? `${this.getSetting('DATAATLOG')}\n NEW DATA ATTRIBUTE: ${JSON.stringify(data)}`
            : JSON.stringify(data);

            // Write datalog to setting
            this.setSettings({ DATAATLOG: logvalue }).catch(error => this.tuyapi.emit('error', `Setting DATAATLOG failed: ${error}`));

            if (data.dps.hasOwnProperty('1')) {
                setDeviceCapability('onoff.soc1', data.dps['1']);
            }
            if (data.dps.hasOwnProperty('2')) {
                setDeviceCapability('onoff.soc2', data.dps['2']);
            }
            if (data.dps.hasOwnProperty('18')) {
                setMeasureCapability('measure_current', data.dps['18'] / 1000);
            }
            if (data.dps.hasOwnProperty('19')) {
                setMeasureCapability('measure_power', data.dps['19'] / 10);
            }
            if (data.dps.hasOwnProperty('20')) {
                setMeasureCapability('measure_voltage', data.dps['20'] / 10);
            }
            if (data.dps.hasOwnProperty('40')) {
                setDeviceCapability('onoff.lock', data.dps['40']);
            }

            let all_on = true;
            const soc1 = this.getCapabilityValue('onoff.soc1');
            const soc2 = this.getCapabilityValue('onoff.soc2');

            if (soc1 == false && soc2 == false) {
                all_on = false;
            }

            this.setCapabilityValue('onoff', all_on)
                .catch(error => {
                    this.tuyapi.emit('error', `Setting onoff failed: ${error}`);
                });
        }
    }

    async onInit() {
        super.onInit();

        this.tuyapi.on('data', data => {
            this.processDeviceData(data, 'socket');
        });

        this.registerCapabilityListener('onoff', async(value) => {
            return this.setManyAPIValue({
                1: value,
                2: value,
            })
        });

        this.registerCapabilityListener('onoff.soc1', async(value) => {
            return this.setSingleAPIValue('1', value);
        });

        this.registerCapabilityListener('onoff.soc2', async(value) => {
            return this.setSingleAPIValue('2', value);
        });

        this.registerCapabilityListener('onoff.lock', async(value) => {
            return this.setSingleAPIValue('40', value);            
        });

    }
};

module.exports = Device;

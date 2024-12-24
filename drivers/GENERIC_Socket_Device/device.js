'use strict';

const Tuya = require('../../lib/tuya');

class Device extends Tuya.Device {

    setSingleAPIValue = (dps, setValue) => {
        console.log("Changing dps: ", { dps, set: setValue });
        return this.tuyapi.set({ dps, set: setValue }).catch(err => console.error(err));
    };

    setManyAPIValue = (data) => {
        console.log("Changing many dps: ", data);
        return this.tuyapi.set({
            multiple: true,
            data: data
        }).catch(err => console.error(err));
    };

    processDeviceData(data, device) {
        const setDeviceCapability = (capability, value) => {
            var current  = this.getCapabilityValue(capability);
            if (current != value) {
                this.setCapabilityValue(capability, value)
                    .catch(err => console.error(err));
            }
        }

        const setMeasureCapability = (capability, value) => {
            this.setCapabilityValue(capability, value)
                .catch(err => console.error(err));
        }

        if (device = "socket" && typeof data === 'object') {
            const logvalue = this.getSetting('DATAATLOG').length < 1500
            ? `${this.getSetting('DATAATLOG')}\n NEW DATA ATTRIBUTE: ${JSON.stringify(data)}`
            : JSON.stringify(data);

            // Write datalog to setting
            this.setSettings({ DATAATLOG: logvalue }).catch(this.error);

            if (data.dps.hasOwnProperty('1')) {
                setDeviceCapability('onoff', data.dps['1']);
            }
        }
    }

    async onInit() {
        super.onInit();

        this.tuyapi.on('data', data => {
            this.processDeviceData(data, 'socket');
        });

        this.registerCapabilityListener('onoff', async(value) => {
            return this.setSingleAPIValue('onoff', value);
        });

    }
};

module.exports = Device;

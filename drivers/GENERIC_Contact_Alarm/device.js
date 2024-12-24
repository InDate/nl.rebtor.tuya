'use strict';

const Tuya = require('../../lib/tuya');

const other_dps = {
    doorcontact_state: '12',
    battery_percentage: '115',
    temper_alarm: '101',
};


class Device extends Tuya.Device {
    setSingleAPIValue = (dps, setValue) => {
        this.emit('debug', `Changing dps: ${JSON.stringify({ dps, set: setValue })}`)
        return this.tuyapi.set({ dps, set: setValue }).catch(err => console.error(err));
    };

    setManyAPIValue = (data) => {
        this.emit('debug', `Changing dps: ${JSON.stringify(data)}`)
        return this.tuyapi.set({
            multiple: true,
            data: data
        }).catch(err => console.error(err));
    };


    setDeviceCapability = (capability, value) => {
        var current = this.getCapabilityValue(capability);
        if (current != value) {
            this.setCapabilityValue(capability, value)
                .catch(err => console.error(err));
        }
    }

    async onSettings({ oldSettings, newSettings, changedKeys }) {
        this.emit('debug', `Changed settings: ${JSON.stringify(changedKeys)}`)
    }

    async onInit() {
        super.onInit();

        //reset tamper alarm trigger
        this.setDeviceCapability('alarm_tamper', false);

        this.tuyapi.on('data', data => {
            this.emit('debug', `Contact Alarm Payload: ${JSON.stringify(data)}`);
            this.processDeviceData(data, "contact_alarm");
        });

        this.on('timeout', duration => {
            this.emit('debug', `Countdown started for ${duration} minutes.`);
            const milliseconds = duration * 60 * 1000
            setTimeout(() => {
                this.emit('debug', `Countdown finished, resetting alarm.`);
                this.setDeviceCapability('alarm_tamper', false);
            }, milliseconds);
        });
    }

    processDeviceData(data, device) {
        if (device = "contact_alarm" && typeof data === 'object') {
            if (data.dps.hasOwnProperty('1')) {
                this.setDeviceCapability('alarm_contact', data.dps['1']);
            }
            if (data.dps.hasOwnProperty('4')) {
                //data.dps['2'] only equals true
                this.setDeviceCapability('alarm_tamper', true);
                this.emit("timeout", this.getSetting('Timeout'))
            }
            if (data.dps.hasOwnProperty('2')) {
                const battery_percentage = data.dps['2'];
                this.setDeviceCapability('measure_battery', battery_percentage);
                battery_percentage == 0 
                ? this.setDeviceCapability('alarm_battery', true)
                : this.setDeviceCapability('alarm_battery', false)
            }
        }
    }
};

module.exports = Device;

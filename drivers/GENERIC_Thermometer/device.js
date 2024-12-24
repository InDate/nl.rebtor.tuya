'use strict';

const Tuya = require('../../lib/tuya');

const temp_dps = {
    temperature_calibration: '102',
    measure_temperature: '104',
    target_temperature: '106',
    alarm_high_temperature: '109',
    alarm_low_temperature: '110',
    heating_hysteresis: '117',
    cooling_hysteresis: '118'
};

const other_dps = {
    alarm: '12',
    thermostat_mode: '115',
    temperature_unit: '101',
    compressor_delay: '108'
};

class Device extends Tuya.Device {
    setSingleAPIValue = (dps, setValue) => {
        this.emit('debug', `"Changing dps: ${JSON.stringify({ dps, set: setValue })}`);
        return this.tuyapi.set({ dps, set: setValue }).catch(error => this.emit('error', `"setting dps failed: ${error}`));
    };

    setManyAPIValue = (data) => {
        this.emit('debug', `"Changing many dps: ${JSON.stringify({ data })}`);
        return this.tuyapi.set({ multiple: true, data: data }).catch(error => this.emit('error', `setting DPS failed: ${error}`));
    };

    async onSettings({ oldSettings, newSettings, changedKeys }) {
        const data = {};
        this.emit('debug', `settings changed: ${JSON.stringify({ changedKeys })}`);
        changedKeys.forEach((key) => {
            if (temp_dps.hasOwnProperty(key)) {
                data[temp_dps[key]] = newSettings[key] * 10;
            } else if (other_dps.hasOwnProperty(key)) {
                data[other_dps[key]] = newSettings[key];
            }
        });
        try {
            if (Object.keys(data).length > 0) {
                this.emit('debug', `device settings to change: ${JSON.stringify({ data })}`);
                await this.setManyAPIValue(data);
            }
        } catch (error) {
            this.emit('error', `failed to send settings: ${error}`);
        }
    }

    findKeysFromDPS = (dps, obj, exclusions, modifier = 1) => {
        return Object.entries(dps).reduce((result, [dpsKey, value]) => {
            const correspondingKey = Object.keys(obj).find(objKey => obj[objKey] === dpsKey && !exclusions.includes(objKey));
            if (correspondingKey) {
                if (typeof value === 'number') {
                    result[correspondingKey] = value / modifier;
                } else {
                    result[correspondingKey] = value;
                }
            }
            return result;
        }, {});
    };

    async onInit() {
        super.onInit();

        this.tuyapi.on('data', data => {
            this.emit('debug', `data recieved: ${JSON.stringify({ data })}`);
            this.processDeviceData(data, "thermostat");
        });

        this.registerCapabilityListener('target_temperature', async (value) => {
            return this.setSingleAPIValue(temp_dps.target_temperature, value * 10);
        });

        this.registerCapabilityListener('thermostat_mode', async (value) => {
            const currentTemp = this.getCapabilityValue('measure_temperature') * 10;
            const roundedTemp = Math.round(currentTemp / 5) * 5;
            switch (value) {
                case "cool":
                    return this.setSingleAPIValue(temp_dps.target_temperature, 4 * 10);
                case "heat":
                    this.emit('debug', `heating mode, setting temp to current temp + 1 degree: ${roundedTemp}`);
                    const incrementedTemp = roundedTemp + 10;
                    return this.setSingleAPIValue(temp_dps.target_temperature, incrementedTemp);
                case "off":
                    this.emit('debug', `switching off, setting temp to current temp: ${currentTemp}`);
                    return this.setSingleAPIValue(temp_dps.target_temperature, currentTemp);
            }
        });
    }

    processDeviceData(data, device) {
        const setAlarms = (alarmData) => {
            const alarmMapping = {
                0: { 'alarm_cold': false, 'alarm_heat': false, 'alarm_generic.error': false },
                1: { 'alarm_heat': true },
                2: { 'alarm_cold': true },
                3: { 'alarm_generic.error': true }
            };
            const alarms = alarmMapping[alarmData];
            for (const [capability, value] of Object.entries(alarms)) {
                this.setCapabilityValue(capability, value);
            }
        };

        const setTemperatureValues = (temperatureData) => {
            this.setCapabilityValue('measure_temperature', temperatureData[temp_dps.measure_temperature] / 10);
            const currentTemp = this.getCapabilityValue('target_temperature');
            const newTemp = temperatureData[temp_dps.target_temperature] / 10;
            if (currentTemp != newTemp) {
                this.setCapabilityValue('target_temperature', newTemp);
            }
        };

        const setSettings = async (dps) => {
            const currentSettings = await this.getSettings();
            try {
                const temp_settings = this.findKeysFromDPS(dps, temp_dps, ['measure_temperature', 'target_temperature'], 10);
                const other_settings = this.findKeysFromDPS(dps, other_dps, ['thermostat_mode', 'alarm']);
                const newSettings = { ...temp_settings, ...other_settings };
                const changedSettings = Object.keys(newSettings).reduce((changes, key) => {
                    if (currentSettings[key] !== newSettings[key]) {
                        changes[key] = newSettings[key];
                    }
                    return changes;
                }, {});

                if (Object.keys(changedSettings).length > 0) {
                    this.emit('debug', `device settings that have changed: ${JSON.stringify(changedSettings)}`);
                    await this.setSettings(changedSettings);
                }

            } catch (error) {
                this.error(error);
            }
        };

        const setThermostatMode = (modeData) => {
            const MODE_MAPPING = {
                0: ['off', false, false],
                1: ['cool', false, true],
                2: ['off', false, false],
                3: ['heat', true, false],
            };
        
            if (modeData == null || !MODE_MAPPING.hasOwnProperty(modeData)) {
                this.emit('debug', `Invalid modeData: ${modeData}`);
                return;
            }
        
            const [newMode, isHeat, isCool] = MODE_MAPPING[modeData];
        
            // Helper function to update a capability only if the value has changed
            const updateCapability = (capability, newValue) => {
                const currentValue = this.getCapabilityValue(capability);
                if (currentValue !== newValue) {
                    this.setCapabilityValue(capability, newValue);
                }
            };
        
            // Update values only if they need updating
            updateCapability('thermostat_mode', newMode);
            updateCapability('alarm_generic.heat', isHeat);
            updateCapability('alarm_generic.cool', isCool);
        };

        if (device === "thermostat" && typeof data === 'object') {
            setSettings(data.dps);
            setAlarms(data.dps[other_dps.alarm]);
            setTemperatureValues(data.dps);
            setThermostatMode(data.dps[other_dps.thermostat_mode]);
        }
    }
}

module.exports = Device;
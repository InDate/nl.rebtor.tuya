'use strict';
var logging = true;
const Homey = require('homey');

const {TuyaContext} = require('@tuya/tuya-connector-nodejs');
const inquirer = require('inquirer');
const colors = require('colors');
const any = require('promise.any');
const AggregateError = require('es-aggregate-error/polyfill')();

// Refactored SearchDevices function for better readability and modularity
async function fetchDevice(api, DeviceID) {
    const result = await api.request({
        method: 'GET',
        path: `/v1.0/devices/${DeviceID}`
    });
    if (!result.success) {
        throw new Error(`${result.code}: ${result.msg}`);
    }
    return result.result;
}

async function fetchUserDevices(api, userId) {
    const result = await api.request({
        method: 'GET',
        path: `/v1.0/users/${userId}/devices`
    });
    if (!result.success) {
        throw new Error(`${result.code}: ${result.msg}`);
    }
    return result.result;
}

function groupDevices(devices, Category, Model, Productid) {
    const groupedDevices = {};
    for (const device of devices) {
        const isMatchingCategory = (device.category == Category || Category == '');
        const isMatchingModel = (device.model == Model || Model == '' || (Model == 'GPD' && device.status.length > 3) || (Model == 'GNPD' && device.status.length < 3));
        const isMatchingProduct = (device.product_id == Productid);

        if (isMatchingCategory && (isMatchingModel || isMatchingProduct)) {
            if (device.node_id) {
                if (!groupedDevices[device.local_key] || !groupedDevices[device.local_key].subDevices) {
                    groupedDevices[device.local_key] = { ...groupedDevices[device.local_key], subDevices: [] };
                }
                groupedDevices[device.local_key].subDevices.push(device);
            } else {
                groupedDevices[device.local_key] = { ...device, ...groupedDevices[device.local_key] };
            }
        }
    }
    return groupedDevices;
}

function formatDevices(groupedDevices) {
    return Object.values(groupedDevices).map(device => {
        const pretty = {
            name: device.name,
            powerdevice: device.status.length > 3,
            data: {
                IP: `${device.name}-${device.id}`
            },
            settings: {
                ID: device.id,
                Key: device.local_key
            }
        };

        if (device.subDevices) {
            pretty.subDevices = device.subDevices.map(subDevice => ({
                name: subDevice.name,
                ID: subDevice.id,
                cid: subDevice.node_id
            }));
        }
        return pretty;
    });
}

module.exports = {
    SearchDevices: async function (Category, Model, Productid, APIKey, APISecret, APIRegion, DeviceID) {
        const url = 'https://openapi.tuyaeu.com';
        let userId;
        let foundAPIRegion = APIRegion;

        try {
            const { device, region } = await any((APIRegion ? [APIRegion] : REGIONS).map(async region => {
                const api = new TuyaContext({
                    baseUrl: url,
                    accessKey: APIKey,
                    secretKey: APISecret
                });

                const deviceData = await fetchDevice(api, DeviceID);
                return { device: deviceData, region };
            }));

            userId = device.uid;
            foundAPIRegion = region;
        } catch (error) {
            if (process.env.DEBUG) {
                console.error(error.constructor === AggregateError ? error.errors : error);
            }
            console.error(colors.red('There was an issue fetching that device. Make sure your account is linked and the ID is correct.'));
        }

        const api = new TuyaContext({
            baseUrl: url,
            accessKey: APIKey,
            secretKey: APISecret
        });

        const devices = await fetchUserDevices(api, userId);
        const groupedDevices = groupDevices(devices, Category, Model, Productid);
        const prettyDevices = formatDevices(groupedDevices);

        console.log(prettyDevices);
        return prettyDevices;
    },

    // Decimal to Hex converter
    decimalToHex: function (d, padding) {
        var hex = Number(d).toString(16);
        padding = typeof(padding) === "undefined" || padding === null ? padding = 2 : padding;
        while (hex.length < padding) {
            hex = "0" + hex;
        }

        return hex;
    },

    // Logging
    devicelog: function (title, log) {
        if (logging == true) {
            console.log(title, log);
        }
    },

    // clearlog
    clearlog: function (device) {
        device.setSettings({
            DATAATLOG: '',
        })
        .catch(this.error)
    },

    // processdata

    processdata: function (device, data, type) { 
        this.devicelog('typeof: ', typeof data);
        if (typeof data === 'object') {
            // Form log entry
            const logvalue = device.getSetting('DATAATLOG').length < 1500
                ? `${device.getSetting('DATAATLOG')}\n NEW DATA ATTRIBUTE: ${JSON.stringify(data)}`
                : JSON.stringify(data);

            // Write datalog to setting
            device.setSettings({ DATAATLOG: logvalue }).catch(this.error);

            // Helper function to set device capability value
            function setDeviceCapability(device, capability, value) {
                device.setCapabilityValue(capability, value)
                    .catch(err => console.error(err));
            }

            // Helper function to log and set capability
            function logAndSetCapability(device, capability, value, logTitle) {
                this.devicelog(logTitle, value);
                setDeviceCapability(device, capability, value);
            }

            // Process onoff devices
            if (type === 'onoff') {
                var soc1 = device.getCapabilityValue('onoff.soc1');
                var soc2 = device.getCapabilityValue('onoff.soc2');
                var lock = device.getCapabilityValue('onoff.lock');


                this.devicelog('SwitchSocket 1: ', soc1);
                this.devicelog('SwitchSocket 2: ', soc2);
                this.devicelog('SwitchSocket ChildLock: ', lock);

                if (data.dps.hasOwnProperty('1')) {
                    setDeviceCapability(device, 'onoff.soc1', data.dps['1']);
                }
                if (data.dps.hasOwnProperty('2')) {
                    setDeviceCapability(device, 'onoff.soc2', data.dps['2']);
                }
                if (data.dps.hasOwnProperty('18')) {
                    setDeviceCapability(device, 'measure_current', data.dps['18'] / 1000);
                }
                if (data.dps.hasOwnProperty('19')) {
                    setDeviceCapability(device, 'measure_power', data.dps['19'] / 10);
                }
                if (data.dps.hasOwnProperty('20')) {
                    setDeviceCapability(device, 'measure_voltage', data.dps['20'] / 10);
                }
                if (data.dps.hasOwnProperty('40')) {
                    setDeviceCapability(device, 'onoff.lock', data.dps['40']);
                }

            if (soc1 == false && soc2 == false) {
                var total_value = false;
            } else {
                var total_value = true;
            }
            this.devicelog('Switch all: ', total_value);
            device.setCapabilityValue('onoff', total_value)
                .catch(err => {
                    console.error(err);
                });
            }
        }
    },

    // Reconnect
    reconnect: function (APIdevice, device) {
        setTimeout(() => {
            var state = device.getAvailable();
            this.devicelog('Status: ', state);
			
            if (state == false) {
				device.setUnavailable();
                //Find device on network
                APIdevice.find().then(() => {
                    // Connect to device
                    APIdevice.connect().catch(err => {
                        console.error(err);
                    });
                })
                .catch(err => {
                    console.error(err);
                });
            }
            this.reconnect(APIdevice, device);
        }, 20000);
    },

    // Send values function
    sendvalues: function (device, APIdevice, value, parameter) {
        // Helper function to set API device value
        function setAPIValue(APIdevice, options) {
            return APIdevice.set(options).catch(err => console.error(err));
        }

        switch (parameter) {
            case 'onoff':
                return APIdevice.set({
                    multiple: true,
                    data: {
                        1: value,
                        2: value,
                    }
                }).catch(err => {
                    console.error(err);
                });
            case 'onoff.lock':
                return setAPIValue(APIdevice, { dps: 40, set: value });
            case 'onoff.soc1':
                return setAPIValue(APIdevice, { dps: 1, set:value });
            case 'onoff.soc2':
                return setAPIValue(APIdevice, { dps: 2, set:value });          
            default:
                console.error('Unknown parameter: ', parameter);
                break;
        }
    },
};

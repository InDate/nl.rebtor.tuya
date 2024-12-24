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
            console.log("device found")
            console.log(device);
            console.log(device.status);
            
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
    clearlog: async function (device) {
        await device.setSettings({
            DATAATLOG: '',
        })
        .catch(this.error)
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
    }
};

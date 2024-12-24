'use strict';

const Homey = require('homey');
const TuyAPI = require('tuyapi');
const Tuydriver = require('tuydriver');

class Driver extends Homey.Driver {
    async onPair(session, ModelTypeCode = '') {
        const Manifest = this.manifest;
        var DeviceTypeCode = '';
        var ProductIDCode = '';

        for (const Settings of Manifest.settings) {
            for (const Instelling of Settings.children) {
                if (Instelling.id == 'DeviceTypeCode') {
                    Tuydriver.devicelog('DeviceTypeCode =' + Instelling.value);
                    DeviceTypeCode = Instelling.value;
                } else if (Instelling.id == 'ModelTypeCode') {
                    Tuydriver.devicelog('ModelTypeCode' + Instelling.value);
                    ModelTypeCode = Instelling.value;
                } else if (Instelling.id == 'ProductIDCode') {
                    Tuydriver.devicelog('ProductIDCode' + Instelling.value);
                    ProductIDCode = Instelling.value;
                }
            };
        };

        const APIKey = this.homey.settings.get('apikey');
        const APISecret = this.homey.settings.get('apipassword');
        const APIRegion = this.homey.settings.get('region');
        const DeviceID = this.homey.settings.get('randomDeviceId');

        const url = 'https://openapi.tuya' + APIRegion + '.com';

        session.setHandler("list_devices", async function () {
            const devices = await Tuydriver.SearchDevices(
                DeviceTypeCode, ModelTypeCode, ProductIDCode,
                APIKey, APISecret, APIRegion, DeviceID);
            return devices;
        });


    }
}

class Device extends Homey.Device {
    async onInit() {
        const driverName = this.driver.manifest.name.en;
        
        this.enableDebug = this.getSetting('DEBUG') || false
        this.hasBattery = this.getSetting('Battery') || false

        if (this.enableDebug) {
            Tuydriver.devicelog('Debug enabled for:', this.getName());
            Tuydriver.devicelog('Connection initiated', `using driver ${driverName}`);
        }

        Tuydriver.clearlog(this);

        this.tuyapi = new TuyAPI({
            id: this.getSetting('ID'),
            key: this.getSetting('Key'),
            ip: this.getSetting('IP'),
            version: this.getSetting('Version'),
            issueRefreshOnConnect: !this.hasBattery,
            issueRefreshOnPing: !this.hasBattery
        });

        this.tuyapi._connectTimeout = 60; //seconds

        await this.setUnavailable('Connecting to device');

        this.connect();

        this.on('debug', async (message) => {
            if (this.enableDebug) {
                let logvalue = this.getSetting('DEBUG_LOG').length < 1500
                ? `${this.getSetting('DEBUG_LOG')}\n NEW LOG: ${JSON.stringify(message)}`
                : JSON.stringify(message);

                            // Write datalog to setting
                await this.setSettings({ DEBUG_LOG: logvalue }).catch(this.error);

                Tuydriver.devicelog(this.getName() + ':', message);
            }
        });

        this.tuyapi.on('connected', () => {
            if (!this.hasBattery) {
                this.setAvailable();
                this.emit('debug', `Connected`);
            }
        });

        this.tuyapi.on('disconnected', () => {
            if (this.hasBattery) {
                this.emit('debug', `Disconnected but not disabled`);
                this.connect();
            } else {
                this.setUnavailable(`Device Disconnected`);
            }

        });

        this.tuyapi.on('error', error => {
            if (this.hasBattery) {
                const deviceIp = this.getSetting('IP');
                deviceIp
                    ? this.emit('debug', `Tuya API: Manually trigger device with IP: ${deviceIp}`)
                    : this.emit('debug', `Tuya API: No IP Address, activate device for Homey to discover it`);
            } else {
                this.emit('debug', `Tuya API Error: ${error}`);
                this.setUnavailable(error);
                this.tuyapi.client.destroy();
                setTimeout(() => this.connect(), 1000)
            }
        });
    }

    connect() {
        const connectToDevice = () => {
            this.tuyapi.connect()
                .catch((error) => {
                    this.emit('debug', `Promise Error: ${error}`)
                    setTimeout(() => {
                        connectToDevice();
                    }, 5000);
                })
        };

        const connectToBatteryDevice = () => {
            this.setAvailable();
            this.tuyapi.connect()
                .catch((error) => {
                    this.emit('debug', `Promise Error: ${error}`)
                    this.tuyapi.client.destroy();
                    setTimeout(() => this.connect(), 5000)
                });

            this.tuyapi.client.removeAllListeners('error');
            this.tuyapi.client.on('error', error => {
                this.emit('debug', `Tuya Client Error: ${error}`)
                if (!this.tuyapi._connected && this.tuyapi.connectPromise) {
                    this.tuyapi.connectPromise.reject(error);
                    delete this.tuyapi.connectPromise;
                }
            });
        }

        const findAndConnect = async () => {
            try {
                await this.tuyapi.find();
                if (this.tuyapi.ip !== this.tuyapi.device.ip || !this.getSetting('IP')) {
                    this.tuyapi.ip = this.tuyapi.device.ip
                    await this.setSettings({ 'IP': this.tuyapi.device.ip });
                }
                this.hasBattery
                    ? connectToBatteryDevice()
                    : connectToDevice();
            } catch (error) { 
                this.tuyapi.emit('error', error);
            }
        }

        if (!this.tuyapi.ip) {
            this.emit('debug', "No IP Set");
            findAndConnect().catch(error => {
                this.tuyapi.emit('error', `Find and connect failed: ${error}`);
                setTimeout(() => this.connect(), 1000)
            });
        } else {
            this.emit('debug', `IP Found: ${this.tuyapi.ip}`);
            this.hasBattery
                ? connectToBatteryDevice()
                : connectToDevice();
        }
    }
};

module.exports = { Driver, Device };

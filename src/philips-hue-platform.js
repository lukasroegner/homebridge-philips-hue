
const Huejay = require('huejay');
const Bottleneck = require('bottleneck');

const ColorConversion = require('./color-conversion');
const LightBulbDevice = require('./light-bulb-device');
const MotionSensorDevice = require('./motion-sensor-device');

/**
 * Initializes a new platform instance for the Philips Hue plugin.
 * @param log The logging function.
 * @param config The configuration that is passed to the plugin (from the config.json file).
 * @param api The API instance of homebridge (may be null on older homebridge versions).
 */
function PhilipsHuePlatform(log, config, api) {
    const platform = this;

    // Saves objects for functions
    platform.Accessory = api.platformAccessory;
    platform.Categories = api.hap.Accessory.Categories;
    platform.Service = api.hap.Service;
    platform.Characteristic = api.hap.Characteristic;
    platform.UUIDGen = api.hap.uuid;
    platform.hap = api.hap;
    platform.pluginName = 'homebridge-philips-hue';
    platform.platformName = 'PhilipsHuePlatform';

    // Checks whether a configuration is provided, otherwise the plugin should not be initialized
    if (!config) {
        return;
    }

    // Defines the variables that are used throughout the platform
    platform.log = log;
    platform.config = config;
    platform.devices = [];
    platform.lightBulbs = [];
    platform.motionSensors = [];
    platform.accessories = [];

    // Initializes the configuration
    platform.config.bridgeIpAddress = platform.config.bridgeIpAddress || null;
    platform.config.bridgeApiUsername = platform.config.bridgeApiUsername || null;
    platform.config.bridgePort = 80;
    platform.config.bridgeApiTimeout = 15000;
    platform.config.requestsPerSecond = 5;
    platform.config.updateInterval = 5000;
    platform.config.lowBatteryState = 10

    // Initializes the limiter
    platform.limiter = new Bottleneck({
        maxConcurrent: 1,
        minTime: 1000.0 / platform.config.requestsPerSecond
    });

    // Initializes the color conversion
    platform.colorConversion = new ColorConversion();

    // Checks whether the API object is available
    if (!api) {
        platform.log('Homebridge API not available, please update your homebridge version!');
        return;
    }

    // Saves the API object to register new devices later on
    platform.log('Homebridge API available.');
    platform.api = api;

    // Checks if all required information is provided
    if (!platform.config.bridgeIpAddress || !platform.config.bridgeApiUsername) {
        platform.log('No bridge IP address or username provided.');
        return;
    }

    // Initializes the Hue client
    platform.client = new Huejay.Client({
        host: platform.config.bridgeIpAddress,
        port: platform.config.bridgePort,
        username: platform.config.bridgeApiUsername,
        timeout:  platform.config.bridgeApiTimeout
    });
    
    // Subscribes to the event that is raised when homebridge finished loading cached accessories
    platform.api.on('didFinishLaunching', function () {
        platform.log('Cached accessories loaded.');

        // Initially gets the lights from the API
        const promises = [];
        promises.push(platform.limiter.schedule(function() { return platform.client.lights.getAll(); }).then(function(lights) {
            for (let i = 0; i < lights.length; i++) {
                const light = lights[i];

                // Creates the light bulb instance and adds it to the list of all devices
                platform.log('Create light bulb with unique ID ' + light.uniqueId + '.');
                const device = new LightBulbDevice(platform, light);
                platform.lightBulbs.push(device);
                platform.devices.push(device);
            }
        }, function() {
            platform.log('Error while getting the lights. Please check the credentials.');
        }));

        // Initially gets the sensors from the API
        promises.push(platform.limiter.schedule(function() { return platform.client.sensors.getAll(); }).then(function(sensors) {
            return platform.limiter.schedule(function() { return platform.client.rules.getAll(); }).then(function(rules) {

                // Gets the matched sensors
                const motionSensorDevices = [];
                const matchedSensors = sensors.filter(function(s) { return s.uniqueId });
                for (let i = 0; i < matchedSensors.length; i++) {
                    const matchedSensor = matchedSensors[i];

                    // Extracts the unique ID of the hardware, which is the first part of the unique ID
                    const uniqueId = matchedSensor.uniqueId.split('-')[0];
            
                    // Adds it to the current device bucket
                    let motionSensorDevice = motionSensorDevices.find(function(d) { return d.uniqueId == uniqueId });
                    if (!motionSensorDevice) {
                        motionSensorDevice = { uniqueId: uniqueId, sensors: [], rules: [] };
                        motionSensorDevices.push(motionSensorDevice);
                    }
            
                    // Adds the sensor
                    motionSensorDevice.sensors.push(matchedSensor);

                    // Adds the rules
                    const matchedRules = rules.filter(function(r) { return r.conditions.some(function(c) { return c.address === '/sensors/' + matchedSensor.id + '/state/presence'; }); });
                    motionSensorDevice.rules = motionSensorDevice.rules.concat(matchedRules);
                }
            
                // Actually creates the motion sensor devices
                for (let i = 0; i < motionSensorDevices.length; i++) {
                    const motionSensorDevice = motionSensorDevices[i];

                    // Creates the motion sensor instance and adds it to the list of all devices
                    if (motionSensorDevice.sensors.some(function(s) { return s.type === 'ZLLPresence'; })) {
                        platform.log('Create motion sensor with unique ID ' + motionSensorDevice.uniqueId + '.');
                        const device = new MotionSensorDevice(platform, motionSensorDevice.uniqueId, motionSensorDevice.sensors, motionSensorDevice.rules);
                        platform.motionSensors.push(device);
                        platform.devices.push(device);
                    } 
                }
            }, function() {
                platform.log('Error while getting the rules. Please check the credentials.');
            });
        }, function() {
            platform.log('Error while getting the lights. Please check the credentials.');
        }));

        // Removes the accessories that are not bound to a light bulb or motion sensor
        Promise.all(promises).then(function() {
            let unusedAccessories = platform.accessories.filter(function(a) { return !platform.devices.some(function(l) { return l.uniqueId === a.context.uniqueId; }); });
            for (let i = 0; i < unusedAccessories.length; i++) {
                const unusedAccessory = unusedAccessories[i];
                platform.log('Removing accessory with unique ID ' + unusedAccessory.context.uniqueId + ' and kind ' + unusedAccessory.context.kind + '.');
                platform.accessories.splice(platform.accessories.indexOf(unusedAccessory), 1);
            }
            platform.api.unregisterPlatformAccessories(platform.pluginName, platform.platformName, unusedAccessories);

            // Starts the timer for updating lights and sensors
            setInterval(function() {
                platform.limiter.schedule(function() { return platform.client.lights.getAll(); }).then(function(lights) {
                    for (let i = 0; i < platform.lightBulbs.length; i++) {
                        const lightBulb = platform.lightBulbs[i];
                        lightBulb.update(lights);
                    }
                }, function() {
                    platform.log('Error while getting the lights.');
                });
            }, platform.config.updateInterval);
            setTimeout(function() {
                setInterval(function() {
                    platform.limiter.schedule(function() { return platform.client.sensors.getAll(); }).then(function(sensors) {
                        for (let i = 0; i < platform.motionSensors.length; i++) {
                            const motionSensor = platform.motionSensors[i];
                            motionSensor.update(sensors);
                        }
                    }, function() {
                        platform.log('Error while getting the lights.');
                    });
                }, platform.config.updateInterval);
        }, platform.config.updateInterval / 2.0);
            platform.log('Initialization completed.');
        });
    });
}

/**
 * Configures a previously cached accessory.
 * @param accessory The cached accessory.
 */
PhilipsHuePlatform.prototype.configureAccessory = function (accessory) {
    const platform = this;

    // Adds the cached accessory to the list
    platform.accessories.push(accessory);
}

/**
 * Defines the export of the file.
 */
module.exports = PhilipsHuePlatform;

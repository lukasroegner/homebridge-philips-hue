
/**
 * Represents a physical motion sensor device.
 * @param platform The PhilipsHuePlatform instance.
 * @param uniqueId The unique ID.
 * @param sensors The sensors that make up the device.
 * @param rules The rules of the sensors.
 */
function MotionSensorDevice(platform, uniqueId, sensors, rules) {
    const device = this;
    const { UUIDGen, Accessory, Characteristic, Service } = platform;

    // Sets the unique ID, sensors and platform
    device.uniqueId = uniqueId;
    device.sensors = sensors;
    device.platform = platform;

    // Gets the presence sensor for accessory information
    const presenceSensor = device.sensors.find(function(s) { return s.type === 'ZLLPresence'; });

    // Retrieves the activation time spans based on the rules
    device.activationTimeoutHandle = null;
    device.activationTimeSpans = [];

    // Filters out the matched rules
    const matchedRules = rules.filter(function(r) {

        // Rule has to have the correct sensor
        if (!r.conditions.some(function(c) { return c.address === '/sensors/' + presenceSensor.id + '/state/presence'; })) {
            return false;
        }

        // Rule has to have a time difference operator
        if (!r.conditions.some(function(c) { return c.operator === 'ddx'; })) {
            return false;
        }
        return true;
    });

    // Groups the rules by time
    const ruleGroups = [];
    for (let i = 0; i < matchedRules.length; i++) {
        const matchedRule = matchedRules[i];

        // Gets the time span condition and the time difference condition
        const timeSpanCondition = matchedRule.conditions.find(function(c) { return c.address === '/config/localtime' && c.operator === 'in'; });
        const timeDifferenceCondition = matchedRule.conditions.find(function(c) { return c.operator === 'ddx'; });

        // Adds the new group if it does not exist
        if (timeDifferenceCondition) {
            const timeSpanValue = !timeSpanCondition ? null : timeSpanCondition.value;
            let ruleGroup = ruleGroups.find(function(r) { return r.timeSpan === timeSpanValue; });
            if (!ruleGroup) {
                ruleGroup = { timeSpan: timeSpanValue, durations: [] };
                ruleGroups.push(ruleGroup);
            }

            // Adds the duration value
            ruleGroup.durations.push(timeDifferenceCondition.value);
        }
    }

    // Parses the values of the groups and adds the activation time spans
    for (let i = 0; i < ruleGroups.length; i++) {
        const ruleGroup = ruleGroups[i];

        // Parses the time span, 15 seconds base duration
        const start = !ruleGroup.timeSpan ? null : ruleGroup.timeSpan.split('/')[0].substr(1);
        const end = !ruleGroup.timeSpan ? null : ruleGroup.timeSpan.split('/')[1].substr(1);
        let duration = 15;

        // Adds the duration
        for (let j = 0; j < ruleGroup.durations.length; j++) {
            const ruleGroupDuration = ruleGroup.durations[j];
            duration += parseInt(ruleGroupDuration.substr(2, 2)) * 60 * 60;
            duration += parseInt(ruleGroupDuration.substr(5, 2)) * 60;
            duration += parseInt(ruleGroupDuration.substr(8, 2));
        }

        // Checks for a time-based condition
        device.activationTimeSpans.push({
            start: start,
            end: end,
            duration: duration * 1000
        });
        device.platform.log(device.uniqueId + ' - Activation time span from ' + start + ' to ' + end + ' - ' + (duration) + ' seconds');
    }

    // Gets all accessories from the platform that match the unique ID
    let unusedDeviceAccessories = platform.accessories.filter(function(a) { return a.context.uniqueId === device.uniqueId; });
    let newDeviceAccessories = [];
    let deviceAccessories = [];

    // Gets the accessory for the device
    let occupancyAccessory = unusedDeviceAccessories.find(function(a) { return a.context.kind === 'OccupancyAccessory'; });
    if (occupancyAccessory) {
        unusedDeviceAccessories.splice(unusedDeviceAccessories.indexOf(occupancyAccessory), 1);
    } else {
        platform.log('Adding new accessory with unique ID ' + device.uniqueId + ' and kind OccupancyAccessory.');
        occupancyAccessory = new Accessory(presenceSensor.name, UUIDGen.generate(device.uniqueId + 'OccupancyAccessory'));
        occupancyAccessory.context.uniqueId = device.uniqueId;
        occupancyAccessory.context.kind = 'OccupancyAccessory';
        newDeviceAccessories.push(occupancyAccessory);
    }
    deviceAccessories.push(occupancyAccessory);

    // Registers the newly created accessories
    platform.api.registerPlatformAccessories(platform.pluginName, platform.platformName, newDeviceAccessories);

    // Removes all unused accessories
    for (let i = 0; i < unusedDeviceAccessories.length; i++) {
        const unusedDeviceAccessory = unusedDeviceAccessories[i];
        platform.log('Removing unused accessory with unique ID ' + device.uniqueId + ' and kind ' + unusedDeviceAccessory.context.kind + '.');
        platform.accessories.splice(platform.accessories.indexOf(unusedDeviceAccessory), 1);
    }
    platform.api.unregisterPlatformAccessories(platform.pluginName, platform.platformName, unusedDeviceAccessories);

    // Updates the accessory information
    for (let i = 0; i < deviceAccessories.length; i++) {
        const deviceAccessory = deviceAccessories[i];
        let accessoryInformationService = deviceAccessory.getService(Service.AccessoryInformation);
        if (!accessoryInformationService) {
            accessoryInformationService = deviceAccessory.addService(Service.AccessoryInformation);
        }
        accessoryInformationService
            .setCharacteristic(Characteristic.Manufacturer, presenceSensor.model.manufacturer)
            .setCharacteristic(Characteristic.Model, presenceSensor.model.name || presenceSensor.modelId)
            .setCharacteristic(Characteristic.SerialNumber, device.uniqueId);
    }

    // Updates the services
    const orderedSensors = [presenceSensor].concat(device.sensors.filter(function(s) { return s.id !== presenceSensor.id; }));
    for (let i = 0; i < orderedSensors.length; i++) {
        const sensor = orderedSensors[i];

        // Updates the corresponding service
        switch (sensor.type) {
            case 'ZLLPresence':
                device.occupancySensorService = occupancyAccessory.getService(Service.OccupancySensor);
                if (!device.occupancySensorService) {
                    device.occupancySensorService = occupancyAccessory.addService(Service.OccupancySensor);
                }
                device.switchService = occupancyAccessory.getService(Service.Switch);
                if (!device.switchService) {
                    device.switchService = occupancyAccessory.addService(Service.Switch);
                }

                // Subscribes for changes of the switch
                device.switchService.getCharacteristic(Characteristic.On).on('set', function (value, callback) {
                    const currentSensor = device.sensors.find(function(s) { return s.type === 'ZLLPresence'; });
                    currentSensor.config.on = value;

                    // Saves the changes
                    platform.log(device.uniqueId + ' - Switch state to ' + (value ? 'ON' : 'OFF'));
                    platform.limiter.schedule(function() { return platform.client.sensors.save(currentSensor); }).then(function() {}, function() {
                        platform.log(device.uniqueId + ' - Failed to switch state to ' + (value ? 'ON' : 'OFF'));
                    });
                    callback(null);
                });
                break;
            
            case 'ZLLLightLevel':
                device.lightSensorService = occupancyAccessory.getService(Service.LightSensor);
                if (!device.lightSensorService) {
                    device.lightSensorService = occupancyAccessory.addService(Service.LightSensor);
                }
                break;
        
            case 'ZLLTemperature':
                device.temperatureSensorService = occupancyAccessory.getService(Service.TemperatureSensor);
                if (!device.temperatureSensorService) {
                    device.temperatureSensorService = occupancyAccessory.addService(Service.TemperatureSensor);
                }
                break;
        }
    }

    // Updates the state initially
    device.update(device.sensors);
}

/**
 * Can be called to update the device information.
 * @param sensors A list of all sensors.
 */
MotionSensorDevice.prototype.update = function (sensors) {
    const device = this;
    const { Characteristic } = device.platform;

    // Gets the sensors that are used in this motion sensor device
    device.sensors = sensors.filter(function(s) { return s.uniqueId && s.uniqueId.startsWith(device.uniqueId) });

    // Updates the state of each service
    for (let i = 0; i < device.sensors.length; i++) {
        const sensor = device.sensors[i];

        // Updates the corresponding service
        switch (sensor.type) {
            case 'ZLLPresence':
                if (device.switchService) {
                    device.platform.log.debug(device.uniqueId + ' - Updated on state to ' + (sensor.config.on ? 'ON' : 'OFF'));
                    device.switchService.updateCharacteristic(Characteristic.On, sensor.config.on);
                }
                if (device.occupancySensorService) {

                    // Updates the state
                    if (sensor.state.presence) {
                        device.platform.log.debug(device.uniqueId + ' - Updated occupancy state to DETECTED');
                        device.occupancySensorService.updateCharacteristic(Characteristic.OccupancyDetected, true);

                        // Clears the timeout handle
                        if (device.activationTimeoutHandle) {
                            device.platform.log.debug(device.uniqueId + ' - Timeout cleared');
                            clearTimeout(device.activationTimeoutHandle);
                            device.activationTimeoutHandle = null;
                        }

                        // Gets the activation time span for the current time
                        const current = ("00" + new Date().getHours()).slice(-2) + ':' + ("00" + new Date().getMinutes()).slice(-2) + ':' + ("00" + new Date().getSeconds()).slice(-2);
                        const activationTimeSpan = device.activationTimeSpans.find(function(a) { return (a.start && a.end && a.start < a.end && a.start <= current && a.end >= current) || (a.start && a.end && a.start > a.end && (a.start <= current || a.end >= current) || (!a.start && !a.end)); });

                        // Sets the new timeout
                        if (activationTimeSpan) {
                            device.platform.log.debug(device.uniqueId + ' - Set timeout to: ' + activationTimeSpan.duration);
                            device.activationTimeoutHandle = setTimeout(function() {
                                device.platform.log(device.uniqueId + ' - Updated occupancy state to NOT DETECTED due to timeout');
                                device.occupancySensorService.updateCharacteristic(Characteristic.OccupancyDetected, false);
                                device.activationTimeoutHandle = null;
                            }, activationTimeSpan.duration);
                        }
                    } else {
                        if (!device.activationTimeoutHandle) {
                            device.platform.log.debug(device.uniqueId + ' - Updated occupancy state to NOT DETECTED due to missing timeout');
                            device.occupancySensorService.updateCharacteristic(Characteristic.OccupancyDetected, false);
                        } else {
                            device.platform.log.debug(device.uniqueId + ' - No occupancy detected, but left on due to timeout');
                        }
                    }
                    device.platform.log.debug(device.uniqueId + ' - Updated battery state to ' + sensor.config.battery);
                    device.occupancySensorService.updateCharacteristic(Characteristic.StatusLowBattery, sensor.config.battery <= device.platform.config.lowBatteryState);
                }
                break;
            
            case 'ZLLLightLevel':
                if (device.lightSensorService) {
                    device.platform.log.debug(device.uniqueId + ' - Updated ambient light state to ' + sensor.state.lightLevel);
                    device.lightSensorService.updateCharacteristic(Characteristic.CurrentAmbientLightLevel, Math.pow(10, (parseInt(sensor.state.lightLevel) - 1) / 10000));
                    device.lightSensorService.updateCharacteristic(Characteristic.StatusActive, sensor.state.dark);
                }
                break;
        
            case 'ZLLTemperature':
                if (device.temperatureSensorService) {
                    device.platform.log.debug(device.uniqueId + ' - Updated temperature to ' + sensor.state.temperature);
                    device.temperatureSensorService.updateCharacteristic(Characteristic.CurrentTemperature, sensor.state.temperature);
                }
                break;
        }
    }
}

/**
 * Defines the export of the file.
 */
module.exports = MotionSensorDevice;

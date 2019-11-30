
/**
 * Represents a physical light bulb device.
 * @param platform The PhilipsHuePlatform instance.
 * @param light The light object.
 */
function LightBulbDevice(platform, light) {
    const device = this;
    const { UUIDGen, Accessory, Characteristic, Service } = platform;

    // Sets the unique ID and platform
    device.uniqueId = light.uniqueId;
    device.light = light;
    device.platform = platform;

    // Gets all accessories from the platform that match the unique ID
    let unusedDeviceAccessories = platform.accessories.filter(function(a) { return a.context.uniqueId === device.uniqueId; });
    let newDeviceAccessories = [];
    let deviceAccessories = [];

    // Gets the lock accessory
    let lightBulbAccessory = unusedDeviceAccessories.find(function(a) { return a.context.kind === 'LightBulbAccessory'; });
    if (lightBulbAccessory) {
        unusedDeviceAccessories.splice(unusedDeviceAccessories.indexOf(lightBulbAccessory), 1);
    } else {
        platform.log('Adding new accessory with unique ID ' + device.uniqueId + ' and kind LightBulbAccessory.');
        lightBulbAccessory = new Accessory(light.name, UUIDGen.generate(device.uniqueId + 'LightBulbAccessory'));
        lightBulbAccessory.context.uniqueId = device.uniqueId;
        lightBulbAccessory.context.kind = 'LightBulbAccessory';
        newDeviceAccessories.push(lightBulbAccessory);
    }
    deviceAccessories.push(lightBulbAccessory);

    // Registers the newly created accessories
    platform.api.registerPlatformAccessories(platform.pluginName, platform.platformName, newDeviceAccessories);

    // Removes all unused accessories
    for (let i = 0; i < unusedDeviceAccessories.length; i++) {
        const unusedDeviceAccessory = unusedDeviceAccessories[i];
        platform.log('Removing unused accessory with unique ID ' + unusedDeviceAccessory.context.uniqueId + ' and kind ' + unusedDeviceAccessory.context.kind + '.');
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
            .setCharacteristic(Characteristic.Manufacturer, device.light.model.manufacturer || device.light.manufacturer)
            .setCharacteristic(Characteristic.Model, device.light.model.name || device.light.modelId)
            .setCharacteristic(Characteristic.SerialNumber, device.uniqueId);
    }

    // Updates the light bulb service
    let lightBulbService = lightBulbAccessory.getServiceByUUIDAndSubType(Service.Lightbulb);
    if (!lightBulbService) {
        lightBulbService = lightBulbAccessory.addService(Service.Lightbulb);
    }

    // Stores the light bulb service
    device.lightBulbService = lightBulbService;

    // Subscribes for changes of the on characteristic
    lightBulbService.getCharacteristic(Characteristic.On).on('set', function (value, callback) {
        const currentLight = device.light;
        currentLight.on = value;

        // Saves the changes
        platform.log.debug(device.uniqueId + ' - Switch state to ' + (value ? 'ON' : 'OFF'));
        platform.limiter.schedule(function() { return platform.client.lights.save(currentLight); }).then(function() {}, function() {
            platform.log(device.uniqueId + ' - Failed to switch state to ' + (value ? 'ON' : 'OFF'));
        });

        // Performs the callback
        callback(null);
    });

    // Subscribes for changes of the brightness characteristic
    if (device.light.type === 'Dimmable light' || device.light.type === 'Color temperature light' || device.light.type === 'Extended color light') {
        lightBulbService.getCharacteristic(Characteristic.Brightness).on('set', function (value, callback) {
            const currentLight = device.light;
            currentLight.brightness = Math.round((value / 100.0) * 254);

            // Saves the changes
            platform.log.debug(device.uniqueId + ' - Switch brightness to ' + value);
            platform.limiter.schedule(function() { return platform.client.lights.save(currentLight); }).then(function() {}, function() {
                platform.log(device.uniqueId + ' - Failed to switch brightness to ' + value);
            });
            
            // Performs the callback
            callback(null);
        });

        // Subscribes for changes of the hue/saturation characteristics
        if (device.light.type === 'Extended color light') {

            // Subscribes for changes of the hue characteristic
            lightBulbService.getCharacteristic(Characteristic.Hue).on('set', function (value, callback) {
                const currentLight = device.light;
                currentLight.hue = Math.round((value / 360.0) * 65535);
    
                // Saves the changes
                platform.log.debug(device.uniqueId + ' - Switch hue to ' + value);
                platform.limiter.schedule(function() { return platform.client.lights.save(currentLight); }).then(function() {}, function() {
                    platform.log(device.uniqueId + ' - Failed to switch hue to ' + value);
                });
                
                // Performs the callback
                callback(null);
            });

            // Subscribes for changes of the saturation characteristic
            lightBulbService.getCharacteristic(Characteristic.Saturation).on('set', function (value, callback) {
                const currentLight = device.light;
                currentLight.saturation = Math.round((value / 100.0) * 254);
    
                // Saves the changes
                platform.log.debug(device.uniqueId + ' - Switch saturation to ' + value);
                platform.limiter.schedule(function() { return platform.client.lights.save(currentLight); }).then(function() {}, function() {
                    platform.log(device.uniqueId + ' - Failed to switch saturation to ' + value);
                });
                
                // Performs the callback
                callback(null);
            });
        }

        // Subscribes for changes of the color temperature characteristic
        if (device.light.type === 'Color temperature light') {
            lightBulbService.getCharacteristic(Characteristic.ColorTemperature).setProps({
                maxValue: 500,
                minValue: 153
            });
            lightBulbService.getCharacteristic(Characteristic.ColorTemperature).on('set', function (value, callback) {
                const currentLight = device.light;
                currentLight.colorTemp = Math.round(value);
    
                // Saves the changes
                platform.log.debug(device.uniqueId + ' - Switch color temperature to ' + value);
                platform.limiter.schedule(function() { return platform.client.lights.save(currentLight); }).then(function() {}, function() {
                    platform.log(device.uniqueId + ' - Failed to switch color temperature to ' + value);
                });
                
                // Performs the callback
                callback(null);
            });
        }
    }

    // Updates the state initially
    device.update([device.light]);
}

/**
 * Can be called to update the device information.
 * @param lights A list of all lights.
 */
LightBulbDevice.prototype.update = function (lights) {
    const device = this;
    const { Characteristic } = device.platform;

    // Gets the light that is used in this light bulb device
    device.light = lights.find(function(l) { return l.uniqueId && l.uniqueId === device.uniqueId; });

    // Updates the corresponding service
    if (device.lightBulbService) {

        // Updates the on characteristic
        device.lightBulbService.updateCharacteristic(Characteristic.On, device.light.on);

        // Updates the brightness characteristic
        if (device.light.type === 'Dimmable light' || device.light.type === 'Color temperature light' || device.light.type === 'Extended color light') {
            device.platform.log.debug(device.uniqueId + ' - Updated brightness to ' + device.light.brightness);
            device.lightBulbService.updateCharacteristic(Characteristic.Brightness, Math.round((device.light.brightness / 254.0) * 100));

            // Updates hue and saturation characteristics
            if (device.light.type === 'Extended color light') {
                if (device.light.colorMode === 'hs') {
                    device.platform.log.debug(device.uniqueId + ' - Updated hue to ' + device.light.hue + ', saturation to ' + device.light.saturation);
                    device.lightBulbService.updateCharacteristic(Characteristic.Hue, Math.round((device.light.hue / 65535.0) * 360));
                    device.lightBulbService.updateCharacteristic(Characteristic.Saturation, Math.round((device.light.saturation / 254.0) * 100));
                }
                if (device.light.colorMode === 'xy') {
                    device.platform.log.debug(device.uniqueId + ' - Updated xy to ' + device.light.xy[0] + ', ' + device.light.xy[1]);
                    const result = device.platform.colorConversion.xyToHueSaturation(device.light.xy, device.platform.colorConversion.getGamut(device.light.model.colorGamut));
                    device.lightBulbService.updateCharacteristic(Characteristic.Hue, result.hue);
                    device.lightBulbService.updateCharacteristic(Characteristic.Saturation, result.saturation);
                }
            }

            // Updates the color temperature
            if (device.light.type === 'Color temperature light') {
                if (device.light.colorMode === 'ct') {
                    device.platform.log.debug(device.uniqueId + ' - Updated color temperature to ' + device.light.colorTemp);
                    device.lightBulbService.updateCharacteristic(Characteristic.ColorTemperature, Math.round(device.light.colorTemp));
                }
            }
        }
    }
}

/**
 * Defines the export of the file.
 */
module.exports = LightBulbDevice;

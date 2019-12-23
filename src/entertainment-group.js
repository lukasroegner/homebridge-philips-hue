
/**
 * Represents a virtual entertainment group.
 * @param platform The PhilipsHuePlatform instance.
 * @param group The group that is represented.
 */
function EntertainmentGroup(platform, group) {
    const entertainmentGroup = this;
    const { UUIDGen, Accessory, Characteristic, Service } = platform;

    // Sets the unique ID, group and platform
    entertainmentGroup.uniqueId = 'group-' + group.id;
    entertainmentGroup.group = group;
    entertainmentGroup.platform = platform;

    // Gets all accessories from the platform that match the unique ID
    let unusedEntertainmentGroupAccessories = platform.accessories.filter(function(a) { return a.context.uniqueId === entertainmentGroup.uniqueId; });
    let newEntertainmentGroupAccessories = [];
    let entertainmentGroupAccessories = [];

    // Gets the accessory for the group
    let switchAccessory = unusedEntertainmentGroupAccessories.find(function(a) { return a.context.kind === 'SwitchAccessory'; });
    if (switchAccessory) {
        unusedEntertainmentGroupAccessories.splice(unusedEntertainmentGroupAccessories.indexOf(switchAccessory), 1);
    } else {
        platform.log('Adding new accessory with unique ID ' + entertainmentGroup.uniqueId + ' and kind SwitchAccessory.');
        switchAccessory = new Accessory(group.name, UUIDGen.generate(entertainmentGroup.uniqueId + 'SwitchAccessory'));
        switchAccessory.context.uniqueId = entertainmentGroup.uniqueId;
        switchAccessory.context.kind = 'SwitchAccessory';
        newEntertainmentGroupAccessories.push(switchAccessory);
    }
    entertainmentGroupAccessories.push(switchAccessory);

    // Registers the newly created accessories
    platform.api.registerPlatformAccessories(platform.pluginName, platform.platformName, newEntertainmentGroupAccessories);

    // Removes all unused accessories
    for (let i = 0; i < unusedEntertainmentGroupAccessories.length; i++) {
        const unusedEntertainmentGroupAccessory = unusedEntertainmentGroupAccessories[i];
        platform.log('Removing unused accessory with unique ID ' + entertainmentGroup.uniqueId + ' and kind ' + unusedEntertainmentGroupAccessory.context.kind + '.');
        platform.accessories.splice(platform.accessories.indexOf(unusedEntertainmentGroupAccessory), 1);
    }
    platform.api.unregisterPlatformAccessories(platform.pluginName, platform.platformName, unusedEntertainmentGroupAccessories);

    // Updates the accessory information
    for (let i = 0; i < entertainmentGroupAccessories.length; i++) {
        const entertainmentGroupAccessory = entertainmentGroupAccessories[i];
        let accessoryInformationService = entertainmentGroupAccessory.getService(Service.AccessoryInformation);
        if (!accessoryInformationService) {
            accessoryInformationService = entertainmentGroupAccessory.addService(Service.AccessoryInformation);
        }
        accessoryInformationService
            .setCharacteristic(Characteristic.Manufacturer, "Philips")
            .setCharacteristic(Characteristic.Model, "Entertainment Group")
            .setCharacteristic(Characteristic.SerialNumber, entertainmentGroup.uniqueId);
    }

    // Updates the services
    entertainmentGroup.switchService = switchAccessory.getService(Service.Switch);
    if (!entertainmentGroup.switchService) {
        entertainmentGroup.switchService = switchAccessory.addService(Service.Switch);
    }

    // Defines the command for saving raw group data
    function SwitchStreamOffRaw() { };
    SwitchStreamOffRaw.prototype.invoke = function (client) {
        return client.getTransport().sendRequest({ method: 'PUT', url: 'api/' + client.username + '/groups/' + group.id, data: { stream: { active: false } } });
    };

    // Subscribes for changes of the switch
    entertainmentGroup.switchService.getCharacteristic(Characteristic.On).on('set', function (value, callback) {

        // Streaming can only switched off
        if (!value && entertainmentGroup.group.stream) {
            entertainmentGroup.group.stream.active = false;
    
            // Saves the changes
            platform.log(entertainmentGroup.uniqueId + ' - Switch streaming state to ' + (value ? 'ON' : 'OFF'));
            platform.limiter.schedule(function() { return platform.client.invokeCommand(new SwitchStreamOffRaw()); }).then(function() {}, function() {
                platform.log(entertainmentGroup.uniqueId + ' - Failed to switch streaming state to ' + (value ? 'ON' : 'OFF'));
            });
        }
        callback(null);
    });

    // Updates the state initially
    entertainmentGroup.update([entertainmentGroup.group]);
}

/**
 * Can be called to update the group information.
 * @param groups A list of all groups.
 */
EntertainmentGroup.prototype.update = function (groups) {
    const entertainmentGroup = this;
    const { Characteristic } = entertainmentGroup.platform;

    // Gets the group that is used here
    entertainmentGroup.group = groups.find(function(g) { return 'group-' + g.id === entertainmentGroup.uniqueId; });

    // Updates the switch service
    if (entertainmentGroup.switchService) {
        if (entertainmentGroup.group.stream) {
            entertainmentGroup.platform.log.debug(entertainmentGroup.uniqueId + ' - Updated streaming state to ' + (entertainmentGroup.group.stream.active ? 'ON' : 'OFF'));
            entertainmentGroup.switchService.updateCharacteristic(Characteristic.On, entertainmentGroup.group.stream.active);
        } else {
            entertainmentGroup.platform.log.debug(entertainmentGroup.uniqueId + ' - Updated streaming state to OFF');
            entertainmentGroup.switchService.updateCharacteristic(Characteristic.On, false);
        }
    }
}

/**
 * Defines the export of the file.
 */
module.exports = EntertainmentGroup;

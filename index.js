
const PhilipsHuePlatform = require('./src/philips-hue-platform');

/**
 * Defines the export of the plugin entry point.
 * @param homebridge The homebridge API that contains all classes, objects and functions for communicating with HomeKit.
 */
module.exports = function (homebridge) {
    homebridge.registerPlatform('homebridge-philips-hue', 'PhilipsHuePlatform', PhilipsHuePlatform, true);
}

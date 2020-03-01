# homebridge-philips-hue

This project is a homebridge plugin for Philips Hue light bulbs and motion sensors. The plugin does not aim to expose all features of the Philips Hue bridge to HomeKit. 

The reason for development of the plugin is that most plugins (and the official HomeKit support) for Philips Hue do not expose the motion sensors as occupancy sensors (i.e. respecting the activity period defined in the Philips Hue app). This plugin exposes the motion sensors as occupancy sensors which are active after motion is detected for the period defined in the Philips Hue app (based on the local time).

## Lights

The lights are exposed as light bulbs with the following features:
* On/Off
* Brightness (if supported by the light bulb)
* Color (if supported by the light bulb)
* Color temperature (if supported by the light bulb)

Only Philips lights are supported by this plugin.

## Motion Sensors

The motion sensors are exposed as occupancy sensors. The activation period is retrieved from the rule engine of the Philips Hue bridge (those values are configured in the Philips app). The exposed accessory has multiple services:
* Presence sensor
* Temperature sensor
* Light level sensor
* Switch for enabling/disabling the motion sensor

Only Philips motion sensors are supported by this plugin.

## Installation

Install the plugin via npm:

```bash
npm install https://github.com/lukasroegner/homebridge-philips-hue.git -g
```

## Prepare Bridge

You have to create new credentials to communicate with the Philips Hue bridge:
* Click on the link button on your Philips Hue bridge
* Make an HTTP POST request to `http://<BRIDGE-IP>/api`
* The body of the request has to be JSON: `{ "devicetype": "homebridge-philips-hue" }`
* The response contains a `username` string
Hint: Use a software like Postman or cURL to make the requests.

## Configuration

```json
{
    "platforms": [
        {
            "platform": "PhilipsHuePlatform",
            "bridgeIpAddress": "<BRIDGE-IP-ADDRESS>",
            "bridgeApiUsername": "<BRIDGE-API-USERNAME>",
            "blacklist": [
                "<UNIQUE-ID-1>",
                "<UNIQUE-ID-2>"
            ]
        }
    ]
}
```

**bridgeIpAddress**: The IP address of your Philips Hue bridge.

**bridgeApiUsername**: The access token for the user.

**blacklist** (optional): A list of unique IDs that should not be exposed to HomeKit. The IDs can be retrieved in the log when homebridge is started.

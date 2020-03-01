
const http = require('http');
const url = require('url');

/**
 * Represents the API.
 * @param platform The PhilipsHueApi instance.
 */
function PhilipsHueApi(platform) {
    const api = this;

    // Sets the platform
    api.platform = platform;

    // Checks if all required information is provided
    if (!api.platform.config.apiPort) {
        api.platform.log('No API port provided.');
        return;
    }
    if (!api.platform.config.apiToken) {
        api.platform.log('No API token provided.');
        return;
    }

    // Starts the server
    try {
        http.createServer(function (request, response) {
            const payload = [];

            // Subscribes for events of the request
            request.on('error', function () {
                api.platform.log('API - Error received.');
            }).on('data', function (chunk) {
                payload.push(chunk);
            }).on('end', function () {

                // Subscribes to errors when sending the response
                response.on('error', function () {
                    api.platform.log('API - Error sending the response.');
                });

                // Validates the token
                if (!request.headers['authorization']) {
                    api.platform.log('Authorization header missing.');
                    response.statusCode = 401;
                    response.end();
                    return;
                }
                if (request.headers['authorization'] !== api.platform.config.apiToken) {
                    api.platform.log('Token invalid.');
                    response.statusCode = 401;
                    response.end();
                    return;
                }

                // Validates the endpoint
                const endpoint = api.getEndpoint(request.url);
                if (!endpoint) {
                    api.platform.log('No endpoint found.');
                    response.statusCode = 404;
                    response.end();
                    return;
                }
            
                // Validates the body
                let body = null;
                if (payload && payload.length > 0) {
                    body = JSON.parse(Buffer.concat(payload).toString());
                }
                
                // Performs the action based on the endpoint and method
                switch (endpoint.name) {
                    case 'group':
                        switch (request.method) {
                            case 'GET':
                                api.handleGetGroup(endpoint, response);
                                return;

                            case 'POST':
                                api.handlePostGroup(endpoint, body, response);
                                return;
                        }
                        break;
                }

                api.platform.log('No action matched.');
                response.statusCode = 404;
                response.end();
            });
        }).listen(api.platform.config.apiPort, "0.0.0.0");
        api.platform.log('API started.');
    } catch (e) {
        api.platform.log('API could not be started: ' + JSON.stringify(e));
    }
}

/**
 * Handles requests to GET /groups/{groupId}.
 * @param endpoint The endpoint information.
 * @param response The response object.
 */
PhilipsHueApi.prototype.handleGetGroup = function (endpoint, response) {
    const api = this;

    // Gets the group and writes the response
    api.platform.limiter.schedule(function() { return api.platform.client.groups.getById(endpoint.groupId); }).then(function(group) {
        response.setHeader('Content-Type', 'application/json');
        response.write(JSON.stringify({
            anyOn: group.anyOn,
            allOn: group.allOn
        }));
        response.statusCode = 200;
        response.end();
    }, function() {
        api.platform.log('Error while getting the group.');
        response.statusCode = 400;
        response.end();
        return;
    });
}

/**
 * Handles requests to POST /groups/{groupId}.
 * @param endpoint The endpoint information.
 * @param body The body of the request.
 * @param response The response object.
 */
PhilipsHueApi.prototype.handlePostGroup = function (endpoint, body, response) {
    const api = this;

    // Gets the group
    api.platform.limiter.schedule(function() { return api.platform.client.groups.getById(endpoint.groupId); }).then(function(group) {

        // Updates the group value
        group.on = body.on;

        // Saves the changes
        api.platform.limiter.schedule(function() { return api.platform.client.groups.save(group); }).then(function() {
            response.statusCode = 200;
            response.end();
        }, function() {
            api.platform.log('Error while saving the group.');
            response.statusCode = 400;
            response.end();
            return;
        });
    }, function() {
        api.platform.log('Error while getting the group.');
        response.statusCode = 400;
        response.end();
        return;
    });
}

/**
 * Gets the endpoint information based on the URL.
 * @param uri The uri of the request.
 * @returns Returns the endpoint information.
 */
PhilipsHueApi.prototype.getEndpoint = function (uri) {

    // Parses the request path
    const uriParts = url.parse(uri);

    // Checks if the URL matches the groups endpoint
    uriMatch = /\/groups\/(.+)/g.exec(uriParts.pathname);
    if (uriMatch && uriMatch.length === 2) {
        return {
            name: 'group',
            groupId: parseInt(uriMatch[1])
        };
    }

    // Returns null as no endpoint matched.
    return null;
}

/**
 * Defines the export of the file.
 */
module.exports = PhilipsHueApi;

"use strict";

const fs = require('fs');
const http = require('http');
const zlib = require('zlib');
const os = require('os');
const utility =  require('./utility.js');
const profile = require('./profile.js');
const item = require('./item.js');
const response = require('./response.js');

var settings = JSON.parse(utility.readJson("data/config.json"));

function getLocalIpAddress() {
	let address = "127.0.0.1";
    let ifaces = os.networkInterfaces();

	for (let dev in ifaces) {
		let iface = ifaces[dev].filter(function(details) {
			return details.family === 'IPv4' && details.internal === false;
		});

		if (iface.length > 0) {
			address = iface[0].address;
		}
	}

	return address;
}

function getCookies(req) {
	let found = {};
	let cookies = req.headers.cookie;

	if (cookies) {
		for (let cookie of cookies.split(';')) {
			let parts = cookie.split('=');

			found[parts.shift().trim()] = decodeURI(parts.join('='));
		}
	}

    return found;
}

function sendJson(resp, output) {
	resp.writeHead(200, "OK", {'Content-Type': 'text/plain', 'content-encoding' : 'deflate', 'Set-Cookie' : 'PHPSESSID=' + profile.getActiveID()});
	
	zlib.deflate(output, function(err, buf) {
		resp.end(buf);
	});
}

function sendImage(resp, file) {
	let fileStream = fs.createReadStream(file);

	// send file
	fileStream.on('open', function() {
		resp.setHeader('Content-Type', 'image/png');
		fileStream.pipe(resp);
	});
}

function sendResponse(req, resp, body) {
	let output = "";

	// reset item output
	item.resetOutput();

	// get active profile
	profile.setActiveID(getCookies(req)['PHPSESSID']);

	// get response
	if (req.method == "POST") {
		output = response.get(req, body.toString());
	} else {
		output = response.get(req, "{}");
	}
	
	// prepare message to send
	if (output == "DONE") {
		return;
	}

	if (output == "CONTENT") {
		let image = req.url.replace('/uploads/CONTENT/banners/', './data/images/banners/').replace('banner_', '');

		console.log("The banner image location: " + image);
		sendImage(resp, image);
		return;
	}

	if (output == "IMAGE") {
		sendImage(resp, "." + req.url);
		return;
	}

	sendJson(resp, output);
	profile.setActiveID(0);
}

function handleRequest(req, resp) {
	// separate request in the log
	console.log("------------------------------------------------------------------------------------------------------------------------");
	
	// get the IP address of the client
	console.log("IP address: " + req.connection.remoteAddress, req.url);

	// handle the request
	console.log("Request method: " + req.method);
	
	if (req.method == "POST") {
		// received data
		req.on('data', function(data) {
			zlib.inflate(data, function(err, body) {
				sendResponse(req, resp, body);
			});
		});
	} else {
		sendResponse(req, resp, null);
	}
}

function start() {
	let server = http.createServer();
	let ip = getLocalIpAddress();
	let port = settings.server.port;

	// set the ip and backendurl
	settings.server.ip = ip;
	settings.server.backendUrl = "http://" + ip + ":" + port;
	utility.writeJson("data/config.json", settings);

	// check if port is already being listened to
	server.on('error', function () {
		console.log("Port " + port + " is already in use");
		return;
    });

	// listen to port
	server.listen(port, ip, function() {
		console.log("Listening on port " + port + " with IP " + ip);
	});
	
	// handle request
	server.on('request', function(req, resp) {
		handleRequest(req, resp);
	});
}

module.exports.start = start;
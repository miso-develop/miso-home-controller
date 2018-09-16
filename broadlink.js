const BroadlinkJS = require('broadlinkjs-rm');
const broadlink = new BroadlinkJS()
const discoveredDevices = {};

let discovering = false;

const discoverDevices = (count = 0) => {
	discovering = true;
	if (count >= 5) {discovering = false; return;}
	
	broadlink.discover();
	count++;
	
	setTimeout(() => discoverDevices(count), 5000)
}

discoverDevices();

broadlink.on('deviceReady', (device) => {
	const macAddressParts = device.mac.toString('hex').match(/[\s\S]{1,2}/g) || []
	const macAddress = macAddressParts.join(':')
	device.host.macAddress = macAddress
	
	if (discoveredDevices[device.host.address] || discoveredDevices[device.host.macAddress]) return;
	
	console.log(`Discovered Broadlink RM device at ${device.host.address} (${device.host.macAddress})`)
	
	discoveredDevices[device.host.address] = device;
	discoveredDevices[device.host.macAddress] = device;
})

const getDevice = ({ host, log, learnOnly }) => {
	let device;
	device = discoveredDevices[host];
	return device;
}

module.exports = getDevice;

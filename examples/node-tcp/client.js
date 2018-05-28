const net = require('net');
const SyncClient = require('@ircam/sync/client').default;
const config = require('./config');

const startTime = process.hrtime();

const getTimeFunction = () => {
  const now = process.hrtime(startTime);
  return now[0] + now[1] * 1e-9;
}

// user defined protocol for messages
// -----------------------------------
// => 0: ping
// => 1: pong
// -----------------------------------

// TCP client
const client = new net.Socket();
// sync client
const syncClient = new SyncClient(getTimeFunction);

client.connect(config.SERVER_PORT, config.SERVER_HOST, () => {
  console.log(`client connected to ${config.SERVER_HOST}:${config.SERVER_PORT}`);

  setInterval(() => {
    const syncTime = syncClient.getSyncTime();
    console.log('[syncTime]', syncTime);
  }, 1000);

  const sendFunction = (pingId, clientPingTime) => {
    const request = new Float64Array(3);
    request[0] = 0; // we send a ping
    request[1] = pingId;
    request[2] = clientPingTime;

    console.log(`[ping] - id: %s, pingTime: %s`, request[1], request[2]);

    client.write(Buffer.from(request.buffer));
  };

  const receiveFunction = callback => {
    // unpack args before executing the callback
    client.on('data', data => {
      const response = new Float64Array(data.buffer, data.byteOffset, data.byteLength / Float64Array.BYTES_PER_ELEMENT);

      if (response[0] === 1) { // this is a pong
        const pingId = response[1];
        const clientPingTime = response[2];
        const serverPingTime = response[3];
        const serverPongTime = response[4];

        console.log(`[pong] - id: %s, clientPingTime: %s, serverPingTime: %s, serverPongTime: %s`,
          pingId, clientPingTime, serverPingTime, serverPongTime);

        callback(pingId, clientPingTime, serverPingTime, serverPongTime);
      }
    });
  };

  const reportFunction = status => console.log(status);

  syncClient.start(sendFunction, receiveFunction, reportFunction);

  // on close
  client.on('close', () => console.log(`client disconnected`));
});

const net = require('net');
const SyncServer = require('../../dist/server').default;
const config = require('./config');

const getTimeFunction = () => {
  const now = process.hrtime();
  return now[0] + now[1] * 1e-9;
};

// user defined protocol for messages
// -----------------------------------
// => 0: ping
// => 1: pong
// -----------------------------------

// TCP server
const server = net.createServer();
// sync server
const syncServer = new SyncServer(getTimeFunction);

server.on('connection', socket => {
  // some client connection
  console.log(`client connected: ${socket.remoteAddress}:${socket.remotePort}`);

  const receiveFunction = callback => {
    socket.on('data', data => {
      // create a TypedArray view from the given node Buffer
      // https://stackoverflow.com/questions/8609289/convert-a-binary-nodejs-buffer-to-javascript-arraybuffer/31394257#31394257
      const request = new Float64Array(data.buffer, data.byteOffset, data.byteLength / Float64Array.BYTES_PER_ELEMENT);

      if (request[0] === 0) { // this is a ping
        console.log(`[ping] - id: %s, pingTime: %s`, request[1], request[2]);
        callback(request[1], request[2]);
      }
    });
  };

  const sendFunction = (pingId, clientPingTime, serverPingTime, serverPongTime) => {
    console.log(`[pong] - id: %s, clientPingTime: %s, serverPingTime: %s, serverPongTime: %s`,
      pingId, clientPingTime, serverPingTime, serverPongTime);
    // use Float64 to keep maximum time precision
    const response = new Float64Array(5);
    response[0] = 1; // this is a pong
    response[1] = pingId;
    response[2] = clientPingTime;
    response[3] = serverPingTime;
    response[4] = serverPongTime;
    // create a node Buffer without copy (shared memory)
    socket.write(Buffer.from(response.buffer));
  }

  syncServer.start(sendFunction, receiveFunction);

  socket.on('close', () => {
    console.log(`client disconnected: ${socket.remoteAddress}:${socket.remotePort}`);
    // here we would probably like to release some memory...
  });
});

server.listen(config.SERVER_PORT, config.SERVER_HOST, () => {
  console.log(`TCP server listen to ${config.SERVER_HOST}:${config.SERVER_PORT}`);
});

const net = require('net');

const HOST = '127.0.0.1';
const PORT = 8080;

const clients = new Set();

const server = net.createServer();

server.on('connection', socket => {
  // some client connection
  console.log(`client connected: ${socket.remoteAddress}:${socket.remotePort}`);
  clients.add(socket);

  socket.on('data', data => {
    // console.log(`${socket.remoteAddress}:${socket.remotePort}: ${data}`);
    console.log(process.hrtime());
  });

  socket.on('close', () => {
    console.log(`client disconnected: ${socket.remoteAddress}:${socket.remotePort}`);
    clients.delete(socket);
  })
});

server.listen(PORT, HOST, () => {
  console.log(`server listen to ${HOST}:${PORT}`);
});



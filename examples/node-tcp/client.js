const net = require('net');

const HOST = '127.0.0.1';
const PORT = 8080;

const client = new net.Socket();

client.connect(PORT, HOST, () => {
  console.log(`client connected to ${HOST}:${PORT}`);

  // setInterval(() => {
  //   client.write('ping');
  //   console.log(process.hrtime());
  // }, 1000);
});

client.on('data', data => {
  console.log(`client received: ${data}`);
});

client.on('close', () => {
  console.log(`client disconnected`);
});

const a = process.hrtime();
const b = process.hrtime();

console.log(a[1], b[1]);

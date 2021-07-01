// import SyncClient from '@ircam/sync/client';
import { SyncClient } from '@ircam/sync';

const getTimeFunction = () => {
  return performance.now() / 1000;
}

function init() {
  const url = window.location.origin.replace('http', 'ws');

  // init socket client
  const socket = new WebSocket(url);
  // init sync client
  const syncClient = new SyncClient(getTimeFunction);

  const $syncTime = document.querySelector('#sync-time');
  setInterval(() => {
    const syncTime = syncClient.getSyncTime();
    $syncTime.innerHTML = syncTime;
  }, 100);

  socket.addEventListener('open', () => {
    const sendFunction = (pingId, clientPingTime) => {
      const request = [];
      request[0] = 0; // this is a ping
      request[1] = pingId;
      request[2] = clientPingTime;

      console.log(`[ping] - id: %s, pingTime: %s`, request[1], request[2]);

      socket.send(JSON.stringify(request));
    };

    const receiveFunction = callback => {
      socket.addEventListener('message', e => {
        const response = JSON.parse(e.data);
        console.log(response);

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
    }

    const $statusContainer = document.querySelector('#status');
    const statusFunction = status => {
      $statusContainer.innerHTML = JSON.stringify(status, null, 2);
      console.log(status);
    };

    syncClient.start(sendFunction, receiveFunction, statusFunction);
  });

  socket.addEventListener('error', err => console.error(err.stack));
  socket.addEventListener('close', () => console.log('socket closed'));
}

window.addEventListener('load', init);

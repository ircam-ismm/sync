/**
 * @fileoverview Server side syncronization module
 * @author Sebastien.Robaszkiewicz@ircam.fr, Norbert.Schnell@ircam.fr
 */
'use strict';

class SyncServer {
  constructor() {

  }

  start(socket, statsCallback) {
    socket.on('sync_ping', (id, clientPingTime) => {
      var serverPongTime = Date.now() / 1000;
      socket.emit('sync_pong', id, clientPingTime, serverPongTime);
    });

    socket.on('sync_stats', (stats) => {
      statsCallback(stats);
    });
  }
}

module.exports = SyncServer;
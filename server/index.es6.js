/**
 * @fileoverview Server side syncronization module
 * @author Sebastien.Robaszkiewicz@ircam.fr, Norbert.Schnell@ircam.fr
 */
'use strict';

const debug = require('debug')('soundworks:sync');

class SyncServer {
  constructor() {

  }

  /** 
   * Monotonic function.
   * 
   * @return {Number} local time in seconds
   */
  getLocalTime(masterTime) {
    if(typeof masterTime !== 'undefined') {
      // Master time is local: no conversion
      return masterTime;
    } else {
      // Read local clock
      const time = process.hrtime();
      return time[0] + time[1] * 1e-9;
    }
  }

  getMasterTime(localTime) {
    // Master time is local, here
    return this.getLocalTime(localTime);
  }

  start(socket) {
    socket.on('sync_ping', (id, clientPingTime) => {
      debug('sync_ping');
      socket.emit('sync_pong', id, clientPingTime, this.getLocalTime() );
      debug('sync_pong');
    });
  }

}

module.exports = SyncServer;

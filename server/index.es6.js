/**
 * @fileoverview Server side syncronization module
 * @author Sebastien.Robaszkiewicz@ircam.fr, Norbert.Schnell@ircam.fr
 */
'use strict';

class SyncServer {
  constructor() {

  }

  /** 
   * Monotonic function.
   * 
   * @return {Number} local time in seconds
   */
  getLocalTime(syncTime) {
    if(typeof syncTime !== 'undefined') {
      // Master time is local: no conversion
      return syncTime;
    } else {
      // Read local clock
      const time = process.hrtime();
      return time[0] + time[1] * 1e-9;
    }
  }

  getSyncTime(localTime) {
    // sync time is local, here
    return this.getLocalTime(localTime);
  }

  start(socket) {
    socket.on('sync_ping', (id, clientPingTime) => {
      socket.emit('sync_pong', id, clientPingTime, this.getLocalTime() );
    });
  }
}

module.exports = SyncServer;

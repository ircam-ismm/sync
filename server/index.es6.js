/**
 * @fileoverview Server side syncronization module
 * @author Sebastien.Robaszkiewicz@ircam.fr, Norbert.Schnell@ircam.fr
 */
'use strict';

class SyncServer {
  constructor(getTimeFunction, emitFunction, listenFunction) {
    this.getTimeFunction = getTimeFunction;
    this.emitFunction = emitFunction;
    this.listenFunction = listenFunction;
  }

  /** 
   * Monotonic function.
   *
   * @return {Number} local time in seconds
   */
  getLocalTime(syncTime) {
    if (typeof syncTime !== 'undefined')
      return syncTime; // sync time is local: no conversion
    else 
      return this.getTimeFunction();
  }

  getSyncTime(localTime) {
    return this.getLocalTime(localTime); // sync time is local, here
  }

  start(socket) {
    socket.on('sync_ping', (id, clientPingTime) => {
      socket.emit('sync_pong', id, clientPingTime, this.getLocalTime());
    });
  }
}

module.exports = SyncServer;
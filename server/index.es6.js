/**
 * @fileoverview Server-side syncronization component
 * @author Jean-Philippe.Lambert@ircam.fr, Sebastien.Robaszkiewicz@ircam.fr,
 *         Norbert.Schnell@ircam.fr
 */

'use strict';

class SyncServer {
  /**
   * This is the constructor. @see {@linkcode start} method to
   * actually start a synchronization process.
   *
   * @param {Function} getTimeFunction called to get the local
   * time. It must return a time in seconds, monotonic, ever
   * increasing.
   */
  constructor(getTimeFunction) {
    this.getTimeFunction = getTimeFunction;
  }

  /**
   * Start a synchronization process by registering the receive
   * function passed as second parameter. On each received message,
   * send a reply using the function passed as first parameter.
   *
   * @param {Function} sendFunction
   * @param {Function} receiveFunction
   */
  start(sendFunction, receiveFunction) {
    receiveFunction('sync:ping', (id, clientPingTime) => {
      const serverPingTime = this.getLocalTime();
      sendFunction('sync:pong', id, clientPingTime,
                   serverPingTime, this.getLocalTime());
    });
  }

  /**
   * Get local time, or convert a synchronized time to a local time.
   *
   * @param {Number} syncTime undefined to get local time
   * @returns {Number} local time, in seconds
   */
  getLocalTime(syncTime) {
    if (typeof syncTime !== 'undefined') {
      return syncTime; // sync time is local: no conversion
    } else {
      return this.getTimeFunction();
    }
  }

  /**
   * Get Synchronized time, or convert a local time to a synchronized time.
   *
   * @param {Number} localTime undefined to get synchronized time
   * @returns {Number} synchronized time, in seconds.
   */
  getSyncTime(localTime) {
    return this.getLocalTime(localTime); // sync time is local, here
  }

}

module.exports = SyncServer;

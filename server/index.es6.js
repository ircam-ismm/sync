/**
 * @fileoverview Server-side syncronization component
 * @author Jean-Philippe.Lambert@ircam.fr, Sebastien.Robaszkiewicz@ircam.fr,
 *         Norbert.Schnell@ircam.fr
 */

'use strict';

class SyncServer {
  /**
   * @callback SyncServer~getTimeFunction
   * @return {Number} monotonic, ever increasing, time in second.
   **/

  /**
   * @callback SyncServer~sendFunction
   * @see {@linkcode SyncServer~sendFunction}
   * @param {String} messageType identification of pong message type
   * @param {Number} pingId unique identifier
   * @param {Number} clientPingTime time-stamp of ping emission
   * @param {Number} serverPingTime time-stamp of ping reception
   * @param {Number} serverPongTime time-stamp of pong emission
   **/

  /**
   * @callback SyncServer~receiveFunction
   * @see {@linkcode SyncServer~receiveFunction}
   * @param {String} messageType identification of ping message type
   * @param {SyncServer~receiveCallback} receiveCallback called on
   * each message matching messageType.
   **/

  /**
   * @callback SyncServer~receiveCallback
   * @param {Number} pingId unique identifier
   * @param {Number} clientPingTime time-stamp of ping emission
   **/

  /**
   * This is the constructor. @see {@linkcode start} method to
   * actually start a synchronization process.
   *
   * @param {SyncServer~getTimeFunction} getTimeFunction called to get the local
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
   * @param {SyncServer~sendFunction} sendFunction
   * @param {SyncServer~receiveFunction} receiveFunction
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

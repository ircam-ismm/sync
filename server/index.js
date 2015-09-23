/**
 * @fileoverview Server-side syncronization component
 * @author Jean-Philippe.Lambert@ircam.fr, Sebastien.Robaszkiewicz@ircam.fr,
 *         Norbert.Schnell@ircam.fr
 */

'use strict';

var debug = require('debug')('soundworks:sync');

var SyncServer = (function(){var PRS$0 = (function(o,t){o["__proto__"]={"a":t};return o["a"]===t})({},{});var DP$0 = Object.defineProperty;var GOPD$0 = Object.getOwnPropertyDescriptor;var MIXIN$0 = function(t,s){for(var p in s){if(s.hasOwnProperty(p)){DP$0(t,p,GOPD$0(s,p));}}return t};var proto$0={};
  /**
   * @callback SyncServer~getTimeFunction
   * @return {Number} monotonic, ever increasing, time in second.
   **/

  /**
   * @callback SyncServer~sendFunction
   * @see {@linkcode SyncClient~receiveFunction}
   * @param {String} messageType identification of pong message type
   * @param {Number} pingId unique identifier
   * @param {Number} clientPingTime time-stamp of ping emission
   * @param {Number} serverPingTime time-stamp of ping reception
   * @param {Number} serverPongTime time-stamp of pong emission
   **/

  /**
   * @callback SyncServer~receiveFunction
   * @see {@linkcode SyncClient~sendFunction}
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
   * This is the constructor. See {@linkcode SyncServer~start} method to
   * actually start a synchronisation process.
   *
   * @constructs SyncServer
   * @param {SyncServer~getTimeFunction} getTimeFunction called to get the local
   * time. It must return a time in seconds, monotonic, ever
   * increasing.
   */
  function SyncServer(getTimeFunction) {
    this.getTimeFunction = getTimeFunction;
  }DP$0(SyncServer,"prototype",{"configurable":false,"enumerable":false,"writable":false});

  /**
   * Start a synchronisation process by registering the receive
   * function passed as second parameter. On each received message,
   * send a reply using the function passed as first parameter.
   *
   * @function SyncServer~start
   * @param {SyncServer~sendFunction} sendFunction
   * @param {SyncServer~receiveFunction} receiveFunction
   */
  proto$0.start = function(sendFunction, receiveFunction) {var this$0 = this;
    receiveFunction('sync:ping', function(id, clientPingTime)  {
      var serverPingTime = this$0.getLocalTime();
      sendFunction('sync:pong', id, clientPingTime,
                   serverPingTime, this$0.getLocalTime());
      // debug('ping: %s, %s, %s', id, clientPingTime, serverPingTime);
    });
  };

  /**
   * Get local time, or convert a synchronised time to a local time.
   *
   * @function SyncServer~getLocalTime
   * @param {Number} syncTime undefined to get local time
   * @returns {Number} local time, in seconds
   */
  proto$0.getLocalTime = function(syncTime) {
    if (typeof syncTime !== 'undefined') {
      return syncTime; // sync time is local: no conversion
    } else {
      return this.getTimeFunction();
    }
  };

  /**
   * Get synchronised time, or convert a local time to a synchronised time.
   *
   * @function SyncServer~getSyncTime
   * @param {Number} localTime undefined to get synchronised time
   * @returns {Number} synchronised time, in seconds.
   */
  proto$0.getSyncTime = function(localTime) {
    return this.getLocalTime(localTime); // sync time is local, here
  };

MIXIN$0(SyncServer.prototype,proto$0);proto$0=void 0;return SyncServer;})();

module.exports = SyncServer;

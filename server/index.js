/**
 * @fileoverview Server-side syncronization component
 * @author Jean-Philippe.Lambert@ircam.fr, Sebastien.Robaszkiewicz@ircam.fr,
 *         Norbert.Schnell@ircam.fr
 */

'use strict';

var SyncServer = (function(){var PRS$0 = (function(o,t){o["__proto__"]={"a":t};return o["a"]===t})({},{});var DP$0 = Object.defineProperty;var GOPD$0 = Object.getOwnPropertyDescriptor;var MIXIN$0 = function(t,s){for(var p in s){if(s.hasOwnProperty(p)){DP$0(t,p,GOPD$0(s,p));}}return t};var proto$0={};
  /**
   * This is the constructor. @see {@linkcode start} method to
   * actually start a synchronization process.
   *
   * @param {Function} getTimeFunction called to get the local
   * time. It must return a time in seconds, monotonic, ever
   * increasing.
   */
  function SyncServer(getTimeFunction) {
    this.getTimeFunction = getTimeFunction;
  }DP$0(SyncServer,"prototype",{"configurable":false,"enumerable":false,"writable":false});

  /**
   * Start a synchronization process by registering the receive
   * function passed as second parameter. On each received message,
   * send a reply using the function passed as first parameter.
   *
   * @param {Function} sendFunction
   * @param {Function} receiveFunction
   */
  proto$0.start = function(sendFunction, receiveFunction) {var this$0 = this;
    receiveFunction('sync:ping', function(id, clientPingTime)  {
      var serverPingTime = this$0.getLocalTime();
      sendFunction('sync:pong', id, clientPingTime,
                   serverPingTime, this$0.getLocalTime());
    });
  };

  /**
   * Get local time, or convert a synchronized time to a local time.
   *
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
   * Get Synchronized time, or convert a local time to a synchronized time.
   *
   * @param {Number} localTime undefined to get synchronized time
   * @returns {Number} synchronized time, in seconds.
   */
  proto$0.getSyncTime = function(localTime) {
    return this.getLocalTime(localTime); // sync time is local, here
  };

MIXIN$0(SyncServer.prototype,proto$0);proto$0=void 0;return SyncServer;})();

module.exports = SyncServer;

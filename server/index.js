/**
 * @fileoverview Server side syncronization module
 * @author Sebastien.Robaszkiewicz@ircam.fr, Norbert.Schnell@ircam.fr
 */
'use strict';

var SyncServer = (function(){var PRS$0 = (function(o,t){o["__proto__"]={"a":t};return o["a"]===t})({},{});var DP$0 = Object.defineProperty;var GOPD$0 = Object.getOwnPropertyDescriptor;var MIXIN$0 = function(t,s){for(var p in s){if(s.hasOwnProperty(p)){DP$0(t,p,GOPD$0(s,p));}}return t};var proto$0={};
  function SyncServer(getTimeFunction) {
    this.getTimeFunction = getTimeFunction;
  }DP$0(SyncServer,"prototype",{"configurable":false,"enumerable":false,"writable":false});

  /** 
   * Monotonic function.
   *
   * @return {Number} local time in seconds
   */
  proto$0.getLocalTime = function(syncTime) {
    if (typeof syncTime !== 'undefined')
      return syncTime; // sync time is local: no conversion
    else 
      return this.getTimeFunction();
  };

  proto$0.getSyncTime = function(localTime) {
    return this.getLocalTime(localTime); // sync time is local, here
  };

  proto$0.start = function(sendFunction, receiveFunction) {var this$0 = this;
    receiveFunction('sync_ping', function(id, clientPingTime)  {
      sendFunction('sync_pong', id, clientPingTime, this$0.getLocalTime());
    });
  };
MIXIN$0(SyncServer.prototype,proto$0);proto$0=void 0;return SyncServer;})();

module.exports = SyncServer;
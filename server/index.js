/**
 * @fileoverview Server side syncronization module
 * @author Sebastien.Robaszkiewicz@ircam.fr, Norbert.Schnell@ircam.fr
 */
'use strict';

var SyncServer = (function(){var PRS$0 = (function(o,t){o["__proto__"]={"a":t};return o["a"]===t})({},{});var DP$0 = Object.defineProperty;var GOPD$0 = Object.getOwnPropertyDescriptor;var MIXIN$0 = function(t,s){for(var p in s){if(s.hasOwnProperty(p)){DP$0(t,p,GOPD$0(s,p));}}return t};var proto$0={};
  function SyncServer() {

  }DP$0(SyncServer,"prototype",{"configurable":false,"enumerable":false,"writable":false});

  proto$0.start = function(socket, statsCallback) {
    socket.on('sync_ping', function(id, clientPingTime)  {
      var serverPongTime = Date.now() / 1000;
      socket.emit('sync_pong', id, clientPingTime, serverPongTime);
    });

    socket.on('sync_stats', function(stats)  {
      statsCallback(stats);
    });
  };
MIXIN$0(SyncServer.prototype,proto$0);proto$0=void 0;return SyncServer;})();

module.exports = SyncServer;
//# sourceMappingURL=../server/index.js.map
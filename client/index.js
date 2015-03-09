'use strict';

var SyncClient = (function(){var PRS$0 = (function(o,t){o["__proto__"]={"a":t};return o["a"]===t})({},{});var DP$0 = Object.defineProperty;var GOPD$0 = Object.getOwnPropertyDescriptor;var MIXIN$0 = function(t,s){for(var p in s){if(s.hasOwnProperty(p)){DP$0(t,p,GOPD$0(s,p));}}return t};var proto$0={};
  function SyncClient(getTimeFunction, sendFunction, receiveFunction, callback) {var options = arguments[4];if(options === void 0)options = {};var this$0 = this;
    this.pingIterations = options.pingIterations || 10; // number of ping-pongs in a streak
    this.pingInterval = options.pingInterval || 0.250; // interval between pings in a streak (in seconds)
    this.pingSleepInterval = this.pingSleepInterval || [10, 20]; // range of interval between ping-pong streaks (in seconds)
    this.pingCount = 0; // elapsed pings
    this.pingId = 0; // ping ID

    this.data = []; // circular buffer
    this.dataNextIndex = 0; // next index in circular buffer
    this.dataLength = this.pingIterations; // size of circular buffer
    this.dataBest = Math.min(4, this.dataLength); // number of quickest roundtrip times used to compute mean offset

    this.timeOffset = 0;
    this.travelTime = 0;

    if (this.pingSleepInterval[0] > this.pingSleepInterval[1]) {
      this.pingSleepInterval[0] = this.pingSleepInterval[1];
    }

    this.getTimeFunction = getTimeFunction;
    this.sendFunction = sendFunction;
    this.receiveFunction = receiveFunction;
    this.callback = callback;

    this.receiveFunction('sync_pong', function(pingId, clientPingTime, serverPingTime, serverPongTime)  {
      if (pingId === this$0.pingId) {
        var clientPongTime = this$0.getTimeFunction();
        var travelTime = Math.max(0, (clientPongTime - clientPingTime) - (serverPongTime - serverPingTime));
        var timeOffset = ((serverPingTime - clientPingTime) + (serverPongTime - clientPongTime)) * 0.5;

        this$0.data[this$0.dataNextIndex] = [travelTime, timeOffset];
        this$0.dataNextIndex = (++this$0.dataNextIndex) % this$0.dataLength;

        if (this$0.data.length >= this$0.dataLength) {
          // keep only the quickest travel times
          var quickest = this$0.data.slice(0).sort().slice(0, this$0.dataBest);
          this$0.travelTime = quickest.reduce(function(p, q)  {return p + q[0]}, 0) / quickest.length;
          this$0.timeOffset = quickest.reduce(function(p, q)  {return p + q[1]}, 0) / quickest.length;
          this$0.callback(this$0.timeOffset);
        }
      }
    });

  }DP$0(SyncClient,"prototype",{"configurable":false,"enumerable":false,"writable":false});

  proto$0.__syncLoop = function() {var this$0 = this;
    var interval;

    if (this.pingCount < this.pingIterations - 1) { // if we are in a streak, use the pingInterval value
      interval = this.pingInterval;
      ++this.pingCount;
    } else { // if we reached the end of a streak, plan for the begining of the next streak
      interval = this.pingSleepInterval[0] + Math.random() * (this.pingSleepInterval[1] - this.pingSleepInterval[0]);
      this.pingCount = 0;
    }
    
    ++this.pingId;
    this.sendFunction('sync_ping', this.pingId, this.getTimeFunction());

    setTimeout(function()  {
      this$0.__syncLoop();
    }, 1000 * interval);
  };

  proto$0.start = function() {
    this.__syncLoop();
  };

  proto$0.getLocalTime = function(syncTime) {
    if (syncTime)
      return syncTime - this.timeOffset; // conversion
    else
      return this.getTimeFunction(); // read local clock
  };

  proto$0.getSyncTime = function() {var localTime = arguments[0];if(localTime === void 0)localTime = this.getTimeFunction();
    return localTime + this.timeOffset; // always convert
  };
MIXIN$0(SyncClient.prototype,proto$0);proto$0=void 0;return SyncClient;})();

module.exports = SyncClient;
/**
 * @fileoverview Client side syncronization module
 * @author Sebastien.Robaszkiewicz@ircam.fr, Norbert.Schnell@ircam.fr
 */
'use strict';var PRS$0 = (function(o,t){o["__proto__"]={"a":t};return o["a"]===t})({},{});var DP$0 = Object.defineProperty;var GOPD$0 = Object.getOwnPropertyDescriptor;var MIXIN$0 = function(t,s){for(var p in s){if(s.hasOwnProperty(p)){DP$0(t,p,GOPD$0(s,p));}}return t};

var audioContext = require('audio-context');

function getMinOfArray(numArray) {
  return Math.min.apply(null, numArray);
}

function getMaxOfArray(numArray) {
  return Math.max.apply(null, numArray);
}

var SyncProcess = (function(){var proto$0={};
  function SyncProcess(socket, iterations, period, statsCallback) {var this$0 = this;
    this.id = Math.floor(Math.random() * 1000000);

    this.socket = socket;
    this.statsCallback = statsCallback;

    this.iterations = iterations;
    this.period = period;
    this.count = 0;

    this.timeOffsets = [];
    this.travelTimes = [];
    this.avgTimeOffset = 0;
    this.avgTravelTime = 0;
    this.minTravelTime = 0;
    this.maxTravelTime = 0;

    // Send first ping
    this.__sendPing();

    // When the client receives a 'pong' from the
    // server, calculate the travel time and the
    // time offset.
    // Repeat as many times as needed (__iterations).
    this.socket.on('sync_pong', function(id, clientPingTime, serverPongTime)  {
      if (id === this$0.id) {
        var now = this$0.getLocalTime();
        var travelTime = now - clientPingTime;
        var timeOffset = serverPongTime - (now - travelTime / 2);

        this$0.travelTimes.push(travelTime);
        this$0.timeOffsets.push(timeOffset);

        if (this$0.count < this$0.iterations) {
          setTimeout(function()  {
            this$0.__sendPing();
          }, 1000 * this$0.period);
        } else {
          this$0.avgTravelTime = this$0.travelTimes.reduce(function(p, q)  {return p + q}) / this$0.travelTimes.length;
          this$0.avgTimeOffset = this$0.timeOffsets.reduce(function(p, q)  {return p + q}) / this$0.timeOffsets.length;
          this$0.minTravelTime = getMinOfArray(this$0.travelTimes);
          this$0.maxTravelTime = getMaxOfArray(this$0.travelTimes);

          var stats = {
            minTravelTime: this$0.minTravelTime,
            maxTravelTime: this$0.maxTravelTime,
            avgTravelTime: this$0.avgTravelTime,
            avgTimeOffset: this$0.avgTimeOffset
          };

          this$0.socket.emit('sync_stats', stats);
          statsCallback(stats);
        }
      }
    });
  }DP$0(SyncProcess,"prototype",{"configurable":false,"enumerable":false,"writable":false});

  proto$0.__sendPing = function() {
    this.count++;
    this.socket.emit('sync_ping', this.id, audioContext.currentTime);
  };
MIXIN$0(SyncProcess.prototype,proto$0);proto$0=void 0;return SyncProcess;})();

var SyncClient = (function(){var proto$0={};
  function SyncClient() {var params = arguments[0];if(params === void 0)params = {};
    this.iterations = params.iterations || 5;
    this.period = params.period || 0.500;
    this.minInterval = this.minInterval || 10;
    this.maxInterval = this.maxInterval || 20;

    if(this.minInterval > this.maxInterval)
      this.minInterval = this.maxInterval;

    // stats
    this.minTravelTimes = [];
    this.maxTravelTimes = [];
    this.avgTravelTimes = [];
    this.avgTimeOffsets = [];

    this.timeOffset = 0;
  }DP$0(SyncClient,"prototype",{"configurable":false,"enumerable":false,"writable":false});

  proto$0.start = function(socket, statsCallback) {
    this.socket = socket;
    this.statsCallback = statsCallback;
    this.__syncLoop();
  };

  proto$0.__syncLoop = function() {var this$0 = this;
    var interval = this.minInterval + Math.random() * (this.maxInterval - this.minInterval);

    var sync = new SyncProcess(this.socket, this.iterations, this.period, function(stats)  {
      this$0.timeOffset = stats.avgTimeOffset;

      this$0.minTravelTimes.push(stats.minTravelTime);
      this$0.maxTravelTimes.push(stats.maxTravelTime);
      this$0.avgTimeOffsets.push(stats.avgTimeOffset);
      this$0.avgTravelTimes.push(stats.avgTravelTime);

      this$0.statsCallback(stats);
    });

    setTimeout(function()  {
      this$0.__syncLoop();
    }, 1000 * interval);
  };

  proto$0.getLocalTime = function(serverTime) {
    if (serverTime)
      return serverTime - this.timeOffset;

    return audioContext.currentTime;
  };

  proto$0.getServerTime = function() {var localTime = arguments[0];if(localTime === void 0)localTime = audioContext.currentTime;
    return localTime + this.timeOffset;
  };
MIXIN$0(SyncClient.prototype,proto$0);proto$0=void 0;return SyncClient;})();

module.exports = SyncClient;

//# sourceMappingURL=../client/index.js.map
/**
 * @fileoverview Client side syncronization module
 * @author Sebastien.Robaszkiewicz@ircam.fr, Norbert.Schnell@ircam.fr
 */
'use strict';var PRS$0 = (function(o,t){o["__proto__"]={"a":t};return o["a"]===t})({},{});var DP$0 = Object.defineProperty;var GOPD$0 = Object.getOwnPropertyDescriptor;var MIXIN$0 = function(t,s){for(var p in s){if(s.hasOwnProperty(p)){DP$0(t,p,GOPD$0(s,p));}}return t};

function getMinOfArray(numArray) {
  return Math.min.apply(null, numArray);
}

function getMaxOfArray(numArray) {
  return Math.max.apply(null, numArray);
}

var SyncProcess = (function(){var proto$0={};
  function SyncProcess(getTimeFunction, emitFunction, listenFunction, iterations, period, callback) {var this$0 = this;
    this.id = Math.floor(Math.random() * 1000000);

    this.getTimeFunction = getTimeFunction;
    this.emitFunction = emitFunction;
    this.listenFunction = listenFunction;

    this.iterations = iterations;
    this.period = period;
    this.count = 0;

    this.timeOffset = 0;

    this.timeOffsets = [];
    this.travelTimes = [];
    this.avgTimeOffset = 0;
    this.avgTravelTime = 0;
    this.minTravelTime = 0;
    this.maxTravelTime = 0;

    // Send first ping
    this.__sendPing();

    this.callback = callback;

    // When the client receives a 'pong' from the
    // server, calculate the travel time and the
    // time offset.
    // Repeat as many times as needed (__iterations).
    listenFunction('sync_pong', function(id, clientPingTime, serverPongTime)  {
      if (id === this$0.id) {
        var now = this$0.getTimeFunction();
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

          this$0.timeOffset = this$0.avgTimeOffset;

          this$0.callback(this$0.timeOffset);
          // this.socket.emit('sync_stats', stats);
        }
      }
    });
  }DP$0(SyncProcess,"prototype",{"configurable":false,"enumerable":false,"writable":false});

  proto$0.__sendPing = function() {
    this.count++;
    this.emitFunction('sync_ping', this.id, this.getTimeFunction());
  };
MIXIN$0(SyncProcess.prototype,proto$0);proto$0=void 0;return SyncProcess;})();

var SyncClient = (function(){var proto$0={};
  function SyncClient(getTimeFunction, emitFunction, listenFunction) {var options = arguments[3];if(options === void 0)options = {};
    this.iterations = options.iterations || 5; // number of ping-pongs per iteration
    this.period = options.period || 0.500; // period of pings
    this.minInterval = this.minInterval || 10; // interval of ping-pongs minimum
    this.maxInterval = this.maxInterval || 20; // interval of ping-pongs maximum

    if (this.minInterval > this.maxInterval) {
      this.minInterval = this.maxInterval;
    }

    this.getTimeFunction = getTimeFunction;
    this.emitFunction = emitFunction;
    this.listenFunction = listenFunction;

    this.timeOffset = 0;
  }DP$0(SyncClient,"prototype",{"configurable":false,"enumerable":false,"writable":false});

  proto$0.start = function() {
    this.__syncLoop();
  };

  proto$0.__syncLoop = function() {var this$0 = this;
    var interval = this.minInterval + Math.random() * (this.maxInterval - this.minInterval);

    var sync = new SyncProcess(this.getTimeFunction, this.emitFunction, this.listenFunction, this.iterations, this.period, function(offset)  {
      this$0.timeOffset = offset;
    });

    setTimeout(function()  {
      this$0.__syncLoop();
    }, 1000 * interval);
  };

  proto$0.getLocalTime = function(syncTime) {
    if (typeof syncTime !== 'undefined') {
      // conversion
      return syncTime - this.timeOffset;
    } else {
      // Read local clock
      return this.getTimeFunction();
    }
  };

  proto$0.getSyncTime = function() {var localTime = arguments[0];if(localTime === void 0)localTime = this.getTimeFunction();
    // always convert
    return localTime + this.timeOffset;
  };
MIXIN$0(SyncClient.prototype,proto$0);proto$0=void 0;return SyncClient;})();

module.exports = SyncClient;
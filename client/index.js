'use strict';

var debug = require('debug')('soundworks:sync');
var EventEmitter = require('events').EventEmitter;

// helpers

/**
 * Order min and max attributes.
 * @param {Object} that with min and max attributes
 * @returns {Object} with min and man attributes, swapped if that.min > that.max
 */
function orderMinMax(that) {
  if(that && that.min && that.max && that.min > that.max) {
    var tmp = that.min;
    that.min = that.max;
    that.max = tmp;
  }
  return that;
}

var SyncClient = (function(super$0){var PRS$0 = (function(o,t){o["__proto__"]={"a":t};return o["a"]===t})({},{});var DP$0 = Object.defineProperty;var GOPD$0 = Object.getOwnPropertyDescriptor;var MIXIN$0 = function(t,s){for(var p in s){if(s.hasOwnProperty(p)){DP$0(t,p,GOPD$0(s,p));}}return t};var SP$0 = Object.setPrototypeOf||function(o,p){if(PRS$0){o["__proto__"]=p;}else {DP$0(o,"__proto__",{"value":p,"configurable":true,"enumerable":false,"writable":true});}return o};var OC$0 = Object.create;if(!PRS$0)MIXIN$0(SyncClient, super$0);var proto$0={};
  function SyncClient(getTimeFunction) {var options = arguments[1];if(options === void 0)options = {};
    // timeout to consider a ping was not ponged back
    this.pingTimeoutDelay = options.pingTimeoutDelay
      || { min: 1, max: 30 };
    // number of ping-pongs in a streak
    this.pingStreakIterations = options.pingStreakIterations || 10;
    // interval between pings in a streak (in seconds)
    this.pingStreakPeriod = options.pingStreakPeriod || 0.250;
    // range of interval between ping-pong streaks (in seconds)
    this.pingStreakDelay = options.pingStreakDelay
      || { min: 10, max: 20 };
    // number of quickest roundtrip times used to compute mean offset
    this.dataBest = options.keepBestN || 4;

    this.pingDelay = 0; // current delay before next ping
    this.pingCount = 0; // elapsed pings in a streak
    this.pingId = 0; // absolute ID to mach pong against
    this.pingTimeoutId = 0; // to cancel timeout on sync_pinc

    this.data = []; // circular buffer
    this.dataNextIndex = 0; // next index to write in circular buffer
    this.dataLength = this.pingStreakIterations; // size of circular buffer
    this.dataBest = Math.min(this.dataBest, this.dataLength);

    this.timeOffset = 0;
    this.travelTime = 0;
    this.travelTimeMax = 0;

    orderMinMax(this.PingStreakDelay);
    orderMinMax(this.pingTimeoutDelay);
    this.pingTimeoutDelay.current = this.pingTimeoutDelay.min;

    this.getTimeFunction = getTimeFunction;
  }if(super$0!==null)SP$0(SyncClient,super$0);SyncClient.prototype = OC$0(super$0!==null?super$0.prototype:null,{"constructor":{"value":SyncClient,"configurable":true,"writable":true}});DP$0(SyncClient,"prototype",{"configurable":false,"enumerable":false,"writable":false});

  proto$0.__syncLoop = function(sendFunction) {var this$0 = this;
    clearTimeout(this.timeoutId);
    ++this.pingId;
    sendFunction('sync:ping', this.pingId, this.getTimeFunction());

    this.timeoutId = setTimeout(function()  {
      // increase timeout duration on timeout, to avoid overflow
      this$0.pingTimeoutDelay.current = Math.min(this$0.pingTimeoutDelay.current * 2,
                                               this$0.pingTimeoutDelay.max);
      debug('sync:ping timeout > %s', this$0.pingTimeoutDelay.current);
      this$0.__syncLoop(sendFunction); // retry (yes, always increment pingId)
    }, 1000 * this.pingTimeoutDelay.current);
  };

  proto$0.start = function(sendFunction, receiveFunction) {var this$0 = this;
    receiveFunction('sync:pong', function(pingId, clientPingTime, serverPingTime, serverPongTime)  {
      // accept only the pong that corresponds to the last ping
      // or accepts anything when lost
      if (pingId === this$0.pingId
          || this$0.pingTimeoutDelay.current === this$0.pingTimeoutDelay.max) {
        ++this$0.pingCount;
        debug('pingCount = %s', this$0.pingCount);
        clearTimeout(this$0.timeoutId);
        // reduce timeout duration on pong, for better reactivity
        this$0.pingTimeoutDelay.current = Math.max(this$0.pingTimeoutDelay.current * 0.75,
                                                 this$0.pingTimeoutDelay.min);

        var clientPongTime = this$0.getTimeFunction();
        var travelTime = Math.max(0, (clientPongTime - clientPingTime) - (serverPongTime - serverPingTime));
        var timeOffset = ((serverPingTime - clientPingTime) + (serverPongTime - clientPongTime)) * 0.5;

        this$0.data[this$0.dataNextIndex] = [travelTime, timeOffset];
        this$0.dataNextIndex = (++this$0.dataNextIndex) % this$0.dataLength;

        // end of a streak
        if (this$0.pingCount >= this$0.pingStreakIterations
            && this$0.data.length >= this$0.dataLength) {
          // plan the begining of the next streak
          this$0.pingDelay = this$0.pingStreakDelay.min
            + Math.random() * (this$0.pingStreakDelay.max - this$0.pingStreakDelay.min);
          this$0.pingCount = 0;

          // mean travel time over the last iterations
          var sorted = this$0.data.slice(0).sort();
          this$0.travelTime = sorted.reduce(function(p, q)  {return p + q[0]}, 0) / sorted.length;
          this$0.travelTimeMax = sorted[sorted.length - 1][0];

          // keep only the quickest travel times for time offset
          var quickest = sorted.slice(0, this$0.dataBest);
          var timeOffsetAvg = quickest.reduce(function(p, q)  {return p + q[1]}, 0) / quickest.length;
          debug('timeOffsetAvg = %s, delta = %s',
                timeOffsetAvg, timeOffsetAvg - this$0.timeOffset);
          this$0.timeOffset = timeOffsetAvg;

          this$0.emit('sync:stats', {
            timeOffset: this$0.timeOffset,
            travelTime: this$0.travelTime,
            travelTimeMax: this$0.travelTimeMax
          });
        } else {
          // we are in a streak, use the pingInterval value
          this$0.pingDelay = this$0.pingStreakPeriod;
        }

        setTimeout(function()  {
          this$0.__syncLoop(sendFunction);
        }, 1000 * this$0.pingDelay);
      }  // ping and pong ID match
    }); // receive function

    this.__syncLoop(sendFunction);
  };

  proto$0.getLocalTime = function(syncTime) {
    if (syncTime) {
      return syncTime - this.timeOffset; // conversion
    } else {
      return this.getTimeFunction(); // read local clock
    }
  };

  proto$0.getSyncTime = function() {var localTime = arguments[0];if(localTime === void 0)localTime = this.getTimeFunction();
    return localTime + this.timeOffset; // always convert
  };
MIXIN$0(SyncClient.prototype,proto$0);proto$0=void 0;return SyncClient;})(EventEmitter);

module.exports = SyncClient;

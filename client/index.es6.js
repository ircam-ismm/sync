'use strict';

var debug = require('debug')('soundworks:sync');
var EventEmitter = require('events').EventEmitter;

class SyncClient extends EventEmitter {
  constructor(getTimeFunction, options = {}) {
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
  }

  __syncLoop(sendFunction) {
    clearTimeout(this.timeoutId);
    ++ this.pingId;
    sendFunction('sync:ping', this.pingId, this.getTimeFunction());

    this.timeoutId = setTimeout(() => {
      // increase timeout duration on timeout, to avoid overflow
      this.pingTimeoutDelay.current = Math.min(this.pingTimeoutDelay.current * 2,
                                               this.pingTimeoutDelay.max);
      debug('sync:ping timeout > %s', this.pingTimeoutDelay.current);
      this.__syncLoop(sendFunction); // retry (yes, always increment pingId)
    }, 1000 * this.pingTimeoutDelay.current);
  }

  start(sendFunction, receiveFunction) {
    receiveFunction('sync:pong', (pingId, clientPingTime, serverPingTime, serverPongTime) => {
      // accept only the pong that corresponds to the last ping
      // or accepts anything when lost
      if (pingId === this.pingId
          || this.pingTimeoutDelay.current === this.pingTimeoutDelay.max) {
        ++ this.pingCount;
        debug('pingCount = %s', this.pingCount);
        clearTimeout(this.timeoutId);
        // reduce timeout duration on pong, for better reactivity
        this.pingTimeoutDelay.current = Math.max(this.pingTimeoutDelay.current * 0.75,
                                                 this.pingTimeoutDelay.min);

        const clientPongTime = this.getTimeFunction();
        const travelTime = Math.max(0, (clientPongTime - clientPingTime) - (serverPongTime - serverPingTime));
        const timeOffset = ((serverPingTime - clientPingTime) + (serverPongTime - clientPongTime)) * 0.5;

        this.data[this.dataNextIndex] = [travelTime, timeOffset];
        this.dataNextIndex = (++this.dataNextIndex) % this.dataLength;

        // end of a streak
        if (this.pingCount >= this.pingStreakIterations
            && this.data.length >= this.dataLength) {
          // plan the begining of the next streak
          this.pingDelay = this.pingStreakDelay.min
            + Math.random() * (this.pingStreakDelay.max - this.pingStreakDelay.min);
          this.pingCount = 0;

          // mean travel time over the last iterations
          const sorted = this.data.slice(0).sort();
          this.travelTime = sorted.reduce((p, q) => p + q[0], 0) / sorted.length;
          this.travelTimeMax = sorted[sorted.length - 1][0];

          // keep only the quickest travel times for time offset
          const quickest = sorted.slice(0, this.dataBest);
          const timeOffsetAvg = quickest.reduce((p, q) => p + q[1], 0) / quickest.length;
          debug("timeOffsetAvg = %s, delta = %s",
                timeOffsetAvg, timeOffsetAvg - this.timeOffset);
          this.timeOffset = timeOffsetAvg;

          this.emit('sync:stats', {
            timeOffset: this.timeOffset,
            travelTime: this.travelTime,
            travelTimeMax: this.travelTimeMax
          });
        } else {
          // we are in a streak, use the pingInterval value
          this.pingDelay = this.pingStreakPeriod;
        }

        setTimeout(() => {
          this.__syncLoop(sendFunction);
        }, 1000 * this.pingDelay);
        // ping and pong ID match
      } else {
        debug('ping-pong mismatch: %s ≠ %s, pingCount = %s, travelTime = %s, timeOffset = %s',
              pingId, this.pingId, this.pingCount,
              Math.max(0, (clientPongTime - clientPingTime) - (serverPongTime - serverPingTime)),
              ((serverPingTime - clientPingTime) + (serverPongTime - clientPongTime)) * 0.5);
      }
    }); // receive function

    this.__syncLoop(sendFunction);
  }

  getLocalTime(syncTime) {
    if (syncTime) {
      return syncTime - this.timeOffset; // conversion
    } else {
      return this.getTimeFunction(); // read local clock
    }
  }

  getSyncTime(localTime = this.getTimeFunction()) {
    return localTime + this.timeOffset; // always convert
  }
}

function orderMinMax(that) {
  if(that && that.min && that.max && that.min > that.max) {
    const tmp = that.min;
    that.min = that.max;
    that.max = tmp;
  }
  return that;
}

module.exports = SyncClient;

'use strict';

var debug = require('debug')('soundworks:sync');
var EventEmitter = require('events').EventEmitter;

class SyncClient extends EventEmitter {
  constructor(getTimeFunction, options = {}) {
    this.pingTimeoutDelay = options.pingTimeoutDelay || 1; // timeout to consider a ping was not ponged back

    this.pingStreakIterations = options.pingStreakIterations || 10; // number of ping-pongs in a streak
    this.pingStreakPeriod = options.pingStreakPeriod || 0.250; // interval between pings in a streak (in seconds)
    this.pingStreakDelay = options.pingStreakDelay || [10, 20]; // range of interval between ping-pong streaks (in seconds)
    this.pingDelay = 0; // current delay before next ping
    this.pingCount = 0; // elapsed pings in a streak
    this.pingId = 0; // absolute ID to mach pong against
    this.pingTimeoutId = 0; // to cancel timeout on sync_pinc

    this.data = []; // circular buffer
    this.dataNextIndex = 0; // next index in circular buffer
    this.dataLength = this.pingStreakIterations; // size of circular buffer
    this.dataBest = Math.min(4, this.dataLength); // number of quickest roundtrip times used to compute mean offset

    this.timeOffset = 0;
    this.travelTime = 0;
    this.travelTimeMax = 0;

    if (this.pingStreakDelay[0] > this.pingStreakDelay[1]) {
      let tmp = this.pingStreakDelay[0];
      this.pingStreakDelay[0] = this.pingStreakDelay[1];
      this.pingStreakDelay[1] = this.pingStreakDelay[0];
    }

    this.getTimeFunction = getTimeFunction;
  }

  __syncLoop(sendFunction) {
    clearTimeout(this.timeoutId);
    ++ this.pingId;
    sendFunction('sync_ping', this.pingId, this.getTimeFunction());

    this.timeoutId = setTimeout(() => {
      debug('sync_ping timeout > %s', this.pingTimeoutDelay);
      this.__syncLoop(sendFunction); // retry (yes, always increment pingId)
    }, 1000 * this.pingTimeoutDelay);
  }

  start(sendFunction, receiveFunction) {
    receiveFunction('sync_pong', (pingId, clientPingTime, serverPingTime, serverPongTime) => {
      if (pingId === this.pingId) {
        ++ this.pingCount;
        clearTimeout(this.timeoutId);

        var clientPongTime = this.getTimeFunction();
        var travelTime = Math.max(0, (clientPongTime - clientPingTime) - (serverPongTime - serverPingTime));
        const timeOffset = ((serverPingTime - clientPingTime) + (serverPongTime - clientPongTime)) * 0.5;

        this.data[this.dataNextIndex] = [travelTime, timeOffset];
        this.dataNextIndex = (++this.dataNextIndex) % this.dataLength;

        // end of a streak
        if (this.pingCount >= this.pingStreakIterations
            && this.data.length >= this.dataLength) {
          // plan the begining of the next streak
          this.pingDelay = this.pingStreakDelay[0]
            + Math.random() * (this.pingStreakDelay[1] - this.pingStreakDelay[0]);
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

      } // ping and pong ID match

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

module.exports = SyncClient;

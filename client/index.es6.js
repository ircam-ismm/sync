/**
 * @fileOverview Client-side syncronization component
 * @author Jean-Philippe.Lambert@ircam.fr, Sebastien.Robaszkiewicz@ircam.fr,
 *         Norbert.Schnell@ircam.fr
 */

'use strict';

var debug = require('debug')('soundworks:client:sync');
var EventEmitter = require('events').EventEmitter;

////// helpers

/**
 * Order min and max attributes.
 * @param {Object} that with min and max attributes
 * @returns {Object} with min and man attributes, swapped if that.min > that.max
 */
function orderMinMax(that) {
  if(that && that.min && that.max && that.min > that.max) {
    const tmp = that.min;
    that.min = that.max;
    that.max = tmp;
  }
  return that;
}

/**
 * Mean over an array, selecting one dimension of the array values.
 * @param {Array.<Array.<Number>>} array
 * @param {Number} [dimension = 0]
 * @returns {Number} mean
 */
function mean(array, dimension = 0) {
  return array.reduce((p, q) => p + q[dimension], 0) / array.length;
}

class SyncClient extends EventEmitter {
  /**
   * This is the constructor. @see {@linkcode start} method to
   * actually start a synchronization process.
   *
   * @param {Function} getTimeFunction called to get the local
   * time. It must return a time in seconds, monotonic, ever
   * increasing.
   */
  constructor(getTimeFunction, options = {}) {
    // timeout to consider a ping was not ponged back
    this.pingTimeoutDelay = options.pingTimeoutDelay
      || { min: 1, max: 30 };
    orderMinMax(this.pingTimeoutDelay);

    // number of ping-pongs in a streak
    this.pingStreakIterations = options.pingStreakIterations || 10;

    // interval between pings in a streak (in seconds)
    this.pingStreakPeriod = options.pingStreakPeriod || 0.250;

    // range of interval between ping-pong streaks (in seconds)
    this.pingStreakDelay = options.pingStreakDelay
      || { min: 10, max: 20 };
    orderMinMax(this.pingStreakDelay);

    // number of quickest roundtrip times used to compute mean offset in a streak
    this.streakDataQuickestN = options.keepQuickestN || 4;

    this.pingDelay = 0; // current delay before next ping
    this.pingTimeoutId = 0; // to cancel timeout on sync_pinc
    this.pingId = 0; // absolute ID to mach pong against

    this.pingStreakCount = 0; // elapsed pings in a streak
    this.streakData = []; // circular buffer
    this.streakDataNextIndex = 0; // next index to write in circular buffer
    this.streakDataLength = this.pingStreakIterations; // size of circular buffer
    this.streakDataQuickestN = Math.min(this.streakDataQuickestN, this.streakDataLength);

    // duration of training, before using estimate of synchronisation
    this.longTermDataTrainingDuration = 90; // in seconds, approximately
    this.longTermDataTrainingLength = Math.max(
      2,
      this.longTermDataTrainingDuration
        / (0.5 * (this.pingStreakDelay.min + this.pingStreakDelay.max) ) );

    // estimate synchronisation over this duration
    this.longTermDataDuration = 300; // in seconds, approximately
    this.longTermDataLength = Math.max(
      2,
      this.longTermDataDuration /
        (0.5 * (this.pingStreakDelay.min + this.pingStreakDelay.max) ) );

    this.longTermData = []; // circular buffer
    this.longTermDataNextIndex = 0; // next index to write in circular buffer

    this.timeOffset = 0; // mean of (serverTime - clientTime) in the last streak
    this.travelTime = 0;
    this.travelTimeMax = 0;

    // T(t) = T0 + R * (t - t0)
    this.serverTimeReference = 0; // T0
    this.clientTimeReference = 0; // t0
    this.frequencyRatio = 1; // R

    this.pingTimeoutDelay.current = this.pingTimeoutDelay.min;

    this.getTimeFunction = getTimeFunction;

    this.status = 'new';
  }

  __syncLoop(sendFunction) {
    clearTimeout(this.timeoutId);
    ++this.pingId;
    sendFunction('sync:ping', this.pingId, this.getLocalTime());

    this.timeoutId = setTimeout(() => {
      // increase timeout duration on timeout, to avoid overflow
      this.pingTimeoutDelay.current = Math.min(this.pingTimeoutDelay.current * 2,
                                               this.pingTimeoutDelay.max);
      debug('sync:ping timeout > %s', this.pingTimeoutDelay.current);
      this.__syncLoop(sendFunction); // retry (yes, always increment pingId)
    }, 1000 * this.pingTimeoutDelay.current);
  }

  /**
   * Start a synchronization process by registering the receive
   * function passed as second parameter. Then, send regular messages
   * to the server, using the send function passed as first parameter.
   *
   * @param {Function} sendFunction
   * @param {Function} receiveFunction
   */
  start(sendFunction, receiveFunction) {
    this.status = 'startup';

    this.streakData = [];
    this.streakDataNextIndex = 0;

    this.longTermData = [];
    this.longTermDataNextIndex = 0;

    receiveFunction('sync:pong', (pingId, clientPingTime, serverPingTime, serverPongTime) => {
      // accept only the pong that corresponds to the last ping
      if (pingId === this.pingId) {
        ++this.pingStreakCount;
        clearTimeout(this.timeoutId);
        // reduce timeout duration on pong, for better reactivity
        this.pingTimeoutDelay.current = Math.max(this.pingTimeoutDelay.current * 0.75,
                                                 this.pingTimeoutDelay.min);
        const clientPongTime = this.getLocalTime();
        const clientTime = 0.5 * (clientPongTime + clientPingTime);
        const serverTime = 0.5 * (serverPongTime + serverPingTime);
        const travelTime = Math.max(0, (clientPongTime - clientPingTime)
                                    - (serverPongTime - serverPingTime));

        this.streakData[this.streakDataNextIndex]
          = [travelTime, clientTime, serverTime];
        this.streakDataNextIndex = (++this.streakDataNextIndex) % this.streakDataLength;

        // end of a streak
        if (this.pingStreakCount >= this.pingStreakIterations
            && this.streakData.length >= this.streakDataLength) {
          // plan the begining of the next streak
          this.pingDelay = this.pingStreakDelay.min
            + Math.random() * (this.pingStreakDelay.max - this.pingStreakDelay.min);
          this.pingStreakCount = 0;

          // mean travel time over the last iterations
          const sorted = this.streakData.slice(0).sort();
          this.travelTime = mean(sorted, 0);
          this.travelTimeMax = sorted[sorted.length - 1][0];

          // time offset is the mean of (serverTime - clientTime)
          // over the N quickest travel times
          const quickest = sorted.slice(0, this.streakDataQuickestN);
          this.timeOffset = mean(quickest, 2) - mean(quickest, 1);

          // keep the quickest of the streak for the long-term data
          const streakTravelTime = sorted[0][0];
          const streakClientTime = sorted[0][1];
          const streakServerTime = sorted[0][2];
          const streakClientSquaredTime = streakClientTime * streakClientTime;
          const streakClientServerTime = streakClientTime * streakServerTime;

          this.longTermData[this.longTermDataNextIndex]
            = [streakTravelTime, streakClientTime, streakServerTime,
               streakClientSquaredTime, streakClientServerTime];
          this.longTermDataNextIndex = (++this.longTermDataNextIndex) % this.longTermDataLength;

          if(this.status === 'startup'
             || (this.status === 'training'
                 && this.longTermData.length < this.longTermDataTrainingLength) ) {
            this.status = 'training';
            // set only the phase offset, not the frequency
            this.serverTimeReference = this.timeOffset;
            this.clientTimeReference = 0;
            this.frequencyRatio = 1;
            debug('T = %s + %s * (%s - %s) = %s',
                  this.serverTimeReference, this.frequencyRatio,
                  streakClientTime, this.clientTimeReference,
                  this.getSyncTime(streakClientTime));
          }

          if((this.status === 'training' || this.status === 'sync')
             && this.longTermData.length >= this.longTermDataTrainingLength) {
            // linear regression, R = covariance(t,T) / variance(t)
            const regClientTime = mean(this.longTermData, 1);
            const regServerTime = mean(this.longTermData, 2);
            const regClientSquaredTime = mean(this.longTermData, 3);
            const regClientServerTime = mean(this.longTermData, 4);

            const covariance = regClientServerTime - regClientTime * regServerTime;
            const variance = regClientSquaredTime - regClientTime * regClientTime;
            if(variance > 0) {
              // update freq and shift
              this.frequencyRatio = covariance / variance;
              this.clientTimeReference = regClientTime;
              this.serverTimeReference = regServerTime;

              debug('T = %s + %s * (%s - %s) = %s',
                    this.serverTimeReference, this.frequencyRatio,
                    streakClientTime, this.clientTimeReference,
                    this.getSyncTime(streakClientTime) );

              // // check against offset: sync offset should be within +/- tick duration
              // debug('sync offset = %s, phase offset = %s, diff = %s, sync_stddev = %s',
              //       this.getSyncTime(streakClientTime) - streakClientTime,
              //       this.timeOffset,
              //       this.getSyncTime(streakClientTime) - streakClientTime - this.timeOffset,
              //       Math.sqrt(variance) );

              this.status = 'sync';
            }

          }

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
      }  // ping and pong ID match
    }); // receive function

    this.__syncLoop(sendFunction);
  }

  /**
   * Get local time, or convert a synchronized time to a local time.
   *
   * @param {Number} syncTime undefined to get local time
   * @returns {Number} local time, in seconds
   */
  getLocalTime(syncTime) {
    if (typeof syncTime !== 'undefined') {
      // conversion: t(T) = t0 + (T - T0) / R
      return this.clientTimeReference
        + (syncTime - this.serverTimeReference) / this.frequencyRatio;
    } else {
      // read local clock
      return this.getTimeFunction();
    }
  }

  /**
   * Get Synchronized time, or convert a local time to a synchronized time.
   *
   * @param {Number} localTime undefined to get synchronized time
   * @returns {Number} synchronized time, in seconds.
   */
  getSyncTime(localTime = this.getLocalTime()) {
    // always convert: T(t) = T0 + R * (t - t0)
    return this.serverTimeReference
      + this.frequencyRatio * (localTime - this.clientTimeReference);
  }
}

module.exports = SyncClient;

/**
 * @fileOverview Client-side syncronization component
 * @author Jean-Philippe.Lambert@ircam.fr, Sebastien.Robaszkiewicz@ircam.fr,
 *         Norbert.Schnell@ircam.fr
 */

'use strict';

var debug = require('debug')('soundworks:client:sync');

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

class SyncClient {
  /**
   * @callback SyncClient~getTimeFunction
   * @return {Number} monotonic, ever increasing, time in second.
   **/

  /**
   * @callback SyncClient~sendFunction
   * @see {@linkcode SyncServer~sendFunction}
   * @param {String} messageType identification of ping message type
   * @param {Number} pingId unique identifier
   * @param {Number} clientPingTime time-stamp of ping emission
   **/

  /**
   * @callback SyncClient~receiveFunction
   * @see {@linkcode SyncServer~receiveFunction}
   * @param {String} messageType identification of pong message type
   * @param {SyncClient~receiveCallback} receiveCallback called on
   * each message matching messageType.
   **/

  /**
   * @callback SyncClient~receiveCallback
   * @param {Number} pingId unique identifier
   * @param {Number} clientPingTime time-stamp of ping emission
   * @param {Number} serverPingTime time-stamp of ping reception
   * @param {Number} serverPongTime time-stamp of pong emission
   * @param {Number} clientPongTime time-stamp of pong reception
   **/

  /**
   * @callback SyncClient~reportFunction
   * @param {String} messageType identification of status message type
   * @param {Object} report
   * @param {String} report.status
   * @param {Number} report.timeOffset time difference between local
   * time and sync time, in seconds. Measured as the median of the
   * shortest round-trip times over the last ping-pong streak.
   * @param {Number} report.travelDuration half-duration of a
   * ping-pong round-trip, in seconds, mean over the the last
   * ping-pong streak.
   * @param {Number} report.travelDurationMax half-duration of a
   * ping-pong round-trip, in seconds, maximum over the the last
   * ping-pong streak.
   *
   *
   **/

  /**
   * This is the constructor. @see {@linkcode start} method to
   * actually start a synchronization process.
   *
   * @param {SyncClient~getTimeFunction} getTimeFunction
   * @param {Object} options
   * @param {Object} options.pingTimeOutDelay range of duration (in seconds) to
   * consider a ping was not ponged back
   * @param {Number} options.pingTimeOutDelay.min
   * @param {Number} options.pingTimeOutDelay.max
   * @param {Number} options.pingStreakIterations ping-pongs in a
   * streak
   * @param {Number} options.pingStreakPeriod interval (in seconds) between pings
   * in a streak
   * @param {Number} options.pingStreakDelay range of interval (in
   * seconds) between ping-pong streaks in a streak
   * @param {Number} options.pingStreakDelay.min
   * @param {Number} options.pingStreakDelay.max
   * @param {Number} options.longTermDataTrainingDuration duration of
   * training, in seconds, approximately, before using the estimate of
   * clock frequency
   * @param {Number} options.longTermDataDuration estimate synchronisation over
   *  this duration, in seconds, approximately
   */
  constructor(getTimeFunction, options = {}) {
    this.pingTimeoutDelay = options.pingTimeoutDelay
      || { min: 1, max: 30 };
    orderMinMax(this.pingTimeoutDelay);

    this.pingStreakIterations = options.pingStreakIterations || 10;
    this.pingStreakPeriod = options.pingStreakPeriod || 0.250;
    this.pingStreakDelay = options.pingStreakDelay
      || { min: 10, max: 20 };
    orderMinMax(this.pingStreakDelay);

    this.pingDelay = 0; // current delay before next ping
    this.pingTimeoutId = 0; // to cancel timeout on sync_pinc
    this.pingId = 0; // absolute ID to mach pong against

    this.pingStreakCount = 0; // elapsed pings in a streak
    this.streakData = []; // circular buffer
    this.streakDataNextIndex = 0; // next index to write in circular buffer
    this.streakDataLength = this.pingStreakIterations; // size of circular buffer

    this.longTermDataTrainingDuration
      = options.longTermDataTrainingDuration || 120;
    this.longTermDataTrainingLength = Math.max(
      2,
      this.longTermDataTrainingDuration
        / (0.5 * (this.pingStreakDelay.min + this.pingStreakDelay.max) ) );

    this.longTermDataDuration = options.longTermDataDuration || 900;
    this.longTermDataLength = Math.max(
      2,
      this.longTermDataDuration /
        (0.5 * (this.pingStreakDelay.min + this.pingStreakDelay.max) ) );

    // duration of training, before using estimate of synchronisation
    this.longTermDataTrainingDuration = 120; // in seconds, approximately
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
    this.travelDuration = 0;
    this.travelDurationMax = 0;

    // T(t) = T0 + R * (t - t0)
    this.serverTimeReference = 0; // T0
    this.clientTimeReference = 0; // t0
    this.frequencyRatio = 1; // R

    this.pingTimeoutDelay.current = this.pingTimeoutDelay.min;

    this.getTimeFunction = getTimeFunction;

    this.status = 'new';
  }

  /**
   * Private. Process to send ping messages.
   * @param {SyncClient~sendFunction} sendFunction
   */
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
   * @param {SyncClient~sendFunction} sendFunction
   * @param {SyncClient~receiveFunction} receiveFunction to register
   * @param {SyncClient~reportFunction} reportFunction if defined, call to report the status
   */
  start(sendFunction, receiveFunction, reportFunction) {
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
        const travelDuration = Math.max(0, (clientPongTime - clientPingTime)
                                        - (serverPongTime - serverPingTime));
        const offsetTime = serverTime - clientTime;

        // order is important for sorting, later.
        this.streakData[this.streakDataNextIndex]
          = [travelDuration, offsetTime, clientTime, serverTime];
        this.streakDataNextIndex = (++this.streakDataNextIndex) % this.streakDataLength;

        // debug('ping %s, travel = %s, offset = %s, client = %s, server = %s',
        //       pingId, travelDuration, offsetTime, clientTime, serverTime);

        // end of a streak
        if (this.pingStreakCount >= this.pingStreakIterations
            && this.streakData.length >= this.streakDataLength) {
          // plan the begining of the next streak
          this.pingDelay = this.pingStreakDelay.min
            + Math.random() * (this.pingStreakDelay.max - this.pingStreakDelay.min);
          this.pingStreakCount = 0;

          // sort by travel time first, then offset time.
          const sorted = this.streakData.slice(0).sort();

          const streakTravelDuration = sorted[0][0];

          // When the clock tick is long enough,
          // some travel times (dimension 0) might be identical.
          // Then, use the offset median (dimension 1 is the second sort key)
          let s = 0;
          while(s < sorted.length && sorted[s][0] <= streakTravelDuration * 1.01) {
            ++s;
          }
          s = Math.max(0, s - 1);
          let median = Math.floor(s / 2);

          const streakClientTime = sorted[median][2];
          const streakServerTime = sorted[median][3];
          const streakClientSquaredTime = streakClientTime * streakClientTime;
          const streakClientServerTime = streakClientTime * streakServerTime;

          this.longTermData[this.longTermDataNextIndex]
            = [streakTravelDuration, streakClientTime, streakServerTime,
               streakClientSquaredTime, streakClientServerTime];
          this.longTermDataNextIndex = (++this.longTermDataNextIndex) % this.longTermDataLength;

          // mean of the time offset over 3 samples around median
          // (it might use a longer travel duration)
          const aroundMedian = sorted.slice(Math.max(0, median - 1),
                                            Math.min(sorted.length, median + 1) );
          this.timeOffset = mean(aroundMedian, 3) - mean(aroundMedian, 2);

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

              // 10% is a lot
              if(this.frequencyRatio > 0.99 && this.frequencyRatio < 1.01) {
                this.status = 'sync';
              } else {
                debug('clock frequency ratio out of sync: %s, training again',
                      this.frequencyRatio);
                // start the training again from the last streak
                this.status = 'training';
                this.serverTimeReference = this.timeOffset; // offset only
                this.clientTimeReference = 0;
                this.frequencyRatio = 1;

                this.longTermData[0]
                  = [streakTravelDuration, streakClientTime, streakServerTime,
                     streakClientSquaredTime, streakClientServerTime];
                this.longTermData.length = 1;
                this.longTermDataNextIndex = 1;
              }
            }

            debug('T = %s + %s * (%s - %s) = %s',
                  this.serverTimeReference, this.frequencyRatio,
                  streakClientTime, this.clientTimeReference,
                  this.getSyncTime(streakClientTime) );
          }

          this.travelDuration = mean(sorted, 0);
          this.travelDurationMax = sorted[sorted.length - 1][0];

          reportFunction('sync:status', {
            status: this.status,
            timeOffset: this.timeOffset,
            frequencyRatio: this.frequencyRatio,
            travelDuration: this.travelDuration,
            travelDurationMax: this.travelDurationMax
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

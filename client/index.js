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
    var tmp = that.min;
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
function mean(array) {var dimension = arguments[1];if(dimension === void 0)dimension = 0;
  return array.reduce(function(p, q)  {return p + q[dimension]}, 0) / array.length;
}

var SyncClient = (function(super$0){var PRS$0 = (function(o,t){o["__proto__"]={"a":t};return o["a"]===t})({},{});var DP$0 = Object.defineProperty;var GOPD$0 = Object.getOwnPropertyDescriptor;var MIXIN$0 = function(t,s){for(var p in s){if(s.hasOwnProperty(p)){DP$0(t,p,GOPD$0(s,p));}}return t};var SP$0 = Object.setPrototypeOf||function(o,p){if(PRS$0){o["__proto__"]=p;}else {DP$0(o,"__proto__",{"value":p,"configurable":true,"enumerable":false,"writable":true});}return o};var OC$0 = Object.create;if(!PRS$0)MIXIN$0(SyncClient, super$0);var proto$0={};
  /**
   * This is the constructor. @see {@linkcode start} method to
   * actually start a synchronization process.
   *
   * @param {Function} getTimeFunction called to get the local
   * time. It must return a time in seconds, monotonic, ever
   * increasing.
   */
  function SyncClient(getTimeFunction) {var options = arguments[1];if(options === void 0)options = {};
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
    this.travelTime = 0;
    this.travelTimeMax = 0;

    // T(t) = T0 + R * (t - t0)
    this.serverTimeReference = 0; // T0
    this.clientTimeReference = 0; // t0
    this.frequencyRatio = 1; // R

    this.pingTimeoutDelay.current = this.pingTimeoutDelay.min;

    this.getTimeFunction = getTimeFunction;

    this.status = 'new';
  }if(super$0!==null)SP$0(SyncClient,super$0);SyncClient.prototype = OC$0(super$0!==null?super$0.prototype:null,{"constructor":{"value":SyncClient,"configurable":true,"writable":true}});DP$0(SyncClient,"prototype",{"configurable":false,"enumerable":false,"writable":false});

  proto$0.__syncLoop = function(sendFunction) {var this$0 = this;
    clearTimeout(this.timeoutId);
    ++this.pingId;
    sendFunction('sync:ping', this.pingId, this.getLocalTime());

    this.timeoutId = setTimeout(function()  {
      // increase timeout duration on timeout, to avoid overflow
      this$0.pingTimeoutDelay.current = Math.min(this$0.pingTimeoutDelay.current * 2,
                                               this$0.pingTimeoutDelay.max);
      debug('sync:ping timeout > %s', this$0.pingTimeoutDelay.current);
      this$0.__syncLoop(sendFunction); // retry (yes, always increment pingId)
    }, 1000 * this.pingTimeoutDelay.current);
  };

  /**
   * Start a synchronization process by registering the receive
   * function passed as second parameter. Then, send regular messages
   * to the server, using the send function passed as first parameter.
   *
   * @param {Function} sendFunction
   * @param {Function} receiveFunction
   */
  proto$0.start = function(sendFunction, receiveFunction) {var this$0 = this;
    this.status = 'startup';

    this.streakData = [];
    this.streakDataNextIndex = 0;

    this.longTermData = [];
    this.longTermDataNextIndex = 0;

    receiveFunction('sync:pong', function(pingId, clientPingTime, serverPingTime, serverPongTime)  {
      // accept only the pong that corresponds to the last ping
      if (pingId === this$0.pingId) {
        ++this$0.pingStreakCount;
        clearTimeout(this$0.timeoutId);
        // reduce timeout duration on pong, for better reactivity
        this$0.pingTimeoutDelay.current = Math.max(this$0.pingTimeoutDelay.current * 0.75,
                                                 this$0.pingTimeoutDelay.min);
        var clientPongTime = this$0.getLocalTime();
        var clientTime = 0.5 * (clientPongTime + clientPingTime);
        var serverTime = 0.5 * (serverPongTime + serverPingTime);
        var travelTime = Math.max(0, (clientPongTime - clientPingTime)
                                    - (serverPongTime - serverPingTime));

        this$0.streakData[this$0.streakDataNextIndex]
          = [travelTime, clientTime, serverTime];
        this$0.streakDataNextIndex = (++this$0.streakDataNextIndex) % this$0.streakDataLength;

        // end of a streak
        if (this$0.pingStreakCount >= this$0.pingStreakIterations
            && this$0.streakData.length >= this$0.streakDataLength) {
          // plan the begining of the next streak
          this$0.pingDelay = this$0.pingStreakDelay.min
            + Math.random() * (this$0.pingStreakDelay.max - this$0.pingStreakDelay.min);
          this$0.pingStreakCount = 0;

          // mean travel time over the last iterations
          var sorted = this$0.streakData.slice(0).sort();
          this$0.travelTime = mean(sorted, 0);
          this$0.travelTimeMax = sorted[sorted.length - 1][0];

          // time offset is the mean of (serverTime - clientTime)
          // over the N quickest travel times
          var quickest = sorted.slice(0, this$0.streakDataQuickestN);
          this$0.timeOffset = mean(quickest, 2) - mean(quickest, 1);

          // keep the quickest of the streak for the long-term data
          var streakTravelTime = sorted[0][0];
          var streakClientTime = sorted[0][1];
          var streakServerTime = sorted[0][2];
          var streakClientSquaredTime = streakClientTime * streakClientTime;
          var streakClientServerTime = streakClientTime * streakServerTime;

          this$0.longTermData[this$0.longTermDataNextIndex]
            = [streakTravelTime, streakClientTime, streakServerTime,
               streakClientSquaredTime, streakClientServerTime];
          this$0.longTermDataNextIndex = (++this$0.longTermDataNextIndex) % this$0.longTermDataLength;

          if(this$0.status === 'startup'
             || (this$0.status === 'training'
                 && this$0.longTermData.length < this$0.longTermDataTrainingLength) ) {
            this$0.status = 'training';
            // set only the phase offset, not the frequency
            this$0.serverTimeReference = this$0.timeOffset;
            this$0.clientTimeReference = 0;
            this$0.frequencyRatio = 1;
            debug('T = %s + %s * (%s - %s) = %s',
                  this$0.serverTimeReference, this$0.frequencyRatio,
                  streakClientTime, this$0.clientTimeReference,
                  this$0.getSyncTime(streakClientTime));
          }

          if((this$0.status === 'training' || this$0.status === 'sync')
             && this$0.longTermData.length >= this$0.longTermDataTrainingLength) {
            // linear regression, R = covariance(t,T) / variance(t)
            var regClientTime = mean(this$0.longTermData, 1);
            var regServerTime = mean(this$0.longTermData, 2);
            var regClientSquaredTime = mean(this$0.longTermData, 3);
            var regClientServerTime = mean(this$0.longTermData, 4);

            var covariance = regClientServerTime - regClientTime * regServerTime;
            var variance = regClientSquaredTime - regClientTime * regClientTime;
            if(variance > 0) {
              // update freq and shift
              this$0.frequencyRatio = covariance / variance;
              this$0.clientTimeReference = regClientTime;
              this$0.serverTimeReference = regServerTime;

              if(this$0.frequencyRatio > 0.999 && this$0.frequencyRatio < 1.001) {
                this$0.status = 'sync';
              } else {
                debug('clock frequency ratio out of sync: %s, training again',
                      this$0.frequencyRatio);
                // start the training again from the last streak
                this$0.status = 'training';
                this$0.serverTimeReference = this$0.timeOffset; // offset only
                this$0.clientTimeReference = 0;
                this$0.frequencyRatio = 1;

                this$0.longTermData[0]
                  = [streakTravelTime, streakClientTime, streakServerTime,
                     streakClientSquaredTime, streakClientServerTime];
                this$0.longTermData.length = 1;
                this$0.longTermDataNextIndex = 1;
              }
            }

            debug('T = %s + %s * (%s - %s) = %s',
                  this$0.serverTimeReference, this$0.frequencyRatio,
                  streakClientTime, this$0.clientTimeReference,
                  this$0.getSyncTime(streakClientTime) );
          }

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

  /**
   * Get local time, or convert a synchronized time to a local time.
   *
   * @param {Number} syncTime undefined to get local time
   * @returns {Number} local time, in seconds
   */
  proto$0.getLocalTime = function(syncTime) {
    if (typeof syncTime !== 'undefined') {
      // conversion: t(T) = t0 + (T - T0) / R
      return this.clientTimeReference
        + (syncTime - this.serverTimeReference) / this.frequencyRatio;
    } else {
      // read local clock
      return this.getTimeFunction();
    }
  };

  /**
   * Get Synchronized time, or convert a local time to a synchronized time.
   *
   * @param {Number} localTime undefined to get synchronized time
   * @returns {Number} synchronized time, in seconds.
   */
  proto$0.getSyncTime = function() {var localTime = arguments[0];if(localTime === void 0)localTime = this.getLocalTime();
    // always convert: T(t) = T0 + R * (t - t0)
    return this.serverTimeReference
      + this.frequencyRatio * (localTime - this.clientTimeReference);
  };
MIXIN$0(SyncClient.prototype,proto$0);proto$0=void 0;return SyncClient;})(EventEmitter);

module.exports = SyncClient;

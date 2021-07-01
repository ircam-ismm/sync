(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
'use strict';

var _stringify = require('babel-runtime/core-js/json/stringify');

var _stringify2 = _interopRequireDefault(_stringify);

var _sync = require('@ircam/sync');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var getTimeFunction = function getTimeFunction() {
  return performance.now() / 1000;
}; // import SyncClient from '@ircam/sync/client';


function init() {
  var url = window.location.origin.replace('http', 'ws');

  // init socket client
  var socket = new WebSocket(url);
  // init sync client
  var syncClient = new _sync.SyncClient(getTimeFunction);

  var $syncTime = document.querySelector('#sync-time');
  setInterval(function () {
    var syncTime = syncClient.getSyncTime();
    $syncTime.innerHTML = syncTime;
  }, 100);

  socket.addEventListener('open', function () {
    var sendFunction = function sendFunction(pingId, clientPingTime) {
      var request = [];
      request[0] = 0; // this is a ping
      request[1] = pingId;
      request[2] = clientPingTime;

      console.log('[ping] - id: %s, pingTime: %s', request[1], request[2]);

      socket.send((0, _stringify2.default)(request));
    };

    var receiveFunction = function receiveFunction(callback) {
      socket.addEventListener('message', function (e) {
        var response = JSON.parse(e.data);
        console.log(response);

        if (response[0] === 1) {
          // this is a pong
          var pingId = response[1];
          var clientPingTime = response[2];
          var serverPingTime = response[3];
          var serverPongTime = response[4];

          console.log('[pong] - id: %s, clientPingTime: %s, serverPingTime: %s, serverPongTime: %s', pingId, clientPingTime, serverPingTime, serverPongTime);

          callback(pingId, clientPingTime, serverPingTime, serverPongTime);
        }
      });
    };

    var $statusContainer = document.querySelector('#status');
    var statusFunction = function statusFunction(status) {
      $statusContainer.innerHTML = (0, _stringify2.default)(status, null, 2);
      console.log(status);
    };

    syncClient.start(sendFunction, receiveFunction, statusFunction);
  });

  socket.addEventListener('error', function (err) {
    return console.error(err.stack);
  });
  socket.addEventListener('close', function () {
    return console.log('socket closed');
  });
}

window.addEventListener('load', init);

},{"@ircam/sync":3,"babel-runtime/core-js/json/stringify":5}],2:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _debug = _interopRequireDefault(require("debug"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 * @fileOverview Estimation of a server time from a client time.
 *
 * @see {@link https://hal.archives-ouvertes.fr/hal-01304889v1}
 * Stabilisation added after the article.
 */
const log = (0, _debug.default)('sync'); ////// helpers

/**
 * Order min and max attributes.
 *
 * @private
 * @param {Object} that with min and max attributes
 * @returns {Object} with min and man attributes, swapped if that.min > that.max
 */

function orderMinMax(that) {
  if (typeof that !== 'undefined' && typeof that.min !== 'undefined' && typeof that.max !== 'undefined' && that.min > that.max) {
    const tmp = that.min;
    that.min = that.max;
    that.max = tmp;
  }

  return that;
}
/**
 * Mean over an array, selecting one dimension of the array values.
 *
 * @private
 * @param {Array.<Array.<Number>>} array
 * @param {Number} [dimension=0]
 * @returns {Number} mean
 */


function mean(array, dimension = 0) {
  return array.reduce((p, q) => p + q[dimension], 0) / array.length;
}
/**
 * Function used to sort long-term data, using first and second dimensions, in
 * that order.
 *
 * @private
 * @param {Array.<Number>} a
 * @param {Number.<Number>} b
 * @returns {Number} negative if a < b, positive if a > b, or 0
 */


function dataCompare(a, b) {
  return a[0] - b[0] || a[1] - b[1];
}
/**
 * @callback SyncClient~getTimeFunction
 * @return {Number} strictly monotonic, ever increasing, time in second. When
 *   possible the server code should define its own origin (i.e. `time=0`) in
 *   order to maximize the resolution of the clock for a long period of
 *   time. When `SyncServer~start` is called the clock should already be
 *   running (cf. `audioContext.currentTime` that needs user interaction to
 *   start)
 **/

/**
 * @callback SyncClient~sendFunction
 * @see {@link SyncServer~receiveFunction}
 * @param {Number} pingId unique identifier
 * @param {Number} clientPingTime time-stamp of ping emission
 **/

/**
 * @callback SyncClient~receiveFunction
 * @see {@link SyncServer~sendFunction}
 * @param {SyncClient~receiveCallback} receiveCallback called on each message
 *   matching messageType.
 **/

/**
 * @callback SyncClient~receiveCallback
 * @param {Number} pingId unique identifier
 * @param {Number} clientPingTime time-stamp of ping emission
 * @param {Number} serverPingTime time-stamp of ping reception
 * @param {Number} serverPongTime time-stamp of pong emission
 **/

/**
 * @callback SyncClient~reportFunction
 * @param {Object} report
 * @param {String} report.status `new`, `startup`, `training` (offset
 *   adaptation), or `sync` (offset and speed adaptation).
 * @param {Number} report.statusDuration duration since last status
 *   change.
 * @param {Number} report.timeOffset time difference between local time and
 *   sync time, in seconds.
 * @param {Number} report.frequencyRatio time ratio between local
 *   time and sync time.
 * @param {String} report.connection `offline` or `online`
 * @param {Number} report.connectionDuration duration since last connection
 *   change.
 * @param {Number} report.connectionTimeOut duration, in seconds, before
 *   a time-out occurs.
 * @param {Number} report.travelDuration duration of a ping-pong round-trip,
 *   in seconds, mean over the the last ping-pong series.
 * @param {Number} report.travelDurationMin duration of a ping-pong
 *   round-trip, in seconds, minimum over the the last ping-pong series.
 * @param {Number} report.travelDurationMax duration of a ping-pong
 *   round-trip, in seconds, maximum over the the last ping-pong series.
 **/

/**
 * `SyncClient` instances synchronize to the clock provided
 * by the {@link SyncServer} instance. The default estimation behavior is
 * strictly monotonic and guarantee a unique convertion from server time
 * to local time.
 *
 * @see {@link SyncClient~start} method to actually start a synchronisation
 * process.
 *
 * @param {SyncClient~getTimeFunction} getTimeFunction
 * @param {Object} [options]
 * @param {Object} [options.pingTimeOutDelay] range of duration (in seconds)
 *   to consider a ping was not ponged back
 * @param {Number} [options.pingTimeOutDelay.min=1] min and max must be set
 *   together
 * @param {Number} [options.pingTimeOutDelay.max=30] min and max must be set
 *   together
 * @param {Number} [options.pingSeriesIterations=10] number of ping-pongs in a
 *   series
 * @param {Number} [options.pingSeriesPeriod=0.250] interval (in seconds)
 *   between pings in a series
 * @param {Number} [options.pingSeriesDelay] range of interval (in seconds)
 *   between ping-pong series
 * @param {Number} [options.pingSeriesDelay.min=10] min and max must be set
 *   together
 * @param {Number} [options.pingSeriesDelay.max=20] min and max must be set
 *   together
 * @param {Number} [options.longTermDataTrainingDuration=120] duration of
 *   training, in seconds, approximately, before using the estimate of clock
 *   frequency
 * @param {Number} [options.longTermDataDuration=900] estimate synchronisation over
 *   this duration, in seconds, approximately
 * @param {Boolean} [options.estimationMonotonicity=true] When `true`, the
 *   estimation of the server time is strictly monotonic, and the maximum
 *   instability of the estimated server time is then limited to
 *   `options.estimationStability`.
 * @param {Number} [options.estimationStability=160e-6] This option applies
 *   only when `options.estimationMonotonicity` is true. The adaptation to the
 *   estimated server time is then limited by this positive value. 80e-6 (80
 *   parts per million, PPM) is quite stable, and corresponds to the stability
 *   of a conventional clock. 160e-6 is moderately adaptive, and corresponds
 *   to the relative stability of 2 clocks; 500e-6 is quite adaptive, it
 *   compensates 5 milliseconds in 1 second. It is the maximum value
 *   (estimationStability must be lower than 500e-6).
 */


class SyncClient {
  constructor(getTimeFunction, options = {}) {
    /**
     * The minimum stability serves several purposes:
     *
     * 1. The estimation process will restart if the estimated server time
     * reaches or exceeds this value.
     * 2. The adaptation of a new estimation (after a ping-pong series) is also
     * limited to this value.
     * 3. Given 1. and 2., this ensures that the estimation is strictly
     * monotonic.
     * 4. Given 3., the conversion from server time to local time is unique.
     *
     * @private
     * @constant {Number}
     * @value 500e-6 is 500 PPM, like an old mechanical clock
     * @static
     */
    SyncClient.minimumStability = 500e-6;
    this.estimationMonotonicity = typeof options.estimationMonotonicity !== 'undefined' ? options.estimationMonotonicity : true;
    this.estimationStability = options.estimationStability || 160e-6;
    this.estimationStability = Math.max(0, Math.min(SyncClient.minimumStability, this.estimationStability));
    this.pingTimeoutDelay = options.pingTimeoutDelay || {
      min: 1,
      max: 30
    };
    orderMinMax(this.pingTimeoutDelay);
    this.pingSeriesIterations = options.pingSeriesIterations || 10;
    this.pingSeriesPeriod = typeof options.pingSeriesPeriod !== 'undefined' ? options.pingSeriesPeriod : 0.250;
    this.pingSeriesDelay = options.pingSeriesDelay || {
      min: 10,
      max: 20
    };
    orderMinMax(this.pingSeriesDelay);
    this.pingDelay = 0; // current delay before next ping

    this.timeoutId = 0; // to cancel timeout on pong

    this.pingId = 0; // absolute ID to mach pong against

    this.pingSeriesCount = 0; // elapsed pings in a series

    this.seriesData = []; // circular buffer

    this.seriesDataNextIndex = 0; // next index to write in circular buffer

    this.seriesDataLength = this.pingSeriesIterations; // size of circular buffer

    this.longTermDataTrainingDuration = options.longTermDataTrainingDuration || 120; // use a fixed-size circular buffer, even if it does not match
    // exactly the required duration

    this.longTermDataDuration = options.longTermDataDuration || 900;
    this.longTermDataLength = Math.max(2, this.longTermDataDuration / (0.5 * (this.pingSeriesDelay.min + this.pingSeriesDelay.max)));
    this.longTermData = []; // circular buffer

    this.longTermDataNextIndex = 0; // next index to write in circular buffer

    this.timeOffset = 0; // mean of (serverTime - clientTime) in the last series

    this.travelDuration = 0;
    this.travelDurationMin = 0;
    this.travelDurationMax = 0; // T(t) = T0 + R * (t - t0)
    // t(T) = t0 + (T - T0) / R

    this.serverTimeReference = 0; // T0

    this.clientTimeReference = 0; // t0

    this.frequencyRatio = 1; // R
    // For the first estimation, S = T and s = t

    this._stabilisationReset();

    this.pingTimeoutDelay.current = this.pingTimeoutDelay.min;
    this.getTimeFunction = getTimeFunction;
    this.status = 'new';
    this.statusChangedTime = 0;
    this.connectionStatus = 'offline';
    this.connectionStatusChangedTime = 0;
  }
  /**
   * Set status, and set this.statusChangedTime, to later
   * use see {@link SyncClient~getStatusDuration}
   * and {@link SyncClient~reportStatus}.
   *
   * @private
   * @param {String} status
   * @returns {Object} this
   */


  setStatus(status) {
    if (status !== this.status) {
      this.status = status;
      this.statusChangedTime = this.getLocalTime();
    }

    return this;
  }
  /**
   * Get time since last status change. See {@link SyncClient~setStatus}
   *
   * @private
   * @returns {Number} time, in seconds, since last status change.
   */


  getStatusDuration() {
    return Math.max(0, this.getLocalTime() - this.statusChangedTime);
  }
  /**
   * Set connectionStatus, and set this.connectionStatusChangedTime, to later
   * use {@link SyncClient~getConnectionStatusDuration} and
   * {@link SyncClient~reportStatus}.
   *
   * @private
   * @param {String} connectionStatus
   * @returns {Object} this
   */


  setConnectionStatus(connectionStatus) {
    if (connectionStatus !== this.connectionStatus) {
      this.connectionStatus = connectionStatus;
      this.connectionStatusChangedTime = this.getLocalTime();
    }

    return this;
  }
  /**
   * Get time since last connectionStatus change.
   * See {@link SyncClient~setConnectionStatus}
   *
   * @private
   * @returns {Number} time, in seconds, since last connectionStatus change.
   */


  getConnectionStatusDuration() {
    return Math.max(0, this.getLocalTime() - this.connectionStatusChangedTime);
  }
  /**
   * Report the status of the synchronisation process, if reportFunction is
   * defined. It is called each time the estimation of the synchronised time
   * updates.
   *
   * @private
   * @param {SyncClient~reportFunction} reportFunction
   */


  reportStatus(reportFunction) {
    if (typeof reportFunction !== 'undefined') {
      reportFunction({
        status: this.status,
        statusDuration: this.getStatusDuration(),
        timeOffset: this.timeOffset,
        frequencyRatio: this.frequencyRatio,
        connection: this.connectionStatus,
        connectionDuration: this.getConnectionStatusDuration(),
        connectionTimeOut: this.pingTimeoutDelay.current,
        travelDuration: this.travelDuration,
        travelDurationMin: this.travelDurationMin,
        travelDurationMax: this.travelDurationMax
      });
    }
  }
  /**
   * Process to send ping messages.
   *
   * @private
   * @param {SyncClient~sendFunction} sendFunction
   * @param {SyncClient~reportFunction} reportFunction
   */


  __syncLoop(sendFunction, reportFunction) {
    clearTimeout(this.timeoutId);
    ++this.pingId;
    sendFunction(this.pingId, this.getLocalTime());
    this.timeoutId = setTimeout(() => {
      // increase timeout duration on timeout, to avoid overflow
      this.pingTimeoutDelay.current = Math.min(this.pingTimeoutDelay.current * 2, this.pingTimeoutDelay.max); // log('sync:ping timeout > %s', this.pingTimeoutDelay.current);

      this.setConnectionStatus('offline');
      this.reportStatus(reportFunction); // retry (yes, always increment pingId)

      this.__syncLoop(sendFunction, reportFunction);
    }, Math.ceil(1000 * this.pingTimeoutDelay.current));
  }
  /**
   * Start a synchronisation process by registering the receive
   * function passed as second parameter. Then, send regular messages
   * to the server, using the send function passed as first parameter.
   *
   * @param {SyncClient~sendFunction} sendFunction
   * @param {SyncClient~receiveFunction} receiveFunction to register
   * @param {SyncClient~reportFunction} reportFunction if defined, is called to
   *   report the status, on each status change, and each time the estimation of
   *   the synchronised time updates.
   */


  start(sendFunction, receiveFunction, reportFunction) {
    this.setStatus('startup');
    this.setConnectionStatus('offline');
    this.seriesData = [];
    this.seriesDataNextIndex = 0;
    this.longTermData = [];
    this.longTermDataNextIndex = 0;
    receiveFunction((pingId, clientPingTime, serverPingTime, serverPongTime) => {
      // accept only the pong that corresponds to the last ping
      if (pingId === this.pingId) {
        ++this.pingSeriesCount;
        clearTimeout(this.timeoutId);
        this.setConnectionStatus('online'); // reduce timeout duration on pong, for better reactivity

        this.pingTimeoutDelay.current = Math.max(this.pingTimeoutDelay.current * 0.75, this.pingTimeoutDelay.min); // time-differences are valid on a single-side only (client or server)

        const clientPongTime = this.getLocalTime();
        const clientTime = 0.5 * (clientPongTime + clientPingTime);
        const serverTime = 0.5 * (serverPongTime + serverPingTime);
        const travelDuration = Math.max(0, clientPongTime - clientPingTime - (serverPongTime - serverPingTime));
        const offsetTime = serverTime - clientTime; // order is important for sorting, later.

        this.seriesData[this.seriesDataNextIndex] = [travelDuration, offsetTime, clientTime, serverTime];
        this.seriesDataNextIndex = ++this.seriesDataNextIndex % this.seriesDataLength; // log('ping %s, travel = %s, offset = %s, client = %s, server = %s',
        //     pingId, travelDuration, offsetTime, clientTime, serverTime);
        // end of a series

        if (this.pingSeriesCount >= this.pingSeriesIterations && this.seriesData.length >= this.seriesDataLength) {
          // plan the begining of the next series
          this.pingDelay = this.pingSeriesDelay.min + Math.random() * (this.pingSeriesDelay.max - this.pingSeriesDelay.min);
          this.pingSeriesCount = 0; // sort by travel time first, then offset time.

          const sorted = this.seriesData.slice(0).sort(dataCompare);
          const seriesTravelDuration = sorted[0][0]; // When the clock tick is long enough,
          // some travel times (dimension 0) might be identical.
          // Then, use the offset median (dimension 1 is the second sort key)
          // of shortest travel duration

          let quick = 0;

          while (quick < sorted.length && sorted[quick][0] <= seriesTravelDuration * 1.01) {
            ++quick;
          }

          quick = Math.max(0, quick - 1);
          const median = Math.floor(quick / 2);
          const seriesClientTime = sorted[median][2];
          const seriesServerTime = sorted[median][3];
          const seriesClientSquaredTime = seriesClientTime * seriesClientTime;
          const seriesClientServerTime = seriesClientTime * seriesServerTime;
          this.longTermData[this.longTermDataNextIndex] = [seriesTravelDuration, seriesClientTime, seriesServerTime, seriesClientSquaredTime, seriesClientServerTime];
          this.longTermDataNextIndex = ++this.longTermDataNextIndex % this.longTermDataLength; // mean of the time offset over 3 samples around median
          // (limited to shortest travel duration)

          const aroundMedian = sorted.slice(Math.max(0, median - 1), Math.min(quick, median + 1) + 1);
          this.timeOffset = mean(aroundMedian, 1);
          const updateClientTime = this.getLocalTime();
          const updateServerTimeBefore = this.getSyncTime(updateClientTime);

          if (this.status === 'startup' || this.status === 'training' && this.getStatusDuration() < this.longTermDataTrainingDuration) {
            // set only the phase offset, not the frequency
            this.serverTimeReference = this.timeOffset;
            this.clientTimeReference = 0;
            this.frequencyRatio = 1;

            if (this.status !== 'startup') {
              // no stabilisation on startup
              this._stabilisationUpdate(updateClientTime, updateServerTimeBefore);
            }

            this.setStatus('training');
            log('T = %s + %s * (%s - %s) = %s', this.serverTimeReference, this.frequencyRatio, seriesClientTime, this.clientTimeReference, this.getSyncTime(seriesClientTime));
          }

          if (this.status === 'training' && this.getStatusDuration() >= this.longTermDataTrainingDuration || this.status === 'sync') {
            // linear regression, R = covariance(t,T) / variance(t)
            const regClientTime = mean(this.longTermData, 1);
            const regServerTime = mean(this.longTermData, 2);
            const regClientSquaredTime = mean(this.longTermData, 3);
            const regClientServerTime = mean(this.longTermData, 4);
            const covariance = regClientServerTime - regClientTime * regServerTime;
            const variance = regClientSquaredTime - regClientTime * regClientTime;

            if (variance > 0) {
              // update freq and shift
              this.frequencyRatio = covariance / variance;
              this.clientTimeReference = regClientTime;
              this.serverTimeReference = regServerTime; // exclude bounds, to ensure strict monotonicity

              if (this.frequencyRatio > 1 - SyncClient.minimumStability && this.frequencyRatio < 1 + SyncClient.minimumStability) {
                this.setStatus('sync');

                this._stabilisationUpdate(updateClientTime, updateServerTimeBefore);
              } else {
                log('clock frequency ratio out of sync: %s, training again', this.frequencyRatio); // start the training again from the last series

                this.serverTimeReference = this.timeOffset; // offset only

                this.clientTimeReference = 0;
                this.frequencyRatio = 1;

                this._stabilisationReset();

                this.setStatus('training');
                this.longTermData[0] = [seriesTravelDuration, seriesClientTime, seriesServerTime, seriesClientSquaredTime, seriesClientServerTime];
                this.longTermData.length = 1;
                this.longTermDataNextIndex = 1;
              }
            }

            log('T = %s + %s * (%s - %s) = %s', this.serverTimeReference, this.frequencyRatio, seriesClientTime, this.clientTimeReference, this.getSyncTime(seriesClientTime));
          }

          this.travelDuration = mean(sorted, 0);
          this.travelDurationMin = sorted[0][0];
          this.travelDurationMax = sorted[sorted.length - 1][0];
          this.reportStatus(reportFunction);
        } else {
          // we are in a series, use the pingInterval value
          this.pingDelay = this.pingSeriesPeriod;
        }

        this.timeoutId = setTimeout(() => {
          this._syncLoop(sendFunction, reportFunction);
        }, Math.ceil(1000 * this.pingDelay));
      } // ping and pong ID match

    }); // receive function

    this._syncLoop(sendFunction, reportFunction);
  }
  /**
   * Get local time, or convert a synchronised time to a local time.
   *
   * @param {Number} [syncTime=undefined] - Get local time according to given
   *  given `syncTime`, if `syncTime` is not defined returns current local time.
   * @returns {Number} local time, in seconds
   */


  getLocalTime(syncTime) {
    if (typeof syncTime === 'undefined') {
      // read t from local clock
      return this.getTimeFunction();
    } else {
      // S, stabilised sync time
      let T = syncTime;

      if (this.estimationMonotonicity && T < this.stabilisationServerTimeEnd) {
        // remove stabilisation before conversion
        // S -> T
        const Sss = Math.max(this.stabilisationServerTimeStart, T);
        const stabilisation = this.stabilisationOffset * (this.stabilisationServerTimeEnd - Sss) / (this.stabilisationServerTimeEnd - this.stabilisationServerTimeStart);
        T -= stabilisation;
      } // conversion: t(T) = t0 + (T - T0) / R
      // T -> t


      return this.clientTimeReference + (T - this.serverTimeReference) / this.frequencyRatio;
    }
  }
  /**
   * Get synchronised time, or convert a local time to a synchronised time.
   *
   * @param {Number} [localTime=undefined] - Get sync time according to given
   *  given `localTime`, if `localTime` is not defined returns current sync time.
   * @returns {Number} synchronised time, in seconds.
   */


  getSyncTime(localTime = this.getLocalTime()) {
    // always convert: T(t) = T0 + R * (t - t0)
    // t -> T
    let T = this.serverTimeReference + this.frequencyRatio * (localTime - this.clientTimeReference);

    if (this.estimationMonotonicity && localTime < this.stabilisationClientTimeEnd) {
      const t = Math.max(this.stabilisationClientTimeStart, localTime); // add stabilisation after conversion
      // T -> S

      const stabilisation = this.stabilisationOffset * (this.stabilisationClientTimeEnd - t) / (this.stabilisationClientTimeEnd - this.stabilisationClientTimeStart);
      T += stabilisation;
    }

    return T;
  }
  /**
   * Process to send ping messages.
   *
   * @private
   * @param {SyncClient~sendFunction} sendFunction
   * @param {SyncClient~reportFunction} reportFunction
   */


  _syncLoop(sendFunction, reportFunction) {
    clearTimeout(this.timeoutId);
    ++this.pingId;
    sendFunction(this.pingId, this.getLocalTime());
    this.timeoutId = setTimeout(() => {
      // increase timeout duration on timeout, to avoid overflow
      this.pingTimeoutDelay.current = Math.min(this.pingTimeoutDelay.current * 2, this.pingTimeoutDelay.max);
      log('sync:ping timeout > %s', this.pingTimeoutDelay.current);
      this.setConnectionStatus('offline');
      this.reportStatus(reportFunction); // retry (yes, always increment pingId)

      this._syncLoop(sendFunction, reportFunction);
    }, Math.ceil(1000 * this.pingTimeoutDelay.current));
  }
  /**
   * @private
   */


  _stabilisationReset() {
    // To stabilise the estimation of synchronised time, compensate the
    // difference of the last estimation of the server time to the current
    // one. The compensation is full at the start time (and before), and 0 at
    // the end time (and after).
    this.stabilisationOffset = 0; // So, full compensation
    // S(t) = T(t) + So * (tse - t) / (tse - tss) , with t in ]tss, tse[
    // S(t) = T(t) + So, with t <= tss
    // S(t) = T(t), with t >= tse

    this.stabilisationClientTimeStart = -Infinity; // tss

    this.stabilisationClientTimeEnd = -Infinity; // tse
    // t(T) = t(S - So * (Sse - S) / (Sse - Sss)), with S in ]Sss, Sse[
    // t(T) = t(S - So), with S <= Sss
    // t(T) = t(S)
    // stabilised times, not direct server times

    this.stabilisationServerTimeStart = -Infinity; // Sss

    this.stabilisationServerTimeEnd = -Infinity; // Sse
  }
  /**
   * This function must be called after synchronisation parameters updated, to
   * update stabilisation parameters.
   *
   * @private
   * @param {Number} updateClientTime local time when synchronisation updated
   * @param {Number} updateServerTimeBefore estimated server time just before
   *   synchronisation update (with old parameters)
   */


  _stabilisationUpdate(updateClientTime, updateServerTimeBefore) {
    if (!this.estimationMonotonicity || this.status === 'startup') {
      // no stabilisation on startup
      return;
    } // estimated server time just after synchronisation update
    // with new parameters and without stabilisation (yet)


    this._stabilisationReset();

    const updateServerTimeAfter = this.getSyncTime(updateClientTime); // So is a compensation added to syncTime

    this.stabilisationOffset = updateServerTimeBefore - updateServerTimeAfter; // tss

    this.stabilisationClientTimeStart = updateClientTime; // tse

    this.stabilisationClientTimeEnd = Math.abs(updateServerTimeBefore - updateServerTimeAfter) / this.estimationStability + this.stabilisationClientTimeStart; // Full compensation at Sss, to match new server time wit new one
    // Sss = Tss + So

    this.stabilisationServerTimeStart = updateServerTimeBefore; // Sse
    // No compensation for S >= Sse
    // As getSyncTime does _not_ use stabilisation server times,
    // the next call is possible to bootstrap getLocalTime

    this.stabilisationServerTimeEnd = this.getSyncTime(this.stabilisationClientTimeEnd);
    log('stabilisation updated', 'So = ', this.stabilisationOffset, ',', 'tss = ', this.stabilisationClientTimeStart, ',', 'tse = ', this.stabilisationClientTimeEnd, ',', 'Sss = ', this.stabilisationServerTimeStart, ',', 'Sse = ', this.stabilisationServerTimeEnd, ',', 'Tbefore = ', updateServerTimeBefore, ',', 'Tafter = ', updateServerTimeAfter);
  }

}

var _default = SyncClient;
exports.default = _default;
},{"debug":9}],3:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SyncServer = exports.SyncClient = exports.default = void 0;

var _index = _interopRequireDefault(require("./client/index.js"));

var _index2 = _interopRequireDefault(require("./server/index.js"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// support explicit default and named import
// cf. https://ircam-ismm.github.io/javascript/javascript-guidelines.html#supported-syntaxes
// @note:
// the odd file structure aims at supporting imports in old applications :
// ```
// import SyncServer from '@ircam/sync/server';
// ```
// and the most recent one
// ```
// import { SyncServer } from '@ircam/sync
// ```
//
// consider making this more simple and release a major version
//
var _default = {
  SyncClient: _index.default,
  SyncServer: _index2.default
};
exports.default = _default;
const SyncClient = _index.default;
exports.SyncClient = SyncClient;
const SyncServer = _index2.default;
exports.SyncServer = SyncServer;
},{"./client/index.js":2,"./server/index.js":4}],4:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _debug = _interopRequireDefault(require("debug"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const log = (0, _debug.default)('sync');
/**
 * @callback SyncServer~getTimeFunction
 * @return {Number} monotonic, ever increasing, time in second. When possible
 *  the server code should define its own origin (i.e. `time=0`) in order to
 *  maximize the resolution of the clock for a long period of time. When
 *  `SyncServer~start` is called the clock should be running
 *  (cf. `audioContext.currentTime` that needs user interaction to start)
 *
 * @example
 * const startTime = process.hrtime();
 *
 * const getTimeFunction = () => {
 *   const now = process.hrtime(startTime);
 *   return now[0] + now[1] * 1e-9;
 * };
 **/

/**
 * @callback SyncServer~sendFunction
 * @see {@link SyncClient~receiveFunction}
 * @param {Number} pingId unique identifier
 * @param {Number} clientPingTime time-stamp of ping emission
 * @param {Number} serverPingTime time-stamp of ping reception
 * @param {Number} serverPongTime time-stamp of pong emission
 **/

/**
 * @callback SyncServer~receiveFunction
 * @see {@link SyncClient~sendFunction}
 * @param {SyncServer~receiveCallback} receiveCallback called on
 * each message matching messageType.
 **/

/**
 * @callback SyncServer~receiveCallback
 * @param {Number} pingId unique identifier
 * @param {Number} clientPingTime time-stamp of ping emission
 **/

/**
 * The `SyncServer` instance provides a clock on which {@link SyncClient}
 * instances synchronize.
 *
 * @see {@link SyncServer~start} method to
 * actually start a synchronisation process.
 *
 * @param {SyncServer~getTimeFunction} function called to get the local
 * time. It must return a time in seconds, monotonic, ever increasing.
 */

class SyncServer {
  constructor(getTimeFunction) {
    this.getTimeFunction = getTimeFunction;
  }
  /**
   * Start a synchronisation process with a `SyncClient` by registering the
   * receive function passed as second parameter. On each received message,
   * send a reply using the function passed as first parameter.
   *
   * @param {SyncServer~sendFunction} sendFunction
   * @param {SyncServer~receiveFunction} receiveFunction
   */


  start(sendFunction, receiveFunction) {
    receiveFunction((id, clientPingTime) => {
      const serverPingTime = this.getLocalTime(); // with this algorithm, the dual call to `getLocalTime` can appear
      // non-necessary, however keeping this can allow to implement other
      // algorithms while keeping the API unchanged, thus making easier
      // to implement and compare several algorithms.

      sendFunction(id, clientPingTime, serverPingTime, this.getLocalTime()); // log('ping: %s, %s, %s', id, clientPingTime, serverPingTime);
    }); // return some handle that would allow to clean memory ?
  }
  /**
   * Get local time, or convert a synchronised time to a local time.
   *
   * @note `getLocalTime` and `getSyncTime` are basically aliases on the server.
   *
   * @param {Number} [syncTime=undefined] - Get local time according to given
   *  given `syncTime`, if `syncTime` is not defined returns current local time.
   * @returns {Number} local time, in seconds
   */


  getLocalTime(syncTime) {
    if (typeof syncTime !== 'undefined') {
      return syncTime; // sync time is local: no conversion
    } else {
      return this.getTimeFunction();
    }
  }
  /**
   * Get synchronised time, or convert a local time to a synchronised time.
   *
   * @note `getLocalTime` and `getSyncTime` are basically aliases on the server.
   *
   * @param {Number} [localTime=undefined] - Get sync time according to given
   *  given `localTime`, if `localTime` is not defined returns current sync time.
   * @returns {Number} synchronised time, in seconds.
   */


  getSyncTime(localTime) {
    return this.getLocalTime(localTime); // sync time is local, here
  }

}

var _default = SyncServer;
exports.default = _default;
},{"debug":9}],5:[function(require,module,exports){
module.exports = { "default": require("core-js/library/fn/json/stringify"), __esModule: true };
},{"core-js/library/fn/json/stringify":6}],6:[function(require,module,exports){
var core = require('../../modules/_core');
var $JSON = core.JSON || (core.JSON = { stringify: JSON.stringify });
module.exports = function stringify(it) { // eslint-disable-line no-unused-vars
  return $JSON.stringify.apply($JSON, arguments);
};

},{"../../modules/_core":7}],7:[function(require,module,exports){
var core = module.exports = { version: '2.6.12' };
if (typeof __e == 'number') __e = core; // eslint-disable-line no-undef

},{}],8:[function(require,module,exports){
/**
 * Helpers.
 */

var s = 1000;
var m = s * 60;
var h = m * 60;
var d = h * 24;
var w = d * 7;
var y = d * 365.25;

/**
 * Parse or format the given `val`.
 *
 * Options:
 *
 *  - `long` verbose formatting [false]
 *
 * @param {String|Number} val
 * @param {Object} [options]
 * @throws {Error} throw an error if val is not a non-empty string or a number
 * @return {String|Number}
 * @api public
 */

module.exports = function(val, options) {
  options = options || {};
  var type = typeof val;
  if (type === 'string' && val.length > 0) {
    return parse(val);
  } else if (type === 'number' && isFinite(val)) {
    return options.long ? fmtLong(val) : fmtShort(val);
  }
  throw new Error(
    'val is not a non-empty string or a valid number. val=' +
      JSON.stringify(val)
  );
};

/**
 * Parse the given `str` and return milliseconds.
 *
 * @param {String} str
 * @return {Number}
 * @api private
 */

function parse(str) {
  str = String(str);
  if (str.length > 100) {
    return;
  }
  var match = /^(-?(?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i.exec(
    str
  );
  if (!match) {
    return;
  }
  var n = parseFloat(match[1]);
  var type = (match[2] || 'ms').toLowerCase();
  switch (type) {
    case 'years':
    case 'year':
    case 'yrs':
    case 'yr':
    case 'y':
      return n * y;
    case 'weeks':
    case 'week':
    case 'w':
      return n * w;
    case 'days':
    case 'day':
    case 'd':
      return n * d;
    case 'hours':
    case 'hour':
    case 'hrs':
    case 'hr':
    case 'h':
      return n * h;
    case 'minutes':
    case 'minute':
    case 'mins':
    case 'min':
    case 'm':
      return n * m;
    case 'seconds':
    case 'second':
    case 'secs':
    case 'sec':
    case 's':
      return n * s;
    case 'milliseconds':
    case 'millisecond':
    case 'msecs':
    case 'msec':
    case 'ms':
      return n;
    default:
      return undefined;
  }
}

/**
 * Short format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function fmtShort(ms) {
  var msAbs = Math.abs(ms);
  if (msAbs >= d) {
    return Math.round(ms / d) + 'd';
  }
  if (msAbs >= h) {
    return Math.round(ms / h) + 'h';
  }
  if (msAbs >= m) {
    return Math.round(ms / m) + 'm';
  }
  if (msAbs >= s) {
    return Math.round(ms / s) + 's';
  }
  return ms + 'ms';
}

/**
 * Long format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function fmtLong(ms) {
  var msAbs = Math.abs(ms);
  if (msAbs >= d) {
    return plural(ms, msAbs, d, 'day');
  }
  if (msAbs >= h) {
    return plural(ms, msAbs, h, 'hour');
  }
  if (msAbs >= m) {
    return plural(ms, msAbs, m, 'minute');
  }
  if (msAbs >= s) {
    return plural(ms, msAbs, s, 'second');
  }
  return ms + ' ms';
}

/**
 * Pluralization helper.
 */

function plural(ms, msAbs, n, name) {
  var isPlural = msAbs >= n * 1.5;
  return Math.round(ms / n) + ' ' + name + (isPlural ? 's' : '');
}

},{}],9:[function(require,module,exports){
(function (process){(function (){
/* eslint-env browser */

/**
 * This is the web browser implementation of `debug()`.
 */

exports.formatArgs = formatArgs;
exports.save = save;
exports.load = load;
exports.useColors = useColors;
exports.storage = localstorage();
exports.destroy = (() => {
	let warned = false;

	return () => {
		if (!warned) {
			warned = true;
			console.warn('Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.');
		}
	};
})();

/**
 * Colors.
 */

exports.colors = [
	'#0000CC',
	'#0000FF',
	'#0033CC',
	'#0033FF',
	'#0066CC',
	'#0066FF',
	'#0099CC',
	'#0099FF',
	'#00CC00',
	'#00CC33',
	'#00CC66',
	'#00CC99',
	'#00CCCC',
	'#00CCFF',
	'#3300CC',
	'#3300FF',
	'#3333CC',
	'#3333FF',
	'#3366CC',
	'#3366FF',
	'#3399CC',
	'#3399FF',
	'#33CC00',
	'#33CC33',
	'#33CC66',
	'#33CC99',
	'#33CCCC',
	'#33CCFF',
	'#6600CC',
	'#6600FF',
	'#6633CC',
	'#6633FF',
	'#66CC00',
	'#66CC33',
	'#9900CC',
	'#9900FF',
	'#9933CC',
	'#9933FF',
	'#99CC00',
	'#99CC33',
	'#CC0000',
	'#CC0033',
	'#CC0066',
	'#CC0099',
	'#CC00CC',
	'#CC00FF',
	'#CC3300',
	'#CC3333',
	'#CC3366',
	'#CC3399',
	'#CC33CC',
	'#CC33FF',
	'#CC6600',
	'#CC6633',
	'#CC9900',
	'#CC9933',
	'#CCCC00',
	'#CCCC33',
	'#FF0000',
	'#FF0033',
	'#FF0066',
	'#FF0099',
	'#FF00CC',
	'#FF00FF',
	'#FF3300',
	'#FF3333',
	'#FF3366',
	'#FF3399',
	'#FF33CC',
	'#FF33FF',
	'#FF6600',
	'#FF6633',
	'#FF9900',
	'#FF9933',
	'#FFCC00',
	'#FFCC33'
];

/**
 * Currently only WebKit-based Web Inspectors, Firefox >= v31,
 * and the Firebug extension (any Firefox version) are known
 * to support "%c" CSS customizations.
 *
 * TODO: add a `localStorage` variable to explicitly enable/disable colors
 */

// eslint-disable-next-line complexity
function useColors() {
	// NB: In an Electron preload script, document will be defined but not fully
	// initialized. Since we know we're in Chrome, we'll just detect this case
	// explicitly
	if (typeof window !== 'undefined' && window.process && (window.process.type === 'renderer' || window.process.__nwjs)) {
		return true;
	}

	// Internet Explorer and Edge do not support colors.
	if (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/(edge|trident)\/(\d+)/)) {
		return false;
	}

	// Is webkit? http://stackoverflow.com/a/16459606/376773
	// document is undefined in react-native: https://github.com/facebook/react-native/pull/1632
	return (typeof document !== 'undefined' && document.documentElement && document.documentElement.style && document.documentElement.style.WebkitAppearance) ||
		// Is firebug? http://stackoverflow.com/a/398120/376773
		(typeof window !== 'undefined' && window.console && (window.console.firebug || (window.console.exception && window.console.table))) ||
		// Is firefox >= v31?
		// https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
		(typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/) && parseInt(RegExp.$1, 10) >= 31) ||
		// Double check webkit in userAgent just in case we are in a worker
		(typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/));
}

/**
 * Colorize log arguments if enabled.
 *
 * @api public
 */

function formatArgs(args) {
	args[0] = (this.useColors ? '%c' : '') +
		this.namespace +
		(this.useColors ? ' %c' : ' ') +
		args[0] +
		(this.useColors ? '%c ' : ' ') +
		'+' + module.exports.humanize(this.diff);

	if (!this.useColors) {
		return;
	}

	const c = 'color: ' + this.color;
	args.splice(1, 0, c, 'color: inherit');

	// The final "%c" is somewhat tricky, because there could be other
	// arguments passed either before or after the %c, so we need to
	// figure out the correct index to insert the CSS into
	let index = 0;
	let lastC = 0;
	args[0].replace(/%[a-zA-Z%]/g, match => {
		if (match === '%%') {
			return;
		}
		index++;
		if (match === '%c') {
			// We only are interested in the *last* %c
			// (the user may have provided their own)
			lastC = index;
		}
	});

	args.splice(lastC, 0, c);
}

/**
 * Invokes `console.debug()` when available.
 * No-op when `console.debug` is not a "function".
 * If `console.debug` is not available, falls back
 * to `console.log`.
 *
 * @api public
 */
exports.log = console.debug || console.log || (() => {});

/**
 * Save `namespaces`.
 *
 * @param {String} namespaces
 * @api private
 */
function save(namespaces) {
	try {
		if (namespaces) {
			exports.storage.setItem('debug', namespaces);
		} else {
			exports.storage.removeItem('debug');
		}
	} catch (error) {
		// Swallow
		// XXX (@Qix-) should we be logging these?
	}
}

/**
 * Load `namespaces`.
 *
 * @return {String} returns the previously persisted debug modes
 * @api private
 */
function load() {
	let r;
	try {
		r = exports.storage.getItem('debug');
	} catch (error) {
		// Swallow
		// XXX (@Qix-) should we be logging these?
	}

	// If debug isn't set in LS, and we're in Electron, try to load $DEBUG
	if (!r && typeof process !== 'undefined' && 'env' in process) {
		r = process.env.DEBUG;
	}

	return r;
}

/**
 * Localstorage attempts to return the localstorage.
 *
 * This is necessary because safari throws
 * when a user disables cookies/localstorage
 * and you attempt to access it.
 *
 * @return {LocalStorage}
 * @api private
 */

function localstorage() {
	try {
		// TVMLKit (Apple TV JS Runtime) does not have a window object, just localStorage in the global context
		// The Browser also has localStorage in the global context.
		return localStorage;
	} catch (error) {
		// Swallow
		// XXX (@Qix-) should we be logging these?
	}
}

module.exports = require('./common')(exports);

const {formatters} = module.exports;

/**
 * Map %j to `JSON.stringify()`, since no Web Inspectors do that by default.
 */

formatters.j = function (v) {
	try {
		return JSON.stringify(v);
	} catch (error) {
		return '[UnexpectedJSONParseError]: ' + error.message;
	}
};

}).call(this)}).call(this,require('_process'))

},{"./common":10,"_process":11}],10:[function(require,module,exports){

/**
 * This is the common logic for both the Node.js and web browser
 * implementations of `debug()`.
 */

function setup(env) {
	createDebug.debug = createDebug;
	createDebug.default = createDebug;
	createDebug.coerce = coerce;
	createDebug.disable = disable;
	createDebug.enable = enable;
	createDebug.enabled = enabled;
	createDebug.humanize = require('ms');
	createDebug.destroy = destroy;

	Object.keys(env).forEach(key => {
		createDebug[key] = env[key];
	});

	/**
	* The currently active debug mode names, and names to skip.
	*/

	createDebug.names = [];
	createDebug.skips = [];

	/**
	* Map of special "%n" handling functions, for the debug "format" argument.
	*
	* Valid key names are a single, lower or upper-case letter, i.e. "n" and "N".
	*/
	createDebug.formatters = {};

	/**
	* Selects a color for a debug namespace
	* @param {String} namespace The namespace string for the for the debug instance to be colored
	* @return {Number|String} An ANSI color code for the given namespace
	* @api private
	*/
	function selectColor(namespace) {
		let hash = 0;

		for (let i = 0; i < namespace.length; i++) {
			hash = ((hash << 5) - hash) + namespace.charCodeAt(i);
			hash |= 0; // Convert to 32bit integer
		}

		return createDebug.colors[Math.abs(hash) % createDebug.colors.length];
	}
	createDebug.selectColor = selectColor;

	/**
	* Create a debugger with the given `namespace`.
	*
	* @param {String} namespace
	* @return {Function}
	* @api public
	*/
	function createDebug(namespace) {
		let prevTime;
		let enableOverride = null;

		function debug(...args) {
			// Disabled?
			if (!debug.enabled) {
				return;
			}

			const self = debug;

			// Set `diff` timestamp
			const curr = Number(new Date());
			const ms = curr - (prevTime || curr);
			self.diff = ms;
			self.prev = prevTime;
			self.curr = curr;
			prevTime = curr;

			args[0] = createDebug.coerce(args[0]);

			if (typeof args[0] !== 'string') {
				// Anything else let's inspect with %O
				args.unshift('%O');
			}

			// Apply any `formatters` transformations
			let index = 0;
			args[0] = args[0].replace(/%([a-zA-Z%])/g, (match, format) => {
				// If we encounter an escaped % then don't increase the array index
				if (match === '%%') {
					return '%';
				}
				index++;
				const formatter = createDebug.formatters[format];
				if (typeof formatter === 'function') {
					const val = args[index];
					match = formatter.call(self, val);

					// Now we need to remove `args[index]` since it's inlined in the `format`
					args.splice(index, 1);
					index--;
				}
				return match;
			});

			// Apply env-specific formatting (colors, etc.)
			createDebug.formatArgs.call(self, args);

			const logFn = self.log || createDebug.log;
			logFn.apply(self, args);
		}

		debug.namespace = namespace;
		debug.useColors = createDebug.useColors();
		debug.color = createDebug.selectColor(namespace);
		debug.extend = extend;
		debug.destroy = createDebug.destroy; // XXX Temporary. Will be removed in the next major release.

		Object.defineProperty(debug, 'enabled', {
			enumerable: true,
			configurable: false,
			get: () => enableOverride === null ? createDebug.enabled(namespace) : enableOverride,
			set: v => {
				enableOverride = v;
			}
		});

		// Env-specific initialization logic for debug instances
		if (typeof createDebug.init === 'function') {
			createDebug.init(debug);
		}

		return debug;
	}

	function extend(namespace, delimiter) {
		const newDebug = createDebug(this.namespace + (typeof delimiter === 'undefined' ? ':' : delimiter) + namespace);
		newDebug.log = this.log;
		return newDebug;
	}

	/**
	* Enables a debug mode by namespaces. This can include modes
	* separated by a colon and wildcards.
	*
	* @param {String} namespaces
	* @api public
	*/
	function enable(namespaces) {
		createDebug.save(namespaces);

		createDebug.names = [];
		createDebug.skips = [];

		let i;
		const split = (typeof namespaces === 'string' ? namespaces : '').split(/[\s,]+/);
		const len = split.length;

		for (i = 0; i < len; i++) {
			if (!split[i]) {
				// ignore empty strings
				continue;
			}

			namespaces = split[i].replace(/\*/g, '.*?');

			if (namespaces[0] === '-') {
				createDebug.skips.push(new RegExp('^' + namespaces.substr(1) + '$'));
			} else {
				createDebug.names.push(new RegExp('^' + namespaces + '$'));
			}
		}
	}

	/**
	* Disable debug output.
	*
	* @return {String} namespaces
	* @api public
	*/
	function disable() {
		const namespaces = [
			...createDebug.names.map(toNamespace),
			...createDebug.skips.map(toNamespace).map(namespace => '-' + namespace)
		].join(',');
		createDebug.enable('');
		return namespaces;
	}

	/**
	* Returns true if the given mode name is enabled, false otherwise.
	*
	* @param {String} name
	* @return {Boolean}
	* @api public
	*/
	function enabled(name) {
		if (name[name.length - 1] === '*') {
			return true;
		}

		let i;
		let len;

		for (i = 0, len = createDebug.skips.length; i < len; i++) {
			if (createDebug.skips[i].test(name)) {
				return false;
			}
		}

		for (i = 0, len = createDebug.names.length; i < len; i++) {
			if (createDebug.names[i].test(name)) {
				return true;
			}
		}

		return false;
	}

	/**
	* Convert regexp to namespace
	*
	* @param {RegExp} regxep
	* @return {String} namespace
	* @api private
	*/
	function toNamespace(regexp) {
		return regexp.toString()
			.substring(2, regexp.toString().length - 2)
			.replace(/\.\*\?$/, '*');
	}

	/**
	* Coerce `val`.
	*
	* @param {Mixed} val
	* @return {Mixed}
	* @api private
	*/
	function coerce(val) {
		if (val instanceof Error) {
			return val.stack || val.message;
		}
		return val;
	}

	/**
	* XXX DO NOT USE. This is a temporary stub function.
	* XXX It WILL be removed in the next major release.
	*/
	function destroy() {
		console.warn('Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.');
	}

	createDebug.enable(createDebug.load());

	return createDebug;
}

module.exports = setup;

},{"ms":8}],11:[function(require,module,exports){
// shim for using process in browser
var process = module.exports = {};

// cached from whatever global is present so that test runners that stub it
// don't break things.  But we need to wrap it in a try catch in case it is
// wrapped in strict mode code which doesn't define any globals.  It's inside a
// function because try/catches deoptimize in certain engines.

var cachedSetTimeout;
var cachedClearTimeout;

function defaultSetTimout() {
    throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout () {
    throw new Error('clearTimeout has not been defined');
}
(function () {
    try {
        if (typeof setTimeout === 'function') {
            cachedSetTimeout = setTimeout;
        } else {
            cachedSetTimeout = defaultSetTimout;
        }
    } catch (e) {
        cachedSetTimeout = defaultSetTimout;
    }
    try {
        if (typeof clearTimeout === 'function') {
            cachedClearTimeout = clearTimeout;
        } else {
            cachedClearTimeout = defaultClearTimeout;
        }
    } catch (e) {
        cachedClearTimeout = defaultClearTimeout;
    }
} ())
function runTimeout(fun) {
    if (cachedSetTimeout === setTimeout) {
        //normal enviroments in sane situations
        return setTimeout(fun, 0);
    }
    // if setTimeout wasn't available but was latter defined
    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
        cachedSetTimeout = setTimeout;
        return setTimeout(fun, 0);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedSetTimeout(fun, 0);
    } catch(e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
            return cachedSetTimeout.call(null, fun, 0);
        } catch(e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
            return cachedSetTimeout.call(this, fun, 0);
        }
    }


}
function runClearTimeout(marker) {
    if (cachedClearTimeout === clearTimeout) {
        //normal enviroments in sane situations
        return clearTimeout(marker);
    }
    // if clearTimeout wasn't available but was latter defined
    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
        cachedClearTimeout = clearTimeout;
        return clearTimeout(marker);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedClearTimeout(marker);
    } catch (e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
            return cachedClearTimeout.call(null, marker);
        } catch (e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
            return cachedClearTimeout.call(this, marker);
        }
    }



}
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = runTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    runClearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        runTimeout(drainQueue);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;
process.prependListener = noop;
process.prependOnceListener = noop;

process.listeners = function (name) { return [] }

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}]},{},[1])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJkaXN0L2NsaWVudC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9AaXJjYW0vc3luYy9jbGllbnQvaW5kZXguanMiLCJub2RlX21vZHVsZXMvQGlyY2FtL3N5bmMvaW5kZXguanMiLCJub2RlX21vZHVsZXMvQGlyY2FtL3N5bmMvc2VydmVyL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2JhYmVsLXJ1bnRpbWUvY29yZS1qcy9qc29uL3N0cmluZ2lmeS5qcyIsIm5vZGVfbW9kdWxlcy9jb3JlLWpzL2xpYnJhcnkvZm4vanNvbi9zdHJpbmdpZnkuanMiLCJub2RlX21vZHVsZXMvY29yZS1qcy9saWJyYXJ5L21vZHVsZXMvX2NvcmUuanMiLCJub2RlX21vZHVsZXMvZGVidWcvbm9kZV9tb2R1bGVzL21zL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2RlYnVnL3NyYy9icm93c2VyLmpzIiwibm9kZV9tb2R1bGVzL2RlYnVnL3NyYy9jb21tb24uanMiLCJub2RlX21vZHVsZXMvcHJvY2Vzcy9icm93c2VyLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7O0FDQ0E7Ozs7QUFFQSxJQUFNLGtCQUFrQixTQUFsQixlQUFrQixHQUFNO0FBQzVCLFNBQU8sWUFBWSxHQUFaLEtBQW9CLElBQTNCO0FBQ0QsQ0FGRCxDLENBSEE7OztBQU9BLFNBQVMsSUFBVCxHQUFnQjtBQUNkLE1BQU0sTUFBTSxPQUFPLFFBQVAsQ0FBZ0IsTUFBaEIsQ0FBdUIsT0FBdkIsQ0FBK0IsTUFBL0IsRUFBdUMsSUFBdkMsQ0FBWjs7QUFFQTtBQUNBLE1BQU0sU0FBUyxJQUFJLFNBQUosQ0FBYyxHQUFkLENBQWY7QUFDQTtBQUNBLE1BQU0sYUFBYSxxQkFBZSxlQUFmLENBQW5COztBQUVBLE1BQU0sWUFBWSxTQUFTLGFBQVQsQ0FBdUIsWUFBdkIsQ0FBbEI7QUFDQSxjQUFZLFlBQU07QUFDaEIsUUFBTSxXQUFXLFdBQVcsV0FBWCxFQUFqQjtBQUNBLGNBQVUsU0FBVixHQUFzQixRQUF0QjtBQUNELEdBSEQsRUFHRyxHQUhIOztBQUtBLFNBQU8sZ0JBQVAsQ0FBd0IsTUFBeEIsRUFBZ0MsWUFBTTtBQUNwQyxRQUFNLGVBQWUsU0FBZixZQUFlLENBQUMsTUFBRCxFQUFTLGNBQVQsRUFBNEI7QUFDL0MsVUFBTSxVQUFVLEVBQWhCO0FBQ0EsY0FBUSxDQUFSLElBQWEsQ0FBYixDQUYrQyxDQUUvQjtBQUNoQixjQUFRLENBQVIsSUFBYSxNQUFiO0FBQ0EsY0FBUSxDQUFSLElBQWEsY0FBYjs7QUFFQSxjQUFRLEdBQVIsa0NBQTZDLFFBQVEsQ0FBUixDQUE3QyxFQUF5RCxRQUFRLENBQVIsQ0FBekQ7O0FBRUEsYUFBTyxJQUFQLENBQVkseUJBQWUsT0FBZixDQUFaO0FBQ0QsS0FURDs7QUFXQSxRQUFNLGtCQUFrQixTQUFsQixlQUFrQixXQUFZO0FBQ2xDLGFBQU8sZ0JBQVAsQ0FBd0IsU0FBeEIsRUFBbUMsYUFBSztBQUN0QyxZQUFNLFdBQVcsS0FBSyxLQUFMLENBQVcsRUFBRSxJQUFiLENBQWpCO0FBQ0EsZ0JBQVEsR0FBUixDQUFZLFFBQVo7O0FBRUEsWUFBSSxTQUFTLENBQVQsTUFBZ0IsQ0FBcEIsRUFBdUI7QUFBRTtBQUN2QixjQUFNLFNBQVMsU0FBUyxDQUFULENBQWY7QUFDQSxjQUFNLGlCQUFpQixTQUFTLENBQVQsQ0FBdkI7QUFDQSxjQUFNLGlCQUFpQixTQUFTLENBQVQsQ0FBdkI7QUFDQSxjQUFNLGlCQUFpQixTQUFTLENBQVQsQ0FBdkI7O0FBRUEsa0JBQVEsR0FBUixnRkFDRSxNQURGLEVBQ1UsY0FEVixFQUMwQixjQUQxQixFQUMwQyxjQUQxQzs7QUFHQSxtQkFBUyxNQUFULEVBQWlCLGNBQWpCLEVBQWlDLGNBQWpDLEVBQWlELGNBQWpEO0FBQ0Q7QUFDRixPQWZEO0FBZ0JELEtBakJEOztBQW1CQSxRQUFNLG1CQUFtQixTQUFTLGFBQVQsQ0FBdUIsU0FBdkIsQ0FBekI7QUFDQSxRQUFNLGlCQUFpQixTQUFqQixjQUFpQixTQUFVO0FBQy9CLHVCQUFpQixTQUFqQixHQUE2Qix5QkFBZSxNQUFmLEVBQXVCLElBQXZCLEVBQTZCLENBQTdCLENBQTdCO0FBQ0EsY0FBUSxHQUFSLENBQVksTUFBWjtBQUNELEtBSEQ7O0FBS0EsZUFBVyxLQUFYLENBQWlCLFlBQWpCLEVBQStCLGVBQS9CLEVBQWdELGNBQWhEO0FBQ0QsR0F0Q0Q7O0FBd0NBLFNBQU8sZ0JBQVAsQ0FBd0IsT0FBeEIsRUFBaUM7QUFBQSxXQUFPLFFBQVEsS0FBUixDQUFjLElBQUksS0FBbEIsQ0FBUDtBQUFBLEdBQWpDO0FBQ0EsU0FBTyxnQkFBUCxDQUF3QixPQUF4QixFQUFpQztBQUFBLFdBQU0sUUFBUSxHQUFSLENBQVksZUFBWixDQUFOO0FBQUEsR0FBakM7QUFDRDs7QUFFRCxPQUFPLGdCQUFQLENBQXdCLE1BQXhCLEVBQWdDLElBQWhDOzs7QUNqRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0b0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFIQTs7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTEE7QUFDQTtBQUNBOztBQ0ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUNsS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDN1FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JRQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24oKXtmdW5jdGlvbiByKGUsbix0KXtmdW5jdGlvbiBvKGksZil7aWYoIW5baV0pe2lmKCFlW2ldKXt2YXIgYz1cImZ1bmN0aW9uXCI9PXR5cGVvZiByZXF1aXJlJiZyZXF1aXJlO2lmKCFmJiZjKXJldHVybiBjKGksITApO2lmKHUpcmV0dXJuIHUoaSwhMCk7dmFyIGE9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitpK1wiJ1wiKTt0aHJvdyBhLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsYX12YXIgcD1uW2ldPXtleHBvcnRzOnt9fTtlW2ldWzBdLmNhbGwocC5leHBvcnRzLGZ1bmN0aW9uKHIpe3ZhciBuPWVbaV1bMV1bcl07cmV0dXJuIG8obnx8cil9LHAscC5leHBvcnRzLHIsZSxuLHQpfXJldHVybiBuW2ldLmV4cG9ydHN9Zm9yKHZhciB1PVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmUsaT0wO2k8dC5sZW5ndGg7aSsrKW8odFtpXSk7cmV0dXJuIG99cmV0dXJuIHJ9KSgpIiwiLy8gaW1wb3J0IFN5bmNDbGllbnQgZnJvbSAnQGlyY2FtL3N5bmMvY2xpZW50JztcbmltcG9ydCB7IFN5bmNDbGllbnQgfSBmcm9tICdAaXJjYW0vc3luYyc7XG5cbmNvbnN0IGdldFRpbWVGdW5jdGlvbiA9ICgpID0+IHtcbiAgcmV0dXJuIHBlcmZvcm1hbmNlLm5vdygpIC8gMTAwMDtcbn1cblxuZnVuY3Rpb24gaW5pdCgpIHtcbiAgY29uc3QgdXJsID0gd2luZG93LmxvY2F0aW9uLm9yaWdpbi5yZXBsYWNlKCdodHRwJywgJ3dzJyk7XG5cbiAgLy8gaW5pdCBzb2NrZXQgY2xpZW50XG4gIGNvbnN0IHNvY2tldCA9IG5ldyBXZWJTb2NrZXQodXJsKTtcbiAgLy8gaW5pdCBzeW5jIGNsaWVudFxuICBjb25zdCBzeW5jQ2xpZW50ID0gbmV3IFN5bmNDbGllbnQoZ2V0VGltZUZ1bmN0aW9uKTtcblxuICBjb25zdCAkc3luY1RpbWUgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjc3luYy10aW1lJyk7XG4gIHNldEludGVydmFsKCgpID0+IHtcbiAgICBjb25zdCBzeW5jVGltZSA9IHN5bmNDbGllbnQuZ2V0U3luY1RpbWUoKTtcbiAgICAkc3luY1RpbWUuaW5uZXJIVE1MID0gc3luY1RpbWU7XG4gIH0sIDEwMCk7XG5cbiAgc29ja2V0LmFkZEV2ZW50TGlzdGVuZXIoJ29wZW4nLCAoKSA9PiB7XG4gICAgY29uc3Qgc2VuZEZ1bmN0aW9uID0gKHBpbmdJZCwgY2xpZW50UGluZ1RpbWUpID0+IHtcbiAgICAgIGNvbnN0IHJlcXVlc3QgPSBbXTtcbiAgICAgIHJlcXVlc3RbMF0gPSAwOyAvLyB0aGlzIGlzIGEgcGluZ1xuICAgICAgcmVxdWVzdFsxXSA9IHBpbmdJZDtcbiAgICAgIHJlcXVlc3RbMl0gPSBjbGllbnRQaW5nVGltZTtcblxuICAgICAgY29uc29sZS5sb2coYFtwaW5nXSAtIGlkOiAlcywgcGluZ1RpbWU6ICVzYCwgcmVxdWVzdFsxXSwgcmVxdWVzdFsyXSk7XG5cbiAgICAgIHNvY2tldC5zZW5kKEpTT04uc3RyaW5naWZ5KHJlcXVlc3QpKTtcbiAgICB9O1xuXG4gICAgY29uc3QgcmVjZWl2ZUZ1bmN0aW9uID0gY2FsbGJhY2sgPT4ge1xuICAgICAgc29ja2V0LmFkZEV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCBlID0+IHtcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBKU09OLnBhcnNlKGUuZGF0YSk7XG4gICAgICAgIGNvbnNvbGUubG9nKHJlc3BvbnNlKTtcblxuICAgICAgICBpZiAocmVzcG9uc2VbMF0gPT09IDEpIHsgLy8gdGhpcyBpcyBhIHBvbmdcbiAgICAgICAgICBjb25zdCBwaW5nSWQgPSByZXNwb25zZVsxXTtcbiAgICAgICAgICBjb25zdCBjbGllbnRQaW5nVGltZSA9IHJlc3BvbnNlWzJdO1xuICAgICAgICAgIGNvbnN0IHNlcnZlclBpbmdUaW1lID0gcmVzcG9uc2VbM107XG4gICAgICAgICAgY29uc3Qgc2VydmVyUG9uZ1RpbWUgPSByZXNwb25zZVs0XTtcblxuICAgICAgICAgIGNvbnNvbGUubG9nKGBbcG9uZ10gLSBpZDogJXMsIGNsaWVudFBpbmdUaW1lOiAlcywgc2VydmVyUGluZ1RpbWU6ICVzLCBzZXJ2ZXJQb25nVGltZTogJXNgLFxuICAgICAgICAgICAgcGluZ0lkLCBjbGllbnRQaW5nVGltZSwgc2VydmVyUGluZ1RpbWUsIHNlcnZlclBvbmdUaW1lKTtcblxuICAgICAgICAgIGNhbGxiYWNrKHBpbmdJZCwgY2xpZW50UGluZ1RpbWUsIHNlcnZlclBpbmdUaW1lLCBzZXJ2ZXJQb25nVGltZSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGNvbnN0ICRzdGF0dXNDb250YWluZXIgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjc3RhdHVzJyk7XG4gICAgY29uc3Qgc3RhdHVzRnVuY3Rpb24gPSBzdGF0dXMgPT4ge1xuICAgICAgJHN0YXR1c0NvbnRhaW5lci5pbm5lckhUTUwgPSBKU09OLnN0cmluZ2lmeShzdGF0dXMsIG51bGwsIDIpO1xuICAgICAgY29uc29sZS5sb2coc3RhdHVzKTtcbiAgICB9O1xuXG4gICAgc3luY0NsaWVudC5zdGFydChzZW5kRnVuY3Rpb24sIHJlY2VpdmVGdW5jdGlvbiwgc3RhdHVzRnVuY3Rpb24pO1xuICB9KTtcblxuICBzb2NrZXQuYWRkRXZlbnRMaXN0ZW5lcignZXJyb3InLCBlcnIgPT4gY29uc29sZS5lcnJvcihlcnIuc3RhY2spKTtcbiAgc29ja2V0LmFkZEV2ZW50TGlzdGVuZXIoJ2Nsb3NlJywgKCkgPT4gY29uc29sZS5sb2coJ3NvY2tldCBjbG9zZWQnKSk7XG59XG5cbndpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdsb2FkJywgaW5pdCk7XG4iLCJcInVzZSBzdHJpY3RcIjtcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7XG4gIHZhbHVlOiB0cnVlXG59KTtcbmV4cG9ydHMuZGVmYXVsdCA9IHZvaWQgMDtcblxudmFyIF9kZWJ1ZyA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQocmVxdWlyZShcImRlYnVnXCIpKTtcblxuZnVuY3Rpb24gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChvYmopIHsgcmV0dXJuIG9iaiAmJiBvYmouX19lc01vZHVsZSA/IG9iaiA6IHsgZGVmYXVsdDogb2JqIH07IH1cblxuLyoqXG4gKiBAZmlsZU92ZXJ2aWV3IEVzdGltYXRpb24gb2YgYSBzZXJ2ZXIgdGltZSBmcm9tIGEgY2xpZW50IHRpbWUuXG4gKlxuICogQHNlZSB7QGxpbmsgaHR0cHM6Ly9oYWwuYXJjaGl2ZXMtb3V2ZXJ0ZXMuZnIvaGFsLTAxMzA0ODg5djF9XG4gKiBTdGFiaWxpc2F0aW9uIGFkZGVkIGFmdGVyIHRoZSBhcnRpY2xlLlxuICovXG5jb25zdCBsb2cgPSAoMCwgX2RlYnVnLmRlZmF1bHQpKCdzeW5jJyk7IC8vLy8vLyBoZWxwZXJzXG5cbi8qKlxuICogT3JkZXIgbWluIGFuZCBtYXggYXR0cmlidXRlcy5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtPYmplY3R9IHRoYXQgd2l0aCBtaW4gYW5kIG1heCBhdHRyaWJ1dGVzXG4gKiBAcmV0dXJucyB7T2JqZWN0fSB3aXRoIG1pbiBhbmQgbWFuIGF0dHJpYnV0ZXMsIHN3YXBwZWQgaWYgdGhhdC5taW4gPiB0aGF0Lm1heFxuICovXG5cbmZ1bmN0aW9uIG9yZGVyTWluTWF4KHRoYXQpIHtcbiAgaWYgKHR5cGVvZiB0aGF0ICE9PSAndW5kZWZpbmVkJyAmJiB0eXBlb2YgdGhhdC5taW4gIT09ICd1bmRlZmluZWQnICYmIHR5cGVvZiB0aGF0Lm1heCAhPT0gJ3VuZGVmaW5lZCcgJiYgdGhhdC5taW4gPiB0aGF0Lm1heCkge1xuICAgIGNvbnN0IHRtcCA9IHRoYXQubWluO1xuICAgIHRoYXQubWluID0gdGhhdC5tYXg7XG4gICAgdGhhdC5tYXggPSB0bXA7XG4gIH1cblxuICByZXR1cm4gdGhhdDtcbn1cbi8qKlxuICogTWVhbiBvdmVyIGFuIGFycmF5LCBzZWxlY3Rpbmcgb25lIGRpbWVuc2lvbiBvZiB0aGUgYXJyYXkgdmFsdWVzLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge0FycmF5LjxBcnJheS48TnVtYmVyPj59IGFycmF5XG4gKiBAcGFyYW0ge051bWJlcn0gW2RpbWVuc2lvbj0wXVxuICogQHJldHVybnMge051bWJlcn0gbWVhblxuICovXG5cblxuZnVuY3Rpb24gbWVhbihhcnJheSwgZGltZW5zaW9uID0gMCkge1xuICByZXR1cm4gYXJyYXkucmVkdWNlKChwLCBxKSA9PiBwICsgcVtkaW1lbnNpb25dLCAwKSAvIGFycmF5Lmxlbmd0aDtcbn1cbi8qKlxuICogRnVuY3Rpb24gdXNlZCB0byBzb3J0IGxvbmctdGVybSBkYXRhLCB1c2luZyBmaXJzdCBhbmQgc2Vjb25kIGRpbWVuc2lvbnMsIGluXG4gKiB0aGF0IG9yZGVyLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge0FycmF5LjxOdW1iZXI+fSBhXG4gKiBAcGFyYW0ge051bWJlci48TnVtYmVyPn0gYlxuICogQHJldHVybnMge051bWJlcn0gbmVnYXRpdmUgaWYgYSA8IGIsIHBvc2l0aXZlIGlmIGEgPiBiLCBvciAwXG4gKi9cblxuXG5mdW5jdGlvbiBkYXRhQ29tcGFyZShhLCBiKSB7XG4gIHJldHVybiBhWzBdIC0gYlswXSB8fCBhWzFdIC0gYlsxXTtcbn1cbi8qKlxuICogQGNhbGxiYWNrIFN5bmNDbGllbnR+Z2V0VGltZUZ1bmN0aW9uXG4gKiBAcmV0dXJuIHtOdW1iZXJ9IHN0cmljdGx5IG1vbm90b25pYywgZXZlciBpbmNyZWFzaW5nLCB0aW1lIGluIHNlY29uZC4gV2hlblxuICogICBwb3NzaWJsZSB0aGUgc2VydmVyIGNvZGUgc2hvdWxkIGRlZmluZSBpdHMgb3duIG9yaWdpbiAoaS5lLiBgdGltZT0wYCkgaW5cbiAqICAgb3JkZXIgdG8gbWF4aW1pemUgdGhlIHJlc29sdXRpb24gb2YgdGhlIGNsb2NrIGZvciBhIGxvbmcgcGVyaW9kIG9mXG4gKiAgIHRpbWUuIFdoZW4gYFN5bmNTZXJ2ZXJ+c3RhcnRgIGlzIGNhbGxlZCB0aGUgY2xvY2sgc2hvdWxkIGFscmVhZHkgYmVcbiAqICAgcnVubmluZyAoY2YuIGBhdWRpb0NvbnRleHQuY3VycmVudFRpbWVgIHRoYXQgbmVlZHMgdXNlciBpbnRlcmFjdGlvbiB0b1xuICogICBzdGFydClcbiAqKi9cblxuLyoqXG4gKiBAY2FsbGJhY2sgU3luY0NsaWVudH5zZW5kRnVuY3Rpb25cbiAqIEBzZWUge0BsaW5rIFN5bmNTZXJ2ZXJ+cmVjZWl2ZUZ1bmN0aW9ufVxuICogQHBhcmFtIHtOdW1iZXJ9IHBpbmdJZCB1bmlxdWUgaWRlbnRpZmllclxuICogQHBhcmFtIHtOdW1iZXJ9IGNsaWVudFBpbmdUaW1lIHRpbWUtc3RhbXAgb2YgcGluZyBlbWlzc2lvblxuICoqL1xuXG4vKipcbiAqIEBjYWxsYmFjayBTeW5jQ2xpZW50fnJlY2VpdmVGdW5jdGlvblxuICogQHNlZSB7QGxpbmsgU3luY1NlcnZlcn5zZW5kRnVuY3Rpb259XG4gKiBAcGFyYW0ge1N5bmNDbGllbnR+cmVjZWl2ZUNhbGxiYWNrfSByZWNlaXZlQ2FsbGJhY2sgY2FsbGVkIG9uIGVhY2ggbWVzc2FnZVxuICogICBtYXRjaGluZyBtZXNzYWdlVHlwZS5cbiAqKi9cblxuLyoqXG4gKiBAY2FsbGJhY2sgU3luY0NsaWVudH5yZWNlaXZlQ2FsbGJhY2tcbiAqIEBwYXJhbSB7TnVtYmVyfSBwaW5nSWQgdW5pcXVlIGlkZW50aWZpZXJcbiAqIEBwYXJhbSB7TnVtYmVyfSBjbGllbnRQaW5nVGltZSB0aW1lLXN0YW1wIG9mIHBpbmcgZW1pc3Npb25cbiAqIEBwYXJhbSB7TnVtYmVyfSBzZXJ2ZXJQaW5nVGltZSB0aW1lLXN0YW1wIG9mIHBpbmcgcmVjZXB0aW9uXG4gKiBAcGFyYW0ge051bWJlcn0gc2VydmVyUG9uZ1RpbWUgdGltZS1zdGFtcCBvZiBwb25nIGVtaXNzaW9uXG4gKiovXG5cbi8qKlxuICogQGNhbGxiYWNrIFN5bmNDbGllbnR+cmVwb3J0RnVuY3Rpb25cbiAqIEBwYXJhbSB7T2JqZWN0fSByZXBvcnRcbiAqIEBwYXJhbSB7U3RyaW5nfSByZXBvcnQuc3RhdHVzIGBuZXdgLCBgc3RhcnR1cGAsIGB0cmFpbmluZ2AgKG9mZnNldFxuICogICBhZGFwdGF0aW9uKSwgb3IgYHN5bmNgIChvZmZzZXQgYW5kIHNwZWVkIGFkYXB0YXRpb24pLlxuICogQHBhcmFtIHtOdW1iZXJ9IHJlcG9ydC5zdGF0dXNEdXJhdGlvbiBkdXJhdGlvbiBzaW5jZSBsYXN0IHN0YXR1c1xuICogICBjaGFuZ2UuXG4gKiBAcGFyYW0ge051bWJlcn0gcmVwb3J0LnRpbWVPZmZzZXQgdGltZSBkaWZmZXJlbmNlIGJldHdlZW4gbG9jYWwgdGltZSBhbmRcbiAqICAgc3luYyB0aW1lLCBpbiBzZWNvbmRzLlxuICogQHBhcmFtIHtOdW1iZXJ9IHJlcG9ydC5mcmVxdWVuY3lSYXRpbyB0aW1lIHJhdGlvIGJldHdlZW4gbG9jYWxcbiAqICAgdGltZSBhbmQgc3luYyB0aW1lLlxuICogQHBhcmFtIHtTdHJpbmd9IHJlcG9ydC5jb25uZWN0aW9uIGBvZmZsaW5lYCBvciBgb25saW5lYFxuICogQHBhcmFtIHtOdW1iZXJ9IHJlcG9ydC5jb25uZWN0aW9uRHVyYXRpb24gZHVyYXRpb24gc2luY2UgbGFzdCBjb25uZWN0aW9uXG4gKiAgIGNoYW5nZS5cbiAqIEBwYXJhbSB7TnVtYmVyfSByZXBvcnQuY29ubmVjdGlvblRpbWVPdXQgZHVyYXRpb24sIGluIHNlY29uZHMsIGJlZm9yZVxuICogICBhIHRpbWUtb3V0IG9jY3Vycy5cbiAqIEBwYXJhbSB7TnVtYmVyfSByZXBvcnQudHJhdmVsRHVyYXRpb24gZHVyYXRpb24gb2YgYSBwaW5nLXBvbmcgcm91bmQtdHJpcCxcbiAqICAgaW4gc2Vjb25kcywgbWVhbiBvdmVyIHRoZSB0aGUgbGFzdCBwaW5nLXBvbmcgc2VyaWVzLlxuICogQHBhcmFtIHtOdW1iZXJ9IHJlcG9ydC50cmF2ZWxEdXJhdGlvbk1pbiBkdXJhdGlvbiBvZiBhIHBpbmctcG9uZ1xuICogICByb3VuZC10cmlwLCBpbiBzZWNvbmRzLCBtaW5pbXVtIG92ZXIgdGhlIHRoZSBsYXN0IHBpbmctcG9uZyBzZXJpZXMuXG4gKiBAcGFyYW0ge051bWJlcn0gcmVwb3J0LnRyYXZlbER1cmF0aW9uTWF4IGR1cmF0aW9uIG9mIGEgcGluZy1wb25nXG4gKiAgIHJvdW5kLXRyaXAsIGluIHNlY29uZHMsIG1heGltdW0gb3ZlciB0aGUgdGhlIGxhc3QgcGluZy1wb25nIHNlcmllcy5cbiAqKi9cblxuLyoqXG4gKiBgU3luY0NsaWVudGAgaW5zdGFuY2VzIHN5bmNocm9uaXplIHRvIHRoZSBjbG9jayBwcm92aWRlZFxuICogYnkgdGhlIHtAbGluayBTeW5jU2VydmVyfSBpbnN0YW5jZS4gVGhlIGRlZmF1bHQgZXN0aW1hdGlvbiBiZWhhdmlvciBpc1xuICogc3RyaWN0bHkgbW9ub3RvbmljIGFuZCBndWFyYW50ZWUgYSB1bmlxdWUgY29udmVydGlvbiBmcm9tIHNlcnZlciB0aW1lXG4gKiB0byBsb2NhbCB0aW1lLlxuICpcbiAqIEBzZWUge0BsaW5rIFN5bmNDbGllbnR+c3RhcnR9IG1ldGhvZCB0byBhY3R1YWxseSBzdGFydCBhIHN5bmNocm9uaXNhdGlvblxuICogcHJvY2Vzcy5cbiAqXG4gKiBAcGFyYW0ge1N5bmNDbGllbnR+Z2V0VGltZUZ1bmN0aW9ufSBnZXRUaW1lRnVuY3Rpb25cbiAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc11cbiAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9ucy5waW5nVGltZU91dERlbGF5XSByYW5nZSBvZiBkdXJhdGlvbiAoaW4gc2Vjb25kcylcbiAqICAgdG8gY29uc2lkZXIgYSBwaW5nIHdhcyBub3QgcG9uZ2VkIGJhY2tcbiAqIEBwYXJhbSB7TnVtYmVyfSBbb3B0aW9ucy5waW5nVGltZU91dERlbGF5Lm1pbj0xXSBtaW4gYW5kIG1heCBtdXN0IGJlIHNldFxuICogICB0b2dldGhlclxuICogQHBhcmFtIHtOdW1iZXJ9IFtvcHRpb25zLnBpbmdUaW1lT3V0RGVsYXkubWF4PTMwXSBtaW4gYW5kIG1heCBtdXN0IGJlIHNldFxuICogICB0b2dldGhlclxuICogQHBhcmFtIHtOdW1iZXJ9IFtvcHRpb25zLnBpbmdTZXJpZXNJdGVyYXRpb25zPTEwXSBudW1iZXIgb2YgcGluZy1wb25ncyBpbiBhXG4gKiAgIHNlcmllc1xuICogQHBhcmFtIHtOdW1iZXJ9IFtvcHRpb25zLnBpbmdTZXJpZXNQZXJpb2Q9MC4yNTBdIGludGVydmFsIChpbiBzZWNvbmRzKVxuICogICBiZXR3ZWVuIHBpbmdzIGluIGEgc2VyaWVzXG4gKiBAcGFyYW0ge051bWJlcn0gW29wdGlvbnMucGluZ1Nlcmllc0RlbGF5XSByYW5nZSBvZiBpbnRlcnZhbCAoaW4gc2Vjb25kcylcbiAqICAgYmV0d2VlbiBwaW5nLXBvbmcgc2VyaWVzXG4gKiBAcGFyYW0ge051bWJlcn0gW29wdGlvbnMucGluZ1Nlcmllc0RlbGF5Lm1pbj0xMF0gbWluIGFuZCBtYXggbXVzdCBiZSBzZXRcbiAqICAgdG9nZXRoZXJcbiAqIEBwYXJhbSB7TnVtYmVyfSBbb3B0aW9ucy5waW5nU2VyaWVzRGVsYXkubWF4PTIwXSBtaW4gYW5kIG1heCBtdXN0IGJlIHNldFxuICogICB0b2dldGhlclxuICogQHBhcmFtIHtOdW1iZXJ9IFtvcHRpb25zLmxvbmdUZXJtRGF0YVRyYWluaW5nRHVyYXRpb249MTIwXSBkdXJhdGlvbiBvZlxuICogICB0cmFpbmluZywgaW4gc2Vjb25kcywgYXBwcm94aW1hdGVseSwgYmVmb3JlIHVzaW5nIHRoZSBlc3RpbWF0ZSBvZiBjbG9ja1xuICogICBmcmVxdWVuY3lcbiAqIEBwYXJhbSB7TnVtYmVyfSBbb3B0aW9ucy5sb25nVGVybURhdGFEdXJhdGlvbj05MDBdIGVzdGltYXRlIHN5bmNocm9uaXNhdGlvbiBvdmVyXG4gKiAgIHRoaXMgZHVyYXRpb24sIGluIHNlY29uZHMsIGFwcHJveGltYXRlbHlcbiAqIEBwYXJhbSB7Qm9vbGVhbn0gW29wdGlvbnMuZXN0aW1hdGlvbk1vbm90b25pY2l0eT10cnVlXSBXaGVuIGB0cnVlYCwgdGhlXG4gKiAgIGVzdGltYXRpb24gb2YgdGhlIHNlcnZlciB0aW1lIGlzIHN0cmljdGx5IG1vbm90b25pYywgYW5kIHRoZSBtYXhpbXVtXG4gKiAgIGluc3RhYmlsaXR5IG9mIHRoZSBlc3RpbWF0ZWQgc2VydmVyIHRpbWUgaXMgdGhlbiBsaW1pdGVkIHRvXG4gKiAgIGBvcHRpb25zLmVzdGltYXRpb25TdGFiaWxpdHlgLlxuICogQHBhcmFtIHtOdW1iZXJ9IFtvcHRpb25zLmVzdGltYXRpb25TdGFiaWxpdHk9MTYwZS02XSBUaGlzIG9wdGlvbiBhcHBsaWVzXG4gKiAgIG9ubHkgd2hlbiBgb3B0aW9ucy5lc3RpbWF0aW9uTW9ub3RvbmljaXR5YCBpcyB0cnVlLiBUaGUgYWRhcHRhdGlvbiB0byB0aGVcbiAqICAgZXN0aW1hdGVkIHNlcnZlciB0aW1lIGlzIHRoZW4gbGltaXRlZCBieSB0aGlzIHBvc2l0aXZlIHZhbHVlLiA4MGUtNiAoODBcbiAqICAgcGFydHMgcGVyIG1pbGxpb24sIFBQTSkgaXMgcXVpdGUgc3RhYmxlLCBhbmQgY29ycmVzcG9uZHMgdG8gdGhlIHN0YWJpbGl0eVxuICogICBvZiBhIGNvbnZlbnRpb25hbCBjbG9jay4gMTYwZS02IGlzIG1vZGVyYXRlbHkgYWRhcHRpdmUsIGFuZCBjb3JyZXNwb25kc1xuICogICB0byB0aGUgcmVsYXRpdmUgc3RhYmlsaXR5IG9mIDIgY2xvY2tzOyA1MDBlLTYgaXMgcXVpdGUgYWRhcHRpdmUsIGl0XG4gKiAgIGNvbXBlbnNhdGVzIDUgbWlsbGlzZWNvbmRzIGluIDEgc2Vjb25kLiBJdCBpcyB0aGUgbWF4aW11bSB2YWx1ZVxuICogICAoZXN0aW1hdGlvblN0YWJpbGl0eSBtdXN0IGJlIGxvd2VyIHRoYW4gNTAwZS02KS5cbiAqL1xuXG5cbmNsYXNzIFN5bmNDbGllbnQge1xuICBjb25zdHJ1Y3RvcihnZXRUaW1lRnVuY3Rpb24sIG9wdGlvbnMgPSB7fSkge1xuICAgIC8qKlxuICAgICAqIFRoZSBtaW5pbXVtIHN0YWJpbGl0eSBzZXJ2ZXMgc2V2ZXJhbCBwdXJwb3NlczpcbiAgICAgKlxuICAgICAqIDEuIFRoZSBlc3RpbWF0aW9uIHByb2Nlc3Mgd2lsbCByZXN0YXJ0IGlmIHRoZSBlc3RpbWF0ZWQgc2VydmVyIHRpbWVcbiAgICAgKiByZWFjaGVzIG9yIGV4Y2VlZHMgdGhpcyB2YWx1ZS5cbiAgICAgKiAyLiBUaGUgYWRhcHRhdGlvbiBvZiBhIG5ldyBlc3RpbWF0aW9uIChhZnRlciBhIHBpbmctcG9uZyBzZXJpZXMpIGlzIGFsc29cbiAgICAgKiBsaW1pdGVkIHRvIHRoaXMgdmFsdWUuXG4gICAgICogMy4gR2l2ZW4gMS4gYW5kIDIuLCB0aGlzIGVuc3VyZXMgdGhhdCB0aGUgZXN0aW1hdGlvbiBpcyBzdHJpY3RseVxuICAgICAqIG1vbm90b25pYy5cbiAgICAgKiA0LiBHaXZlbiAzLiwgdGhlIGNvbnZlcnNpb24gZnJvbSBzZXJ2ZXIgdGltZSB0byBsb2NhbCB0aW1lIGlzIHVuaXF1ZS5cbiAgICAgKlxuICAgICAqIEBwcml2YXRlXG4gICAgICogQGNvbnN0YW50IHtOdW1iZXJ9XG4gICAgICogQHZhbHVlIDUwMGUtNiBpcyA1MDAgUFBNLCBsaWtlIGFuIG9sZCBtZWNoYW5pY2FsIGNsb2NrXG4gICAgICogQHN0YXRpY1xuICAgICAqL1xuICAgIFN5bmNDbGllbnQubWluaW11bVN0YWJpbGl0eSA9IDUwMGUtNjtcbiAgICB0aGlzLmVzdGltYXRpb25Nb25vdG9uaWNpdHkgPSB0eXBlb2Ygb3B0aW9ucy5lc3RpbWF0aW9uTW9ub3RvbmljaXR5ICE9PSAndW5kZWZpbmVkJyA/IG9wdGlvbnMuZXN0aW1hdGlvbk1vbm90b25pY2l0eSA6IHRydWU7XG4gICAgdGhpcy5lc3RpbWF0aW9uU3RhYmlsaXR5ID0gb3B0aW9ucy5lc3RpbWF0aW9uU3RhYmlsaXR5IHx8IDE2MGUtNjtcbiAgICB0aGlzLmVzdGltYXRpb25TdGFiaWxpdHkgPSBNYXRoLm1heCgwLCBNYXRoLm1pbihTeW5jQ2xpZW50Lm1pbmltdW1TdGFiaWxpdHksIHRoaXMuZXN0aW1hdGlvblN0YWJpbGl0eSkpO1xuICAgIHRoaXMucGluZ1RpbWVvdXREZWxheSA9IG9wdGlvbnMucGluZ1RpbWVvdXREZWxheSB8fCB7XG4gICAgICBtaW46IDEsXG4gICAgICBtYXg6IDMwXG4gICAgfTtcbiAgICBvcmRlck1pbk1heCh0aGlzLnBpbmdUaW1lb3V0RGVsYXkpO1xuICAgIHRoaXMucGluZ1Nlcmllc0l0ZXJhdGlvbnMgPSBvcHRpb25zLnBpbmdTZXJpZXNJdGVyYXRpb25zIHx8IDEwO1xuICAgIHRoaXMucGluZ1Nlcmllc1BlcmlvZCA9IHR5cGVvZiBvcHRpb25zLnBpbmdTZXJpZXNQZXJpb2QgIT09ICd1bmRlZmluZWQnID8gb3B0aW9ucy5waW5nU2VyaWVzUGVyaW9kIDogMC4yNTA7XG4gICAgdGhpcy5waW5nU2VyaWVzRGVsYXkgPSBvcHRpb25zLnBpbmdTZXJpZXNEZWxheSB8fCB7XG4gICAgICBtaW46IDEwLFxuICAgICAgbWF4OiAyMFxuICAgIH07XG4gICAgb3JkZXJNaW5NYXgodGhpcy5waW5nU2VyaWVzRGVsYXkpO1xuICAgIHRoaXMucGluZ0RlbGF5ID0gMDsgLy8gY3VycmVudCBkZWxheSBiZWZvcmUgbmV4dCBwaW5nXG5cbiAgICB0aGlzLnRpbWVvdXRJZCA9IDA7IC8vIHRvIGNhbmNlbCB0aW1lb3V0IG9uIHBvbmdcblxuICAgIHRoaXMucGluZ0lkID0gMDsgLy8gYWJzb2x1dGUgSUQgdG8gbWFjaCBwb25nIGFnYWluc3RcblxuICAgIHRoaXMucGluZ1Nlcmllc0NvdW50ID0gMDsgLy8gZWxhcHNlZCBwaW5ncyBpbiBhIHNlcmllc1xuXG4gICAgdGhpcy5zZXJpZXNEYXRhID0gW107IC8vIGNpcmN1bGFyIGJ1ZmZlclxuXG4gICAgdGhpcy5zZXJpZXNEYXRhTmV4dEluZGV4ID0gMDsgLy8gbmV4dCBpbmRleCB0byB3cml0ZSBpbiBjaXJjdWxhciBidWZmZXJcblxuICAgIHRoaXMuc2VyaWVzRGF0YUxlbmd0aCA9IHRoaXMucGluZ1Nlcmllc0l0ZXJhdGlvbnM7IC8vIHNpemUgb2YgY2lyY3VsYXIgYnVmZmVyXG5cbiAgICB0aGlzLmxvbmdUZXJtRGF0YVRyYWluaW5nRHVyYXRpb24gPSBvcHRpb25zLmxvbmdUZXJtRGF0YVRyYWluaW5nRHVyYXRpb24gfHwgMTIwOyAvLyB1c2UgYSBmaXhlZC1zaXplIGNpcmN1bGFyIGJ1ZmZlciwgZXZlbiBpZiBpdCBkb2VzIG5vdCBtYXRjaFxuICAgIC8vIGV4YWN0bHkgdGhlIHJlcXVpcmVkIGR1cmF0aW9uXG5cbiAgICB0aGlzLmxvbmdUZXJtRGF0YUR1cmF0aW9uID0gb3B0aW9ucy5sb25nVGVybURhdGFEdXJhdGlvbiB8fCA5MDA7XG4gICAgdGhpcy5sb25nVGVybURhdGFMZW5ndGggPSBNYXRoLm1heCgyLCB0aGlzLmxvbmdUZXJtRGF0YUR1cmF0aW9uIC8gKDAuNSAqICh0aGlzLnBpbmdTZXJpZXNEZWxheS5taW4gKyB0aGlzLnBpbmdTZXJpZXNEZWxheS5tYXgpKSk7XG4gICAgdGhpcy5sb25nVGVybURhdGEgPSBbXTsgLy8gY2lyY3VsYXIgYnVmZmVyXG5cbiAgICB0aGlzLmxvbmdUZXJtRGF0YU5leHRJbmRleCA9IDA7IC8vIG5leHQgaW5kZXggdG8gd3JpdGUgaW4gY2lyY3VsYXIgYnVmZmVyXG5cbiAgICB0aGlzLnRpbWVPZmZzZXQgPSAwOyAvLyBtZWFuIG9mIChzZXJ2ZXJUaW1lIC0gY2xpZW50VGltZSkgaW4gdGhlIGxhc3Qgc2VyaWVzXG5cbiAgICB0aGlzLnRyYXZlbER1cmF0aW9uID0gMDtcbiAgICB0aGlzLnRyYXZlbER1cmF0aW9uTWluID0gMDtcbiAgICB0aGlzLnRyYXZlbER1cmF0aW9uTWF4ID0gMDsgLy8gVCh0KSA9IFQwICsgUiAqICh0IC0gdDApXG4gICAgLy8gdChUKSA9IHQwICsgKFQgLSBUMCkgLyBSXG5cbiAgICB0aGlzLnNlcnZlclRpbWVSZWZlcmVuY2UgPSAwOyAvLyBUMFxuXG4gICAgdGhpcy5jbGllbnRUaW1lUmVmZXJlbmNlID0gMDsgLy8gdDBcblxuICAgIHRoaXMuZnJlcXVlbmN5UmF0aW8gPSAxOyAvLyBSXG4gICAgLy8gRm9yIHRoZSBmaXJzdCBlc3RpbWF0aW9uLCBTID0gVCBhbmQgcyA9IHRcblxuICAgIHRoaXMuX3N0YWJpbGlzYXRpb25SZXNldCgpO1xuXG4gICAgdGhpcy5waW5nVGltZW91dERlbGF5LmN1cnJlbnQgPSB0aGlzLnBpbmdUaW1lb3V0RGVsYXkubWluO1xuICAgIHRoaXMuZ2V0VGltZUZ1bmN0aW9uID0gZ2V0VGltZUZ1bmN0aW9uO1xuICAgIHRoaXMuc3RhdHVzID0gJ25ldyc7XG4gICAgdGhpcy5zdGF0dXNDaGFuZ2VkVGltZSA9IDA7XG4gICAgdGhpcy5jb25uZWN0aW9uU3RhdHVzID0gJ29mZmxpbmUnO1xuICAgIHRoaXMuY29ubmVjdGlvblN0YXR1c0NoYW5nZWRUaW1lID0gMDtcbiAgfVxuICAvKipcbiAgICogU2V0IHN0YXR1cywgYW5kIHNldCB0aGlzLnN0YXR1c0NoYW5nZWRUaW1lLCB0byBsYXRlclxuICAgKiB1c2Ugc2VlIHtAbGluayBTeW5jQ2xpZW50fmdldFN0YXR1c0R1cmF0aW9ufVxuICAgKiBhbmQge0BsaW5rIFN5bmNDbGllbnR+cmVwb3J0U3RhdHVzfS5cbiAgICpcbiAgICogQHByaXZhdGVcbiAgICogQHBhcmFtIHtTdHJpbmd9IHN0YXR1c1xuICAgKiBAcmV0dXJucyB7T2JqZWN0fSB0aGlzXG4gICAqL1xuXG5cbiAgc2V0U3RhdHVzKHN0YXR1cykge1xuICAgIGlmIChzdGF0dXMgIT09IHRoaXMuc3RhdHVzKSB7XG4gICAgICB0aGlzLnN0YXR1cyA9IHN0YXR1cztcbiAgICAgIHRoaXMuc3RhdHVzQ2hhbmdlZFRpbWUgPSB0aGlzLmdldExvY2FsVGltZSgpO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzO1xuICB9XG4gIC8qKlxuICAgKiBHZXQgdGltZSBzaW5jZSBsYXN0IHN0YXR1cyBjaGFuZ2UuIFNlZSB7QGxpbmsgU3luY0NsaWVudH5zZXRTdGF0dXN9XG4gICAqXG4gICAqIEBwcml2YXRlXG4gICAqIEByZXR1cm5zIHtOdW1iZXJ9IHRpbWUsIGluIHNlY29uZHMsIHNpbmNlIGxhc3Qgc3RhdHVzIGNoYW5nZS5cbiAgICovXG5cblxuICBnZXRTdGF0dXNEdXJhdGlvbigpIHtcbiAgICByZXR1cm4gTWF0aC5tYXgoMCwgdGhpcy5nZXRMb2NhbFRpbWUoKSAtIHRoaXMuc3RhdHVzQ2hhbmdlZFRpbWUpO1xuICB9XG4gIC8qKlxuICAgKiBTZXQgY29ubmVjdGlvblN0YXR1cywgYW5kIHNldCB0aGlzLmNvbm5lY3Rpb25TdGF0dXNDaGFuZ2VkVGltZSwgdG8gbGF0ZXJcbiAgICogdXNlIHtAbGluayBTeW5jQ2xpZW50fmdldENvbm5lY3Rpb25TdGF0dXNEdXJhdGlvbn0gYW5kXG4gICAqIHtAbGluayBTeW5jQ2xpZW50fnJlcG9ydFN0YXR1c30uXG4gICAqXG4gICAqIEBwcml2YXRlXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBjb25uZWN0aW9uU3RhdHVzXG4gICAqIEByZXR1cm5zIHtPYmplY3R9IHRoaXNcbiAgICovXG5cblxuICBzZXRDb25uZWN0aW9uU3RhdHVzKGNvbm5lY3Rpb25TdGF0dXMpIHtcbiAgICBpZiAoY29ubmVjdGlvblN0YXR1cyAhPT0gdGhpcy5jb25uZWN0aW9uU3RhdHVzKSB7XG4gICAgICB0aGlzLmNvbm5lY3Rpb25TdGF0dXMgPSBjb25uZWN0aW9uU3RhdHVzO1xuICAgICAgdGhpcy5jb25uZWN0aW9uU3RhdHVzQ2hhbmdlZFRpbWUgPSB0aGlzLmdldExvY2FsVGltZSgpO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzO1xuICB9XG4gIC8qKlxuICAgKiBHZXQgdGltZSBzaW5jZSBsYXN0IGNvbm5lY3Rpb25TdGF0dXMgY2hhbmdlLlxuICAgKiBTZWUge0BsaW5rIFN5bmNDbGllbnR+c2V0Q29ubmVjdGlvblN0YXR1c31cbiAgICpcbiAgICogQHByaXZhdGVcbiAgICogQHJldHVybnMge051bWJlcn0gdGltZSwgaW4gc2Vjb25kcywgc2luY2UgbGFzdCBjb25uZWN0aW9uU3RhdHVzIGNoYW5nZS5cbiAgICovXG5cblxuICBnZXRDb25uZWN0aW9uU3RhdHVzRHVyYXRpb24oKSB7XG4gICAgcmV0dXJuIE1hdGgubWF4KDAsIHRoaXMuZ2V0TG9jYWxUaW1lKCkgLSB0aGlzLmNvbm5lY3Rpb25TdGF0dXNDaGFuZ2VkVGltZSk7XG4gIH1cbiAgLyoqXG4gICAqIFJlcG9ydCB0aGUgc3RhdHVzIG9mIHRoZSBzeW5jaHJvbmlzYXRpb24gcHJvY2VzcywgaWYgcmVwb3J0RnVuY3Rpb24gaXNcbiAgICogZGVmaW5lZC4gSXQgaXMgY2FsbGVkIGVhY2ggdGltZSB0aGUgZXN0aW1hdGlvbiBvZiB0aGUgc3luY2hyb25pc2VkIHRpbWVcbiAgICogdXBkYXRlcy5cbiAgICpcbiAgICogQHByaXZhdGVcbiAgICogQHBhcmFtIHtTeW5jQ2xpZW50fnJlcG9ydEZ1bmN0aW9ufSByZXBvcnRGdW5jdGlvblxuICAgKi9cblxuXG4gIHJlcG9ydFN0YXR1cyhyZXBvcnRGdW5jdGlvbikge1xuICAgIGlmICh0eXBlb2YgcmVwb3J0RnVuY3Rpb24gIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICByZXBvcnRGdW5jdGlvbih7XG4gICAgICAgIHN0YXR1czogdGhpcy5zdGF0dXMsXG4gICAgICAgIHN0YXR1c0R1cmF0aW9uOiB0aGlzLmdldFN0YXR1c0R1cmF0aW9uKCksXG4gICAgICAgIHRpbWVPZmZzZXQ6IHRoaXMudGltZU9mZnNldCxcbiAgICAgICAgZnJlcXVlbmN5UmF0aW86IHRoaXMuZnJlcXVlbmN5UmF0aW8sXG4gICAgICAgIGNvbm5lY3Rpb246IHRoaXMuY29ubmVjdGlvblN0YXR1cyxcbiAgICAgICAgY29ubmVjdGlvbkR1cmF0aW9uOiB0aGlzLmdldENvbm5lY3Rpb25TdGF0dXNEdXJhdGlvbigpLFxuICAgICAgICBjb25uZWN0aW9uVGltZU91dDogdGhpcy5waW5nVGltZW91dERlbGF5LmN1cnJlbnQsXG4gICAgICAgIHRyYXZlbER1cmF0aW9uOiB0aGlzLnRyYXZlbER1cmF0aW9uLFxuICAgICAgICB0cmF2ZWxEdXJhdGlvbk1pbjogdGhpcy50cmF2ZWxEdXJhdGlvbk1pbixcbiAgICAgICAgdHJhdmVsRHVyYXRpb25NYXg6IHRoaXMudHJhdmVsRHVyYXRpb25NYXhcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuICAvKipcbiAgICogUHJvY2VzcyB0byBzZW5kIHBpbmcgbWVzc2FnZXMuXG4gICAqXG4gICAqIEBwcml2YXRlXG4gICAqIEBwYXJhbSB7U3luY0NsaWVudH5zZW5kRnVuY3Rpb259IHNlbmRGdW5jdGlvblxuICAgKiBAcGFyYW0ge1N5bmNDbGllbnR+cmVwb3J0RnVuY3Rpb259IHJlcG9ydEZ1bmN0aW9uXG4gICAqL1xuXG5cbiAgX19zeW5jTG9vcChzZW5kRnVuY3Rpb24sIHJlcG9ydEZ1bmN0aW9uKSB7XG4gICAgY2xlYXJUaW1lb3V0KHRoaXMudGltZW91dElkKTtcbiAgICArK3RoaXMucGluZ0lkO1xuICAgIHNlbmRGdW5jdGlvbih0aGlzLnBpbmdJZCwgdGhpcy5nZXRMb2NhbFRpbWUoKSk7XG4gICAgdGhpcy50aW1lb3V0SWQgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIC8vIGluY3JlYXNlIHRpbWVvdXQgZHVyYXRpb24gb24gdGltZW91dCwgdG8gYXZvaWQgb3ZlcmZsb3dcbiAgICAgIHRoaXMucGluZ1RpbWVvdXREZWxheS5jdXJyZW50ID0gTWF0aC5taW4odGhpcy5waW5nVGltZW91dERlbGF5LmN1cnJlbnQgKiAyLCB0aGlzLnBpbmdUaW1lb3V0RGVsYXkubWF4KTsgLy8gbG9nKCdzeW5jOnBpbmcgdGltZW91dCA+ICVzJywgdGhpcy5waW5nVGltZW91dERlbGF5LmN1cnJlbnQpO1xuXG4gICAgICB0aGlzLnNldENvbm5lY3Rpb25TdGF0dXMoJ29mZmxpbmUnKTtcbiAgICAgIHRoaXMucmVwb3J0U3RhdHVzKHJlcG9ydEZ1bmN0aW9uKTsgLy8gcmV0cnkgKHllcywgYWx3YXlzIGluY3JlbWVudCBwaW5nSWQpXG5cbiAgICAgIHRoaXMuX19zeW5jTG9vcChzZW5kRnVuY3Rpb24sIHJlcG9ydEZ1bmN0aW9uKTtcbiAgICB9LCBNYXRoLmNlaWwoMTAwMCAqIHRoaXMucGluZ1RpbWVvdXREZWxheS5jdXJyZW50KSk7XG4gIH1cbiAgLyoqXG4gICAqIFN0YXJ0IGEgc3luY2hyb25pc2F0aW9uIHByb2Nlc3MgYnkgcmVnaXN0ZXJpbmcgdGhlIHJlY2VpdmVcbiAgICogZnVuY3Rpb24gcGFzc2VkIGFzIHNlY29uZCBwYXJhbWV0ZXIuIFRoZW4sIHNlbmQgcmVndWxhciBtZXNzYWdlc1xuICAgKiB0byB0aGUgc2VydmVyLCB1c2luZyB0aGUgc2VuZCBmdW5jdGlvbiBwYXNzZWQgYXMgZmlyc3QgcGFyYW1ldGVyLlxuICAgKlxuICAgKiBAcGFyYW0ge1N5bmNDbGllbnR+c2VuZEZ1bmN0aW9ufSBzZW5kRnVuY3Rpb25cbiAgICogQHBhcmFtIHtTeW5jQ2xpZW50fnJlY2VpdmVGdW5jdGlvbn0gcmVjZWl2ZUZ1bmN0aW9uIHRvIHJlZ2lzdGVyXG4gICAqIEBwYXJhbSB7U3luY0NsaWVudH5yZXBvcnRGdW5jdGlvbn0gcmVwb3J0RnVuY3Rpb24gaWYgZGVmaW5lZCwgaXMgY2FsbGVkIHRvXG4gICAqICAgcmVwb3J0IHRoZSBzdGF0dXMsIG9uIGVhY2ggc3RhdHVzIGNoYW5nZSwgYW5kIGVhY2ggdGltZSB0aGUgZXN0aW1hdGlvbiBvZlxuICAgKiAgIHRoZSBzeW5jaHJvbmlzZWQgdGltZSB1cGRhdGVzLlxuICAgKi9cblxuXG4gIHN0YXJ0KHNlbmRGdW5jdGlvbiwgcmVjZWl2ZUZ1bmN0aW9uLCByZXBvcnRGdW5jdGlvbikge1xuICAgIHRoaXMuc2V0U3RhdHVzKCdzdGFydHVwJyk7XG4gICAgdGhpcy5zZXRDb25uZWN0aW9uU3RhdHVzKCdvZmZsaW5lJyk7XG4gICAgdGhpcy5zZXJpZXNEYXRhID0gW107XG4gICAgdGhpcy5zZXJpZXNEYXRhTmV4dEluZGV4ID0gMDtcbiAgICB0aGlzLmxvbmdUZXJtRGF0YSA9IFtdO1xuICAgIHRoaXMubG9uZ1Rlcm1EYXRhTmV4dEluZGV4ID0gMDtcbiAgICByZWNlaXZlRnVuY3Rpb24oKHBpbmdJZCwgY2xpZW50UGluZ1RpbWUsIHNlcnZlclBpbmdUaW1lLCBzZXJ2ZXJQb25nVGltZSkgPT4ge1xuICAgICAgLy8gYWNjZXB0IG9ubHkgdGhlIHBvbmcgdGhhdCBjb3JyZXNwb25kcyB0byB0aGUgbGFzdCBwaW5nXG4gICAgICBpZiAocGluZ0lkID09PSB0aGlzLnBpbmdJZCkge1xuICAgICAgICArK3RoaXMucGluZ1Nlcmllc0NvdW50O1xuICAgICAgICBjbGVhclRpbWVvdXQodGhpcy50aW1lb3V0SWQpO1xuICAgICAgICB0aGlzLnNldENvbm5lY3Rpb25TdGF0dXMoJ29ubGluZScpOyAvLyByZWR1Y2UgdGltZW91dCBkdXJhdGlvbiBvbiBwb25nLCBmb3IgYmV0dGVyIHJlYWN0aXZpdHlcblxuICAgICAgICB0aGlzLnBpbmdUaW1lb3V0RGVsYXkuY3VycmVudCA9IE1hdGgubWF4KHRoaXMucGluZ1RpbWVvdXREZWxheS5jdXJyZW50ICogMC43NSwgdGhpcy5waW5nVGltZW91dERlbGF5Lm1pbik7IC8vIHRpbWUtZGlmZmVyZW5jZXMgYXJlIHZhbGlkIG9uIGEgc2luZ2xlLXNpZGUgb25seSAoY2xpZW50IG9yIHNlcnZlcilcblxuICAgICAgICBjb25zdCBjbGllbnRQb25nVGltZSA9IHRoaXMuZ2V0TG9jYWxUaW1lKCk7XG4gICAgICAgIGNvbnN0IGNsaWVudFRpbWUgPSAwLjUgKiAoY2xpZW50UG9uZ1RpbWUgKyBjbGllbnRQaW5nVGltZSk7XG4gICAgICAgIGNvbnN0IHNlcnZlclRpbWUgPSAwLjUgKiAoc2VydmVyUG9uZ1RpbWUgKyBzZXJ2ZXJQaW5nVGltZSk7XG4gICAgICAgIGNvbnN0IHRyYXZlbER1cmF0aW9uID0gTWF0aC5tYXgoMCwgY2xpZW50UG9uZ1RpbWUgLSBjbGllbnRQaW5nVGltZSAtIChzZXJ2ZXJQb25nVGltZSAtIHNlcnZlclBpbmdUaW1lKSk7XG4gICAgICAgIGNvbnN0IG9mZnNldFRpbWUgPSBzZXJ2ZXJUaW1lIC0gY2xpZW50VGltZTsgLy8gb3JkZXIgaXMgaW1wb3J0YW50IGZvciBzb3J0aW5nLCBsYXRlci5cblxuICAgICAgICB0aGlzLnNlcmllc0RhdGFbdGhpcy5zZXJpZXNEYXRhTmV4dEluZGV4XSA9IFt0cmF2ZWxEdXJhdGlvbiwgb2Zmc2V0VGltZSwgY2xpZW50VGltZSwgc2VydmVyVGltZV07XG4gICAgICAgIHRoaXMuc2VyaWVzRGF0YU5leHRJbmRleCA9ICsrdGhpcy5zZXJpZXNEYXRhTmV4dEluZGV4ICUgdGhpcy5zZXJpZXNEYXRhTGVuZ3RoOyAvLyBsb2coJ3BpbmcgJXMsIHRyYXZlbCA9ICVzLCBvZmZzZXQgPSAlcywgY2xpZW50ID0gJXMsIHNlcnZlciA9ICVzJyxcbiAgICAgICAgLy8gICAgIHBpbmdJZCwgdHJhdmVsRHVyYXRpb24sIG9mZnNldFRpbWUsIGNsaWVudFRpbWUsIHNlcnZlclRpbWUpO1xuICAgICAgICAvLyBlbmQgb2YgYSBzZXJpZXNcblxuICAgICAgICBpZiAodGhpcy5waW5nU2VyaWVzQ291bnQgPj0gdGhpcy5waW5nU2VyaWVzSXRlcmF0aW9ucyAmJiB0aGlzLnNlcmllc0RhdGEubGVuZ3RoID49IHRoaXMuc2VyaWVzRGF0YUxlbmd0aCkge1xuICAgICAgICAgIC8vIHBsYW4gdGhlIGJlZ2luaW5nIG9mIHRoZSBuZXh0IHNlcmllc1xuICAgICAgICAgIHRoaXMucGluZ0RlbGF5ID0gdGhpcy5waW5nU2VyaWVzRGVsYXkubWluICsgTWF0aC5yYW5kb20oKSAqICh0aGlzLnBpbmdTZXJpZXNEZWxheS5tYXggLSB0aGlzLnBpbmdTZXJpZXNEZWxheS5taW4pO1xuICAgICAgICAgIHRoaXMucGluZ1Nlcmllc0NvdW50ID0gMDsgLy8gc29ydCBieSB0cmF2ZWwgdGltZSBmaXJzdCwgdGhlbiBvZmZzZXQgdGltZS5cblxuICAgICAgICAgIGNvbnN0IHNvcnRlZCA9IHRoaXMuc2VyaWVzRGF0YS5zbGljZSgwKS5zb3J0KGRhdGFDb21wYXJlKTtcbiAgICAgICAgICBjb25zdCBzZXJpZXNUcmF2ZWxEdXJhdGlvbiA9IHNvcnRlZFswXVswXTsgLy8gV2hlbiB0aGUgY2xvY2sgdGljayBpcyBsb25nIGVub3VnaCxcbiAgICAgICAgICAvLyBzb21lIHRyYXZlbCB0aW1lcyAoZGltZW5zaW9uIDApIG1pZ2h0IGJlIGlkZW50aWNhbC5cbiAgICAgICAgICAvLyBUaGVuLCB1c2UgdGhlIG9mZnNldCBtZWRpYW4gKGRpbWVuc2lvbiAxIGlzIHRoZSBzZWNvbmQgc29ydCBrZXkpXG4gICAgICAgICAgLy8gb2Ygc2hvcnRlc3QgdHJhdmVsIGR1cmF0aW9uXG5cbiAgICAgICAgICBsZXQgcXVpY2sgPSAwO1xuXG4gICAgICAgICAgd2hpbGUgKHF1aWNrIDwgc29ydGVkLmxlbmd0aCAmJiBzb3J0ZWRbcXVpY2tdWzBdIDw9IHNlcmllc1RyYXZlbER1cmF0aW9uICogMS4wMSkge1xuICAgICAgICAgICAgKytxdWljaztcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBxdWljayA9IE1hdGgubWF4KDAsIHF1aWNrIC0gMSk7XG4gICAgICAgICAgY29uc3QgbWVkaWFuID0gTWF0aC5mbG9vcihxdWljayAvIDIpO1xuICAgICAgICAgIGNvbnN0IHNlcmllc0NsaWVudFRpbWUgPSBzb3J0ZWRbbWVkaWFuXVsyXTtcbiAgICAgICAgICBjb25zdCBzZXJpZXNTZXJ2ZXJUaW1lID0gc29ydGVkW21lZGlhbl1bM107XG4gICAgICAgICAgY29uc3Qgc2VyaWVzQ2xpZW50U3F1YXJlZFRpbWUgPSBzZXJpZXNDbGllbnRUaW1lICogc2VyaWVzQ2xpZW50VGltZTtcbiAgICAgICAgICBjb25zdCBzZXJpZXNDbGllbnRTZXJ2ZXJUaW1lID0gc2VyaWVzQ2xpZW50VGltZSAqIHNlcmllc1NlcnZlclRpbWU7XG4gICAgICAgICAgdGhpcy5sb25nVGVybURhdGFbdGhpcy5sb25nVGVybURhdGFOZXh0SW5kZXhdID0gW3Nlcmllc1RyYXZlbER1cmF0aW9uLCBzZXJpZXNDbGllbnRUaW1lLCBzZXJpZXNTZXJ2ZXJUaW1lLCBzZXJpZXNDbGllbnRTcXVhcmVkVGltZSwgc2VyaWVzQ2xpZW50U2VydmVyVGltZV07XG4gICAgICAgICAgdGhpcy5sb25nVGVybURhdGFOZXh0SW5kZXggPSArK3RoaXMubG9uZ1Rlcm1EYXRhTmV4dEluZGV4ICUgdGhpcy5sb25nVGVybURhdGFMZW5ndGg7IC8vIG1lYW4gb2YgdGhlIHRpbWUgb2Zmc2V0IG92ZXIgMyBzYW1wbGVzIGFyb3VuZCBtZWRpYW5cbiAgICAgICAgICAvLyAobGltaXRlZCB0byBzaG9ydGVzdCB0cmF2ZWwgZHVyYXRpb24pXG5cbiAgICAgICAgICBjb25zdCBhcm91bmRNZWRpYW4gPSBzb3J0ZWQuc2xpY2UoTWF0aC5tYXgoMCwgbWVkaWFuIC0gMSksIE1hdGgubWluKHF1aWNrLCBtZWRpYW4gKyAxKSArIDEpO1xuICAgICAgICAgIHRoaXMudGltZU9mZnNldCA9IG1lYW4oYXJvdW5kTWVkaWFuLCAxKTtcbiAgICAgICAgICBjb25zdCB1cGRhdGVDbGllbnRUaW1lID0gdGhpcy5nZXRMb2NhbFRpbWUoKTtcbiAgICAgICAgICBjb25zdCB1cGRhdGVTZXJ2ZXJUaW1lQmVmb3JlID0gdGhpcy5nZXRTeW5jVGltZSh1cGRhdGVDbGllbnRUaW1lKTtcblxuICAgICAgICAgIGlmICh0aGlzLnN0YXR1cyA9PT0gJ3N0YXJ0dXAnIHx8IHRoaXMuc3RhdHVzID09PSAndHJhaW5pbmcnICYmIHRoaXMuZ2V0U3RhdHVzRHVyYXRpb24oKSA8IHRoaXMubG9uZ1Rlcm1EYXRhVHJhaW5pbmdEdXJhdGlvbikge1xuICAgICAgICAgICAgLy8gc2V0IG9ubHkgdGhlIHBoYXNlIG9mZnNldCwgbm90IHRoZSBmcmVxdWVuY3lcbiAgICAgICAgICAgIHRoaXMuc2VydmVyVGltZVJlZmVyZW5jZSA9IHRoaXMudGltZU9mZnNldDtcbiAgICAgICAgICAgIHRoaXMuY2xpZW50VGltZVJlZmVyZW5jZSA9IDA7XG4gICAgICAgICAgICB0aGlzLmZyZXF1ZW5jeVJhdGlvID0gMTtcblxuICAgICAgICAgICAgaWYgKHRoaXMuc3RhdHVzICE9PSAnc3RhcnR1cCcpIHtcbiAgICAgICAgICAgICAgLy8gbm8gc3RhYmlsaXNhdGlvbiBvbiBzdGFydHVwXG4gICAgICAgICAgICAgIHRoaXMuX3N0YWJpbGlzYXRpb25VcGRhdGUodXBkYXRlQ2xpZW50VGltZSwgdXBkYXRlU2VydmVyVGltZUJlZm9yZSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuc2V0U3RhdHVzKCd0cmFpbmluZycpO1xuICAgICAgICAgICAgbG9nKCdUID0gJXMgKyAlcyAqICglcyAtICVzKSA9ICVzJywgdGhpcy5zZXJ2ZXJUaW1lUmVmZXJlbmNlLCB0aGlzLmZyZXF1ZW5jeVJhdGlvLCBzZXJpZXNDbGllbnRUaW1lLCB0aGlzLmNsaWVudFRpbWVSZWZlcmVuY2UsIHRoaXMuZ2V0U3luY1RpbWUoc2VyaWVzQ2xpZW50VGltZSkpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmICh0aGlzLnN0YXR1cyA9PT0gJ3RyYWluaW5nJyAmJiB0aGlzLmdldFN0YXR1c0R1cmF0aW9uKCkgPj0gdGhpcy5sb25nVGVybURhdGFUcmFpbmluZ0R1cmF0aW9uIHx8IHRoaXMuc3RhdHVzID09PSAnc3luYycpIHtcbiAgICAgICAgICAgIC8vIGxpbmVhciByZWdyZXNzaW9uLCBSID0gY292YXJpYW5jZSh0LFQpIC8gdmFyaWFuY2UodClcbiAgICAgICAgICAgIGNvbnN0IHJlZ0NsaWVudFRpbWUgPSBtZWFuKHRoaXMubG9uZ1Rlcm1EYXRhLCAxKTtcbiAgICAgICAgICAgIGNvbnN0IHJlZ1NlcnZlclRpbWUgPSBtZWFuKHRoaXMubG9uZ1Rlcm1EYXRhLCAyKTtcbiAgICAgICAgICAgIGNvbnN0IHJlZ0NsaWVudFNxdWFyZWRUaW1lID0gbWVhbih0aGlzLmxvbmdUZXJtRGF0YSwgMyk7XG4gICAgICAgICAgICBjb25zdCByZWdDbGllbnRTZXJ2ZXJUaW1lID0gbWVhbih0aGlzLmxvbmdUZXJtRGF0YSwgNCk7XG4gICAgICAgICAgICBjb25zdCBjb3ZhcmlhbmNlID0gcmVnQ2xpZW50U2VydmVyVGltZSAtIHJlZ0NsaWVudFRpbWUgKiByZWdTZXJ2ZXJUaW1lO1xuICAgICAgICAgICAgY29uc3QgdmFyaWFuY2UgPSByZWdDbGllbnRTcXVhcmVkVGltZSAtIHJlZ0NsaWVudFRpbWUgKiByZWdDbGllbnRUaW1lO1xuXG4gICAgICAgICAgICBpZiAodmFyaWFuY2UgPiAwKSB7XG4gICAgICAgICAgICAgIC8vIHVwZGF0ZSBmcmVxIGFuZCBzaGlmdFxuICAgICAgICAgICAgICB0aGlzLmZyZXF1ZW5jeVJhdGlvID0gY292YXJpYW5jZSAvIHZhcmlhbmNlO1xuICAgICAgICAgICAgICB0aGlzLmNsaWVudFRpbWVSZWZlcmVuY2UgPSByZWdDbGllbnRUaW1lO1xuICAgICAgICAgICAgICB0aGlzLnNlcnZlclRpbWVSZWZlcmVuY2UgPSByZWdTZXJ2ZXJUaW1lOyAvLyBleGNsdWRlIGJvdW5kcywgdG8gZW5zdXJlIHN0cmljdCBtb25vdG9uaWNpdHlcblxuICAgICAgICAgICAgICBpZiAodGhpcy5mcmVxdWVuY3lSYXRpbyA+IDEgLSBTeW5jQ2xpZW50Lm1pbmltdW1TdGFiaWxpdHkgJiYgdGhpcy5mcmVxdWVuY3lSYXRpbyA8IDEgKyBTeW5jQ2xpZW50Lm1pbmltdW1TdGFiaWxpdHkpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNldFN0YXR1cygnc3luYycpO1xuXG4gICAgICAgICAgICAgICAgdGhpcy5fc3RhYmlsaXNhdGlvblVwZGF0ZSh1cGRhdGVDbGllbnRUaW1lLCB1cGRhdGVTZXJ2ZXJUaW1lQmVmb3JlKTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBsb2coJ2Nsb2NrIGZyZXF1ZW5jeSByYXRpbyBvdXQgb2Ygc3luYzogJXMsIHRyYWluaW5nIGFnYWluJywgdGhpcy5mcmVxdWVuY3lSYXRpbyk7IC8vIHN0YXJ0IHRoZSB0cmFpbmluZyBhZ2FpbiBmcm9tIHRoZSBsYXN0IHNlcmllc1xuXG4gICAgICAgICAgICAgICAgdGhpcy5zZXJ2ZXJUaW1lUmVmZXJlbmNlID0gdGhpcy50aW1lT2Zmc2V0OyAvLyBvZmZzZXQgb25seVxuXG4gICAgICAgICAgICAgICAgdGhpcy5jbGllbnRUaW1lUmVmZXJlbmNlID0gMDtcbiAgICAgICAgICAgICAgICB0aGlzLmZyZXF1ZW5jeVJhdGlvID0gMTtcblxuICAgICAgICAgICAgICAgIHRoaXMuX3N0YWJpbGlzYXRpb25SZXNldCgpO1xuXG4gICAgICAgICAgICAgICAgdGhpcy5zZXRTdGF0dXMoJ3RyYWluaW5nJyk7XG4gICAgICAgICAgICAgICAgdGhpcy5sb25nVGVybURhdGFbMF0gPSBbc2VyaWVzVHJhdmVsRHVyYXRpb24sIHNlcmllc0NsaWVudFRpbWUsIHNlcmllc1NlcnZlclRpbWUsIHNlcmllc0NsaWVudFNxdWFyZWRUaW1lLCBzZXJpZXNDbGllbnRTZXJ2ZXJUaW1lXTtcbiAgICAgICAgICAgICAgICB0aGlzLmxvbmdUZXJtRGF0YS5sZW5ndGggPSAxO1xuICAgICAgICAgICAgICAgIHRoaXMubG9uZ1Rlcm1EYXRhTmV4dEluZGV4ID0gMTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBsb2coJ1QgPSAlcyArICVzICogKCVzIC0gJXMpID0gJXMnLCB0aGlzLnNlcnZlclRpbWVSZWZlcmVuY2UsIHRoaXMuZnJlcXVlbmN5UmF0aW8sIHNlcmllc0NsaWVudFRpbWUsIHRoaXMuY2xpZW50VGltZVJlZmVyZW5jZSwgdGhpcy5nZXRTeW5jVGltZShzZXJpZXNDbGllbnRUaW1lKSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgdGhpcy50cmF2ZWxEdXJhdGlvbiA9IG1lYW4oc29ydGVkLCAwKTtcbiAgICAgICAgICB0aGlzLnRyYXZlbER1cmF0aW9uTWluID0gc29ydGVkWzBdWzBdO1xuICAgICAgICAgIHRoaXMudHJhdmVsRHVyYXRpb25NYXggPSBzb3J0ZWRbc29ydGVkLmxlbmd0aCAtIDFdWzBdO1xuICAgICAgICAgIHRoaXMucmVwb3J0U3RhdHVzKHJlcG9ydEZ1bmN0aW9uKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyB3ZSBhcmUgaW4gYSBzZXJpZXMsIHVzZSB0aGUgcGluZ0ludGVydmFsIHZhbHVlXG4gICAgICAgICAgdGhpcy5waW5nRGVsYXkgPSB0aGlzLnBpbmdTZXJpZXNQZXJpb2Q7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnRpbWVvdXRJZCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgIHRoaXMuX3N5bmNMb29wKHNlbmRGdW5jdGlvbiwgcmVwb3J0RnVuY3Rpb24pO1xuICAgICAgICB9LCBNYXRoLmNlaWwoMTAwMCAqIHRoaXMucGluZ0RlbGF5KSk7XG4gICAgICB9IC8vIHBpbmcgYW5kIHBvbmcgSUQgbWF0Y2hcblxuICAgIH0pOyAvLyByZWNlaXZlIGZ1bmN0aW9uXG5cbiAgICB0aGlzLl9zeW5jTG9vcChzZW5kRnVuY3Rpb24sIHJlcG9ydEZ1bmN0aW9uKTtcbiAgfVxuICAvKipcbiAgICogR2V0IGxvY2FsIHRpbWUsIG9yIGNvbnZlcnQgYSBzeW5jaHJvbmlzZWQgdGltZSB0byBhIGxvY2FsIHRpbWUuXG4gICAqXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBbc3luY1RpbWU9dW5kZWZpbmVkXSAtIEdldCBsb2NhbCB0aW1lIGFjY29yZGluZyB0byBnaXZlblxuICAgKiAgZ2l2ZW4gYHN5bmNUaW1lYCwgaWYgYHN5bmNUaW1lYCBpcyBub3QgZGVmaW5lZCByZXR1cm5zIGN1cnJlbnQgbG9jYWwgdGltZS5cbiAgICogQHJldHVybnMge051bWJlcn0gbG9jYWwgdGltZSwgaW4gc2Vjb25kc1xuICAgKi9cblxuXG4gIGdldExvY2FsVGltZShzeW5jVGltZSkge1xuICAgIGlmICh0eXBlb2Ygc3luY1RpbWUgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAvLyByZWFkIHQgZnJvbSBsb2NhbCBjbG9ja1xuICAgICAgcmV0dXJuIHRoaXMuZ2V0VGltZUZ1bmN0aW9uKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIFMsIHN0YWJpbGlzZWQgc3luYyB0aW1lXG4gICAgICBsZXQgVCA9IHN5bmNUaW1lO1xuXG4gICAgICBpZiAodGhpcy5lc3RpbWF0aW9uTW9ub3RvbmljaXR5ICYmIFQgPCB0aGlzLnN0YWJpbGlzYXRpb25TZXJ2ZXJUaW1lRW5kKSB7XG4gICAgICAgIC8vIHJlbW92ZSBzdGFiaWxpc2F0aW9uIGJlZm9yZSBjb252ZXJzaW9uXG4gICAgICAgIC8vIFMgLT4gVFxuICAgICAgICBjb25zdCBTc3MgPSBNYXRoLm1heCh0aGlzLnN0YWJpbGlzYXRpb25TZXJ2ZXJUaW1lU3RhcnQsIFQpO1xuICAgICAgICBjb25zdCBzdGFiaWxpc2F0aW9uID0gdGhpcy5zdGFiaWxpc2F0aW9uT2Zmc2V0ICogKHRoaXMuc3RhYmlsaXNhdGlvblNlcnZlclRpbWVFbmQgLSBTc3MpIC8gKHRoaXMuc3RhYmlsaXNhdGlvblNlcnZlclRpbWVFbmQgLSB0aGlzLnN0YWJpbGlzYXRpb25TZXJ2ZXJUaW1lU3RhcnQpO1xuICAgICAgICBUIC09IHN0YWJpbGlzYXRpb247XG4gICAgICB9IC8vIGNvbnZlcnNpb246IHQoVCkgPSB0MCArIChUIC0gVDApIC8gUlxuICAgICAgLy8gVCAtPiB0XG5cblxuICAgICAgcmV0dXJuIHRoaXMuY2xpZW50VGltZVJlZmVyZW5jZSArIChUIC0gdGhpcy5zZXJ2ZXJUaW1lUmVmZXJlbmNlKSAvIHRoaXMuZnJlcXVlbmN5UmF0aW87XG4gICAgfVxuICB9XG4gIC8qKlxuICAgKiBHZXQgc3luY2hyb25pc2VkIHRpbWUsIG9yIGNvbnZlcnQgYSBsb2NhbCB0aW1lIHRvIGEgc3luY2hyb25pc2VkIHRpbWUuXG4gICAqXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBbbG9jYWxUaW1lPXVuZGVmaW5lZF0gLSBHZXQgc3luYyB0aW1lIGFjY29yZGluZyB0byBnaXZlblxuICAgKiAgZ2l2ZW4gYGxvY2FsVGltZWAsIGlmIGBsb2NhbFRpbWVgIGlzIG5vdCBkZWZpbmVkIHJldHVybnMgY3VycmVudCBzeW5jIHRpbWUuXG4gICAqIEByZXR1cm5zIHtOdW1iZXJ9IHN5bmNocm9uaXNlZCB0aW1lLCBpbiBzZWNvbmRzLlxuICAgKi9cblxuXG4gIGdldFN5bmNUaW1lKGxvY2FsVGltZSA9IHRoaXMuZ2V0TG9jYWxUaW1lKCkpIHtcbiAgICAvLyBhbHdheXMgY29udmVydDogVCh0KSA9IFQwICsgUiAqICh0IC0gdDApXG4gICAgLy8gdCAtPiBUXG4gICAgbGV0IFQgPSB0aGlzLnNlcnZlclRpbWVSZWZlcmVuY2UgKyB0aGlzLmZyZXF1ZW5jeVJhdGlvICogKGxvY2FsVGltZSAtIHRoaXMuY2xpZW50VGltZVJlZmVyZW5jZSk7XG5cbiAgICBpZiAodGhpcy5lc3RpbWF0aW9uTW9ub3RvbmljaXR5ICYmIGxvY2FsVGltZSA8IHRoaXMuc3RhYmlsaXNhdGlvbkNsaWVudFRpbWVFbmQpIHtcbiAgICAgIGNvbnN0IHQgPSBNYXRoLm1heCh0aGlzLnN0YWJpbGlzYXRpb25DbGllbnRUaW1lU3RhcnQsIGxvY2FsVGltZSk7IC8vIGFkZCBzdGFiaWxpc2F0aW9uIGFmdGVyIGNvbnZlcnNpb25cbiAgICAgIC8vIFQgLT4gU1xuXG4gICAgICBjb25zdCBzdGFiaWxpc2F0aW9uID0gdGhpcy5zdGFiaWxpc2F0aW9uT2Zmc2V0ICogKHRoaXMuc3RhYmlsaXNhdGlvbkNsaWVudFRpbWVFbmQgLSB0KSAvICh0aGlzLnN0YWJpbGlzYXRpb25DbGllbnRUaW1lRW5kIC0gdGhpcy5zdGFiaWxpc2F0aW9uQ2xpZW50VGltZVN0YXJ0KTtcbiAgICAgIFQgKz0gc3RhYmlsaXNhdGlvbjtcbiAgICB9XG5cbiAgICByZXR1cm4gVDtcbiAgfVxuICAvKipcbiAgICogUHJvY2VzcyB0byBzZW5kIHBpbmcgbWVzc2FnZXMuXG4gICAqXG4gICAqIEBwcml2YXRlXG4gICAqIEBwYXJhbSB7U3luY0NsaWVudH5zZW5kRnVuY3Rpb259IHNlbmRGdW5jdGlvblxuICAgKiBAcGFyYW0ge1N5bmNDbGllbnR+cmVwb3J0RnVuY3Rpb259IHJlcG9ydEZ1bmN0aW9uXG4gICAqL1xuXG5cbiAgX3N5bmNMb29wKHNlbmRGdW5jdGlvbiwgcmVwb3J0RnVuY3Rpb24pIHtcbiAgICBjbGVhclRpbWVvdXQodGhpcy50aW1lb3V0SWQpO1xuICAgICsrdGhpcy5waW5nSWQ7XG4gICAgc2VuZEZ1bmN0aW9uKHRoaXMucGluZ0lkLCB0aGlzLmdldExvY2FsVGltZSgpKTtcbiAgICB0aGlzLnRpbWVvdXRJZCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgLy8gaW5jcmVhc2UgdGltZW91dCBkdXJhdGlvbiBvbiB0aW1lb3V0LCB0byBhdm9pZCBvdmVyZmxvd1xuICAgICAgdGhpcy5waW5nVGltZW91dERlbGF5LmN1cnJlbnQgPSBNYXRoLm1pbih0aGlzLnBpbmdUaW1lb3V0RGVsYXkuY3VycmVudCAqIDIsIHRoaXMucGluZ1RpbWVvdXREZWxheS5tYXgpO1xuICAgICAgbG9nKCdzeW5jOnBpbmcgdGltZW91dCA+ICVzJywgdGhpcy5waW5nVGltZW91dERlbGF5LmN1cnJlbnQpO1xuICAgICAgdGhpcy5zZXRDb25uZWN0aW9uU3RhdHVzKCdvZmZsaW5lJyk7XG4gICAgICB0aGlzLnJlcG9ydFN0YXR1cyhyZXBvcnRGdW5jdGlvbik7IC8vIHJldHJ5ICh5ZXMsIGFsd2F5cyBpbmNyZW1lbnQgcGluZ0lkKVxuXG4gICAgICB0aGlzLl9zeW5jTG9vcChzZW5kRnVuY3Rpb24sIHJlcG9ydEZ1bmN0aW9uKTtcbiAgICB9LCBNYXRoLmNlaWwoMTAwMCAqIHRoaXMucGluZ1RpbWVvdXREZWxheS5jdXJyZW50KSk7XG4gIH1cbiAgLyoqXG4gICAqIEBwcml2YXRlXG4gICAqL1xuXG5cbiAgX3N0YWJpbGlzYXRpb25SZXNldCgpIHtcbiAgICAvLyBUbyBzdGFiaWxpc2UgdGhlIGVzdGltYXRpb24gb2Ygc3luY2hyb25pc2VkIHRpbWUsIGNvbXBlbnNhdGUgdGhlXG4gICAgLy8gZGlmZmVyZW5jZSBvZiB0aGUgbGFzdCBlc3RpbWF0aW9uIG9mIHRoZSBzZXJ2ZXIgdGltZSB0byB0aGUgY3VycmVudFxuICAgIC8vIG9uZS4gVGhlIGNvbXBlbnNhdGlvbiBpcyBmdWxsIGF0IHRoZSBzdGFydCB0aW1lIChhbmQgYmVmb3JlKSwgYW5kIDAgYXRcbiAgICAvLyB0aGUgZW5kIHRpbWUgKGFuZCBhZnRlcikuXG4gICAgdGhpcy5zdGFiaWxpc2F0aW9uT2Zmc2V0ID0gMDsgLy8gU28sIGZ1bGwgY29tcGVuc2F0aW9uXG4gICAgLy8gUyh0KSA9IFQodCkgKyBTbyAqICh0c2UgLSB0KSAvICh0c2UgLSB0c3MpICwgd2l0aCB0IGluIF10c3MsIHRzZVtcbiAgICAvLyBTKHQpID0gVCh0KSArIFNvLCB3aXRoIHQgPD0gdHNzXG4gICAgLy8gUyh0KSA9IFQodCksIHdpdGggdCA+PSB0c2VcblxuICAgIHRoaXMuc3RhYmlsaXNhdGlvbkNsaWVudFRpbWVTdGFydCA9IC1JbmZpbml0eTsgLy8gdHNzXG5cbiAgICB0aGlzLnN0YWJpbGlzYXRpb25DbGllbnRUaW1lRW5kID0gLUluZmluaXR5OyAvLyB0c2VcbiAgICAvLyB0KFQpID0gdChTIC0gU28gKiAoU3NlIC0gUykgLyAoU3NlIC0gU3NzKSksIHdpdGggUyBpbiBdU3NzLCBTc2VbXG4gICAgLy8gdChUKSA9IHQoUyAtIFNvKSwgd2l0aCBTIDw9IFNzc1xuICAgIC8vIHQoVCkgPSB0KFMpXG4gICAgLy8gc3RhYmlsaXNlZCB0aW1lcywgbm90IGRpcmVjdCBzZXJ2ZXIgdGltZXNcblxuICAgIHRoaXMuc3RhYmlsaXNhdGlvblNlcnZlclRpbWVTdGFydCA9IC1JbmZpbml0eTsgLy8gU3NzXG5cbiAgICB0aGlzLnN0YWJpbGlzYXRpb25TZXJ2ZXJUaW1lRW5kID0gLUluZmluaXR5OyAvLyBTc2VcbiAgfVxuICAvKipcbiAgICogVGhpcyBmdW5jdGlvbiBtdXN0IGJlIGNhbGxlZCBhZnRlciBzeW5jaHJvbmlzYXRpb24gcGFyYW1ldGVycyB1cGRhdGVkLCB0b1xuICAgKiB1cGRhdGUgc3RhYmlsaXNhdGlvbiBwYXJhbWV0ZXJzLlxuICAgKlxuICAgKiBAcHJpdmF0ZVxuICAgKiBAcGFyYW0ge051bWJlcn0gdXBkYXRlQ2xpZW50VGltZSBsb2NhbCB0aW1lIHdoZW4gc3luY2hyb25pc2F0aW9uIHVwZGF0ZWRcbiAgICogQHBhcmFtIHtOdW1iZXJ9IHVwZGF0ZVNlcnZlclRpbWVCZWZvcmUgZXN0aW1hdGVkIHNlcnZlciB0aW1lIGp1c3QgYmVmb3JlXG4gICAqICAgc3luY2hyb25pc2F0aW9uIHVwZGF0ZSAod2l0aCBvbGQgcGFyYW1ldGVycylcbiAgICovXG5cblxuICBfc3RhYmlsaXNhdGlvblVwZGF0ZSh1cGRhdGVDbGllbnRUaW1lLCB1cGRhdGVTZXJ2ZXJUaW1lQmVmb3JlKSB7XG4gICAgaWYgKCF0aGlzLmVzdGltYXRpb25Nb25vdG9uaWNpdHkgfHwgdGhpcy5zdGF0dXMgPT09ICdzdGFydHVwJykge1xuICAgICAgLy8gbm8gc3RhYmlsaXNhdGlvbiBvbiBzdGFydHVwXG4gICAgICByZXR1cm47XG4gICAgfSAvLyBlc3RpbWF0ZWQgc2VydmVyIHRpbWUganVzdCBhZnRlciBzeW5jaHJvbmlzYXRpb24gdXBkYXRlXG4gICAgLy8gd2l0aCBuZXcgcGFyYW1ldGVycyBhbmQgd2l0aG91dCBzdGFiaWxpc2F0aW9uICh5ZXQpXG5cblxuICAgIHRoaXMuX3N0YWJpbGlzYXRpb25SZXNldCgpO1xuXG4gICAgY29uc3QgdXBkYXRlU2VydmVyVGltZUFmdGVyID0gdGhpcy5nZXRTeW5jVGltZSh1cGRhdGVDbGllbnRUaW1lKTsgLy8gU28gaXMgYSBjb21wZW5zYXRpb24gYWRkZWQgdG8gc3luY1RpbWVcblxuICAgIHRoaXMuc3RhYmlsaXNhdGlvbk9mZnNldCA9IHVwZGF0ZVNlcnZlclRpbWVCZWZvcmUgLSB1cGRhdGVTZXJ2ZXJUaW1lQWZ0ZXI7IC8vIHRzc1xuXG4gICAgdGhpcy5zdGFiaWxpc2F0aW9uQ2xpZW50VGltZVN0YXJ0ID0gdXBkYXRlQ2xpZW50VGltZTsgLy8gdHNlXG5cbiAgICB0aGlzLnN0YWJpbGlzYXRpb25DbGllbnRUaW1lRW5kID0gTWF0aC5hYnModXBkYXRlU2VydmVyVGltZUJlZm9yZSAtIHVwZGF0ZVNlcnZlclRpbWVBZnRlcikgLyB0aGlzLmVzdGltYXRpb25TdGFiaWxpdHkgKyB0aGlzLnN0YWJpbGlzYXRpb25DbGllbnRUaW1lU3RhcnQ7IC8vIEZ1bGwgY29tcGVuc2F0aW9uIGF0IFNzcywgdG8gbWF0Y2ggbmV3IHNlcnZlciB0aW1lIHdpdCBuZXcgb25lXG4gICAgLy8gU3NzID0gVHNzICsgU29cblxuICAgIHRoaXMuc3RhYmlsaXNhdGlvblNlcnZlclRpbWVTdGFydCA9IHVwZGF0ZVNlcnZlclRpbWVCZWZvcmU7IC8vIFNzZVxuICAgIC8vIE5vIGNvbXBlbnNhdGlvbiBmb3IgUyA+PSBTc2VcbiAgICAvLyBBcyBnZXRTeW5jVGltZSBkb2VzIF9ub3RfIHVzZSBzdGFiaWxpc2F0aW9uIHNlcnZlciB0aW1lcyxcbiAgICAvLyB0aGUgbmV4dCBjYWxsIGlzIHBvc3NpYmxlIHRvIGJvb3RzdHJhcCBnZXRMb2NhbFRpbWVcblxuICAgIHRoaXMuc3RhYmlsaXNhdGlvblNlcnZlclRpbWVFbmQgPSB0aGlzLmdldFN5bmNUaW1lKHRoaXMuc3RhYmlsaXNhdGlvbkNsaWVudFRpbWVFbmQpO1xuICAgIGxvZygnc3RhYmlsaXNhdGlvbiB1cGRhdGVkJywgJ1NvID0gJywgdGhpcy5zdGFiaWxpc2F0aW9uT2Zmc2V0LCAnLCcsICd0c3MgPSAnLCB0aGlzLnN0YWJpbGlzYXRpb25DbGllbnRUaW1lU3RhcnQsICcsJywgJ3RzZSA9ICcsIHRoaXMuc3RhYmlsaXNhdGlvbkNsaWVudFRpbWVFbmQsICcsJywgJ1NzcyA9ICcsIHRoaXMuc3RhYmlsaXNhdGlvblNlcnZlclRpbWVTdGFydCwgJywnLCAnU3NlID0gJywgdGhpcy5zdGFiaWxpc2F0aW9uU2VydmVyVGltZUVuZCwgJywnLCAnVGJlZm9yZSA9ICcsIHVwZGF0ZVNlcnZlclRpbWVCZWZvcmUsICcsJywgJ1RhZnRlciA9ICcsIHVwZGF0ZVNlcnZlclRpbWVBZnRlcik7XG4gIH1cblxufVxuXG52YXIgX2RlZmF1bHQgPSBTeW5jQ2xpZW50O1xuZXhwb3J0cy5kZWZhdWx0ID0gX2RlZmF1bHQ7IiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwge1xuICB2YWx1ZTogdHJ1ZVxufSk7XG5leHBvcnRzLlN5bmNTZXJ2ZXIgPSBleHBvcnRzLlN5bmNDbGllbnQgPSBleHBvcnRzLmRlZmF1bHQgPSB2b2lkIDA7XG5cbnZhciBfaW5kZXggPSBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KHJlcXVpcmUoXCIuL2NsaWVudC9pbmRleC5qc1wiKSk7XG5cbnZhciBfaW5kZXgyID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChyZXF1aXJlKFwiLi9zZXJ2ZXIvaW5kZXguanNcIikpO1xuXG5mdW5jdGlvbiBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KG9iaikgeyByZXR1cm4gb2JqICYmIG9iai5fX2VzTW9kdWxlID8gb2JqIDogeyBkZWZhdWx0OiBvYmogfTsgfVxuXG4vLyBzdXBwb3J0IGV4cGxpY2l0IGRlZmF1bHQgYW5kIG5hbWVkIGltcG9ydFxuLy8gY2YuIGh0dHBzOi8vaXJjYW0taXNtbS5naXRodWIuaW8vamF2YXNjcmlwdC9qYXZhc2NyaXB0LWd1aWRlbGluZXMuaHRtbCNzdXBwb3J0ZWQtc3ludGF4ZXNcbi8vIEBub3RlOlxuLy8gdGhlIG9kZCBmaWxlIHN0cnVjdHVyZSBhaW1zIGF0IHN1cHBvcnRpbmcgaW1wb3J0cyBpbiBvbGQgYXBwbGljYXRpb25zIDpcbi8vIGBgYFxuLy8gaW1wb3J0IFN5bmNTZXJ2ZXIgZnJvbSAnQGlyY2FtL3N5bmMvc2VydmVyJztcbi8vIGBgYFxuLy8gYW5kIHRoZSBtb3N0IHJlY2VudCBvbmVcbi8vIGBgYFxuLy8gaW1wb3J0IHsgU3luY1NlcnZlciB9IGZyb20gJ0BpcmNhbS9zeW5jXG4vLyBgYGBcbi8vXG4vLyBjb25zaWRlciBtYWtpbmcgdGhpcyBtb3JlIHNpbXBsZSBhbmQgcmVsZWFzZSBhIG1ham9yIHZlcnNpb25cbi8vXG52YXIgX2RlZmF1bHQgPSB7XG4gIFN5bmNDbGllbnQ6IF9pbmRleC5kZWZhdWx0LFxuICBTeW5jU2VydmVyOiBfaW5kZXgyLmRlZmF1bHRcbn07XG5leHBvcnRzLmRlZmF1bHQgPSBfZGVmYXVsdDtcbmNvbnN0IFN5bmNDbGllbnQgPSBfaW5kZXguZGVmYXVsdDtcbmV4cG9ydHMuU3luY0NsaWVudCA9IFN5bmNDbGllbnQ7XG5jb25zdCBTeW5jU2VydmVyID0gX2luZGV4Mi5kZWZhdWx0O1xuZXhwb3J0cy5TeW5jU2VydmVyID0gU3luY1NlcnZlcjsiLCJcInVzZSBzdHJpY3RcIjtcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7XG4gIHZhbHVlOiB0cnVlXG59KTtcbmV4cG9ydHMuZGVmYXVsdCA9IHZvaWQgMDtcblxudmFyIF9kZWJ1ZyA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQocmVxdWlyZShcImRlYnVnXCIpKTtcblxuZnVuY3Rpb24gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChvYmopIHsgcmV0dXJuIG9iaiAmJiBvYmouX19lc01vZHVsZSA/IG9iaiA6IHsgZGVmYXVsdDogb2JqIH07IH1cblxuY29uc3QgbG9nID0gKDAsIF9kZWJ1Zy5kZWZhdWx0KSgnc3luYycpO1xuLyoqXG4gKiBAY2FsbGJhY2sgU3luY1NlcnZlcn5nZXRUaW1lRnVuY3Rpb25cbiAqIEByZXR1cm4ge051bWJlcn0gbW9ub3RvbmljLCBldmVyIGluY3JlYXNpbmcsIHRpbWUgaW4gc2Vjb25kLiBXaGVuIHBvc3NpYmxlXG4gKiAgdGhlIHNlcnZlciBjb2RlIHNob3VsZCBkZWZpbmUgaXRzIG93biBvcmlnaW4gKGkuZS4gYHRpbWU9MGApIGluIG9yZGVyIHRvXG4gKiAgbWF4aW1pemUgdGhlIHJlc29sdXRpb24gb2YgdGhlIGNsb2NrIGZvciBhIGxvbmcgcGVyaW9kIG9mIHRpbWUuIFdoZW5cbiAqICBgU3luY1NlcnZlcn5zdGFydGAgaXMgY2FsbGVkIHRoZSBjbG9jayBzaG91bGQgYmUgcnVubmluZ1xuICogIChjZi4gYGF1ZGlvQ29udGV4dC5jdXJyZW50VGltZWAgdGhhdCBuZWVkcyB1c2VyIGludGVyYWN0aW9uIHRvIHN0YXJ0KVxuICpcbiAqIEBleGFtcGxlXG4gKiBjb25zdCBzdGFydFRpbWUgPSBwcm9jZXNzLmhydGltZSgpO1xuICpcbiAqIGNvbnN0IGdldFRpbWVGdW5jdGlvbiA9ICgpID0+IHtcbiAqICAgY29uc3Qgbm93ID0gcHJvY2Vzcy5ocnRpbWUoc3RhcnRUaW1lKTtcbiAqICAgcmV0dXJuIG5vd1swXSArIG5vd1sxXSAqIDFlLTk7XG4gKiB9O1xuICoqL1xuXG4vKipcbiAqIEBjYWxsYmFjayBTeW5jU2VydmVyfnNlbmRGdW5jdGlvblxuICogQHNlZSB7QGxpbmsgU3luY0NsaWVudH5yZWNlaXZlRnVuY3Rpb259XG4gKiBAcGFyYW0ge051bWJlcn0gcGluZ0lkIHVuaXF1ZSBpZGVudGlmaWVyXG4gKiBAcGFyYW0ge051bWJlcn0gY2xpZW50UGluZ1RpbWUgdGltZS1zdGFtcCBvZiBwaW5nIGVtaXNzaW9uXG4gKiBAcGFyYW0ge051bWJlcn0gc2VydmVyUGluZ1RpbWUgdGltZS1zdGFtcCBvZiBwaW5nIHJlY2VwdGlvblxuICogQHBhcmFtIHtOdW1iZXJ9IHNlcnZlclBvbmdUaW1lIHRpbWUtc3RhbXAgb2YgcG9uZyBlbWlzc2lvblxuICoqL1xuXG4vKipcbiAqIEBjYWxsYmFjayBTeW5jU2VydmVyfnJlY2VpdmVGdW5jdGlvblxuICogQHNlZSB7QGxpbmsgU3luY0NsaWVudH5zZW5kRnVuY3Rpb259XG4gKiBAcGFyYW0ge1N5bmNTZXJ2ZXJ+cmVjZWl2ZUNhbGxiYWNrfSByZWNlaXZlQ2FsbGJhY2sgY2FsbGVkIG9uXG4gKiBlYWNoIG1lc3NhZ2UgbWF0Y2hpbmcgbWVzc2FnZVR5cGUuXG4gKiovXG5cbi8qKlxuICogQGNhbGxiYWNrIFN5bmNTZXJ2ZXJ+cmVjZWl2ZUNhbGxiYWNrXG4gKiBAcGFyYW0ge051bWJlcn0gcGluZ0lkIHVuaXF1ZSBpZGVudGlmaWVyXG4gKiBAcGFyYW0ge051bWJlcn0gY2xpZW50UGluZ1RpbWUgdGltZS1zdGFtcCBvZiBwaW5nIGVtaXNzaW9uXG4gKiovXG5cbi8qKlxuICogVGhlIGBTeW5jU2VydmVyYCBpbnN0YW5jZSBwcm92aWRlcyBhIGNsb2NrIG9uIHdoaWNoIHtAbGluayBTeW5jQ2xpZW50fVxuICogaW5zdGFuY2VzIHN5bmNocm9uaXplLlxuICpcbiAqIEBzZWUge0BsaW5rIFN5bmNTZXJ2ZXJ+c3RhcnR9IG1ldGhvZCB0b1xuICogYWN0dWFsbHkgc3RhcnQgYSBzeW5jaHJvbmlzYXRpb24gcHJvY2Vzcy5cbiAqXG4gKiBAcGFyYW0ge1N5bmNTZXJ2ZXJ+Z2V0VGltZUZ1bmN0aW9ufSBmdW5jdGlvbiBjYWxsZWQgdG8gZ2V0IHRoZSBsb2NhbFxuICogdGltZS4gSXQgbXVzdCByZXR1cm4gYSB0aW1lIGluIHNlY29uZHMsIG1vbm90b25pYywgZXZlciBpbmNyZWFzaW5nLlxuICovXG5cbmNsYXNzIFN5bmNTZXJ2ZXIge1xuICBjb25zdHJ1Y3RvcihnZXRUaW1lRnVuY3Rpb24pIHtcbiAgICB0aGlzLmdldFRpbWVGdW5jdGlvbiA9IGdldFRpbWVGdW5jdGlvbjtcbiAgfVxuICAvKipcbiAgICogU3RhcnQgYSBzeW5jaHJvbmlzYXRpb24gcHJvY2VzcyB3aXRoIGEgYFN5bmNDbGllbnRgIGJ5IHJlZ2lzdGVyaW5nIHRoZVxuICAgKiByZWNlaXZlIGZ1bmN0aW9uIHBhc3NlZCBhcyBzZWNvbmQgcGFyYW1ldGVyLiBPbiBlYWNoIHJlY2VpdmVkIG1lc3NhZ2UsXG4gICAqIHNlbmQgYSByZXBseSB1c2luZyB0aGUgZnVuY3Rpb24gcGFzc2VkIGFzIGZpcnN0IHBhcmFtZXRlci5cbiAgICpcbiAgICogQHBhcmFtIHtTeW5jU2VydmVyfnNlbmRGdW5jdGlvbn0gc2VuZEZ1bmN0aW9uXG4gICAqIEBwYXJhbSB7U3luY1NlcnZlcn5yZWNlaXZlRnVuY3Rpb259IHJlY2VpdmVGdW5jdGlvblxuICAgKi9cblxuXG4gIHN0YXJ0KHNlbmRGdW5jdGlvbiwgcmVjZWl2ZUZ1bmN0aW9uKSB7XG4gICAgcmVjZWl2ZUZ1bmN0aW9uKChpZCwgY2xpZW50UGluZ1RpbWUpID0+IHtcbiAgICAgIGNvbnN0IHNlcnZlclBpbmdUaW1lID0gdGhpcy5nZXRMb2NhbFRpbWUoKTsgLy8gd2l0aCB0aGlzIGFsZ29yaXRobSwgdGhlIGR1YWwgY2FsbCB0byBgZ2V0TG9jYWxUaW1lYCBjYW4gYXBwZWFyXG4gICAgICAvLyBub24tbmVjZXNzYXJ5LCBob3dldmVyIGtlZXBpbmcgdGhpcyBjYW4gYWxsb3cgdG8gaW1wbGVtZW50IG90aGVyXG4gICAgICAvLyBhbGdvcml0aG1zIHdoaWxlIGtlZXBpbmcgdGhlIEFQSSB1bmNoYW5nZWQsIHRodXMgbWFraW5nIGVhc2llclxuICAgICAgLy8gdG8gaW1wbGVtZW50IGFuZCBjb21wYXJlIHNldmVyYWwgYWxnb3JpdGhtcy5cblxuICAgICAgc2VuZEZ1bmN0aW9uKGlkLCBjbGllbnRQaW5nVGltZSwgc2VydmVyUGluZ1RpbWUsIHRoaXMuZ2V0TG9jYWxUaW1lKCkpOyAvLyBsb2coJ3Bpbmc6ICVzLCAlcywgJXMnLCBpZCwgY2xpZW50UGluZ1RpbWUsIHNlcnZlclBpbmdUaW1lKTtcbiAgICB9KTsgLy8gcmV0dXJuIHNvbWUgaGFuZGxlIHRoYXQgd291bGQgYWxsb3cgdG8gY2xlYW4gbWVtb3J5ID9cbiAgfVxuICAvKipcbiAgICogR2V0IGxvY2FsIHRpbWUsIG9yIGNvbnZlcnQgYSBzeW5jaHJvbmlzZWQgdGltZSB0byBhIGxvY2FsIHRpbWUuXG4gICAqXG4gICAqIEBub3RlIGBnZXRMb2NhbFRpbWVgIGFuZCBgZ2V0U3luY1RpbWVgIGFyZSBiYXNpY2FsbHkgYWxpYXNlcyBvbiB0aGUgc2VydmVyLlxuICAgKlxuICAgKiBAcGFyYW0ge051bWJlcn0gW3N5bmNUaW1lPXVuZGVmaW5lZF0gLSBHZXQgbG9jYWwgdGltZSBhY2NvcmRpbmcgdG8gZ2l2ZW5cbiAgICogIGdpdmVuIGBzeW5jVGltZWAsIGlmIGBzeW5jVGltZWAgaXMgbm90IGRlZmluZWQgcmV0dXJucyBjdXJyZW50IGxvY2FsIHRpbWUuXG4gICAqIEByZXR1cm5zIHtOdW1iZXJ9IGxvY2FsIHRpbWUsIGluIHNlY29uZHNcbiAgICovXG5cblxuICBnZXRMb2NhbFRpbWUoc3luY1RpbWUpIHtcbiAgICBpZiAodHlwZW9mIHN5bmNUaW1lICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgcmV0dXJuIHN5bmNUaW1lOyAvLyBzeW5jIHRpbWUgaXMgbG9jYWw6IG5vIGNvbnZlcnNpb25cbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHRoaXMuZ2V0VGltZUZ1bmN0aW9uKCk7XG4gICAgfVxuICB9XG4gIC8qKlxuICAgKiBHZXQgc3luY2hyb25pc2VkIHRpbWUsIG9yIGNvbnZlcnQgYSBsb2NhbCB0aW1lIHRvIGEgc3luY2hyb25pc2VkIHRpbWUuXG4gICAqXG4gICAqIEBub3RlIGBnZXRMb2NhbFRpbWVgIGFuZCBgZ2V0U3luY1RpbWVgIGFyZSBiYXNpY2FsbHkgYWxpYXNlcyBvbiB0aGUgc2VydmVyLlxuICAgKlxuICAgKiBAcGFyYW0ge051bWJlcn0gW2xvY2FsVGltZT11bmRlZmluZWRdIC0gR2V0IHN5bmMgdGltZSBhY2NvcmRpbmcgdG8gZ2l2ZW5cbiAgICogIGdpdmVuIGBsb2NhbFRpbWVgLCBpZiBgbG9jYWxUaW1lYCBpcyBub3QgZGVmaW5lZCByZXR1cm5zIGN1cnJlbnQgc3luYyB0aW1lLlxuICAgKiBAcmV0dXJucyB7TnVtYmVyfSBzeW5jaHJvbmlzZWQgdGltZSwgaW4gc2Vjb25kcy5cbiAgICovXG5cblxuICBnZXRTeW5jVGltZShsb2NhbFRpbWUpIHtcbiAgICByZXR1cm4gdGhpcy5nZXRMb2NhbFRpbWUobG9jYWxUaW1lKTsgLy8gc3luYyB0aW1lIGlzIGxvY2FsLCBoZXJlXG4gIH1cblxufVxuXG52YXIgX2RlZmF1bHQgPSBTeW5jU2VydmVyO1xuZXhwb3J0cy5kZWZhdWx0ID0gX2RlZmF1bHQ7IiwibW9kdWxlLmV4cG9ydHMgPSB7IFwiZGVmYXVsdFwiOiByZXF1aXJlKFwiY29yZS1qcy9saWJyYXJ5L2ZuL2pzb24vc3RyaW5naWZ5XCIpLCBfX2VzTW9kdWxlOiB0cnVlIH07IiwidmFyIGNvcmUgPSByZXF1aXJlKCcuLi8uLi9tb2R1bGVzL19jb3JlJyk7XG52YXIgJEpTT04gPSBjb3JlLkpTT04gfHwgKGNvcmUuSlNPTiA9IHsgc3RyaW5naWZ5OiBKU09OLnN0cmluZ2lmeSB9KTtcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gc3RyaW5naWZ5KGl0KSB7IC8vIGVzbGludC1kaXNhYmxlLWxpbmUgbm8tdW51c2VkLXZhcnNcbiAgcmV0dXJuICRKU09OLnN0cmluZ2lmeS5hcHBseSgkSlNPTiwgYXJndW1lbnRzKTtcbn07XG4iLCJ2YXIgY29yZSA9IG1vZHVsZS5leHBvcnRzID0geyB2ZXJzaW9uOiAnMi42LjEyJyB9O1xuaWYgKHR5cGVvZiBfX2UgPT0gJ251bWJlcicpIF9fZSA9IGNvcmU7IC8vIGVzbGludC1kaXNhYmxlLWxpbmUgbm8tdW5kZWZcbiIsIi8qKlxuICogSGVscGVycy5cbiAqL1xuXG52YXIgcyA9IDEwMDA7XG52YXIgbSA9IHMgKiA2MDtcbnZhciBoID0gbSAqIDYwO1xudmFyIGQgPSBoICogMjQ7XG52YXIgdyA9IGQgKiA3O1xudmFyIHkgPSBkICogMzY1LjI1O1xuXG4vKipcbiAqIFBhcnNlIG9yIGZvcm1hdCB0aGUgZ2l2ZW4gYHZhbGAuXG4gKlxuICogT3B0aW9uczpcbiAqXG4gKiAgLSBgbG9uZ2AgdmVyYm9zZSBmb3JtYXR0aW5nIFtmYWxzZV1cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ3xOdW1iZXJ9IHZhbFxuICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXVxuICogQHRocm93cyB7RXJyb3J9IHRocm93IGFuIGVycm9yIGlmIHZhbCBpcyBub3QgYSBub24tZW1wdHkgc3RyaW5nIG9yIGEgbnVtYmVyXG4gKiBAcmV0dXJuIHtTdHJpbmd8TnVtYmVyfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHZhbCwgb3B0aW9ucykge1xuICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgdmFyIHR5cGUgPSB0eXBlb2YgdmFsO1xuICBpZiAodHlwZSA9PT0gJ3N0cmluZycgJiYgdmFsLmxlbmd0aCA+IDApIHtcbiAgICByZXR1cm4gcGFyc2UodmFsKTtcbiAgfSBlbHNlIGlmICh0eXBlID09PSAnbnVtYmVyJyAmJiBpc0Zpbml0ZSh2YWwpKSB7XG4gICAgcmV0dXJuIG9wdGlvbnMubG9uZyA/IGZtdExvbmcodmFsKSA6IGZtdFNob3J0KHZhbCk7XG4gIH1cbiAgdGhyb3cgbmV3IEVycm9yKFxuICAgICd2YWwgaXMgbm90IGEgbm9uLWVtcHR5IHN0cmluZyBvciBhIHZhbGlkIG51bWJlci4gdmFsPScgK1xuICAgICAgSlNPTi5zdHJpbmdpZnkodmFsKVxuICApO1xufTtcblxuLyoqXG4gKiBQYXJzZSB0aGUgZ2l2ZW4gYHN0cmAgYW5kIHJldHVybiBtaWxsaXNlY29uZHMuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHN0clxuICogQHJldHVybiB7TnVtYmVyfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gcGFyc2Uoc3RyKSB7XG4gIHN0ciA9IFN0cmluZyhzdHIpO1xuICBpZiAoc3RyLmxlbmd0aCA+IDEwMCkge1xuICAgIHJldHVybjtcbiAgfVxuICB2YXIgbWF0Y2ggPSAvXigtPyg/OlxcZCspP1xcLj9cXGQrKSAqKG1pbGxpc2Vjb25kcz98bXNlY3M/fG1zfHNlY29uZHM/fHNlY3M/fHN8bWludXRlcz98bWlucz98bXxob3Vycz98aHJzP3xofGRheXM/fGR8d2Vla3M/fHd8eWVhcnM/fHlycz98eSk/JC9pLmV4ZWMoXG4gICAgc3RyXG4gICk7XG4gIGlmICghbWF0Y2gpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgdmFyIG4gPSBwYXJzZUZsb2F0KG1hdGNoWzFdKTtcbiAgdmFyIHR5cGUgPSAobWF0Y2hbMl0gfHwgJ21zJykudG9Mb3dlckNhc2UoKTtcbiAgc3dpdGNoICh0eXBlKSB7XG4gICAgY2FzZSAneWVhcnMnOlxuICAgIGNhc2UgJ3llYXInOlxuICAgIGNhc2UgJ3lycyc6XG4gICAgY2FzZSAneXInOlxuICAgIGNhc2UgJ3knOlxuICAgICAgcmV0dXJuIG4gKiB5O1xuICAgIGNhc2UgJ3dlZWtzJzpcbiAgICBjYXNlICd3ZWVrJzpcbiAgICBjYXNlICd3JzpcbiAgICAgIHJldHVybiBuICogdztcbiAgICBjYXNlICdkYXlzJzpcbiAgICBjYXNlICdkYXknOlxuICAgIGNhc2UgJ2QnOlxuICAgICAgcmV0dXJuIG4gKiBkO1xuICAgIGNhc2UgJ2hvdXJzJzpcbiAgICBjYXNlICdob3VyJzpcbiAgICBjYXNlICdocnMnOlxuICAgIGNhc2UgJ2hyJzpcbiAgICBjYXNlICdoJzpcbiAgICAgIHJldHVybiBuICogaDtcbiAgICBjYXNlICdtaW51dGVzJzpcbiAgICBjYXNlICdtaW51dGUnOlxuICAgIGNhc2UgJ21pbnMnOlxuICAgIGNhc2UgJ21pbic6XG4gICAgY2FzZSAnbSc6XG4gICAgICByZXR1cm4gbiAqIG07XG4gICAgY2FzZSAnc2Vjb25kcyc6XG4gICAgY2FzZSAnc2Vjb25kJzpcbiAgICBjYXNlICdzZWNzJzpcbiAgICBjYXNlICdzZWMnOlxuICAgIGNhc2UgJ3MnOlxuICAgICAgcmV0dXJuIG4gKiBzO1xuICAgIGNhc2UgJ21pbGxpc2Vjb25kcyc6XG4gICAgY2FzZSAnbWlsbGlzZWNvbmQnOlxuICAgIGNhc2UgJ21zZWNzJzpcbiAgICBjYXNlICdtc2VjJzpcbiAgICBjYXNlICdtcyc6XG4gICAgICByZXR1cm4gbjtcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgfVxufVxuXG4vKipcbiAqIFNob3J0IGZvcm1hdCBmb3IgYG1zYC5cbiAqXG4gKiBAcGFyYW0ge051bWJlcn0gbXNcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIGZtdFNob3J0KG1zKSB7XG4gIHZhciBtc0FicyA9IE1hdGguYWJzKG1zKTtcbiAgaWYgKG1zQWJzID49IGQpIHtcbiAgICByZXR1cm4gTWF0aC5yb3VuZChtcyAvIGQpICsgJ2QnO1xuICB9XG4gIGlmIChtc0FicyA+PSBoKSB7XG4gICAgcmV0dXJuIE1hdGgucm91bmQobXMgLyBoKSArICdoJztcbiAgfVxuICBpZiAobXNBYnMgPj0gbSkge1xuICAgIHJldHVybiBNYXRoLnJvdW5kKG1zIC8gbSkgKyAnbSc7XG4gIH1cbiAgaWYgKG1zQWJzID49IHMpIHtcbiAgICByZXR1cm4gTWF0aC5yb3VuZChtcyAvIHMpICsgJ3MnO1xuICB9XG4gIHJldHVybiBtcyArICdtcyc7XG59XG5cbi8qKlxuICogTG9uZyBmb3JtYXQgZm9yIGBtc2AuXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ9IG1zXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBmbXRMb25nKG1zKSB7XG4gIHZhciBtc0FicyA9IE1hdGguYWJzKG1zKTtcbiAgaWYgKG1zQWJzID49IGQpIHtcbiAgICByZXR1cm4gcGx1cmFsKG1zLCBtc0FicywgZCwgJ2RheScpO1xuICB9XG4gIGlmIChtc0FicyA+PSBoKSB7XG4gICAgcmV0dXJuIHBsdXJhbChtcywgbXNBYnMsIGgsICdob3VyJyk7XG4gIH1cbiAgaWYgKG1zQWJzID49IG0pIHtcbiAgICByZXR1cm4gcGx1cmFsKG1zLCBtc0FicywgbSwgJ21pbnV0ZScpO1xuICB9XG4gIGlmIChtc0FicyA+PSBzKSB7XG4gICAgcmV0dXJuIHBsdXJhbChtcywgbXNBYnMsIHMsICdzZWNvbmQnKTtcbiAgfVxuICByZXR1cm4gbXMgKyAnIG1zJztcbn1cblxuLyoqXG4gKiBQbHVyYWxpemF0aW9uIGhlbHBlci5cbiAqL1xuXG5mdW5jdGlvbiBwbHVyYWwobXMsIG1zQWJzLCBuLCBuYW1lKSB7XG4gIHZhciBpc1BsdXJhbCA9IG1zQWJzID49IG4gKiAxLjU7XG4gIHJldHVybiBNYXRoLnJvdW5kKG1zIC8gbikgKyAnICcgKyBuYW1lICsgKGlzUGx1cmFsID8gJ3MnIDogJycpO1xufVxuIiwiLyogZXNsaW50LWVudiBicm93c2VyICovXG5cbi8qKlxuICogVGhpcyBpcyB0aGUgd2ViIGJyb3dzZXIgaW1wbGVtZW50YXRpb24gb2YgYGRlYnVnKClgLlxuICovXG5cbmV4cG9ydHMuZm9ybWF0QXJncyA9IGZvcm1hdEFyZ3M7XG5leHBvcnRzLnNhdmUgPSBzYXZlO1xuZXhwb3J0cy5sb2FkID0gbG9hZDtcbmV4cG9ydHMudXNlQ29sb3JzID0gdXNlQ29sb3JzO1xuZXhwb3J0cy5zdG9yYWdlID0gbG9jYWxzdG9yYWdlKCk7XG5leHBvcnRzLmRlc3Ryb3kgPSAoKCkgPT4ge1xuXHRsZXQgd2FybmVkID0gZmFsc2U7XG5cblx0cmV0dXJuICgpID0+IHtcblx0XHRpZiAoIXdhcm5lZCkge1xuXHRcdFx0d2FybmVkID0gdHJ1ZTtcblx0XHRcdGNvbnNvbGUud2FybignSW5zdGFuY2UgbWV0aG9kIGBkZWJ1Zy5kZXN0cm95KClgIGlzIGRlcHJlY2F0ZWQgYW5kIG5vIGxvbmdlciBkb2VzIGFueXRoaW5nLiBJdCB3aWxsIGJlIHJlbW92ZWQgaW4gdGhlIG5leHQgbWFqb3IgdmVyc2lvbiBvZiBgZGVidWdgLicpO1xuXHRcdH1cblx0fTtcbn0pKCk7XG5cbi8qKlxuICogQ29sb3JzLlxuICovXG5cbmV4cG9ydHMuY29sb3JzID0gW1xuXHQnIzAwMDBDQycsXG5cdCcjMDAwMEZGJyxcblx0JyMwMDMzQ0MnLFxuXHQnIzAwMzNGRicsXG5cdCcjMDA2NkNDJyxcblx0JyMwMDY2RkYnLFxuXHQnIzAwOTlDQycsXG5cdCcjMDA5OUZGJyxcblx0JyMwMENDMDAnLFxuXHQnIzAwQ0MzMycsXG5cdCcjMDBDQzY2Jyxcblx0JyMwMENDOTknLFxuXHQnIzAwQ0NDQycsXG5cdCcjMDBDQ0ZGJyxcblx0JyMzMzAwQ0MnLFxuXHQnIzMzMDBGRicsXG5cdCcjMzMzM0NDJyxcblx0JyMzMzMzRkYnLFxuXHQnIzMzNjZDQycsXG5cdCcjMzM2NkZGJyxcblx0JyMzMzk5Q0MnLFxuXHQnIzMzOTlGRicsXG5cdCcjMzNDQzAwJyxcblx0JyMzM0NDMzMnLFxuXHQnIzMzQ0M2NicsXG5cdCcjMzNDQzk5Jyxcblx0JyMzM0NDQ0MnLFxuXHQnIzMzQ0NGRicsXG5cdCcjNjYwMENDJyxcblx0JyM2NjAwRkYnLFxuXHQnIzY2MzNDQycsXG5cdCcjNjYzM0ZGJyxcblx0JyM2NkNDMDAnLFxuXHQnIzY2Q0MzMycsXG5cdCcjOTkwMENDJyxcblx0JyM5OTAwRkYnLFxuXHQnIzk5MzNDQycsXG5cdCcjOTkzM0ZGJyxcblx0JyM5OUNDMDAnLFxuXHQnIzk5Q0MzMycsXG5cdCcjQ0MwMDAwJyxcblx0JyNDQzAwMzMnLFxuXHQnI0NDMDA2NicsXG5cdCcjQ0MwMDk5Jyxcblx0JyNDQzAwQ0MnLFxuXHQnI0NDMDBGRicsXG5cdCcjQ0MzMzAwJyxcblx0JyNDQzMzMzMnLFxuXHQnI0NDMzM2NicsXG5cdCcjQ0MzMzk5Jyxcblx0JyNDQzMzQ0MnLFxuXHQnI0NDMzNGRicsXG5cdCcjQ0M2NjAwJyxcblx0JyNDQzY2MzMnLFxuXHQnI0NDOTkwMCcsXG5cdCcjQ0M5OTMzJyxcblx0JyNDQ0NDMDAnLFxuXHQnI0NDQ0MzMycsXG5cdCcjRkYwMDAwJyxcblx0JyNGRjAwMzMnLFxuXHQnI0ZGMDA2NicsXG5cdCcjRkYwMDk5Jyxcblx0JyNGRjAwQ0MnLFxuXHQnI0ZGMDBGRicsXG5cdCcjRkYzMzAwJyxcblx0JyNGRjMzMzMnLFxuXHQnI0ZGMzM2NicsXG5cdCcjRkYzMzk5Jyxcblx0JyNGRjMzQ0MnLFxuXHQnI0ZGMzNGRicsXG5cdCcjRkY2NjAwJyxcblx0JyNGRjY2MzMnLFxuXHQnI0ZGOTkwMCcsXG5cdCcjRkY5OTMzJyxcblx0JyNGRkNDMDAnLFxuXHQnI0ZGQ0MzMydcbl07XG5cbi8qKlxuICogQ3VycmVudGx5IG9ubHkgV2ViS2l0LWJhc2VkIFdlYiBJbnNwZWN0b3JzLCBGaXJlZm94ID49IHYzMSxcbiAqIGFuZCB0aGUgRmlyZWJ1ZyBleHRlbnNpb24gKGFueSBGaXJlZm94IHZlcnNpb24pIGFyZSBrbm93blxuICogdG8gc3VwcG9ydCBcIiVjXCIgQ1NTIGN1c3RvbWl6YXRpb25zLlxuICpcbiAqIFRPRE86IGFkZCBhIGBsb2NhbFN0b3JhZ2VgIHZhcmlhYmxlIHRvIGV4cGxpY2l0bHkgZW5hYmxlL2Rpc2FibGUgY29sb3JzXG4gKi9cblxuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGNvbXBsZXhpdHlcbmZ1bmN0aW9uIHVzZUNvbG9ycygpIHtcblx0Ly8gTkI6IEluIGFuIEVsZWN0cm9uIHByZWxvYWQgc2NyaXB0LCBkb2N1bWVudCB3aWxsIGJlIGRlZmluZWQgYnV0IG5vdCBmdWxseVxuXHQvLyBpbml0aWFsaXplZC4gU2luY2Ugd2Uga25vdyB3ZSdyZSBpbiBDaHJvbWUsIHdlJ2xsIGp1c3QgZGV0ZWN0IHRoaXMgY2FzZVxuXHQvLyBleHBsaWNpdGx5XG5cdGlmICh0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJyAmJiB3aW5kb3cucHJvY2VzcyAmJiAod2luZG93LnByb2Nlc3MudHlwZSA9PT0gJ3JlbmRlcmVyJyB8fCB3aW5kb3cucHJvY2Vzcy5fX253anMpKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvLyBJbnRlcm5ldCBFeHBsb3JlciBhbmQgRWRnZSBkbyBub3Qgc3VwcG9ydCBjb2xvcnMuXG5cdGlmICh0eXBlb2YgbmF2aWdhdG9yICE9PSAndW5kZWZpbmVkJyAmJiBuYXZpZ2F0b3IudXNlckFnZW50ICYmIG5hdmlnYXRvci51c2VyQWdlbnQudG9Mb3dlckNhc2UoKS5tYXRjaCgvKGVkZ2V8dHJpZGVudClcXC8oXFxkKykvKSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdC8vIElzIHdlYmtpdD8gaHR0cDovL3N0YWNrb3ZlcmZsb3cuY29tL2EvMTY0NTk2MDYvMzc2NzczXG5cdC8vIGRvY3VtZW50IGlzIHVuZGVmaW5lZCBpbiByZWFjdC1uYXRpdmU6IGh0dHBzOi8vZ2l0aHViLmNvbS9mYWNlYm9vay9yZWFjdC1uYXRpdmUvcHVsbC8xNjMyXG5cdHJldHVybiAodHlwZW9mIGRvY3VtZW50ICE9PSAndW5kZWZpbmVkJyAmJiBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQgJiYgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LnN0eWxlICYmIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5zdHlsZS5XZWJraXRBcHBlYXJhbmNlKSB8fFxuXHRcdC8vIElzIGZpcmVidWc/IGh0dHA6Ly9zdGFja292ZXJmbG93LmNvbS9hLzM5ODEyMC8zNzY3NzNcblx0XHQodHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgJiYgd2luZG93LmNvbnNvbGUgJiYgKHdpbmRvdy5jb25zb2xlLmZpcmVidWcgfHwgKHdpbmRvdy5jb25zb2xlLmV4Y2VwdGlvbiAmJiB3aW5kb3cuY29uc29sZS50YWJsZSkpKSB8fFxuXHRcdC8vIElzIGZpcmVmb3ggPj0gdjMxP1xuXHRcdC8vIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvVG9vbHMvV2ViX0NvbnNvbGUjU3R5bGluZ19tZXNzYWdlc1xuXHRcdCh0eXBlb2YgbmF2aWdhdG9yICE9PSAndW5kZWZpbmVkJyAmJiBuYXZpZ2F0b3IudXNlckFnZW50ICYmIG5hdmlnYXRvci51c2VyQWdlbnQudG9Mb3dlckNhc2UoKS5tYXRjaCgvZmlyZWZveFxcLyhcXGQrKS8pICYmIHBhcnNlSW50KFJlZ0V4cC4kMSwgMTApID49IDMxKSB8fFxuXHRcdC8vIERvdWJsZSBjaGVjayB3ZWJraXQgaW4gdXNlckFnZW50IGp1c3QgaW4gY2FzZSB3ZSBhcmUgaW4gYSB3b3JrZXJcblx0XHQodHlwZW9mIG5hdmlnYXRvciAhPT0gJ3VuZGVmaW5lZCcgJiYgbmF2aWdhdG9yLnVzZXJBZ2VudCAmJiBuYXZpZ2F0b3IudXNlckFnZW50LnRvTG93ZXJDYXNlKCkubWF0Y2goL2FwcGxld2Via2l0XFwvKFxcZCspLykpO1xufVxuXG4vKipcbiAqIENvbG9yaXplIGxvZyBhcmd1bWVudHMgaWYgZW5hYmxlZC5cbiAqXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIGZvcm1hdEFyZ3MoYXJncykge1xuXHRhcmdzWzBdID0gKHRoaXMudXNlQ29sb3JzID8gJyVjJyA6ICcnKSArXG5cdFx0dGhpcy5uYW1lc3BhY2UgK1xuXHRcdCh0aGlzLnVzZUNvbG9ycyA/ICcgJWMnIDogJyAnKSArXG5cdFx0YXJnc1swXSArXG5cdFx0KHRoaXMudXNlQ29sb3JzID8gJyVjICcgOiAnICcpICtcblx0XHQnKycgKyBtb2R1bGUuZXhwb3J0cy5odW1hbml6ZSh0aGlzLmRpZmYpO1xuXG5cdGlmICghdGhpcy51c2VDb2xvcnMpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRjb25zdCBjID0gJ2NvbG9yOiAnICsgdGhpcy5jb2xvcjtcblx0YXJncy5zcGxpY2UoMSwgMCwgYywgJ2NvbG9yOiBpbmhlcml0Jyk7XG5cblx0Ly8gVGhlIGZpbmFsIFwiJWNcIiBpcyBzb21ld2hhdCB0cmlja3ksIGJlY2F1c2UgdGhlcmUgY291bGQgYmUgb3RoZXJcblx0Ly8gYXJndW1lbnRzIHBhc3NlZCBlaXRoZXIgYmVmb3JlIG9yIGFmdGVyIHRoZSAlYywgc28gd2UgbmVlZCB0b1xuXHQvLyBmaWd1cmUgb3V0IHRoZSBjb3JyZWN0IGluZGV4IHRvIGluc2VydCB0aGUgQ1NTIGludG9cblx0bGV0IGluZGV4ID0gMDtcblx0bGV0IGxhc3RDID0gMDtcblx0YXJnc1swXS5yZXBsYWNlKC8lW2EtekEtWiVdL2csIG1hdGNoID0+IHtcblx0XHRpZiAobWF0Y2ggPT09ICclJScpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aW5kZXgrKztcblx0XHRpZiAobWF0Y2ggPT09ICclYycpIHtcblx0XHRcdC8vIFdlIG9ubHkgYXJlIGludGVyZXN0ZWQgaW4gdGhlICpsYXN0KiAlY1xuXHRcdFx0Ly8gKHRoZSB1c2VyIG1heSBoYXZlIHByb3ZpZGVkIHRoZWlyIG93bilcblx0XHRcdGxhc3RDID0gaW5kZXg7XG5cdFx0fVxuXHR9KTtcblxuXHRhcmdzLnNwbGljZShsYXN0QywgMCwgYyk7XG59XG5cbi8qKlxuICogSW52b2tlcyBgY29uc29sZS5kZWJ1ZygpYCB3aGVuIGF2YWlsYWJsZS5cbiAqIE5vLW9wIHdoZW4gYGNvbnNvbGUuZGVidWdgIGlzIG5vdCBhIFwiZnVuY3Rpb25cIi5cbiAqIElmIGBjb25zb2xlLmRlYnVnYCBpcyBub3QgYXZhaWxhYmxlLCBmYWxscyBiYWNrXG4gKiB0byBgY29uc29sZS5sb2dgLlxuICpcbiAqIEBhcGkgcHVibGljXG4gKi9cbmV4cG9ydHMubG9nID0gY29uc29sZS5kZWJ1ZyB8fCBjb25zb2xlLmxvZyB8fCAoKCkgPT4ge30pO1xuXG4vKipcbiAqIFNhdmUgYG5hbWVzcGFjZXNgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lc3BhY2VzXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuZnVuY3Rpb24gc2F2ZShuYW1lc3BhY2VzKSB7XG5cdHRyeSB7XG5cdFx0aWYgKG5hbWVzcGFjZXMpIHtcblx0XHRcdGV4cG9ydHMuc3RvcmFnZS5zZXRJdGVtKCdkZWJ1ZycsIG5hbWVzcGFjZXMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRleHBvcnRzLnN0b3JhZ2UucmVtb3ZlSXRlbSgnZGVidWcnKTtcblx0XHR9XG5cdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0Ly8gU3dhbGxvd1xuXHRcdC8vIFhYWCAoQFFpeC0pIHNob3VsZCB3ZSBiZSBsb2dnaW5nIHRoZXNlP1xuXHR9XG59XG5cbi8qKlxuICogTG9hZCBgbmFtZXNwYWNlc2AuXG4gKlxuICogQHJldHVybiB7U3RyaW5nfSByZXR1cm5zIHRoZSBwcmV2aW91c2x5IHBlcnNpc3RlZCBkZWJ1ZyBtb2Rlc1xuICogQGFwaSBwcml2YXRlXG4gKi9cbmZ1bmN0aW9uIGxvYWQoKSB7XG5cdGxldCByO1xuXHR0cnkge1xuXHRcdHIgPSBleHBvcnRzLnN0b3JhZ2UuZ2V0SXRlbSgnZGVidWcnKTtcblx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHQvLyBTd2FsbG93XG5cdFx0Ly8gWFhYIChAUWl4LSkgc2hvdWxkIHdlIGJlIGxvZ2dpbmcgdGhlc2U/XG5cdH1cblxuXHQvLyBJZiBkZWJ1ZyBpc24ndCBzZXQgaW4gTFMsIGFuZCB3ZSdyZSBpbiBFbGVjdHJvbiwgdHJ5IHRvIGxvYWQgJERFQlVHXG5cdGlmICghciAmJiB0eXBlb2YgcHJvY2VzcyAhPT0gJ3VuZGVmaW5lZCcgJiYgJ2VudicgaW4gcHJvY2Vzcykge1xuXHRcdHIgPSBwcm9jZXNzLmVudi5ERUJVRztcblx0fVxuXG5cdHJldHVybiByO1xufVxuXG4vKipcbiAqIExvY2Fsc3RvcmFnZSBhdHRlbXB0cyB0byByZXR1cm4gdGhlIGxvY2Fsc3RvcmFnZS5cbiAqXG4gKiBUaGlzIGlzIG5lY2Vzc2FyeSBiZWNhdXNlIHNhZmFyaSB0aHJvd3NcbiAqIHdoZW4gYSB1c2VyIGRpc2FibGVzIGNvb2tpZXMvbG9jYWxzdG9yYWdlXG4gKiBhbmQgeW91IGF0dGVtcHQgdG8gYWNjZXNzIGl0LlxuICpcbiAqIEByZXR1cm4ge0xvY2FsU3RvcmFnZX1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIGxvY2Fsc3RvcmFnZSgpIHtcblx0dHJ5IHtcblx0XHQvLyBUVk1MS2l0IChBcHBsZSBUViBKUyBSdW50aW1lKSBkb2VzIG5vdCBoYXZlIGEgd2luZG93IG9iamVjdCwganVzdCBsb2NhbFN0b3JhZ2UgaW4gdGhlIGdsb2JhbCBjb250ZXh0XG5cdFx0Ly8gVGhlIEJyb3dzZXIgYWxzbyBoYXMgbG9jYWxTdG9yYWdlIGluIHRoZSBnbG9iYWwgY29udGV4dC5cblx0XHRyZXR1cm4gbG9jYWxTdG9yYWdlO1xuXHR9IGNhdGNoIChlcnJvcikge1xuXHRcdC8vIFN3YWxsb3dcblx0XHQvLyBYWFggKEBRaXgtKSBzaG91bGQgd2UgYmUgbG9nZ2luZyB0aGVzZT9cblx0fVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoJy4vY29tbW9uJykoZXhwb3J0cyk7XG5cbmNvbnN0IHtmb3JtYXR0ZXJzfSA9IG1vZHVsZS5leHBvcnRzO1xuXG4vKipcbiAqIE1hcCAlaiB0byBgSlNPTi5zdHJpbmdpZnkoKWAsIHNpbmNlIG5vIFdlYiBJbnNwZWN0b3JzIGRvIHRoYXQgYnkgZGVmYXVsdC5cbiAqL1xuXG5mb3JtYXR0ZXJzLmogPSBmdW5jdGlvbiAodikge1xuXHR0cnkge1xuXHRcdHJldHVybiBKU09OLnN0cmluZ2lmeSh2KTtcblx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRyZXR1cm4gJ1tVbmV4cGVjdGVkSlNPTlBhcnNlRXJyb3JdOiAnICsgZXJyb3IubWVzc2FnZTtcblx0fVxufTtcbiIsIlxuLyoqXG4gKiBUaGlzIGlzIHRoZSBjb21tb24gbG9naWMgZm9yIGJvdGggdGhlIE5vZGUuanMgYW5kIHdlYiBicm93c2VyXG4gKiBpbXBsZW1lbnRhdGlvbnMgb2YgYGRlYnVnKClgLlxuICovXG5cbmZ1bmN0aW9uIHNldHVwKGVudikge1xuXHRjcmVhdGVEZWJ1Zy5kZWJ1ZyA9IGNyZWF0ZURlYnVnO1xuXHRjcmVhdGVEZWJ1Zy5kZWZhdWx0ID0gY3JlYXRlRGVidWc7XG5cdGNyZWF0ZURlYnVnLmNvZXJjZSA9IGNvZXJjZTtcblx0Y3JlYXRlRGVidWcuZGlzYWJsZSA9IGRpc2FibGU7XG5cdGNyZWF0ZURlYnVnLmVuYWJsZSA9IGVuYWJsZTtcblx0Y3JlYXRlRGVidWcuZW5hYmxlZCA9IGVuYWJsZWQ7XG5cdGNyZWF0ZURlYnVnLmh1bWFuaXplID0gcmVxdWlyZSgnbXMnKTtcblx0Y3JlYXRlRGVidWcuZGVzdHJveSA9IGRlc3Ryb3k7XG5cblx0T2JqZWN0LmtleXMoZW52KS5mb3JFYWNoKGtleSA9PiB7XG5cdFx0Y3JlYXRlRGVidWdba2V5XSA9IGVudltrZXldO1xuXHR9KTtcblxuXHQvKipcblx0KiBUaGUgY3VycmVudGx5IGFjdGl2ZSBkZWJ1ZyBtb2RlIG5hbWVzLCBhbmQgbmFtZXMgdG8gc2tpcC5cblx0Ki9cblxuXHRjcmVhdGVEZWJ1Zy5uYW1lcyA9IFtdO1xuXHRjcmVhdGVEZWJ1Zy5za2lwcyA9IFtdO1xuXG5cdC8qKlxuXHQqIE1hcCBvZiBzcGVjaWFsIFwiJW5cIiBoYW5kbGluZyBmdW5jdGlvbnMsIGZvciB0aGUgZGVidWcgXCJmb3JtYXRcIiBhcmd1bWVudC5cblx0KlxuXHQqIFZhbGlkIGtleSBuYW1lcyBhcmUgYSBzaW5nbGUsIGxvd2VyIG9yIHVwcGVyLWNhc2UgbGV0dGVyLCBpLmUuIFwiblwiIGFuZCBcIk5cIi5cblx0Ki9cblx0Y3JlYXRlRGVidWcuZm9ybWF0dGVycyA9IHt9O1xuXG5cdC8qKlxuXHQqIFNlbGVjdHMgYSBjb2xvciBmb3IgYSBkZWJ1ZyBuYW1lc3BhY2Vcblx0KiBAcGFyYW0ge1N0cmluZ30gbmFtZXNwYWNlIFRoZSBuYW1lc3BhY2Ugc3RyaW5nIGZvciB0aGUgZm9yIHRoZSBkZWJ1ZyBpbnN0YW5jZSB0byBiZSBjb2xvcmVkXG5cdCogQHJldHVybiB7TnVtYmVyfFN0cmluZ30gQW4gQU5TSSBjb2xvciBjb2RlIGZvciB0aGUgZ2l2ZW4gbmFtZXNwYWNlXG5cdCogQGFwaSBwcml2YXRlXG5cdCovXG5cdGZ1bmN0aW9uIHNlbGVjdENvbG9yKG5hbWVzcGFjZSkge1xuXHRcdGxldCBoYXNoID0gMDtcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbmFtZXNwYWNlLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRoYXNoID0gKChoYXNoIDw8IDUpIC0gaGFzaCkgKyBuYW1lc3BhY2UuY2hhckNvZGVBdChpKTtcblx0XHRcdGhhc2ggfD0gMDsgLy8gQ29udmVydCB0byAzMmJpdCBpbnRlZ2VyXG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNyZWF0ZURlYnVnLmNvbG9yc1tNYXRoLmFicyhoYXNoKSAlIGNyZWF0ZURlYnVnLmNvbG9ycy5sZW5ndGhdO1xuXHR9XG5cdGNyZWF0ZURlYnVnLnNlbGVjdENvbG9yID0gc2VsZWN0Q29sb3I7XG5cblx0LyoqXG5cdCogQ3JlYXRlIGEgZGVidWdnZXIgd2l0aCB0aGUgZ2l2ZW4gYG5hbWVzcGFjZWAuXG5cdCpcblx0KiBAcGFyYW0ge1N0cmluZ30gbmFtZXNwYWNlXG5cdCogQHJldHVybiB7RnVuY3Rpb259XG5cdCogQGFwaSBwdWJsaWNcblx0Ki9cblx0ZnVuY3Rpb24gY3JlYXRlRGVidWcobmFtZXNwYWNlKSB7XG5cdFx0bGV0IHByZXZUaW1lO1xuXHRcdGxldCBlbmFibGVPdmVycmlkZSA9IG51bGw7XG5cblx0XHRmdW5jdGlvbiBkZWJ1ZyguLi5hcmdzKSB7XG5cdFx0XHQvLyBEaXNhYmxlZD9cblx0XHRcdGlmICghZGVidWcuZW5hYmxlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHNlbGYgPSBkZWJ1ZztcblxuXHRcdFx0Ly8gU2V0IGBkaWZmYCB0aW1lc3RhbXBcblx0XHRcdGNvbnN0IGN1cnIgPSBOdW1iZXIobmV3IERhdGUoKSk7XG5cdFx0XHRjb25zdCBtcyA9IGN1cnIgLSAocHJldlRpbWUgfHwgY3Vycik7XG5cdFx0XHRzZWxmLmRpZmYgPSBtcztcblx0XHRcdHNlbGYucHJldiA9IHByZXZUaW1lO1xuXHRcdFx0c2VsZi5jdXJyID0gY3Vycjtcblx0XHRcdHByZXZUaW1lID0gY3VycjtcblxuXHRcdFx0YXJnc1swXSA9IGNyZWF0ZURlYnVnLmNvZXJjZShhcmdzWzBdKTtcblxuXHRcdFx0aWYgKHR5cGVvZiBhcmdzWzBdICE9PSAnc3RyaW5nJykge1xuXHRcdFx0XHQvLyBBbnl0aGluZyBlbHNlIGxldCdzIGluc3BlY3Qgd2l0aCAlT1xuXHRcdFx0XHRhcmdzLnVuc2hpZnQoJyVPJyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEFwcGx5IGFueSBgZm9ybWF0dGVyc2AgdHJhbnNmb3JtYXRpb25zXG5cdFx0XHRsZXQgaW5kZXggPSAwO1xuXHRcdFx0YXJnc1swXSA9IGFyZ3NbMF0ucmVwbGFjZSgvJShbYS16QS1aJV0pL2csIChtYXRjaCwgZm9ybWF0KSA9PiB7XG5cdFx0XHRcdC8vIElmIHdlIGVuY291bnRlciBhbiBlc2NhcGVkICUgdGhlbiBkb24ndCBpbmNyZWFzZSB0aGUgYXJyYXkgaW5kZXhcblx0XHRcdFx0aWYgKG1hdGNoID09PSAnJSUnKSB7XG5cdFx0XHRcdFx0cmV0dXJuICclJztcblx0XHRcdFx0fVxuXHRcdFx0XHRpbmRleCsrO1xuXHRcdFx0XHRjb25zdCBmb3JtYXR0ZXIgPSBjcmVhdGVEZWJ1Zy5mb3JtYXR0ZXJzW2Zvcm1hdF07XG5cdFx0XHRcdGlmICh0eXBlb2YgZm9ybWF0dGVyID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRcdFx0Y29uc3QgdmFsID0gYXJnc1tpbmRleF07XG5cdFx0XHRcdFx0bWF0Y2ggPSBmb3JtYXR0ZXIuY2FsbChzZWxmLCB2YWwpO1xuXG5cdFx0XHRcdFx0Ly8gTm93IHdlIG5lZWQgdG8gcmVtb3ZlIGBhcmdzW2luZGV4XWAgc2luY2UgaXQncyBpbmxpbmVkIGluIHRoZSBgZm9ybWF0YFxuXHRcdFx0XHRcdGFyZ3Muc3BsaWNlKGluZGV4LCAxKTtcblx0XHRcdFx0XHRpbmRleC0tO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBtYXRjaDtcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBBcHBseSBlbnYtc3BlY2lmaWMgZm9ybWF0dGluZyAoY29sb3JzLCBldGMuKVxuXHRcdFx0Y3JlYXRlRGVidWcuZm9ybWF0QXJncy5jYWxsKHNlbGYsIGFyZ3MpO1xuXG5cdFx0XHRjb25zdCBsb2dGbiA9IHNlbGYubG9nIHx8IGNyZWF0ZURlYnVnLmxvZztcblx0XHRcdGxvZ0ZuLmFwcGx5KHNlbGYsIGFyZ3MpO1xuXHRcdH1cblxuXHRcdGRlYnVnLm5hbWVzcGFjZSA9IG5hbWVzcGFjZTtcblx0XHRkZWJ1Zy51c2VDb2xvcnMgPSBjcmVhdGVEZWJ1Zy51c2VDb2xvcnMoKTtcblx0XHRkZWJ1Zy5jb2xvciA9IGNyZWF0ZURlYnVnLnNlbGVjdENvbG9yKG5hbWVzcGFjZSk7XG5cdFx0ZGVidWcuZXh0ZW5kID0gZXh0ZW5kO1xuXHRcdGRlYnVnLmRlc3Ryb3kgPSBjcmVhdGVEZWJ1Zy5kZXN0cm95OyAvLyBYWFggVGVtcG9yYXJ5LiBXaWxsIGJlIHJlbW92ZWQgaW4gdGhlIG5leHQgbWFqb3IgcmVsZWFzZS5cblxuXHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShkZWJ1ZywgJ2VuYWJsZWQnLCB7XG5cdFx0XHRlbnVtZXJhYmxlOiB0cnVlLFxuXHRcdFx0Y29uZmlndXJhYmxlOiBmYWxzZSxcblx0XHRcdGdldDogKCkgPT4gZW5hYmxlT3ZlcnJpZGUgPT09IG51bGwgPyBjcmVhdGVEZWJ1Zy5lbmFibGVkKG5hbWVzcGFjZSkgOiBlbmFibGVPdmVycmlkZSxcblx0XHRcdHNldDogdiA9PiB7XG5cdFx0XHRcdGVuYWJsZU92ZXJyaWRlID0gdjtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdC8vIEVudi1zcGVjaWZpYyBpbml0aWFsaXphdGlvbiBsb2dpYyBmb3IgZGVidWcgaW5zdGFuY2VzXG5cdFx0aWYgKHR5cGVvZiBjcmVhdGVEZWJ1Zy5pbml0ID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRjcmVhdGVEZWJ1Zy5pbml0KGRlYnVnKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZGVidWc7XG5cdH1cblxuXHRmdW5jdGlvbiBleHRlbmQobmFtZXNwYWNlLCBkZWxpbWl0ZXIpIHtcblx0XHRjb25zdCBuZXdEZWJ1ZyA9IGNyZWF0ZURlYnVnKHRoaXMubmFtZXNwYWNlICsgKHR5cGVvZiBkZWxpbWl0ZXIgPT09ICd1bmRlZmluZWQnID8gJzonIDogZGVsaW1pdGVyKSArIG5hbWVzcGFjZSk7XG5cdFx0bmV3RGVidWcubG9nID0gdGhpcy5sb2c7XG5cdFx0cmV0dXJuIG5ld0RlYnVnO1xuXHR9XG5cblx0LyoqXG5cdCogRW5hYmxlcyBhIGRlYnVnIG1vZGUgYnkgbmFtZXNwYWNlcy4gVGhpcyBjYW4gaW5jbHVkZSBtb2Rlc1xuXHQqIHNlcGFyYXRlZCBieSBhIGNvbG9uIGFuZCB3aWxkY2FyZHMuXG5cdCpcblx0KiBAcGFyYW0ge1N0cmluZ30gbmFtZXNwYWNlc1xuXHQqIEBhcGkgcHVibGljXG5cdCovXG5cdGZ1bmN0aW9uIGVuYWJsZShuYW1lc3BhY2VzKSB7XG5cdFx0Y3JlYXRlRGVidWcuc2F2ZShuYW1lc3BhY2VzKTtcblxuXHRcdGNyZWF0ZURlYnVnLm5hbWVzID0gW107XG5cdFx0Y3JlYXRlRGVidWcuc2tpcHMgPSBbXTtcblxuXHRcdGxldCBpO1xuXHRcdGNvbnN0IHNwbGl0ID0gKHR5cGVvZiBuYW1lc3BhY2VzID09PSAnc3RyaW5nJyA/IG5hbWVzcGFjZXMgOiAnJykuc3BsaXQoL1tcXHMsXSsvKTtcblx0XHRjb25zdCBsZW4gPSBzcGxpdC5sZW5ndGg7XG5cblx0XHRmb3IgKGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGlmICghc3BsaXRbaV0pIHtcblx0XHRcdFx0Ly8gaWdub3JlIGVtcHR5IHN0cmluZ3Ncblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdG5hbWVzcGFjZXMgPSBzcGxpdFtpXS5yZXBsYWNlKC9cXCovZywgJy4qPycpO1xuXG5cdFx0XHRpZiAobmFtZXNwYWNlc1swXSA9PT0gJy0nKSB7XG5cdFx0XHRcdGNyZWF0ZURlYnVnLnNraXBzLnB1c2gobmV3IFJlZ0V4cCgnXicgKyBuYW1lc3BhY2VzLnN1YnN0cigxKSArICckJykpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y3JlYXRlRGVidWcubmFtZXMucHVzaChuZXcgUmVnRXhwKCdeJyArIG5hbWVzcGFjZXMgKyAnJCcpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0KiBEaXNhYmxlIGRlYnVnIG91dHB1dC5cblx0KlxuXHQqIEByZXR1cm4ge1N0cmluZ30gbmFtZXNwYWNlc1xuXHQqIEBhcGkgcHVibGljXG5cdCovXG5cdGZ1bmN0aW9uIGRpc2FibGUoKSB7XG5cdFx0Y29uc3QgbmFtZXNwYWNlcyA9IFtcblx0XHRcdC4uLmNyZWF0ZURlYnVnLm5hbWVzLm1hcCh0b05hbWVzcGFjZSksXG5cdFx0XHQuLi5jcmVhdGVEZWJ1Zy5za2lwcy5tYXAodG9OYW1lc3BhY2UpLm1hcChuYW1lc3BhY2UgPT4gJy0nICsgbmFtZXNwYWNlKVxuXHRcdF0uam9pbignLCcpO1xuXHRcdGNyZWF0ZURlYnVnLmVuYWJsZSgnJyk7XG5cdFx0cmV0dXJuIG5hbWVzcGFjZXM7XG5cdH1cblxuXHQvKipcblx0KiBSZXR1cm5zIHRydWUgaWYgdGhlIGdpdmVuIG1vZGUgbmFtZSBpcyBlbmFibGVkLCBmYWxzZSBvdGhlcndpc2UuXG5cdCpcblx0KiBAcGFyYW0ge1N0cmluZ30gbmFtZVxuXHQqIEByZXR1cm4ge0Jvb2xlYW59XG5cdCogQGFwaSBwdWJsaWNcblx0Ki9cblx0ZnVuY3Rpb24gZW5hYmxlZChuYW1lKSB7XG5cdFx0aWYgKG5hbWVbbmFtZS5sZW5ndGggLSAxXSA9PT0gJyonKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRsZXQgaTtcblx0XHRsZXQgbGVuO1xuXG5cdFx0Zm9yIChpID0gMCwgbGVuID0gY3JlYXRlRGVidWcuc2tpcHMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGlmIChjcmVhdGVEZWJ1Zy5za2lwc1tpXS50ZXN0KG5hbWUpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRmb3IgKGkgPSAwLCBsZW4gPSBjcmVhdGVEZWJ1Zy5uYW1lcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0aWYgKGNyZWF0ZURlYnVnLm5hbWVzW2ldLnRlc3QobmFtZSkpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0LyoqXG5cdCogQ29udmVydCByZWdleHAgdG8gbmFtZXNwYWNlXG5cdCpcblx0KiBAcGFyYW0ge1JlZ0V4cH0gcmVneGVwXG5cdCogQHJldHVybiB7U3RyaW5nfSBuYW1lc3BhY2Vcblx0KiBAYXBpIHByaXZhdGVcblx0Ki9cblx0ZnVuY3Rpb24gdG9OYW1lc3BhY2UocmVnZXhwKSB7XG5cdFx0cmV0dXJuIHJlZ2V4cC50b1N0cmluZygpXG5cdFx0XHQuc3Vic3RyaW5nKDIsIHJlZ2V4cC50b1N0cmluZygpLmxlbmd0aCAtIDIpXG5cdFx0XHQucmVwbGFjZSgvXFwuXFwqXFw/JC8sICcqJyk7XG5cdH1cblxuXHQvKipcblx0KiBDb2VyY2UgYHZhbGAuXG5cdCpcblx0KiBAcGFyYW0ge01peGVkfSB2YWxcblx0KiBAcmV0dXJuIHtNaXhlZH1cblx0KiBAYXBpIHByaXZhdGVcblx0Ki9cblx0ZnVuY3Rpb24gY29lcmNlKHZhbCkge1xuXHRcdGlmICh2YWwgaW5zdGFuY2VvZiBFcnJvcikge1xuXHRcdFx0cmV0dXJuIHZhbC5zdGFjayB8fCB2YWwubWVzc2FnZTtcblx0XHR9XG5cdFx0cmV0dXJuIHZhbDtcblx0fVxuXG5cdC8qKlxuXHQqIFhYWCBETyBOT1QgVVNFLiBUaGlzIGlzIGEgdGVtcG9yYXJ5IHN0dWIgZnVuY3Rpb24uXG5cdCogWFhYIEl0IFdJTEwgYmUgcmVtb3ZlZCBpbiB0aGUgbmV4dCBtYWpvciByZWxlYXNlLlxuXHQqL1xuXHRmdW5jdGlvbiBkZXN0cm95KCkge1xuXHRcdGNvbnNvbGUud2FybignSW5zdGFuY2UgbWV0aG9kIGBkZWJ1Zy5kZXN0cm95KClgIGlzIGRlcHJlY2F0ZWQgYW5kIG5vIGxvbmdlciBkb2VzIGFueXRoaW5nLiBJdCB3aWxsIGJlIHJlbW92ZWQgaW4gdGhlIG5leHQgbWFqb3IgdmVyc2lvbiBvZiBgZGVidWdgLicpO1xuXHR9XG5cblx0Y3JlYXRlRGVidWcuZW5hYmxlKGNyZWF0ZURlYnVnLmxvYWQoKSk7XG5cblx0cmV0dXJuIGNyZWF0ZURlYnVnO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHNldHVwO1xuIiwiLy8gc2hpbSBmb3IgdXNpbmcgcHJvY2VzcyBpbiBicm93c2VyXG52YXIgcHJvY2VzcyA9IG1vZHVsZS5leHBvcnRzID0ge307XG5cbi8vIGNhY2hlZCBmcm9tIHdoYXRldmVyIGdsb2JhbCBpcyBwcmVzZW50IHNvIHRoYXQgdGVzdCBydW5uZXJzIHRoYXQgc3R1YiBpdFxuLy8gZG9uJ3QgYnJlYWsgdGhpbmdzLiAgQnV0IHdlIG5lZWQgdG8gd3JhcCBpdCBpbiBhIHRyeSBjYXRjaCBpbiBjYXNlIGl0IGlzXG4vLyB3cmFwcGVkIGluIHN0cmljdCBtb2RlIGNvZGUgd2hpY2ggZG9lc24ndCBkZWZpbmUgYW55IGdsb2JhbHMuICBJdCdzIGluc2lkZSBhXG4vLyBmdW5jdGlvbiBiZWNhdXNlIHRyeS9jYXRjaGVzIGRlb3B0aW1pemUgaW4gY2VydGFpbiBlbmdpbmVzLlxuXG52YXIgY2FjaGVkU2V0VGltZW91dDtcbnZhciBjYWNoZWRDbGVhclRpbWVvdXQ7XG5cbmZ1bmN0aW9uIGRlZmF1bHRTZXRUaW1vdXQoKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdzZXRUaW1lb3V0IGhhcyBub3QgYmVlbiBkZWZpbmVkJyk7XG59XG5mdW5jdGlvbiBkZWZhdWx0Q2xlYXJUaW1lb3V0ICgpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2NsZWFyVGltZW91dCBoYXMgbm90IGJlZW4gZGVmaW5lZCcpO1xufVxuKGZ1bmN0aW9uICgpIHtcbiAgICB0cnkge1xuICAgICAgICBpZiAodHlwZW9mIHNldFRpbWVvdXQgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIGNhY2hlZFNldFRpbWVvdXQgPSBzZXRUaW1lb3V0O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY2FjaGVkU2V0VGltZW91dCA9IGRlZmF1bHRTZXRUaW1vdXQ7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNhY2hlZFNldFRpbWVvdXQgPSBkZWZhdWx0U2V0VGltb3V0O1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgICBpZiAodHlwZW9mIGNsZWFyVGltZW91dCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgY2FjaGVkQ2xlYXJUaW1lb3V0ID0gY2xlYXJUaW1lb3V0O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY2FjaGVkQ2xlYXJUaW1lb3V0ID0gZGVmYXVsdENsZWFyVGltZW91dDtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY2FjaGVkQ2xlYXJUaW1lb3V0ID0gZGVmYXVsdENsZWFyVGltZW91dDtcbiAgICB9XG59ICgpKVxuZnVuY3Rpb24gcnVuVGltZW91dChmdW4pIHtcbiAgICBpZiAoY2FjaGVkU2V0VGltZW91dCA9PT0gc2V0VGltZW91dCkge1xuICAgICAgICAvL25vcm1hbCBlbnZpcm9tZW50cyBpbiBzYW5lIHNpdHVhdGlvbnNcbiAgICAgICAgcmV0dXJuIHNldFRpbWVvdXQoZnVuLCAwKTtcbiAgICB9XG4gICAgLy8gaWYgc2V0VGltZW91dCB3YXNuJ3QgYXZhaWxhYmxlIGJ1dCB3YXMgbGF0dGVyIGRlZmluZWRcbiAgICBpZiAoKGNhY2hlZFNldFRpbWVvdXQgPT09IGRlZmF1bHRTZXRUaW1vdXQgfHwgIWNhY2hlZFNldFRpbWVvdXQpICYmIHNldFRpbWVvdXQpIHtcbiAgICAgICAgY2FjaGVkU2V0VGltZW91dCA9IHNldFRpbWVvdXQ7XG4gICAgICAgIHJldHVybiBzZXRUaW1lb3V0KGZ1biwgMCk7XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICAgIC8vIHdoZW4gd2hlbiBzb21lYm9keSBoYXMgc2NyZXdlZCB3aXRoIHNldFRpbWVvdXQgYnV0IG5vIEkuRS4gbWFkZG5lc3NcbiAgICAgICAgcmV0dXJuIGNhY2hlZFNldFRpbWVvdXQoZnVuLCAwKTtcbiAgICB9IGNhdGNoKGUpe1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gV2hlbiB3ZSBhcmUgaW4gSS5FLiBidXQgdGhlIHNjcmlwdCBoYXMgYmVlbiBldmFsZWQgc28gSS5FLiBkb2Vzbid0IHRydXN0IHRoZSBnbG9iYWwgb2JqZWN0IHdoZW4gY2FsbGVkIG5vcm1hbGx5XG4gICAgICAgICAgICByZXR1cm4gY2FjaGVkU2V0VGltZW91dC5jYWxsKG51bGwsIGZ1biwgMCk7XG4gICAgICAgIH0gY2F0Y2goZSl7XG4gICAgICAgICAgICAvLyBzYW1lIGFzIGFib3ZlIGJ1dCB3aGVuIGl0J3MgYSB2ZXJzaW9uIG9mIEkuRS4gdGhhdCBtdXN0IGhhdmUgdGhlIGdsb2JhbCBvYmplY3QgZm9yICd0aGlzJywgaG9wZnVsbHkgb3VyIGNvbnRleHQgY29ycmVjdCBvdGhlcndpc2UgaXQgd2lsbCB0aHJvdyBhIGdsb2JhbCBlcnJvclxuICAgICAgICAgICAgcmV0dXJuIGNhY2hlZFNldFRpbWVvdXQuY2FsbCh0aGlzLCBmdW4sIDApO1xuICAgICAgICB9XG4gICAgfVxuXG5cbn1cbmZ1bmN0aW9uIHJ1bkNsZWFyVGltZW91dChtYXJrZXIpIHtcbiAgICBpZiAoY2FjaGVkQ2xlYXJUaW1lb3V0ID09PSBjbGVhclRpbWVvdXQpIHtcbiAgICAgICAgLy9ub3JtYWwgZW52aXJvbWVudHMgaW4gc2FuZSBzaXR1YXRpb25zXG4gICAgICAgIHJldHVybiBjbGVhclRpbWVvdXQobWFya2VyKTtcbiAgICB9XG4gICAgLy8gaWYgY2xlYXJUaW1lb3V0IHdhc24ndCBhdmFpbGFibGUgYnV0IHdhcyBsYXR0ZXIgZGVmaW5lZFxuICAgIGlmICgoY2FjaGVkQ2xlYXJUaW1lb3V0ID09PSBkZWZhdWx0Q2xlYXJUaW1lb3V0IHx8ICFjYWNoZWRDbGVhclRpbWVvdXQpICYmIGNsZWFyVGltZW91dCkge1xuICAgICAgICBjYWNoZWRDbGVhclRpbWVvdXQgPSBjbGVhclRpbWVvdXQ7XG4gICAgICAgIHJldHVybiBjbGVhclRpbWVvdXQobWFya2VyKTtcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgICAgLy8gd2hlbiB3aGVuIHNvbWVib2R5IGhhcyBzY3Jld2VkIHdpdGggc2V0VGltZW91dCBidXQgbm8gSS5FLiBtYWRkbmVzc1xuICAgICAgICByZXR1cm4gY2FjaGVkQ2xlYXJUaW1lb3V0KG1hcmtlcik7XG4gICAgfSBjYXRjaCAoZSl7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBXaGVuIHdlIGFyZSBpbiBJLkUuIGJ1dCB0aGUgc2NyaXB0IGhhcyBiZWVuIGV2YWxlZCBzbyBJLkUuIGRvZXNuJ3QgIHRydXN0IHRoZSBnbG9iYWwgb2JqZWN0IHdoZW4gY2FsbGVkIG5vcm1hbGx5XG4gICAgICAgICAgICByZXR1cm4gY2FjaGVkQ2xlYXJUaW1lb3V0LmNhbGwobnVsbCwgbWFya2VyKTtcbiAgICAgICAgfSBjYXRjaCAoZSl7XG4gICAgICAgICAgICAvLyBzYW1lIGFzIGFib3ZlIGJ1dCB3aGVuIGl0J3MgYSB2ZXJzaW9uIG9mIEkuRS4gdGhhdCBtdXN0IGhhdmUgdGhlIGdsb2JhbCBvYmplY3QgZm9yICd0aGlzJywgaG9wZnVsbHkgb3VyIGNvbnRleHQgY29ycmVjdCBvdGhlcndpc2UgaXQgd2lsbCB0aHJvdyBhIGdsb2JhbCBlcnJvci5cbiAgICAgICAgICAgIC8vIFNvbWUgdmVyc2lvbnMgb2YgSS5FLiBoYXZlIGRpZmZlcmVudCBydWxlcyBmb3IgY2xlYXJUaW1lb3V0IHZzIHNldFRpbWVvdXRcbiAgICAgICAgICAgIHJldHVybiBjYWNoZWRDbGVhclRpbWVvdXQuY2FsbCh0aGlzLCBtYXJrZXIpO1xuICAgICAgICB9XG4gICAgfVxuXG5cblxufVxudmFyIHF1ZXVlID0gW107XG52YXIgZHJhaW5pbmcgPSBmYWxzZTtcbnZhciBjdXJyZW50UXVldWU7XG52YXIgcXVldWVJbmRleCA9IC0xO1xuXG5mdW5jdGlvbiBjbGVhblVwTmV4dFRpY2soKSB7XG4gICAgaWYgKCFkcmFpbmluZyB8fCAhY3VycmVudFF1ZXVlKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgZHJhaW5pbmcgPSBmYWxzZTtcbiAgICBpZiAoY3VycmVudFF1ZXVlLmxlbmd0aCkge1xuICAgICAgICBxdWV1ZSA9IGN1cnJlbnRRdWV1ZS5jb25jYXQocXVldWUpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHF1ZXVlSW5kZXggPSAtMTtcbiAgICB9XG4gICAgaWYgKHF1ZXVlLmxlbmd0aCkge1xuICAgICAgICBkcmFpblF1ZXVlKCk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBkcmFpblF1ZXVlKCkge1xuICAgIGlmIChkcmFpbmluZykge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIHZhciB0aW1lb3V0ID0gcnVuVGltZW91dChjbGVhblVwTmV4dFRpY2spO1xuICAgIGRyYWluaW5nID0gdHJ1ZTtcblxuICAgIHZhciBsZW4gPSBxdWV1ZS5sZW5ndGg7XG4gICAgd2hpbGUobGVuKSB7XG4gICAgICAgIGN1cnJlbnRRdWV1ZSA9IHF1ZXVlO1xuICAgICAgICBxdWV1ZSA9IFtdO1xuICAgICAgICB3aGlsZSAoKytxdWV1ZUluZGV4IDwgbGVuKSB7XG4gICAgICAgICAgICBpZiAoY3VycmVudFF1ZXVlKSB7XG4gICAgICAgICAgICAgICAgY3VycmVudFF1ZXVlW3F1ZXVlSW5kZXhdLnJ1bigpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHF1ZXVlSW5kZXggPSAtMTtcbiAgICAgICAgbGVuID0gcXVldWUubGVuZ3RoO1xuICAgIH1cbiAgICBjdXJyZW50UXVldWUgPSBudWxsO1xuICAgIGRyYWluaW5nID0gZmFsc2U7XG4gICAgcnVuQ2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xufVxuXG5wcm9jZXNzLm5leHRUaWNrID0gZnVuY3Rpb24gKGZ1bikge1xuICAgIHZhciBhcmdzID0gbmV3IEFycmF5KGFyZ3VtZW50cy5sZW5ndGggLSAxKTtcbiAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDE7IGkgPCBhcmd1bWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGFyZ3NbaSAtIDFdID0gYXJndW1lbnRzW2ldO1xuICAgICAgICB9XG4gICAgfVxuICAgIHF1ZXVlLnB1c2gobmV3IEl0ZW0oZnVuLCBhcmdzKSk7XG4gICAgaWYgKHF1ZXVlLmxlbmd0aCA9PT0gMSAmJiAhZHJhaW5pbmcpIHtcbiAgICAgICAgcnVuVGltZW91dChkcmFpblF1ZXVlKTtcbiAgICB9XG59O1xuXG4vLyB2OCBsaWtlcyBwcmVkaWN0aWJsZSBvYmplY3RzXG5mdW5jdGlvbiBJdGVtKGZ1biwgYXJyYXkpIHtcbiAgICB0aGlzLmZ1biA9IGZ1bjtcbiAgICB0aGlzLmFycmF5ID0gYXJyYXk7XG59XG5JdGVtLnByb3RvdHlwZS5ydW4gPSBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5mdW4uYXBwbHkobnVsbCwgdGhpcy5hcnJheSk7XG59O1xucHJvY2Vzcy50aXRsZSA9ICdicm93c2VyJztcbnByb2Nlc3MuYnJvd3NlciA9IHRydWU7XG5wcm9jZXNzLmVudiA9IHt9O1xucHJvY2Vzcy5hcmd2ID0gW107XG5wcm9jZXNzLnZlcnNpb24gPSAnJzsgLy8gZW1wdHkgc3RyaW5nIHRvIGF2b2lkIHJlZ2V4cCBpc3N1ZXNcbnByb2Nlc3MudmVyc2lvbnMgPSB7fTtcblxuZnVuY3Rpb24gbm9vcCgpIHt9XG5cbnByb2Nlc3Mub24gPSBub29wO1xucHJvY2Vzcy5hZGRMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLm9uY2UgPSBub29wO1xucHJvY2Vzcy5vZmYgPSBub29wO1xucHJvY2Vzcy5yZW1vdmVMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUFsbExpc3RlbmVycyA9IG5vb3A7XG5wcm9jZXNzLmVtaXQgPSBub29wO1xucHJvY2Vzcy5wcmVwZW5kTGlzdGVuZXIgPSBub29wO1xucHJvY2Vzcy5wcmVwZW5kT25jZUxpc3RlbmVyID0gbm9vcDtcblxucHJvY2Vzcy5saXN0ZW5lcnMgPSBmdW5jdGlvbiAobmFtZSkgeyByZXR1cm4gW10gfVxuXG5wcm9jZXNzLmJpbmRpbmcgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5iaW5kaW5nIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG5cbnByb2Nlc3MuY3dkID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gJy8nIH07XG5wcm9jZXNzLmNoZGlyID0gZnVuY3Rpb24gKGRpcikge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5jaGRpciBpcyBub3Qgc3VwcG9ydGVkJyk7XG59O1xucHJvY2Vzcy51bWFzayA9IGZ1bmN0aW9uKCkgeyByZXR1cm4gMDsgfTtcbiJdfQ==

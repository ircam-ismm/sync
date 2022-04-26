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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJkaXN0L2NsaWVudC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9AaXJjYW0vc3luYy9jbGllbnQvaW5kZXguanMiLCJub2RlX21vZHVsZXMvQGlyY2FtL3N5bmMvaW5kZXguanMiLCJub2RlX21vZHVsZXMvQGlyY2FtL3N5bmMvc2VydmVyL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2JhYmVsLXJ1bnRpbWUvY29yZS1qcy9qc29uL3N0cmluZ2lmeS5qcyIsIm5vZGVfbW9kdWxlcy9jb3JlLWpzL2xpYnJhcnkvZm4vanNvbi9zdHJpbmdpZnkuanMiLCJub2RlX21vZHVsZXMvY29yZS1qcy9saWJyYXJ5L21vZHVsZXMvX2NvcmUuanMiLCJub2RlX21vZHVsZXMvZGVidWcvbm9kZV9tb2R1bGVzL21zL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2RlYnVnL3NyYy9icm93c2VyLmpzIiwibm9kZV9tb2R1bGVzL2RlYnVnL3NyYy9jb21tb24uanMiLCJub2RlX21vZHVsZXMvcHJvY2Vzcy9icm93c2VyLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7O0FDQ0E7Ozs7QUFFQSxJQUFNLGtCQUFrQixTQUFsQixlQUFrQixHQUFNO0FBQzVCLFNBQU8sWUFBWSxHQUFaLEtBQW9CLElBQTNCO0FBQ0QsQ0FGRCxDLENBSEE7OztBQU9BLFNBQVMsSUFBVCxHQUFnQjtBQUNkLE1BQU0sTUFBTSxPQUFPLFFBQVAsQ0FBZ0IsTUFBaEIsQ0FBdUIsT0FBdkIsQ0FBK0IsTUFBL0IsRUFBdUMsSUFBdkMsQ0FBWjs7QUFFQTtBQUNBLE1BQU0sU0FBUyxJQUFJLFNBQUosQ0FBYyxHQUFkLENBQWY7QUFDQTtBQUNBLE1BQU0sYUFBYSxJQUFJLGdCQUFKLENBQWUsZUFBZixDQUFuQjs7QUFFQSxNQUFNLFlBQVksU0FBUyxhQUFULENBQXVCLFlBQXZCLENBQWxCO0FBQ0EsY0FBWSxZQUFNO0FBQ2hCLFFBQU0sV0FBVyxXQUFXLFdBQVgsRUFBakI7QUFDQSxjQUFVLFNBQVYsR0FBc0IsUUFBdEI7QUFDRCxHQUhELEVBR0csR0FISDs7QUFLQSxTQUFPLGdCQUFQLENBQXdCLE1BQXhCLEVBQWdDLFlBQU07QUFDcEMsUUFBTSxlQUFlLFNBQWYsWUFBZSxDQUFDLE1BQUQsRUFBUyxjQUFULEVBQTRCO0FBQy9DLFVBQU0sVUFBVSxFQUFoQjtBQUNBLGNBQVEsQ0FBUixJQUFhLENBQWIsQ0FGK0MsQ0FFL0I7QUFDaEIsY0FBUSxDQUFSLElBQWEsTUFBYjtBQUNBLGNBQVEsQ0FBUixJQUFhLGNBQWI7O0FBRUEsY0FBUSxHQUFSLGtDQUE2QyxRQUFRLENBQVIsQ0FBN0MsRUFBeUQsUUFBUSxDQUFSLENBQXpEOztBQUVBLGFBQU8sSUFBUCxDQUFZLHlCQUFlLE9BQWYsQ0FBWjtBQUNELEtBVEQ7O0FBV0EsUUFBTSxrQkFBa0IsU0FBbEIsZUFBa0IsV0FBWTtBQUNsQyxhQUFPLGdCQUFQLENBQXdCLFNBQXhCLEVBQW1DLGFBQUs7QUFDdEMsWUFBTSxXQUFXLEtBQUssS0FBTCxDQUFXLEVBQUUsSUFBYixDQUFqQjtBQUNBLGdCQUFRLEdBQVIsQ0FBWSxRQUFaOztBQUVBLFlBQUksU0FBUyxDQUFULE1BQWdCLENBQXBCLEVBQXVCO0FBQUU7QUFDdkIsY0FBTSxTQUFTLFNBQVMsQ0FBVCxDQUFmO0FBQ0EsY0FBTSxpQkFBaUIsU0FBUyxDQUFULENBQXZCO0FBQ0EsY0FBTSxpQkFBaUIsU0FBUyxDQUFULENBQXZCO0FBQ0EsY0FBTSxpQkFBaUIsU0FBUyxDQUFULENBQXZCOztBQUVBLGtCQUFRLEdBQVIsZ0ZBQ0UsTUFERixFQUNVLGNBRFYsRUFDMEIsY0FEMUIsRUFDMEMsY0FEMUM7O0FBR0EsbUJBQVMsTUFBVCxFQUFpQixjQUFqQixFQUFpQyxjQUFqQyxFQUFpRCxjQUFqRDtBQUNEO0FBQ0YsT0FmRDtBQWdCRCxLQWpCRDs7QUFtQkEsUUFBTSxtQkFBbUIsU0FBUyxhQUFULENBQXVCLFNBQXZCLENBQXpCO0FBQ0EsUUFBTSxpQkFBaUIsU0FBakIsY0FBaUIsU0FBVTtBQUMvQix1QkFBaUIsU0FBakIsR0FBNkIseUJBQWUsTUFBZixFQUF1QixJQUF2QixFQUE2QixDQUE3QixDQUE3QjtBQUNBLGNBQVEsR0FBUixDQUFZLE1BQVo7QUFDRCxLQUhEOztBQUtBLGVBQVcsS0FBWCxDQUFpQixZQUFqQixFQUErQixlQUEvQixFQUFnRCxjQUFoRDtBQUNELEdBdENEOztBQXdDQSxTQUFPLGdCQUFQLENBQXdCLE9BQXhCLEVBQWlDO0FBQUEsV0FBTyxRQUFRLEtBQVIsQ0FBYyxJQUFJLEtBQWxCLENBQVA7QUFBQSxHQUFqQztBQUNBLFNBQU8sZ0JBQVAsQ0FBd0IsT0FBeEIsRUFBaUM7QUFBQSxXQUFNLFFBQVEsR0FBUixDQUFZLGVBQVosQ0FBTjtBQUFBLEdBQWpDO0FBQ0Q7O0FBRUQsT0FBTyxnQkFBUCxDQUF3QixNQUF4QixFQUFnQyxJQUFoQzs7O0FDakVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdG9CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxSEE7O0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0xBO0FBQ0E7QUFDQTs7QUNGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FDbEtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQzdRQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyUUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uKCl7ZnVuY3Rpb24gcihlLG4sdCl7ZnVuY3Rpb24gbyhpLGYpe2lmKCFuW2ldKXtpZighZVtpXSl7dmFyIGM9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZTtpZighZiYmYylyZXR1cm4gYyhpLCEwKTtpZih1KXJldHVybiB1KGksITApO3ZhciBhPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIraStcIidcIik7dGhyb3cgYS5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGF9dmFyIHA9bltpXT17ZXhwb3J0czp7fX07ZVtpXVswXS5jYWxsKHAuZXhwb3J0cyxmdW5jdGlvbihyKXt2YXIgbj1lW2ldWzFdW3JdO3JldHVybiBvKG58fHIpfSxwLHAuZXhwb3J0cyxyLGUsbix0KX1yZXR1cm4gbltpXS5leHBvcnRzfWZvcih2YXIgdT1cImZ1bmN0aW9uXCI9PXR5cGVvZiByZXF1aXJlJiZyZXF1aXJlLGk9MDtpPHQubGVuZ3RoO2krKylvKHRbaV0pO3JldHVybiBvfXJldHVybiByfSkoKSIsIi8vIGltcG9ydCBTeW5jQ2xpZW50IGZyb20gJ0BpcmNhbS9zeW5jL2NsaWVudCc7XG5pbXBvcnQgeyBTeW5jQ2xpZW50IH0gZnJvbSAnQGlyY2FtL3N5bmMnO1xuXG5jb25zdCBnZXRUaW1lRnVuY3Rpb24gPSAoKSA9PiB7XG4gIHJldHVybiBwZXJmb3JtYW5jZS5ub3coKSAvIDEwMDA7XG59XG5cbmZ1bmN0aW9uIGluaXQoKSB7XG4gIGNvbnN0IHVybCA9IHdpbmRvdy5sb2NhdGlvbi5vcmlnaW4ucmVwbGFjZSgnaHR0cCcsICd3cycpO1xuXG4gIC8vIGluaXQgc29ja2V0IGNsaWVudFxuICBjb25zdCBzb2NrZXQgPSBuZXcgV2ViU29ja2V0KHVybCk7XG4gIC8vIGluaXQgc3luYyBjbGllbnRcbiAgY29uc3Qgc3luY0NsaWVudCA9IG5ldyBTeW5jQ2xpZW50KGdldFRpbWVGdW5jdGlvbik7XG5cbiAgY29uc3QgJHN5bmNUaW1lID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI3N5bmMtdGltZScpO1xuICBzZXRJbnRlcnZhbCgoKSA9PiB7XG4gICAgY29uc3Qgc3luY1RpbWUgPSBzeW5jQ2xpZW50LmdldFN5bmNUaW1lKCk7XG4gICAgJHN5bmNUaW1lLmlubmVySFRNTCA9IHN5bmNUaW1lO1xuICB9LCAxMDApO1xuXG4gIHNvY2tldC5hZGRFdmVudExpc3RlbmVyKCdvcGVuJywgKCkgPT4ge1xuICAgIGNvbnN0IHNlbmRGdW5jdGlvbiA9IChwaW5nSWQsIGNsaWVudFBpbmdUaW1lKSA9PiB7XG4gICAgICBjb25zdCByZXF1ZXN0ID0gW107XG4gICAgICByZXF1ZXN0WzBdID0gMDsgLy8gdGhpcyBpcyBhIHBpbmdcbiAgICAgIHJlcXVlc3RbMV0gPSBwaW5nSWQ7XG4gICAgICByZXF1ZXN0WzJdID0gY2xpZW50UGluZ1RpbWU7XG5cbiAgICAgIGNvbnNvbGUubG9nKGBbcGluZ10gLSBpZDogJXMsIHBpbmdUaW1lOiAlc2AsIHJlcXVlc3RbMV0sIHJlcXVlc3RbMl0pO1xuXG4gICAgICBzb2NrZXQuc2VuZChKU09OLnN0cmluZ2lmeShyZXF1ZXN0KSk7XG4gICAgfTtcblxuICAgIGNvbnN0IHJlY2VpdmVGdW5jdGlvbiA9IGNhbGxiYWNrID0+IHtcbiAgICAgIHNvY2tldC5hZGRFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgZSA9PiB7XG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gSlNPTi5wYXJzZShlLmRhdGEpO1xuICAgICAgICBjb25zb2xlLmxvZyhyZXNwb25zZSk7XG5cbiAgICAgICAgaWYgKHJlc3BvbnNlWzBdID09PSAxKSB7IC8vIHRoaXMgaXMgYSBwb25nXG4gICAgICAgICAgY29uc3QgcGluZ0lkID0gcmVzcG9uc2VbMV07XG4gICAgICAgICAgY29uc3QgY2xpZW50UGluZ1RpbWUgPSByZXNwb25zZVsyXTtcbiAgICAgICAgICBjb25zdCBzZXJ2ZXJQaW5nVGltZSA9IHJlc3BvbnNlWzNdO1xuICAgICAgICAgIGNvbnN0IHNlcnZlclBvbmdUaW1lID0gcmVzcG9uc2VbNF07XG5cbiAgICAgICAgICBjb25zb2xlLmxvZyhgW3BvbmddIC0gaWQ6ICVzLCBjbGllbnRQaW5nVGltZTogJXMsIHNlcnZlclBpbmdUaW1lOiAlcywgc2VydmVyUG9uZ1RpbWU6ICVzYCxcbiAgICAgICAgICAgIHBpbmdJZCwgY2xpZW50UGluZ1RpbWUsIHNlcnZlclBpbmdUaW1lLCBzZXJ2ZXJQb25nVGltZSk7XG5cbiAgICAgICAgICBjYWxsYmFjayhwaW5nSWQsIGNsaWVudFBpbmdUaW1lLCBzZXJ2ZXJQaW5nVGltZSwgc2VydmVyUG9uZ1RpbWUpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBjb25zdCAkc3RhdHVzQ29udGFpbmVyID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI3N0YXR1cycpO1xuICAgIGNvbnN0IHN0YXR1c0Z1bmN0aW9uID0gc3RhdHVzID0+IHtcbiAgICAgICRzdGF0dXNDb250YWluZXIuaW5uZXJIVE1MID0gSlNPTi5zdHJpbmdpZnkoc3RhdHVzLCBudWxsLCAyKTtcbiAgICAgIGNvbnNvbGUubG9nKHN0YXR1cyk7XG4gICAgfTtcblxuICAgIHN5bmNDbGllbnQuc3RhcnQoc2VuZEZ1bmN0aW9uLCByZWNlaXZlRnVuY3Rpb24sIHN0YXR1c0Z1bmN0aW9uKTtcbiAgfSk7XG5cbiAgc29ja2V0LmFkZEV2ZW50TGlzdGVuZXIoJ2Vycm9yJywgZXJyID0+IGNvbnNvbGUuZXJyb3IoZXJyLnN0YWNrKSk7XG4gIHNvY2tldC5hZGRFdmVudExpc3RlbmVyKCdjbG9zZScsICgpID0+IGNvbnNvbGUubG9nKCdzb2NrZXQgY2xvc2VkJykpO1xufVxuXG53aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbG9hZCcsIGluaXQpO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwge1xuICB2YWx1ZTogdHJ1ZVxufSk7XG5leHBvcnRzLmRlZmF1bHQgPSB2b2lkIDA7XG5cbnZhciBfZGVidWcgPSBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KHJlcXVpcmUoXCJkZWJ1Z1wiKSk7XG5cbmZ1bmN0aW9uIF9pbnRlcm9wUmVxdWlyZURlZmF1bHQob2JqKSB7IHJldHVybiBvYmogJiYgb2JqLl9fZXNNb2R1bGUgPyBvYmogOiB7IGRlZmF1bHQ6IG9iaiB9OyB9XG5cbi8qKlxuICogQGZpbGVPdmVydmlldyBFc3RpbWF0aW9uIG9mIGEgc2VydmVyIHRpbWUgZnJvbSBhIGNsaWVudCB0aW1lLlxuICpcbiAqIEBzZWUge0BsaW5rIGh0dHBzOi8vaGFsLmFyY2hpdmVzLW91dmVydGVzLmZyL2hhbC0wMTMwNDg4OXYxfVxuICogU3RhYmlsaXNhdGlvbiBhZGRlZCBhZnRlciB0aGUgYXJ0aWNsZS5cbiAqL1xuY29uc3QgbG9nID0gKDAsIF9kZWJ1Zy5kZWZhdWx0KSgnc3luYycpOyAvLy8vLy8gaGVscGVyc1xuXG4vKipcbiAqIE9yZGVyIG1pbiBhbmQgbWF4IGF0dHJpYnV0ZXMuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7T2JqZWN0fSB0aGF0IHdpdGggbWluIGFuZCBtYXggYXR0cmlidXRlc1xuICogQHJldHVybnMge09iamVjdH0gd2l0aCBtaW4gYW5kIG1hbiBhdHRyaWJ1dGVzLCBzd2FwcGVkIGlmIHRoYXQubWluID4gdGhhdC5tYXhcbiAqL1xuXG5mdW5jdGlvbiBvcmRlck1pbk1heCh0aGF0KSB7XG4gIGlmICh0eXBlb2YgdGhhdCAhPT0gJ3VuZGVmaW5lZCcgJiYgdHlwZW9mIHRoYXQubWluICE9PSAndW5kZWZpbmVkJyAmJiB0eXBlb2YgdGhhdC5tYXggIT09ICd1bmRlZmluZWQnICYmIHRoYXQubWluID4gdGhhdC5tYXgpIHtcbiAgICBjb25zdCB0bXAgPSB0aGF0Lm1pbjtcbiAgICB0aGF0Lm1pbiA9IHRoYXQubWF4O1xuICAgIHRoYXQubWF4ID0gdG1wO1xuICB9XG5cbiAgcmV0dXJuIHRoYXQ7XG59XG4vKipcbiAqIE1lYW4gb3ZlciBhbiBhcnJheSwgc2VsZWN0aW5nIG9uZSBkaW1lbnNpb24gb2YgdGhlIGFycmF5IHZhbHVlcy5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtBcnJheS48QXJyYXkuPE51bWJlcj4+fSBhcnJheVxuICogQHBhcmFtIHtOdW1iZXJ9IFtkaW1lbnNpb249MF1cbiAqIEByZXR1cm5zIHtOdW1iZXJ9IG1lYW5cbiAqL1xuXG5cbmZ1bmN0aW9uIG1lYW4oYXJyYXksIGRpbWVuc2lvbiA9IDApIHtcbiAgcmV0dXJuIGFycmF5LnJlZHVjZSgocCwgcSkgPT4gcCArIHFbZGltZW5zaW9uXSwgMCkgLyBhcnJheS5sZW5ndGg7XG59XG4vKipcbiAqIEZ1bmN0aW9uIHVzZWQgdG8gc29ydCBsb25nLXRlcm0gZGF0YSwgdXNpbmcgZmlyc3QgYW5kIHNlY29uZCBkaW1lbnNpb25zLCBpblxuICogdGhhdCBvcmRlci5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtBcnJheS48TnVtYmVyPn0gYVxuICogQHBhcmFtIHtOdW1iZXIuPE51bWJlcj59IGJcbiAqIEByZXR1cm5zIHtOdW1iZXJ9IG5lZ2F0aXZlIGlmIGEgPCBiLCBwb3NpdGl2ZSBpZiBhID4gYiwgb3IgMFxuICovXG5cblxuZnVuY3Rpb24gZGF0YUNvbXBhcmUoYSwgYikge1xuICByZXR1cm4gYVswXSAtIGJbMF0gfHwgYVsxXSAtIGJbMV07XG59XG4vKipcbiAqIEBjYWxsYmFjayBTeW5jQ2xpZW50fmdldFRpbWVGdW5jdGlvblxuICogQHJldHVybiB7TnVtYmVyfSBzdHJpY3RseSBtb25vdG9uaWMsIGV2ZXIgaW5jcmVhc2luZywgdGltZSBpbiBzZWNvbmQuIFdoZW5cbiAqICAgcG9zc2libGUgdGhlIHNlcnZlciBjb2RlIHNob3VsZCBkZWZpbmUgaXRzIG93biBvcmlnaW4gKGkuZS4gYHRpbWU9MGApIGluXG4gKiAgIG9yZGVyIHRvIG1heGltaXplIHRoZSByZXNvbHV0aW9uIG9mIHRoZSBjbG9jayBmb3IgYSBsb25nIHBlcmlvZCBvZlxuICogICB0aW1lLiBXaGVuIGBTeW5jU2VydmVyfnN0YXJ0YCBpcyBjYWxsZWQgdGhlIGNsb2NrIHNob3VsZCBhbHJlYWR5IGJlXG4gKiAgIHJ1bm5pbmcgKGNmLiBgYXVkaW9Db250ZXh0LmN1cnJlbnRUaW1lYCB0aGF0IG5lZWRzIHVzZXIgaW50ZXJhY3Rpb24gdG9cbiAqICAgc3RhcnQpXG4gKiovXG5cbi8qKlxuICogQGNhbGxiYWNrIFN5bmNDbGllbnR+c2VuZEZ1bmN0aW9uXG4gKiBAc2VlIHtAbGluayBTeW5jU2VydmVyfnJlY2VpdmVGdW5jdGlvbn1cbiAqIEBwYXJhbSB7TnVtYmVyfSBwaW5nSWQgdW5pcXVlIGlkZW50aWZpZXJcbiAqIEBwYXJhbSB7TnVtYmVyfSBjbGllbnRQaW5nVGltZSB0aW1lLXN0YW1wIG9mIHBpbmcgZW1pc3Npb25cbiAqKi9cblxuLyoqXG4gKiBAY2FsbGJhY2sgU3luY0NsaWVudH5yZWNlaXZlRnVuY3Rpb25cbiAqIEBzZWUge0BsaW5rIFN5bmNTZXJ2ZXJ+c2VuZEZ1bmN0aW9ufVxuICogQHBhcmFtIHtTeW5jQ2xpZW50fnJlY2VpdmVDYWxsYmFja30gcmVjZWl2ZUNhbGxiYWNrIGNhbGxlZCBvbiBlYWNoIG1lc3NhZ2VcbiAqICAgbWF0Y2hpbmcgbWVzc2FnZVR5cGUuXG4gKiovXG5cbi8qKlxuICogQGNhbGxiYWNrIFN5bmNDbGllbnR+cmVjZWl2ZUNhbGxiYWNrXG4gKiBAcGFyYW0ge051bWJlcn0gcGluZ0lkIHVuaXF1ZSBpZGVudGlmaWVyXG4gKiBAcGFyYW0ge051bWJlcn0gY2xpZW50UGluZ1RpbWUgdGltZS1zdGFtcCBvZiBwaW5nIGVtaXNzaW9uXG4gKiBAcGFyYW0ge051bWJlcn0gc2VydmVyUGluZ1RpbWUgdGltZS1zdGFtcCBvZiBwaW5nIHJlY2VwdGlvblxuICogQHBhcmFtIHtOdW1iZXJ9IHNlcnZlclBvbmdUaW1lIHRpbWUtc3RhbXAgb2YgcG9uZyBlbWlzc2lvblxuICoqL1xuXG4vKipcbiAqIEBjYWxsYmFjayBTeW5jQ2xpZW50fnJlcG9ydEZ1bmN0aW9uXG4gKiBAcGFyYW0ge09iamVjdH0gcmVwb3J0XG4gKiBAcGFyYW0ge1N0cmluZ30gcmVwb3J0LnN0YXR1cyBgbmV3YCwgYHN0YXJ0dXBgLCBgdHJhaW5pbmdgIChvZmZzZXRcbiAqICAgYWRhcHRhdGlvbiksIG9yIGBzeW5jYCAob2Zmc2V0IGFuZCBzcGVlZCBhZGFwdGF0aW9uKS5cbiAqIEBwYXJhbSB7TnVtYmVyfSByZXBvcnQuc3RhdHVzRHVyYXRpb24gZHVyYXRpb24gc2luY2UgbGFzdCBzdGF0dXNcbiAqICAgY2hhbmdlLlxuICogQHBhcmFtIHtOdW1iZXJ9IHJlcG9ydC50aW1lT2Zmc2V0IHRpbWUgZGlmZmVyZW5jZSBiZXR3ZWVuIGxvY2FsIHRpbWUgYW5kXG4gKiAgIHN5bmMgdGltZSwgaW4gc2Vjb25kcy5cbiAqIEBwYXJhbSB7TnVtYmVyfSByZXBvcnQuZnJlcXVlbmN5UmF0aW8gdGltZSByYXRpbyBiZXR3ZWVuIGxvY2FsXG4gKiAgIHRpbWUgYW5kIHN5bmMgdGltZS5cbiAqIEBwYXJhbSB7U3RyaW5nfSByZXBvcnQuY29ubmVjdGlvbiBgb2ZmbGluZWAgb3IgYG9ubGluZWBcbiAqIEBwYXJhbSB7TnVtYmVyfSByZXBvcnQuY29ubmVjdGlvbkR1cmF0aW9uIGR1cmF0aW9uIHNpbmNlIGxhc3QgY29ubmVjdGlvblxuICogICBjaGFuZ2UuXG4gKiBAcGFyYW0ge051bWJlcn0gcmVwb3J0LmNvbm5lY3Rpb25UaW1lT3V0IGR1cmF0aW9uLCBpbiBzZWNvbmRzLCBiZWZvcmVcbiAqICAgYSB0aW1lLW91dCBvY2N1cnMuXG4gKiBAcGFyYW0ge051bWJlcn0gcmVwb3J0LnRyYXZlbER1cmF0aW9uIGR1cmF0aW9uIG9mIGEgcGluZy1wb25nIHJvdW5kLXRyaXAsXG4gKiAgIGluIHNlY29uZHMsIG1lYW4gb3ZlciB0aGUgdGhlIGxhc3QgcGluZy1wb25nIHNlcmllcy5cbiAqIEBwYXJhbSB7TnVtYmVyfSByZXBvcnQudHJhdmVsRHVyYXRpb25NaW4gZHVyYXRpb24gb2YgYSBwaW5nLXBvbmdcbiAqICAgcm91bmQtdHJpcCwgaW4gc2Vjb25kcywgbWluaW11bSBvdmVyIHRoZSB0aGUgbGFzdCBwaW5nLXBvbmcgc2VyaWVzLlxuICogQHBhcmFtIHtOdW1iZXJ9IHJlcG9ydC50cmF2ZWxEdXJhdGlvbk1heCBkdXJhdGlvbiBvZiBhIHBpbmctcG9uZ1xuICogICByb3VuZC10cmlwLCBpbiBzZWNvbmRzLCBtYXhpbXVtIG92ZXIgdGhlIHRoZSBsYXN0IHBpbmctcG9uZyBzZXJpZXMuXG4gKiovXG5cbi8qKlxuICogYFN5bmNDbGllbnRgIGluc3RhbmNlcyBzeW5jaHJvbml6ZSB0byB0aGUgY2xvY2sgcHJvdmlkZWRcbiAqIGJ5IHRoZSB7QGxpbmsgU3luY1NlcnZlcn0gaW5zdGFuY2UuIFRoZSBkZWZhdWx0IGVzdGltYXRpb24gYmVoYXZpb3IgaXNcbiAqIHN0cmljdGx5IG1vbm90b25pYyBhbmQgZ3VhcmFudGVlIGEgdW5pcXVlIGNvbnZlcnRpb24gZnJvbSBzZXJ2ZXIgdGltZVxuICogdG8gbG9jYWwgdGltZS5cbiAqXG4gKiBAc2VlIHtAbGluayBTeW5jQ2xpZW50fnN0YXJ0fSBtZXRob2QgdG8gYWN0dWFsbHkgc3RhcnQgYSBzeW5jaHJvbmlzYXRpb25cbiAqIHByb2Nlc3MuXG4gKlxuICogQHBhcmFtIHtTeW5jQ2xpZW50fmdldFRpbWVGdW5jdGlvbn0gZ2V0VGltZUZ1bmN0aW9uXG4gKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdXG4gKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnMucGluZ1RpbWVPdXREZWxheV0gcmFuZ2Ugb2YgZHVyYXRpb24gKGluIHNlY29uZHMpXG4gKiAgIHRvIGNvbnNpZGVyIGEgcGluZyB3YXMgbm90IHBvbmdlZCBiYWNrXG4gKiBAcGFyYW0ge051bWJlcn0gW29wdGlvbnMucGluZ1RpbWVPdXREZWxheS5taW49MV0gbWluIGFuZCBtYXggbXVzdCBiZSBzZXRcbiAqICAgdG9nZXRoZXJcbiAqIEBwYXJhbSB7TnVtYmVyfSBbb3B0aW9ucy5waW5nVGltZU91dERlbGF5Lm1heD0zMF0gbWluIGFuZCBtYXggbXVzdCBiZSBzZXRcbiAqICAgdG9nZXRoZXJcbiAqIEBwYXJhbSB7TnVtYmVyfSBbb3B0aW9ucy5waW5nU2VyaWVzSXRlcmF0aW9ucz0xMF0gbnVtYmVyIG9mIHBpbmctcG9uZ3MgaW4gYVxuICogICBzZXJpZXNcbiAqIEBwYXJhbSB7TnVtYmVyfSBbb3B0aW9ucy5waW5nU2VyaWVzUGVyaW9kPTAuMjUwXSBpbnRlcnZhbCAoaW4gc2Vjb25kcylcbiAqICAgYmV0d2VlbiBwaW5ncyBpbiBhIHNlcmllc1xuICogQHBhcmFtIHtOdW1iZXJ9IFtvcHRpb25zLnBpbmdTZXJpZXNEZWxheV0gcmFuZ2Ugb2YgaW50ZXJ2YWwgKGluIHNlY29uZHMpXG4gKiAgIGJldHdlZW4gcGluZy1wb25nIHNlcmllc1xuICogQHBhcmFtIHtOdW1iZXJ9IFtvcHRpb25zLnBpbmdTZXJpZXNEZWxheS5taW49MTBdIG1pbiBhbmQgbWF4IG11c3QgYmUgc2V0XG4gKiAgIHRvZ2V0aGVyXG4gKiBAcGFyYW0ge051bWJlcn0gW29wdGlvbnMucGluZ1Nlcmllc0RlbGF5Lm1heD0yMF0gbWluIGFuZCBtYXggbXVzdCBiZSBzZXRcbiAqICAgdG9nZXRoZXJcbiAqIEBwYXJhbSB7TnVtYmVyfSBbb3B0aW9ucy5sb25nVGVybURhdGFUcmFpbmluZ0R1cmF0aW9uPTEyMF0gZHVyYXRpb24gb2ZcbiAqICAgdHJhaW5pbmcsIGluIHNlY29uZHMsIGFwcHJveGltYXRlbHksIGJlZm9yZSB1c2luZyB0aGUgZXN0aW1hdGUgb2YgY2xvY2tcbiAqICAgZnJlcXVlbmN5XG4gKiBAcGFyYW0ge051bWJlcn0gW29wdGlvbnMubG9uZ1Rlcm1EYXRhRHVyYXRpb249OTAwXSBlc3RpbWF0ZSBzeW5jaHJvbmlzYXRpb24gb3ZlclxuICogICB0aGlzIGR1cmF0aW9uLCBpbiBzZWNvbmRzLCBhcHByb3hpbWF0ZWx5XG4gKiBAcGFyYW0ge0Jvb2xlYW59IFtvcHRpb25zLmVzdGltYXRpb25Nb25vdG9uaWNpdHk9dHJ1ZV0gV2hlbiBgdHJ1ZWAsIHRoZVxuICogICBlc3RpbWF0aW9uIG9mIHRoZSBzZXJ2ZXIgdGltZSBpcyBzdHJpY3RseSBtb25vdG9uaWMsIGFuZCB0aGUgbWF4aW11bVxuICogICBpbnN0YWJpbGl0eSBvZiB0aGUgZXN0aW1hdGVkIHNlcnZlciB0aW1lIGlzIHRoZW4gbGltaXRlZCB0b1xuICogICBgb3B0aW9ucy5lc3RpbWF0aW9uU3RhYmlsaXR5YC5cbiAqIEBwYXJhbSB7TnVtYmVyfSBbb3B0aW9ucy5lc3RpbWF0aW9uU3RhYmlsaXR5PTE2MGUtNl0gVGhpcyBvcHRpb24gYXBwbGllc1xuICogICBvbmx5IHdoZW4gYG9wdGlvbnMuZXN0aW1hdGlvbk1vbm90b25pY2l0eWAgaXMgdHJ1ZS4gVGhlIGFkYXB0YXRpb24gdG8gdGhlXG4gKiAgIGVzdGltYXRlZCBzZXJ2ZXIgdGltZSBpcyB0aGVuIGxpbWl0ZWQgYnkgdGhpcyBwb3NpdGl2ZSB2YWx1ZS4gODBlLTYgKDgwXG4gKiAgIHBhcnRzIHBlciBtaWxsaW9uLCBQUE0pIGlzIHF1aXRlIHN0YWJsZSwgYW5kIGNvcnJlc3BvbmRzIHRvIHRoZSBzdGFiaWxpdHlcbiAqICAgb2YgYSBjb252ZW50aW9uYWwgY2xvY2suIDE2MGUtNiBpcyBtb2RlcmF0ZWx5IGFkYXB0aXZlLCBhbmQgY29ycmVzcG9uZHNcbiAqICAgdG8gdGhlIHJlbGF0aXZlIHN0YWJpbGl0eSBvZiAyIGNsb2NrczsgNTAwZS02IGlzIHF1aXRlIGFkYXB0aXZlLCBpdFxuICogICBjb21wZW5zYXRlcyA1IG1pbGxpc2Vjb25kcyBpbiAxIHNlY29uZC4gSXQgaXMgdGhlIG1heGltdW0gdmFsdWVcbiAqICAgKGVzdGltYXRpb25TdGFiaWxpdHkgbXVzdCBiZSBsb3dlciB0aGFuIDUwMGUtNikuXG4gKi9cblxuXG5jbGFzcyBTeW5jQ2xpZW50IHtcbiAgY29uc3RydWN0b3IoZ2V0VGltZUZ1bmN0aW9uLCBvcHRpb25zID0ge30pIHtcbiAgICAvKipcbiAgICAgKiBUaGUgbWluaW11bSBzdGFiaWxpdHkgc2VydmVzIHNldmVyYWwgcHVycG9zZXM6XG4gICAgICpcbiAgICAgKiAxLiBUaGUgZXN0aW1hdGlvbiBwcm9jZXNzIHdpbGwgcmVzdGFydCBpZiB0aGUgZXN0aW1hdGVkIHNlcnZlciB0aW1lXG4gICAgICogcmVhY2hlcyBvciBleGNlZWRzIHRoaXMgdmFsdWUuXG4gICAgICogMi4gVGhlIGFkYXB0YXRpb24gb2YgYSBuZXcgZXN0aW1hdGlvbiAoYWZ0ZXIgYSBwaW5nLXBvbmcgc2VyaWVzKSBpcyBhbHNvXG4gICAgICogbGltaXRlZCB0byB0aGlzIHZhbHVlLlxuICAgICAqIDMuIEdpdmVuIDEuIGFuZCAyLiwgdGhpcyBlbnN1cmVzIHRoYXQgdGhlIGVzdGltYXRpb24gaXMgc3RyaWN0bHlcbiAgICAgKiBtb25vdG9uaWMuXG4gICAgICogNC4gR2l2ZW4gMy4sIHRoZSBjb252ZXJzaW9uIGZyb20gc2VydmVyIHRpbWUgdG8gbG9jYWwgdGltZSBpcyB1bmlxdWUuXG4gICAgICpcbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqIEBjb25zdGFudCB7TnVtYmVyfVxuICAgICAqIEB2YWx1ZSA1MDBlLTYgaXMgNTAwIFBQTSwgbGlrZSBhbiBvbGQgbWVjaGFuaWNhbCBjbG9ja1xuICAgICAqIEBzdGF0aWNcbiAgICAgKi9cbiAgICBTeW5jQ2xpZW50Lm1pbmltdW1TdGFiaWxpdHkgPSA1MDBlLTY7XG4gICAgdGhpcy5lc3RpbWF0aW9uTW9ub3RvbmljaXR5ID0gdHlwZW9mIG9wdGlvbnMuZXN0aW1hdGlvbk1vbm90b25pY2l0eSAhPT0gJ3VuZGVmaW5lZCcgPyBvcHRpb25zLmVzdGltYXRpb25Nb25vdG9uaWNpdHkgOiB0cnVlO1xuICAgIHRoaXMuZXN0aW1hdGlvblN0YWJpbGl0eSA9IG9wdGlvbnMuZXN0aW1hdGlvblN0YWJpbGl0eSB8fCAxNjBlLTY7XG4gICAgdGhpcy5lc3RpbWF0aW9uU3RhYmlsaXR5ID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oU3luY0NsaWVudC5taW5pbXVtU3RhYmlsaXR5LCB0aGlzLmVzdGltYXRpb25TdGFiaWxpdHkpKTtcbiAgICB0aGlzLnBpbmdUaW1lb3V0RGVsYXkgPSBvcHRpb25zLnBpbmdUaW1lb3V0RGVsYXkgfHwge1xuICAgICAgbWluOiAxLFxuICAgICAgbWF4OiAzMFxuICAgIH07XG4gICAgb3JkZXJNaW5NYXgodGhpcy5waW5nVGltZW91dERlbGF5KTtcbiAgICB0aGlzLnBpbmdTZXJpZXNJdGVyYXRpb25zID0gb3B0aW9ucy5waW5nU2VyaWVzSXRlcmF0aW9ucyB8fCAxMDtcbiAgICB0aGlzLnBpbmdTZXJpZXNQZXJpb2QgPSB0eXBlb2Ygb3B0aW9ucy5waW5nU2VyaWVzUGVyaW9kICE9PSAndW5kZWZpbmVkJyA/IG9wdGlvbnMucGluZ1Nlcmllc1BlcmlvZCA6IDAuMjUwO1xuICAgIHRoaXMucGluZ1Nlcmllc0RlbGF5ID0gb3B0aW9ucy5waW5nU2VyaWVzRGVsYXkgfHwge1xuICAgICAgbWluOiAxMCxcbiAgICAgIG1heDogMjBcbiAgICB9O1xuICAgIG9yZGVyTWluTWF4KHRoaXMucGluZ1Nlcmllc0RlbGF5KTtcbiAgICB0aGlzLnBpbmdEZWxheSA9IDA7IC8vIGN1cnJlbnQgZGVsYXkgYmVmb3JlIG5leHQgcGluZ1xuXG4gICAgdGhpcy50aW1lb3V0SWQgPSAwOyAvLyB0byBjYW5jZWwgdGltZW91dCBvbiBwb25nXG5cbiAgICB0aGlzLnBpbmdJZCA9IDA7IC8vIGFic29sdXRlIElEIHRvIG1hY2ggcG9uZyBhZ2FpbnN0XG5cbiAgICB0aGlzLnBpbmdTZXJpZXNDb3VudCA9IDA7IC8vIGVsYXBzZWQgcGluZ3MgaW4gYSBzZXJpZXNcblxuICAgIHRoaXMuc2VyaWVzRGF0YSA9IFtdOyAvLyBjaXJjdWxhciBidWZmZXJcblxuICAgIHRoaXMuc2VyaWVzRGF0YU5leHRJbmRleCA9IDA7IC8vIG5leHQgaW5kZXggdG8gd3JpdGUgaW4gY2lyY3VsYXIgYnVmZmVyXG5cbiAgICB0aGlzLnNlcmllc0RhdGFMZW5ndGggPSB0aGlzLnBpbmdTZXJpZXNJdGVyYXRpb25zOyAvLyBzaXplIG9mIGNpcmN1bGFyIGJ1ZmZlclxuXG4gICAgdGhpcy5sb25nVGVybURhdGFUcmFpbmluZ0R1cmF0aW9uID0gb3B0aW9ucy5sb25nVGVybURhdGFUcmFpbmluZ0R1cmF0aW9uIHx8IDEyMDsgLy8gdXNlIGEgZml4ZWQtc2l6ZSBjaXJjdWxhciBidWZmZXIsIGV2ZW4gaWYgaXQgZG9lcyBub3QgbWF0Y2hcbiAgICAvLyBleGFjdGx5IHRoZSByZXF1aXJlZCBkdXJhdGlvblxuXG4gICAgdGhpcy5sb25nVGVybURhdGFEdXJhdGlvbiA9IG9wdGlvbnMubG9uZ1Rlcm1EYXRhRHVyYXRpb24gfHwgOTAwO1xuICAgIHRoaXMubG9uZ1Rlcm1EYXRhTGVuZ3RoID0gTWF0aC5tYXgoMiwgdGhpcy5sb25nVGVybURhdGFEdXJhdGlvbiAvICgwLjUgKiAodGhpcy5waW5nU2VyaWVzRGVsYXkubWluICsgdGhpcy5waW5nU2VyaWVzRGVsYXkubWF4KSkpO1xuICAgIHRoaXMubG9uZ1Rlcm1EYXRhID0gW107IC8vIGNpcmN1bGFyIGJ1ZmZlclxuXG4gICAgdGhpcy5sb25nVGVybURhdGFOZXh0SW5kZXggPSAwOyAvLyBuZXh0IGluZGV4IHRvIHdyaXRlIGluIGNpcmN1bGFyIGJ1ZmZlclxuXG4gICAgdGhpcy50aW1lT2Zmc2V0ID0gMDsgLy8gbWVhbiBvZiAoc2VydmVyVGltZSAtIGNsaWVudFRpbWUpIGluIHRoZSBsYXN0IHNlcmllc1xuXG4gICAgdGhpcy50cmF2ZWxEdXJhdGlvbiA9IDA7XG4gICAgdGhpcy50cmF2ZWxEdXJhdGlvbk1pbiA9IDA7XG4gICAgdGhpcy50cmF2ZWxEdXJhdGlvbk1heCA9IDA7IC8vIFQodCkgPSBUMCArIFIgKiAodCAtIHQwKVxuICAgIC8vIHQoVCkgPSB0MCArIChUIC0gVDApIC8gUlxuXG4gICAgdGhpcy5zZXJ2ZXJUaW1lUmVmZXJlbmNlID0gMDsgLy8gVDBcblxuICAgIHRoaXMuY2xpZW50VGltZVJlZmVyZW5jZSA9IDA7IC8vIHQwXG5cbiAgICB0aGlzLmZyZXF1ZW5jeVJhdGlvID0gMTsgLy8gUlxuICAgIC8vIEZvciB0aGUgZmlyc3QgZXN0aW1hdGlvbiwgUyA9IFQgYW5kIHMgPSB0XG5cbiAgICB0aGlzLl9zdGFiaWxpc2F0aW9uUmVzZXQoKTtcblxuICAgIHRoaXMucGluZ1RpbWVvdXREZWxheS5jdXJyZW50ID0gdGhpcy5waW5nVGltZW91dERlbGF5Lm1pbjtcbiAgICB0aGlzLmdldFRpbWVGdW5jdGlvbiA9IGdldFRpbWVGdW5jdGlvbjtcbiAgICB0aGlzLnN0YXR1cyA9ICduZXcnO1xuICAgIHRoaXMuc3RhdHVzQ2hhbmdlZFRpbWUgPSAwO1xuICAgIHRoaXMuY29ubmVjdGlvblN0YXR1cyA9ICdvZmZsaW5lJztcbiAgICB0aGlzLmNvbm5lY3Rpb25TdGF0dXNDaGFuZ2VkVGltZSA9IDA7XG4gIH1cbiAgLyoqXG4gICAqIFNldCBzdGF0dXMsIGFuZCBzZXQgdGhpcy5zdGF0dXNDaGFuZ2VkVGltZSwgdG8gbGF0ZXJcbiAgICogdXNlIHNlZSB7QGxpbmsgU3luY0NsaWVudH5nZXRTdGF0dXNEdXJhdGlvbn1cbiAgICogYW5kIHtAbGluayBTeW5jQ2xpZW50fnJlcG9ydFN0YXR1c30uXG4gICAqXG4gICAqIEBwcml2YXRlXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBzdGF0dXNcbiAgICogQHJldHVybnMge09iamVjdH0gdGhpc1xuICAgKi9cblxuXG4gIHNldFN0YXR1cyhzdGF0dXMpIHtcbiAgICBpZiAoc3RhdHVzICE9PSB0aGlzLnN0YXR1cykge1xuICAgICAgdGhpcy5zdGF0dXMgPSBzdGF0dXM7XG4gICAgICB0aGlzLnN0YXR1c0NoYW5nZWRUaW1lID0gdGhpcy5nZXRMb2NhbFRpbWUoKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcztcbiAgfVxuICAvKipcbiAgICogR2V0IHRpbWUgc2luY2UgbGFzdCBzdGF0dXMgY2hhbmdlLiBTZWUge0BsaW5rIFN5bmNDbGllbnR+c2V0U3RhdHVzfVxuICAgKlxuICAgKiBAcHJpdmF0ZVxuICAgKiBAcmV0dXJucyB7TnVtYmVyfSB0aW1lLCBpbiBzZWNvbmRzLCBzaW5jZSBsYXN0IHN0YXR1cyBjaGFuZ2UuXG4gICAqL1xuXG5cbiAgZ2V0U3RhdHVzRHVyYXRpb24oKSB7XG4gICAgcmV0dXJuIE1hdGgubWF4KDAsIHRoaXMuZ2V0TG9jYWxUaW1lKCkgLSB0aGlzLnN0YXR1c0NoYW5nZWRUaW1lKTtcbiAgfVxuICAvKipcbiAgICogU2V0IGNvbm5lY3Rpb25TdGF0dXMsIGFuZCBzZXQgdGhpcy5jb25uZWN0aW9uU3RhdHVzQ2hhbmdlZFRpbWUsIHRvIGxhdGVyXG4gICAqIHVzZSB7QGxpbmsgU3luY0NsaWVudH5nZXRDb25uZWN0aW9uU3RhdHVzRHVyYXRpb259IGFuZFxuICAgKiB7QGxpbmsgU3luY0NsaWVudH5yZXBvcnRTdGF0dXN9LlxuICAgKlxuICAgKiBAcHJpdmF0ZVxuICAgKiBAcGFyYW0ge1N0cmluZ30gY29ubmVjdGlvblN0YXR1c1xuICAgKiBAcmV0dXJucyB7T2JqZWN0fSB0aGlzXG4gICAqL1xuXG5cbiAgc2V0Q29ubmVjdGlvblN0YXR1cyhjb25uZWN0aW9uU3RhdHVzKSB7XG4gICAgaWYgKGNvbm5lY3Rpb25TdGF0dXMgIT09IHRoaXMuY29ubmVjdGlvblN0YXR1cykge1xuICAgICAgdGhpcy5jb25uZWN0aW9uU3RhdHVzID0gY29ubmVjdGlvblN0YXR1cztcbiAgICAgIHRoaXMuY29ubmVjdGlvblN0YXR1c0NoYW5nZWRUaW1lID0gdGhpcy5nZXRMb2NhbFRpbWUoKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcztcbiAgfVxuICAvKipcbiAgICogR2V0IHRpbWUgc2luY2UgbGFzdCBjb25uZWN0aW9uU3RhdHVzIGNoYW5nZS5cbiAgICogU2VlIHtAbGluayBTeW5jQ2xpZW50fnNldENvbm5lY3Rpb25TdGF0dXN9XG4gICAqXG4gICAqIEBwcml2YXRlXG4gICAqIEByZXR1cm5zIHtOdW1iZXJ9IHRpbWUsIGluIHNlY29uZHMsIHNpbmNlIGxhc3QgY29ubmVjdGlvblN0YXR1cyBjaGFuZ2UuXG4gICAqL1xuXG5cbiAgZ2V0Q29ubmVjdGlvblN0YXR1c0R1cmF0aW9uKCkge1xuICAgIHJldHVybiBNYXRoLm1heCgwLCB0aGlzLmdldExvY2FsVGltZSgpIC0gdGhpcy5jb25uZWN0aW9uU3RhdHVzQ2hhbmdlZFRpbWUpO1xuICB9XG4gIC8qKlxuICAgKiBSZXBvcnQgdGhlIHN0YXR1cyBvZiB0aGUgc3luY2hyb25pc2F0aW9uIHByb2Nlc3MsIGlmIHJlcG9ydEZ1bmN0aW9uIGlzXG4gICAqIGRlZmluZWQuIEl0IGlzIGNhbGxlZCBlYWNoIHRpbWUgdGhlIGVzdGltYXRpb24gb2YgdGhlIHN5bmNocm9uaXNlZCB0aW1lXG4gICAqIHVwZGF0ZXMuXG4gICAqXG4gICAqIEBwcml2YXRlXG4gICAqIEBwYXJhbSB7U3luY0NsaWVudH5yZXBvcnRGdW5jdGlvbn0gcmVwb3J0RnVuY3Rpb25cbiAgICovXG5cblxuICByZXBvcnRTdGF0dXMocmVwb3J0RnVuY3Rpb24pIHtcbiAgICBpZiAodHlwZW9mIHJlcG9ydEZ1bmN0aW9uICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgcmVwb3J0RnVuY3Rpb24oe1xuICAgICAgICBzdGF0dXM6IHRoaXMuc3RhdHVzLFxuICAgICAgICBzdGF0dXNEdXJhdGlvbjogdGhpcy5nZXRTdGF0dXNEdXJhdGlvbigpLFxuICAgICAgICB0aW1lT2Zmc2V0OiB0aGlzLnRpbWVPZmZzZXQsXG4gICAgICAgIGZyZXF1ZW5jeVJhdGlvOiB0aGlzLmZyZXF1ZW5jeVJhdGlvLFxuICAgICAgICBjb25uZWN0aW9uOiB0aGlzLmNvbm5lY3Rpb25TdGF0dXMsXG4gICAgICAgIGNvbm5lY3Rpb25EdXJhdGlvbjogdGhpcy5nZXRDb25uZWN0aW9uU3RhdHVzRHVyYXRpb24oKSxcbiAgICAgICAgY29ubmVjdGlvblRpbWVPdXQ6IHRoaXMucGluZ1RpbWVvdXREZWxheS5jdXJyZW50LFxuICAgICAgICB0cmF2ZWxEdXJhdGlvbjogdGhpcy50cmF2ZWxEdXJhdGlvbixcbiAgICAgICAgdHJhdmVsRHVyYXRpb25NaW46IHRoaXMudHJhdmVsRHVyYXRpb25NaW4sXG4gICAgICAgIHRyYXZlbER1cmF0aW9uTWF4OiB0aGlzLnRyYXZlbER1cmF0aW9uTWF4XG4gICAgICB9KTtcbiAgICB9XG4gIH1cbiAgLyoqXG4gICAqIFByb2Nlc3MgdG8gc2VuZCBwaW5nIG1lc3NhZ2VzLlxuICAgKlxuICAgKiBAcHJpdmF0ZVxuICAgKiBAcGFyYW0ge1N5bmNDbGllbnR+c2VuZEZ1bmN0aW9ufSBzZW5kRnVuY3Rpb25cbiAgICogQHBhcmFtIHtTeW5jQ2xpZW50fnJlcG9ydEZ1bmN0aW9ufSByZXBvcnRGdW5jdGlvblxuICAgKi9cblxuXG4gIF9fc3luY0xvb3Aoc2VuZEZ1bmN0aW9uLCByZXBvcnRGdW5jdGlvbikge1xuICAgIGNsZWFyVGltZW91dCh0aGlzLnRpbWVvdXRJZCk7XG4gICAgKyt0aGlzLnBpbmdJZDtcbiAgICBzZW5kRnVuY3Rpb24odGhpcy5waW5nSWQsIHRoaXMuZ2V0TG9jYWxUaW1lKCkpO1xuICAgIHRoaXMudGltZW91dElkID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAvLyBpbmNyZWFzZSB0aW1lb3V0IGR1cmF0aW9uIG9uIHRpbWVvdXQsIHRvIGF2b2lkIG92ZXJmbG93XG4gICAgICB0aGlzLnBpbmdUaW1lb3V0RGVsYXkuY3VycmVudCA9IE1hdGgubWluKHRoaXMucGluZ1RpbWVvdXREZWxheS5jdXJyZW50ICogMiwgdGhpcy5waW5nVGltZW91dERlbGF5Lm1heCk7IC8vIGxvZygnc3luYzpwaW5nIHRpbWVvdXQgPiAlcycsIHRoaXMucGluZ1RpbWVvdXREZWxheS5jdXJyZW50KTtcblxuICAgICAgdGhpcy5zZXRDb25uZWN0aW9uU3RhdHVzKCdvZmZsaW5lJyk7XG4gICAgICB0aGlzLnJlcG9ydFN0YXR1cyhyZXBvcnRGdW5jdGlvbik7IC8vIHJldHJ5ICh5ZXMsIGFsd2F5cyBpbmNyZW1lbnQgcGluZ0lkKVxuXG4gICAgICB0aGlzLl9fc3luY0xvb3Aoc2VuZEZ1bmN0aW9uLCByZXBvcnRGdW5jdGlvbik7XG4gICAgfSwgTWF0aC5jZWlsKDEwMDAgKiB0aGlzLnBpbmdUaW1lb3V0RGVsYXkuY3VycmVudCkpO1xuICB9XG4gIC8qKlxuICAgKiBTdGFydCBhIHN5bmNocm9uaXNhdGlvbiBwcm9jZXNzIGJ5IHJlZ2lzdGVyaW5nIHRoZSByZWNlaXZlXG4gICAqIGZ1bmN0aW9uIHBhc3NlZCBhcyBzZWNvbmQgcGFyYW1ldGVyLiBUaGVuLCBzZW5kIHJlZ3VsYXIgbWVzc2FnZXNcbiAgICogdG8gdGhlIHNlcnZlciwgdXNpbmcgdGhlIHNlbmQgZnVuY3Rpb24gcGFzc2VkIGFzIGZpcnN0IHBhcmFtZXRlci5cbiAgICpcbiAgICogQHBhcmFtIHtTeW5jQ2xpZW50fnNlbmRGdW5jdGlvbn0gc2VuZEZ1bmN0aW9uXG4gICAqIEBwYXJhbSB7U3luY0NsaWVudH5yZWNlaXZlRnVuY3Rpb259IHJlY2VpdmVGdW5jdGlvbiB0byByZWdpc3RlclxuICAgKiBAcGFyYW0ge1N5bmNDbGllbnR+cmVwb3J0RnVuY3Rpb259IHJlcG9ydEZ1bmN0aW9uIGlmIGRlZmluZWQsIGlzIGNhbGxlZCB0b1xuICAgKiAgIHJlcG9ydCB0aGUgc3RhdHVzLCBvbiBlYWNoIHN0YXR1cyBjaGFuZ2UsIGFuZCBlYWNoIHRpbWUgdGhlIGVzdGltYXRpb24gb2ZcbiAgICogICB0aGUgc3luY2hyb25pc2VkIHRpbWUgdXBkYXRlcy5cbiAgICovXG5cblxuICBzdGFydChzZW5kRnVuY3Rpb24sIHJlY2VpdmVGdW5jdGlvbiwgcmVwb3J0RnVuY3Rpb24pIHtcbiAgICB0aGlzLnNldFN0YXR1cygnc3RhcnR1cCcpO1xuICAgIHRoaXMuc2V0Q29ubmVjdGlvblN0YXR1cygnb2ZmbGluZScpO1xuICAgIHRoaXMuc2VyaWVzRGF0YSA9IFtdO1xuICAgIHRoaXMuc2VyaWVzRGF0YU5leHRJbmRleCA9IDA7XG4gICAgdGhpcy5sb25nVGVybURhdGEgPSBbXTtcbiAgICB0aGlzLmxvbmdUZXJtRGF0YU5leHRJbmRleCA9IDA7XG4gICAgcmVjZWl2ZUZ1bmN0aW9uKChwaW5nSWQsIGNsaWVudFBpbmdUaW1lLCBzZXJ2ZXJQaW5nVGltZSwgc2VydmVyUG9uZ1RpbWUpID0+IHtcbiAgICAgIC8vIGFjY2VwdCBvbmx5IHRoZSBwb25nIHRoYXQgY29ycmVzcG9uZHMgdG8gdGhlIGxhc3QgcGluZ1xuICAgICAgaWYgKHBpbmdJZCA9PT0gdGhpcy5waW5nSWQpIHtcbiAgICAgICAgKyt0aGlzLnBpbmdTZXJpZXNDb3VudDtcbiAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMudGltZW91dElkKTtcbiAgICAgICAgdGhpcy5zZXRDb25uZWN0aW9uU3RhdHVzKCdvbmxpbmUnKTsgLy8gcmVkdWNlIHRpbWVvdXQgZHVyYXRpb24gb24gcG9uZywgZm9yIGJldHRlciByZWFjdGl2aXR5XG5cbiAgICAgICAgdGhpcy5waW5nVGltZW91dERlbGF5LmN1cnJlbnQgPSBNYXRoLm1heCh0aGlzLnBpbmdUaW1lb3V0RGVsYXkuY3VycmVudCAqIDAuNzUsIHRoaXMucGluZ1RpbWVvdXREZWxheS5taW4pOyAvLyB0aW1lLWRpZmZlcmVuY2VzIGFyZSB2YWxpZCBvbiBhIHNpbmdsZS1zaWRlIG9ubHkgKGNsaWVudCBvciBzZXJ2ZXIpXG5cbiAgICAgICAgY29uc3QgY2xpZW50UG9uZ1RpbWUgPSB0aGlzLmdldExvY2FsVGltZSgpO1xuICAgICAgICBjb25zdCBjbGllbnRUaW1lID0gMC41ICogKGNsaWVudFBvbmdUaW1lICsgY2xpZW50UGluZ1RpbWUpO1xuICAgICAgICBjb25zdCBzZXJ2ZXJUaW1lID0gMC41ICogKHNlcnZlclBvbmdUaW1lICsgc2VydmVyUGluZ1RpbWUpO1xuICAgICAgICBjb25zdCB0cmF2ZWxEdXJhdGlvbiA9IE1hdGgubWF4KDAsIGNsaWVudFBvbmdUaW1lIC0gY2xpZW50UGluZ1RpbWUgLSAoc2VydmVyUG9uZ1RpbWUgLSBzZXJ2ZXJQaW5nVGltZSkpO1xuICAgICAgICBjb25zdCBvZmZzZXRUaW1lID0gc2VydmVyVGltZSAtIGNsaWVudFRpbWU7IC8vIG9yZGVyIGlzIGltcG9ydGFudCBmb3Igc29ydGluZywgbGF0ZXIuXG5cbiAgICAgICAgdGhpcy5zZXJpZXNEYXRhW3RoaXMuc2VyaWVzRGF0YU5leHRJbmRleF0gPSBbdHJhdmVsRHVyYXRpb24sIG9mZnNldFRpbWUsIGNsaWVudFRpbWUsIHNlcnZlclRpbWVdO1xuICAgICAgICB0aGlzLnNlcmllc0RhdGFOZXh0SW5kZXggPSArK3RoaXMuc2VyaWVzRGF0YU5leHRJbmRleCAlIHRoaXMuc2VyaWVzRGF0YUxlbmd0aDsgLy8gbG9nKCdwaW5nICVzLCB0cmF2ZWwgPSAlcywgb2Zmc2V0ID0gJXMsIGNsaWVudCA9ICVzLCBzZXJ2ZXIgPSAlcycsXG4gICAgICAgIC8vICAgICBwaW5nSWQsIHRyYXZlbER1cmF0aW9uLCBvZmZzZXRUaW1lLCBjbGllbnRUaW1lLCBzZXJ2ZXJUaW1lKTtcbiAgICAgICAgLy8gZW5kIG9mIGEgc2VyaWVzXG5cbiAgICAgICAgaWYgKHRoaXMucGluZ1Nlcmllc0NvdW50ID49IHRoaXMucGluZ1Nlcmllc0l0ZXJhdGlvbnMgJiYgdGhpcy5zZXJpZXNEYXRhLmxlbmd0aCA+PSB0aGlzLnNlcmllc0RhdGFMZW5ndGgpIHtcbiAgICAgICAgICAvLyBwbGFuIHRoZSBiZWdpbmluZyBvZiB0aGUgbmV4dCBzZXJpZXNcbiAgICAgICAgICB0aGlzLnBpbmdEZWxheSA9IHRoaXMucGluZ1Nlcmllc0RlbGF5Lm1pbiArIE1hdGgucmFuZG9tKCkgKiAodGhpcy5waW5nU2VyaWVzRGVsYXkubWF4IC0gdGhpcy5waW5nU2VyaWVzRGVsYXkubWluKTtcbiAgICAgICAgICB0aGlzLnBpbmdTZXJpZXNDb3VudCA9IDA7IC8vIHNvcnQgYnkgdHJhdmVsIHRpbWUgZmlyc3QsIHRoZW4gb2Zmc2V0IHRpbWUuXG5cbiAgICAgICAgICBjb25zdCBzb3J0ZWQgPSB0aGlzLnNlcmllc0RhdGEuc2xpY2UoMCkuc29ydChkYXRhQ29tcGFyZSk7XG4gICAgICAgICAgY29uc3Qgc2VyaWVzVHJhdmVsRHVyYXRpb24gPSBzb3J0ZWRbMF1bMF07IC8vIFdoZW4gdGhlIGNsb2NrIHRpY2sgaXMgbG9uZyBlbm91Z2gsXG4gICAgICAgICAgLy8gc29tZSB0cmF2ZWwgdGltZXMgKGRpbWVuc2lvbiAwKSBtaWdodCBiZSBpZGVudGljYWwuXG4gICAgICAgICAgLy8gVGhlbiwgdXNlIHRoZSBvZmZzZXQgbWVkaWFuIChkaW1lbnNpb24gMSBpcyB0aGUgc2Vjb25kIHNvcnQga2V5KVxuICAgICAgICAgIC8vIG9mIHNob3J0ZXN0IHRyYXZlbCBkdXJhdGlvblxuXG4gICAgICAgICAgbGV0IHF1aWNrID0gMDtcblxuICAgICAgICAgIHdoaWxlIChxdWljayA8IHNvcnRlZC5sZW5ndGggJiYgc29ydGVkW3F1aWNrXVswXSA8PSBzZXJpZXNUcmF2ZWxEdXJhdGlvbiAqIDEuMDEpIHtcbiAgICAgICAgICAgICsrcXVpY2s7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcXVpY2sgPSBNYXRoLm1heCgwLCBxdWljayAtIDEpO1xuICAgICAgICAgIGNvbnN0IG1lZGlhbiA9IE1hdGguZmxvb3IocXVpY2sgLyAyKTtcbiAgICAgICAgICBjb25zdCBzZXJpZXNDbGllbnRUaW1lID0gc29ydGVkW21lZGlhbl1bMl07XG4gICAgICAgICAgY29uc3Qgc2VyaWVzU2VydmVyVGltZSA9IHNvcnRlZFttZWRpYW5dWzNdO1xuICAgICAgICAgIGNvbnN0IHNlcmllc0NsaWVudFNxdWFyZWRUaW1lID0gc2VyaWVzQ2xpZW50VGltZSAqIHNlcmllc0NsaWVudFRpbWU7XG4gICAgICAgICAgY29uc3Qgc2VyaWVzQ2xpZW50U2VydmVyVGltZSA9IHNlcmllc0NsaWVudFRpbWUgKiBzZXJpZXNTZXJ2ZXJUaW1lO1xuICAgICAgICAgIHRoaXMubG9uZ1Rlcm1EYXRhW3RoaXMubG9uZ1Rlcm1EYXRhTmV4dEluZGV4XSA9IFtzZXJpZXNUcmF2ZWxEdXJhdGlvbiwgc2VyaWVzQ2xpZW50VGltZSwgc2VyaWVzU2VydmVyVGltZSwgc2VyaWVzQ2xpZW50U3F1YXJlZFRpbWUsIHNlcmllc0NsaWVudFNlcnZlclRpbWVdO1xuICAgICAgICAgIHRoaXMubG9uZ1Rlcm1EYXRhTmV4dEluZGV4ID0gKyt0aGlzLmxvbmdUZXJtRGF0YU5leHRJbmRleCAlIHRoaXMubG9uZ1Rlcm1EYXRhTGVuZ3RoOyAvLyBtZWFuIG9mIHRoZSB0aW1lIG9mZnNldCBvdmVyIDMgc2FtcGxlcyBhcm91bmQgbWVkaWFuXG4gICAgICAgICAgLy8gKGxpbWl0ZWQgdG8gc2hvcnRlc3QgdHJhdmVsIGR1cmF0aW9uKVxuXG4gICAgICAgICAgY29uc3QgYXJvdW5kTWVkaWFuID0gc29ydGVkLnNsaWNlKE1hdGgubWF4KDAsIG1lZGlhbiAtIDEpLCBNYXRoLm1pbihxdWljaywgbWVkaWFuICsgMSkgKyAxKTtcbiAgICAgICAgICB0aGlzLnRpbWVPZmZzZXQgPSBtZWFuKGFyb3VuZE1lZGlhbiwgMSk7XG4gICAgICAgICAgY29uc3QgdXBkYXRlQ2xpZW50VGltZSA9IHRoaXMuZ2V0TG9jYWxUaW1lKCk7XG4gICAgICAgICAgY29uc3QgdXBkYXRlU2VydmVyVGltZUJlZm9yZSA9IHRoaXMuZ2V0U3luY1RpbWUodXBkYXRlQ2xpZW50VGltZSk7XG5cbiAgICAgICAgICBpZiAodGhpcy5zdGF0dXMgPT09ICdzdGFydHVwJyB8fCB0aGlzLnN0YXR1cyA9PT0gJ3RyYWluaW5nJyAmJiB0aGlzLmdldFN0YXR1c0R1cmF0aW9uKCkgPCB0aGlzLmxvbmdUZXJtRGF0YVRyYWluaW5nRHVyYXRpb24pIHtcbiAgICAgICAgICAgIC8vIHNldCBvbmx5IHRoZSBwaGFzZSBvZmZzZXQsIG5vdCB0aGUgZnJlcXVlbmN5XG4gICAgICAgICAgICB0aGlzLnNlcnZlclRpbWVSZWZlcmVuY2UgPSB0aGlzLnRpbWVPZmZzZXQ7XG4gICAgICAgICAgICB0aGlzLmNsaWVudFRpbWVSZWZlcmVuY2UgPSAwO1xuICAgICAgICAgICAgdGhpcy5mcmVxdWVuY3lSYXRpbyA9IDE7XG5cbiAgICAgICAgICAgIGlmICh0aGlzLnN0YXR1cyAhPT0gJ3N0YXJ0dXAnKSB7XG4gICAgICAgICAgICAgIC8vIG5vIHN0YWJpbGlzYXRpb24gb24gc3RhcnR1cFxuICAgICAgICAgICAgICB0aGlzLl9zdGFiaWxpc2F0aW9uVXBkYXRlKHVwZGF0ZUNsaWVudFRpbWUsIHVwZGF0ZVNlcnZlclRpbWVCZWZvcmUpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLnNldFN0YXR1cygndHJhaW5pbmcnKTtcbiAgICAgICAgICAgIGxvZygnVCA9ICVzICsgJXMgKiAoJXMgLSAlcykgPSAlcycsIHRoaXMuc2VydmVyVGltZVJlZmVyZW5jZSwgdGhpcy5mcmVxdWVuY3lSYXRpbywgc2VyaWVzQ2xpZW50VGltZSwgdGhpcy5jbGllbnRUaW1lUmVmZXJlbmNlLCB0aGlzLmdldFN5bmNUaW1lKHNlcmllc0NsaWVudFRpbWUpKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAodGhpcy5zdGF0dXMgPT09ICd0cmFpbmluZycgJiYgdGhpcy5nZXRTdGF0dXNEdXJhdGlvbigpID49IHRoaXMubG9uZ1Rlcm1EYXRhVHJhaW5pbmdEdXJhdGlvbiB8fCB0aGlzLnN0YXR1cyA9PT0gJ3N5bmMnKSB7XG4gICAgICAgICAgICAvLyBsaW5lYXIgcmVncmVzc2lvbiwgUiA9IGNvdmFyaWFuY2UodCxUKSAvIHZhcmlhbmNlKHQpXG4gICAgICAgICAgICBjb25zdCByZWdDbGllbnRUaW1lID0gbWVhbih0aGlzLmxvbmdUZXJtRGF0YSwgMSk7XG4gICAgICAgICAgICBjb25zdCByZWdTZXJ2ZXJUaW1lID0gbWVhbih0aGlzLmxvbmdUZXJtRGF0YSwgMik7XG4gICAgICAgICAgICBjb25zdCByZWdDbGllbnRTcXVhcmVkVGltZSA9IG1lYW4odGhpcy5sb25nVGVybURhdGEsIDMpO1xuICAgICAgICAgICAgY29uc3QgcmVnQ2xpZW50U2VydmVyVGltZSA9IG1lYW4odGhpcy5sb25nVGVybURhdGEsIDQpO1xuICAgICAgICAgICAgY29uc3QgY292YXJpYW5jZSA9IHJlZ0NsaWVudFNlcnZlclRpbWUgLSByZWdDbGllbnRUaW1lICogcmVnU2VydmVyVGltZTtcbiAgICAgICAgICAgIGNvbnN0IHZhcmlhbmNlID0gcmVnQ2xpZW50U3F1YXJlZFRpbWUgLSByZWdDbGllbnRUaW1lICogcmVnQ2xpZW50VGltZTtcblxuICAgICAgICAgICAgaWYgKHZhcmlhbmNlID4gMCkge1xuICAgICAgICAgICAgICAvLyB1cGRhdGUgZnJlcSBhbmQgc2hpZnRcbiAgICAgICAgICAgICAgdGhpcy5mcmVxdWVuY3lSYXRpbyA9IGNvdmFyaWFuY2UgLyB2YXJpYW5jZTtcbiAgICAgICAgICAgICAgdGhpcy5jbGllbnRUaW1lUmVmZXJlbmNlID0gcmVnQ2xpZW50VGltZTtcbiAgICAgICAgICAgICAgdGhpcy5zZXJ2ZXJUaW1lUmVmZXJlbmNlID0gcmVnU2VydmVyVGltZTsgLy8gZXhjbHVkZSBib3VuZHMsIHRvIGVuc3VyZSBzdHJpY3QgbW9ub3RvbmljaXR5XG5cbiAgICAgICAgICAgICAgaWYgKHRoaXMuZnJlcXVlbmN5UmF0aW8gPiAxIC0gU3luY0NsaWVudC5taW5pbXVtU3RhYmlsaXR5ICYmIHRoaXMuZnJlcXVlbmN5UmF0aW8gPCAxICsgU3luY0NsaWVudC5taW5pbXVtU3RhYmlsaXR5KSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXRTdGF0dXMoJ3N5bmMnKTtcblxuICAgICAgICAgICAgICAgIHRoaXMuX3N0YWJpbGlzYXRpb25VcGRhdGUodXBkYXRlQ2xpZW50VGltZSwgdXBkYXRlU2VydmVyVGltZUJlZm9yZSk7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgbG9nKCdjbG9jayBmcmVxdWVuY3kgcmF0aW8gb3V0IG9mIHN5bmM6ICVzLCB0cmFpbmluZyBhZ2FpbicsIHRoaXMuZnJlcXVlbmN5UmF0aW8pOyAvLyBzdGFydCB0aGUgdHJhaW5pbmcgYWdhaW4gZnJvbSB0aGUgbGFzdCBzZXJpZXNcblxuICAgICAgICAgICAgICAgIHRoaXMuc2VydmVyVGltZVJlZmVyZW5jZSA9IHRoaXMudGltZU9mZnNldDsgLy8gb2Zmc2V0IG9ubHlcblxuICAgICAgICAgICAgICAgIHRoaXMuY2xpZW50VGltZVJlZmVyZW5jZSA9IDA7XG4gICAgICAgICAgICAgICAgdGhpcy5mcmVxdWVuY3lSYXRpbyA9IDE7XG5cbiAgICAgICAgICAgICAgICB0aGlzLl9zdGFiaWxpc2F0aW9uUmVzZXQoKTtcblxuICAgICAgICAgICAgICAgIHRoaXMuc2V0U3RhdHVzKCd0cmFpbmluZycpO1xuICAgICAgICAgICAgICAgIHRoaXMubG9uZ1Rlcm1EYXRhWzBdID0gW3Nlcmllc1RyYXZlbER1cmF0aW9uLCBzZXJpZXNDbGllbnRUaW1lLCBzZXJpZXNTZXJ2ZXJUaW1lLCBzZXJpZXNDbGllbnRTcXVhcmVkVGltZSwgc2VyaWVzQ2xpZW50U2VydmVyVGltZV07XG4gICAgICAgICAgICAgICAgdGhpcy5sb25nVGVybURhdGEubGVuZ3RoID0gMTtcbiAgICAgICAgICAgICAgICB0aGlzLmxvbmdUZXJtRGF0YU5leHRJbmRleCA9IDE7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgbG9nKCdUID0gJXMgKyAlcyAqICglcyAtICVzKSA9ICVzJywgdGhpcy5zZXJ2ZXJUaW1lUmVmZXJlbmNlLCB0aGlzLmZyZXF1ZW5jeVJhdGlvLCBzZXJpZXNDbGllbnRUaW1lLCB0aGlzLmNsaWVudFRpbWVSZWZlcmVuY2UsIHRoaXMuZ2V0U3luY1RpbWUoc2VyaWVzQ2xpZW50VGltZSkpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHRoaXMudHJhdmVsRHVyYXRpb24gPSBtZWFuKHNvcnRlZCwgMCk7XG4gICAgICAgICAgdGhpcy50cmF2ZWxEdXJhdGlvbk1pbiA9IHNvcnRlZFswXVswXTtcbiAgICAgICAgICB0aGlzLnRyYXZlbER1cmF0aW9uTWF4ID0gc29ydGVkW3NvcnRlZC5sZW5ndGggLSAxXVswXTtcbiAgICAgICAgICB0aGlzLnJlcG9ydFN0YXR1cyhyZXBvcnRGdW5jdGlvbik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gd2UgYXJlIGluIGEgc2VyaWVzLCB1c2UgdGhlIHBpbmdJbnRlcnZhbCB2YWx1ZVxuICAgICAgICAgIHRoaXMucGluZ0RlbGF5ID0gdGhpcy5waW5nU2VyaWVzUGVyaW9kO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy50aW1lb3V0SWQgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICB0aGlzLl9zeW5jTG9vcChzZW5kRnVuY3Rpb24sIHJlcG9ydEZ1bmN0aW9uKTtcbiAgICAgICAgfSwgTWF0aC5jZWlsKDEwMDAgKiB0aGlzLnBpbmdEZWxheSkpO1xuICAgICAgfSAvLyBwaW5nIGFuZCBwb25nIElEIG1hdGNoXG5cbiAgICB9KTsgLy8gcmVjZWl2ZSBmdW5jdGlvblxuXG4gICAgdGhpcy5fc3luY0xvb3Aoc2VuZEZ1bmN0aW9uLCByZXBvcnRGdW5jdGlvbik7XG4gIH1cbiAgLyoqXG4gICAqIEdldCBsb2NhbCB0aW1lLCBvciBjb252ZXJ0IGEgc3luY2hyb25pc2VkIHRpbWUgdG8gYSBsb2NhbCB0aW1lLlxuICAgKlxuICAgKiBAcGFyYW0ge051bWJlcn0gW3N5bmNUaW1lPXVuZGVmaW5lZF0gLSBHZXQgbG9jYWwgdGltZSBhY2NvcmRpbmcgdG8gZ2l2ZW5cbiAgICogIGdpdmVuIGBzeW5jVGltZWAsIGlmIGBzeW5jVGltZWAgaXMgbm90IGRlZmluZWQgcmV0dXJucyBjdXJyZW50IGxvY2FsIHRpbWUuXG4gICAqIEByZXR1cm5zIHtOdW1iZXJ9IGxvY2FsIHRpbWUsIGluIHNlY29uZHNcbiAgICovXG5cblxuICBnZXRMb2NhbFRpbWUoc3luY1RpbWUpIHtcbiAgICBpZiAodHlwZW9mIHN5bmNUaW1lID09PSAndW5kZWZpbmVkJykge1xuICAgICAgLy8gcmVhZCB0IGZyb20gbG9jYWwgY2xvY2tcbiAgICAgIHJldHVybiB0aGlzLmdldFRpbWVGdW5jdGlvbigpO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBTLCBzdGFiaWxpc2VkIHN5bmMgdGltZVxuICAgICAgbGV0IFQgPSBzeW5jVGltZTtcblxuICAgICAgaWYgKHRoaXMuZXN0aW1hdGlvbk1vbm90b25pY2l0eSAmJiBUIDwgdGhpcy5zdGFiaWxpc2F0aW9uU2VydmVyVGltZUVuZCkge1xuICAgICAgICAvLyByZW1vdmUgc3RhYmlsaXNhdGlvbiBiZWZvcmUgY29udmVyc2lvblxuICAgICAgICAvLyBTIC0+IFRcbiAgICAgICAgY29uc3QgU3NzID0gTWF0aC5tYXgodGhpcy5zdGFiaWxpc2F0aW9uU2VydmVyVGltZVN0YXJ0LCBUKTtcbiAgICAgICAgY29uc3Qgc3RhYmlsaXNhdGlvbiA9IHRoaXMuc3RhYmlsaXNhdGlvbk9mZnNldCAqICh0aGlzLnN0YWJpbGlzYXRpb25TZXJ2ZXJUaW1lRW5kIC0gU3NzKSAvICh0aGlzLnN0YWJpbGlzYXRpb25TZXJ2ZXJUaW1lRW5kIC0gdGhpcy5zdGFiaWxpc2F0aW9uU2VydmVyVGltZVN0YXJ0KTtcbiAgICAgICAgVCAtPSBzdGFiaWxpc2F0aW9uO1xuICAgICAgfSAvLyBjb252ZXJzaW9uOiB0KFQpID0gdDAgKyAoVCAtIFQwKSAvIFJcbiAgICAgIC8vIFQgLT4gdFxuXG5cbiAgICAgIHJldHVybiB0aGlzLmNsaWVudFRpbWVSZWZlcmVuY2UgKyAoVCAtIHRoaXMuc2VydmVyVGltZVJlZmVyZW5jZSkgLyB0aGlzLmZyZXF1ZW5jeVJhdGlvO1xuICAgIH1cbiAgfVxuICAvKipcbiAgICogR2V0IHN5bmNocm9uaXNlZCB0aW1lLCBvciBjb252ZXJ0IGEgbG9jYWwgdGltZSB0byBhIHN5bmNocm9uaXNlZCB0aW1lLlxuICAgKlxuICAgKiBAcGFyYW0ge051bWJlcn0gW2xvY2FsVGltZT11bmRlZmluZWRdIC0gR2V0IHN5bmMgdGltZSBhY2NvcmRpbmcgdG8gZ2l2ZW5cbiAgICogIGdpdmVuIGBsb2NhbFRpbWVgLCBpZiBgbG9jYWxUaW1lYCBpcyBub3QgZGVmaW5lZCByZXR1cm5zIGN1cnJlbnQgc3luYyB0aW1lLlxuICAgKiBAcmV0dXJucyB7TnVtYmVyfSBzeW5jaHJvbmlzZWQgdGltZSwgaW4gc2Vjb25kcy5cbiAgICovXG5cblxuICBnZXRTeW5jVGltZShsb2NhbFRpbWUgPSB0aGlzLmdldExvY2FsVGltZSgpKSB7XG4gICAgLy8gYWx3YXlzIGNvbnZlcnQ6IFQodCkgPSBUMCArIFIgKiAodCAtIHQwKVxuICAgIC8vIHQgLT4gVFxuICAgIGxldCBUID0gdGhpcy5zZXJ2ZXJUaW1lUmVmZXJlbmNlICsgdGhpcy5mcmVxdWVuY3lSYXRpbyAqIChsb2NhbFRpbWUgLSB0aGlzLmNsaWVudFRpbWVSZWZlcmVuY2UpO1xuXG4gICAgaWYgKHRoaXMuZXN0aW1hdGlvbk1vbm90b25pY2l0eSAmJiBsb2NhbFRpbWUgPCB0aGlzLnN0YWJpbGlzYXRpb25DbGllbnRUaW1lRW5kKSB7XG4gICAgICBjb25zdCB0ID0gTWF0aC5tYXgodGhpcy5zdGFiaWxpc2F0aW9uQ2xpZW50VGltZVN0YXJ0LCBsb2NhbFRpbWUpOyAvLyBhZGQgc3RhYmlsaXNhdGlvbiBhZnRlciBjb252ZXJzaW9uXG4gICAgICAvLyBUIC0+IFNcblxuICAgICAgY29uc3Qgc3RhYmlsaXNhdGlvbiA9IHRoaXMuc3RhYmlsaXNhdGlvbk9mZnNldCAqICh0aGlzLnN0YWJpbGlzYXRpb25DbGllbnRUaW1lRW5kIC0gdCkgLyAodGhpcy5zdGFiaWxpc2F0aW9uQ2xpZW50VGltZUVuZCAtIHRoaXMuc3RhYmlsaXNhdGlvbkNsaWVudFRpbWVTdGFydCk7XG4gICAgICBUICs9IHN0YWJpbGlzYXRpb247XG4gICAgfVxuXG4gICAgcmV0dXJuIFQ7XG4gIH1cbiAgLyoqXG4gICAqIFByb2Nlc3MgdG8gc2VuZCBwaW5nIG1lc3NhZ2VzLlxuICAgKlxuICAgKiBAcHJpdmF0ZVxuICAgKiBAcGFyYW0ge1N5bmNDbGllbnR+c2VuZEZ1bmN0aW9ufSBzZW5kRnVuY3Rpb25cbiAgICogQHBhcmFtIHtTeW5jQ2xpZW50fnJlcG9ydEZ1bmN0aW9ufSByZXBvcnRGdW5jdGlvblxuICAgKi9cblxuXG4gIF9zeW5jTG9vcChzZW5kRnVuY3Rpb24sIHJlcG9ydEZ1bmN0aW9uKSB7XG4gICAgY2xlYXJUaW1lb3V0KHRoaXMudGltZW91dElkKTtcbiAgICArK3RoaXMucGluZ0lkO1xuICAgIHNlbmRGdW5jdGlvbih0aGlzLnBpbmdJZCwgdGhpcy5nZXRMb2NhbFRpbWUoKSk7XG4gICAgdGhpcy50aW1lb3V0SWQgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIC8vIGluY3JlYXNlIHRpbWVvdXQgZHVyYXRpb24gb24gdGltZW91dCwgdG8gYXZvaWQgb3ZlcmZsb3dcbiAgICAgIHRoaXMucGluZ1RpbWVvdXREZWxheS5jdXJyZW50ID0gTWF0aC5taW4odGhpcy5waW5nVGltZW91dERlbGF5LmN1cnJlbnQgKiAyLCB0aGlzLnBpbmdUaW1lb3V0RGVsYXkubWF4KTtcbiAgICAgIGxvZygnc3luYzpwaW5nIHRpbWVvdXQgPiAlcycsIHRoaXMucGluZ1RpbWVvdXREZWxheS5jdXJyZW50KTtcbiAgICAgIHRoaXMuc2V0Q29ubmVjdGlvblN0YXR1cygnb2ZmbGluZScpO1xuICAgICAgdGhpcy5yZXBvcnRTdGF0dXMocmVwb3J0RnVuY3Rpb24pOyAvLyByZXRyeSAoeWVzLCBhbHdheXMgaW5jcmVtZW50IHBpbmdJZClcblxuICAgICAgdGhpcy5fc3luY0xvb3Aoc2VuZEZ1bmN0aW9uLCByZXBvcnRGdW5jdGlvbik7XG4gICAgfSwgTWF0aC5jZWlsKDEwMDAgKiB0aGlzLnBpbmdUaW1lb3V0RGVsYXkuY3VycmVudCkpO1xuICB9XG4gIC8qKlxuICAgKiBAcHJpdmF0ZVxuICAgKi9cblxuXG4gIF9zdGFiaWxpc2F0aW9uUmVzZXQoKSB7XG4gICAgLy8gVG8gc3RhYmlsaXNlIHRoZSBlc3RpbWF0aW9uIG9mIHN5bmNocm9uaXNlZCB0aW1lLCBjb21wZW5zYXRlIHRoZVxuICAgIC8vIGRpZmZlcmVuY2Ugb2YgdGhlIGxhc3QgZXN0aW1hdGlvbiBvZiB0aGUgc2VydmVyIHRpbWUgdG8gdGhlIGN1cnJlbnRcbiAgICAvLyBvbmUuIFRoZSBjb21wZW5zYXRpb24gaXMgZnVsbCBhdCB0aGUgc3RhcnQgdGltZSAoYW5kIGJlZm9yZSksIGFuZCAwIGF0XG4gICAgLy8gdGhlIGVuZCB0aW1lIChhbmQgYWZ0ZXIpLlxuICAgIHRoaXMuc3RhYmlsaXNhdGlvbk9mZnNldCA9IDA7IC8vIFNvLCBmdWxsIGNvbXBlbnNhdGlvblxuICAgIC8vIFModCkgPSBUKHQpICsgU28gKiAodHNlIC0gdCkgLyAodHNlIC0gdHNzKSAsIHdpdGggdCBpbiBddHNzLCB0c2VbXG4gICAgLy8gUyh0KSA9IFQodCkgKyBTbywgd2l0aCB0IDw9IHRzc1xuICAgIC8vIFModCkgPSBUKHQpLCB3aXRoIHQgPj0gdHNlXG5cbiAgICB0aGlzLnN0YWJpbGlzYXRpb25DbGllbnRUaW1lU3RhcnQgPSAtSW5maW5pdHk7IC8vIHRzc1xuXG4gICAgdGhpcy5zdGFiaWxpc2F0aW9uQ2xpZW50VGltZUVuZCA9IC1JbmZpbml0eTsgLy8gdHNlXG4gICAgLy8gdChUKSA9IHQoUyAtIFNvICogKFNzZSAtIFMpIC8gKFNzZSAtIFNzcykpLCB3aXRoIFMgaW4gXVNzcywgU3NlW1xuICAgIC8vIHQoVCkgPSB0KFMgLSBTbyksIHdpdGggUyA8PSBTc3NcbiAgICAvLyB0KFQpID0gdChTKVxuICAgIC8vIHN0YWJpbGlzZWQgdGltZXMsIG5vdCBkaXJlY3Qgc2VydmVyIHRpbWVzXG5cbiAgICB0aGlzLnN0YWJpbGlzYXRpb25TZXJ2ZXJUaW1lU3RhcnQgPSAtSW5maW5pdHk7IC8vIFNzc1xuXG4gICAgdGhpcy5zdGFiaWxpc2F0aW9uU2VydmVyVGltZUVuZCA9IC1JbmZpbml0eTsgLy8gU3NlXG4gIH1cbiAgLyoqXG4gICAqIFRoaXMgZnVuY3Rpb24gbXVzdCBiZSBjYWxsZWQgYWZ0ZXIgc3luY2hyb25pc2F0aW9uIHBhcmFtZXRlcnMgdXBkYXRlZCwgdG9cbiAgICogdXBkYXRlIHN0YWJpbGlzYXRpb24gcGFyYW1ldGVycy5cbiAgICpcbiAgICogQHByaXZhdGVcbiAgICogQHBhcmFtIHtOdW1iZXJ9IHVwZGF0ZUNsaWVudFRpbWUgbG9jYWwgdGltZSB3aGVuIHN5bmNocm9uaXNhdGlvbiB1cGRhdGVkXG4gICAqIEBwYXJhbSB7TnVtYmVyfSB1cGRhdGVTZXJ2ZXJUaW1lQmVmb3JlIGVzdGltYXRlZCBzZXJ2ZXIgdGltZSBqdXN0IGJlZm9yZVxuICAgKiAgIHN5bmNocm9uaXNhdGlvbiB1cGRhdGUgKHdpdGggb2xkIHBhcmFtZXRlcnMpXG4gICAqL1xuXG5cbiAgX3N0YWJpbGlzYXRpb25VcGRhdGUodXBkYXRlQ2xpZW50VGltZSwgdXBkYXRlU2VydmVyVGltZUJlZm9yZSkge1xuICAgIGlmICghdGhpcy5lc3RpbWF0aW9uTW9ub3RvbmljaXR5IHx8IHRoaXMuc3RhdHVzID09PSAnc3RhcnR1cCcpIHtcbiAgICAgIC8vIG5vIHN0YWJpbGlzYXRpb24gb24gc3RhcnR1cFxuICAgICAgcmV0dXJuO1xuICAgIH0gLy8gZXN0aW1hdGVkIHNlcnZlciB0aW1lIGp1c3QgYWZ0ZXIgc3luY2hyb25pc2F0aW9uIHVwZGF0ZVxuICAgIC8vIHdpdGggbmV3IHBhcmFtZXRlcnMgYW5kIHdpdGhvdXQgc3RhYmlsaXNhdGlvbiAoeWV0KVxuXG5cbiAgICB0aGlzLl9zdGFiaWxpc2F0aW9uUmVzZXQoKTtcblxuICAgIGNvbnN0IHVwZGF0ZVNlcnZlclRpbWVBZnRlciA9IHRoaXMuZ2V0U3luY1RpbWUodXBkYXRlQ2xpZW50VGltZSk7IC8vIFNvIGlzIGEgY29tcGVuc2F0aW9uIGFkZGVkIHRvIHN5bmNUaW1lXG5cbiAgICB0aGlzLnN0YWJpbGlzYXRpb25PZmZzZXQgPSB1cGRhdGVTZXJ2ZXJUaW1lQmVmb3JlIC0gdXBkYXRlU2VydmVyVGltZUFmdGVyOyAvLyB0c3NcblxuICAgIHRoaXMuc3RhYmlsaXNhdGlvbkNsaWVudFRpbWVTdGFydCA9IHVwZGF0ZUNsaWVudFRpbWU7IC8vIHRzZVxuXG4gICAgdGhpcy5zdGFiaWxpc2F0aW9uQ2xpZW50VGltZUVuZCA9IE1hdGguYWJzKHVwZGF0ZVNlcnZlclRpbWVCZWZvcmUgLSB1cGRhdGVTZXJ2ZXJUaW1lQWZ0ZXIpIC8gdGhpcy5lc3RpbWF0aW9uU3RhYmlsaXR5ICsgdGhpcy5zdGFiaWxpc2F0aW9uQ2xpZW50VGltZVN0YXJ0OyAvLyBGdWxsIGNvbXBlbnNhdGlvbiBhdCBTc3MsIHRvIG1hdGNoIG5ldyBzZXJ2ZXIgdGltZSB3aXQgbmV3IG9uZVxuICAgIC8vIFNzcyA9IFRzcyArIFNvXG5cbiAgICB0aGlzLnN0YWJpbGlzYXRpb25TZXJ2ZXJUaW1lU3RhcnQgPSB1cGRhdGVTZXJ2ZXJUaW1lQmVmb3JlOyAvLyBTc2VcbiAgICAvLyBObyBjb21wZW5zYXRpb24gZm9yIFMgPj0gU3NlXG4gICAgLy8gQXMgZ2V0U3luY1RpbWUgZG9lcyBfbm90XyB1c2Ugc3RhYmlsaXNhdGlvbiBzZXJ2ZXIgdGltZXMsXG4gICAgLy8gdGhlIG5leHQgY2FsbCBpcyBwb3NzaWJsZSB0byBib290c3RyYXAgZ2V0TG9jYWxUaW1lXG5cbiAgICB0aGlzLnN0YWJpbGlzYXRpb25TZXJ2ZXJUaW1lRW5kID0gdGhpcy5nZXRTeW5jVGltZSh0aGlzLnN0YWJpbGlzYXRpb25DbGllbnRUaW1lRW5kKTtcbiAgICBsb2coJ3N0YWJpbGlzYXRpb24gdXBkYXRlZCcsICdTbyA9ICcsIHRoaXMuc3RhYmlsaXNhdGlvbk9mZnNldCwgJywnLCAndHNzID0gJywgdGhpcy5zdGFiaWxpc2F0aW9uQ2xpZW50VGltZVN0YXJ0LCAnLCcsICd0c2UgPSAnLCB0aGlzLnN0YWJpbGlzYXRpb25DbGllbnRUaW1lRW5kLCAnLCcsICdTc3MgPSAnLCB0aGlzLnN0YWJpbGlzYXRpb25TZXJ2ZXJUaW1lU3RhcnQsICcsJywgJ1NzZSA9ICcsIHRoaXMuc3RhYmlsaXNhdGlvblNlcnZlclRpbWVFbmQsICcsJywgJ1RiZWZvcmUgPSAnLCB1cGRhdGVTZXJ2ZXJUaW1lQmVmb3JlLCAnLCcsICdUYWZ0ZXIgPSAnLCB1cGRhdGVTZXJ2ZXJUaW1lQWZ0ZXIpO1xuICB9XG5cbn1cblxudmFyIF9kZWZhdWx0ID0gU3luY0NsaWVudDtcbmV4cG9ydHMuZGVmYXVsdCA9IF9kZWZhdWx0OyIsIlwidXNlIHN0cmljdFwiO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHtcbiAgdmFsdWU6IHRydWVcbn0pO1xuZXhwb3J0cy5TeW5jU2VydmVyID0gZXhwb3J0cy5TeW5jQ2xpZW50ID0gZXhwb3J0cy5kZWZhdWx0ID0gdm9pZCAwO1xuXG52YXIgX2luZGV4ID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChyZXF1aXJlKFwiLi9jbGllbnQvaW5kZXguanNcIikpO1xuXG52YXIgX2luZGV4MiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQocmVxdWlyZShcIi4vc2VydmVyL2luZGV4LmpzXCIpKTtcblxuZnVuY3Rpb24gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChvYmopIHsgcmV0dXJuIG9iaiAmJiBvYmouX19lc01vZHVsZSA/IG9iaiA6IHsgZGVmYXVsdDogb2JqIH07IH1cblxuLy8gc3VwcG9ydCBleHBsaWNpdCBkZWZhdWx0IGFuZCBuYW1lZCBpbXBvcnRcbi8vIGNmLiBodHRwczovL2lyY2FtLWlzbW0uZ2l0aHViLmlvL2phdmFzY3JpcHQvamF2YXNjcmlwdC1ndWlkZWxpbmVzLmh0bWwjc3VwcG9ydGVkLXN5bnRheGVzXG4vLyBAbm90ZTpcbi8vIHRoZSBvZGQgZmlsZSBzdHJ1Y3R1cmUgYWltcyBhdCBzdXBwb3J0aW5nIGltcG9ydHMgaW4gb2xkIGFwcGxpY2F0aW9ucyA6XG4vLyBgYGBcbi8vIGltcG9ydCBTeW5jU2VydmVyIGZyb20gJ0BpcmNhbS9zeW5jL3NlcnZlcic7XG4vLyBgYGBcbi8vIGFuZCB0aGUgbW9zdCByZWNlbnQgb25lXG4vLyBgYGBcbi8vIGltcG9ydCB7IFN5bmNTZXJ2ZXIgfSBmcm9tICdAaXJjYW0vc3luY1xuLy8gYGBgXG4vL1xuLy8gY29uc2lkZXIgbWFraW5nIHRoaXMgbW9yZSBzaW1wbGUgYW5kIHJlbGVhc2UgYSBtYWpvciB2ZXJzaW9uXG4vL1xudmFyIF9kZWZhdWx0ID0ge1xuICBTeW5jQ2xpZW50OiBfaW5kZXguZGVmYXVsdCxcbiAgU3luY1NlcnZlcjogX2luZGV4Mi5kZWZhdWx0XG59O1xuZXhwb3J0cy5kZWZhdWx0ID0gX2RlZmF1bHQ7XG5jb25zdCBTeW5jQ2xpZW50ID0gX2luZGV4LmRlZmF1bHQ7XG5leHBvcnRzLlN5bmNDbGllbnQgPSBTeW5jQ2xpZW50O1xuY29uc3QgU3luY1NlcnZlciA9IF9pbmRleDIuZGVmYXVsdDtcbmV4cG9ydHMuU3luY1NlcnZlciA9IFN5bmNTZXJ2ZXI7IiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwge1xuICB2YWx1ZTogdHJ1ZVxufSk7XG5leHBvcnRzLmRlZmF1bHQgPSB2b2lkIDA7XG5cbnZhciBfZGVidWcgPSBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KHJlcXVpcmUoXCJkZWJ1Z1wiKSk7XG5cbmZ1bmN0aW9uIF9pbnRlcm9wUmVxdWlyZURlZmF1bHQob2JqKSB7IHJldHVybiBvYmogJiYgb2JqLl9fZXNNb2R1bGUgPyBvYmogOiB7IGRlZmF1bHQ6IG9iaiB9OyB9XG5cbmNvbnN0IGxvZyA9ICgwLCBfZGVidWcuZGVmYXVsdCkoJ3N5bmMnKTtcbi8qKlxuICogQGNhbGxiYWNrIFN5bmNTZXJ2ZXJ+Z2V0VGltZUZ1bmN0aW9uXG4gKiBAcmV0dXJuIHtOdW1iZXJ9IG1vbm90b25pYywgZXZlciBpbmNyZWFzaW5nLCB0aW1lIGluIHNlY29uZC4gV2hlbiBwb3NzaWJsZVxuICogIHRoZSBzZXJ2ZXIgY29kZSBzaG91bGQgZGVmaW5lIGl0cyBvd24gb3JpZ2luIChpLmUuIGB0aW1lPTBgKSBpbiBvcmRlciB0b1xuICogIG1heGltaXplIHRoZSByZXNvbHV0aW9uIG9mIHRoZSBjbG9jayBmb3IgYSBsb25nIHBlcmlvZCBvZiB0aW1lLiBXaGVuXG4gKiAgYFN5bmNTZXJ2ZXJ+c3RhcnRgIGlzIGNhbGxlZCB0aGUgY2xvY2sgc2hvdWxkIGJlIHJ1bm5pbmdcbiAqICAoY2YuIGBhdWRpb0NvbnRleHQuY3VycmVudFRpbWVgIHRoYXQgbmVlZHMgdXNlciBpbnRlcmFjdGlvbiB0byBzdGFydClcbiAqXG4gKiBAZXhhbXBsZVxuICogY29uc3Qgc3RhcnRUaW1lID0gcHJvY2Vzcy5ocnRpbWUoKTtcbiAqXG4gKiBjb25zdCBnZXRUaW1lRnVuY3Rpb24gPSAoKSA9PiB7XG4gKiAgIGNvbnN0IG5vdyA9IHByb2Nlc3MuaHJ0aW1lKHN0YXJ0VGltZSk7XG4gKiAgIHJldHVybiBub3dbMF0gKyBub3dbMV0gKiAxZS05O1xuICogfTtcbiAqKi9cblxuLyoqXG4gKiBAY2FsbGJhY2sgU3luY1NlcnZlcn5zZW5kRnVuY3Rpb25cbiAqIEBzZWUge0BsaW5rIFN5bmNDbGllbnR+cmVjZWl2ZUZ1bmN0aW9ufVxuICogQHBhcmFtIHtOdW1iZXJ9IHBpbmdJZCB1bmlxdWUgaWRlbnRpZmllclxuICogQHBhcmFtIHtOdW1iZXJ9IGNsaWVudFBpbmdUaW1lIHRpbWUtc3RhbXAgb2YgcGluZyBlbWlzc2lvblxuICogQHBhcmFtIHtOdW1iZXJ9IHNlcnZlclBpbmdUaW1lIHRpbWUtc3RhbXAgb2YgcGluZyByZWNlcHRpb25cbiAqIEBwYXJhbSB7TnVtYmVyfSBzZXJ2ZXJQb25nVGltZSB0aW1lLXN0YW1wIG9mIHBvbmcgZW1pc3Npb25cbiAqKi9cblxuLyoqXG4gKiBAY2FsbGJhY2sgU3luY1NlcnZlcn5yZWNlaXZlRnVuY3Rpb25cbiAqIEBzZWUge0BsaW5rIFN5bmNDbGllbnR+c2VuZEZ1bmN0aW9ufVxuICogQHBhcmFtIHtTeW5jU2VydmVyfnJlY2VpdmVDYWxsYmFja30gcmVjZWl2ZUNhbGxiYWNrIGNhbGxlZCBvblxuICogZWFjaCBtZXNzYWdlIG1hdGNoaW5nIG1lc3NhZ2VUeXBlLlxuICoqL1xuXG4vKipcbiAqIEBjYWxsYmFjayBTeW5jU2VydmVyfnJlY2VpdmVDYWxsYmFja1xuICogQHBhcmFtIHtOdW1iZXJ9IHBpbmdJZCB1bmlxdWUgaWRlbnRpZmllclxuICogQHBhcmFtIHtOdW1iZXJ9IGNsaWVudFBpbmdUaW1lIHRpbWUtc3RhbXAgb2YgcGluZyBlbWlzc2lvblxuICoqL1xuXG4vKipcbiAqIFRoZSBgU3luY1NlcnZlcmAgaW5zdGFuY2UgcHJvdmlkZXMgYSBjbG9jayBvbiB3aGljaCB7QGxpbmsgU3luY0NsaWVudH1cbiAqIGluc3RhbmNlcyBzeW5jaHJvbml6ZS5cbiAqXG4gKiBAc2VlIHtAbGluayBTeW5jU2VydmVyfnN0YXJ0fSBtZXRob2QgdG9cbiAqIGFjdHVhbGx5IHN0YXJ0IGEgc3luY2hyb25pc2F0aW9uIHByb2Nlc3MuXG4gKlxuICogQHBhcmFtIHtTeW5jU2VydmVyfmdldFRpbWVGdW5jdGlvbn0gZnVuY3Rpb24gY2FsbGVkIHRvIGdldCB0aGUgbG9jYWxcbiAqIHRpbWUuIEl0IG11c3QgcmV0dXJuIGEgdGltZSBpbiBzZWNvbmRzLCBtb25vdG9uaWMsIGV2ZXIgaW5jcmVhc2luZy5cbiAqL1xuXG5jbGFzcyBTeW5jU2VydmVyIHtcbiAgY29uc3RydWN0b3IoZ2V0VGltZUZ1bmN0aW9uKSB7XG4gICAgdGhpcy5nZXRUaW1lRnVuY3Rpb24gPSBnZXRUaW1lRnVuY3Rpb247XG4gIH1cbiAgLyoqXG4gICAqIFN0YXJ0IGEgc3luY2hyb25pc2F0aW9uIHByb2Nlc3Mgd2l0aCBhIGBTeW5jQ2xpZW50YCBieSByZWdpc3RlcmluZyB0aGVcbiAgICogcmVjZWl2ZSBmdW5jdGlvbiBwYXNzZWQgYXMgc2Vjb25kIHBhcmFtZXRlci4gT24gZWFjaCByZWNlaXZlZCBtZXNzYWdlLFxuICAgKiBzZW5kIGEgcmVwbHkgdXNpbmcgdGhlIGZ1bmN0aW9uIHBhc3NlZCBhcyBmaXJzdCBwYXJhbWV0ZXIuXG4gICAqXG4gICAqIEBwYXJhbSB7U3luY1NlcnZlcn5zZW5kRnVuY3Rpb259IHNlbmRGdW5jdGlvblxuICAgKiBAcGFyYW0ge1N5bmNTZXJ2ZXJ+cmVjZWl2ZUZ1bmN0aW9ufSByZWNlaXZlRnVuY3Rpb25cbiAgICovXG5cblxuICBzdGFydChzZW5kRnVuY3Rpb24sIHJlY2VpdmVGdW5jdGlvbikge1xuICAgIHJlY2VpdmVGdW5jdGlvbigoaWQsIGNsaWVudFBpbmdUaW1lKSA9PiB7XG4gICAgICBjb25zdCBzZXJ2ZXJQaW5nVGltZSA9IHRoaXMuZ2V0TG9jYWxUaW1lKCk7IC8vIHdpdGggdGhpcyBhbGdvcml0aG0sIHRoZSBkdWFsIGNhbGwgdG8gYGdldExvY2FsVGltZWAgY2FuIGFwcGVhclxuICAgICAgLy8gbm9uLW5lY2Vzc2FyeSwgaG93ZXZlciBrZWVwaW5nIHRoaXMgY2FuIGFsbG93IHRvIGltcGxlbWVudCBvdGhlclxuICAgICAgLy8gYWxnb3JpdGhtcyB3aGlsZSBrZWVwaW5nIHRoZSBBUEkgdW5jaGFuZ2VkLCB0aHVzIG1ha2luZyBlYXNpZXJcbiAgICAgIC8vIHRvIGltcGxlbWVudCBhbmQgY29tcGFyZSBzZXZlcmFsIGFsZ29yaXRobXMuXG5cbiAgICAgIHNlbmRGdW5jdGlvbihpZCwgY2xpZW50UGluZ1RpbWUsIHNlcnZlclBpbmdUaW1lLCB0aGlzLmdldExvY2FsVGltZSgpKTsgLy8gbG9nKCdwaW5nOiAlcywgJXMsICVzJywgaWQsIGNsaWVudFBpbmdUaW1lLCBzZXJ2ZXJQaW5nVGltZSk7XG4gICAgfSk7IC8vIHJldHVybiBzb21lIGhhbmRsZSB0aGF0IHdvdWxkIGFsbG93IHRvIGNsZWFuIG1lbW9yeSA/XG4gIH1cbiAgLyoqXG4gICAqIEdldCBsb2NhbCB0aW1lLCBvciBjb252ZXJ0IGEgc3luY2hyb25pc2VkIHRpbWUgdG8gYSBsb2NhbCB0aW1lLlxuICAgKlxuICAgKiBAbm90ZSBgZ2V0TG9jYWxUaW1lYCBhbmQgYGdldFN5bmNUaW1lYCBhcmUgYmFzaWNhbGx5IGFsaWFzZXMgb24gdGhlIHNlcnZlci5cbiAgICpcbiAgICogQHBhcmFtIHtOdW1iZXJ9IFtzeW5jVGltZT11bmRlZmluZWRdIC0gR2V0IGxvY2FsIHRpbWUgYWNjb3JkaW5nIHRvIGdpdmVuXG4gICAqICBnaXZlbiBgc3luY1RpbWVgLCBpZiBgc3luY1RpbWVgIGlzIG5vdCBkZWZpbmVkIHJldHVybnMgY3VycmVudCBsb2NhbCB0aW1lLlxuICAgKiBAcmV0dXJucyB7TnVtYmVyfSBsb2NhbCB0aW1lLCBpbiBzZWNvbmRzXG4gICAqL1xuXG5cbiAgZ2V0TG9jYWxUaW1lKHN5bmNUaW1lKSB7XG4gICAgaWYgKHR5cGVvZiBzeW5jVGltZSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIHJldHVybiBzeW5jVGltZTsgLy8gc3luYyB0aW1lIGlzIGxvY2FsOiBubyBjb252ZXJzaW9uXG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiB0aGlzLmdldFRpbWVGdW5jdGlvbigpO1xuICAgIH1cbiAgfVxuICAvKipcbiAgICogR2V0IHN5bmNocm9uaXNlZCB0aW1lLCBvciBjb252ZXJ0IGEgbG9jYWwgdGltZSB0byBhIHN5bmNocm9uaXNlZCB0aW1lLlxuICAgKlxuICAgKiBAbm90ZSBgZ2V0TG9jYWxUaW1lYCBhbmQgYGdldFN5bmNUaW1lYCBhcmUgYmFzaWNhbGx5IGFsaWFzZXMgb24gdGhlIHNlcnZlci5cbiAgICpcbiAgICogQHBhcmFtIHtOdW1iZXJ9IFtsb2NhbFRpbWU9dW5kZWZpbmVkXSAtIEdldCBzeW5jIHRpbWUgYWNjb3JkaW5nIHRvIGdpdmVuXG4gICAqICBnaXZlbiBgbG9jYWxUaW1lYCwgaWYgYGxvY2FsVGltZWAgaXMgbm90IGRlZmluZWQgcmV0dXJucyBjdXJyZW50IHN5bmMgdGltZS5cbiAgICogQHJldHVybnMge051bWJlcn0gc3luY2hyb25pc2VkIHRpbWUsIGluIHNlY29uZHMuXG4gICAqL1xuXG5cbiAgZ2V0U3luY1RpbWUobG9jYWxUaW1lKSB7XG4gICAgcmV0dXJuIHRoaXMuZ2V0TG9jYWxUaW1lKGxvY2FsVGltZSk7IC8vIHN5bmMgdGltZSBpcyBsb2NhbCwgaGVyZVxuICB9XG5cbn1cblxudmFyIF9kZWZhdWx0ID0gU3luY1NlcnZlcjtcbmV4cG9ydHMuZGVmYXVsdCA9IF9kZWZhdWx0OyIsIm1vZHVsZS5leHBvcnRzID0geyBcImRlZmF1bHRcIjogcmVxdWlyZShcImNvcmUtanMvbGlicmFyeS9mbi9qc29uL3N0cmluZ2lmeVwiKSwgX19lc01vZHVsZTogdHJ1ZSB9OyIsInZhciBjb3JlID0gcmVxdWlyZSgnLi4vLi4vbW9kdWxlcy9fY29yZScpO1xudmFyICRKU09OID0gY29yZS5KU09OIHx8IChjb3JlLkpTT04gPSB7IHN0cmluZ2lmeTogSlNPTi5zdHJpbmdpZnkgfSk7XG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHN0cmluZ2lmeShpdCkgeyAvLyBlc2xpbnQtZGlzYWJsZS1saW5lIG5vLXVudXNlZC12YXJzXG4gIHJldHVybiAkSlNPTi5zdHJpbmdpZnkuYXBwbHkoJEpTT04sIGFyZ3VtZW50cyk7XG59O1xuIiwidmFyIGNvcmUgPSBtb2R1bGUuZXhwb3J0cyA9IHsgdmVyc2lvbjogJzIuNi4xMicgfTtcbmlmICh0eXBlb2YgX19lID09ICdudW1iZXInKSBfX2UgPSBjb3JlOyAvLyBlc2xpbnQtZGlzYWJsZS1saW5lIG5vLXVuZGVmXG4iLCIvKipcbiAqIEhlbHBlcnMuXG4gKi9cblxudmFyIHMgPSAxMDAwO1xudmFyIG0gPSBzICogNjA7XG52YXIgaCA9IG0gKiA2MDtcbnZhciBkID0gaCAqIDI0O1xudmFyIHcgPSBkICogNztcbnZhciB5ID0gZCAqIDM2NS4yNTtcblxuLyoqXG4gKiBQYXJzZSBvciBmb3JtYXQgdGhlIGdpdmVuIGB2YWxgLlxuICpcbiAqIE9wdGlvbnM6XG4gKlxuICogIC0gYGxvbmdgIHZlcmJvc2UgZm9ybWF0dGluZyBbZmFsc2VdXG4gKlxuICogQHBhcmFtIHtTdHJpbmd8TnVtYmVyfSB2YWxcbiAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc11cbiAqIEB0aHJvd3Mge0Vycm9yfSB0aHJvdyBhbiBlcnJvciBpZiB2YWwgaXMgbm90IGEgbm9uLWVtcHR5IHN0cmluZyBvciBhIG51bWJlclxuICogQHJldHVybiB7U3RyaW5nfE51bWJlcn1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbih2YWwsIG9wdGlvbnMpIHtcbiAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gIHZhciB0eXBlID0gdHlwZW9mIHZhbDtcbiAgaWYgKHR5cGUgPT09ICdzdHJpbmcnICYmIHZhbC5sZW5ndGggPiAwKSB7XG4gICAgcmV0dXJuIHBhcnNlKHZhbCk7XG4gIH0gZWxzZSBpZiAodHlwZSA9PT0gJ251bWJlcicgJiYgaXNGaW5pdGUodmFsKSkge1xuICAgIHJldHVybiBvcHRpb25zLmxvbmcgPyBmbXRMb25nKHZhbCkgOiBmbXRTaG9ydCh2YWwpO1xuICB9XG4gIHRocm93IG5ldyBFcnJvcihcbiAgICAndmFsIGlzIG5vdCBhIG5vbi1lbXB0eSBzdHJpbmcgb3IgYSB2YWxpZCBudW1iZXIuIHZhbD0nICtcbiAgICAgIEpTT04uc3RyaW5naWZ5KHZhbClcbiAgKTtcbn07XG5cbi8qKlxuICogUGFyc2UgdGhlIGdpdmVuIGBzdHJgIGFuZCByZXR1cm4gbWlsbGlzZWNvbmRzLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBzdHJcbiAqIEByZXR1cm4ge051bWJlcn1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIHBhcnNlKHN0cikge1xuICBzdHIgPSBTdHJpbmcoc3RyKTtcbiAgaWYgKHN0ci5sZW5ndGggPiAxMDApIHtcbiAgICByZXR1cm47XG4gIH1cbiAgdmFyIG1hdGNoID0gL14oLT8oPzpcXGQrKT9cXC4/XFxkKykgKihtaWxsaXNlY29uZHM/fG1zZWNzP3xtc3xzZWNvbmRzP3xzZWNzP3xzfG1pbnV0ZXM/fG1pbnM/fG18aG91cnM/fGhycz98aHxkYXlzP3xkfHdlZWtzP3x3fHllYXJzP3x5cnM/fHkpPyQvaS5leGVjKFxuICAgIHN0clxuICApO1xuICBpZiAoIW1hdGNoKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHZhciBuID0gcGFyc2VGbG9hdChtYXRjaFsxXSk7XG4gIHZhciB0eXBlID0gKG1hdGNoWzJdIHx8ICdtcycpLnRvTG93ZXJDYXNlKCk7XG4gIHN3aXRjaCAodHlwZSkge1xuICAgIGNhc2UgJ3llYXJzJzpcbiAgICBjYXNlICd5ZWFyJzpcbiAgICBjYXNlICd5cnMnOlxuICAgIGNhc2UgJ3lyJzpcbiAgICBjYXNlICd5JzpcbiAgICAgIHJldHVybiBuICogeTtcbiAgICBjYXNlICd3ZWVrcyc6XG4gICAgY2FzZSAnd2Vlayc6XG4gICAgY2FzZSAndyc6XG4gICAgICByZXR1cm4gbiAqIHc7XG4gICAgY2FzZSAnZGF5cyc6XG4gICAgY2FzZSAnZGF5JzpcbiAgICBjYXNlICdkJzpcbiAgICAgIHJldHVybiBuICogZDtcbiAgICBjYXNlICdob3Vycyc6XG4gICAgY2FzZSAnaG91cic6XG4gICAgY2FzZSAnaHJzJzpcbiAgICBjYXNlICdocic6XG4gICAgY2FzZSAnaCc6XG4gICAgICByZXR1cm4gbiAqIGg7XG4gICAgY2FzZSAnbWludXRlcyc6XG4gICAgY2FzZSAnbWludXRlJzpcbiAgICBjYXNlICdtaW5zJzpcbiAgICBjYXNlICdtaW4nOlxuICAgIGNhc2UgJ20nOlxuICAgICAgcmV0dXJuIG4gKiBtO1xuICAgIGNhc2UgJ3NlY29uZHMnOlxuICAgIGNhc2UgJ3NlY29uZCc6XG4gICAgY2FzZSAnc2Vjcyc6XG4gICAgY2FzZSAnc2VjJzpcbiAgICBjYXNlICdzJzpcbiAgICAgIHJldHVybiBuICogcztcbiAgICBjYXNlICdtaWxsaXNlY29uZHMnOlxuICAgIGNhc2UgJ21pbGxpc2Vjb25kJzpcbiAgICBjYXNlICdtc2Vjcyc6XG4gICAgY2FzZSAnbXNlYyc6XG4gICAgY2FzZSAnbXMnOlxuICAgICAgcmV0dXJuIG47XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gIH1cbn1cblxuLyoqXG4gKiBTaG9ydCBmb3JtYXQgZm9yIGBtc2AuXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ9IG1zXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBmbXRTaG9ydChtcykge1xuICB2YXIgbXNBYnMgPSBNYXRoLmFicyhtcyk7XG4gIGlmIChtc0FicyA+PSBkKSB7XG4gICAgcmV0dXJuIE1hdGgucm91bmQobXMgLyBkKSArICdkJztcbiAgfVxuICBpZiAobXNBYnMgPj0gaCkge1xuICAgIHJldHVybiBNYXRoLnJvdW5kKG1zIC8gaCkgKyAnaCc7XG4gIH1cbiAgaWYgKG1zQWJzID49IG0pIHtcbiAgICByZXR1cm4gTWF0aC5yb3VuZChtcyAvIG0pICsgJ20nO1xuICB9XG4gIGlmIChtc0FicyA+PSBzKSB7XG4gICAgcmV0dXJuIE1hdGgucm91bmQobXMgLyBzKSArICdzJztcbiAgfVxuICByZXR1cm4gbXMgKyAnbXMnO1xufVxuXG4vKipcbiAqIExvbmcgZm9ybWF0IGZvciBgbXNgLlxuICpcbiAqIEBwYXJhbSB7TnVtYmVyfSBtc1xuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gZm10TG9uZyhtcykge1xuICB2YXIgbXNBYnMgPSBNYXRoLmFicyhtcyk7XG4gIGlmIChtc0FicyA+PSBkKSB7XG4gICAgcmV0dXJuIHBsdXJhbChtcywgbXNBYnMsIGQsICdkYXknKTtcbiAgfVxuICBpZiAobXNBYnMgPj0gaCkge1xuICAgIHJldHVybiBwbHVyYWwobXMsIG1zQWJzLCBoLCAnaG91cicpO1xuICB9XG4gIGlmIChtc0FicyA+PSBtKSB7XG4gICAgcmV0dXJuIHBsdXJhbChtcywgbXNBYnMsIG0sICdtaW51dGUnKTtcbiAgfVxuICBpZiAobXNBYnMgPj0gcykge1xuICAgIHJldHVybiBwbHVyYWwobXMsIG1zQWJzLCBzLCAnc2Vjb25kJyk7XG4gIH1cbiAgcmV0dXJuIG1zICsgJyBtcyc7XG59XG5cbi8qKlxuICogUGx1cmFsaXphdGlvbiBoZWxwZXIuXG4gKi9cblxuZnVuY3Rpb24gcGx1cmFsKG1zLCBtc0FicywgbiwgbmFtZSkge1xuICB2YXIgaXNQbHVyYWwgPSBtc0FicyA+PSBuICogMS41O1xuICByZXR1cm4gTWF0aC5yb3VuZChtcyAvIG4pICsgJyAnICsgbmFtZSArIChpc1BsdXJhbCA/ICdzJyA6ICcnKTtcbn1cbiIsIi8qIGVzbGludC1lbnYgYnJvd3NlciAqL1xuXG4vKipcbiAqIFRoaXMgaXMgdGhlIHdlYiBicm93c2VyIGltcGxlbWVudGF0aW9uIG9mIGBkZWJ1ZygpYC5cbiAqL1xuXG5leHBvcnRzLmZvcm1hdEFyZ3MgPSBmb3JtYXRBcmdzO1xuZXhwb3J0cy5zYXZlID0gc2F2ZTtcbmV4cG9ydHMubG9hZCA9IGxvYWQ7XG5leHBvcnRzLnVzZUNvbG9ycyA9IHVzZUNvbG9ycztcbmV4cG9ydHMuc3RvcmFnZSA9IGxvY2Fsc3RvcmFnZSgpO1xuZXhwb3J0cy5kZXN0cm95ID0gKCgpID0+IHtcblx0bGV0IHdhcm5lZCA9IGZhbHNlO1xuXG5cdHJldHVybiAoKSA9PiB7XG5cdFx0aWYgKCF3YXJuZWQpIHtcblx0XHRcdHdhcm5lZCA9IHRydWU7XG5cdFx0XHRjb25zb2xlLndhcm4oJ0luc3RhbmNlIG1ldGhvZCBgZGVidWcuZGVzdHJveSgpYCBpcyBkZXByZWNhdGVkIGFuZCBubyBsb25nZXIgZG9lcyBhbnl0aGluZy4gSXQgd2lsbCBiZSByZW1vdmVkIGluIHRoZSBuZXh0IG1ham9yIHZlcnNpb24gb2YgYGRlYnVnYC4nKTtcblx0XHR9XG5cdH07XG59KSgpO1xuXG4vKipcbiAqIENvbG9ycy5cbiAqL1xuXG5leHBvcnRzLmNvbG9ycyA9IFtcblx0JyMwMDAwQ0MnLFxuXHQnIzAwMDBGRicsXG5cdCcjMDAzM0NDJyxcblx0JyMwMDMzRkYnLFxuXHQnIzAwNjZDQycsXG5cdCcjMDA2NkZGJyxcblx0JyMwMDk5Q0MnLFxuXHQnIzAwOTlGRicsXG5cdCcjMDBDQzAwJyxcblx0JyMwMENDMzMnLFxuXHQnIzAwQ0M2NicsXG5cdCcjMDBDQzk5Jyxcblx0JyMwMENDQ0MnLFxuXHQnIzAwQ0NGRicsXG5cdCcjMzMwMENDJyxcblx0JyMzMzAwRkYnLFxuXHQnIzMzMzNDQycsXG5cdCcjMzMzM0ZGJyxcblx0JyMzMzY2Q0MnLFxuXHQnIzMzNjZGRicsXG5cdCcjMzM5OUNDJyxcblx0JyMzMzk5RkYnLFxuXHQnIzMzQ0MwMCcsXG5cdCcjMzNDQzMzJyxcblx0JyMzM0NDNjYnLFxuXHQnIzMzQ0M5OScsXG5cdCcjMzNDQ0NDJyxcblx0JyMzM0NDRkYnLFxuXHQnIzY2MDBDQycsXG5cdCcjNjYwMEZGJyxcblx0JyM2NjMzQ0MnLFxuXHQnIzY2MzNGRicsXG5cdCcjNjZDQzAwJyxcblx0JyM2NkNDMzMnLFxuXHQnIzk5MDBDQycsXG5cdCcjOTkwMEZGJyxcblx0JyM5OTMzQ0MnLFxuXHQnIzk5MzNGRicsXG5cdCcjOTlDQzAwJyxcblx0JyM5OUNDMzMnLFxuXHQnI0NDMDAwMCcsXG5cdCcjQ0MwMDMzJyxcblx0JyNDQzAwNjYnLFxuXHQnI0NDMDA5OScsXG5cdCcjQ0MwMENDJyxcblx0JyNDQzAwRkYnLFxuXHQnI0NDMzMwMCcsXG5cdCcjQ0MzMzMzJyxcblx0JyNDQzMzNjYnLFxuXHQnI0NDMzM5OScsXG5cdCcjQ0MzM0NDJyxcblx0JyNDQzMzRkYnLFxuXHQnI0NDNjYwMCcsXG5cdCcjQ0M2NjMzJyxcblx0JyNDQzk5MDAnLFxuXHQnI0NDOTkzMycsXG5cdCcjQ0NDQzAwJyxcblx0JyNDQ0NDMzMnLFxuXHQnI0ZGMDAwMCcsXG5cdCcjRkYwMDMzJyxcblx0JyNGRjAwNjYnLFxuXHQnI0ZGMDA5OScsXG5cdCcjRkYwMENDJyxcblx0JyNGRjAwRkYnLFxuXHQnI0ZGMzMwMCcsXG5cdCcjRkYzMzMzJyxcblx0JyNGRjMzNjYnLFxuXHQnI0ZGMzM5OScsXG5cdCcjRkYzM0NDJyxcblx0JyNGRjMzRkYnLFxuXHQnI0ZGNjYwMCcsXG5cdCcjRkY2NjMzJyxcblx0JyNGRjk5MDAnLFxuXHQnI0ZGOTkzMycsXG5cdCcjRkZDQzAwJyxcblx0JyNGRkNDMzMnXG5dO1xuXG4vKipcbiAqIEN1cnJlbnRseSBvbmx5IFdlYktpdC1iYXNlZCBXZWIgSW5zcGVjdG9ycywgRmlyZWZveCA+PSB2MzEsXG4gKiBhbmQgdGhlIEZpcmVidWcgZXh0ZW5zaW9uIChhbnkgRmlyZWZveCB2ZXJzaW9uKSBhcmUga25vd25cbiAqIHRvIHN1cHBvcnQgXCIlY1wiIENTUyBjdXN0b21pemF0aW9ucy5cbiAqXG4gKiBUT0RPOiBhZGQgYSBgbG9jYWxTdG9yYWdlYCB2YXJpYWJsZSB0byBleHBsaWNpdGx5IGVuYWJsZS9kaXNhYmxlIGNvbG9yc1xuICovXG5cbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBjb21wbGV4aXR5XG5mdW5jdGlvbiB1c2VDb2xvcnMoKSB7XG5cdC8vIE5COiBJbiBhbiBFbGVjdHJvbiBwcmVsb2FkIHNjcmlwdCwgZG9jdW1lbnQgd2lsbCBiZSBkZWZpbmVkIGJ1dCBub3QgZnVsbHlcblx0Ly8gaW5pdGlhbGl6ZWQuIFNpbmNlIHdlIGtub3cgd2UncmUgaW4gQ2hyb21lLCB3ZSdsbCBqdXN0IGRldGVjdCB0aGlzIGNhc2Vcblx0Ly8gZXhwbGljaXRseVxuXHRpZiAodHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgJiYgd2luZG93LnByb2Nlc3MgJiYgKHdpbmRvdy5wcm9jZXNzLnR5cGUgPT09ICdyZW5kZXJlcicgfHwgd2luZG93LnByb2Nlc3MuX19ud2pzKSkge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0Ly8gSW50ZXJuZXQgRXhwbG9yZXIgYW5kIEVkZ2UgZG8gbm90IHN1cHBvcnQgY29sb3JzLlxuXHRpZiAodHlwZW9mIG5hdmlnYXRvciAhPT0gJ3VuZGVmaW5lZCcgJiYgbmF2aWdhdG9yLnVzZXJBZ2VudCAmJiBuYXZpZ2F0b3IudXNlckFnZW50LnRvTG93ZXJDYXNlKCkubWF0Y2goLyhlZGdlfHRyaWRlbnQpXFwvKFxcZCspLykpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHQvLyBJcyB3ZWJraXQ/IGh0dHA6Ly9zdGFja292ZXJmbG93LmNvbS9hLzE2NDU5NjA2LzM3Njc3M1xuXHQvLyBkb2N1bWVudCBpcyB1bmRlZmluZWQgaW4gcmVhY3QtbmF0aXZlOiBodHRwczovL2dpdGh1Yi5jb20vZmFjZWJvb2svcmVhY3QtbmF0aXZlL3B1bGwvMTYzMlxuXHRyZXR1cm4gKHR5cGVvZiBkb2N1bWVudCAhPT0gJ3VuZGVmaW5lZCcgJiYgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50ICYmIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5zdHlsZSAmJiBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuc3R5bGUuV2Via2l0QXBwZWFyYW5jZSkgfHxcblx0XHQvLyBJcyBmaXJlYnVnPyBodHRwOi8vc3RhY2tvdmVyZmxvdy5jb20vYS8zOTgxMjAvMzc2NzczXG5cdFx0KHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnICYmIHdpbmRvdy5jb25zb2xlICYmICh3aW5kb3cuY29uc29sZS5maXJlYnVnIHx8ICh3aW5kb3cuY29uc29sZS5leGNlcHRpb24gJiYgd2luZG93LmNvbnNvbGUudGFibGUpKSkgfHxcblx0XHQvLyBJcyBmaXJlZm94ID49IHYzMT9cblx0XHQvLyBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1Rvb2xzL1dlYl9Db25zb2xlI1N0eWxpbmdfbWVzc2FnZXNcblx0XHQodHlwZW9mIG5hdmlnYXRvciAhPT0gJ3VuZGVmaW5lZCcgJiYgbmF2aWdhdG9yLnVzZXJBZ2VudCAmJiBuYXZpZ2F0b3IudXNlckFnZW50LnRvTG93ZXJDYXNlKCkubWF0Y2goL2ZpcmVmb3hcXC8oXFxkKykvKSAmJiBwYXJzZUludChSZWdFeHAuJDEsIDEwKSA+PSAzMSkgfHxcblx0XHQvLyBEb3VibGUgY2hlY2sgd2Via2l0IGluIHVzZXJBZ2VudCBqdXN0IGluIGNhc2Ugd2UgYXJlIGluIGEgd29ya2VyXG5cdFx0KHR5cGVvZiBuYXZpZ2F0b3IgIT09ICd1bmRlZmluZWQnICYmIG5hdmlnYXRvci51c2VyQWdlbnQgJiYgbmF2aWdhdG9yLnVzZXJBZ2VudC50b0xvd2VyQ2FzZSgpLm1hdGNoKC9hcHBsZXdlYmtpdFxcLyhcXGQrKS8pKTtcbn1cblxuLyoqXG4gKiBDb2xvcml6ZSBsb2cgYXJndW1lbnRzIGlmIGVuYWJsZWQuXG4gKlxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBmb3JtYXRBcmdzKGFyZ3MpIHtcblx0YXJnc1swXSA9ICh0aGlzLnVzZUNvbG9ycyA/ICclYycgOiAnJykgK1xuXHRcdHRoaXMubmFtZXNwYWNlICtcblx0XHQodGhpcy51c2VDb2xvcnMgPyAnICVjJyA6ICcgJykgK1xuXHRcdGFyZ3NbMF0gK1xuXHRcdCh0aGlzLnVzZUNvbG9ycyA/ICclYyAnIDogJyAnKSArXG5cdFx0JysnICsgbW9kdWxlLmV4cG9ydHMuaHVtYW5pemUodGhpcy5kaWZmKTtcblxuXHRpZiAoIXRoaXMudXNlQ29sb3JzKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0Y29uc3QgYyA9ICdjb2xvcjogJyArIHRoaXMuY29sb3I7XG5cdGFyZ3Muc3BsaWNlKDEsIDAsIGMsICdjb2xvcjogaW5oZXJpdCcpO1xuXG5cdC8vIFRoZSBmaW5hbCBcIiVjXCIgaXMgc29tZXdoYXQgdHJpY2t5LCBiZWNhdXNlIHRoZXJlIGNvdWxkIGJlIG90aGVyXG5cdC8vIGFyZ3VtZW50cyBwYXNzZWQgZWl0aGVyIGJlZm9yZSBvciBhZnRlciB0aGUgJWMsIHNvIHdlIG5lZWQgdG9cblx0Ly8gZmlndXJlIG91dCB0aGUgY29ycmVjdCBpbmRleCB0byBpbnNlcnQgdGhlIENTUyBpbnRvXG5cdGxldCBpbmRleCA9IDA7XG5cdGxldCBsYXN0QyA9IDA7XG5cdGFyZ3NbMF0ucmVwbGFjZSgvJVthLXpBLVolXS9nLCBtYXRjaCA9PiB7XG5cdFx0aWYgKG1hdGNoID09PSAnJSUnKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGluZGV4Kys7XG5cdFx0aWYgKG1hdGNoID09PSAnJWMnKSB7XG5cdFx0XHQvLyBXZSBvbmx5IGFyZSBpbnRlcmVzdGVkIGluIHRoZSAqbGFzdCogJWNcblx0XHRcdC8vICh0aGUgdXNlciBtYXkgaGF2ZSBwcm92aWRlZCB0aGVpciBvd24pXG5cdFx0XHRsYXN0QyA9IGluZGV4O1xuXHRcdH1cblx0fSk7XG5cblx0YXJncy5zcGxpY2UobGFzdEMsIDAsIGMpO1xufVxuXG4vKipcbiAqIEludm9rZXMgYGNvbnNvbGUuZGVidWcoKWAgd2hlbiBhdmFpbGFibGUuXG4gKiBOby1vcCB3aGVuIGBjb25zb2xlLmRlYnVnYCBpcyBub3QgYSBcImZ1bmN0aW9uXCIuXG4gKiBJZiBgY29uc29sZS5kZWJ1Z2AgaXMgbm90IGF2YWlsYWJsZSwgZmFsbHMgYmFja1xuICogdG8gYGNvbnNvbGUubG9nYC5cbiAqXG4gKiBAYXBpIHB1YmxpY1xuICovXG5leHBvcnRzLmxvZyA9IGNvbnNvbGUuZGVidWcgfHwgY29uc29sZS5sb2cgfHwgKCgpID0+IHt9KTtcblxuLyoqXG4gKiBTYXZlIGBuYW1lc3BhY2VzYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZXNwYWNlc1xuICogQGFwaSBwcml2YXRlXG4gKi9cbmZ1bmN0aW9uIHNhdmUobmFtZXNwYWNlcykge1xuXHR0cnkge1xuXHRcdGlmIChuYW1lc3BhY2VzKSB7XG5cdFx0XHRleHBvcnRzLnN0b3JhZ2Uuc2V0SXRlbSgnZGVidWcnLCBuYW1lc3BhY2VzKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZXhwb3J0cy5zdG9yYWdlLnJlbW92ZUl0ZW0oJ2RlYnVnJyk7XG5cdFx0fVxuXHR9IGNhdGNoIChlcnJvcikge1xuXHRcdC8vIFN3YWxsb3dcblx0XHQvLyBYWFggKEBRaXgtKSBzaG91bGQgd2UgYmUgbG9nZ2luZyB0aGVzZT9cblx0fVxufVxuXG4vKipcbiAqIExvYWQgYG5hbWVzcGFjZXNgLlxuICpcbiAqIEByZXR1cm4ge1N0cmluZ30gcmV0dXJucyB0aGUgcHJldmlvdXNseSBwZXJzaXN0ZWQgZGVidWcgbW9kZXNcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5mdW5jdGlvbiBsb2FkKCkge1xuXHRsZXQgcjtcblx0dHJ5IHtcblx0XHRyID0gZXhwb3J0cy5zdG9yYWdlLmdldEl0ZW0oJ2RlYnVnJyk7XG5cdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0Ly8gU3dhbGxvd1xuXHRcdC8vIFhYWCAoQFFpeC0pIHNob3VsZCB3ZSBiZSBsb2dnaW5nIHRoZXNlP1xuXHR9XG5cblx0Ly8gSWYgZGVidWcgaXNuJ3Qgc2V0IGluIExTLCBhbmQgd2UncmUgaW4gRWxlY3Ryb24sIHRyeSB0byBsb2FkICRERUJVR1xuXHRpZiAoIXIgJiYgdHlwZW9mIHByb2Nlc3MgIT09ICd1bmRlZmluZWQnICYmICdlbnYnIGluIHByb2Nlc3MpIHtcblx0XHRyID0gcHJvY2Vzcy5lbnYuREVCVUc7XG5cdH1cblxuXHRyZXR1cm4gcjtcbn1cblxuLyoqXG4gKiBMb2NhbHN0b3JhZ2UgYXR0ZW1wdHMgdG8gcmV0dXJuIHRoZSBsb2NhbHN0b3JhZ2UuXG4gKlxuICogVGhpcyBpcyBuZWNlc3NhcnkgYmVjYXVzZSBzYWZhcmkgdGhyb3dzXG4gKiB3aGVuIGEgdXNlciBkaXNhYmxlcyBjb29raWVzL2xvY2Fsc3RvcmFnZVxuICogYW5kIHlvdSBhdHRlbXB0IHRvIGFjY2VzcyBpdC5cbiAqXG4gKiBAcmV0dXJuIHtMb2NhbFN0b3JhZ2V9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBsb2NhbHN0b3JhZ2UoKSB7XG5cdHRyeSB7XG5cdFx0Ly8gVFZNTEtpdCAoQXBwbGUgVFYgSlMgUnVudGltZSkgZG9lcyBub3QgaGF2ZSBhIHdpbmRvdyBvYmplY3QsIGp1c3QgbG9jYWxTdG9yYWdlIGluIHRoZSBnbG9iYWwgY29udGV4dFxuXHRcdC8vIFRoZSBCcm93c2VyIGFsc28gaGFzIGxvY2FsU3RvcmFnZSBpbiB0aGUgZ2xvYmFsIGNvbnRleHQuXG5cdFx0cmV0dXJuIGxvY2FsU3RvcmFnZTtcblx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHQvLyBTd2FsbG93XG5cdFx0Ly8gWFhYIChAUWl4LSkgc2hvdWxkIHdlIGJlIGxvZ2dpbmcgdGhlc2U/XG5cdH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKCcuL2NvbW1vbicpKGV4cG9ydHMpO1xuXG5jb25zdCB7Zm9ybWF0dGVyc30gPSBtb2R1bGUuZXhwb3J0cztcblxuLyoqXG4gKiBNYXAgJWogdG8gYEpTT04uc3RyaW5naWZ5KClgLCBzaW5jZSBubyBXZWIgSW5zcGVjdG9ycyBkbyB0aGF0IGJ5IGRlZmF1bHQuXG4gKi9cblxuZm9ybWF0dGVycy5qID0gZnVuY3Rpb24gKHYpIHtcblx0dHJ5IHtcblx0XHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkodik7XG5cdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0cmV0dXJuICdbVW5leHBlY3RlZEpTT05QYXJzZUVycm9yXTogJyArIGVycm9yLm1lc3NhZ2U7XG5cdH1cbn07XG4iLCJcbi8qKlxuICogVGhpcyBpcyB0aGUgY29tbW9uIGxvZ2ljIGZvciBib3RoIHRoZSBOb2RlLmpzIGFuZCB3ZWIgYnJvd3NlclxuICogaW1wbGVtZW50YXRpb25zIG9mIGBkZWJ1ZygpYC5cbiAqL1xuXG5mdW5jdGlvbiBzZXR1cChlbnYpIHtcblx0Y3JlYXRlRGVidWcuZGVidWcgPSBjcmVhdGVEZWJ1Zztcblx0Y3JlYXRlRGVidWcuZGVmYXVsdCA9IGNyZWF0ZURlYnVnO1xuXHRjcmVhdGVEZWJ1Zy5jb2VyY2UgPSBjb2VyY2U7XG5cdGNyZWF0ZURlYnVnLmRpc2FibGUgPSBkaXNhYmxlO1xuXHRjcmVhdGVEZWJ1Zy5lbmFibGUgPSBlbmFibGU7XG5cdGNyZWF0ZURlYnVnLmVuYWJsZWQgPSBlbmFibGVkO1xuXHRjcmVhdGVEZWJ1Zy5odW1hbml6ZSA9IHJlcXVpcmUoJ21zJyk7XG5cdGNyZWF0ZURlYnVnLmRlc3Ryb3kgPSBkZXN0cm95O1xuXG5cdE9iamVjdC5rZXlzKGVudikuZm9yRWFjaChrZXkgPT4ge1xuXHRcdGNyZWF0ZURlYnVnW2tleV0gPSBlbnZba2V5XTtcblx0fSk7XG5cblx0LyoqXG5cdCogVGhlIGN1cnJlbnRseSBhY3RpdmUgZGVidWcgbW9kZSBuYW1lcywgYW5kIG5hbWVzIHRvIHNraXAuXG5cdCovXG5cblx0Y3JlYXRlRGVidWcubmFtZXMgPSBbXTtcblx0Y3JlYXRlRGVidWcuc2tpcHMgPSBbXTtcblxuXHQvKipcblx0KiBNYXAgb2Ygc3BlY2lhbCBcIiVuXCIgaGFuZGxpbmcgZnVuY3Rpb25zLCBmb3IgdGhlIGRlYnVnIFwiZm9ybWF0XCIgYXJndW1lbnQuXG5cdCpcblx0KiBWYWxpZCBrZXkgbmFtZXMgYXJlIGEgc2luZ2xlLCBsb3dlciBvciB1cHBlci1jYXNlIGxldHRlciwgaS5lLiBcIm5cIiBhbmQgXCJOXCIuXG5cdCovXG5cdGNyZWF0ZURlYnVnLmZvcm1hdHRlcnMgPSB7fTtcblxuXHQvKipcblx0KiBTZWxlY3RzIGEgY29sb3IgZm9yIGEgZGVidWcgbmFtZXNwYWNlXG5cdCogQHBhcmFtIHtTdHJpbmd9IG5hbWVzcGFjZSBUaGUgbmFtZXNwYWNlIHN0cmluZyBmb3IgdGhlIGZvciB0aGUgZGVidWcgaW5zdGFuY2UgdG8gYmUgY29sb3JlZFxuXHQqIEByZXR1cm4ge051bWJlcnxTdHJpbmd9IEFuIEFOU0kgY29sb3IgY29kZSBmb3IgdGhlIGdpdmVuIG5hbWVzcGFjZVxuXHQqIEBhcGkgcHJpdmF0ZVxuXHQqL1xuXHRmdW5jdGlvbiBzZWxlY3RDb2xvcihuYW1lc3BhY2UpIHtcblx0XHRsZXQgaGFzaCA9IDA7XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IG5hbWVzcGFjZS5sZW5ndGg7IGkrKykge1xuXHRcdFx0aGFzaCA9ICgoaGFzaCA8PCA1KSAtIGhhc2gpICsgbmFtZXNwYWNlLmNoYXJDb2RlQXQoaSk7XG5cdFx0XHRoYXNoIHw9IDA7IC8vIENvbnZlcnQgdG8gMzJiaXQgaW50ZWdlclxuXHRcdH1cblxuXHRcdHJldHVybiBjcmVhdGVEZWJ1Zy5jb2xvcnNbTWF0aC5hYnMoaGFzaCkgJSBjcmVhdGVEZWJ1Zy5jb2xvcnMubGVuZ3RoXTtcblx0fVxuXHRjcmVhdGVEZWJ1Zy5zZWxlY3RDb2xvciA9IHNlbGVjdENvbG9yO1xuXG5cdC8qKlxuXHQqIENyZWF0ZSBhIGRlYnVnZ2VyIHdpdGggdGhlIGdpdmVuIGBuYW1lc3BhY2VgLlxuXHQqXG5cdCogQHBhcmFtIHtTdHJpbmd9IG5hbWVzcGFjZVxuXHQqIEByZXR1cm4ge0Z1bmN0aW9ufVxuXHQqIEBhcGkgcHVibGljXG5cdCovXG5cdGZ1bmN0aW9uIGNyZWF0ZURlYnVnKG5hbWVzcGFjZSkge1xuXHRcdGxldCBwcmV2VGltZTtcblx0XHRsZXQgZW5hYmxlT3ZlcnJpZGUgPSBudWxsO1xuXG5cdFx0ZnVuY3Rpb24gZGVidWcoLi4uYXJncykge1xuXHRcdFx0Ly8gRGlzYWJsZWQ/XG5cdFx0XHRpZiAoIWRlYnVnLmVuYWJsZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzZWxmID0gZGVidWc7XG5cblx0XHRcdC8vIFNldCBgZGlmZmAgdGltZXN0YW1wXG5cdFx0XHRjb25zdCBjdXJyID0gTnVtYmVyKG5ldyBEYXRlKCkpO1xuXHRcdFx0Y29uc3QgbXMgPSBjdXJyIC0gKHByZXZUaW1lIHx8IGN1cnIpO1xuXHRcdFx0c2VsZi5kaWZmID0gbXM7XG5cdFx0XHRzZWxmLnByZXYgPSBwcmV2VGltZTtcblx0XHRcdHNlbGYuY3VyciA9IGN1cnI7XG5cdFx0XHRwcmV2VGltZSA9IGN1cnI7XG5cblx0XHRcdGFyZ3NbMF0gPSBjcmVhdGVEZWJ1Zy5jb2VyY2UoYXJnc1swXSk7XG5cblx0XHRcdGlmICh0eXBlb2YgYXJnc1swXSAhPT0gJ3N0cmluZycpIHtcblx0XHRcdFx0Ly8gQW55dGhpbmcgZWxzZSBsZXQncyBpbnNwZWN0IHdpdGggJU9cblx0XHRcdFx0YXJncy51bnNoaWZ0KCclTycpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBBcHBseSBhbnkgYGZvcm1hdHRlcnNgIHRyYW5zZm9ybWF0aW9uc1xuXHRcdFx0bGV0IGluZGV4ID0gMDtcblx0XHRcdGFyZ3NbMF0gPSBhcmdzWzBdLnJlcGxhY2UoLyUoW2EtekEtWiVdKS9nLCAobWF0Y2gsIGZvcm1hdCkgPT4ge1xuXHRcdFx0XHQvLyBJZiB3ZSBlbmNvdW50ZXIgYW4gZXNjYXBlZCAlIHRoZW4gZG9uJ3QgaW5jcmVhc2UgdGhlIGFycmF5IGluZGV4XG5cdFx0XHRcdGlmIChtYXRjaCA9PT0gJyUlJykge1xuXHRcdFx0XHRcdHJldHVybiAnJSc7XG5cdFx0XHRcdH1cblx0XHRcdFx0aW5kZXgrKztcblx0XHRcdFx0Y29uc3QgZm9ybWF0dGVyID0gY3JlYXRlRGVidWcuZm9ybWF0dGVyc1tmb3JtYXRdO1xuXHRcdFx0XHRpZiAodHlwZW9mIGZvcm1hdHRlciA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0XHRcdGNvbnN0IHZhbCA9IGFyZ3NbaW5kZXhdO1xuXHRcdFx0XHRcdG1hdGNoID0gZm9ybWF0dGVyLmNhbGwoc2VsZiwgdmFsKTtcblxuXHRcdFx0XHRcdC8vIE5vdyB3ZSBuZWVkIHRvIHJlbW92ZSBgYXJnc1tpbmRleF1gIHNpbmNlIGl0J3MgaW5saW5lZCBpbiB0aGUgYGZvcm1hdGBcblx0XHRcdFx0XHRhcmdzLnNwbGljZShpbmRleCwgMSk7XG5cdFx0XHRcdFx0aW5kZXgtLTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gbWF0Y2g7XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gQXBwbHkgZW52LXNwZWNpZmljIGZvcm1hdHRpbmcgKGNvbG9ycywgZXRjLilcblx0XHRcdGNyZWF0ZURlYnVnLmZvcm1hdEFyZ3MuY2FsbChzZWxmLCBhcmdzKTtcblxuXHRcdFx0Y29uc3QgbG9nRm4gPSBzZWxmLmxvZyB8fCBjcmVhdGVEZWJ1Zy5sb2c7XG5cdFx0XHRsb2dGbi5hcHBseShzZWxmLCBhcmdzKTtcblx0XHR9XG5cblx0XHRkZWJ1Zy5uYW1lc3BhY2UgPSBuYW1lc3BhY2U7XG5cdFx0ZGVidWcudXNlQ29sb3JzID0gY3JlYXRlRGVidWcudXNlQ29sb3JzKCk7XG5cdFx0ZGVidWcuY29sb3IgPSBjcmVhdGVEZWJ1Zy5zZWxlY3RDb2xvcihuYW1lc3BhY2UpO1xuXHRcdGRlYnVnLmV4dGVuZCA9IGV4dGVuZDtcblx0XHRkZWJ1Zy5kZXN0cm95ID0gY3JlYXRlRGVidWcuZGVzdHJveTsgLy8gWFhYIFRlbXBvcmFyeS4gV2lsbCBiZSByZW1vdmVkIGluIHRoZSBuZXh0IG1ham9yIHJlbGVhc2UuXG5cblx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkoZGVidWcsICdlbmFibGVkJywge1xuXHRcdFx0ZW51bWVyYWJsZTogdHJ1ZSxcblx0XHRcdGNvbmZpZ3VyYWJsZTogZmFsc2UsXG5cdFx0XHRnZXQ6ICgpID0+IGVuYWJsZU92ZXJyaWRlID09PSBudWxsID8gY3JlYXRlRGVidWcuZW5hYmxlZChuYW1lc3BhY2UpIDogZW5hYmxlT3ZlcnJpZGUsXG5cdFx0XHRzZXQ6IHYgPT4ge1xuXHRcdFx0XHRlbmFibGVPdmVycmlkZSA9IHY7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHQvLyBFbnYtc3BlY2lmaWMgaW5pdGlhbGl6YXRpb24gbG9naWMgZm9yIGRlYnVnIGluc3RhbmNlc1xuXHRcdGlmICh0eXBlb2YgY3JlYXRlRGVidWcuaW5pdCA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0Y3JlYXRlRGVidWcuaW5pdChkZWJ1Zyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGRlYnVnO1xuXHR9XG5cblx0ZnVuY3Rpb24gZXh0ZW5kKG5hbWVzcGFjZSwgZGVsaW1pdGVyKSB7XG5cdFx0Y29uc3QgbmV3RGVidWcgPSBjcmVhdGVEZWJ1Zyh0aGlzLm5hbWVzcGFjZSArICh0eXBlb2YgZGVsaW1pdGVyID09PSAndW5kZWZpbmVkJyA/ICc6JyA6IGRlbGltaXRlcikgKyBuYW1lc3BhY2UpO1xuXHRcdG5ld0RlYnVnLmxvZyA9IHRoaXMubG9nO1xuXHRcdHJldHVybiBuZXdEZWJ1Zztcblx0fVxuXG5cdC8qKlxuXHQqIEVuYWJsZXMgYSBkZWJ1ZyBtb2RlIGJ5IG5hbWVzcGFjZXMuIFRoaXMgY2FuIGluY2x1ZGUgbW9kZXNcblx0KiBzZXBhcmF0ZWQgYnkgYSBjb2xvbiBhbmQgd2lsZGNhcmRzLlxuXHQqXG5cdCogQHBhcmFtIHtTdHJpbmd9IG5hbWVzcGFjZXNcblx0KiBAYXBpIHB1YmxpY1xuXHQqL1xuXHRmdW5jdGlvbiBlbmFibGUobmFtZXNwYWNlcykge1xuXHRcdGNyZWF0ZURlYnVnLnNhdmUobmFtZXNwYWNlcyk7XG5cblx0XHRjcmVhdGVEZWJ1Zy5uYW1lcyA9IFtdO1xuXHRcdGNyZWF0ZURlYnVnLnNraXBzID0gW107XG5cblx0XHRsZXQgaTtcblx0XHRjb25zdCBzcGxpdCA9ICh0eXBlb2YgbmFtZXNwYWNlcyA9PT0gJ3N0cmluZycgPyBuYW1lc3BhY2VzIDogJycpLnNwbGl0KC9bXFxzLF0rLyk7XG5cdFx0Y29uc3QgbGVuID0gc3BsaXQubGVuZ3RoO1xuXG5cdFx0Zm9yIChpID0gMDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRpZiAoIXNwbGl0W2ldKSB7XG5cdFx0XHRcdC8vIGlnbm9yZSBlbXB0eSBzdHJpbmdzXG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRuYW1lc3BhY2VzID0gc3BsaXRbaV0ucmVwbGFjZSgvXFwqL2csICcuKj8nKTtcblxuXHRcdFx0aWYgKG5hbWVzcGFjZXNbMF0gPT09ICctJykge1xuXHRcdFx0XHRjcmVhdGVEZWJ1Zy5za2lwcy5wdXNoKG5ldyBSZWdFeHAoJ14nICsgbmFtZXNwYWNlcy5zdWJzdHIoMSkgKyAnJCcpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNyZWF0ZURlYnVnLm5hbWVzLnB1c2gobmV3IFJlZ0V4cCgnXicgKyBuYW1lc3BhY2VzICsgJyQnKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCogRGlzYWJsZSBkZWJ1ZyBvdXRwdXQuXG5cdCpcblx0KiBAcmV0dXJuIHtTdHJpbmd9IG5hbWVzcGFjZXNcblx0KiBAYXBpIHB1YmxpY1xuXHQqL1xuXHRmdW5jdGlvbiBkaXNhYmxlKCkge1xuXHRcdGNvbnN0IG5hbWVzcGFjZXMgPSBbXG5cdFx0XHQuLi5jcmVhdGVEZWJ1Zy5uYW1lcy5tYXAodG9OYW1lc3BhY2UpLFxuXHRcdFx0Li4uY3JlYXRlRGVidWcuc2tpcHMubWFwKHRvTmFtZXNwYWNlKS5tYXAobmFtZXNwYWNlID0+ICctJyArIG5hbWVzcGFjZSlcblx0XHRdLmpvaW4oJywnKTtcblx0XHRjcmVhdGVEZWJ1Zy5lbmFibGUoJycpO1xuXHRcdHJldHVybiBuYW1lc3BhY2VzO1xuXHR9XG5cblx0LyoqXG5cdCogUmV0dXJucyB0cnVlIGlmIHRoZSBnaXZlbiBtb2RlIG5hbWUgaXMgZW5hYmxlZCwgZmFsc2Ugb3RoZXJ3aXNlLlxuXHQqXG5cdCogQHBhcmFtIHtTdHJpbmd9IG5hbWVcblx0KiBAcmV0dXJuIHtCb29sZWFufVxuXHQqIEBhcGkgcHVibGljXG5cdCovXG5cdGZ1bmN0aW9uIGVuYWJsZWQobmFtZSkge1xuXHRcdGlmIChuYW1lW25hbWUubGVuZ3RoIC0gMV0gPT09ICcqJykge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0bGV0IGk7XG5cdFx0bGV0IGxlbjtcblxuXHRcdGZvciAoaSA9IDAsIGxlbiA9IGNyZWF0ZURlYnVnLnNraXBzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRpZiAoY3JlYXRlRGVidWcuc2tpcHNbaV0udGVzdChuYW1lKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Zm9yIChpID0gMCwgbGVuID0gY3JlYXRlRGVidWcubmFtZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGlmIChjcmVhdGVEZWJ1Zy5uYW1lc1tpXS50ZXN0KG5hbWUpKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdC8qKlxuXHQqIENvbnZlcnQgcmVnZXhwIHRvIG5hbWVzcGFjZVxuXHQqXG5cdCogQHBhcmFtIHtSZWdFeHB9IHJlZ3hlcFxuXHQqIEByZXR1cm4ge1N0cmluZ30gbmFtZXNwYWNlXG5cdCogQGFwaSBwcml2YXRlXG5cdCovXG5cdGZ1bmN0aW9uIHRvTmFtZXNwYWNlKHJlZ2V4cCkge1xuXHRcdHJldHVybiByZWdleHAudG9TdHJpbmcoKVxuXHRcdFx0LnN1YnN0cmluZygyLCByZWdleHAudG9TdHJpbmcoKS5sZW5ndGggLSAyKVxuXHRcdFx0LnJlcGxhY2UoL1xcLlxcKlxcPyQvLCAnKicpO1xuXHR9XG5cblx0LyoqXG5cdCogQ29lcmNlIGB2YWxgLlxuXHQqXG5cdCogQHBhcmFtIHtNaXhlZH0gdmFsXG5cdCogQHJldHVybiB7TWl4ZWR9XG5cdCogQGFwaSBwcml2YXRlXG5cdCovXG5cdGZ1bmN0aW9uIGNvZXJjZSh2YWwpIHtcblx0XHRpZiAodmFsIGluc3RhbmNlb2YgRXJyb3IpIHtcblx0XHRcdHJldHVybiB2YWwuc3RhY2sgfHwgdmFsLm1lc3NhZ2U7XG5cdFx0fVxuXHRcdHJldHVybiB2YWw7XG5cdH1cblxuXHQvKipcblx0KiBYWFggRE8gTk9UIFVTRS4gVGhpcyBpcyBhIHRlbXBvcmFyeSBzdHViIGZ1bmN0aW9uLlxuXHQqIFhYWCBJdCBXSUxMIGJlIHJlbW92ZWQgaW4gdGhlIG5leHQgbWFqb3IgcmVsZWFzZS5cblx0Ki9cblx0ZnVuY3Rpb24gZGVzdHJveSgpIHtcblx0XHRjb25zb2xlLndhcm4oJ0luc3RhbmNlIG1ldGhvZCBgZGVidWcuZGVzdHJveSgpYCBpcyBkZXByZWNhdGVkIGFuZCBubyBsb25nZXIgZG9lcyBhbnl0aGluZy4gSXQgd2lsbCBiZSByZW1vdmVkIGluIHRoZSBuZXh0IG1ham9yIHZlcnNpb24gb2YgYGRlYnVnYC4nKTtcblx0fVxuXG5cdGNyZWF0ZURlYnVnLmVuYWJsZShjcmVhdGVEZWJ1Zy5sb2FkKCkpO1xuXG5cdHJldHVybiBjcmVhdGVEZWJ1Zztcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBzZXR1cDtcbiIsIi8vIHNoaW0gZm9yIHVzaW5nIHByb2Nlc3MgaW4gYnJvd3NlclxudmFyIHByb2Nlc3MgPSBtb2R1bGUuZXhwb3J0cyA9IHt9O1xuXG4vLyBjYWNoZWQgZnJvbSB3aGF0ZXZlciBnbG9iYWwgaXMgcHJlc2VudCBzbyB0aGF0IHRlc3QgcnVubmVycyB0aGF0IHN0dWIgaXRcbi8vIGRvbid0IGJyZWFrIHRoaW5ncy4gIEJ1dCB3ZSBuZWVkIHRvIHdyYXAgaXQgaW4gYSB0cnkgY2F0Y2ggaW4gY2FzZSBpdCBpc1xuLy8gd3JhcHBlZCBpbiBzdHJpY3QgbW9kZSBjb2RlIHdoaWNoIGRvZXNuJ3QgZGVmaW5lIGFueSBnbG9iYWxzLiAgSXQncyBpbnNpZGUgYVxuLy8gZnVuY3Rpb24gYmVjYXVzZSB0cnkvY2F0Y2hlcyBkZW9wdGltaXplIGluIGNlcnRhaW4gZW5naW5lcy5cblxudmFyIGNhY2hlZFNldFRpbWVvdXQ7XG52YXIgY2FjaGVkQ2xlYXJUaW1lb3V0O1xuXG5mdW5jdGlvbiBkZWZhdWx0U2V0VGltb3V0KCkge1xuICAgIHRocm93IG5ldyBFcnJvcignc2V0VGltZW91dCBoYXMgbm90IGJlZW4gZGVmaW5lZCcpO1xufVxuZnVuY3Rpb24gZGVmYXVsdENsZWFyVGltZW91dCAoKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdjbGVhclRpbWVvdXQgaGFzIG5vdCBiZWVuIGRlZmluZWQnKTtcbn1cbihmdW5jdGlvbiAoKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgaWYgKHR5cGVvZiBzZXRUaW1lb3V0ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICBjYWNoZWRTZXRUaW1lb3V0ID0gc2V0VGltZW91dDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNhY2hlZFNldFRpbWVvdXQgPSBkZWZhdWx0U2V0VGltb3V0O1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjYWNoZWRTZXRUaW1lb3V0ID0gZGVmYXVsdFNldFRpbW91dDtcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgICAgaWYgKHR5cGVvZiBjbGVhclRpbWVvdXQgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIGNhY2hlZENsZWFyVGltZW91dCA9IGNsZWFyVGltZW91dDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNhY2hlZENsZWFyVGltZW91dCA9IGRlZmF1bHRDbGVhclRpbWVvdXQ7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNhY2hlZENsZWFyVGltZW91dCA9IGRlZmF1bHRDbGVhclRpbWVvdXQ7XG4gICAgfVxufSAoKSlcbmZ1bmN0aW9uIHJ1blRpbWVvdXQoZnVuKSB7XG4gICAgaWYgKGNhY2hlZFNldFRpbWVvdXQgPT09IHNldFRpbWVvdXQpIHtcbiAgICAgICAgLy9ub3JtYWwgZW52aXJvbWVudHMgaW4gc2FuZSBzaXR1YXRpb25zXG4gICAgICAgIHJldHVybiBzZXRUaW1lb3V0KGZ1biwgMCk7XG4gICAgfVxuICAgIC8vIGlmIHNldFRpbWVvdXQgd2Fzbid0IGF2YWlsYWJsZSBidXQgd2FzIGxhdHRlciBkZWZpbmVkXG4gICAgaWYgKChjYWNoZWRTZXRUaW1lb3V0ID09PSBkZWZhdWx0U2V0VGltb3V0IHx8ICFjYWNoZWRTZXRUaW1lb3V0KSAmJiBzZXRUaW1lb3V0KSB7XG4gICAgICAgIGNhY2hlZFNldFRpbWVvdXQgPSBzZXRUaW1lb3V0O1xuICAgICAgICByZXR1cm4gc2V0VGltZW91dChmdW4sIDApO1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgICAvLyB3aGVuIHdoZW4gc29tZWJvZHkgaGFzIHNjcmV3ZWQgd2l0aCBzZXRUaW1lb3V0IGJ1dCBubyBJLkUuIG1hZGRuZXNzXG4gICAgICAgIHJldHVybiBjYWNoZWRTZXRUaW1lb3V0KGZ1biwgMCk7XG4gICAgfSBjYXRjaChlKXtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIFdoZW4gd2UgYXJlIGluIEkuRS4gYnV0IHRoZSBzY3JpcHQgaGFzIGJlZW4gZXZhbGVkIHNvIEkuRS4gZG9lc24ndCB0cnVzdCB0aGUgZ2xvYmFsIG9iamVjdCB3aGVuIGNhbGxlZCBub3JtYWxseVxuICAgICAgICAgICAgcmV0dXJuIGNhY2hlZFNldFRpbWVvdXQuY2FsbChudWxsLCBmdW4sIDApO1xuICAgICAgICB9IGNhdGNoKGUpe1xuICAgICAgICAgICAgLy8gc2FtZSBhcyBhYm92ZSBidXQgd2hlbiBpdCdzIGEgdmVyc2lvbiBvZiBJLkUuIHRoYXQgbXVzdCBoYXZlIHRoZSBnbG9iYWwgb2JqZWN0IGZvciAndGhpcycsIGhvcGZ1bGx5IG91ciBjb250ZXh0IGNvcnJlY3Qgb3RoZXJ3aXNlIGl0IHdpbGwgdGhyb3cgYSBnbG9iYWwgZXJyb3JcbiAgICAgICAgICAgIHJldHVybiBjYWNoZWRTZXRUaW1lb3V0LmNhbGwodGhpcywgZnVuLCAwKTtcbiAgICAgICAgfVxuICAgIH1cblxuXG59XG5mdW5jdGlvbiBydW5DbGVhclRpbWVvdXQobWFya2VyKSB7XG4gICAgaWYgKGNhY2hlZENsZWFyVGltZW91dCA9PT0gY2xlYXJUaW1lb3V0KSB7XG4gICAgICAgIC8vbm9ybWFsIGVudmlyb21lbnRzIGluIHNhbmUgc2l0dWF0aW9uc1xuICAgICAgICByZXR1cm4gY2xlYXJUaW1lb3V0KG1hcmtlcik7XG4gICAgfVxuICAgIC8vIGlmIGNsZWFyVGltZW91dCB3YXNuJ3QgYXZhaWxhYmxlIGJ1dCB3YXMgbGF0dGVyIGRlZmluZWRcbiAgICBpZiAoKGNhY2hlZENsZWFyVGltZW91dCA9PT0gZGVmYXVsdENsZWFyVGltZW91dCB8fCAhY2FjaGVkQ2xlYXJUaW1lb3V0KSAmJiBjbGVhclRpbWVvdXQpIHtcbiAgICAgICAgY2FjaGVkQ2xlYXJUaW1lb3V0ID0gY2xlYXJUaW1lb3V0O1xuICAgICAgICByZXR1cm4gY2xlYXJUaW1lb3V0KG1hcmtlcik7XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICAgIC8vIHdoZW4gd2hlbiBzb21lYm9keSBoYXMgc2NyZXdlZCB3aXRoIHNldFRpbWVvdXQgYnV0IG5vIEkuRS4gbWFkZG5lc3NcbiAgICAgICAgcmV0dXJuIGNhY2hlZENsZWFyVGltZW91dChtYXJrZXIpO1xuICAgIH0gY2F0Y2ggKGUpe1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gV2hlbiB3ZSBhcmUgaW4gSS5FLiBidXQgdGhlIHNjcmlwdCBoYXMgYmVlbiBldmFsZWQgc28gSS5FLiBkb2Vzbid0ICB0cnVzdCB0aGUgZ2xvYmFsIG9iamVjdCB3aGVuIGNhbGxlZCBub3JtYWxseVxuICAgICAgICAgICAgcmV0dXJuIGNhY2hlZENsZWFyVGltZW91dC5jYWxsKG51bGwsIG1hcmtlcik7XG4gICAgICAgIH0gY2F0Y2ggKGUpe1xuICAgICAgICAgICAgLy8gc2FtZSBhcyBhYm92ZSBidXQgd2hlbiBpdCdzIGEgdmVyc2lvbiBvZiBJLkUuIHRoYXQgbXVzdCBoYXZlIHRoZSBnbG9iYWwgb2JqZWN0IGZvciAndGhpcycsIGhvcGZ1bGx5IG91ciBjb250ZXh0IGNvcnJlY3Qgb3RoZXJ3aXNlIGl0IHdpbGwgdGhyb3cgYSBnbG9iYWwgZXJyb3IuXG4gICAgICAgICAgICAvLyBTb21lIHZlcnNpb25zIG9mIEkuRS4gaGF2ZSBkaWZmZXJlbnQgcnVsZXMgZm9yIGNsZWFyVGltZW91dCB2cyBzZXRUaW1lb3V0XG4gICAgICAgICAgICByZXR1cm4gY2FjaGVkQ2xlYXJUaW1lb3V0LmNhbGwodGhpcywgbWFya2VyKTtcbiAgICAgICAgfVxuICAgIH1cblxuXG5cbn1cbnZhciBxdWV1ZSA9IFtdO1xudmFyIGRyYWluaW5nID0gZmFsc2U7XG52YXIgY3VycmVudFF1ZXVlO1xudmFyIHF1ZXVlSW5kZXggPSAtMTtcblxuZnVuY3Rpb24gY2xlYW5VcE5leHRUaWNrKCkge1xuICAgIGlmICghZHJhaW5pbmcgfHwgIWN1cnJlbnRRdWV1ZSkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGRyYWluaW5nID0gZmFsc2U7XG4gICAgaWYgKGN1cnJlbnRRdWV1ZS5sZW5ndGgpIHtcbiAgICAgICAgcXVldWUgPSBjdXJyZW50UXVldWUuY29uY2F0KHF1ZXVlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBxdWV1ZUluZGV4ID0gLTE7XG4gICAgfVxuICAgIGlmIChxdWV1ZS5sZW5ndGgpIHtcbiAgICAgICAgZHJhaW5RdWV1ZSgpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gZHJhaW5RdWV1ZSgpIHtcbiAgICBpZiAoZHJhaW5pbmcpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB2YXIgdGltZW91dCA9IHJ1blRpbWVvdXQoY2xlYW5VcE5leHRUaWNrKTtcbiAgICBkcmFpbmluZyA9IHRydWU7XG5cbiAgICB2YXIgbGVuID0gcXVldWUubGVuZ3RoO1xuICAgIHdoaWxlKGxlbikge1xuICAgICAgICBjdXJyZW50UXVldWUgPSBxdWV1ZTtcbiAgICAgICAgcXVldWUgPSBbXTtcbiAgICAgICAgd2hpbGUgKCsrcXVldWVJbmRleCA8IGxlbikge1xuICAgICAgICAgICAgaWYgKGN1cnJlbnRRdWV1ZSkge1xuICAgICAgICAgICAgICAgIGN1cnJlbnRRdWV1ZVtxdWV1ZUluZGV4XS5ydW4oKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBxdWV1ZUluZGV4ID0gLTE7XG4gICAgICAgIGxlbiA9IHF1ZXVlLmxlbmd0aDtcbiAgICB9XG4gICAgY3VycmVudFF1ZXVlID0gbnVsbDtcbiAgICBkcmFpbmluZyA9IGZhbHNlO1xuICAgIHJ1bkNsZWFyVGltZW91dCh0aW1lb3V0KTtcbn1cblxucHJvY2Vzcy5uZXh0VGljayA9IGZ1bmN0aW9uIChmdW4pIHtcbiAgICB2YXIgYXJncyA9IG5ldyBBcnJheShhcmd1bWVudHMubGVuZ3RoIC0gMSk7XG4gICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPiAxKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAxOyBpIDwgYXJndW1lbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBhcmdzW2kgLSAxXSA9IGFyZ3VtZW50c1tpXTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBxdWV1ZS5wdXNoKG5ldyBJdGVtKGZ1biwgYXJncykpO1xuICAgIGlmIChxdWV1ZS5sZW5ndGggPT09IDEgJiYgIWRyYWluaW5nKSB7XG4gICAgICAgIHJ1blRpbWVvdXQoZHJhaW5RdWV1ZSk7XG4gICAgfVxufTtcblxuLy8gdjggbGlrZXMgcHJlZGljdGlibGUgb2JqZWN0c1xuZnVuY3Rpb24gSXRlbShmdW4sIGFycmF5KSB7XG4gICAgdGhpcy5mdW4gPSBmdW47XG4gICAgdGhpcy5hcnJheSA9IGFycmF5O1xufVxuSXRlbS5wcm90b3R5cGUucnVuID0gZnVuY3Rpb24gKCkge1xuICAgIHRoaXMuZnVuLmFwcGx5KG51bGwsIHRoaXMuYXJyYXkpO1xufTtcbnByb2Nlc3MudGl0bGUgPSAnYnJvd3Nlcic7XG5wcm9jZXNzLmJyb3dzZXIgPSB0cnVlO1xucHJvY2Vzcy5lbnYgPSB7fTtcbnByb2Nlc3MuYXJndiA9IFtdO1xucHJvY2Vzcy52ZXJzaW9uID0gJyc7IC8vIGVtcHR5IHN0cmluZyB0byBhdm9pZCByZWdleHAgaXNzdWVzXG5wcm9jZXNzLnZlcnNpb25zID0ge307XG5cbmZ1bmN0aW9uIG5vb3AoKSB7fVxuXG5wcm9jZXNzLm9uID0gbm9vcDtcbnByb2Nlc3MuYWRkTGlzdGVuZXIgPSBub29wO1xucHJvY2Vzcy5vbmNlID0gbm9vcDtcbnByb2Nlc3Mub2ZmID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlTGlzdGVuZXIgPSBub29wO1xucHJvY2Vzcy5yZW1vdmVBbGxMaXN0ZW5lcnMgPSBub29wO1xucHJvY2Vzcy5lbWl0ID0gbm9vcDtcbnByb2Nlc3MucHJlcGVuZExpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3MucHJlcGVuZE9uY2VMaXN0ZW5lciA9IG5vb3A7XG5cbnByb2Nlc3MubGlzdGVuZXJzID0gZnVuY3Rpb24gKG5hbWUpIHsgcmV0dXJuIFtdIH1cblxucHJvY2Vzcy5iaW5kaW5nID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuYmluZGluZyBpcyBub3Qgc3VwcG9ydGVkJyk7XG59O1xuXG5wcm9jZXNzLmN3ZCA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuICcvJyB9O1xucHJvY2Vzcy5jaGRpciA9IGZ1bmN0aW9uIChkaXIpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuY2hkaXIgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcbnByb2Nlc3MudW1hc2sgPSBmdW5jdGlvbigpIHsgcmV0dXJuIDA7IH07XG4iXX0=

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
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _classCallCheck2 = require('babel-runtime/helpers/classCallCheck');

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _createClass2 = require('babel-runtime/helpers/createClass');

var _createClass3 = _interopRequireDefault(_createClass2);

var _debug = require('debug');

var _debug2 = _interopRequireDefault(_debug);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var log = (0, _debug2.default)('sync');

////// helpers

/**
 * Order min and max attributes.
 *
 * @private
 * @param {Object} that with min and max attributes
 * @returns {Object} with min and man attributes, swapped if that.min > that.max
 */
/**
 * @fileOverview Estimation of a server time from a client time.
 *
 * @see {@link https://hal.archives-ouvertes.fr/hal-01304889v1}
 * Stabilisation added after the article.
 */

function orderMinMax(that) {
  if (typeof that !== 'undefined' && typeof that.min !== 'undefined' && typeof that.max !== 'undefined' && that.min > that.max) {
    var tmp = that.min;
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
function mean(array) {
  var dimension = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;

  return array.reduce(function (p, q) {
    return p + q[dimension];
  }, 0) / array.length;
}

/**
 * Function used to sort long-term data, using first and second dimensions, in
 * that order.
 *
 * @param {Array.<Number>} a
 * @param {Number.<Number>} b
 * @returns {Number} negative if a < b, positive if a > b, or 0
 */
function dataCompare(a, b) {
  return a[0] - b[0] || a[1] - b[1];
}

var SyncClient = function () {
  /**
   * @callback SyncClient~getTimeFunction
   * @return {Number} monotonic, ever increasing, time in second. When possible
   *   the server code should define its own origin (i.e. `time=0`) in order to
   *   maximize the resolution of the clock for a long period of time. When
   *   `SyncServer~start` is called the clock should be running
   *   (cf. `audioContext.currentTime` that needs user interaction to start)
   **/

  /**
   * @callback SyncClient~sendFunction
   * @see {@linkcode SyncServer~receiveFunction}
   * @param {Number} pingId unique identifier
   * @param {Number} clientPingTime time-stamp of ping emission
   **/

  /**
   * @callback SyncClient~receiveFunction
   * @see {@linkcode SyncServer~sendFunction}
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
   * This is the constructor. See {@linkcode SyncClient~start} method to
   * actually start a synchronisation process.
   *
   * @constructs SyncClient
   * @param {SyncClient~getTimeFunction} getTimeFunction
   * @param {Object} [options]
   * @param {Object} [options.pingTimeOutDelay] range of duration (in seconds) to
   * consider a ping was not ponged back
   * @param {Number} [options.pingTimeOutDelay.min=1] min and max must be set together
   * @param {Number} [options.pingTimeOutDelay.max=30] min and max must be set together
   * @param {Number} [options.pingSeriesIterations=10] number of ping-pongs in a
   * series
   * @param {Number} [options.pingSeriesPeriod=0.250] interval (in seconds) between pings
   * in a series
   * @param {Number} [options.pingSeriesDelay] range of interval (in
   * seconds) between ping-pong series
   * @param {Number} [options.pingSeriesDelay.min=10] min and max must be set together
   * @param {Number} [options.pingSeriesDelay.max=20] min and max must be set together
   * @param {Number} [options.longTermDataTrainingDuration=120] duration of
   * training, in seconds, approximately, before using the estimate of
   * clock frequency
   * @param {Number} [options.longTermDataDuration=900] estimate synchronisation over
   *  this duration, in seconds, approximately
   */
  function SyncClient(getTimeFunction) {
    var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    (0, _classCallCheck3.default)(this, SyncClient);

    this.pingTimeoutDelay = options.pingTimeoutDelay || { min: 1, max: 30 };
    orderMinMax(this.pingTimeoutDelay);

    this.pingSeriesIterations = options.pingSeriesIterations || 10;
    this.pingSeriesPeriod = typeof options.pingSeriesPeriod !== 'undefined' ? options.pingSeriesPeriod : 0.250;
    this.pingSeriesDelay = options.pingSeriesDelay || { min: 10, max: 20 };
    orderMinMax(this.pingSeriesDelay);

    this.pingDelay = 0; // current delay before next ping
    this.timeoutId = 0; // to cancel timeout on pong
    this.pingId = 0; // absolute ID to mach pong against

    this.pingSeriesCount = 0; // elapsed pings in a series
    this.seriesData = []; // circular buffer
    this.seriesDataNextIndex = 0; // next index to write in circular buffer
    this.seriesDataLength = this.pingSeriesIterations; // size of circular buffer

    this.longTermDataTrainingDuration = options.longTermDataTrainingDuration || 120;

    // use a fixed-size circular buffer, even if it does not match
    // exactly the required duration
    this.longTermDataDuration = options.longTermDataDuration || 900;
    this.longTermDataLength = Math.max(2, this.longTermDataDuration / (0.5 * (this.pingSeriesDelay.min + this.pingSeriesDelay.max)));

    this.longTermData = []; // circular buffer
    this.longTermDataNextIndex = 0; // next index to write in circular buffer

    this.timeOffset = 0; // mean of (serverTime - clientTime) in the last series
    this.travelDuration = 0;
    this.travelDurationMin = 0;
    this.travelDurationMax = 0;

    // T(t) = T0 + R * (t - t0)
    this.serverTimeReference = 0; // T0
    this.clientTimeReference = 0; // t0
    this.frequencyRatio = 1; // R

    this.pingTimeoutDelay.current = this.pingTimeoutDelay.min;

    this.getTimeFunction = getTimeFunction;

    this.status = 'new';
    this.statusChangedTime = 0;

    this.connectionStatus = 'offline';
    this.connectionStatusChangedTime = 0;
  }

  /**
   * Set status, and set this.statusChangedTime, to later
   * use see {@linkcode SyncClient~getStatusDuration}
   * and {@linkcode SyncClient~reportStatus}.
   *
   * @function SyncClient~setStatus
   * @param {String} status
   * @returns {Object} this
   */


  (0, _createClass3.default)(SyncClient, [{
    key: 'setStatus',
    value: function setStatus(status) {
      if (status !== this.status) {
        this.status = status;
        this.statusChangedTime = this.getLocalTime();
      }
      return this;
    }

    /**
     * Get time since last status change. See {@linkcode SyncClient~setStatus}
     *
     * @function SyncClient~getStatusDuration
     * @returns {Number} time, in seconds, since last status change.
     */

  }, {
    key: 'getStatusDuration',
    value: function getStatusDuration() {
      return Math.max(0, this.getLocalTime() - this.statusChangedTime);
    }

    /**
     * Set connectionStatus, and set this.connectionStatusChangedTime,
     * to later use see {@linkcode SyncClient~getConnectionStatusDuration}
     * and {@linkcode SyncClient~reportStatus}.
     *
     * @function SyncClient~setConnectionStatus
     * @param {String} connectionStatus
     * @returns {Object} this
     */

  }, {
    key: 'setConnectionStatus',
    value: function setConnectionStatus(connectionStatus) {
      if (connectionStatus !== this.connectionStatus) {
        this.connectionStatus = connectionStatus;
        this.connectionStatusChangedTime = this.getLocalTime();
      }
      return this;
    }

    /**
     * Get time since last connectionStatus change.
     * See {@linkcode SyncClient~setConnectionStatus}
     *
     * @function SyncClient~getConnectionStatusDuration
     * @returns {Number} time, in seconds, since last connectionStatus change.
     */

  }, {
    key: 'getConnectionStatusDuration',
    value: function getConnectionStatusDuration() {
      return Math.max(0, this.getLocalTime() - this.connectionStatusChangedTime);
    }

    /**
     * Report the status of the synchronisation process, if
     * reportFunction is defined.
     *
     * @function SyncClient~reportStatus
     * @param {SyncClient~reportFunction} reportFunction
     */

  }, {
    key: 'reportStatus',
    value: function reportStatus(reportFunction) {
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
     * @function SyncClient~__syncLoop
     * @param {SyncClient~sendFunction} sendFunction
     * @param {SyncClient~reportFunction} reportFunction
     */

  }, {
    key: '__syncLoop',
    value: function __syncLoop(sendFunction, reportFunction) {
      var _this = this;

      clearTimeout(this.timeoutId);
      ++this.pingId;
      sendFunction(this.pingId, this.getLocalTime());

      this.timeoutId = setTimeout(function () {
        // increase timeout duration on timeout, to avoid overflow
        _this.pingTimeoutDelay.current = Math.min(_this.pingTimeoutDelay.current * 2, _this.pingTimeoutDelay.max);
        log('sync:ping timeout > %s', _this.pingTimeoutDelay.current);
        _this.setConnectionStatus('offline');
        _this.reportStatus(reportFunction);
        // retry (yes, always increment pingId)
        _this.__syncLoop(sendFunction, reportFunction);
      }, Math.ceil(1000 * this.pingTimeoutDelay.current));
    }

    /**
     * Start a synchronisation process by registering the receive
     * function passed as second parameter. Then, send regular messages
     * to the server, using the send function passed as first parameter.
     *
     * @function SyncClient~start
     * @param {SyncClient~sendFunction} sendFunction
     * @param {SyncClient~receiveFunction} receiveFunction to register
     * @param {SyncClient~reportFunction} reportFunction if defined, is called to
     *   report the status, on each status change
     */

  }, {
    key: 'start',
    value: function start(sendFunction, receiveFunction, reportFunction) {
      var _this2 = this;

      this.setStatus('startup');
      this.setConnectionStatus('offline');

      this.seriesData = [];
      this.seriesDataNextIndex = 0;

      this.longTermData = [];
      this.longTermDataNextIndex = 0;

      receiveFunction(function (pingId, clientPingTime, serverPingTime, serverPongTime) {
        // accept only the pong that corresponds to the last ping
        if (pingId === _this2.pingId) {
          ++_this2.pingSeriesCount;
          clearTimeout(_this2.timeoutId);
          _this2.setConnectionStatus('online');
          // reduce timeout duration on pong, for better reactivity
          _this2.pingTimeoutDelay.current = Math.max(_this2.pingTimeoutDelay.current * 0.75, _this2.pingTimeoutDelay.min);

          // time-differences are valid on a single-side only (client or server)
          var clientPongTime = _this2.getLocalTime();
          var clientTime = 0.5 * (clientPongTime + clientPingTime);
          var serverTime = 0.5 * (serverPongTime + serverPingTime);
          var travelDuration = Math.max(0, clientPongTime - clientPingTime - (serverPongTime - serverPingTime));
          var offsetTime = serverTime - clientTime;

          // order is important for sorting, later.
          _this2.seriesData[_this2.seriesDataNextIndex] = [travelDuration, offsetTime, clientTime, serverTime];
          _this2.seriesDataNextIndex = ++_this2.seriesDataNextIndex % _this2.seriesDataLength;

          // log('ping %s, travel = %s, offset = %s, client = %s, server = %s',
          //       pingId, travelDuration, offsetTime, clientTime, serverTime);

          // end of a series
          if (_this2.pingSeriesCount >= _this2.pingSeriesIterations && _this2.seriesData.length >= _this2.seriesDataLength) {
            // plan the begining of the next series
            _this2.pingDelay = _this2.pingSeriesDelay.min + Math.random() * (_this2.pingSeriesDelay.max - _this2.pingSeriesDelay.min);
            _this2.pingSeriesCount = 0;

            // sort by travel time first, then offset time.
            var sorted = _this2.seriesData.slice(0).sort(dataCompare);

            var seriesTravelDuration = sorted[0][0];

            // When the clock tick is long enough,
            // some travel times (dimension 0) might be identical.
            // Then, use the offset median (dimension 1 is the second sort key)
            // of shortest travel duration
            var quick = 0;
            while (quick < sorted.length && sorted[quick][0] <= seriesTravelDuration * 1.01) {
              ++quick;
            }
            quick = Math.max(0, quick - 1);
            var median = Math.floor(quick / 2);

            var seriesClientTime = sorted[median][2];
            var seriesServerTime = sorted[median][3];
            var seriesClientSquaredTime = seriesClientTime * seriesClientTime;
            var seriesClientServerTime = seriesClientTime * seriesServerTime;

            _this2.longTermData[_this2.longTermDataNextIndex] = [seriesTravelDuration, seriesClientTime, seriesServerTime, seriesClientSquaredTime, seriesClientServerTime];
            _this2.longTermDataNextIndex = ++_this2.longTermDataNextIndex % _this2.longTermDataLength;

            // mean of the time offset over 3 samples around median
            // (limited to shortest travel duration)
            var aroundMedian = sorted.slice(Math.max(0, median - 1), Math.min(quick, median + 1) + 1);
            _this2.timeOffset = mean(aroundMedian, 1);

            if (_this2.status === 'startup' || _this2.status === 'training' && _this2.getStatusDuration() < _this2.longTermDataTrainingDuration) {
              // set only the phase offset, not the frequency
              _this2.serverTimeReference = _this2.timeOffset;
              _this2.clientTimeReference = 0;
              _this2.frequencyRatio = 1;
              _this2.setStatus('training');
              log('T = %s + %s * (%s - %s) = %s', _this2.serverTimeReference, _this2.frequencyRatio, seriesClientTime, _this2.clientTimeReference, _this2.getSyncTime(seriesClientTime));
            }

            if (_this2.status === 'training' && _this2.getStatusDuration() >= _this2.longTermDataTrainingDuration || _this2.status === 'sync') {
              // linear regression, R = covariance(t,T) / variance(t)
              var regClientTime = mean(_this2.longTermData, 1);
              var regServerTime = mean(_this2.longTermData, 2);
              var regClientSquaredTime = mean(_this2.longTermData, 3);
              var regClientServerTime = mean(_this2.longTermData, 4);

              var covariance = regClientServerTime - regClientTime * regServerTime;
              var variance = regClientSquaredTime - regClientTime * regClientTime;
              if (variance > 0) {
                // update freq and shift
                _this2.frequencyRatio = covariance / variance;
                _this2.clientTimeReference = regClientTime;
                _this2.serverTimeReference = regServerTime;

                // 0.05% is a lot (500 PPM, like an old mechanical clock)
                if (_this2.frequencyRatio > 0.9995 && _this2.frequencyRatio < 1.0005) {
                  _this2.setStatus('sync');
                } else {
                  log('clock frequency ratio out of sync: %s, training again', _this2.frequencyRatio);
                  // start the training again from the last series
                  _this2.serverTimeReference = _this2.timeOffset; // offset only
                  _this2.clientTimeReference = 0;
                  _this2.frequencyRatio = 1;
                  _this2.setStatus('training');

                  _this2.longTermData[0] = [seriesTravelDuration, seriesClientTime, seriesServerTime, seriesClientSquaredTime, seriesClientServerTime];
                  _this2.longTermData.length = 1;
                  _this2.longTermDataNextIndex = 1;
                }
              }

              log('T = %s + %s * (%s - %s) = %s', _this2.serverTimeReference, _this2.frequencyRatio, seriesClientTime, _this2.clientTimeReference, _this2.getSyncTime(seriesClientTime));
            }

            _this2.travelDuration = mean(sorted, 0);
            _this2.travelDurationMin = sorted[0][0];
            _this2.travelDurationMax = sorted[sorted.length - 1][0];

            _this2.reportStatus(reportFunction);
          } else {
            // we are in a series, use the pingInterval value
            _this2.pingDelay = _this2.pingSeriesPeriod;
          }

          _this2.timeoutId = setTimeout(function () {
            _this2.__syncLoop(sendFunction, reportFunction);
          }, Math.ceil(1000 * _this2.pingDelay));
        } // ping and pong ID match
      }); // receive function

      this.__syncLoop(sendFunction, reportFunction);
    }

    /**
     * Get local time, or convert a synchronised time to a local time.
     *
     * @function SyncClient~getLocalTime
     * @param {Number} syncTime undefined to get local time
     * @returns {Number} local time, in seconds
     */

  }, {
    key: 'getLocalTime',
    value: function getLocalTime(syncTime) {
      if (typeof syncTime !== 'undefined') {
        // conversion: t(T) = t0 + (T - T0) / R
        return this.clientTimeReference + (syncTime - this.serverTimeReference) / this.frequencyRatio;
      } else {
        // read local clock
        return this.getTimeFunction();
      }
    }

    /**
     * Get synchronised time, or convert a local time to a synchronised time.
     *
     * @function SyncClient~getSyncTime
     * @param {Number} localTime undefined to get synchronised time
     * @returns {Number} synchronised time, in seconds.
     */

  }, {
    key: 'getSyncTime',
    value: function getSyncTime() {
      var localTime = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : this.getLocalTime();

      // always convert: T(t) = T0 + R * (t - t0)
      return this.serverTimeReference + this.frequencyRatio * (localTime - this.clientTimeReference);
    }
  }]);
  return SyncClient;
}();

exports.default = SyncClient;

},{"babel-runtime/helpers/classCallCheck":7,"babel-runtime/helpers/createClass":8,"debug":28}],3:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _index = require('./client/index');

Object.defineProperty(exports, 'SyncClient', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_index).default;
  }
});

var _index2 = require('./server/index');

Object.defineProperty(exports, 'SyncServer', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_index2).default;
  }
});

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

},{"./client/index":2,"./server/index":4}],4:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _classCallCheck2 = require('babel-runtime/helpers/classCallCheck');

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _createClass2 = require('babel-runtime/helpers/createClass');

var _createClass3 = _interopRequireDefault(_createClass2);

var _debug = require('debug');

var _debug2 = _interopRequireDefault(_debug);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var log = (0, _debug2.default)('sync');

var SyncServer = function () {
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
   * @see {@linkcode SyncClient~receiveFunction}
   * @param {Number} pingId unique identifier
   * @param {Number} clientPingTime time-stamp of ping emission
   * @param {Number} serverPingTime time-stamp of ping reception
   * @param {Number} serverPongTime time-stamp of pong emission
   **/

  /**
   * @callback SyncServer~receiveFunction
   * @see {@linkcode SyncClient~sendFunction}
   * @param {SyncServer~receiveCallback} receiveCallback called on
   * each message matching messageType.
   **/

  /**
   * @callback SyncServer~receiveCallback
   * @param {Number} pingId unique identifier
   * @param {Number} clientPingTime time-stamp of ping emission
   **/

  /**
   * This is the constructor. See {@linkcode SyncServer~start} method to
   * actually start a synchronisation process.
   *
   * @constructs SyncServer
   * @param {SyncServer~getTimeFunction} getTimeFunction called to get the local
   * time. It must return a time in seconds, monotonic, ever
   * increasing.
   */
  function SyncServer(getTimeFunction) {
    (0, _classCallCheck3.default)(this, SyncServer);

    this.getTimeFunction = getTimeFunction;
  }

  /**
   * Start a synchronisation process by registering the receive
   * function passed as second parameter. On each received message,
   * send a reply using the function passed as first parameter.
   *
   * @function SyncServer~start
   * @param {SyncServer~sendFunction} sendFunction
   * @param {SyncServer~receiveFunction} receiveFunction
   */


  (0, _createClass3.default)(SyncServer, [{
    key: 'start',
    value: function start(sendFunction, receiveFunction) {
      var _this = this;

      receiveFunction(function (id, clientPingTime) {
        var serverPingTime = _this.getLocalTime();
        // with this algorithm, the dual call to `getLocalTime` can appear
        // non-necessary, however keeping this can allow to implement other
        // algorithms while keeping the API unchanged, thus making easier
        // to implement and compare several algorithms.
        sendFunction(id, clientPingTime, serverPingTime, _this.getLocalTime());
        // log('ping: %s, %s, %s', id, clientPingTime, serverPingTime);
      });

      // return some handle that would allow to clean memory ?
    }

    /**
     * Get local time, or convert a synchronised time to a local time.
     *
     * @function SyncServer~getLocalTime
     * @param {Number} syncTime undefined to get local time
     * @returns {Number} local time, in seconds
     */

  }, {
    key: 'getLocalTime',
    value: function getLocalTime(syncTime) {
      if (typeof syncTime !== 'undefined') {
        return syncTime; // sync time is local: no conversion
      } else {
        return this.getTimeFunction();
      }
    }

    /**
     * Get synchronised time, or convert a local time to a synchronised time.
     *
     * @function SyncServer~getSyncTime
     * @param {Number} localTime undefined to get synchronised time
     * @returns {Number} synchronised time, in seconds.
     */

  }, {
    key: 'getSyncTime',
    value: function getSyncTime(localTime) {
      return this.getLocalTime(localTime); // sync time is local, here
    }
  }]);
  return SyncServer;
}();

exports.default = SyncServer;

},{"babel-runtime/helpers/classCallCheck":7,"babel-runtime/helpers/createClass":8,"debug":28}],5:[function(require,module,exports){
module.exports = { "default": require("core-js/library/fn/json/stringify"), __esModule: true };
},{"core-js/library/fn/json/stringify":9}],6:[function(require,module,exports){
module.exports = { "default": require("core-js/library/fn/object/define-property"), __esModule: true };
},{"core-js/library/fn/object/define-property":10}],7:[function(require,module,exports){
"use strict";

exports.__esModule = true;

exports.default = function (instance, Constructor) {
  if (!(instance instanceof Constructor)) {
    throw new TypeError("Cannot call a class as a function");
  }
};
},{}],8:[function(require,module,exports){
"use strict";

exports.__esModule = true;

var _defineProperty = require("../core-js/object/define-property");

var _defineProperty2 = _interopRequireDefault(_defineProperty);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

exports.default = function () {
  function defineProperties(target, props) {
    for (var i = 0; i < props.length; i++) {
      var descriptor = props[i];
      descriptor.enumerable = descriptor.enumerable || false;
      descriptor.configurable = true;
      if ("value" in descriptor) descriptor.writable = true;
      (0, _defineProperty2.default)(target, descriptor.key, descriptor);
    }
  }

  return function (Constructor, protoProps, staticProps) {
    if (protoProps) defineProperties(Constructor.prototype, protoProps);
    if (staticProps) defineProperties(Constructor, staticProps);
    return Constructor;
  };
}();
},{"../core-js/object/define-property":6}],9:[function(require,module,exports){
var core = require('../../modules/_core');
var $JSON = core.JSON || (core.JSON = { stringify: JSON.stringify });
module.exports = function stringify(it) { // eslint-disable-line no-unused-vars
  return $JSON.stringify.apply($JSON, arguments);
};

},{"../../modules/_core":13}],10:[function(require,module,exports){
require('../../modules/es6.object.define-property');
var $Object = require('../../modules/_core').Object;
module.exports = function defineProperty(it, key, desc) {
  return $Object.defineProperty(it, key, desc);
};

},{"../../modules/_core":13,"../../modules/es6.object.define-property":27}],11:[function(require,module,exports){
module.exports = function (it) {
  if (typeof it != 'function') throw TypeError(it + ' is not a function!');
  return it;
};

},{}],12:[function(require,module,exports){
var isObject = require('./_is-object');
module.exports = function (it) {
  if (!isObject(it)) throw TypeError(it + ' is not an object!');
  return it;
};

},{"./_is-object":23}],13:[function(require,module,exports){
var core = module.exports = { version: '2.6.12' };
if (typeof __e == 'number') __e = core; // eslint-disable-line no-undef

},{}],14:[function(require,module,exports){
// optional / simple context binding
var aFunction = require('./_a-function');
module.exports = function (fn, that, length) {
  aFunction(fn);
  if (that === undefined) return fn;
  switch (length) {
    case 1: return function (a) {
      return fn.call(that, a);
    };
    case 2: return function (a, b) {
      return fn.call(that, a, b);
    };
    case 3: return function (a, b, c) {
      return fn.call(that, a, b, c);
    };
  }
  return function (/* ...args */) {
    return fn.apply(that, arguments);
  };
};

},{"./_a-function":11}],15:[function(require,module,exports){
// Thank's IE8 for his funny defineProperty
module.exports = !require('./_fails')(function () {
  return Object.defineProperty({}, 'a', { get: function () { return 7; } }).a != 7;
});

},{"./_fails":18}],16:[function(require,module,exports){
var isObject = require('./_is-object');
var document = require('./_global').document;
// typeof document.createElement is 'object' in old IE
var is = isObject(document) && isObject(document.createElement);
module.exports = function (it) {
  return is ? document.createElement(it) : {};
};

},{"./_global":19,"./_is-object":23}],17:[function(require,module,exports){
var global = require('./_global');
var core = require('./_core');
var ctx = require('./_ctx');
var hide = require('./_hide');
var has = require('./_has');
var PROTOTYPE = 'prototype';

var $export = function (type, name, source) {
  var IS_FORCED = type & $export.F;
  var IS_GLOBAL = type & $export.G;
  var IS_STATIC = type & $export.S;
  var IS_PROTO = type & $export.P;
  var IS_BIND = type & $export.B;
  var IS_WRAP = type & $export.W;
  var exports = IS_GLOBAL ? core : core[name] || (core[name] = {});
  var expProto = exports[PROTOTYPE];
  var target = IS_GLOBAL ? global : IS_STATIC ? global[name] : (global[name] || {})[PROTOTYPE];
  var key, own, out;
  if (IS_GLOBAL) source = name;
  for (key in source) {
    // contains in native
    own = !IS_FORCED && target && target[key] !== undefined;
    if (own && has(exports, key)) continue;
    // export native or passed
    out = own ? target[key] : source[key];
    // prevent global pollution for namespaces
    exports[key] = IS_GLOBAL && typeof target[key] != 'function' ? source[key]
    // bind timers to global for call from export context
    : IS_BIND && own ? ctx(out, global)
    // wrap global constructors for prevent change them in library
    : IS_WRAP && target[key] == out ? (function (C) {
      var F = function (a, b, c) {
        if (this instanceof C) {
          switch (arguments.length) {
            case 0: return new C();
            case 1: return new C(a);
            case 2: return new C(a, b);
          } return new C(a, b, c);
        } return C.apply(this, arguments);
      };
      F[PROTOTYPE] = C[PROTOTYPE];
      return F;
    // make static versions for prototype methods
    })(out) : IS_PROTO && typeof out == 'function' ? ctx(Function.call, out) : out;
    // export proto methods to core.%CONSTRUCTOR%.methods.%NAME%
    if (IS_PROTO) {
      (exports.virtual || (exports.virtual = {}))[key] = out;
      // export proto methods to core.%CONSTRUCTOR%.prototype.%NAME%
      if (type & $export.R && expProto && !expProto[key]) hide(expProto, key, out);
    }
  }
};
// type bitmap
$export.F = 1;   // forced
$export.G = 2;   // global
$export.S = 4;   // static
$export.P = 8;   // proto
$export.B = 16;  // bind
$export.W = 32;  // wrap
$export.U = 64;  // safe
$export.R = 128; // real proto method for `library`
module.exports = $export;

},{"./_core":13,"./_ctx":14,"./_global":19,"./_has":20,"./_hide":21}],18:[function(require,module,exports){
module.exports = function (exec) {
  try {
    return !!exec();
  } catch (e) {
    return true;
  }
};

},{}],19:[function(require,module,exports){
// https://github.com/zloirock/core-js/issues/86#issuecomment-115759028
var global = module.exports = typeof window != 'undefined' && window.Math == Math
  ? window : typeof self != 'undefined' && self.Math == Math ? self
  // eslint-disable-next-line no-new-func
  : Function('return this')();
if (typeof __g == 'number') __g = global; // eslint-disable-line no-undef

},{}],20:[function(require,module,exports){
var hasOwnProperty = {}.hasOwnProperty;
module.exports = function (it, key) {
  return hasOwnProperty.call(it, key);
};

},{}],21:[function(require,module,exports){
var dP = require('./_object-dp');
var createDesc = require('./_property-desc');
module.exports = require('./_descriptors') ? function (object, key, value) {
  return dP.f(object, key, createDesc(1, value));
} : function (object, key, value) {
  object[key] = value;
  return object;
};

},{"./_descriptors":15,"./_object-dp":24,"./_property-desc":25}],22:[function(require,module,exports){
module.exports = !require('./_descriptors') && !require('./_fails')(function () {
  return Object.defineProperty(require('./_dom-create')('div'), 'a', { get: function () { return 7; } }).a != 7;
});

},{"./_descriptors":15,"./_dom-create":16,"./_fails":18}],23:[function(require,module,exports){
module.exports = function (it) {
  return typeof it === 'object' ? it !== null : typeof it === 'function';
};

},{}],24:[function(require,module,exports){
var anObject = require('./_an-object');
var IE8_DOM_DEFINE = require('./_ie8-dom-define');
var toPrimitive = require('./_to-primitive');
var dP = Object.defineProperty;

exports.f = require('./_descriptors') ? Object.defineProperty : function defineProperty(O, P, Attributes) {
  anObject(O);
  P = toPrimitive(P, true);
  anObject(Attributes);
  if (IE8_DOM_DEFINE) try {
    return dP(O, P, Attributes);
  } catch (e) { /* empty */ }
  if ('get' in Attributes || 'set' in Attributes) throw TypeError('Accessors not supported!');
  if ('value' in Attributes) O[P] = Attributes.value;
  return O;
};

},{"./_an-object":12,"./_descriptors":15,"./_ie8-dom-define":22,"./_to-primitive":26}],25:[function(require,module,exports){
module.exports = function (bitmap, value) {
  return {
    enumerable: !(bitmap & 1),
    configurable: !(bitmap & 2),
    writable: !(bitmap & 4),
    value: value
  };
};

},{}],26:[function(require,module,exports){
// 7.1.1 ToPrimitive(input [, PreferredType])
var isObject = require('./_is-object');
// instead of the ES6 spec version, we didn't implement @@toPrimitive case
// and the second argument - flag - preferred type is a string
module.exports = function (it, S) {
  if (!isObject(it)) return it;
  var fn, val;
  if (S && typeof (fn = it.toString) == 'function' && !isObject(val = fn.call(it))) return val;
  if (typeof (fn = it.valueOf) == 'function' && !isObject(val = fn.call(it))) return val;
  if (!S && typeof (fn = it.toString) == 'function' && !isObject(val = fn.call(it))) return val;
  throw TypeError("Can't convert object to primitive value");
};

},{"./_is-object":23}],27:[function(require,module,exports){
var $export = require('./_export');
// 19.1.2.4 / 15.2.3.6 Object.defineProperty(O, P, Attributes)
$export($export.S + $export.F * !require('./_descriptors'), 'Object', { defineProperty: require('./_object-dp').f });

},{"./_descriptors":15,"./_export":17,"./_object-dp":24}],28:[function(require,module,exports){
(function (process){(function (){
/**
 * This is the web browser implementation of `debug()`.
 *
 * Expose `debug()` as the module.
 */

exports = module.exports = require('./debug');
exports.log = log;
exports.formatArgs = formatArgs;
exports.save = save;
exports.load = load;
exports.useColors = useColors;
exports.storage = 'undefined' != typeof chrome
               && 'undefined' != typeof chrome.storage
                  ? chrome.storage.local
                  : localstorage();

/**
 * Colors.
 */

exports.colors = [
  '#0000CC', '#0000FF', '#0033CC', '#0033FF', '#0066CC', '#0066FF', '#0099CC',
  '#0099FF', '#00CC00', '#00CC33', '#00CC66', '#00CC99', '#00CCCC', '#00CCFF',
  '#3300CC', '#3300FF', '#3333CC', '#3333FF', '#3366CC', '#3366FF', '#3399CC',
  '#3399FF', '#33CC00', '#33CC33', '#33CC66', '#33CC99', '#33CCCC', '#33CCFF',
  '#6600CC', '#6600FF', '#6633CC', '#6633FF', '#66CC00', '#66CC33', '#9900CC',
  '#9900FF', '#9933CC', '#9933FF', '#99CC00', '#99CC33', '#CC0000', '#CC0033',
  '#CC0066', '#CC0099', '#CC00CC', '#CC00FF', '#CC3300', '#CC3333', '#CC3366',
  '#CC3399', '#CC33CC', '#CC33FF', '#CC6600', '#CC6633', '#CC9900', '#CC9933',
  '#CCCC00', '#CCCC33', '#FF0000', '#FF0033', '#FF0066', '#FF0099', '#FF00CC',
  '#FF00FF', '#FF3300', '#FF3333', '#FF3366', '#FF3399', '#FF33CC', '#FF33FF',
  '#FF6600', '#FF6633', '#FF9900', '#FF9933', '#FFCC00', '#FFCC33'
];

/**
 * Currently only WebKit-based Web Inspectors, Firefox >= v31,
 * and the Firebug extension (any Firefox version) are known
 * to support "%c" CSS customizations.
 *
 * TODO: add a `localStorage` variable to explicitly enable/disable colors
 */

function useColors() {
  // NB: In an Electron preload script, document will be defined but not fully
  // initialized. Since we know we're in Chrome, we'll just detect this case
  // explicitly
  if (typeof window !== 'undefined' && window.process && window.process.type === 'renderer') {
    return true;
  }

  // Internet Explorer and Edge do not support colors.
  if (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/(edge|trident)\/(\d+)/)) {
    return false;
  }

  // is webkit? http://stackoverflow.com/a/16459606/376773
  // document is undefined in react-native: https://github.com/facebook/react-native/pull/1632
  return (typeof document !== 'undefined' && document.documentElement && document.documentElement.style && document.documentElement.style.WebkitAppearance) ||
    // is firebug? http://stackoverflow.com/a/398120/376773
    (typeof window !== 'undefined' && window.console && (window.console.firebug || (window.console.exception && window.console.table))) ||
    // is firefox >= v31?
    // https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
    (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/) && parseInt(RegExp.$1, 10) >= 31) ||
    // double check webkit in userAgent just in case we are in a worker
    (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/));
}

/**
 * Map %j to `JSON.stringify()`, since no Web Inspectors do that by default.
 */

exports.formatters.j = function(v) {
  try {
    return JSON.stringify(v);
  } catch (err) {
    return '[UnexpectedJSONParseError]: ' + err.message;
  }
};


/**
 * Colorize log arguments if enabled.
 *
 * @api public
 */

function formatArgs(args) {
  var useColors = this.useColors;

  args[0] = (useColors ? '%c' : '')
    + this.namespace
    + (useColors ? ' %c' : ' ')
    + args[0]
    + (useColors ? '%c ' : ' ')
    + '+' + exports.humanize(this.diff);

  if (!useColors) return;

  var c = 'color: ' + this.color;
  args.splice(1, 0, c, 'color: inherit')

  // the final "%c" is somewhat tricky, because there could be other
  // arguments passed either before or after the %c, so we need to
  // figure out the correct index to insert the CSS into
  var index = 0;
  var lastC = 0;
  args[0].replace(/%[a-zA-Z%]/g, function(match) {
    if ('%%' === match) return;
    index++;
    if ('%c' === match) {
      // we only are interested in the *last* %c
      // (the user may have provided their own)
      lastC = index;
    }
  });

  args.splice(lastC, 0, c);
}

/**
 * Invokes `console.log()` when available.
 * No-op when `console.log` is not a "function".
 *
 * @api public
 */

function log() {
  // this hackery is required for IE8/9, where
  // the `console.log` function doesn't have 'apply'
  return 'object' === typeof console
    && console.log
    && Function.prototype.apply.call(console.log, console, arguments);
}

/**
 * Save `namespaces`.
 *
 * @param {String} namespaces
 * @api private
 */

function save(namespaces) {
  try {
    if (null == namespaces) {
      exports.storage.removeItem('debug');
    } else {
      exports.storage.debug = namespaces;
    }
  } catch(e) {}
}

/**
 * Load `namespaces`.
 *
 * @return {String} returns the previously persisted debug modes
 * @api private
 */

function load() {
  var r;
  try {
    r = exports.storage.debug;
  } catch(e) {}

  // If debug isn't set in LS, and we're in Electron, try to load $DEBUG
  if (!r && typeof process !== 'undefined' && 'env' in process) {
    r = process.env.DEBUG;
  }

  return r;
}

/**
 * Enable namespaces listed in `localStorage.debug` initially.
 */

exports.enable(load());

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
    return window.localStorage;
  } catch (e) {}
}

}).call(this)}).call(this,require('_process'))

},{"./debug":29,"_process":31}],29:[function(require,module,exports){

/**
 * This is the common logic for both the Node.js and web browser
 * implementations of `debug()`.
 *
 * Expose `debug()` as the module.
 */

exports = module.exports = createDebug.debug = createDebug['default'] = createDebug;
exports.coerce = coerce;
exports.disable = disable;
exports.enable = enable;
exports.enabled = enabled;
exports.humanize = require('ms');

/**
 * Active `debug` instances.
 */
exports.instances = [];

/**
 * The currently active debug mode names, and names to skip.
 */

exports.names = [];
exports.skips = [];

/**
 * Map of special "%n" handling functions, for the debug "format" argument.
 *
 * Valid key names are a single, lower or upper-case letter, i.e. "n" and "N".
 */

exports.formatters = {};

/**
 * Select a color.
 * @param {String} namespace
 * @return {Number}
 * @api private
 */

function selectColor(namespace) {
  var hash = 0, i;

  for (i in namespace) {
    hash  = ((hash << 5) - hash) + namespace.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }

  return exports.colors[Math.abs(hash) % exports.colors.length];
}

/**
 * Create a debugger with the given `namespace`.
 *
 * @param {String} namespace
 * @return {Function}
 * @api public
 */

function createDebug(namespace) {

  var prevTime;

  function debug() {
    // disabled?
    if (!debug.enabled) return;

    var self = debug;

    // set `diff` timestamp
    var curr = +new Date();
    var ms = curr - (prevTime || curr);
    self.diff = ms;
    self.prev = prevTime;
    self.curr = curr;
    prevTime = curr;

    // turn the `arguments` into a proper Array
    var args = new Array(arguments.length);
    for (var i = 0; i < args.length; i++) {
      args[i] = arguments[i];
    }

    args[0] = exports.coerce(args[0]);

    if ('string' !== typeof args[0]) {
      // anything else let's inspect with %O
      args.unshift('%O');
    }

    // apply any `formatters` transformations
    var index = 0;
    args[0] = args[0].replace(/%([a-zA-Z%])/g, function(match, format) {
      // if we encounter an escaped % then don't increase the array index
      if (match === '%%') return match;
      index++;
      var formatter = exports.formatters[format];
      if ('function' === typeof formatter) {
        var val = args[index];
        match = formatter.call(self, val);

        // now we need to remove `args[index]` since it's inlined in the `format`
        args.splice(index, 1);
        index--;
      }
      return match;
    });

    // apply env-specific formatting (colors, etc.)
    exports.formatArgs.call(self, args);

    var logFn = debug.log || exports.log || console.log.bind(console);
    logFn.apply(self, args);
  }

  debug.namespace = namespace;
  debug.enabled = exports.enabled(namespace);
  debug.useColors = exports.useColors();
  debug.color = selectColor(namespace);
  debug.destroy = destroy;

  // env-specific initialization logic for debug instances
  if ('function' === typeof exports.init) {
    exports.init(debug);
  }

  exports.instances.push(debug);

  return debug;
}

function destroy () {
  var index = exports.instances.indexOf(this);
  if (index !== -1) {
    exports.instances.splice(index, 1);
    return true;
  } else {
    return false;
  }
}

/**
 * Enables a debug mode by namespaces. This can include modes
 * separated by a colon and wildcards.
 *
 * @param {String} namespaces
 * @api public
 */

function enable(namespaces) {
  exports.save(namespaces);

  exports.names = [];
  exports.skips = [];

  var i;
  var split = (typeof namespaces === 'string' ? namespaces : '').split(/[\s,]+/);
  var len = split.length;

  for (i = 0; i < len; i++) {
    if (!split[i]) continue; // ignore empty strings
    namespaces = split[i].replace(/\*/g, '.*?');
    if (namespaces[0] === '-') {
      exports.skips.push(new RegExp('^' + namespaces.substr(1) + '$'));
    } else {
      exports.names.push(new RegExp('^' + namespaces + '$'));
    }
  }

  for (i = 0; i < exports.instances.length; i++) {
    var instance = exports.instances[i];
    instance.enabled = exports.enabled(instance.namespace);
  }
}

/**
 * Disable debug output.
 *
 * @api public
 */

function disable() {
  exports.enable('');
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
  var i, len;
  for (i = 0, len = exports.skips.length; i < len; i++) {
    if (exports.skips[i].test(name)) {
      return false;
    }
  }
  for (i = 0, len = exports.names.length; i < len; i++) {
    if (exports.names[i].test(name)) {
      return true;
    }
  }
  return false;
}

/**
 * Coerce `val`.
 *
 * @param {Mixed} val
 * @return {Mixed}
 * @api private
 */

function coerce(val) {
  if (val instanceof Error) return val.stack || val.message;
  return val;
}

},{"ms":30}],30:[function(require,module,exports){
/**
 * Helpers.
 */

var s = 1000;
var m = s * 60;
var h = m * 60;
var d = h * 24;
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
  } else if (type === 'number' && isNaN(val) === false) {
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
  var match = /^((?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|years?|yrs?|y)?$/i.exec(
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
  if (ms >= d) {
    return Math.round(ms / d) + 'd';
  }
  if (ms >= h) {
    return Math.round(ms / h) + 'h';
  }
  if (ms >= m) {
    return Math.round(ms / m) + 'm';
  }
  if (ms >= s) {
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
  return plural(ms, d, 'day') ||
    plural(ms, h, 'hour') ||
    plural(ms, m, 'minute') ||
    plural(ms, s, 'second') ||
    ms + ' ms';
}

/**
 * Pluralization helper.
 */

function plural(ms, n, name) {
  if (ms < n) {
    return;
  }
  if (ms < n * 1.5) {
    return Math.floor(ms / n) + ' ' + name;
  }
  return Math.ceil(ms / n) + ' ' + name + 's';
}

},{}],31:[function(require,module,exports){
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJkaXN0L2NsaWVudC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9AaXJjYW0vc3luYy9jbGllbnQvaW5kZXguanMiLCJub2RlX21vZHVsZXMvQGlyY2FtL3N5bmMvaW5kZXguanMiLCJub2RlX21vZHVsZXMvQGlyY2FtL3N5bmMvc2VydmVyL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2JhYmVsLXJ1bnRpbWUvY29yZS1qcy9qc29uL3N0cmluZ2lmeS5qcyIsIm5vZGVfbW9kdWxlcy9iYWJlbC1ydW50aW1lL2NvcmUtanMvb2JqZWN0L2RlZmluZS1wcm9wZXJ0eS5qcyIsIm5vZGVfbW9kdWxlcy9iYWJlbC1ydW50aW1lL2hlbHBlcnMvY2xhc3NDYWxsQ2hlY2suanMiLCJub2RlX21vZHVsZXMvYmFiZWwtcnVudGltZS9oZWxwZXJzL2NyZWF0ZUNsYXNzLmpzIiwibm9kZV9tb2R1bGVzL2NvcmUtanMvbGlicmFyeS9mbi9qc29uL3N0cmluZ2lmeS5qcyIsIm5vZGVfbW9kdWxlcy9jb3JlLWpzL2xpYnJhcnkvZm4vb2JqZWN0L2RlZmluZS1wcm9wZXJ0eS5qcyIsIm5vZGVfbW9kdWxlcy9jb3JlLWpzL2xpYnJhcnkvbW9kdWxlcy9fYS1mdW5jdGlvbi5qcyIsIm5vZGVfbW9kdWxlcy9jb3JlLWpzL2xpYnJhcnkvbW9kdWxlcy9fYW4tb2JqZWN0LmpzIiwibm9kZV9tb2R1bGVzL2NvcmUtanMvbGlicmFyeS9tb2R1bGVzL19jb3JlLmpzIiwibm9kZV9tb2R1bGVzL2NvcmUtanMvbGlicmFyeS9tb2R1bGVzL19jdHguanMiLCJub2RlX21vZHVsZXMvY29yZS1qcy9saWJyYXJ5L21vZHVsZXMvX2Rlc2NyaXB0b3JzLmpzIiwibm9kZV9tb2R1bGVzL2NvcmUtanMvbGlicmFyeS9tb2R1bGVzL19kb20tY3JlYXRlLmpzIiwibm9kZV9tb2R1bGVzL2NvcmUtanMvbGlicmFyeS9tb2R1bGVzL19leHBvcnQuanMiLCJub2RlX21vZHVsZXMvY29yZS1qcy9saWJyYXJ5L21vZHVsZXMvX2ZhaWxzLmpzIiwibm9kZV9tb2R1bGVzL2NvcmUtanMvbGlicmFyeS9tb2R1bGVzL19nbG9iYWwuanMiLCJub2RlX21vZHVsZXMvY29yZS1qcy9saWJyYXJ5L21vZHVsZXMvX2hhcy5qcyIsIm5vZGVfbW9kdWxlcy9jb3JlLWpzL2xpYnJhcnkvbW9kdWxlcy9faGlkZS5qcyIsIm5vZGVfbW9kdWxlcy9jb3JlLWpzL2xpYnJhcnkvbW9kdWxlcy9faWU4LWRvbS1kZWZpbmUuanMiLCJub2RlX21vZHVsZXMvY29yZS1qcy9saWJyYXJ5L21vZHVsZXMvX2lzLW9iamVjdC5qcyIsIm5vZGVfbW9kdWxlcy9jb3JlLWpzL2xpYnJhcnkvbW9kdWxlcy9fb2JqZWN0LWRwLmpzIiwibm9kZV9tb2R1bGVzL2NvcmUtanMvbGlicmFyeS9tb2R1bGVzL19wcm9wZXJ0eS1kZXNjLmpzIiwibm9kZV9tb2R1bGVzL2NvcmUtanMvbGlicmFyeS9tb2R1bGVzL190by1wcmltaXRpdmUuanMiLCJub2RlX21vZHVsZXMvY29yZS1qcy9saWJyYXJ5L21vZHVsZXMvZXM2Lm9iamVjdC5kZWZpbmUtcHJvcGVydHkuanMiLCJub2RlX21vZHVsZXMvZGVidWcvc3JjL2Jyb3dzZXIuanMiLCJub2RlX21vZHVsZXMvZGVidWcvc3JjL2RlYnVnLmpzIiwibm9kZV9tb2R1bGVzL21zL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3Byb2Nlc3MvYnJvd3Nlci5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7Ozs7OztBQ0NBOzs7O0FBRUEsSUFBTSxrQkFBa0IsU0FBbEIsZUFBa0IsR0FBTTtBQUM1QixTQUFPLFlBQVksR0FBWixLQUFvQixJQUEzQjtBQUNELENBRkQsQyxDQUhBOzs7QUFPQSxTQUFTLElBQVQsR0FBZ0I7QUFDZCxNQUFNLE1BQU0sT0FBTyxRQUFQLENBQWdCLE1BQWhCLENBQXVCLE9BQXZCLENBQStCLE1BQS9CLEVBQXVDLElBQXZD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QUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNOQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNSQTtBQUNBO0FBQ0E7QUFDQTs7QUNIQTtBQUNBO0FBQ0E7QUFDQTs7QUNIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWkE7QUFDQTtBQUNBO0FBQ0E7OztBQ0hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDbk1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeEpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbigpe2Z1bmN0aW9uIHIoZSxuLHQpe2Z1bmN0aW9uIG8oaSxmKXtpZighbltpXSl7aWYoIWVbaV0pe3ZhciBjPVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmU7aWYoIWYmJmMpcmV0dXJuIGMoaSwhMCk7aWYodSlyZXR1cm4gdShpLCEwKTt2YXIgYT1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK2krXCInXCIpO3Rocm93IGEuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixhfXZhciBwPW5baV09e2V4cG9ydHM6e319O2VbaV1bMF0uY2FsbChwLmV4cG9ydHMsZnVuY3Rpb24ocil7dmFyIG49ZVtpXVsxXVtyXTtyZXR1cm4gbyhufHxyKX0scCxwLmV4cG9ydHMscixlLG4sdCl9cmV0dXJuIG5baV0uZXhwb3J0c31mb3IodmFyIHU9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZSxpPTA7aTx0Lmxlbmd0aDtpKyspbyh0W2ldKTtyZXR1cm4gb31yZXR1cm4gcn0pKCkiLCIvLyBpbXBvcnQgU3luY0NsaWVudCBmcm9tICdAaXJjYW0vc3luYy9jbGllbnQnO1xuaW1wb3J0IHsgU3luY0NsaWVudCB9IGZyb20gJ0BpcmNhbS9zeW5jJztcblxuY29uc3QgZ2V0VGltZUZ1bmN0aW9uID0gKCkgPT4ge1xuICByZXR1cm4gcGVyZm9ybWFuY2Uubm93KCkgLyAxMDAwO1xufVxuXG5mdW5jdGlvbiBpbml0KCkge1xuICBjb25zdCB1cmwgPSB3aW5kb3cubG9jYXRpb24ub3JpZ2luLnJlcGxhY2UoJ2h0dHAnLCAnd3MnKTtcblxuICAvLyBpbml0IHNvY2tldCBjbGllbnRcbiAgY29uc3Qgc29ja2V0ID0gbmV3IFdlYlNvY2tldCh1cmwpO1xuICAvLyBpbml0IHN5bmMgY2xpZW50XG4gIGNvbnN0IHN5bmNDbGllbnQgPSBuZXcgU3luY0NsaWVudChnZXRUaW1lRnVuY3Rpb24pO1xuXG4gIGNvbnN0ICRzeW5jVGltZSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJyNzeW5jLXRpbWUnKTtcbiAgc2V0SW50ZXJ2YWwoKCkgPT4ge1xuICAgIGNvbnN0IHN5bmNUaW1lID0gc3luY0NsaWVudC5nZXRTeW5jVGltZSgpO1xuICAgICRzeW5jVGltZS5pbm5lckhUTUwgPSBzeW5jVGltZTtcbiAgfSwgMTAwKTtcblxuICBzb2NrZXQuYWRkRXZlbnRMaXN0ZW5lcignb3BlbicsICgpID0+IHtcblxuICAgIGNvbnN0IHNlbmRGdW5jdGlvbiA9IChwaW5nSWQsIGNsaWVudFBpbmdUaW1lKSA9PiB7XG4gICAgICBjb25zdCByZXF1ZXN0ID0gW107XG4gICAgICByZXF1ZXN0WzBdID0gMDsgLy8gdGhpcyBpcyBhIHBpbmdcbiAgICAgIHJlcXVlc3RbMV0gPSBwaW5nSWQ7XG4gICAgICByZXF1ZXN0WzJdID0gY2xpZW50UGluZ1RpbWU7XG5cbiAgICAgIGNvbnNvbGUubG9nKGBbcGluZ10gLSBpZDogJXMsIHBpbmdUaW1lOiAlc2AsIHJlcXVlc3RbMV0sIHJlcXVlc3RbMl0pO1xuXG4gICAgICBzb2NrZXQuc2VuZChKU09OLnN0cmluZ2lmeShyZXF1ZXN0KSk7XG4gICAgfTtcblxuICAgIGNvbnN0IHJlY2VpdmVGdW5jdGlvbiA9IGNhbGxiYWNrID0+IHtcbiAgICAgIHNvY2tldC5hZGRFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgZSA9PiB7XG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gSlNPTi5wYXJzZShlLmRhdGEpO1xuICAgICAgICBjb25zb2xlLmxvZyhyZXNwb25zZSk7XG5cbiAgICAgICAgaWYgKHJlc3BvbnNlWzBdID09PSAxKSB7IC8vIHRoaXMgaXMgYSBwb25nXG4gICAgICAgICAgY29uc3QgcGluZ0lkID0gcmVzcG9uc2VbMV07XG4gICAgICAgICAgY29uc3QgY2xpZW50UGluZ1RpbWUgPSByZXNwb25zZVsyXTtcbiAgICAgICAgICBjb25zdCBzZXJ2ZXJQaW5nVGltZSA9IHJlc3BvbnNlWzNdO1xuICAgICAgICAgIGNvbnN0IHNlcnZlclBvbmdUaW1lID0gcmVzcG9uc2VbNF07XG5cbiAgICAgICAgICBjb25zb2xlLmxvZyhgW3BvbmddIC0gaWQ6ICVzLCBjbGllbnRQaW5nVGltZTogJXMsIHNlcnZlclBpbmdUaW1lOiAlcywgc2VydmVyUG9uZ1RpbWU6ICVzYCxcbiAgICAgICAgICAgIHBpbmdJZCwgY2xpZW50UGluZ1RpbWUsIHNlcnZlclBpbmdUaW1lLCBzZXJ2ZXJQb25nVGltZSk7XG5cbiAgICAgICAgICBjYWxsYmFjayhwaW5nSWQsIGNsaWVudFBpbmdUaW1lLCBzZXJ2ZXJQaW5nVGltZSwgc2VydmVyUG9uZ1RpbWUpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBjb25zdCAkc3RhdHVzQ29udGFpbmVyID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI3N0YXR1cycpO1xuICAgIGNvbnN0IHN0YXR1c0Z1bmN0aW9uID0gc3RhdHVzID0+IHtcbiAgICAgICRzdGF0dXNDb250YWluZXIuaW5uZXJIVE1MID0gSlNPTi5zdHJpbmdpZnkoc3RhdHVzLCBudWxsLCAyKTtcbiAgICAgIGNvbnNvbGUubG9nKHN0YXR1cyk7XG4gICAgfTtcblxuICAgIHN5bmNDbGllbnQuc3RhcnQoc2VuZEZ1bmN0aW9uLCByZWNlaXZlRnVuY3Rpb24sIHN0YXR1c0Z1bmN0aW9uKTtcbiAgfSk7XG5cbiAgc29ja2V0LmFkZEV2ZW50TGlzdGVuZXIoJ2Vycm9yJywgZXJyID0+IGNvbnNvbGUuZXJyb3IoZXJyLnN0YWNrKSk7XG4gIHNvY2tldC5hZGRFdmVudExpc3RlbmVyKCdjbG9zZScsICgpID0+IGNvbnNvbGUubG9nKCdzb2NrZXQgY2xvc2VkJykpO1xufVxuXG53aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbG9hZCcsIGluaXQpO1xuIiwiLyoqXG4gKiBAZmlsZU92ZXJ2aWV3IEVzdGltYXRpb24gb2YgYSBzZXJ2ZXIgdGltZSBmcm9tIGEgY2xpZW50IHRpbWUuXG4gKlxuICogQHNlZSB7QGxpbmsgaHR0cHM6Ly9oYWwuYXJjaGl2ZXMtb3V2ZXJ0ZXMuZnIvaGFsLTAxMzA0ODg5djF9XG4gKiBTdGFiaWxpc2F0aW9uIGFkZGVkIGFmdGVyIHRoZSBhcnRpY2xlLlxuICovXG5cbmltcG9ydCBkZWJ1ZyBmcm9tICdkZWJ1Zyc7XG5jb25zdCBsb2cgPSBkZWJ1Zygnc3luYycpO1xuXG4vLy8vLy8gaGVscGVyc1xuXG4vKipcbiAqIE9yZGVyIG1pbiBhbmQgbWF4IGF0dHJpYnV0ZXMuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7T2JqZWN0fSB0aGF0IHdpdGggbWluIGFuZCBtYXggYXR0cmlidXRlc1xuICogQHJldHVybnMge09iamVjdH0gd2l0aCBtaW4gYW5kIG1hbiBhdHRyaWJ1dGVzLCBzd2FwcGVkIGlmIHRoYXQubWluID4gdGhhdC5tYXhcbiAqL1xuZnVuY3Rpb24gb3JkZXJNaW5NYXgodGhhdCkge1xuICBpZih0eXBlb2YgdGhhdCAhPT0gJ3VuZGVmaW5lZCdcbiAgICAgJiYgdHlwZW9mIHRoYXQubWluICE9PSAndW5kZWZpbmVkJyAmJiB0eXBlb2YgdGhhdC5tYXggIT09ICd1bmRlZmluZWQnXG4gICAgICYmIHRoYXQubWluID4gdGhhdC5tYXgpIHtcbiAgICBjb25zdCB0bXAgPSB0aGF0Lm1pbjtcbiAgICB0aGF0Lm1pbiA9IHRoYXQubWF4O1xuICAgIHRoYXQubWF4ID0gdG1wO1xuICB9XG4gIHJldHVybiB0aGF0O1xufVxuXG4vKipcbiAqIE1lYW4gb3ZlciBhbiBhcnJheSwgc2VsZWN0aW5nIG9uZSBkaW1lbnNpb24gb2YgdGhlIGFycmF5IHZhbHVlcy5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtBcnJheS48QXJyYXkuPE51bWJlcj4+fSBhcnJheVxuICogQHBhcmFtIHtOdW1iZXJ9IFtkaW1lbnNpb249MF1cbiAqIEByZXR1cm5zIHtOdW1iZXJ9IG1lYW5cbiAqL1xuZnVuY3Rpb24gbWVhbihhcnJheSwgZGltZW5zaW9uID0gMCkge1xuICByZXR1cm4gYXJyYXkucmVkdWNlKChwLCBxKSA9PiBwICsgcVtkaW1lbnNpb25dLCAwKSAvIGFycmF5Lmxlbmd0aDtcbn1cblxuLyoqXG4gKiBGdW5jdGlvbiB1c2VkIHRvIHNvcnQgbG9uZy10ZXJtIGRhdGEsIHVzaW5nIGZpcnN0IGFuZCBzZWNvbmQgZGltZW5zaW9ucywgaW5cbiAqIHRoYXQgb3JkZXIuXG4gKlxuICogQHBhcmFtIHtBcnJheS48TnVtYmVyPn0gYVxuICogQHBhcmFtIHtOdW1iZXIuPE51bWJlcj59IGJcbiAqIEByZXR1cm5zIHtOdW1iZXJ9IG5lZ2F0aXZlIGlmIGEgPCBiLCBwb3NpdGl2ZSBpZiBhID4gYiwgb3IgMFxuICovXG5mdW5jdGlvbiBkYXRhQ29tcGFyZShhLCBiKSB7XG4gIHJldHVybiBhWzBdIC0gYlswXSB8fCBhWzFdIC0gYlsxXTtcbn1cblxuY2xhc3MgU3luY0NsaWVudCB7XG4gIC8qKlxuICAgKiBAY2FsbGJhY2sgU3luY0NsaWVudH5nZXRUaW1lRnVuY3Rpb25cbiAgICogQHJldHVybiB7TnVtYmVyfSBtb25vdG9uaWMsIGV2ZXIgaW5jcmVhc2luZywgdGltZSBpbiBzZWNvbmQuIFdoZW4gcG9zc2libGVcbiAgICogICB0aGUgc2VydmVyIGNvZGUgc2hvdWxkIGRlZmluZSBpdHMgb3duIG9yaWdpbiAoaS5lLiBgdGltZT0wYCkgaW4gb3JkZXIgdG9cbiAgICogICBtYXhpbWl6ZSB0aGUgcmVzb2x1dGlvbiBvZiB0aGUgY2xvY2sgZm9yIGEgbG9uZyBwZXJpb2Qgb2YgdGltZS4gV2hlblxuICAgKiAgIGBTeW5jU2VydmVyfnN0YXJ0YCBpcyBjYWxsZWQgdGhlIGNsb2NrIHNob3VsZCBiZSBydW5uaW5nXG4gICAqICAgKGNmLiBgYXVkaW9Db250ZXh0LmN1cnJlbnRUaW1lYCB0aGF0IG5lZWRzIHVzZXIgaW50ZXJhY3Rpb24gdG8gc3RhcnQpXG4gICAqKi9cblxuICAvKipcbiAgICogQGNhbGxiYWNrIFN5bmNDbGllbnR+c2VuZEZ1bmN0aW9uXG4gICAqIEBzZWUge0BsaW5rY29kZSBTeW5jU2VydmVyfnJlY2VpdmVGdW5jdGlvbn1cbiAgICogQHBhcmFtIHtOdW1iZXJ9IHBpbmdJZCB1bmlxdWUgaWRlbnRpZmllclxuICAgKiBAcGFyYW0ge051bWJlcn0gY2xpZW50UGluZ1RpbWUgdGltZS1zdGFtcCBvZiBwaW5nIGVtaXNzaW9uXG4gICAqKi9cblxuICAvKipcbiAgICogQGNhbGxiYWNrIFN5bmNDbGllbnR+cmVjZWl2ZUZ1bmN0aW9uXG4gICAqIEBzZWUge0BsaW5rY29kZSBTeW5jU2VydmVyfnNlbmRGdW5jdGlvbn1cbiAgICogQHBhcmFtIHtTeW5jQ2xpZW50fnJlY2VpdmVDYWxsYmFja30gcmVjZWl2ZUNhbGxiYWNrIGNhbGxlZCBvbiBlYWNoIG1lc3NhZ2VcbiAgICogICBtYXRjaGluZyBtZXNzYWdlVHlwZS5cbiAgICoqL1xuXG4gIC8qKlxuICAgKiBAY2FsbGJhY2sgU3luY0NsaWVudH5yZWNlaXZlQ2FsbGJhY2tcbiAgICogQHBhcmFtIHtOdW1iZXJ9IHBpbmdJZCB1bmlxdWUgaWRlbnRpZmllclxuICAgKiBAcGFyYW0ge051bWJlcn0gY2xpZW50UGluZ1RpbWUgdGltZS1zdGFtcCBvZiBwaW5nIGVtaXNzaW9uXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBzZXJ2ZXJQaW5nVGltZSB0aW1lLXN0YW1wIG9mIHBpbmcgcmVjZXB0aW9uXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBzZXJ2ZXJQb25nVGltZSB0aW1lLXN0YW1wIG9mIHBvbmcgZW1pc3Npb25cbiAgICoqL1xuXG4gIC8qKlxuICAgKiBAY2FsbGJhY2sgU3luY0NsaWVudH5yZXBvcnRGdW5jdGlvblxuICAgKiBAcGFyYW0ge09iamVjdH0gcmVwb3J0XG4gICAqIEBwYXJhbSB7U3RyaW5nfSByZXBvcnQuc3RhdHVzIGBuZXdgLCBgc3RhcnR1cGAsIGB0cmFpbmluZ2AgKG9mZnNldFxuICAgKiAgIGFkYXB0YXRpb24pLCBvciBgc3luY2AgKG9mZnNldCBhbmQgc3BlZWQgYWRhcHRhdGlvbikuXG4gICAqIEBwYXJhbSB7TnVtYmVyfSByZXBvcnQuc3RhdHVzRHVyYXRpb24gZHVyYXRpb24gc2luY2UgbGFzdCBzdGF0dXNcbiAgICogICBjaGFuZ2UuXG4gICAqIEBwYXJhbSB7TnVtYmVyfSByZXBvcnQudGltZU9mZnNldCB0aW1lIGRpZmZlcmVuY2UgYmV0d2VlbiBsb2NhbCB0aW1lIGFuZFxuICAgKiAgIHN5bmMgdGltZSwgaW4gc2Vjb25kcy5cbiAgICogQHBhcmFtIHtOdW1iZXJ9IHJlcG9ydC5mcmVxdWVuY3lSYXRpbyB0aW1lIHJhdGlvIGJldHdlZW4gbG9jYWxcbiAgICogICB0aW1lIGFuZCBzeW5jIHRpbWUuXG4gICAqIEBwYXJhbSB7U3RyaW5nfSByZXBvcnQuY29ubmVjdGlvbiBgb2ZmbGluZWAgb3IgYG9ubGluZWBcbiAgICogQHBhcmFtIHtOdW1iZXJ9IHJlcG9ydC5jb25uZWN0aW9uRHVyYXRpb24gZHVyYXRpb24gc2luY2UgbGFzdCBjb25uZWN0aW9uXG4gICAqICAgY2hhbmdlLlxuICAgKiBAcGFyYW0ge051bWJlcn0gcmVwb3J0LmNvbm5lY3Rpb25UaW1lT3V0IGR1cmF0aW9uLCBpbiBzZWNvbmRzLCBiZWZvcmVcbiAgICogICBhIHRpbWUtb3V0IG9jY3Vycy5cbiAgICogQHBhcmFtIHtOdW1iZXJ9IHJlcG9ydC50cmF2ZWxEdXJhdGlvbiBkdXJhdGlvbiBvZiBhIHBpbmctcG9uZyByb3VuZC10cmlwLFxuICAgKiAgIGluIHNlY29uZHMsIG1lYW4gb3ZlciB0aGUgdGhlIGxhc3QgcGluZy1wb25nIHNlcmllcy5cbiAgICogQHBhcmFtIHtOdW1iZXJ9IHJlcG9ydC50cmF2ZWxEdXJhdGlvbk1pbiBkdXJhdGlvbiBvZiBhIHBpbmctcG9uZ1xuICAgKiAgIHJvdW5kLXRyaXAsIGluIHNlY29uZHMsIG1pbmltdW0gb3ZlciB0aGUgdGhlIGxhc3QgcGluZy1wb25nIHNlcmllcy5cbiAgICogQHBhcmFtIHtOdW1iZXJ9IHJlcG9ydC50cmF2ZWxEdXJhdGlvbk1heCBkdXJhdGlvbiBvZiBhIHBpbmctcG9uZ1xuICAgKiAgIHJvdW5kLXRyaXAsIGluIHNlY29uZHMsIG1heGltdW0gb3ZlciB0aGUgdGhlIGxhc3QgcGluZy1wb25nIHNlcmllcy5cbiAgICoqL1xuXG4gIC8qKlxuICAgKiBUaGlzIGlzIHRoZSBjb25zdHJ1Y3Rvci4gU2VlIHtAbGlua2NvZGUgU3luY0NsaWVudH5zdGFydH0gbWV0aG9kIHRvXG4gICAqIGFjdHVhbGx5IHN0YXJ0IGEgc3luY2hyb25pc2F0aW9uIHByb2Nlc3MuXG4gICAqXG4gICAqIEBjb25zdHJ1Y3RzIFN5bmNDbGllbnRcbiAgICogQHBhcmFtIHtTeW5jQ2xpZW50fmdldFRpbWVGdW5jdGlvbn0gZ2V0VGltZUZ1bmN0aW9uXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc11cbiAgICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zLnBpbmdUaW1lT3V0RGVsYXldIHJhbmdlIG9mIGR1cmF0aW9uIChpbiBzZWNvbmRzKSB0b1xuICAgKiBjb25zaWRlciBhIHBpbmcgd2FzIG5vdCBwb25nZWQgYmFja1xuICAgKiBAcGFyYW0ge051bWJlcn0gW29wdGlvbnMucGluZ1RpbWVPdXREZWxheS5taW49MV0gbWluIGFuZCBtYXggbXVzdCBiZSBzZXQgdG9nZXRoZXJcbiAgICogQHBhcmFtIHtOdW1iZXJ9IFtvcHRpb25zLnBpbmdUaW1lT3V0RGVsYXkubWF4PTMwXSBtaW4gYW5kIG1heCBtdXN0IGJlIHNldCB0b2dldGhlclxuICAgKiBAcGFyYW0ge051bWJlcn0gW29wdGlvbnMucGluZ1Nlcmllc0l0ZXJhdGlvbnM9MTBdIG51bWJlciBvZiBwaW5nLXBvbmdzIGluIGFcbiAgICogc2VyaWVzXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBbb3B0aW9ucy5waW5nU2VyaWVzUGVyaW9kPTAuMjUwXSBpbnRlcnZhbCAoaW4gc2Vjb25kcykgYmV0d2VlbiBwaW5nc1xuICAgKiBpbiBhIHNlcmllc1xuICAgKiBAcGFyYW0ge051bWJlcn0gW29wdGlvbnMucGluZ1Nlcmllc0RlbGF5XSByYW5nZSBvZiBpbnRlcnZhbCAoaW5cbiAgICogc2Vjb25kcykgYmV0d2VlbiBwaW5nLXBvbmcgc2VyaWVzXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBbb3B0aW9ucy5waW5nU2VyaWVzRGVsYXkubWluPTEwXSBtaW4gYW5kIG1heCBtdXN0IGJlIHNldCB0b2dldGhlclxuICAgKiBAcGFyYW0ge051bWJlcn0gW29wdGlvbnMucGluZ1Nlcmllc0RlbGF5Lm1heD0yMF0gbWluIGFuZCBtYXggbXVzdCBiZSBzZXQgdG9nZXRoZXJcbiAgICogQHBhcmFtIHtOdW1iZXJ9IFtvcHRpb25zLmxvbmdUZXJtRGF0YVRyYWluaW5nRHVyYXRpb249MTIwXSBkdXJhdGlvbiBvZlxuICAgKiB0cmFpbmluZywgaW4gc2Vjb25kcywgYXBwcm94aW1hdGVseSwgYmVmb3JlIHVzaW5nIHRoZSBlc3RpbWF0ZSBvZlxuICAgKiBjbG9jayBmcmVxdWVuY3lcbiAgICogQHBhcmFtIHtOdW1iZXJ9IFtvcHRpb25zLmxvbmdUZXJtRGF0YUR1cmF0aW9uPTkwMF0gZXN0aW1hdGUgc3luY2hyb25pc2F0aW9uIG92ZXJcbiAgICogIHRoaXMgZHVyYXRpb24sIGluIHNlY29uZHMsIGFwcHJveGltYXRlbHlcbiAgICovXG4gIGNvbnN0cnVjdG9yKGdldFRpbWVGdW5jdGlvbiwgb3B0aW9ucyA9IHt9KSB7XG4gICAgdGhpcy5waW5nVGltZW91dERlbGF5ID0gb3B0aW9ucy5waW5nVGltZW91dERlbGF5XG4gICAgICB8fCB7IG1pbjogMSwgbWF4OiAzMCB9O1xuICAgIG9yZGVyTWluTWF4KHRoaXMucGluZ1RpbWVvdXREZWxheSk7XG5cbiAgICB0aGlzLnBpbmdTZXJpZXNJdGVyYXRpb25zID0gb3B0aW9ucy5waW5nU2VyaWVzSXRlcmF0aW9ucyB8fCAxMDtcbiAgICB0aGlzLnBpbmdTZXJpZXNQZXJpb2QgPSAodHlwZW9mIG9wdGlvbnMucGluZ1Nlcmllc1BlcmlvZCAhPT0gJ3VuZGVmaW5lZCdcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPyBvcHRpb25zLnBpbmdTZXJpZXNQZXJpb2RcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgOiAwLjI1MCk7XG4gICAgdGhpcy5waW5nU2VyaWVzRGVsYXkgPSBvcHRpb25zLnBpbmdTZXJpZXNEZWxheVxuICAgICAgfHwgeyBtaW46IDEwLCBtYXg6IDIwIH07XG4gICAgb3JkZXJNaW5NYXgodGhpcy5waW5nU2VyaWVzRGVsYXkpO1xuXG4gICAgdGhpcy5waW5nRGVsYXkgPSAwOyAvLyBjdXJyZW50IGRlbGF5IGJlZm9yZSBuZXh0IHBpbmdcbiAgICB0aGlzLnRpbWVvdXRJZCA9IDA7IC8vIHRvIGNhbmNlbCB0aW1lb3V0IG9uIHBvbmdcbiAgICB0aGlzLnBpbmdJZCA9IDA7IC8vIGFic29sdXRlIElEIHRvIG1hY2ggcG9uZyBhZ2FpbnN0XG5cbiAgICB0aGlzLnBpbmdTZXJpZXNDb3VudCA9IDA7IC8vIGVsYXBzZWQgcGluZ3MgaW4gYSBzZXJpZXNcbiAgICB0aGlzLnNlcmllc0RhdGEgPSBbXTsgLy8gY2lyY3VsYXIgYnVmZmVyXG4gICAgdGhpcy5zZXJpZXNEYXRhTmV4dEluZGV4ID0gMDsgLy8gbmV4dCBpbmRleCB0byB3cml0ZSBpbiBjaXJjdWxhciBidWZmZXJcbiAgICB0aGlzLnNlcmllc0RhdGFMZW5ndGggPSB0aGlzLnBpbmdTZXJpZXNJdGVyYXRpb25zOyAvLyBzaXplIG9mIGNpcmN1bGFyIGJ1ZmZlclxuXG4gICAgdGhpcy5sb25nVGVybURhdGFUcmFpbmluZ0R1cmF0aW9uXG4gICAgICA9IG9wdGlvbnMubG9uZ1Rlcm1EYXRhVHJhaW5pbmdEdXJhdGlvbiB8fCAxMjA7XG5cbiAgICAvLyB1c2UgYSBmaXhlZC1zaXplIGNpcmN1bGFyIGJ1ZmZlciwgZXZlbiBpZiBpdCBkb2VzIG5vdCBtYXRjaFxuICAgIC8vIGV4YWN0bHkgdGhlIHJlcXVpcmVkIGR1cmF0aW9uXG4gICAgdGhpcy5sb25nVGVybURhdGFEdXJhdGlvbiA9IG9wdGlvbnMubG9uZ1Rlcm1EYXRhRHVyYXRpb24gfHwgOTAwO1xuICAgIHRoaXMubG9uZ1Rlcm1EYXRhTGVuZ3RoID0gTWF0aC5tYXgoXG4gICAgICAyLFxuICAgICAgdGhpcy5sb25nVGVybURhdGFEdXJhdGlvbiAvXG4gICAgICAgICgwLjUgKiAodGhpcy5waW5nU2VyaWVzRGVsYXkubWluICsgdGhpcy5waW5nU2VyaWVzRGVsYXkubWF4KSApICk7XG5cbiAgICB0aGlzLmxvbmdUZXJtRGF0YSA9IFtdOyAvLyBjaXJjdWxhciBidWZmZXJcbiAgICB0aGlzLmxvbmdUZXJtRGF0YU5leHRJbmRleCA9IDA7IC8vIG5leHQgaW5kZXggdG8gd3JpdGUgaW4gY2lyY3VsYXIgYnVmZmVyXG5cbiAgICB0aGlzLnRpbWVPZmZzZXQgPSAwOyAvLyBtZWFuIG9mIChzZXJ2ZXJUaW1lIC0gY2xpZW50VGltZSkgaW4gdGhlIGxhc3Qgc2VyaWVzXG4gICAgdGhpcy50cmF2ZWxEdXJhdGlvbiA9IDA7XG4gICAgdGhpcy50cmF2ZWxEdXJhdGlvbk1pbiA9IDA7XG4gICAgdGhpcy50cmF2ZWxEdXJhdGlvbk1heCA9IDA7XG5cbiAgICAvLyBUKHQpID0gVDAgKyBSICogKHQgLSB0MClcbiAgICB0aGlzLnNlcnZlclRpbWVSZWZlcmVuY2UgPSAwOyAvLyBUMFxuICAgIHRoaXMuY2xpZW50VGltZVJlZmVyZW5jZSA9IDA7IC8vIHQwXG4gICAgdGhpcy5mcmVxdWVuY3lSYXRpbyA9IDE7IC8vIFJcblxuICAgIHRoaXMucGluZ1RpbWVvdXREZWxheS5jdXJyZW50ID0gdGhpcy5waW5nVGltZW91dERlbGF5Lm1pbjtcblxuICAgIHRoaXMuZ2V0VGltZUZ1bmN0aW9uID0gZ2V0VGltZUZ1bmN0aW9uO1xuXG4gICAgdGhpcy5zdGF0dXMgPSAnbmV3JztcbiAgICB0aGlzLnN0YXR1c0NoYW5nZWRUaW1lID0gMDtcblxuICAgIHRoaXMuY29ubmVjdGlvblN0YXR1cyA9ICdvZmZsaW5lJztcbiAgICB0aGlzLmNvbm5lY3Rpb25TdGF0dXNDaGFuZ2VkVGltZSA9IDA7XG4gIH1cblxuICAvKipcbiAgICogU2V0IHN0YXR1cywgYW5kIHNldCB0aGlzLnN0YXR1c0NoYW5nZWRUaW1lLCB0byBsYXRlclxuICAgKiB1c2Ugc2VlIHtAbGlua2NvZGUgU3luY0NsaWVudH5nZXRTdGF0dXNEdXJhdGlvbn1cbiAgICogYW5kIHtAbGlua2NvZGUgU3luY0NsaWVudH5yZXBvcnRTdGF0dXN9LlxuICAgKlxuICAgKiBAZnVuY3Rpb24gU3luY0NsaWVudH5zZXRTdGF0dXNcbiAgICogQHBhcmFtIHtTdHJpbmd9IHN0YXR1c1xuICAgKiBAcmV0dXJucyB7T2JqZWN0fSB0aGlzXG4gICAqL1xuICBzZXRTdGF0dXMoc3RhdHVzKSB7XG4gICAgaWYoc3RhdHVzICE9PSB0aGlzLnN0YXR1cykge1xuICAgICAgdGhpcy5zdGF0dXMgPSBzdGF0dXM7XG4gICAgICB0aGlzLnN0YXR1c0NoYW5nZWRUaW1lID0gdGhpcy5nZXRMb2NhbFRpbWUoKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICAvKipcbiAgICogR2V0IHRpbWUgc2luY2UgbGFzdCBzdGF0dXMgY2hhbmdlLiBTZWUge0BsaW5rY29kZSBTeW5jQ2xpZW50fnNldFN0YXR1c31cbiAgICpcbiAgICogQGZ1bmN0aW9uIFN5bmNDbGllbnR+Z2V0U3RhdHVzRHVyYXRpb25cbiAgICogQHJldHVybnMge051bWJlcn0gdGltZSwgaW4gc2Vjb25kcywgc2luY2UgbGFzdCBzdGF0dXMgY2hhbmdlLlxuICAgKi9cbiAgZ2V0U3RhdHVzRHVyYXRpb24oKSB7XG4gICAgcmV0dXJuIE1hdGgubWF4KDAsIHRoaXMuZ2V0TG9jYWxUaW1lKCkgLSB0aGlzLnN0YXR1c0NoYW5nZWRUaW1lKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTZXQgY29ubmVjdGlvblN0YXR1cywgYW5kIHNldCB0aGlzLmNvbm5lY3Rpb25TdGF0dXNDaGFuZ2VkVGltZSxcbiAgICogdG8gbGF0ZXIgdXNlIHNlZSB7QGxpbmtjb2RlIFN5bmNDbGllbnR+Z2V0Q29ubmVjdGlvblN0YXR1c0R1cmF0aW9ufVxuICAgKiBhbmQge0BsaW5rY29kZSBTeW5jQ2xpZW50fnJlcG9ydFN0YXR1c30uXG4gICAqXG4gICAqIEBmdW5jdGlvbiBTeW5jQ2xpZW50fnNldENvbm5lY3Rpb25TdGF0dXNcbiAgICogQHBhcmFtIHtTdHJpbmd9IGNvbm5lY3Rpb25TdGF0dXNcbiAgICogQHJldHVybnMge09iamVjdH0gdGhpc1xuICAgKi9cbiAgc2V0Q29ubmVjdGlvblN0YXR1cyhjb25uZWN0aW9uU3RhdHVzKSB7XG4gICAgaWYoY29ubmVjdGlvblN0YXR1cyAhPT0gdGhpcy5jb25uZWN0aW9uU3RhdHVzKSB7XG4gICAgICB0aGlzLmNvbm5lY3Rpb25TdGF0dXMgPSBjb25uZWN0aW9uU3RhdHVzO1xuICAgICAgdGhpcy5jb25uZWN0aW9uU3RhdHVzQ2hhbmdlZFRpbWUgPSB0aGlzLmdldExvY2FsVGltZSgpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgdGltZSBzaW5jZSBsYXN0IGNvbm5lY3Rpb25TdGF0dXMgY2hhbmdlLlxuICAgKiBTZWUge0BsaW5rY29kZSBTeW5jQ2xpZW50fnNldENvbm5lY3Rpb25TdGF0dXN9XG4gICAqXG4gICAqIEBmdW5jdGlvbiBTeW5jQ2xpZW50fmdldENvbm5lY3Rpb25TdGF0dXNEdXJhdGlvblxuICAgKiBAcmV0dXJucyB7TnVtYmVyfSB0aW1lLCBpbiBzZWNvbmRzLCBzaW5jZSBsYXN0IGNvbm5lY3Rpb25TdGF0dXMgY2hhbmdlLlxuICAgKi9cbiAgZ2V0Q29ubmVjdGlvblN0YXR1c0R1cmF0aW9uKCkge1xuICAgIHJldHVybiBNYXRoLm1heCgwLCB0aGlzLmdldExvY2FsVGltZSgpIC0gdGhpcy5jb25uZWN0aW9uU3RhdHVzQ2hhbmdlZFRpbWUpO1xuICB9XG5cbiAgLyoqXG4gICAqIFJlcG9ydCB0aGUgc3RhdHVzIG9mIHRoZSBzeW5jaHJvbmlzYXRpb24gcHJvY2VzcywgaWZcbiAgICogcmVwb3J0RnVuY3Rpb24gaXMgZGVmaW5lZC5cbiAgICpcbiAgICogQGZ1bmN0aW9uIFN5bmNDbGllbnR+cmVwb3J0U3RhdHVzXG4gICAqIEBwYXJhbSB7U3luY0NsaWVudH5yZXBvcnRGdW5jdGlvbn0gcmVwb3J0RnVuY3Rpb25cbiAgICovXG4gIHJlcG9ydFN0YXR1cyhyZXBvcnRGdW5jdGlvbikge1xuICAgIGlmKHR5cGVvZiByZXBvcnRGdW5jdGlvbiAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIHJlcG9ydEZ1bmN0aW9uKHtcbiAgICAgICAgc3RhdHVzOiB0aGlzLnN0YXR1cyxcbiAgICAgICAgc3RhdHVzRHVyYXRpb246IHRoaXMuZ2V0U3RhdHVzRHVyYXRpb24oKSxcbiAgICAgICAgdGltZU9mZnNldDogdGhpcy50aW1lT2Zmc2V0LFxuICAgICAgICBmcmVxdWVuY3lSYXRpbzogdGhpcy5mcmVxdWVuY3lSYXRpbyxcbiAgICAgICAgY29ubmVjdGlvbjogdGhpcy5jb25uZWN0aW9uU3RhdHVzLFxuICAgICAgICBjb25uZWN0aW9uRHVyYXRpb246IHRoaXMuZ2V0Q29ubmVjdGlvblN0YXR1c0R1cmF0aW9uKCksXG4gICAgICAgIGNvbm5lY3Rpb25UaW1lT3V0OiB0aGlzLnBpbmdUaW1lb3V0RGVsYXkuY3VycmVudCxcbiAgICAgICAgdHJhdmVsRHVyYXRpb246IHRoaXMudHJhdmVsRHVyYXRpb24sXG4gICAgICAgIHRyYXZlbER1cmF0aW9uTWluOiB0aGlzLnRyYXZlbER1cmF0aW9uTWluLFxuICAgICAgICB0cmF2ZWxEdXJhdGlvbk1heDogdGhpcy50cmF2ZWxEdXJhdGlvbk1heFxuICAgICAgfSk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFByb2Nlc3MgdG8gc2VuZCBwaW5nIG1lc3NhZ2VzLlxuICAgKlxuICAgKiBAcHJpdmF0ZVxuICAgKiBAZnVuY3Rpb24gU3luY0NsaWVudH5fX3N5bmNMb29wXG4gICAqIEBwYXJhbSB7U3luY0NsaWVudH5zZW5kRnVuY3Rpb259IHNlbmRGdW5jdGlvblxuICAgKiBAcGFyYW0ge1N5bmNDbGllbnR+cmVwb3J0RnVuY3Rpb259IHJlcG9ydEZ1bmN0aW9uXG4gICAqL1xuICBfX3N5bmNMb29wKHNlbmRGdW5jdGlvbiwgcmVwb3J0RnVuY3Rpb24pIHtcbiAgICBjbGVhclRpbWVvdXQodGhpcy50aW1lb3V0SWQpO1xuICAgICsrdGhpcy5waW5nSWQ7XG4gICAgc2VuZEZ1bmN0aW9uKHRoaXMucGluZ0lkLCB0aGlzLmdldExvY2FsVGltZSgpKTtcblxuICAgIHRoaXMudGltZW91dElkID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAvLyBpbmNyZWFzZSB0aW1lb3V0IGR1cmF0aW9uIG9uIHRpbWVvdXQsIHRvIGF2b2lkIG92ZXJmbG93XG4gICAgICB0aGlzLnBpbmdUaW1lb3V0RGVsYXkuY3VycmVudCA9IE1hdGgubWluKHRoaXMucGluZ1RpbWVvdXREZWxheS5jdXJyZW50ICogMixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5waW5nVGltZW91dERlbGF5Lm1heCk7XG4gICAgICBsb2coJ3N5bmM6cGluZyB0aW1lb3V0ID4gJXMnLCB0aGlzLnBpbmdUaW1lb3V0RGVsYXkuY3VycmVudCk7XG4gICAgICB0aGlzLnNldENvbm5lY3Rpb25TdGF0dXMoJ29mZmxpbmUnKTtcbiAgICAgIHRoaXMucmVwb3J0U3RhdHVzKHJlcG9ydEZ1bmN0aW9uKTtcbiAgICAgIC8vIHJldHJ5ICh5ZXMsIGFsd2F5cyBpbmNyZW1lbnQgcGluZ0lkKVxuICAgICAgdGhpcy5fX3N5bmNMb29wKHNlbmRGdW5jdGlvbiwgcmVwb3J0RnVuY3Rpb24pO1xuICAgIH0sIE1hdGguY2VpbCgxMDAwICogdGhpcy5waW5nVGltZW91dERlbGF5LmN1cnJlbnQpKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTdGFydCBhIHN5bmNocm9uaXNhdGlvbiBwcm9jZXNzIGJ5IHJlZ2lzdGVyaW5nIHRoZSByZWNlaXZlXG4gICAqIGZ1bmN0aW9uIHBhc3NlZCBhcyBzZWNvbmQgcGFyYW1ldGVyLiBUaGVuLCBzZW5kIHJlZ3VsYXIgbWVzc2FnZXNcbiAgICogdG8gdGhlIHNlcnZlciwgdXNpbmcgdGhlIHNlbmQgZnVuY3Rpb24gcGFzc2VkIGFzIGZpcnN0IHBhcmFtZXRlci5cbiAgICpcbiAgICogQGZ1bmN0aW9uIFN5bmNDbGllbnR+c3RhcnRcbiAgICogQHBhcmFtIHtTeW5jQ2xpZW50fnNlbmRGdW5jdGlvbn0gc2VuZEZ1bmN0aW9uXG4gICAqIEBwYXJhbSB7U3luY0NsaWVudH5yZWNlaXZlRnVuY3Rpb259IHJlY2VpdmVGdW5jdGlvbiB0byByZWdpc3RlclxuICAgKiBAcGFyYW0ge1N5bmNDbGllbnR+cmVwb3J0RnVuY3Rpb259IHJlcG9ydEZ1bmN0aW9uIGlmIGRlZmluZWQsIGlzIGNhbGxlZCB0b1xuICAgKiAgIHJlcG9ydCB0aGUgc3RhdHVzLCBvbiBlYWNoIHN0YXR1cyBjaGFuZ2VcbiAgICovXG4gIHN0YXJ0KHNlbmRGdW5jdGlvbiwgcmVjZWl2ZUZ1bmN0aW9uLCByZXBvcnRGdW5jdGlvbikge1xuICAgIHRoaXMuc2V0U3RhdHVzKCdzdGFydHVwJyk7XG4gICAgdGhpcy5zZXRDb25uZWN0aW9uU3RhdHVzKCdvZmZsaW5lJyk7XG5cbiAgICB0aGlzLnNlcmllc0RhdGEgPSBbXTtcbiAgICB0aGlzLnNlcmllc0RhdGFOZXh0SW5kZXggPSAwO1xuXG4gICAgdGhpcy5sb25nVGVybURhdGEgPSBbXTtcbiAgICB0aGlzLmxvbmdUZXJtRGF0YU5leHRJbmRleCA9IDA7XG5cbiAgICByZWNlaXZlRnVuY3Rpb24oKHBpbmdJZCwgY2xpZW50UGluZ1RpbWUsIHNlcnZlclBpbmdUaW1lLCBzZXJ2ZXJQb25nVGltZSkgPT4ge1xuICAgICAgLy8gYWNjZXB0IG9ubHkgdGhlIHBvbmcgdGhhdCBjb3JyZXNwb25kcyB0byB0aGUgbGFzdCBwaW5nXG4gICAgICBpZiAocGluZ0lkID09PSB0aGlzLnBpbmdJZCkge1xuICAgICAgICArK3RoaXMucGluZ1Nlcmllc0NvdW50O1xuICAgICAgICBjbGVhclRpbWVvdXQodGhpcy50aW1lb3V0SWQpO1xuICAgICAgICB0aGlzLnNldENvbm5lY3Rpb25TdGF0dXMoJ29ubGluZScpO1xuICAgICAgICAvLyByZWR1Y2UgdGltZW91dCBkdXJhdGlvbiBvbiBwb25nLCBmb3IgYmV0dGVyIHJlYWN0aXZpdHlcbiAgICAgICAgdGhpcy5waW5nVGltZW91dERlbGF5LmN1cnJlbnQgPSBNYXRoLm1heCh0aGlzLnBpbmdUaW1lb3V0RGVsYXkuY3VycmVudCAqIDAuNzUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5waW5nVGltZW91dERlbGF5Lm1pbik7XG5cbiAgICAgICAgLy8gdGltZS1kaWZmZXJlbmNlcyBhcmUgdmFsaWQgb24gYSBzaW5nbGUtc2lkZSBvbmx5IChjbGllbnQgb3Igc2VydmVyKVxuICAgICAgICBjb25zdCBjbGllbnRQb25nVGltZSA9IHRoaXMuZ2V0TG9jYWxUaW1lKCk7XG4gICAgICAgIGNvbnN0IGNsaWVudFRpbWUgPSAwLjUgKiAoY2xpZW50UG9uZ1RpbWUgKyBjbGllbnRQaW5nVGltZSk7XG4gICAgICAgIGNvbnN0IHNlcnZlclRpbWUgPSAwLjUgKiAoc2VydmVyUG9uZ1RpbWUgKyBzZXJ2ZXJQaW5nVGltZSk7XG4gICAgICAgIGNvbnN0IHRyYXZlbER1cmF0aW9uID0gTWF0aC5tYXgoMCwgKGNsaWVudFBvbmdUaW1lIC0gY2xpZW50UGluZ1RpbWUpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLSAoc2VydmVyUG9uZ1RpbWUgLSBzZXJ2ZXJQaW5nVGltZSkpO1xuICAgICAgICBjb25zdCBvZmZzZXRUaW1lID0gc2VydmVyVGltZSAtIGNsaWVudFRpbWU7XG5cbiAgICAgICAgLy8gb3JkZXIgaXMgaW1wb3J0YW50IGZvciBzb3J0aW5nLCBsYXRlci5cbiAgICAgICAgdGhpcy5zZXJpZXNEYXRhW3RoaXMuc2VyaWVzRGF0YU5leHRJbmRleF1cbiAgICAgICAgICA9IFt0cmF2ZWxEdXJhdGlvbiwgb2Zmc2V0VGltZSwgY2xpZW50VGltZSwgc2VydmVyVGltZV07XG4gICAgICAgIHRoaXMuc2VyaWVzRGF0YU5leHRJbmRleCA9ICgrK3RoaXMuc2VyaWVzRGF0YU5leHRJbmRleCkgJSB0aGlzLnNlcmllc0RhdGFMZW5ndGg7XG5cbiAgICAgICAgLy8gbG9nKCdwaW5nICVzLCB0cmF2ZWwgPSAlcywgb2Zmc2V0ID0gJXMsIGNsaWVudCA9ICVzLCBzZXJ2ZXIgPSAlcycsXG4gICAgICAgIC8vICAgICAgIHBpbmdJZCwgdHJhdmVsRHVyYXRpb24sIG9mZnNldFRpbWUsIGNsaWVudFRpbWUsIHNlcnZlclRpbWUpO1xuXG4gICAgICAgIC8vIGVuZCBvZiBhIHNlcmllc1xuICAgICAgICBpZiAodGhpcy5waW5nU2VyaWVzQ291bnQgPj0gdGhpcy5waW5nU2VyaWVzSXRlcmF0aW9uc1xuICAgICAgICAgICAgJiYgdGhpcy5zZXJpZXNEYXRhLmxlbmd0aCA+PSB0aGlzLnNlcmllc0RhdGFMZW5ndGgpIHtcbiAgICAgICAgICAvLyBwbGFuIHRoZSBiZWdpbmluZyBvZiB0aGUgbmV4dCBzZXJpZXNcbiAgICAgICAgICB0aGlzLnBpbmdEZWxheSA9IHRoaXMucGluZ1Nlcmllc0RlbGF5Lm1pblxuICAgICAgICAgICAgKyBNYXRoLnJhbmRvbSgpICogKHRoaXMucGluZ1Nlcmllc0RlbGF5Lm1heCAtIHRoaXMucGluZ1Nlcmllc0RlbGF5Lm1pbik7XG4gICAgICAgICAgdGhpcy5waW5nU2VyaWVzQ291bnQgPSAwO1xuXG4gICAgICAgICAgLy8gc29ydCBieSB0cmF2ZWwgdGltZSBmaXJzdCwgdGhlbiBvZmZzZXQgdGltZS5cbiAgICAgICAgICBjb25zdCBzb3J0ZWQgPSB0aGlzLnNlcmllc0RhdGEuc2xpY2UoMCkuc29ydChkYXRhQ29tcGFyZSk7XG5cbiAgICAgICAgICBjb25zdCBzZXJpZXNUcmF2ZWxEdXJhdGlvbiA9IHNvcnRlZFswXVswXTtcblxuICAgICAgICAgIC8vIFdoZW4gdGhlIGNsb2NrIHRpY2sgaXMgbG9uZyBlbm91Z2gsXG4gICAgICAgICAgLy8gc29tZSB0cmF2ZWwgdGltZXMgKGRpbWVuc2lvbiAwKSBtaWdodCBiZSBpZGVudGljYWwuXG4gICAgICAgICAgLy8gVGhlbiwgdXNlIHRoZSBvZmZzZXQgbWVkaWFuIChkaW1lbnNpb24gMSBpcyB0aGUgc2Vjb25kIHNvcnQga2V5KVxuICAgICAgICAgIC8vIG9mIHNob3J0ZXN0IHRyYXZlbCBkdXJhdGlvblxuICAgICAgICAgIGxldCBxdWljayA9IDA7XG4gICAgICAgICAgd2hpbGUocXVpY2sgPCBzb3J0ZWQubGVuZ3RoICYmIHNvcnRlZFtxdWlja11bMF0gPD0gc2VyaWVzVHJhdmVsRHVyYXRpb24gKiAxLjAxKSB7XG4gICAgICAgICAgICArK3F1aWNrO1xuICAgICAgICAgIH1cbiAgICAgICAgICBxdWljayA9IE1hdGgubWF4KDAsIHF1aWNrIC0gMSk7XG4gICAgICAgICAgY29uc3QgbWVkaWFuID0gTWF0aC5mbG9vcihxdWljayAvIDIpO1xuXG4gICAgICAgICAgY29uc3Qgc2VyaWVzQ2xpZW50VGltZSA9IHNvcnRlZFttZWRpYW5dWzJdO1xuICAgICAgICAgIGNvbnN0IHNlcmllc1NlcnZlclRpbWUgPSBzb3J0ZWRbbWVkaWFuXVszXTtcbiAgICAgICAgICBjb25zdCBzZXJpZXNDbGllbnRTcXVhcmVkVGltZSA9IHNlcmllc0NsaWVudFRpbWUgKiBzZXJpZXNDbGllbnRUaW1lO1xuICAgICAgICAgIGNvbnN0IHNlcmllc0NsaWVudFNlcnZlclRpbWUgPSBzZXJpZXNDbGllbnRUaW1lICogc2VyaWVzU2VydmVyVGltZTtcblxuICAgICAgICAgIHRoaXMubG9uZ1Rlcm1EYXRhW3RoaXMubG9uZ1Rlcm1EYXRhTmV4dEluZGV4XVxuICAgICAgICAgICAgPSBbc2VyaWVzVHJhdmVsRHVyYXRpb24sIHNlcmllc0NsaWVudFRpbWUsIHNlcmllc1NlcnZlclRpbWUsXG4gICAgICAgICAgICAgICBzZXJpZXNDbGllbnRTcXVhcmVkVGltZSwgc2VyaWVzQ2xpZW50U2VydmVyVGltZV07XG4gICAgICAgICAgdGhpcy5sb25nVGVybURhdGFOZXh0SW5kZXggPSAoKyt0aGlzLmxvbmdUZXJtRGF0YU5leHRJbmRleCkgJSB0aGlzLmxvbmdUZXJtRGF0YUxlbmd0aDtcblxuICAgICAgICAgIC8vIG1lYW4gb2YgdGhlIHRpbWUgb2Zmc2V0IG92ZXIgMyBzYW1wbGVzIGFyb3VuZCBtZWRpYW5cbiAgICAgICAgICAvLyAobGltaXRlZCB0byBzaG9ydGVzdCB0cmF2ZWwgZHVyYXRpb24pXG4gICAgICAgICAgY29uc3QgYXJvdW5kTWVkaWFuID0gc29ydGVkLnNsaWNlKE1hdGgubWF4KDAsIG1lZGlhbiAtIDEpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBNYXRoLm1pbihxdWljaywgbWVkaWFuICsgMSkgKyAxKTtcbiAgICAgICAgICB0aGlzLnRpbWVPZmZzZXQgPSBtZWFuKGFyb3VuZE1lZGlhbiwgMSk7XG5cbiAgICAgICAgICBpZih0aGlzLnN0YXR1cyA9PT0gJ3N0YXJ0dXAnXG4gICAgICAgICAgICAgfHwgKHRoaXMuc3RhdHVzID09PSAndHJhaW5pbmcnXG4gICAgICAgICAgICAgICAgICYmIHRoaXMuZ2V0U3RhdHVzRHVyYXRpb24oKSA8IHRoaXMubG9uZ1Rlcm1EYXRhVHJhaW5pbmdEdXJhdGlvbikgKSB7XG4gICAgICAgICAgICAvLyBzZXQgb25seSB0aGUgcGhhc2Ugb2Zmc2V0LCBub3QgdGhlIGZyZXF1ZW5jeVxuICAgICAgICAgICAgdGhpcy5zZXJ2ZXJUaW1lUmVmZXJlbmNlID0gdGhpcy50aW1lT2Zmc2V0O1xuICAgICAgICAgICAgdGhpcy5jbGllbnRUaW1lUmVmZXJlbmNlID0gMDtcbiAgICAgICAgICAgIHRoaXMuZnJlcXVlbmN5UmF0aW8gPSAxO1xuICAgICAgICAgICAgdGhpcy5zZXRTdGF0dXMoJ3RyYWluaW5nJyk7XG4gICAgICAgICAgICBsb2coJ1QgPSAlcyArICVzICogKCVzIC0gJXMpID0gJXMnLFxuICAgICAgICAgICAgICAgICAgdGhpcy5zZXJ2ZXJUaW1lUmVmZXJlbmNlLCB0aGlzLmZyZXF1ZW5jeVJhdGlvLFxuICAgICAgICAgICAgICAgICAgc2VyaWVzQ2xpZW50VGltZSwgdGhpcy5jbGllbnRUaW1lUmVmZXJlbmNlLFxuICAgICAgICAgICAgICAgICAgdGhpcy5nZXRTeW5jVGltZShzZXJpZXNDbGllbnRUaW1lKSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYoKHRoaXMuc3RhdHVzID09PSAndHJhaW5pbmcnXG4gICAgICAgICAgICAgICYmIHRoaXMuZ2V0U3RhdHVzRHVyYXRpb24oKSA+PSB0aGlzLmxvbmdUZXJtRGF0YVRyYWluaW5nRHVyYXRpb24pXG4gICAgICAgICAgICAgfHwgdGhpcy5zdGF0dXMgPT09ICdzeW5jJykge1xuICAgICAgICAgICAgLy8gbGluZWFyIHJlZ3Jlc3Npb24sIFIgPSBjb3ZhcmlhbmNlKHQsVCkgLyB2YXJpYW5jZSh0KVxuICAgICAgICAgICAgY29uc3QgcmVnQ2xpZW50VGltZSA9IG1lYW4odGhpcy5sb25nVGVybURhdGEsIDEpO1xuICAgICAgICAgICAgY29uc3QgcmVnU2VydmVyVGltZSA9IG1lYW4odGhpcy5sb25nVGVybURhdGEsIDIpO1xuICAgICAgICAgICAgY29uc3QgcmVnQ2xpZW50U3F1YXJlZFRpbWUgPSBtZWFuKHRoaXMubG9uZ1Rlcm1EYXRhLCAzKTtcbiAgICAgICAgICAgIGNvbnN0IHJlZ0NsaWVudFNlcnZlclRpbWUgPSBtZWFuKHRoaXMubG9uZ1Rlcm1EYXRhLCA0KTtcblxuICAgICAgICAgICAgY29uc3QgY292YXJpYW5jZSA9IHJlZ0NsaWVudFNlcnZlclRpbWUgLSByZWdDbGllbnRUaW1lICogcmVnU2VydmVyVGltZTtcbiAgICAgICAgICAgIGNvbnN0IHZhcmlhbmNlID0gcmVnQ2xpZW50U3F1YXJlZFRpbWUgLSByZWdDbGllbnRUaW1lICogcmVnQ2xpZW50VGltZTtcbiAgICAgICAgICAgIGlmKHZhcmlhbmNlID4gMCkge1xuICAgICAgICAgICAgICAvLyB1cGRhdGUgZnJlcSBhbmQgc2hpZnRcbiAgICAgICAgICAgICAgdGhpcy5mcmVxdWVuY3lSYXRpbyA9IGNvdmFyaWFuY2UgLyB2YXJpYW5jZTtcbiAgICAgICAgICAgICAgdGhpcy5jbGllbnRUaW1lUmVmZXJlbmNlID0gcmVnQ2xpZW50VGltZTtcbiAgICAgICAgICAgICAgdGhpcy5zZXJ2ZXJUaW1lUmVmZXJlbmNlID0gcmVnU2VydmVyVGltZTtcblxuICAgICAgICAgICAgICAvLyAwLjA1JSBpcyBhIGxvdCAoNTAwIFBQTSwgbGlrZSBhbiBvbGQgbWVjaGFuaWNhbCBjbG9jaylcbiAgICAgICAgICAgICAgaWYodGhpcy5mcmVxdWVuY3lSYXRpbyA+IDAuOTk5NSAmJiB0aGlzLmZyZXF1ZW5jeVJhdGlvIDwgMS4wMDA1KSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXRTdGF0dXMoJ3N5bmMnKTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBsb2coJ2Nsb2NrIGZyZXF1ZW5jeSByYXRpbyBvdXQgb2Ygc3luYzogJXMsIHRyYWluaW5nIGFnYWluJyxcbiAgICAgICAgICAgICAgICAgICAgICB0aGlzLmZyZXF1ZW5jeVJhdGlvKTtcbiAgICAgICAgICAgICAgICAvLyBzdGFydCB0aGUgdHJhaW5pbmcgYWdhaW4gZnJvbSB0aGUgbGFzdCBzZXJpZXNcbiAgICAgICAgICAgICAgICB0aGlzLnNlcnZlclRpbWVSZWZlcmVuY2UgPSB0aGlzLnRpbWVPZmZzZXQ7IC8vIG9mZnNldCBvbmx5XG4gICAgICAgICAgICAgICAgdGhpcy5jbGllbnRUaW1lUmVmZXJlbmNlID0gMDtcbiAgICAgICAgICAgICAgICB0aGlzLmZyZXF1ZW5jeVJhdGlvID0gMTtcbiAgICAgICAgICAgICAgICB0aGlzLnNldFN0YXR1cygndHJhaW5pbmcnKTtcblxuICAgICAgICAgICAgICAgIHRoaXMubG9uZ1Rlcm1EYXRhWzBdXG4gICAgICAgICAgICAgICAgICA9IFtzZXJpZXNUcmF2ZWxEdXJhdGlvbiwgc2VyaWVzQ2xpZW50VGltZSwgc2VyaWVzU2VydmVyVGltZSxcbiAgICAgICAgICAgICAgICAgICAgIHNlcmllc0NsaWVudFNxdWFyZWRUaW1lLCBzZXJpZXNDbGllbnRTZXJ2ZXJUaW1lXTtcbiAgICAgICAgICAgICAgICB0aGlzLmxvbmdUZXJtRGF0YS5sZW5ndGggPSAxO1xuICAgICAgICAgICAgICAgIHRoaXMubG9uZ1Rlcm1EYXRhTmV4dEluZGV4ID0gMTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBsb2coJ1QgPSAlcyArICVzICogKCVzIC0gJXMpID0gJXMnLFxuICAgICAgICAgICAgICAgICAgdGhpcy5zZXJ2ZXJUaW1lUmVmZXJlbmNlLCB0aGlzLmZyZXF1ZW5jeVJhdGlvLFxuICAgICAgICAgICAgICAgICAgc2VyaWVzQ2xpZW50VGltZSwgdGhpcy5jbGllbnRUaW1lUmVmZXJlbmNlLFxuICAgICAgICAgICAgICAgICAgdGhpcy5nZXRTeW5jVGltZShzZXJpZXNDbGllbnRUaW1lKSApO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHRoaXMudHJhdmVsRHVyYXRpb24gPSBtZWFuKHNvcnRlZCwgMCk7XG4gICAgICAgICAgdGhpcy50cmF2ZWxEdXJhdGlvbk1pbiA9IHNvcnRlZFswXVswXTtcbiAgICAgICAgICB0aGlzLnRyYXZlbER1cmF0aW9uTWF4ID0gc29ydGVkW3NvcnRlZC5sZW5ndGggLSAxXVswXTtcblxuICAgICAgICAgIHRoaXMucmVwb3J0U3RhdHVzKHJlcG9ydEZ1bmN0aW9uKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyB3ZSBhcmUgaW4gYSBzZXJpZXMsIHVzZSB0aGUgcGluZ0ludGVydmFsIHZhbHVlXG4gICAgICAgICAgdGhpcy5waW5nRGVsYXkgPSB0aGlzLnBpbmdTZXJpZXNQZXJpb2Q7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnRpbWVvdXRJZCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgIHRoaXMuX19zeW5jTG9vcChzZW5kRnVuY3Rpb24sIHJlcG9ydEZ1bmN0aW9uKTtcbiAgICAgICAgfSwgTWF0aC5jZWlsKDEwMDAgKiB0aGlzLnBpbmdEZWxheSkpO1xuICAgICAgfSAgLy8gcGluZyBhbmQgcG9uZyBJRCBtYXRjaFxuICAgIH0pOyAvLyByZWNlaXZlIGZ1bmN0aW9uXG5cbiAgICB0aGlzLl9fc3luY0xvb3Aoc2VuZEZ1bmN0aW9uLCByZXBvcnRGdW5jdGlvbik7XG4gIH1cblxuICAvKipcbiAgICogR2V0IGxvY2FsIHRpbWUsIG9yIGNvbnZlcnQgYSBzeW5jaHJvbmlzZWQgdGltZSB0byBhIGxvY2FsIHRpbWUuXG4gICAqXG4gICAqIEBmdW5jdGlvbiBTeW5jQ2xpZW50fmdldExvY2FsVGltZVxuICAgKiBAcGFyYW0ge051bWJlcn0gc3luY1RpbWUgdW5kZWZpbmVkIHRvIGdldCBsb2NhbCB0aW1lXG4gICAqIEByZXR1cm5zIHtOdW1iZXJ9IGxvY2FsIHRpbWUsIGluIHNlY29uZHNcbiAgICovXG4gIGdldExvY2FsVGltZShzeW5jVGltZSkge1xuICAgIGlmICh0eXBlb2Ygc3luY1RpbWUgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAvLyBjb252ZXJzaW9uOiB0KFQpID0gdDAgKyAoVCAtIFQwKSAvIFJcbiAgICAgIHJldHVybiB0aGlzLmNsaWVudFRpbWVSZWZlcmVuY2VcbiAgICAgICAgKyAoc3luY1RpbWUgLSB0aGlzLnNlcnZlclRpbWVSZWZlcmVuY2UpIC8gdGhpcy5mcmVxdWVuY3lSYXRpbztcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gcmVhZCBsb2NhbCBjbG9ja1xuICAgICAgcmV0dXJuIHRoaXMuZ2V0VGltZUZ1bmN0aW9uKCk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEdldCBzeW5jaHJvbmlzZWQgdGltZSwgb3IgY29udmVydCBhIGxvY2FsIHRpbWUgdG8gYSBzeW5jaHJvbmlzZWQgdGltZS5cbiAgICpcbiAgICogQGZ1bmN0aW9uIFN5bmNDbGllbnR+Z2V0U3luY1RpbWVcbiAgICogQHBhcmFtIHtOdW1iZXJ9IGxvY2FsVGltZSB1bmRlZmluZWQgdG8gZ2V0IHN5bmNocm9uaXNlZCB0aW1lXG4gICAqIEByZXR1cm5zIHtOdW1iZXJ9IHN5bmNocm9uaXNlZCB0aW1lLCBpbiBzZWNvbmRzLlxuICAgKi9cbiAgZ2V0U3luY1RpbWUobG9jYWxUaW1lID0gdGhpcy5nZXRMb2NhbFRpbWUoKSkge1xuICAgIC8vIGFsd2F5cyBjb252ZXJ0OiBUKHQpID0gVDAgKyBSICogKHQgLSB0MClcbiAgICByZXR1cm4gdGhpcy5zZXJ2ZXJUaW1lUmVmZXJlbmNlXG4gICAgICArIHRoaXMuZnJlcXVlbmN5UmF0aW8gKiAobG9jYWxUaW1lIC0gdGhpcy5jbGllbnRUaW1lUmVmZXJlbmNlKTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBTeW5jQ2xpZW50O1xuIiwiZXhwb3J0IHsgZGVmYXVsdCBhcyBTeW5jQ2xpZW50IH0gZnJvbSAnLi9jbGllbnQvaW5kZXgnO1xuZXhwb3J0IHsgZGVmYXVsdCBhcyBTeW5jU2VydmVyIH0gZnJvbSAnLi9zZXJ2ZXIvaW5kZXgnO1xuIiwiaW1wb3J0IGRlYnVnIGZyb20gJ2RlYnVnJztcbmNvbnN0IGxvZyA9IGRlYnVnKCdzeW5jJyk7XG5cbmNsYXNzIFN5bmNTZXJ2ZXIge1xuICAvKipcbiAgICogQGNhbGxiYWNrIFN5bmNTZXJ2ZXJ+Z2V0VGltZUZ1bmN0aW9uXG4gICAqIEByZXR1cm4ge051bWJlcn0gbW9ub3RvbmljLCBldmVyIGluY3JlYXNpbmcsIHRpbWUgaW4gc2Vjb25kLiBXaGVuIHBvc3NpYmxlXG4gICAqICB0aGUgc2VydmVyIGNvZGUgc2hvdWxkIGRlZmluZSBpdHMgb3duIG9yaWdpbiAoaS5lLiBgdGltZT0wYCkgaW4gb3JkZXIgdG9cbiAgICogIG1heGltaXplIHRoZSByZXNvbHV0aW9uIG9mIHRoZSBjbG9jayBmb3IgYSBsb25nIHBlcmlvZCBvZiB0aW1lLiBXaGVuXG4gICAqICBgU3luY1NlcnZlcn5zdGFydGAgaXMgY2FsbGVkIHRoZSBjbG9jayBzaG91bGQgYmUgcnVubmluZ1xuICAgKiAgKGNmLiBgYXVkaW9Db250ZXh0LmN1cnJlbnRUaW1lYCB0aGF0IG5lZWRzIHVzZXIgaW50ZXJhY3Rpb24gdG8gc3RhcnQpXG4gICAqXG4gICAqIEBleGFtcGxlXG4gICAqIGNvbnN0IHN0YXJ0VGltZSA9IHByb2Nlc3MuaHJ0aW1lKCk7XG4gICAqXG4gICAqIGNvbnN0IGdldFRpbWVGdW5jdGlvbiA9ICgpID0+IHtcbiAgICogICBjb25zdCBub3cgPSBwcm9jZXNzLmhydGltZShzdGFydFRpbWUpO1xuICAgKiAgIHJldHVybiBub3dbMF0gKyBub3dbMV0gKiAxZS05O1xuICAgKiB9O1xuICAgKiovXG5cbiAgLyoqXG4gICAqIEBjYWxsYmFjayBTeW5jU2VydmVyfnNlbmRGdW5jdGlvblxuICAgKiBAc2VlIHtAbGlua2NvZGUgU3luY0NsaWVudH5yZWNlaXZlRnVuY3Rpb259XG4gICAqIEBwYXJhbSB7TnVtYmVyfSBwaW5nSWQgdW5pcXVlIGlkZW50aWZpZXJcbiAgICogQHBhcmFtIHtOdW1iZXJ9IGNsaWVudFBpbmdUaW1lIHRpbWUtc3RhbXAgb2YgcGluZyBlbWlzc2lvblxuICAgKiBAcGFyYW0ge051bWJlcn0gc2VydmVyUGluZ1RpbWUgdGltZS1zdGFtcCBvZiBwaW5nIHJlY2VwdGlvblxuICAgKiBAcGFyYW0ge051bWJlcn0gc2VydmVyUG9uZ1RpbWUgdGltZS1zdGFtcCBvZiBwb25nIGVtaXNzaW9uXG4gICAqKi9cblxuICAvKipcbiAgICogQGNhbGxiYWNrIFN5bmNTZXJ2ZXJ+cmVjZWl2ZUZ1bmN0aW9uXG4gICAqIEBzZWUge0BsaW5rY29kZSBTeW5jQ2xpZW50fnNlbmRGdW5jdGlvbn1cbiAgICogQHBhcmFtIHtTeW5jU2VydmVyfnJlY2VpdmVDYWxsYmFja30gcmVjZWl2ZUNhbGxiYWNrIGNhbGxlZCBvblxuICAgKiBlYWNoIG1lc3NhZ2UgbWF0Y2hpbmcgbWVzc2FnZVR5cGUuXG4gICAqKi9cblxuICAvKipcbiAgICogQGNhbGxiYWNrIFN5bmNTZXJ2ZXJ+cmVjZWl2ZUNhbGxiYWNrXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBwaW5nSWQgdW5pcXVlIGlkZW50aWZpZXJcbiAgICogQHBhcmFtIHtOdW1iZXJ9IGNsaWVudFBpbmdUaW1lIHRpbWUtc3RhbXAgb2YgcGluZyBlbWlzc2lvblxuICAgKiovXG5cbiAgLyoqXG4gICAqIFRoaXMgaXMgdGhlIGNvbnN0cnVjdG9yLiBTZWUge0BsaW5rY29kZSBTeW5jU2VydmVyfnN0YXJ0fSBtZXRob2QgdG9cbiAgICogYWN0dWFsbHkgc3RhcnQgYSBzeW5jaHJvbmlzYXRpb24gcHJvY2Vzcy5cbiAgICpcbiAgICogQGNvbnN0cnVjdHMgU3luY1NlcnZlclxuICAgKiBAcGFyYW0ge1N5bmNTZXJ2ZXJ+Z2V0VGltZUZ1bmN0aW9ufSBnZXRUaW1lRnVuY3Rpb24gY2FsbGVkIHRvIGdldCB0aGUgbG9jYWxcbiAgICogdGltZS4gSXQgbXVzdCByZXR1cm4gYSB0aW1lIGluIHNlY29uZHMsIG1vbm90b25pYywgZXZlclxuICAgKiBpbmNyZWFzaW5nLlxuICAgKi9cbiAgY29uc3RydWN0b3IoZ2V0VGltZUZ1bmN0aW9uKSB7XG4gICAgdGhpcy5nZXRUaW1lRnVuY3Rpb24gPSBnZXRUaW1lRnVuY3Rpb247XG4gIH1cblxuICAvKipcbiAgICogU3RhcnQgYSBzeW5jaHJvbmlzYXRpb24gcHJvY2VzcyBieSByZWdpc3RlcmluZyB0aGUgcmVjZWl2ZVxuICAgKiBmdW5jdGlvbiBwYXNzZWQgYXMgc2Vjb25kIHBhcmFtZXRlci4gT24gZWFjaCByZWNlaXZlZCBtZXNzYWdlLFxuICAgKiBzZW5kIGEgcmVwbHkgdXNpbmcgdGhlIGZ1bmN0aW9uIHBhc3NlZCBhcyBmaXJzdCBwYXJhbWV0ZXIuXG4gICAqXG4gICAqIEBmdW5jdGlvbiBTeW5jU2VydmVyfnN0YXJ0XG4gICAqIEBwYXJhbSB7U3luY1NlcnZlcn5zZW5kRnVuY3Rpb259IHNlbmRGdW5jdGlvblxuICAgKiBAcGFyYW0ge1N5bmNTZXJ2ZXJ+cmVjZWl2ZUZ1bmN0aW9ufSByZWNlaXZlRnVuY3Rpb25cbiAgICovXG4gIHN0YXJ0KHNlbmRGdW5jdGlvbiwgcmVjZWl2ZUZ1bmN0aW9uKSB7XG4gICAgcmVjZWl2ZUZ1bmN0aW9uKChpZCwgY2xpZW50UGluZ1RpbWUpID0+IHtcbiAgICAgIGNvbnN0IHNlcnZlclBpbmdUaW1lID0gdGhpcy5nZXRMb2NhbFRpbWUoKTtcbiAgICAgIC8vIHdpdGggdGhpcyBhbGdvcml0aG0sIHRoZSBkdWFsIGNhbGwgdG8gYGdldExvY2FsVGltZWAgY2FuIGFwcGVhclxuICAgICAgLy8gbm9uLW5lY2Vzc2FyeSwgaG93ZXZlciBrZWVwaW5nIHRoaXMgY2FuIGFsbG93IHRvIGltcGxlbWVudCBvdGhlclxuICAgICAgLy8gYWxnb3JpdGhtcyB3aGlsZSBrZWVwaW5nIHRoZSBBUEkgdW5jaGFuZ2VkLCB0aHVzIG1ha2luZyBlYXNpZXJcbiAgICAgIC8vIHRvIGltcGxlbWVudCBhbmQgY29tcGFyZSBzZXZlcmFsIGFsZ29yaXRobXMuXG4gICAgICBzZW5kRnVuY3Rpb24oaWQsIGNsaWVudFBpbmdUaW1lLFxuICAgICAgICAgICAgICAgICAgIHNlcnZlclBpbmdUaW1lLCB0aGlzLmdldExvY2FsVGltZSgpKTtcbiAgICAgIC8vIGxvZygncGluZzogJXMsICVzLCAlcycsIGlkLCBjbGllbnRQaW5nVGltZSwgc2VydmVyUGluZ1RpbWUpO1xuICAgIH0pO1xuXG4gICAgLy8gcmV0dXJuIHNvbWUgaGFuZGxlIHRoYXQgd291bGQgYWxsb3cgdG8gY2xlYW4gbWVtb3J5ID9cbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgbG9jYWwgdGltZSwgb3IgY29udmVydCBhIHN5bmNocm9uaXNlZCB0aW1lIHRvIGEgbG9jYWwgdGltZS5cbiAgICpcbiAgICogQGZ1bmN0aW9uIFN5bmNTZXJ2ZXJ+Z2V0TG9jYWxUaW1lXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBzeW5jVGltZSB1bmRlZmluZWQgdG8gZ2V0IGxvY2FsIHRpbWVcbiAgICogQHJldHVybnMge051bWJlcn0gbG9jYWwgdGltZSwgaW4gc2Vjb25kc1xuICAgKi9cbiAgZ2V0TG9jYWxUaW1lKHN5bmNUaW1lKSB7XG4gICAgaWYgKHR5cGVvZiBzeW5jVGltZSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIHJldHVybiBzeW5jVGltZTsgLy8gc3luYyB0aW1lIGlzIGxvY2FsOiBubyBjb252ZXJzaW9uXG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiB0aGlzLmdldFRpbWVGdW5jdGlvbigpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgc3luY2hyb25pc2VkIHRpbWUsIG9yIGNvbnZlcnQgYSBsb2NhbCB0aW1lIHRvIGEgc3luY2hyb25pc2VkIHRpbWUuXG4gICAqXG4gICAqIEBmdW5jdGlvbiBTeW5jU2VydmVyfmdldFN5bmNUaW1lXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBsb2NhbFRpbWUgdW5kZWZpbmVkIHRvIGdldCBzeW5jaHJvbmlzZWQgdGltZVxuICAgKiBAcmV0dXJucyB7TnVtYmVyfSBzeW5jaHJvbmlzZWQgdGltZSwgaW4gc2Vjb25kcy5cbiAgICovXG4gIGdldFN5bmNUaW1lKGxvY2FsVGltZSkge1xuICAgIHJldHVybiB0aGlzLmdldExvY2FsVGltZShsb2NhbFRpbWUpOyAvLyBzeW5jIHRpbWUgaXMgbG9jYWwsIGhlcmVcbiAgfVxuXG59XG5cbmV4cG9ydCBkZWZhdWx0IFN5bmNTZXJ2ZXI7XG4iLCJtb2R1bGUuZXhwb3J0cyA9IHsgXCJkZWZhdWx0XCI6IHJlcXVpcmUoXCJjb3JlLWpzL2xpYnJhcnkvZm4vanNvbi9zdHJpbmdpZnlcIiksIF9fZXNNb2R1bGU6IHRydWUgfTsiLCJtb2R1bGUuZXhwb3J0cyA9IHsgXCJkZWZhdWx0XCI6IHJlcXVpcmUoXCJjb3JlLWpzL2xpYnJhcnkvZm4vb2JqZWN0L2RlZmluZS1wcm9wZXJ0eVwiKSwgX19lc01vZHVsZTogdHJ1ZSB9OyIsIlwidXNlIHN0cmljdFwiO1xuXG5leHBvcnRzLl9fZXNNb2R1bGUgPSB0cnVlO1xuXG5leHBvcnRzLmRlZmF1bHQgPSBmdW5jdGlvbiAoaW5zdGFuY2UsIENvbnN0cnVjdG9yKSB7XG4gIGlmICghKGluc3RhbmNlIGluc3RhbmNlb2YgQ29uc3RydWN0b3IpKSB7XG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcIkNhbm5vdCBjYWxsIGEgY2xhc3MgYXMgYSBmdW5jdGlvblwiKTtcbiAgfVxufTsiLCJcInVzZSBzdHJpY3RcIjtcblxuZXhwb3J0cy5fX2VzTW9kdWxlID0gdHJ1ZTtcblxudmFyIF9kZWZpbmVQcm9wZXJ0eSA9IHJlcXVpcmUoXCIuLi9jb3JlLWpzL29iamVjdC9kZWZpbmUtcHJvcGVydHlcIik7XG5cbnZhciBfZGVmaW5lUHJvcGVydHkyID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfZGVmaW5lUHJvcGVydHkpO1xuXG5mdW5jdGlvbiBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KG9iaikgeyByZXR1cm4gb2JqICYmIG9iai5fX2VzTW9kdWxlID8gb2JqIDogeyBkZWZhdWx0OiBvYmogfTsgfVxuXG5leHBvcnRzLmRlZmF1bHQgPSBmdW5jdGlvbiAoKSB7XG4gIGZ1bmN0aW9uIGRlZmluZVByb3BlcnRpZXModGFyZ2V0LCBwcm9wcykge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcHJvcHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciBkZXNjcmlwdG9yID0gcHJvcHNbaV07XG4gICAgICBkZXNjcmlwdG9yLmVudW1lcmFibGUgPSBkZXNjcmlwdG9yLmVudW1lcmFibGUgfHwgZmFsc2U7XG4gICAgICBkZXNjcmlwdG9yLmNvbmZpZ3VyYWJsZSA9IHRydWU7XG4gICAgICBpZiAoXCJ2YWx1ZVwiIGluIGRlc2NyaXB0b3IpIGRlc2NyaXB0b3Iud3JpdGFibGUgPSB0cnVlO1xuICAgICAgKDAsIF9kZWZpbmVQcm9wZXJ0eTIuZGVmYXVsdCkodGFyZ2V0LCBkZXNjcmlwdG9yLmtleSwgZGVzY3JpcHRvcik7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGZ1bmN0aW9uIChDb25zdHJ1Y3RvciwgcHJvdG9Qcm9wcywgc3RhdGljUHJvcHMpIHtcbiAgICBpZiAocHJvdG9Qcm9wcykgZGVmaW5lUHJvcGVydGllcyhDb25zdHJ1Y3Rvci5wcm90b3R5cGUsIHByb3RvUHJvcHMpO1xuICAgIGlmIChzdGF0aWNQcm9wcykgZGVmaW5lUHJvcGVydGllcyhDb25zdHJ1Y3Rvciwgc3RhdGljUHJvcHMpO1xuICAgIHJldHVybiBDb25zdHJ1Y3RvcjtcbiAgfTtcbn0oKTsiLCJ2YXIgY29yZSA9IHJlcXVpcmUoJy4uLy4uL21vZHVsZXMvX2NvcmUnKTtcbnZhciAkSlNPTiA9IGNvcmUuSlNPTiB8fCAoY29yZS5KU09OID0geyBzdHJpbmdpZnk6IEpTT04uc3RyaW5naWZ5IH0pO1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBzdHJpbmdpZnkoaXQpIHsgLy8gZXNsaW50LWRpc2FibGUtbGluZSBuby11bnVzZWQtdmFyc1xuICByZXR1cm4gJEpTT04uc3RyaW5naWZ5LmFwcGx5KCRKU09OLCBhcmd1bWVudHMpO1xufTtcbiIsInJlcXVpcmUoJy4uLy4uL21vZHVsZXMvZXM2Lm9iamVjdC5kZWZpbmUtcHJvcGVydHknKTtcbnZhciAkT2JqZWN0ID0gcmVxdWlyZSgnLi4vLi4vbW9kdWxlcy9fY29yZScpLk9iamVjdDtcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZGVmaW5lUHJvcGVydHkoaXQsIGtleSwgZGVzYykge1xuICByZXR1cm4gJE9iamVjdC5kZWZpbmVQcm9wZXJ0eShpdCwga2V5LCBkZXNjKTtcbn07XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChpdCkge1xuICBpZiAodHlwZW9mIGl0ICE9ICdmdW5jdGlvbicpIHRocm93IFR5cGVFcnJvcihpdCArICcgaXMgbm90IGEgZnVuY3Rpb24hJyk7XG4gIHJldHVybiBpdDtcbn07XG4iLCJ2YXIgaXNPYmplY3QgPSByZXF1aXJlKCcuL19pcy1vYmplY3QnKTtcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGl0KSB7XG4gIGlmICghaXNPYmplY3QoaXQpKSB0aHJvdyBUeXBlRXJyb3IoaXQgKyAnIGlzIG5vdCBhbiBvYmplY3QhJyk7XG4gIHJldHVybiBpdDtcbn07XG4iLCJ2YXIgY29yZSA9IG1vZHVsZS5leHBvcnRzID0geyB2ZXJzaW9uOiAnMi42LjEyJyB9O1xuaWYgKHR5cGVvZiBfX2UgPT0gJ251bWJlcicpIF9fZSA9IGNvcmU7IC8vIGVzbGludC1kaXNhYmxlLWxpbmUgbm8tdW5kZWZcbiIsIi8vIG9wdGlvbmFsIC8gc2ltcGxlIGNvbnRleHQgYmluZGluZ1xudmFyIGFGdW5jdGlvbiA9IHJlcXVpcmUoJy4vX2EtZnVuY3Rpb24nKTtcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGZuLCB0aGF0LCBsZW5ndGgpIHtcbiAgYUZ1bmN0aW9uKGZuKTtcbiAgaWYgKHRoYXQgPT09IHVuZGVmaW5lZCkgcmV0dXJuIGZuO1xuICBzd2l0Y2ggKGxlbmd0aCkge1xuICAgIGNhc2UgMTogcmV0dXJuIGZ1bmN0aW9uIChhKSB7XG4gICAgICByZXR1cm4gZm4uY2FsbCh0aGF0LCBhKTtcbiAgICB9O1xuICAgIGNhc2UgMjogcmV0dXJuIGZ1bmN0aW9uIChhLCBiKSB7XG4gICAgICByZXR1cm4gZm4uY2FsbCh0aGF0LCBhLCBiKTtcbiAgICB9O1xuICAgIGNhc2UgMzogcmV0dXJuIGZ1bmN0aW9uIChhLCBiLCBjKSB7XG4gICAgICByZXR1cm4gZm4uY2FsbCh0aGF0LCBhLCBiLCBjKTtcbiAgICB9O1xuICB9XG4gIHJldHVybiBmdW5jdGlvbiAoLyogLi4uYXJncyAqLykge1xuICAgIHJldHVybiBmbi5hcHBseSh0aGF0LCBhcmd1bWVudHMpO1xuICB9O1xufTtcbiIsIi8vIFRoYW5rJ3MgSUU4IGZvciBoaXMgZnVubnkgZGVmaW5lUHJvcGVydHlcbm1vZHVsZS5leHBvcnRzID0gIXJlcXVpcmUoJy4vX2ZhaWxzJykoZnVuY3Rpb24gKCkge1xuICByZXR1cm4gT2JqZWN0LmRlZmluZVByb3BlcnR5KHt9LCAnYScsIHsgZ2V0OiBmdW5jdGlvbiAoKSB7IHJldHVybiA3OyB9IH0pLmEgIT0gNztcbn0pO1xuIiwidmFyIGlzT2JqZWN0ID0gcmVxdWlyZSgnLi9faXMtb2JqZWN0Jyk7XG52YXIgZG9jdW1lbnQgPSByZXF1aXJlKCcuL19nbG9iYWwnKS5kb2N1bWVudDtcbi8vIHR5cGVvZiBkb2N1bWVudC5jcmVhdGVFbGVtZW50IGlzICdvYmplY3QnIGluIG9sZCBJRVxudmFyIGlzID0gaXNPYmplY3QoZG9jdW1lbnQpICYmIGlzT2JqZWN0KGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQpO1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoaXQpIHtcbiAgcmV0dXJuIGlzID8gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChpdCkgOiB7fTtcbn07XG4iLCJ2YXIgZ2xvYmFsID0gcmVxdWlyZSgnLi9fZ2xvYmFsJyk7XG52YXIgY29yZSA9IHJlcXVpcmUoJy4vX2NvcmUnKTtcbnZhciBjdHggPSByZXF1aXJlKCcuL19jdHgnKTtcbnZhciBoaWRlID0gcmVxdWlyZSgnLi9faGlkZScpO1xudmFyIGhhcyA9IHJlcXVpcmUoJy4vX2hhcycpO1xudmFyIFBST1RPVFlQRSA9ICdwcm90b3R5cGUnO1xuXG52YXIgJGV4cG9ydCA9IGZ1bmN0aW9uICh0eXBlLCBuYW1lLCBzb3VyY2UpIHtcbiAgdmFyIElTX0ZPUkNFRCA9IHR5cGUgJiAkZXhwb3J0LkY7XG4gIHZhciBJU19HTE9CQUwgPSB0eXBlICYgJGV4cG9ydC5HO1xuICB2YXIgSVNfU1RBVElDID0gdHlwZSAmICRleHBvcnQuUztcbiAgdmFyIElTX1BST1RPID0gdHlwZSAmICRleHBvcnQuUDtcbiAgdmFyIElTX0JJTkQgPSB0eXBlICYgJGV4cG9ydC5CO1xuICB2YXIgSVNfV1JBUCA9IHR5cGUgJiAkZXhwb3J0Llc7XG4gIHZhciBleHBvcnRzID0gSVNfR0xPQkFMID8gY29yZSA6IGNvcmVbbmFtZV0gfHwgKGNvcmVbbmFtZV0gPSB7fSk7XG4gIHZhciBleHBQcm90byA9IGV4cG9ydHNbUFJPVE9UWVBFXTtcbiAgdmFyIHRhcmdldCA9IElTX0dMT0JBTCA/IGdsb2JhbCA6IElTX1NUQVRJQyA/IGdsb2JhbFtuYW1lXSA6IChnbG9iYWxbbmFtZV0gfHwge30pW1BST1RPVFlQRV07XG4gIHZhciBrZXksIG93biwgb3V0O1xuICBpZiAoSVNfR0xPQkFMKSBzb3VyY2UgPSBuYW1lO1xuICBmb3IgKGtleSBpbiBzb3VyY2UpIHtcbiAgICAvLyBjb250YWlucyBpbiBuYXRpdmVcbiAgICBvd24gPSAhSVNfRk9SQ0VEICYmIHRhcmdldCAmJiB0YXJnZXRba2V5XSAhPT0gdW5kZWZpbmVkO1xuICAgIGlmIChvd24gJiYgaGFzKGV4cG9ydHMsIGtleSkpIGNvbnRpbnVlO1xuICAgIC8vIGV4cG9ydCBuYXRpdmUgb3IgcGFzc2VkXG4gICAgb3V0ID0gb3duID8gdGFyZ2V0W2tleV0gOiBzb3VyY2Vba2V5XTtcbiAgICAvLyBwcmV2ZW50IGdsb2JhbCBwb2xsdXRpb24gZm9yIG5hbWVzcGFjZXNcbiAgICBleHBvcnRzW2tleV0gPSBJU19HTE9CQUwgJiYgdHlwZW9mIHRhcmdldFtrZXldICE9ICdmdW5jdGlvbicgPyBzb3VyY2Vba2V5XVxuICAgIC8vIGJpbmQgdGltZXJzIHRvIGdsb2JhbCBmb3IgY2FsbCBmcm9tIGV4cG9ydCBjb250ZXh0XG4gICAgOiBJU19CSU5EICYmIG93biA/IGN0eChvdXQsIGdsb2JhbClcbiAgICAvLyB3cmFwIGdsb2JhbCBjb25zdHJ1Y3RvcnMgZm9yIHByZXZlbnQgY2hhbmdlIHRoZW0gaW4gbGlicmFyeVxuICAgIDogSVNfV1JBUCAmJiB0YXJnZXRba2V5XSA9PSBvdXQgPyAoZnVuY3Rpb24gKEMpIHtcbiAgICAgIHZhciBGID0gZnVuY3Rpb24gKGEsIGIsIGMpIHtcbiAgICAgICAgaWYgKHRoaXMgaW5zdGFuY2VvZiBDKSB7XG4gICAgICAgICAgc3dpdGNoIChhcmd1bWVudHMubGVuZ3RoKSB7XG4gICAgICAgICAgICBjYXNlIDA6IHJldHVybiBuZXcgQygpO1xuICAgICAgICAgICAgY2FzZSAxOiByZXR1cm4gbmV3IEMoYSk7XG4gICAgICAgICAgICBjYXNlIDI6IHJldHVybiBuZXcgQyhhLCBiKTtcbiAgICAgICAgICB9IHJldHVybiBuZXcgQyhhLCBiLCBjKTtcbiAgICAgICAgfSByZXR1cm4gQy5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgfTtcbiAgICAgIEZbUFJPVE9UWVBFXSA9IENbUFJPVE9UWVBFXTtcbiAgICAgIHJldHVybiBGO1xuICAgIC8vIG1ha2Ugc3RhdGljIHZlcnNpb25zIGZvciBwcm90b3R5cGUgbWV0aG9kc1xuICAgIH0pKG91dCkgOiBJU19QUk9UTyAmJiB0eXBlb2Ygb3V0ID09ICdmdW5jdGlvbicgPyBjdHgoRnVuY3Rpb24uY2FsbCwgb3V0KSA6IG91dDtcbiAgICAvLyBleHBvcnQgcHJvdG8gbWV0aG9kcyB0byBjb3JlLiVDT05TVFJVQ1RPUiUubWV0aG9kcy4lTkFNRSVcbiAgICBpZiAoSVNfUFJPVE8pIHtcbiAgICAgIChleHBvcnRzLnZpcnR1YWwgfHwgKGV4cG9ydHMudmlydHVhbCA9IHt9KSlba2V5XSA9IG91dDtcbiAgICAgIC8vIGV4cG9ydCBwcm90byBtZXRob2RzIHRvIGNvcmUuJUNPTlNUUlVDVE9SJS5wcm90b3R5cGUuJU5BTUUlXG4gICAgICBpZiAodHlwZSAmICRleHBvcnQuUiAmJiBleHBQcm90byAmJiAhZXhwUHJvdG9ba2V5XSkgaGlkZShleHBQcm90bywga2V5LCBvdXQpO1xuICAgIH1cbiAgfVxufTtcbi8vIHR5cGUgYml0bWFwXG4kZXhwb3J0LkYgPSAxOyAgIC8vIGZvcmNlZFxuJGV4cG9ydC5HID0gMjsgICAvLyBnbG9iYWxcbiRleHBvcnQuUyA9IDQ7ICAgLy8gc3RhdGljXG4kZXhwb3J0LlAgPSA4OyAgIC8vIHByb3RvXG4kZXhwb3J0LkIgPSAxNjsgIC8vIGJpbmRcbiRleHBvcnQuVyA9IDMyOyAgLy8gd3JhcFxuJGV4cG9ydC5VID0gNjQ7ICAvLyBzYWZlXG4kZXhwb3J0LlIgPSAxMjg7IC8vIHJlYWwgcHJvdG8gbWV0aG9kIGZvciBgbGlicmFyeWBcbm1vZHVsZS5leHBvcnRzID0gJGV4cG9ydDtcbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGV4ZWMpIHtcbiAgdHJ5IHtcbiAgICByZXR1cm4gISFleGVjKCk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxufTtcbiIsIi8vIGh0dHBzOi8vZ2l0aHViLmNvbS96bG9pcm9jay9jb3JlLWpzL2lzc3Vlcy84NiNpc3N1ZWNvbW1lbnQtMTE1NzU5MDI4XG52YXIgZ2xvYmFsID0gbW9kdWxlLmV4cG9ydHMgPSB0eXBlb2Ygd2luZG93ICE9ICd1bmRlZmluZWQnICYmIHdpbmRvdy5NYXRoID09IE1hdGhcbiAgPyB3aW5kb3cgOiB0eXBlb2Ygc2VsZiAhPSAndW5kZWZpbmVkJyAmJiBzZWxmLk1hdGggPT0gTWF0aCA/IHNlbGZcbiAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLW5ldy1mdW5jXG4gIDogRnVuY3Rpb24oJ3JldHVybiB0aGlzJykoKTtcbmlmICh0eXBlb2YgX19nID09ICdudW1iZXInKSBfX2cgPSBnbG9iYWw7IC8vIGVzbGludC1kaXNhYmxlLWxpbmUgbm8tdW5kZWZcbiIsInZhciBoYXNPd25Qcm9wZXJ0eSA9IHt9Lmhhc093blByb3BlcnR5O1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoaXQsIGtleSkge1xuICByZXR1cm4gaGFzT3duUHJvcGVydHkuY2FsbChpdCwga2V5KTtcbn07XG4iLCJ2YXIgZFAgPSByZXF1aXJlKCcuL19vYmplY3QtZHAnKTtcbnZhciBjcmVhdGVEZXNjID0gcmVxdWlyZSgnLi9fcHJvcGVydHktZGVzYycpO1xubW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKCcuL19kZXNjcmlwdG9ycycpID8gZnVuY3Rpb24gKG9iamVjdCwga2V5LCB2YWx1ZSkge1xuICByZXR1cm4gZFAuZihvYmplY3QsIGtleSwgY3JlYXRlRGVzYygxLCB2YWx1ZSkpO1xufSA6IGZ1bmN0aW9uIChvYmplY3QsIGtleSwgdmFsdWUpIHtcbiAgb2JqZWN0W2tleV0gPSB2YWx1ZTtcbiAgcmV0dXJuIG9iamVjdDtcbn07XG4iLCJtb2R1bGUuZXhwb3J0cyA9ICFyZXF1aXJlKCcuL19kZXNjcmlwdG9ycycpICYmICFyZXF1aXJlKCcuL19mYWlscycpKGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShyZXF1aXJlKCcuL19kb20tY3JlYXRlJykoJ2RpdicpLCAnYScsIHsgZ2V0OiBmdW5jdGlvbiAoKSB7IHJldHVybiA3OyB9IH0pLmEgIT0gNztcbn0pO1xuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoaXQpIHtcbiAgcmV0dXJuIHR5cGVvZiBpdCA9PT0gJ29iamVjdCcgPyBpdCAhPT0gbnVsbCA6IHR5cGVvZiBpdCA9PT0gJ2Z1bmN0aW9uJztcbn07XG4iLCJ2YXIgYW5PYmplY3QgPSByZXF1aXJlKCcuL19hbi1vYmplY3QnKTtcbnZhciBJRThfRE9NX0RFRklORSA9IHJlcXVpcmUoJy4vX2llOC1kb20tZGVmaW5lJyk7XG52YXIgdG9QcmltaXRpdmUgPSByZXF1aXJlKCcuL190by1wcmltaXRpdmUnKTtcbnZhciBkUCA9IE9iamVjdC5kZWZpbmVQcm9wZXJ0eTtcblxuZXhwb3J0cy5mID0gcmVxdWlyZSgnLi9fZGVzY3JpcHRvcnMnKSA/IE9iamVjdC5kZWZpbmVQcm9wZXJ0eSA6IGZ1bmN0aW9uIGRlZmluZVByb3BlcnR5KE8sIFAsIEF0dHJpYnV0ZXMpIHtcbiAgYW5PYmplY3QoTyk7XG4gIFAgPSB0b1ByaW1pdGl2ZShQLCB0cnVlKTtcbiAgYW5PYmplY3QoQXR0cmlidXRlcyk7XG4gIGlmIChJRThfRE9NX0RFRklORSkgdHJ5IHtcbiAgICByZXR1cm4gZFAoTywgUCwgQXR0cmlidXRlcyk7XG4gIH0gY2F0Y2ggKGUpIHsgLyogZW1wdHkgKi8gfVxuICBpZiAoJ2dldCcgaW4gQXR0cmlidXRlcyB8fCAnc2V0JyBpbiBBdHRyaWJ1dGVzKSB0aHJvdyBUeXBlRXJyb3IoJ0FjY2Vzc29ycyBub3Qgc3VwcG9ydGVkIScpO1xuICBpZiAoJ3ZhbHVlJyBpbiBBdHRyaWJ1dGVzKSBPW1BdID0gQXR0cmlidXRlcy52YWx1ZTtcbiAgcmV0dXJuIE87XG59O1xuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoYml0bWFwLCB2YWx1ZSkge1xuICByZXR1cm4ge1xuICAgIGVudW1lcmFibGU6ICEoYml0bWFwICYgMSksXG4gICAgY29uZmlndXJhYmxlOiAhKGJpdG1hcCAmIDIpLFxuICAgIHdyaXRhYmxlOiAhKGJpdG1hcCAmIDQpLFxuICAgIHZhbHVlOiB2YWx1ZVxuICB9O1xufTtcbiIsIi8vIDcuMS4xIFRvUHJpbWl0aXZlKGlucHV0IFssIFByZWZlcnJlZFR5cGVdKVxudmFyIGlzT2JqZWN0ID0gcmVxdWlyZSgnLi9faXMtb2JqZWN0Jyk7XG4vLyBpbnN0ZWFkIG9mIHRoZSBFUzYgc3BlYyB2ZXJzaW9uLCB3ZSBkaWRuJ3QgaW1wbGVtZW50IEBAdG9QcmltaXRpdmUgY2FzZVxuLy8gYW5kIHRoZSBzZWNvbmQgYXJndW1lbnQgLSBmbGFnIC0gcHJlZmVycmVkIHR5cGUgaXMgYSBzdHJpbmdcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGl0LCBTKSB7XG4gIGlmICghaXNPYmplY3QoaXQpKSByZXR1cm4gaXQ7XG4gIHZhciBmbiwgdmFsO1xuICBpZiAoUyAmJiB0eXBlb2YgKGZuID0gaXQudG9TdHJpbmcpID09ICdmdW5jdGlvbicgJiYgIWlzT2JqZWN0KHZhbCA9IGZuLmNhbGwoaXQpKSkgcmV0dXJuIHZhbDtcbiAgaWYgKHR5cGVvZiAoZm4gPSBpdC52YWx1ZU9mKSA9PSAnZnVuY3Rpb24nICYmICFpc09iamVjdCh2YWwgPSBmbi5jYWxsKGl0KSkpIHJldHVybiB2YWw7XG4gIGlmICghUyAmJiB0eXBlb2YgKGZuID0gaXQudG9TdHJpbmcpID09ICdmdW5jdGlvbicgJiYgIWlzT2JqZWN0KHZhbCA9IGZuLmNhbGwoaXQpKSkgcmV0dXJuIHZhbDtcbiAgdGhyb3cgVHlwZUVycm9yKFwiQ2FuJ3QgY29udmVydCBvYmplY3QgdG8gcHJpbWl0aXZlIHZhbHVlXCIpO1xufTtcbiIsInZhciAkZXhwb3J0ID0gcmVxdWlyZSgnLi9fZXhwb3J0Jyk7XG4vLyAxOS4xLjIuNCAvIDE1LjIuMy42IE9iamVjdC5kZWZpbmVQcm9wZXJ0eShPLCBQLCBBdHRyaWJ1dGVzKVxuJGV4cG9ydCgkZXhwb3J0LlMgKyAkZXhwb3J0LkYgKiAhcmVxdWlyZSgnLi9fZGVzY3JpcHRvcnMnKSwgJ09iamVjdCcsIHsgZGVmaW5lUHJvcGVydHk6IHJlcXVpcmUoJy4vX29iamVjdC1kcCcpLmYgfSk7XG4iLCIvKipcbiAqIFRoaXMgaXMgdGhlIHdlYiBicm93c2VyIGltcGxlbWVudGF0aW9uIG9mIGBkZWJ1ZygpYC5cbiAqXG4gKiBFeHBvc2UgYGRlYnVnKClgIGFzIHRoZSBtb2R1bGUuXG4gKi9cblxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gcmVxdWlyZSgnLi9kZWJ1ZycpO1xuZXhwb3J0cy5sb2cgPSBsb2c7XG5leHBvcnRzLmZvcm1hdEFyZ3MgPSBmb3JtYXRBcmdzO1xuZXhwb3J0cy5zYXZlID0gc2F2ZTtcbmV4cG9ydHMubG9hZCA9IGxvYWQ7XG5leHBvcnRzLnVzZUNvbG9ycyA9IHVzZUNvbG9ycztcbmV4cG9ydHMuc3RvcmFnZSA9ICd1bmRlZmluZWQnICE9IHR5cGVvZiBjaHJvbWVcbiAgICAgICAgICAgICAgICYmICd1bmRlZmluZWQnICE9IHR5cGVvZiBjaHJvbWUuc3RvcmFnZVxuICAgICAgICAgICAgICAgICAgPyBjaHJvbWUuc3RvcmFnZS5sb2NhbFxuICAgICAgICAgICAgICAgICAgOiBsb2NhbHN0b3JhZ2UoKTtcblxuLyoqXG4gKiBDb2xvcnMuXG4gKi9cblxuZXhwb3J0cy5jb2xvcnMgPSBbXG4gICcjMDAwMENDJywgJyMwMDAwRkYnLCAnIzAwMzNDQycsICcjMDAzM0ZGJywgJyMwMDY2Q0MnLCAnIzAwNjZGRicsICcjMDA5OUNDJyxcbiAgJyMwMDk5RkYnLCAnIzAwQ0MwMCcsICcjMDBDQzMzJywgJyMwMENDNjYnLCAnIzAwQ0M5OScsICcjMDBDQ0NDJywgJyMwMENDRkYnLFxuICAnIzMzMDBDQycsICcjMzMwMEZGJywgJyMzMzMzQ0MnLCAnIzMzMzNGRicsICcjMzM2NkNDJywgJyMzMzY2RkYnLCAnIzMzOTlDQycsXG4gICcjMzM5OUZGJywgJyMzM0NDMDAnLCAnIzMzQ0MzMycsICcjMzNDQzY2JywgJyMzM0NDOTknLCAnIzMzQ0NDQycsICcjMzNDQ0ZGJyxcbiAgJyM2NjAwQ0MnLCAnIzY2MDBGRicsICcjNjYzM0NDJywgJyM2NjMzRkYnLCAnIzY2Q0MwMCcsICcjNjZDQzMzJywgJyM5OTAwQ0MnLFxuICAnIzk5MDBGRicsICcjOTkzM0NDJywgJyM5OTMzRkYnLCAnIzk5Q0MwMCcsICcjOTlDQzMzJywgJyNDQzAwMDAnLCAnI0NDMDAzMycsXG4gICcjQ0MwMDY2JywgJyNDQzAwOTknLCAnI0NDMDBDQycsICcjQ0MwMEZGJywgJyNDQzMzMDAnLCAnI0NDMzMzMycsICcjQ0MzMzY2JyxcbiAgJyNDQzMzOTknLCAnI0NDMzNDQycsICcjQ0MzM0ZGJywgJyNDQzY2MDAnLCAnI0NDNjYzMycsICcjQ0M5OTAwJywgJyNDQzk5MzMnLFxuICAnI0NDQ0MwMCcsICcjQ0NDQzMzJywgJyNGRjAwMDAnLCAnI0ZGMDAzMycsICcjRkYwMDY2JywgJyNGRjAwOTknLCAnI0ZGMDBDQycsXG4gICcjRkYwMEZGJywgJyNGRjMzMDAnLCAnI0ZGMzMzMycsICcjRkYzMzY2JywgJyNGRjMzOTknLCAnI0ZGMzNDQycsICcjRkYzM0ZGJyxcbiAgJyNGRjY2MDAnLCAnI0ZGNjYzMycsICcjRkY5OTAwJywgJyNGRjk5MzMnLCAnI0ZGQ0MwMCcsICcjRkZDQzMzJ1xuXTtcblxuLyoqXG4gKiBDdXJyZW50bHkgb25seSBXZWJLaXQtYmFzZWQgV2ViIEluc3BlY3RvcnMsIEZpcmVmb3ggPj0gdjMxLFxuICogYW5kIHRoZSBGaXJlYnVnIGV4dGVuc2lvbiAoYW55IEZpcmVmb3ggdmVyc2lvbikgYXJlIGtub3duXG4gKiB0byBzdXBwb3J0IFwiJWNcIiBDU1MgY3VzdG9taXphdGlvbnMuXG4gKlxuICogVE9ETzogYWRkIGEgYGxvY2FsU3RvcmFnZWAgdmFyaWFibGUgdG8gZXhwbGljaXRseSBlbmFibGUvZGlzYWJsZSBjb2xvcnNcbiAqL1xuXG5mdW5jdGlvbiB1c2VDb2xvcnMoKSB7XG4gIC8vIE5COiBJbiBhbiBFbGVjdHJvbiBwcmVsb2FkIHNjcmlwdCwgZG9jdW1lbnQgd2lsbCBiZSBkZWZpbmVkIGJ1dCBub3QgZnVsbHlcbiAgLy8gaW5pdGlhbGl6ZWQuIFNpbmNlIHdlIGtub3cgd2UncmUgaW4gQ2hyb21lLCB3ZSdsbCBqdXN0IGRldGVjdCB0aGlzIGNhc2VcbiAgLy8gZXhwbGljaXRseVxuICBpZiAodHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgJiYgd2luZG93LnByb2Nlc3MgJiYgd2luZG93LnByb2Nlc3MudHlwZSA9PT0gJ3JlbmRlcmVyJykge1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgLy8gSW50ZXJuZXQgRXhwbG9yZXIgYW5kIEVkZ2UgZG8gbm90IHN1cHBvcnQgY29sb3JzLlxuICBpZiAodHlwZW9mIG5hdmlnYXRvciAhPT0gJ3VuZGVmaW5lZCcgJiYgbmF2aWdhdG9yLnVzZXJBZ2VudCAmJiBuYXZpZ2F0b3IudXNlckFnZW50LnRvTG93ZXJDYXNlKCkubWF0Y2goLyhlZGdlfHRyaWRlbnQpXFwvKFxcZCspLykpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICAvLyBpcyB3ZWJraXQ/IGh0dHA6Ly9zdGFja292ZXJmbG93LmNvbS9hLzE2NDU5NjA2LzM3Njc3M1xuICAvLyBkb2N1bWVudCBpcyB1bmRlZmluZWQgaW4gcmVhY3QtbmF0aXZlOiBodHRwczovL2dpdGh1Yi5jb20vZmFjZWJvb2svcmVhY3QtbmF0aXZlL3B1bGwvMTYzMlxuICByZXR1cm4gKHR5cGVvZiBkb2N1bWVudCAhPT0gJ3VuZGVmaW5lZCcgJiYgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50ICYmIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5zdHlsZSAmJiBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuc3R5bGUuV2Via2l0QXBwZWFyYW5jZSkgfHxcbiAgICAvLyBpcyBmaXJlYnVnPyBodHRwOi8vc3RhY2tvdmVyZmxvdy5jb20vYS8zOTgxMjAvMzc2NzczXG4gICAgKHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnICYmIHdpbmRvdy5jb25zb2xlICYmICh3aW5kb3cuY29uc29sZS5maXJlYnVnIHx8ICh3aW5kb3cuY29uc29sZS5leGNlcHRpb24gJiYgd2luZG93LmNvbnNvbGUudGFibGUpKSkgfHxcbiAgICAvLyBpcyBmaXJlZm94ID49IHYzMT9cbiAgICAvLyBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1Rvb2xzL1dlYl9Db25zb2xlI1N0eWxpbmdfbWVzc2FnZXNcbiAgICAodHlwZW9mIG5hdmlnYXRvciAhPT0gJ3VuZGVmaW5lZCcgJiYgbmF2aWdhdG9yLnVzZXJBZ2VudCAmJiBuYXZpZ2F0b3IudXNlckFnZW50LnRvTG93ZXJDYXNlKCkubWF0Y2goL2ZpcmVmb3hcXC8oXFxkKykvKSAmJiBwYXJzZUludChSZWdFeHAuJDEsIDEwKSA+PSAzMSkgfHxcbiAgICAvLyBkb3VibGUgY2hlY2sgd2Via2l0IGluIHVzZXJBZ2VudCBqdXN0IGluIGNhc2Ugd2UgYXJlIGluIGEgd29ya2VyXG4gICAgKHR5cGVvZiBuYXZpZ2F0b3IgIT09ICd1bmRlZmluZWQnICYmIG5hdmlnYXRvci51c2VyQWdlbnQgJiYgbmF2aWdhdG9yLnVzZXJBZ2VudC50b0xvd2VyQ2FzZSgpLm1hdGNoKC9hcHBsZXdlYmtpdFxcLyhcXGQrKS8pKTtcbn1cblxuLyoqXG4gKiBNYXAgJWogdG8gYEpTT04uc3RyaW5naWZ5KClgLCBzaW5jZSBubyBXZWIgSW5zcGVjdG9ycyBkbyB0aGF0IGJ5IGRlZmF1bHQuXG4gKi9cblxuZXhwb3J0cy5mb3JtYXR0ZXJzLmogPSBmdW5jdGlvbih2KSB7XG4gIHRyeSB7XG4gICAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KHYpO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICByZXR1cm4gJ1tVbmV4cGVjdGVkSlNPTlBhcnNlRXJyb3JdOiAnICsgZXJyLm1lc3NhZ2U7XG4gIH1cbn07XG5cblxuLyoqXG4gKiBDb2xvcml6ZSBsb2cgYXJndW1lbnRzIGlmIGVuYWJsZWQuXG4gKlxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBmb3JtYXRBcmdzKGFyZ3MpIHtcbiAgdmFyIHVzZUNvbG9ycyA9IHRoaXMudXNlQ29sb3JzO1xuXG4gIGFyZ3NbMF0gPSAodXNlQ29sb3JzID8gJyVjJyA6ICcnKVxuICAgICsgdGhpcy5uYW1lc3BhY2VcbiAgICArICh1c2VDb2xvcnMgPyAnICVjJyA6ICcgJylcbiAgICArIGFyZ3NbMF1cbiAgICArICh1c2VDb2xvcnMgPyAnJWMgJyA6ICcgJylcbiAgICArICcrJyArIGV4cG9ydHMuaHVtYW5pemUodGhpcy5kaWZmKTtcblxuICBpZiAoIXVzZUNvbG9ycykgcmV0dXJuO1xuXG4gIHZhciBjID0gJ2NvbG9yOiAnICsgdGhpcy5jb2xvcjtcbiAgYXJncy5zcGxpY2UoMSwgMCwgYywgJ2NvbG9yOiBpbmhlcml0JylcblxuICAvLyB0aGUgZmluYWwgXCIlY1wiIGlzIHNvbWV3aGF0IHRyaWNreSwgYmVjYXVzZSB0aGVyZSBjb3VsZCBiZSBvdGhlclxuICAvLyBhcmd1bWVudHMgcGFzc2VkIGVpdGhlciBiZWZvcmUgb3IgYWZ0ZXIgdGhlICVjLCBzbyB3ZSBuZWVkIHRvXG4gIC8vIGZpZ3VyZSBvdXQgdGhlIGNvcnJlY3QgaW5kZXggdG8gaW5zZXJ0IHRoZSBDU1MgaW50b1xuICB2YXIgaW5kZXggPSAwO1xuICB2YXIgbGFzdEMgPSAwO1xuICBhcmdzWzBdLnJlcGxhY2UoLyVbYS16QS1aJV0vZywgZnVuY3Rpb24obWF0Y2gpIHtcbiAgICBpZiAoJyUlJyA9PT0gbWF0Y2gpIHJldHVybjtcbiAgICBpbmRleCsrO1xuICAgIGlmICgnJWMnID09PSBtYXRjaCkge1xuICAgICAgLy8gd2Ugb25seSBhcmUgaW50ZXJlc3RlZCBpbiB0aGUgKmxhc3QqICVjXG4gICAgICAvLyAodGhlIHVzZXIgbWF5IGhhdmUgcHJvdmlkZWQgdGhlaXIgb3duKVxuICAgICAgbGFzdEMgPSBpbmRleDtcbiAgICB9XG4gIH0pO1xuXG4gIGFyZ3Muc3BsaWNlKGxhc3RDLCAwLCBjKTtcbn1cblxuLyoqXG4gKiBJbnZva2VzIGBjb25zb2xlLmxvZygpYCB3aGVuIGF2YWlsYWJsZS5cbiAqIE5vLW9wIHdoZW4gYGNvbnNvbGUubG9nYCBpcyBub3QgYSBcImZ1bmN0aW9uXCIuXG4gKlxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBsb2coKSB7XG4gIC8vIHRoaXMgaGFja2VyeSBpcyByZXF1aXJlZCBmb3IgSUU4LzksIHdoZXJlXG4gIC8vIHRoZSBgY29uc29sZS5sb2dgIGZ1bmN0aW9uIGRvZXNuJ3QgaGF2ZSAnYXBwbHknXG4gIHJldHVybiAnb2JqZWN0JyA9PT0gdHlwZW9mIGNvbnNvbGVcbiAgICAmJiBjb25zb2xlLmxvZ1xuICAgICYmIEZ1bmN0aW9uLnByb3RvdHlwZS5hcHBseS5jYWxsKGNvbnNvbGUubG9nLCBjb25zb2xlLCBhcmd1bWVudHMpO1xufVxuXG4vKipcbiAqIFNhdmUgYG5hbWVzcGFjZXNgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lc3BhY2VzXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBzYXZlKG5hbWVzcGFjZXMpIHtcbiAgdHJ5IHtcbiAgICBpZiAobnVsbCA9PSBuYW1lc3BhY2VzKSB7XG4gICAgICBleHBvcnRzLnN0b3JhZ2UucmVtb3ZlSXRlbSgnZGVidWcnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgZXhwb3J0cy5zdG9yYWdlLmRlYnVnID0gbmFtZXNwYWNlcztcbiAgICB9XG4gIH0gY2F0Y2goZSkge31cbn1cblxuLyoqXG4gKiBMb2FkIGBuYW1lc3BhY2VzYC5cbiAqXG4gKiBAcmV0dXJuIHtTdHJpbmd9IHJldHVybnMgdGhlIHByZXZpb3VzbHkgcGVyc2lzdGVkIGRlYnVnIG1vZGVzXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBsb2FkKCkge1xuICB2YXIgcjtcbiAgdHJ5IHtcbiAgICByID0gZXhwb3J0cy5zdG9yYWdlLmRlYnVnO1xuICB9IGNhdGNoKGUpIHt9XG5cbiAgLy8gSWYgZGVidWcgaXNuJ3Qgc2V0IGluIExTLCBhbmQgd2UncmUgaW4gRWxlY3Ryb24sIHRyeSB0byBsb2FkICRERUJVR1xuICBpZiAoIXIgJiYgdHlwZW9mIHByb2Nlc3MgIT09ICd1bmRlZmluZWQnICYmICdlbnYnIGluIHByb2Nlc3MpIHtcbiAgICByID0gcHJvY2Vzcy5lbnYuREVCVUc7XG4gIH1cblxuICByZXR1cm4gcjtcbn1cblxuLyoqXG4gKiBFbmFibGUgbmFtZXNwYWNlcyBsaXN0ZWQgaW4gYGxvY2FsU3RvcmFnZS5kZWJ1Z2AgaW5pdGlhbGx5LlxuICovXG5cbmV4cG9ydHMuZW5hYmxlKGxvYWQoKSk7XG5cbi8qKlxuICogTG9jYWxzdG9yYWdlIGF0dGVtcHRzIHRvIHJldHVybiB0aGUgbG9jYWxzdG9yYWdlLlxuICpcbiAqIFRoaXMgaXMgbmVjZXNzYXJ5IGJlY2F1c2Ugc2FmYXJpIHRocm93c1xuICogd2hlbiBhIHVzZXIgZGlzYWJsZXMgY29va2llcy9sb2NhbHN0b3JhZ2VcbiAqIGFuZCB5b3UgYXR0ZW1wdCB0byBhY2Nlc3MgaXQuXG4gKlxuICogQHJldHVybiB7TG9jYWxTdG9yYWdlfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gbG9jYWxzdG9yYWdlKCkge1xuICB0cnkge1xuICAgIHJldHVybiB3aW5kb3cubG9jYWxTdG9yYWdlO1xuICB9IGNhdGNoIChlKSB7fVxufVxuIiwiXG4vKipcbiAqIFRoaXMgaXMgdGhlIGNvbW1vbiBsb2dpYyBmb3IgYm90aCB0aGUgTm9kZS5qcyBhbmQgd2ViIGJyb3dzZXJcbiAqIGltcGxlbWVudGF0aW9ucyBvZiBgZGVidWcoKWAuXG4gKlxuICogRXhwb3NlIGBkZWJ1ZygpYCBhcyB0aGUgbW9kdWxlLlxuICovXG5cbmV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IGNyZWF0ZURlYnVnLmRlYnVnID0gY3JlYXRlRGVidWdbJ2RlZmF1bHQnXSA9IGNyZWF0ZURlYnVnO1xuZXhwb3J0cy5jb2VyY2UgPSBjb2VyY2U7XG5leHBvcnRzLmRpc2FibGUgPSBkaXNhYmxlO1xuZXhwb3J0cy5lbmFibGUgPSBlbmFibGU7XG5leHBvcnRzLmVuYWJsZWQgPSBlbmFibGVkO1xuZXhwb3J0cy5odW1hbml6ZSA9IHJlcXVpcmUoJ21zJyk7XG5cbi8qKlxuICogQWN0aXZlIGBkZWJ1Z2AgaW5zdGFuY2VzLlxuICovXG5leHBvcnRzLmluc3RhbmNlcyA9IFtdO1xuXG4vKipcbiAqIFRoZSBjdXJyZW50bHkgYWN0aXZlIGRlYnVnIG1vZGUgbmFtZXMsIGFuZCBuYW1lcyB0byBza2lwLlxuICovXG5cbmV4cG9ydHMubmFtZXMgPSBbXTtcbmV4cG9ydHMuc2tpcHMgPSBbXTtcblxuLyoqXG4gKiBNYXAgb2Ygc3BlY2lhbCBcIiVuXCIgaGFuZGxpbmcgZnVuY3Rpb25zLCBmb3IgdGhlIGRlYnVnIFwiZm9ybWF0XCIgYXJndW1lbnQuXG4gKlxuICogVmFsaWQga2V5IG5hbWVzIGFyZSBhIHNpbmdsZSwgbG93ZXIgb3IgdXBwZXItY2FzZSBsZXR0ZXIsIGkuZS4gXCJuXCIgYW5kIFwiTlwiLlxuICovXG5cbmV4cG9ydHMuZm9ybWF0dGVycyA9IHt9O1xuXG4vKipcbiAqIFNlbGVjdCBhIGNvbG9yLlxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWVzcGFjZVxuICogQHJldHVybiB7TnVtYmVyfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gc2VsZWN0Q29sb3IobmFtZXNwYWNlKSB7XG4gIHZhciBoYXNoID0gMCwgaTtcblxuICBmb3IgKGkgaW4gbmFtZXNwYWNlKSB7XG4gICAgaGFzaCAgPSAoKGhhc2ggPDwgNSkgLSBoYXNoKSArIG5hbWVzcGFjZS5jaGFyQ29kZUF0KGkpO1xuICAgIGhhc2ggfD0gMDsgLy8gQ29udmVydCB0byAzMmJpdCBpbnRlZ2VyXG4gIH1cblxuICByZXR1cm4gZXhwb3J0cy5jb2xvcnNbTWF0aC5hYnMoaGFzaCkgJSBleHBvcnRzLmNvbG9ycy5sZW5ndGhdO1xufVxuXG4vKipcbiAqIENyZWF0ZSBhIGRlYnVnZ2VyIHdpdGggdGhlIGdpdmVuIGBuYW1lc3BhY2VgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lc3BhY2VcbiAqIEByZXR1cm4ge0Z1bmN0aW9ufVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBjcmVhdGVEZWJ1ZyhuYW1lc3BhY2UpIHtcblxuICB2YXIgcHJldlRpbWU7XG5cbiAgZnVuY3Rpb24gZGVidWcoKSB7XG4gICAgLy8gZGlzYWJsZWQ/XG4gICAgaWYgKCFkZWJ1Zy5lbmFibGVkKSByZXR1cm47XG5cbiAgICB2YXIgc2VsZiA9IGRlYnVnO1xuXG4gICAgLy8gc2V0IGBkaWZmYCB0aW1lc3RhbXBcbiAgICB2YXIgY3VyciA9ICtuZXcgRGF0ZSgpO1xuICAgIHZhciBtcyA9IGN1cnIgLSAocHJldlRpbWUgfHwgY3Vycik7XG4gICAgc2VsZi5kaWZmID0gbXM7XG4gICAgc2VsZi5wcmV2ID0gcHJldlRpbWU7XG4gICAgc2VsZi5jdXJyID0gY3VycjtcbiAgICBwcmV2VGltZSA9IGN1cnI7XG5cbiAgICAvLyB0dXJuIHRoZSBgYXJndW1lbnRzYCBpbnRvIGEgcHJvcGVyIEFycmF5XG4gICAgdmFyIGFyZ3MgPSBuZXcgQXJyYXkoYXJndW1lbnRzLmxlbmd0aCk7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcmdzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBhcmdzW2ldID0gYXJndW1lbnRzW2ldO1xuICAgIH1cblxuICAgIGFyZ3NbMF0gPSBleHBvcnRzLmNvZXJjZShhcmdzWzBdKTtcblxuICAgIGlmICgnc3RyaW5nJyAhPT0gdHlwZW9mIGFyZ3NbMF0pIHtcbiAgICAgIC8vIGFueXRoaW5nIGVsc2UgbGV0J3MgaW5zcGVjdCB3aXRoICVPXG4gICAgICBhcmdzLnVuc2hpZnQoJyVPJyk7XG4gICAgfVxuXG4gICAgLy8gYXBwbHkgYW55IGBmb3JtYXR0ZXJzYCB0cmFuc2Zvcm1hdGlvbnNcbiAgICB2YXIgaW5kZXggPSAwO1xuICAgIGFyZ3NbMF0gPSBhcmdzWzBdLnJlcGxhY2UoLyUoW2EtekEtWiVdKS9nLCBmdW5jdGlvbihtYXRjaCwgZm9ybWF0KSB7XG4gICAgICAvLyBpZiB3ZSBlbmNvdW50ZXIgYW4gZXNjYXBlZCAlIHRoZW4gZG9uJ3QgaW5jcmVhc2UgdGhlIGFycmF5IGluZGV4XG4gICAgICBpZiAobWF0Y2ggPT09ICclJScpIHJldHVybiBtYXRjaDtcbiAgICAgIGluZGV4Kys7XG4gICAgICB2YXIgZm9ybWF0dGVyID0gZXhwb3J0cy5mb3JtYXR0ZXJzW2Zvcm1hdF07XG4gICAgICBpZiAoJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIGZvcm1hdHRlcikge1xuICAgICAgICB2YXIgdmFsID0gYXJnc1tpbmRleF07XG4gICAgICAgIG1hdGNoID0gZm9ybWF0dGVyLmNhbGwoc2VsZiwgdmFsKTtcblxuICAgICAgICAvLyBub3cgd2UgbmVlZCB0byByZW1vdmUgYGFyZ3NbaW5kZXhdYCBzaW5jZSBpdCdzIGlubGluZWQgaW4gdGhlIGBmb3JtYXRgXG4gICAgICAgIGFyZ3Muc3BsaWNlKGluZGV4LCAxKTtcbiAgICAgICAgaW5kZXgtLTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBtYXRjaDtcbiAgICB9KTtcblxuICAgIC8vIGFwcGx5IGVudi1zcGVjaWZpYyBmb3JtYXR0aW5nIChjb2xvcnMsIGV0Yy4pXG4gICAgZXhwb3J0cy5mb3JtYXRBcmdzLmNhbGwoc2VsZiwgYXJncyk7XG5cbiAgICB2YXIgbG9nRm4gPSBkZWJ1Zy5sb2cgfHwgZXhwb3J0cy5sb2cgfHwgY29uc29sZS5sb2cuYmluZChjb25zb2xlKTtcbiAgICBsb2dGbi5hcHBseShzZWxmLCBhcmdzKTtcbiAgfVxuXG4gIGRlYnVnLm5hbWVzcGFjZSA9IG5hbWVzcGFjZTtcbiAgZGVidWcuZW5hYmxlZCA9IGV4cG9ydHMuZW5hYmxlZChuYW1lc3BhY2UpO1xuICBkZWJ1Zy51c2VDb2xvcnMgPSBleHBvcnRzLnVzZUNvbG9ycygpO1xuICBkZWJ1Zy5jb2xvciA9IHNlbGVjdENvbG9yKG5hbWVzcGFjZSk7XG4gIGRlYnVnLmRlc3Ryb3kgPSBkZXN0cm95O1xuXG4gIC8vIGVudi1zcGVjaWZpYyBpbml0aWFsaXphdGlvbiBsb2dpYyBmb3IgZGVidWcgaW5zdGFuY2VzXG4gIGlmICgnZnVuY3Rpb24nID09PSB0eXBlb2YgZXhwb3J0cy5pbml0KSB7XG4gICAgZXhwb3J0cy5pbml0KGRlYnVnKTtcbiAgfVxuXG4gIGV4cG9ydHMuaW5zdGFuY2VzLnB1c2goZGVidWcpO1xuXG4gIHJldHVybiBkZWJ1Zztcbn1cblxuZnVuY3Rpb24gZGVzdHJveSAoKSB7XG4gIHZhciBpbmRleCA9IGV4cG9ydHMuaW5zdGFuY2VzLmluZGV4T2YodGhpcyk7XG4gIGlmIChpbmRleCAhPT0gLTEpIHtcbiAgICBleHBvcnRzLmluc3RhbmNlcy5zcGxpY2UoaW5kZXgsIDEpO1xuICAgIHJldHVybiB0cnVlO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxufVxuXG4vKipcbiAqIEVuYWJsZXMgYSBkZWJ1ZyBtb2RlIGJ5IG5hbWVzcGFjZXMuIFRoaXMgY2FuIGluY2x1ZGUgbW9kZXNcbiAqIHNlcGFyYXRlZCBieSBhIGNvbG9uIGFuZCB3aWxkY2FyZHMuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWVzcGFjZXNcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gZW5hYmxlKG5hbWVzcGFjZXMpIHtcbiAgZXhwb3J0cy5zYXZlKG5hbWVzcGFjZXMpO1xuXG4gIGV4cG9ydHMubmFtZXMgPSBbXTtcbiAgZXhwb3J0cy5za2lwcyA9IFtdO1xuXG4gIHZhciBpO1xuICB2YXIgc3BsaXQgPSAodHlwZW9mIG5hbWVzcGFjZXMgPT09ICdzdHJpbmcnID8gbmFtZXNwYWNlcyA6ICcnKS5zcGxpdCgvW1xccyxdKy8pO1xuICB2YXIgbGVuID0gc3BsaXQubGVuZ3RoO1xuXG4gIGZvciAoaSA9IDA7IGkgPCBsZW47IGkrKykge1xuICAgIGlmICghc3BsaXRbaV0pIGNvbnRpbnVlOyAvLyBpZ25vcmUgZW1wdHkgc3RyaW5nc1xuICAgIG5hbWVzcGFjZXMgPSBzcGxpdFtpXS5yZXBsYWNlKC9cXCovZywgJy4qPycpO1xuICAgIGlmIChuYW1lc3BhY2VzWzBdID09PSAnLScpIHtcbiAgICAgIGV4cG9ydHMuc2tpcHMucHVzaChuZXcgUmVnRXhwKCdeJyArIG5hbWVzcGFjZXMuc3Vic3RyKDEpICsgJyQnKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGV4cG9ydHMubmFtZXMucHVzaChuZXcgUmVnRXhwKCdeJyArIG5hbWVzcGFjZXMgKyAnJCcpKTtcbiAgICB9XG4gIH1cblxuICBmb3IgKGkgPSAwOyBpIDwgZXhwb3J0cy5pbnN0YW5jZXMubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgaW5zdGFuY2UgPSBleHBvcnRzLmluc3RhbmNlc1tpXTtcbiAgICBpbnN0YW5jZS5lbmFibGVkID0gZXhwb3J0cy5lbmFibGVkKGluc3RhbmNlLm5hbWVzcGFjZSk7XG4gIH1cbn1cblxuLyoqXG4gKiBEaXNhYmxlIGRlYnVnIG91dHB1dC5cbiAqXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIGRpc2FibGUoKSB7XG4gIGV4cG9ydHMuZW5hYmxlKCcnKTtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIHRydWUgaWYgdGhlIGdpdmVuIG1vZGUgbmFtZSBpcyBlbmFibGVkLCBmYWxzZSBvdGhlcndpc2UuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWVcbiAqIEByZXR1cm4ge0Jvb2xlYW59XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIGVuYWJsZWQobmFtZSkge1xuICBpZiAobmFtZVtuYW1lLmxlbmd0aCAtIDFdID09PSAnKicpIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuICB2YXIgaSwgbGVuO1xuICBmb3IgKGkgPSAwLCBsZW4gPSBleHBvcnRzLnNraXBzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgaWYgKGV4cG9ydHMuc2tpcHNbaV0udGVzdChuYW1lKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuICBmb3IgKGkgPSAwLCBsZW4gPSBleHBvcnRzLm5hbWVzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgaWYgKGV4cG9ydHMubmFtZXNbaV0udGVzdChuYW1lKSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICB9XG4gIHJldHVybiBmYWxzZTtcbn1cblxuLyoqXG4gKiBDb2VyY2UgYHZhbGAuXG4gKlxuICogQHBhcmFtIHtNaXhlZH0gdmFsXG4gKiBAcmV0dXJuIHtNaXhlZH1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIGNvZXJjZSh2YWwpIHtcbiAgaWYgKHZhbCBpbnN0YW5jZW9mIEVycm9yKSByZXR1cm4gdmFsLnN0YWNrIHx8IHZhbC5tZXNzYWdlO1xuICByZXR1cm4gdmFsO1xufVxuIiwiLyoqXG4gKiBIZWxwZXJzLlxuICovXG5cbnZhciBzID0gMTAwMDtcbnZhciBtID0gcyAqIDYwO1xudmFyIGggPSBtICogNjA7XG52YXIgZCA9IGggKiAyNDtcbnZhciB5ID0gZCAqIDM2NS4yNTtcblxuLyoqXG4gKiBQYXJzZSBvciBmb3JtYXQgdGhlIGdpdmVuIGB2YWxgLlxuICpcbiAqIE9wdGlvbnM6XG4gKlxuICogIC0gYGxvbmdgIHZlcmJvc2UgZm9ybWF0dGluZyBbZmFsc2VdXG4gKlxuICogQHBhcmFtIHtTdHJpbmd8TnVtYmVyfSB2YWxcbiAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc11cbiAqIEB0aHJvd3Mge0Vycm9yfSB0aHJvdyBhbiBlcnJvciBpZiB2YWwgaXMgbm90IGEgbm9uLWVtcHR5IHN0cmluZyBvciBhIG51bWJlclxuICogQHJldHVybiB7U3RyaW5nfE51bWJlcn1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbih2YWwsIG9wdGlvbnMpIHtcbiAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gIHZhciB0eXBlID0gdHlwZW9mIHZhbDtcbiAgaWYgKHR5cGUgPT09ICdzdHJpbmcnICYmIHZhbC5sZW5ndGggPiAwKSB7XG4gICAgcmV0dXJuIHBhcnNlKHZhbCk7XG4gIH0gZWxzZSBpZiAodHlwZSA9PT0gJ251bWJlcicgJiYgaXNOYU4odmFsKSA9PT0gZmFsc2UpIHtcbiAgICByZXR1cm4gb3B0aW9ucy5sb25nID8gZm10TG9uZyh2YWwpIDogZm10U2hvcnQodmFsKTtcbiAgfVxuICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgJ3ZhbCBpcyBub3QgYSBub24tZW1wdHkgc3RyaW5nIG9yIGEgdmFsaWQgbnVtYmVyLiB2YWw9JyArXG4gICAgICBKU09OLnN0cmluZ2lmeSh2YWwpXG4gICk7XG59O1xuXG4vKipcbiAqIFBhcnNlIHRoZSBnaXZlbiBgc3RyYCBhbmQgcmV0dXJuIG1pbGxpc2Vjb25kcy5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gc3RyXG4gKiBAcmV0dXJuIHtOdW1iZXJ9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBwYXJzZShzdHIpIHtcbiAgc3RyID0gU3RyaW5nKHN0cik7XG4gIGlmIChzdHIubGVuZ3RoID4gMTAwKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHZhciBtYXRjaCA9IC9eKCg/OlxcZCspP1xcLj9cXGQrKSAqKG1pbGxpc2Vjb25kcz98bXNlY3M/fG1zfHNlY29uZHM/fHNlY3M/fHN8bWludXRlcz98bWlucz98bXxob3Vycz98aHJzP3xofGRheXM/fGR8eWVhcnM/fHlycz98eSk/JC9pLmV4ZWMoXG4gICAgc3RyXG4gICk7XG4gIGlmICghbWF0Y2gpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgdmFyIG4gPSBwYXJzZUZsb2F0KG1hdGNoWzFdKTtcbiAgdmFyIHR5cGUgPSAobWF0Y2hbMl0gfHwgJ21zJykudG9Mb3dlckNhc2UoKTtcbiAgc3dpdGNoICh0eXBlKSB7XG4gICAgY2FzZSAneWVhcnMnOlxuICAgIGNhc2UgJ3llYXInOlxuICAgIGNhc2UgJ3lycyc6XG4gICAgY2FzZSAneXInOlxuICAgIGNhc2UgJ3knOlxuICAgICAgcmV0dXJuIG4gKiB5O1xuICAgIGNhc2UgJ2RheXMnOlxuICAgIGNhc2UgJ2RheSc6XG4gICAgY2FzZSAnZCc6XG4gICAgICByZXR1cm4gbiAqIGQ7XG4gICAgY2FzZSAnaG91cnMnOlxuICAgIGNhc2UgJ2hvdXInOlxuICAgIGNhc2UgJ2hycyc6XG4gICAgY2FzZSAnaHInOlxuICAgIGNhc2UgJ2gnOlxuICAgICAgcmV0dXJuIG4gKiBoO1xuICAgIGNhc2UgJ21pbnV0ZXMnOlxuICAgIGNhc2UgJ21pbnV0ZSc6XG4gICAgY2FzZSAnbWlucyc6XG4gICAgY2FzZSAnbWluJzpcbiAgICBjYXNlICdtJzpcbiAgICAgIHJldHVybiBuICogbTtcbiAgICBjYXNlICdzZWNvbmRzJzpcbiAgICBjYXNlICdzZWNvbmQnOlxuICAgIGNhc2UgJ3NlY3MnOlxuICAgIGNhc2UgJ3NlYyc6XG4gICAgY2FzZSAncyc6XG4gICAgICByZXR1cm4gbiAqIHM7XG4gICAgY2FzZSAnbWlsbGlzZWNvbmRzJzpcbiAgICBjYXNlICdtaWxsaXNlY29uZCc6XG4gICAgY2FzZSAnbXNlY3MnOlxuICAgIGNhc2UgJ21zZWMnOlxuICAgIGNhc2UgJ21zJzpcbiAgICAgIHJldHVybiBuO1xuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9XG59XG5cbi8qKlxuICogU2hvcnQgZm9ybWF0IGZvciBgbXNgLlxuICpcbiAqIEBwYXJhbSB7TnVtYmVyfSBtc1xuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gZm10U2hvcnQobXMpIHtcbiAgaWYgKG1zID49IGQpIHtcbiAgICByZXR1cm4gTWF0aC5yb3VuZChtcyAvIGQpICsgJ2QnO1xuICB9XG4gIGlmIChtcyA+PSBoKSB7XG4gICAgcmV0dXJuIE1hdGgucm91bmQobXMgLyBoKSArICdoJztcbiAgfVxuICBpZiAobXMgPj0gbSkge1xuICAgIHJldHVybiBNYXRoLnJvdW5kKG1zIC8gbSkgKyAnbSc7XG4gIH1cbiAgaWYgKG1zID49IHMpIHtcbiAgICByZXR1cm4gTWF0aC5yb3VuZChtcyAvIHMpICsgJ3MnO1xuICB9XG4gIHJldHVybiBtcyArICdtcyc7XG59XG5cbi8qKlxuICogTG9uZyBmb3JtYXQgZm9yIGBtc2AuXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ9IG1zXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBmbXRMb25nKG1zKSB7XG4gIHJldHVybiBwbHVyYWwobXMsIGQsICdkYXknKSB8fFxuICAgIHBsdXJhbChtcywgaCwgJ2hvdXInKSB8fFxuICAgIHBsdXJhbChtcywgbSwgJ21pbnV0ZScpIHx8XG4gICAgcGx1cmFsKG1zLCBzLCAnc2Vjb25kJykgfHxcbiAgICBtcyArICcgbXMnO1xufVxuXG4vKipcbiAqIFBsdXJhbGl6YXRpb24gaGVscGVyLlxuICovXG5cbmZ1bmN0aW9uIHBsdXJhbChtcywgbiwgbmFtZSkge1xuICBpZiAobXMgPCBuKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmIChtcyA8IG4gKiAxLjUpIHtcbiAgICByZXR1cm4gTWF0aC5mbG9vcihtcyAvIG4pICsgJyAnICsgbmFtZTtcbiAgfVxuICByZXR1cm4gTWF0aC5jZWlsKG1zIC8gbikgKyAnICcgKyBuYW1lICsgJ3MnO1xufVxuIiwiLy8gc2hpbSBmb3IgdXNpbmcgcHJvY2VzcyBpbiBicm93c2VyXG52YXIgcHJvY2VzcyA9IG1vZHVsZS5leHBvcnRzID0ge307XG5cbi8vIGNhY2hlZCBmcm9tIHdoYXRldmVyIGdsb2JhbCBpcyBwcmVzZW50IHNvIHRoYXQgdGVzdCBydW5uZXJzIHRoYXQgc3R1YiBpdFxuLy8gZG9uJ3QgYnJlYWsgdGhpbmdzLiAgQnV0IHdlIG5lZWQgdG8gd3JhcCBpdCBpbiBhIHRyeSBjYXRjaCBpbiBjYXNlIGl0IGlzXG4vLyB3cmFwcGVkIGluIHN0cmljdCBtb2RlIGNvZGUgd2hpY2ggZG9lc24ndCBkZWZpbmUgYW55IGdsb2JhbHMuICBJdCdzIGluc2lkZSBhXG4vLyBmdW5jdGlvbiBiZWNhdXNlIHRyeS9jYXRjaGVzIGRlb3B0aW1pemUgaW4gY2VydGFpbiBlbmdpbmVzLlxuXG52YXIgY2FjaGVkU2V0VGltZW91dDtcbnZhciBjYWNoZWRDbGVhclRpbWVvdXQ7XG5cbmZ1bmN0aW9uIGRlZmF1bHRTZXRUaW1vdXQoKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdzZXRUaW1lb3V0IGhhcyBub3QgYmVlbiBkZWZpbmVkJyk7XG59XG5mdW5jdGlvbiBkZWZhdWx0Q2xlYXJUaW1lb3V0ICgpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2NsZWFyVGltZW91dCBoYXMgbm90IGJlZW4gZGVmaW5lZCcpO1xufVxuKGZ1bmN0aW9uICgpIHtcbiAgICB0cnkge1xuICAgICAgICBpZiAodHlwZW9mIHNldFRpbWVvdXQgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIGNhY2hlZFNldFRpbWVvdXQgPSBzZXRUaW1lb3V0O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY2FjaGVkU2V0VGltZW91dCA9IGRlZmF1bHRTZXRUaW1vdXQ7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNhY2hlZFNldFRpbWVvdXQgPSBkZWZhdWx0U2V0VGltb3V0O1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgICBpZiAodHlwZW9mIGNsZWFyVGltZW91dCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgY2FjaGVkQ2xlYXJUaW1lb3V0ID0gY2xlYXJUaW1lb3V0O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY2FjaGVkQ2xlYXJUaW1lb3V0ID0gZGVmYXVsdENsZWFyVGltZW91dDtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY2FjaGVkQ2xlYXJUaW1lb3V0ID0gZGVmYXVsdENsZWFyVGltZW91dDtcbiAgICB9XG59ICgpKVxuZnVuY3Rpb24gcnVuVGltZW91dChmdW4pIHtcbiAgICBpZiAoY2FjaGVkU2V0VGltZW91dCA9PT0gc2V0VGltZW91dCkge1xuICAgICAgICAvL25vcm1hbCBlbnZpcm9tZW50cyBpbiBzYW5lIHNpdHVhdGlvbnNcbiAgICAgICAgcmV0dXJuIHNldFRpbWVvdXQoZnVuLCAwKTtcbiAgICB9XG4gICAgLy8gaWYgc2V0VGltZW91dCB3YXNuJ3QgYXZhaWxhYmxlIGJ1dCB3YXMgbGF0dGVyIGRlZmluZWRcbiAgICBpZiAoKGNhY2hlZFNldFRpbWVvdXQgPT09IGRlZmF1bHRTZXRUaW1vdXQgfHwgIWNhY2hlZFNldFRpbWVvdXQpICYmIHNldFRpbWVvdXQpIHtcbiAgICAgICAgY2FjaGVkU2V0VGltZW91dCA9IHNldFRpbWVvdXQ7XG4gICAgICAgIHJldHVybiBzZXRUaW1lb3V0KGZ1biwgMCk7XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICAgIC8vIHdoZW4gd2hlbiBzb21lYm9keSBoYXMgc2NyZXdlZCB3aXRoIHNldFRpbWVvdXQgYnV0IG5vIEkuRS4gbWFkZG5lc3NcbiAgICAgICAgcmV0dXJuIGNhY2hlZFNldFRpbWVvdXQoZnVuLCAwKTtcbiAgICB9IGNhdGNoKGUpe1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gV2hlbiB3ZSBhcmUgaW4gSS5FLiBidXQgdGhlIHNjcmlwdCBoYXMgYmVlbiBldmFsZWQgc28gSS5FLiBkb2Vzbid0IHRydXN0IHRoZSBnbG9iYWwgb2JqZWN0IHdoZW4gY2FsbGVkIG5vcm1hbGx5XG4gICAgICAgICAgICByZXR1cm4gY2FjaGVkU2V0VGltZW91dC5jYWxsKG51bGwsIGZ1biwgMCk7XG4gICAgICAgIH0gY2F0Y2goZSl7XG4gICAgICAgICAgICAvLyBzYW1lIGFzIGFib3ZlIGJ1dCB3aGVuIGl0J3MgYSB2ZXJzaW9uIG9mIEkuRS4gdGhhdCBtdXN0IGhhdmUgdGhlIGdsb2JhbCBvYmplY3QgZm9yICd0aGlzJywgaG9wZnVsbHkgb3VyIGNvbnRleHQgY29ycmVjdCBvdGhlcndpc2UgaXQgd2lsbCB0aHJvdyBhIGdsb2JhbCBlcnJvclxuICAgICAgICAgICAgcmV0dXJuIGNhY2hlZFNldFRpbWVvdXQuY2FsbCh0aGlzLCBmdW4sIDApO1xuICAgICAgICB9XG4gICAgfVxuXG5cbn1cbmZ1bmN0aW9uIHJ1bkNsZWFyVGltZW91dChtYXJrZXIpIHtcbiAgICBpZiAoY2FjaGVkQ2xlYXJUaW1lb3V0ID09PSBjbGVhclRpbWVvdXQpIHtcbiAgICAgICAgLy9ub3JtYWwgZW52aXJvbWVudHMgaW4gc2FuZSBzaXR1YXRpb25zXG4gICAgICAgIHJldHVybiBjbGVhclRpbWVvdXQobWFya2VyKTtcbiAgICB9XG4gICAgLy8gaWYgY2xlYXJUaW1lb3V0IHdhc24ndCBhdmFpbGFibGUgYnV0IHdhcyBsYXR0ZXIgZGVmaW5lZFxuICAgIGlmICgoY2FjaGVkQ2xlYXJUaW1lb3V0ID09PSBkZWZhdWx0Q2xlYXJUaW1lb3V0IHx8ICFjYWNoZWRDbGVhclRpbWVvdXQpICYmIGNsZWFyVGltZW91dCkge1xuICAgICAgICBjYWNoZWRDbGVhclRpbWVvdXQgPSBjbGVhclRpbWVvdXQ7XG4gICAgICAgIHJldHVybiBjbGVhclRpbWVvdXQobWFya2VyKTtcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgICAgLy8gd2hlbiB3aGVuIHNvbWVib2R5IGhhcyBzY3Jld2VkIHdpdGggc2V0VGltZW91dCBidXQgbm8gSS5FLiBtYWRkbmVzc1xuICAgICAgICByZXR1cm4gY2FjaGVkQ2xlYXJUaW1lb3V0KG1hcmtlcik7XG4gICAgfSBjYXRjaCAoZSl7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBXaGVuIHdlIGFyZSBpbiBJLkUuIGJ1dCB0aGUgc2NyaXB0IGhhcyBiZWVuIGV2YWxlZCBzbyBJLkUuIGRvZXNuJ3QgIHRydXN0IHRoZSBnbG9iYWwgb2JqZWN0IHdoZW4gY2FsbGVkIG5vcm1hbGx5XG4gICAgICAgICAgICByZXR1cm4gY2FjaGVkQ2xlYXJUaW1lb3V0LmNhbGwobnVsbCwgbWFya2VyKTtcbiAgICAgICAgfSBjYXRjaCAoZSl7XG4gICAgICAgICAgICAvLyBzYW1lIGFzIGFib3ZlIGJ1dCB3aGVuIGl0J3MgYSB2ZXJzaW9uIG9mIEkuRS4gdGhhdCBtdXN0IGhhdmUgdGhlIGdsb2JhbCBvYmplY3QgZm9yICd0aGlzJywgaG9wZnVsbHkgb3VyIGNvbnRleHQgY29ycmVjdCBvdGhlcndpc2UgaXQgd2lsbCB0aHJvdyBhIGdsb2JhbCBlcnJvci5cbiAgICAgICAgICAgIC8vIFNvbWUgdmVyc2lvbnMgb2YgSS5FLiBoYXZlIGRpZmZlcmVudCBydWxlcyBmb3IgY2xlYXJUaW1lb3V0IHZzIHNldFRpbWVvdXRcbiAgICAgICAgICAgIHJldHVybiBjYWNoZWRDbGVhclRpbWVvdXQuY2FsbCh0aGlzLCBtYXJrZXIpO1xuICAgICAgICB9XG4gICAgfVxuXG5cblxufVxudmFyIHF1ZXVlID0gW107XG52YXIgZHJhaW5pbmcgPSBmYWxzZTtcbnZhciBjdXJyZW50UXVldWU7XG52YXIgcXVldWVJbmRleCA9IC0xO1xuXG5mdW5jdGlvbiBjbGVhblVwTmV4dFRpY2soKSB7XG4gICAgaWYgKCFkcmFpbmluZyB8fCAhY3VycmVudFF1ZXVlKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgZHJhaW5pbmcgPSBmYWxzZTtcbiAgICBpZiAoY3VycmVudFF1ZXVlLmxlbmd0aCkge1xuICAgICAgICBxdWV1ZSA9IGN1cnJlbnRRdWV1ZS5jb25jYXQocXVldWUpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHF1ZXVlSW5kZXggPSAtMTtcbiAgICB9XG4gICAgaWYgKHF1ZXVlLmxlbmd0aCkge1xuICAgICAgICBkcmFpblF1ZXVlKCk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBkcmFpblF1ZXVlKCkge1xuICAgIGlmIChkcmFpbmluZykge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIHZhciB0aW1lb3V0ID0gcnVuVGltZW91dChjbGVhblVwTmV4dFRpY2spO1xuICAgIGRyYWluaW5nID0gdHJ1ZTtcblxuICAgIHZhciBsZW4gPSBxdWV1ZS5sZW5ndGg7XG4gICAgd2hpbGUobGVuKSB7XG4gICAgICAgIGN1cnJlbnRRdWV1ZSA9IHF1ZXVlO1xuICAgICAgICBxdWV1ZSA9IFtdO1xuICAgICAgICB3aGlsZSAoKytxdWV1ZUluZGV4IDwgbGVuKSB7XG4gICAgICAgICAgICBpZiAoY3VycmVudFF1ZXVlKSB7XG4gICAgICAgICAgICAgICAgY3VycmVudFF1ZXVlW3F1ZXVlSW5kZXhdLnJ1bigpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHF1ZXVlSW5kZXggPSAtMTtcbiAgICAgICAgbGVuID0gcXVldWUubGVuZ3RoO1xuICAgIH1cbiAgICBjdXJyZW50UXVldWUgPSBudWxsO1xuICAgIGRyYWluaW5nID0gZmFsc2U7XG4gICAgcnVuQ2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xufVxuXG5wcm9jZXNzLm5leHRUaWNrID0gZnVuY3Rpb24gKGZ1bikge1xuICAgIHZhciBhcmdzID0gbmV3IEFycmF5KGFyZ3VtZW50cy5sZW5ndGggLSAxKTtcbiAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDE7IGkgPCBhcmd1bWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGFyZ3NbaSAtIDFdID0gYXJndW1lbnRzW2ldO1xuICAgICAgICB9XG4gICAgfVxuICAgIHF1ZXVlLnB1c2gobmV3IEl0ZW0oZnVuLCBhcmdzKSk7XG4gICAgaWYgKHF1ZXVlLmxlbmd0aCA9PT0gMSAmJiAhZHJhaW5pbmcpIHtcbiAgICAgICAgcnVuVGltZW91dChkcmFpblF1ZXVlKTtcbiAgICB9XG59O1xuXG4vLyB2OCBsaWtlcyBwcmVkaWN0aWJsZSBvYmplY3RzXG5mdW5jdGlvbiBJdGVtKGZ1biwgYXJyYXkpIHtcbiAgICB0aGlzLmZ1biA9IGZ1bjtcbiAgICB0aGlzLmFycmF5ID0gYXJyYXk7XG59XG5JdGVtLnByb3RvdHlwZS5ydW4gPSBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5mdW4uYXBwbHkobnVsbCwgdGhpcy5hcnJheSk7XG59O1xucHJvY2Vzcy50aXRsZSA9ICdicm93c2VyJztcbnByb2Nlc3MuYnJvd3NlciA9IHRydWU7XG5wcm9jZXNzLmVudiA9IHt9O1xucHJvY2Vzcy5hcmd2ID0gW107XG5wcm9jZXNzLnZlcnNpb24gPSAnJzsgLy8gZW1wdHkgc3RyaW5nIHRvIGF2b2lkIHJlZ2V4cCBpc3N1ZXNcbnByb2Nlc3MudmVyc2lvbnMgPSB7fTtcblxuZnVuY3Rpb24gbm9vcCgpIHt9XG5cbnByb2Nlc3Mub24gPSBub29wO1xucHJvY2Vzcy5hZGRMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLm9uY2UgPSBub29wO1xucHJvY2Vzcy5vZmYgPSBub29wO1xucHJvY2Vzcy5yZW1vdmVMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUFsbExpc3RlbmVycyA9IG5vb3A7XG5wcm9jZXNzLmVtaXQgPSBub29wO1xucHJvY2Vzcy5wcmVwZW5kTGlzdGVuZXIgPSBub29wO1xucHJvY2Vzcy5wcmVwZW5kT25jZUxpc3RlbmVyID0gbm9vcDtcblxucHJvY2Vzcy5saXN0ZW5lcnMgPSBmdW5jdGlvbiAobmFtZSkgeyByZXR1cm4gW10gfVxuXG5wcm9jZXNzLmJpbmRpbmcgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5iaW5kaW5nIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG5cbnByb2Nlc3MuY3dkID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gJy8nIH07XG5wcm9jZXNzLmNoZGlyID0gZnVuY3Rpb24gKGRpcikge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5jaGRpciBpcyBub3Qgc3VwcG9ydGVkJyk7XG59O1xucHJvY2Vzcy51bWFzayA9IGZ1bmN0aW9uKCkgeyByZXR1cm4gMDsgfTtcbiJdfQ==

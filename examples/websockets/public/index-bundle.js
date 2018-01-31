(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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

var SyncClient = function () {
  /**
   * @callback SyncClient~getTimeFunction
   * @return {Number} monotonic, ever increasing, time in second.
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
   * @param {Object} report
   * @param {String} report.status `new`, `startup`,
   * `training` (offset adaptation), or `sync` (offset and ratio adaptation).
   * @param {Number} report.statusDuration duration since last status
   * change.
   * @param {Number} report.timeOffset time difference between local
   * time and sync time, in seconds.
   * @param {Number} report.frequencyRatio time ratio between local
   * time and sync time.
   * @param {String} report.connection `offline` or `online`
   * @param {Number} report.connectionDuration duration since last connection
   * change.
   * @param {Number} report.connectionTimeOut duration, in seconds, before
   * a time-out occurs.
   * @param {Number} report.travelDuration duration of a
   * ping-pong round-trip, in seconds, mean over the the last
   * ping-pong series.
   * @param {Number} report.travelDurationMin duration of a
   * ping-pong round-trip, in seconds, minimum over the the last
   * ping-pong series.
   * @param {Number} report.travelDurationMax duration of a
   * ping-pong round-trip, in seconds, maximum over the the last
   * ping-pong series.
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
    this.pingSeriesPeriod = options.pingSeriesPeriod || 0.250;
    this.pingSeriesDelay = options.pingSeriesDelay || { min: 10, max: 20 };
    orderMinMax(this.pingSeriesDelay);

    this.pingDelay = 0; // current delay before next ping
    this.pingTimeoutId = 0; // to cancel timeout on sync_pinc
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
     * @returns {Number} time, in seconds, since last connectionStatus
     * change.
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
      }, 1000 * this.pingTimeoutDelay.current);
    }

    /**
     * Start a synchronisation process by registering the receive
     * function passed as second parameter. Then, send regular messages
     * to the server, using the send function passed as first parameter.
     *
     * @function SyncClient~start
     * @param {SyncClient~sendFunction} sendFunction
     * @param {SyncClient~receiveFunction} receiveFunction to register
     * @param {SyncClient~reportFunction} reportFunction if defined,
     * is called to report the status, on each status change
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
            var sorted = _this2.seriesData.slice(0).sort();

            var seriesTravelDuration = sorted[0][0];

            // When the clock tick is long enough,
            // some travel times (dimension 0) might be identical.
            // Then, use the offset median (dimension 1 is the second sort key)
            var s = 0;
            while (s < sorted.length && sorted[s][0] <= seriesTravelDuration * 1.01) {
              ++s;
            }
            s = Math.max(0, s - 1);
            var median = Math.floor(s / 2);

            var seriesClientTime = sorted[median][2];
            var seriesServerTime = sorted[median][3];
            var seriesClientSquaredTime = seriesClientTime * seriesClientTime;
            var seriesClientServerTime = seriesClientTime * seriesServerTime;

            _this2.longTermData[_this2.longTermDataNextIndex] = [seriesTravelDuration, seriesClientTime, seriesServerTime, seriesClientSquaredTime, seriesClientServerTime];
            _this2.longTermDataNextIndex = ++_this2.longTermDataNextIndex % _this2.longTermDataLength;

            // mean of the time offset over 3 samples around median
            // (it might use a longer travel duration)
            var aroundMedian = sorted.slice(Math.max(0, median - 1), Math.min(sorted.length, median + 1));
            _this2.timeOffset = mean(aroundMedian, 3) - mean(aroundMedian, 2);

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
          }, 1000 * _this2.pingDelay);
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

},{"babel-runtime/helpers/classCallCheck":8,"babel-runtime/helpers/createClass":9,"debug":27}],2:[function(require,module,exports){
'use strict';

var _stringify = require('babel-runtime/core-js/json/stringify');

var _stringify2 = _interopRequireDefault(_stringify);

var _client = require('../../../../dist/client');

var _client2 = _interopRequireDefault(_client);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var getTimeFunction = function getTimeFunction() {
  return performance.now() / 1000;
};

function init() {
  var url = window.location.origin.replace('http', 'ws');

  // init socket client
  var socket = new WebSocket(url);
  socket.binaryType = 'arraybuffer';
  // init sync client
  var syncClient = new _client2.default(getTimeFunction);

  socket.addEventListener('open', function () {

    var sendFunction = function sendFunction(pingId, clientPingTime) {
      var request = new Float64Array(3);
      request[0] = 0; // this is a ping
      request[1] = pingId;
      request[2] = clientPingTime;

      console.log('[ping] - id: %s, pingTime: %s', request[1], request[2]);

      socket.send(request.buffer);
    };

    var receiveFunction = function receiveFunction(callback) {
      socket.addEventListener('message', function (e) {
        var response = new Float64Array(e.data);

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

},{"../../../../dist/client":1,"babel-runtime/core-js/json/stringify":3}],3:[function(require,module,exports){
module.exports = { "default": require("core-js/library/fn/json/stringify"), __esModule: true };
},{"core-js/library/fn/json/stringify":4}],4:[function(require,module,exports){
var core = require('../../modules/_core');
var $JSON = core.JSON || (core.JSON = { stringify: JSON.stringify });
module.exports = function stringify(it) { // eslint-disable-line no-unused-vars
  return $JSON.stringify.apply($JSON, arguments);
};

},{"../../modules/_core":5}],5:[function(require,module,exports){
var core = module.exports = { version: '2.5.3' };
if (typeof __e == 'number') __e = core; // eslint-disable-line no-undef

},{}],6:[function(require,module,exports){
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

},{}],7:[function(require,module,exports){
module.exports = { "default": require("core-js/library/fn/object/define-property"), __esModule: true };
},{"core-js/library/fn/object/define-property":10}],8:[function(require,module,exports){
"use strict";

exports.__esModule = true;

exports.default = function (instance, Constructor) {
  if (!(instance instanceof Constructor)) {
    throw new TypeError("Cannot call a class as a function");
  }
};
},{}],9:[function(require,module,exports){
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
},{"../core-js/object/define-property":7}],10:[function(require,module,exports){
require('../../modules/es6.object.define-property');
var $Object = require('../../modules/_core').Object;
module.exports = function defineProperty(it, key, desc) {
  return $Object.defineProperty(it, key, desc);
};

},{"../../modules/_core":13,"../../modules/es6.object.define-property":26}],11:[function(require,module,exports){
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

},{"./_is-object":22}],13:[function(require,module,exports){
arguments[4][5][0].apply(exports,arguments)
},{"dup":5}],14:[function(require,module,exports){
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

},{"./_global":19,"./_is-object":22}],17:[function(require,module,exports){
var global = require('./_global');
var core = require('./_core');
var ctx = require('./_ctx');
var hide = require('./_hide');
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
    if (own && key in exports) continue;
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

},{"./_core":13,"./_ctx":14,"./_global":19,"./_hide":20}],18:[function(require,module,exports){
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
var dP = require('./_object-dp');
var createDesc = require('./_property-desc');
module.exports = require('./_descriptors') ? function (object, key, value) {
  return dP.f(object, key, createDesc(1, value));
} : function (object, key, value) {
  object[key] = value;
  return object;
};

},{"./_descriptors":15,"./_object-dp":23,"./_property-desc":24}],21:[function(require,module,exports){
module.exports = !require('./_descriptors') && !require('./_fails')(function () {
  return Object.defineProperty(require('./_dom-create')('div'), 'a', { get: function () { return 7; } }).a != 7;
});

},{"./_descriptors":15,"./_dom-create":16,"./_fails":18}],22:[function(require,module,exports){
module.exports = function (it) {
  return typeof it === 'object' ? it !== null : typeof it === 'function';
};

},{}],23:[function(require,module,exports){
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

},{"./_an-object":12,"./_descriptors":15,"./_ie8-dom-define":21,"./_to-primitive":25}],24:[function(require,module,exports){
module.exports = function (bitmap, value) {
  return {
    enumerable: !(bitmap & 1),
    configurable: !(bitmap & 2),
    writable: !(bitmap & 4),
    value: value
  };
};

},{}],25:[function(require,module,exports){
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

},{"./_is-object":22}],26:[function(require,module,exports){
var $export = require('./_export');
// 19.1.2.4 / 15.2.3.6 Object.defineProperty(O, P, Attributes)
$export($export.S + $export.F * !require('./_descriptors'), 'Object', { defineProperty: require('./_object-dp').f });

},{"./_descriptors":15,"./_export":17,"./_object-dp":23}],27:[function(require,module,exports){
(function (process){
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
  'lightseagreen',
  'forestgreen',
  'goldenrod',
  'dodgerblue',
  'darkorchid',
  'crimson'
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

}).call(this,require('_process'))

},{"./debug":28,"_process":6}],28:[function(require,module,exports){

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
 * Previous log timestamp.
 */

var prevTime;

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

  // env-specific initialization logic for debug instances
  if ('function' === typeof exports.init) {
    exports.init(debug);
  }

  return debug;
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

  var split = (typeof namespaces === 'string' ? namespaces : '').split(/[\s,]+/);
  var len = split.length;

  for (var i = 0; i < len; i++) {
    if (!split[i]) continue; // ignore empty strings
    namespaces = split[i].replace(/\*/g, '.*?');
    if (namespaces[0] === '-') {
      exports.skips.push(new RegExp('^' + namespaces.substr(1) + '$'));
    } else {
      exports.names.push(new RegExp('^' + namespaces + '$'));
    }
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

},{"ms":29}],29:[function(require,module,exports){
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

},{}]},{},[2])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIuLi8uLi9kaXN0L2NsaWVudC9pbmRleC5qcyIsImRpc3QvY2xpZW50L2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2JhYmVsLXJ1bnRpbWUvY29yZS1qcy9qc29uL3N0cmluZ2lmeS5qcyIsIm5vZGVfbW9kdWxlcy9jb3JlLWpzL2xpYnJhcnkvZm4vanNvbi9zdHJpbmdpZnkuanMiLCJub2RlX21vZHVsZXMvY29yZS1qcy9saWJyYXJ5L21vZHVsZXMvX2NvcmUuanMiLCJub2RlX21vZHVsZXMvcHJvY2Vzcy9icm93c2VyLmpzIiwiLi4vLi4vbm9kZV9tb2R1bGVzL2JhYmVsLXJ1bnRpbWUvY29yZS1qcy9vYmplY3QvZGVmaW5lLXByb3BlcnR5LmpzIiwiLi4vLi4vbm9kZV9tb2R1bGVzL2JhYmVsLXJ1bnRpbWUvaGVscGVycy9jbGFzc0NhbGxDaGVjay5qcyIsIi4uLy4uL25vZGVfbW9kdWxlcy9iYWJlbC1ydW50aW1lL2hlbHBlcnMvY3JlYXRlQ2xhc3MuanMiLCIuLi8uLi9ub2RlX21vZHVsZXMvY29yZS1qcy9saWJyYXJ5L2ZuL29iamVjdC9kZWZpbmUtcHJvcGVydHkuanMiLCIuLi8uLi9ub2RlX21vZHVsZXMvY29yZS1qcy9saWJyYXJ5L21vZHVsZXMvX2EtZnVuY3Rpb24uanMiLCIuLi8uLi9ub2RlX21vZHVsZXMvY29yZS1qcy9saWJyYXJ5L21vZHVsZXMvX2FuLW9iamVjdC5qcyIsIi4uLy4uL25vZGVfbW9kdWxlcy9jb3JlLWpzL2xpYnJhcnkvbW9kdWxlcy9fY3R4LmpzIiwiLi4vLi4vbm9kZV9tb2R1bGVzL2NvcmUtanMvbGlicmFyeS9tb2R1bGVzL19kZXNjcmlwdG9ycy5qcyIsIi4uLy4uL25vZGVfbW9kdWxlcy9jb3JlLWpzL2xpYnJhcnkvbW9kdWxlcy9fZG9tLWNyZWF0ZS5qcyIsIi4uLy4uL25vZGVfbW9kdWxlcy9jb3JlLWpzL2xpYnJhcnkvbW9kdWxlcy9fZXhwb3J0LmpzIiwiLi4vLi4vbm9kZV9tb2R1bGVzL2NvcmUtanMvbGlicmFyeS9tb2R1bGVzL19mYWlscy5qcyIsIi4uLy4uL25vZGVfbW9kdWxlcy9jb3JlLWpzL2xpYnJhcnkvbW9kdWxlcy9fZ2xvYmFsLmpzIiwiLi4vLi4vbm9kZV9tb2R1bGVzL2NvcmUtanMvbGlicmFyeS9tb2R1bGVzL19oaWRlLmpzIiwiLi4vLi4vbm9kZV9tb2R1bGVzL2NvcmUtanMvbGlicmFyeS9tb2R1bGVzL19pZTgtZG9tLWRlZmluZS5qcyIsIi4uLy4uL25vZGVfbW9kdWxlcy9jb3JlLWpzL2xpYnJhcnkvbW9kdWxlcy9faXMtb2JqZWN0LmpzIiwiLi4vLi4vbm9kZV9tb2R1bGVzL2NvcmUtanMvbGlicmFyeS9tb2R1bGVzL19vYmplY3QtZHAuanMiLCIuLi8uLi9ub2RlX21vZHVsZXMvY29yZS1qcy9saWJyYXJ5L21vZHVsZXMvX3Byb3BlcnR5LWRlc2MuanMiLCIuLi8uLi9ub2RlX21vZHVsZXMvY29yZS1qcy9saWJyYXJ5L21vZHVsZXMvX3RvLXByaW1pdGl2ZS5qcyIsIi4uLy4uL25vZGVfbW9kdWxlcy9jb3JlLWpzL2xpYnJhcnkvbW9kdWxlcy9lczYub2JqZWN0LmRlZmluZS1wcm9wZXJ0eS5qcyIsIi4uLy4uL25vZGVfbW9kdWxlcy9kZWJ1Zy9zcmMvYnJvd3Nlci5qcyIsIi4uLy4uL25vZGVfbW9kdWxlcy9kZWJ1Zy9zcmMvZGVidWcuanMiLCIuLi8uLi9ub2RlX21vZHVsZXMvbXMvaW5kZXguanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7Ozs7Ozs7Ozs7OztBQ0FBOzs7Ozs7QUFDQSxJQUFNLE1BQU0scUJBQU0sTUFBTixDQUFaOztBQUVBOztBQUVBOzs7Ozs7O0FBT0EsU0FBUyxXQUFULENBQXFCLElBQXJCLEVBQTJCO0FBQ3pCLE1BQUcsT0FBTyxJQUFQLEtBQWdCLFdBQWhCLElBQ0csT0FBTyxLQUFLLEdBQVosS0FBb0IsV0FEdkIsSUFDc0MsT0FBTyxLQUFLLEdBQVosS0FBb0IsV0FE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QUMzREE7O0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0xBO0FBQ0E7QUFDQTs7QUNGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hMQTs7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUNMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1BBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ05BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNSQTtBQUNBO0FBQ0E7QUFDQTs7QUNIQTtBQUNBO0FBQ0E7QUFDQTs7QUNIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWkE7QUFDQTtBQUNBO0FBQ0E7OztBQ0hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQ3pMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiaW1wb3J0IGRlYnVnIGZyb20gJ2RlYnVnJztcbmNvbnN0IGxvZyA9IGRlYnVnKCdzeW5jJyk7XG5cbi8vLy8vLyBoZWxwZXJzXG5cbi8qKlxuICogT3JkZXIgbWluIGFuZCBtYXggYXR0cmlidXRlcy5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtPYmplY3R9IHRoYXQgd2l0aCBtaW4gYW5kIG1heCBhdHRyaWJ1dGVzXG4gKiBAcmV0dXJucyB7T2JqZWN0fSB3aXRoIG1pbiBhbmQgbWFuIGF0dHJpYnV0ZXMsIHN3YXBwZWQgaWYgdGhhdC5taW4gPiB0aGF0Lm1heFxuICovXG5mdW5jdGlvbiBvcmRlck1pbk1heCh0aGF0KSB7XG4gIGlmKHR5cGVvZiB0aGF0ICE9PSAndW5kZWZpbmVkJ1xuICAgICAmJiB0eXBlb2YgdGhhdC5taW4gIT09ICd1bmRlZmluZWQnICYmIHR5cGVvZiB0aGF0Lm1heCAhPT0gJ3VuZGVmaW5lZCdcbiAgICAgJiYgdGhhdC5taW4gPiB0aGF0Lm1heCkge1xuICAgIGNvbnN0IHRtcCA9IHRoYXQubWluO1xuICAgIHRoYXQubWluID0gdGhhdC5tYXg7XG4gICAgdGhhdC5tYXggPSB0bXA7XG4gIH1cbiAgcmV0dXJuIHRoYXQ7XG59XG5cbi8qKlxuICogTWVhbiBvdmVyIGFuIGFycmF5LCBzZWxlY3Rpbmcgb25lIGRpbWVuc2lvbiBvZiB0aGUgYXJyYXkgdmFsdWVzLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge0FycmF5LjxBcnJheS48TnVtYmVyPj59IGFycmF5XG4gKiBAcGFyYW0ge051bWJlcn0gW2RpbWVuc2lvbj0wXVxuICogQHJldHVybnMge051bWJlcn0gbWVhblxuICovXG5mdW5jdGlvbiBtZWFuKGFycmF5LCBkaW1lbnNpb24gPSAwKSB7XG4gIHJldHVybiBhcnJheS5yZWR1Y2UoKHAsIHEpID0+IHAgKyBxW2RpbWVuc2lvbl0sIDApIC8gYXJyYXkubGVuZ3RoO1xufVxuXG5jbGFzcyBTeW5jQ2xpZW50IHtcbiAgLyoqXG4gICAqIEBjYWxsYmFjayBTeW5jQ2xpZW50fmdldFRpbWVGdW5jdGlvblxuICAgKiBAcmV0dXJuIHtOdW1iZXJ9IG1vbm90b25pYywgZXZlciBpbmNyZWFzaW5nLCB0aW1lIGluIHNlY29uZC5cbiAgICoqL1xuXG4gIC8qKlxuICAgKiBAY2FsbGJhY2sgU3luY0NsaWVudH5zZW5kRnVuY3Rpb25cbiAgICogQHNlZSB7QGxpbmtjb2RlIFN5bmNTZXJ2ZXJ+cmVjZWl2ZUZ1bmN0aW9ufVxuICAgKiBAcGFyYW0ge051bWJlcn0gcGluZ0lkIHVuaXF1ZSBpZGVudGlmaWVyXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBjbGllbnRQaW5nVGltZSB0aW1lLXN0YW1wIG9mIHBpbmcgZW1pc3Npb25cbiAgICoqL1xuXG4gIC8qKlxuICAgKiBAY2FsbGJhY2sgU3luY0NsaWVudH5yZWNlaXZlRnVuY3Rpb25cbiAgICogQHNlZSB7QGxpbmtjb2RlIFN5bmNTZXJ2ZXJ+c2VuZEZ1bmN0aW9ufVxuICAgKiBAcGFyYW0ge1N5bmNDbGllbnR+cmVjZWl2ZUNhbGxiYWNrfSByZWNlaXZlQ2FsbGJhY2sgY2FsbGVkIG9uXG4gICAqIGVhY2ggbWVzc2FnZSBtYXRjaGluZyBtZXNzYWdlVHlwZS5cbiAgICoqL1xuXG4gIC8qKlxuICAgKiBAY2FsbGJhY2sgU3luY0NsaWVudH5yZWNlaXZlQ2FsbGJhY2tcbiAgICogQHBhcmFtIHtOdW1iZXJ9IHBpbmdJZCB1bmlxdWUgaWRlbnRpZmllclxuICAgKiBAcGFyYW0ge051bWJlcn0gY2xpZW50UGluZ1RpbWUgdGltZS1zdGFtcCBvZiBwaW5nIGVtaXNzaW9uXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBzZXJ2ZXJQaW5nVGltZSB0aW1lLXN0YW1wIG9mIHBpbmcgcmVjZXB0aW9uXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBzZXJ2ZXJQb25nVGltZSB0aW1lLXN0YW1wIG9mIHBvbmcgZW1pc3Npb25cbiAgICogQHBhcmFtIHtOdW1iZXJ9IGNsaWVudFBvbmdUaW1lIHRpbWUtc3RhbXAgb2YgcG9uZyByZWNlcHRpb25cbiAgICoqL1xuXG4gIC8qKlxuICAgKiBAY2FsbGJhY2sgU3luY0NsaWVudH5yZXBvcnRGdW5jdGlvblxuICAgKiBAcGFyYW0ge09iamVjdH0gcmVwb3J0XG4gICAqIEBwYXJhbSB7U3RyaW5nfSByZXBvcnQuc3RhdHVzIGBuZXdgLCBgc3RhcnR1cGAsXG4gICAqIGB0cmFpbmluZ2AgKG9mZnNldCBhZGFwdGF0aW9uKSwgb3IgYHN5bmNgIChvZmZzZXQgYW5kIHJhdGlvIGFkYXB0YXRpb24pLlxuICAgKiBAcGFyYW0ge051bWJlcn0gcmVwb3J0LnN0YXR1c0R1cmF0aW9uIGR1cmF0aW9uIHNpbmNlIGxhc3Qgc3RhdHVzXG4gICAqIGNoYW5nZS5cbiAgICogQHBhcmFtIHtOdW1iZXJ9IHJlcG9ydC50aW1lT2Zmc2V0IHRpbWUgZGlmZmVyZW5jZSBiZXR3ZWVuIGxvY2FsXG4gICAqIHRpbWUgYW5kIHN5bmMgdGltZSwgaW4gc2Vjb25kcy5cbiAgICogQHBhcmFtIHtOdW1iZXJ9IHJlcG9ydC5mcmVxdWVuY3lSYXRpbyB0aW1lIHJhdGlvIGJldHdlZW4gbG9jYWxcbiAgICogdGltZSBhbmQgc3luYyB0aW1lLlxuICAgKiBAcGFyYW0ge1N0cmluZ30gcmVwb3J0LmNvbm5lY3Rpb24gYG9mZmxpbmVgIG9yIGBvbmxpbmVgXG4gICAqIEBwYXJhbSB7TnVtYmVyfSByZXBvcnQuY29ubmVjdGlvbkR1cmF0aW9uIGR1cmF0aW9uIHNpbmNlIGxhc3QgY29ubmVjdGlvblxuICAgKiBjaGFuZ2UuXG4gICAqIEBwYXJhbSB7TnVtYmVyfSByZXBvcnQuY29ubmVjdGlvblRpbWVPdXQgZHVyYXRpb24sIGluIHNlY29uZHMsIGJlZm9yZVxuICAgKiBhIHRpbWUtb3V0IG9jY3Vycy5cbiAgICogQHBhcmFtIHtOdW1iZXJ9IHJlcG9ydC50cmF2ZWxEdXJhdGlvbiBkdXJhdGlvbiBvZiBhXG4gICAqIHBpbmctcG9uZyByb3VuZC10cmlwLCBpbiBzZWNvbmRzLCBtZWFuIG92ZXIgdGhlIHRoZSBsYXN0XG4gICAqIHBpbmctcG9uZyBzZXJpZXMuXG4gICAqIEBwYXJhbSB7TnVtYmVyfSByZXBvcnQudHJhdmVsRHVyYXRpb25NaW4gZHVyYXRpb24gb2YgYVxuICAgKiBwaW5nLXBvbmcgcm91bmQtdHJpcCwgaW4gc2Vjb25kcywgbWluaW11bSBvdmVyIHRoZSB0aGUgbGFzdFxuICAgKiBwaW5nLXBvbmcgc2VyaWVzLlxuICAgKiBAcGFyYW0ge051bWJlcn0gcmVwb3J0LnRyYXZlbER1cmF0aW9uTWF4IGR1cmF0aW9uIG9mIGFcbiAgICogcGluZy1wb25nIHJvdW5kLXRyaXAsIGluIHNlY29uZHMsIG1heGltdW0gb3ZlciB0aGUgdGhlIGxhc3RcbiAgICogcGluZy1wb25nIHNlcmllcy5cbiAgICoqL1xuXG4gIC8qKlxuICAgKiBUaGlzIGlzIHRoZSBjb25zdHJ1Y3Rvci4gU2VlIHtAbGlua2NvZGUgU3luY0NsaWVudH5zdGFydH0gbWV0aG9kIHRvXG4gICAqIGFjdHVhbGx5IHN0YXJ0IGEgc3luY2hyb25pc2F0aW9uIHByb2Nlc3MuXG4gICAqXG4gICAqIEBjb25zdHJ1Y3RzIFN5bmNDbGllbnRcbiAgICogQHBhcmFtIHtTeW5jQ2xpZW50fmdldFRpbWVGdW5jdGlvbn0gZ2V0VGltZUZ1bmN0aW9uXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc11cbiAgICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zLnBpbmdUaW1lT3V0RGVsYXldIHJhbmdlIG9mIGR1cmF0aW9uIChpbiBzZWNvbmRzKSB0b1xuICAgKiBjb25zaWRlciBhIHBpbmcgd2FzIG5vdCBwb25nZWQgYmFja1xuICAgKiBAcGFyYW0ge051bWJlcn0gW29wdGlvbnMucGluZ1RpbWVPdXREZWxheS5taW49MV0gbWluIGFuZCBtYXggbXVzdCBiZSBzZXQgdG9nZXRoZXJcbiAgICogQHBhcmFtIHtOdW1iZXJ9IFtvcHRpb25zLnBpbmdUaW1lT3V0RGVsYXkubWF4PTMwXSBtaW4gYW5kIG1heCBtdXN0IGJlIHNldCB0b2dldGhlclxuICAgKiBAcGFyYW0ge051bWJlcn0gW29wdGlvbnMucGluZ1Nlcmllc0l0ZXJhdGlvbnM9MTBdIG51bWJlciBvZiBwaW5nLXBvbmdzIGluIGFcbiAgICogc2VyaWVzXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBbb3B0aW9ucy5waW5nU2VyaWVzUGVyaW9kPTAuMjUwXSBpbnRlcnZhbCAoaW4gc2Vjb25kcykgYmV0d2VlbiBwaW5nc1xuICAgKiBpbiBhIHNlcmllc1xuICAgKiBAcGFyYW0ge051bWJlcn0gW29wdGlvbnMucGluZ1Nlcmllc0RlbGF5XSByYW5nZSBvZiBpbnRlcnZhbCAoaW5cbiAgICogc2Vjb25kcykgYmV0d2VlbiBwaW5nLXBvbmcgc2VyaWVzXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBbb3B0aW9ucy5waW5nU2VyaWVzRGVsYXkubWluPTEwXSBtaW4gYW5kIG1heCBtdXN0IGJlIHNldCB0b2dldGhlclxuICAgKiBAcGFyYW0ge051bWJlcn0gW29wdGlvbnMucGluZ1Nlcmllc0RlbGF5Lm1heD0yMF0gbWluIGFuZCBtYXggbXVzdCBiZSBzZXQgdG9nZXRoZXJcbiAgICogQHBhcmFtIHtOdW1iZXJ9IFtvcHRpb25zLmxvbmdUZXJtRGF0YVRyYWluaW5nRHVyYXRpb249MTIwXSBkdXJhdGlvbiBvZlxuICAgKiB0cmFpbmluZywgaW4gc2Vjb25kcywgYXBwcm94aW1hdGVseSwgYmVmb3JlIHVzaW5nIHRoZSBlc3RpbWF0ZSBvZlxuICAgKiBjbG9jayBmcmVxdWVuY3lcbiAgICogQHBhcmFtIHtOdW1iZXJ9IFtvcHRpb25zLmxvbmdUZXJtRGF0YUR1cmF0aW9uPTkwMF0gZXN0aW1hdGUgc3luY2hyb25pc2F0aW9uIG92ZXJcbiAgICogIHRoaXMgZHVyYXRpb24sIGluIHNlY29uZHMsIGFwcHJveGltYXRlbHlcbiAgICovXG4gIGNvbnN0cnVjdG9yKGdldFRpbWVGdW5jdGlvbiwgb3B0aW9ucyA9IHt9KSB7XG4gICAgdGhpcy5waW5nVGltZW91dERlbGF5ID0gb3B0aW9ucy5waW5nVGltZW91dERlbGF5XG4gICAgICB8fCB7IG1pbjogMSwgbWF4OiAzMCB9O1xuICAgIG9yZGVyTWluTWF4KHRoaXMucGluZ1RpbWVvdXREZWxheSk7XG5cbiAgICB0aGlzLnBpbmdTZXJpZXNJdGVyYXRpb25zID0gb3B0aW9ucy5waW5nU2VyaWVzSXRlcmF0aW9ucyB8fCAxMDtcbiAgICB0aGlzLnBpbmdTZXJpZXNQZXJpb2QgPSBvcHRpb25zLnBpbmdTZXJpZXNQZXJpb2QgfHwgMC4yNTA7XG4gICAgdGhpcy5waW5nU2VyaWVzRGVsYXkgPSBvcHRpb25zLnBpbmdTZXJpZXNEZWxheVxuICAgICAgfHwgeyBtaW46IDEwLCBtYXg6IDIwIH07XG4gICAgb3JkZXJNaW5NYXgodGhpcy5waW5nU2VyaWVzRGVsYXkpO1xuXG4gICAgdGhpcy5waW5nRGVsYXkgPSAwOyAvLyBjdXJyZW50IGRlbGF5IGJlZm9yZSBuZXh0IHBpbmdcbiAgICB0aGlzLnBpbmdUaW1lb3V0SWQgPSAwOyAvLyB0byBjYW5jZWwgdGltZW91dCBvbiBzeW5jX3BpbmNcbiAgICB0aGlzLnBpbmdJZCA9IDA7IC8vIGFic29sdXRlIElEIHRvIG1hY2ggcG9uZyBhZ2FpbnN0XG5cbiAgICB0aGlzLnBpbmdTZXJpZXNDb3VudCA9IDA7IC8vIGVsYXBzZWQgcGluZ3MgaW4gYSBzZXJpZXNcbiAgICB0aGlzLnNlcmllc0RhdGEgPSBbXTsgLy8gY2lyY3VsYXIgYnVmZmVyXG4gICAgdGhpcy5zZXJpZXNEYXRhTmV4dEluZGV4ID0gMDsgLy8gbmV4dCBpbmRleCB0byB3cml0ZSBpbiBjaXJjdWxhciBidWZmZXJcbiAgICB0aGlzLnNlcmllc0RhdGFMZW5ndGggPSB0aGlzLnBpbmdTZXJpZXNJdGVyYXRpb25zOyAvLyBzaXplIG9mIGNpcmN1bGFyIGJ1ZmZlclxuXG4gICAgdGhpcy5sb25nVGVybURhdGFUcmFpbmluZ0R1cmF0aW9uXG4gICAgICA9IG9wdGlvbnMubG9uZ1Rlcm1EYXRhVHJhaW5pbmdEdXJhdGlvbiB8fCAxMjA7XG5cbiAgICAvLyB1c2UgYSBmaXhlZC1zaXplIGNpcmN1bGFyIGJ1ZmZlciwgZXZlbiBpZiBpdCBkb2VzIG5vdCBtYXRjaFxuICAgIC8vIGV4YWN0bHkgdGhlIHJlcXVpcmVkIGR1cmF0aW9uXG4gICAgdGhpcy5sb25nVGVybURhdGFEdXJhdGlvbiA9IG9wdGlvbnMubG9uZ1Rlcm1EYXRhRHVyYXRpb24gfHwgOTAwO1xuICAgIHRoaXMubG9uZ1Rlcm1EYXRhTGVuZ3RoID0gTWF0aC5tYXgoXG4gICAgICAyLFxuICAgICAgdGhpcy5sb25nVGVybURhdGFEdXJhdGlvbiAvXG4gICAgICAgICgwLjUgKiAodGhpcy5waW5nU2VyaWVzRGVsYXkubWluICsgdGhpcy5waW5nU2VyaWVzRGVsYXkubWF4KSApICk7XG5cbiAgICB0aGlzLmxvbmdUZXJtRGF0YSA9IFtdOyAvLyBjaXJjdWxhciBidWZmZXJcbiAgICB0aGlzLmxvbmdUZXJtRGF0YU5leHRJbmRleCA9IDA7IC8vIG5leHQgaW5kZXggdG8gd3JpdGUgaW4gY2lyY3VsYXIgYnVmZmVyXG5cbiAgICB0aGlzLnRpbWVPZmZzZXQgPSAwOyAvLyBtZWFuIG9mIChzZXJ2ZXJUaW1lIC0gY2xpZW50VGltZSkgaW4gdGhlIGxhc3Qgc2VyaWVzXG4gICAgdGhpcy50cmF2ZWxEdXJhdGlvbiA9IDA7XG4gICAgdGhpcy50cmF2ZWxEdXJhdGlvbk1pbiA9IDA7XG4gICAgdGhpcy50cmF2ZWxEdXJhdGlvbk1heCA9IDA7XG5cbiAgICAvLyBUKHQpID0gVDAgKyBSICogKHQgLSB0MClcbiAgICB0aGlzLnNlcnZlclRpbWVSZWZlcmVuY2UgPSAwOyAvLyBUMFxuICAgIHRoaXMuY2xpZW50VGltZVJlZmVyZW5jZSA9IDA7IC8vIHQwXG4gICAgdGhpcy5mcmVxdWVuY3lSYXRpbyA9IDE7IC8vIFJcblxuICAgIHRoaXMucGluZ1RpbWVvdXREZWxheS5jdXJyZW50ID0gdGhpcy5waW5nVGltZW91dERlbGF5Lm1pbjtcblxuICAgIHRoaXMuZ2V0VGltZUZ1bmN0aW9uID0gZ2V0VGltZUZ1bmN0aW9uO1xuXG4gICAgdGhpcy5zdGF0dXMgPSAnbmV3JztcbiAgICB0aGlzLnN0YXR1c0NoYW5nZWRUaW1lID0gMDtcblxuICAgIHRoaXMuY29ubmVjdGlvblN0YXR1cyA9ICdvZmZsaW5lJztcbiAgICB0aGlzLmNvbm5lY3Rpb25TdGF0dXNDaGFuZ2VkVGltZSA9IDA7XG4gIH1cblxuXG4gIC8qKlxuICAgKiBTZXQgc3RhdHVzLCBhbmQgc2V0IHRoaXMuc3RhdHVzQ2hhbmdlZFRpbWUsIHRvIGxhdGVyXG4gICAqIHVzZSBzZWUge0BsaW5rY29kZSBTeW5jQ2xpZW50fmdldFN0YXR1c0R1cmF0aW9ufVxuICAgKiBhbmQge0BsaW5rY29kZSBTeW5jQ2xpZW50fnJlcG9ydFN0YXR1c30uXG4gICAqXG4gICAqIEBmdW5jdGlvbiBTeW5jQ2xpZW50fnNldFN0YXR1c1xuICAgKiBAcGFyYW0ge1N0cmluZ30gc3RhdHVzXG4gICAqIEByZXR1cm5zIHtPYmplY3R9IHRoaXNcbiAgICovXG4gIHNldFN0YXR1cyhzdGF0dXMpIHtcbiAgICBpZihzdGF0dXMgIT09IHRoaXMuc3RhdHVzKSB7XG4gICAgICB0aGlzLnN0YXR1cyA9IHN0YXR1cztcbiAgICAgIHRoaXMuc3RhdHVzQ2hhbmdlZFRpbWUgPSB0aGlzLmdldExvY2FsVGltZSgpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgdGltZSBzaW5jZSBsYXN0IHN0YXR1cyBjaGFuZ2UuIFNlZSB7QGxpbmtjb2RlIFN5bmNDbGllbnR+c2V0U3RhdHVzfVxuICAgKlxuICAgKiBAZnVuY3Rpb24gU3luY0NsaWVudH5nZXRTdGF0dXNEdXJhdGlvblxuICAgKiBAcmV0dXJucyB7TnVtYmVyfSB0aW1lLCBpbiBzZWNvbmRzLCBzaW5jZSBsYXN0IHN0YXR1cyBjaGFuZ2UuXG4gICAqL1xuICBnZXRTdGF0dXNEdXJhdGlvbigpIHtcbiAgICByZXR1cm4gTWF0aC5tYXgoMCwgdGhpcy5nZXRMb2NhbFRpbWUoKSAtIHRoaXMuc3RhdHVzQ2hhbmdlZFRpbWUpO1xuICB9XG5cbiAgLyoqXG4gICAqIFNldCBjb25uZWN0aW9uU3RhdHVzLCBhbmQgc2V0IHRoaXMuY29ubmVjdGlvblN0YXR1c0NoYW5nZWRUaW1lLFxuICAgKiB0byBsYXRlciB1c2Ugc2VlIHtAbGlua2NvZGUgU3luY0NsaWVudH5nZXRDb25uZWN0aW9uU3RhdHVzRHVyYXRpb259XG4gICAqIGFuZCB7QGxpbmtjb2RlIFN5bmNDbGllbnR+cmVwb3J0U3RhdHVzfS5cbiAgICpcbiAgICogQGZ1bmN0aW9uIFN5bmNDbGllbnR+c2V0Q29ubmVjdGlvblN0YXR1c1xuICAgKiBAcGFyYW0ge1N0cmluZ30gY29ubmVjdGlvblN0YXR1c1xuICAgKiBAcmV0dXJucyB7T2JqZWN0fSB0aGlzXG4gICAqL1xuICBzZXRDb25uZWN0aW9uU3RhdHVzKGNvbm5lY3Rpb25TdGF0dXMpIHtcbiAgICBpZihjb25uZWN0aW9uU3RhdHVzICE9PSB0aGlzLmNvbm5lY3Rpb25TdGF0dXMpIHtcbiAgICAgIHRoaXMuY29ubmVjdGlvblN0YXR1cyA9IGNvbm5lY3Rpb25TdGF0dXM7XG4gICAgICB0aGlzLmNvbm5lY3Rpb25TdGF0dXNDaGFuZ2VkVGltZSA9IHRoaXMuZ2V0TG9jYWxUaW1lKCk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCB0aW1lIHNpbmNlIGxhc3QgY29ubmVjdGlvblN0YXR1cyBjaGFuZ2UuXG4gICAqIFNlZSB7QGxpbmtjb2RlIFN5bmNDbGllbnR+c2V0Q29ubmVjdGlvblN0YXR1c31cbiAgICpcbiAgICogQGZ1bmN0aW9uIFN5bmNDbGllbnR+Z2V0Q29ubmVjdGlvblN0YXR1c0R1cmF0aW9uXG4gICAqIEByZXR1cm5zIHtOdW1iZXJ9IHRpbWUsIGluIHNlY29uZHMsIHNpbmNlIGxhc3QgY29ubmVjdGlvblN0YXR1c1xuICAgKiBjaGFuZ2UuXG4gICAqL1xuICBnZXRDb25uZWN0aW9uU3RhdHVzRHVyYXRpb24oKSB7XG4gICAgcmV0dXJuIE1hdGgubWF4KDAsIHRoaXMuZ2V0TG9jYWxUaW1lKCkgLSB0aGlzLmNvbm5lY3Rpb25TdGF0dXNDaGFuZ2VkVGltZSk7XG4gIH1cblxuICAvKipcbiAgICogUmVwb3J0IHRoZSBzdGF0dXMgb2YgdGhlIHN5bmNocm9uaXNhdGlvbiBwcm9jZXNzLCBpZlxuICAgKiByZXBvcnRGdW5jdGlvbiBpcyBkZWZpbmVkLlxuICAgKlxuICAgKiBAZnVuY3Rpb24gU3luY0NsaWVudH5yZXBvcnRTdGF0dXNcbiAgICogQHBhcmFtIHtTeW5jQ2xpZW50fnJlcG9ydEZ1bmN0aW9ufSByZXBvcnRGdW5jdGlvblxuICAgKi9cbiAgcmVwb3J0U3RhdHVzKHJlcG9ydEZ1bmN0aW9uKSB7XG4gICAgaWYodHlwZW9mIHJlcG9ydEZ1bmN0aW9uICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgcmVwb3J0RnVuY3Rpb24oe1xuICAgICAgICBzdGF0dXM6IHRoaXMuc3RhdHVzLFxuICAgICAgICBzdGF0dXNEdXJhdGlvbjogdGhpcy5nZXRTdGF0dXNEdXJhdGlvbigpLFxuICAgICAgICB0aW1lT2Zmc2V0OiB0aGlzLnRpbWVPZmZzZXQsXG4gICAgICAgIGZyZXF1ZW5jeVJhdGlvOiB0aGlzLmZyZXF1ZW5jeVJhdGlvLFxuICAgICAgICBjb25uZWN0aW9uOiB0aGlzLmNvbm5lY3Rpb25TdGF0dXMsXG4gICAgICAgIGNvbm5lY3Rpb25EdXJhdGlvbjogdGhpcy5nZXRDb25uZWN0aW9uU3RhdHVzRHVyYXRpb24oKSxcbiAgICAgICAgY29ubmVjdGlvblRpbWVPdXQ6IHRoaXMucGluZ1RpbWVvdXREZWxheS5jdXJyZW50LFxuICAgICAgICB0cmF2ZWxEdXJhdGlvbjogdGhpcy50cmF2ZWxEdXJhdGlvbixcbiAgICAgICAgdHJhdmVsRHVyYXRpb25NaW46IHRoaXMudHJhdmVsRHVyYXRpb25NaW4sXG4gICAgICAgIHRyYXZlbER1cmF0aW9uTWF4OiB0aGlzLnRyYXZlbER1cmF0aW9uTWF4XG4gICAgICB9KTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogUHJvY2VzcyB0byBzZW5kIHBpbmcgbWVzc2FnZXMuXG4gICAqXG4gICAqIEBwcml2YXRlXG4gICAqIEBmdW5jdGlvbiBTeW5jQ2xpZW50fl9fc3luY0xvb3BcbiAgICogQHBhcmFtIHtTeW5jQ2xpZW50fnNlbmRGdW5jdGlvbn0gc2VuZEZ1bmN0aW9uXG4gICAqIEBwYXJhbSB7U3luY0NsaWVudH5yZXBvcnRGdW5jdGlvbn0gcmVwb3J0RnVuY3Rpb25cbiAgICovXG4gIF9fc3luY0xvb3Aoc2VuZEZ1bmN0aW9uLCByZXBvcnRGdW5jdGlvbikge1xuICAgIGNsZWFyVGltZW91dCh0aGlzLnRpbWVvdXRJZCk7XG4gICAgKyt0aGlzLnBpbmdJZDtcbiAgICBzZW5kRnVuY3Rpb24odGhpcy5waW5nSWQsIHRoaXMuZ2V0TG9jYWxUaW1lKCkpO1xuXG4gICAgdGhpcy50aW1lb3V0SWQgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIC8vIGluY3JlYXNlIHRpbWVvdXQgZHVyYXRpb24gb24gdGltZW91dCwgdG8gYXZvaWQgb3ZlcmZsb3dcbiAgICAgIHRoaXMucGluZ1RpbWVvdXREZWxheS5jdXJyZW50ID0gTWF0aC5taW4odGhpcy5waW5nVGltZW91dERlbGF5LmN1cnJlbnQgKiAyLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBpbmdUaW1lb3V0RGVsYXkubWF4KTtcbiAgICAgIGxvZygnc3luYzpwaW5nIHRpbWVvdXQgPiAlcycsIHRoaXMucGluZ1RpbWVvdXREZWxheS5jdXJyZW50KTtcbiAgICAgIHRoaXMuc2V0Q29ubmVjdGlvblN0YXR1cygnb2ZmbGluZScpO1xuICAgICAgdGhpcy5yZXBvcnRTdGF0dXMocmVwb3J0RnVuY3Rpb24pO1xuICAgICAgLy8gcmV0cnkgKHllcywgYWx3YXlzIGluY3JlbWVudCBwaW5nSWQpXG4gICAgICB0aGlzLl9fc3luY0xvb3Aoc2VuZEZ1bmN0aW9uLCByZXBvcnRGdW5jdGlvbik7XG4gICAgfSwgMTAwMCAqIHRoaXMucGluZ1RpbWVvdXREZWxheS5jdXJyZW50KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTdGFydCBhIHN5bmNocm9uaXNhdGlvbiBwcm9jZXNzIGJ5IHJlZ2lzdGVyaW5nIHRoZSByZWNlaXZlXG4gICAqIGZ1bmN0aW9uIHBhc3NlZCBhcyBzZWNvbmQgcGFyYW1ldGVyLiBUaGVuLCBzZW5kIHJlZ3VsYXIgbWVzc2FnZXNcbiAgICogdG8gdGhlIHNlcnZlciwgdXNpbmcgdGhlIHNlbmQgZnVuY3Rpb24gcGFzc2VkIGFzIGZpcnN0IHBhcmFtZXRlci5cbiAgICpcbiAgICogQGZ1bmN0aW9uIFN5bmNDbGllbnR+c3RhcnRcbiAgICogQHBhcmFtIHtTeW5jQ2xpZW50fnNlbmRGdW5jdGlvbn0gc2VuZEZ1bmN0aW9uXG4gICAqIEBwYXJhbSB7U3luY0NsaWVudH5yZWNlaXZlRnVuY3Rpb259IHJlY2VpdmVGdW5jdGlvbiB0byByZWdpc3RlclxuICAgKiBAcGFyYW0ge1N5bmNDbGllbnR+cmVwb3J0RnVuY3Rpb259IHJlcG9ydEZ1bmN0aW9uIGlmIGRlZmluZWQsXG4gICAqIGlzIGNhbGxlZCB0byByZXBvcnQgdGhlIHN0YXR1cywgb24gZWFjaCBzdGF0dXMgY2hhbmdlXG4gICAqL1xuICBzdGFydChzZW5kRnVuY3Rpb24sIHJlY2VpdmVGdW5jdGlvbiwgcmVwb3J0RnVuY3Rpb24pIHtcbiAgICB0aGlzLnNldFN0YXR1cygnc3RhcnR1cCcpO1xuICAgIHRoaXMuc2V0Q29ubmVjdGlvblN0YXR1cygnb2ZmbGluZScpO1xuXG4gICAgdGhpcy5zZXJpZXNEYXRhID0gW107XG4gICAgdGhpcy5zZXJpZXNEYXRhTmV4dEluZGV4ID0gMDtcblxuICAgIHRoaXMubG9uZ1Rlcm1EYXRhID0gW107XG4gICAgdGhpcy5sb25nVGVybURhdGFOZXh0SW5kZXggPSAwO1xuXG4gICAgcmVjZWl2ZUZ1bmN0aW9uKChwaW5nSWQsIGNsaWVudFBpbmdUaW1lLCBzZXJ2ZXJQaW5nVGltZSwgc2VydmVyUG9uZ1RpbWUpID0+IHtcbiAgICAgIC8vIGFjY2VwdCBvbmx5IHRoZSBwb25nIHRoYXQgY29ycmVzcG9uZHMgdG8gdGhlIGxhc3QgcGluZ1xuICAgICAgaWYgKHBpbmdJZCA9PT0gdGhpcy5waW5nSWQpIHtcbiAgICAgICAgKyt0aGlzLnBpbmdTZXJpZXNDb3VudDtcbiAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMudGltZW91dElkKTtcbiAgICAgICAgdGhpcy5zZXRDb25uZWN0aW9uU3RhdHVzKCdvbmxpbmUnKTtcbiAgICAgICAgLy8gcmVkdWNlIHRpbWVvdXQgZHVyYXRpb24gb24gcG9uZywgZm9yIGJldHRlciByZWFjdGl2aXR5XG4gICAgICAgIHRoaXMucGluZ1RpbWVvdXREZWxheS5jdXJyZW50ID0gTWF0aC5tYXgodGhpcy5waW5nVGltZW91dERlbGF5LmN1cnJlbnQgKiAwLjc1LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGluZ1RpbWVvdXREZWxheS5taW4pO1xuXG4gICAgICAgIC8vIHRpbWUtZGlmZmVyZW5jZXMgYXJlIHZhbGlkIG9uIGEgc2luZ2xlLXNpZGUgb25seSAoY2xpZW50IG9yIHNlcnZlcilcbiAgICAgICAgY29uc3QgY2xpZW50UG9uZ1RpbWUgPSB0aGlzLmdldExvY2FsVGltZSgpO1xuICAgICAgICBjb25zdCBjbGllbnRUaW1lID0gMC41ICogKGNsaWVudFBvbmdUaW1lICsgY2xpZW50UGluZ1RpbWUpO1xuICAgICAgICBjb25zdCBzZXJ2ZXJUaW1lID0gMC41ICogKHNlcnZlclBvbmdUaW1lICsgc2VydmVyUGluZ1RpbWUpO1xuICAgICAgICBjb25zdCB0cmF2ZWxEdXJhdGlvbiA9IE1hdGgubWF4KDAsIChjbGllbnRQb25nVGltZSAtIGNsaWVudFBpbmdUaW1lKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC0gKHNlcnZlclBvbmdUaW1lIC0gc2VydmVyUGluZ1RpbWUpKTtcbiAgICAgICAgY29uc3Qgb2Zmc2V0VGltZSA9IHNlcnZlclRpbWUgLSBjbGllbnRUaW1lO1xuXG4gICAgICAgIC8vIG9yZGVyIGlzIGltcG9ydGFudCBmb3Igc29ydGluZywgbGF0ZXIuXG4gICAgICAgIHRoaXMuc2VyaWVzRGF0YVt0aGlzLnNlcmllc0RhdGFOZXh0SW5kZXhdXG4gICAgICAgICAgPSBbdHJhdmVsRHVyYXRpb24sIG9mZnNldFRpbWUsIGNsaWVudFRpbWUsIHNlcnZlclRpbWVdO1xuICAgICAgICB0aGlzLnNlcmllc0RhdGFOZXh0SW5kZXggPSAoKyt0aGlzLnNlcmllc0RhdGFOZXh0SW5kZXgpICUgdGhpcy5zZXJpZXNEYXRhTGVuZ3RoO1xuXG4gICAgICAgIC8vIGxvZygncGluZyAlcywgdHJhdmVsID0gJXMsIG9mZnNldCA9ICVzLCBjbGllbnQgPSAlcywgc2VydmVyID0gJXMnLFxuICAgICAgICAvLyAgICAgICBwaW5nSWQsIHRyYXZlbER1cmF0aW9uLCBvZmZzZXRUaW1lLCBjbGllbnRUaW1lLCBzZXJ2ZXJUaW1lKTtcblxuICAgICAgICAvLyBlbmQgb2YgYSBzZXJpZXNcbiAgICAgICAgaWYgKHRoaXMucGluZ1Nlcmllc0NvdW50ID49IHRoaXMucGluZ1Nlcmllc0l0ZXJhdGlvbnNcbiAgICAgICAgICAgICYmIHRoaXMuc2VyaWVzRGF0YS5sZW5ndGggPj0gdGhpcy5zZXJpZXNEYXRhTGVuZ3RoKSB7XG4gICAgICAgICAgLy8gcGxhbiB0aGUgYmVnaW5pbmcgb2YgdGhlIG5leHQgc2VyaWVzXG4gICAgICAgICAgdGhpcy5waW5nRGVsYXkgPSB0aGlzLnBpbmdTZXJpZXNEZWxheS5taW5cbiAgICAgICAgICAgICsgTWF0aC5yYW5kb20oKSAqICh0aGlzLnBpbmdTZXJpZXNEZWxheS5tYXggLSB0aGlzLnBpbmdTZXJpZXNEZWxheS5taW4pO1xuICAgICAgICAgIHRoaXMucGluZ1Nlcmllc0NvdW50ID0gMDtcblxuICAgICAgICAgIC8vIHNvcnQgYnkgdHJhdmVsIHRpbWUgZmlyc3QsIHRoZW4gb2Zmc2V0IHRpbWUuXG4gICAgICAgICAgY29uc3Qgc29ydGVkID0gdGhpcy5zZXJpZXNEYXRhLnNsaWNlKDApLnNvcnQoKTtcblxuICAgICAgICAgIGNvbnN0IHNlcmllc1RyYXZlbER1cmF0aW9uID0gc29ydGVkWzBdWzBdO1xuXG4gICAgICAgICAgLy8gV2hlbiB0aGUgY2xvY2sgdGljayBpcyBsb25nIGVub3VnaCxcbiAgICAgICAgICAvLyBzb21lIHRyYXZlbCB0aW1lcyAoZGltZW5zaW9uIDApIG1pZ2h0IGJlIGlkZW50aWNhbC5cbiAgICAgICAgICAvLyBUaGVuLCB1c2UgdGhlIG9mZnNldCBtZWRpYW4gKGRpbWVuc2lvbiAxIGlzIHRoZSBzZWNvbmQgc29ydCBrZXkpXG4gICAgICAgICAgbGV0IHMgPSAwO1xuICAgICAgICAgIHdoaWxlKHMgPCBzb3J0ZWQubGVuZ3RoICYmIHNvcnRlZFtzXVswXSA8PSBzZXJpZXNUcmF2ZWxEdXJhdGlvbiAqIDEuMDEpIHtcbiAgICAgICAgICAgICsrcztcbiAgICAgICAgICB9XG4gICAgICAgICAgcyA9IE1hdGgubWF4KDAsIHMgLSAxKTtcbiAgICAgICAgICBjb25zdCBtZWRpYW4gPSBNYXRoLmZsb29yKHMgLyAyKTtcblxuICAgICAgICAgIGNvbnN0IHNlcmllc0NsaWVudFRpbWUgPSBzb3J0ZWRbbWVkaWFuXVsyXTtcbiAgICAgICAgICBjb25zdCBzZXJpZXNTZXJ2ZXJUaW1lID0gc29ydGVkW21lZGlhbl1bM107XG4gICAgICAgICAgY29uc3Qgc2VyaWVzQ2xpZW50U3F1YXJlZFRpbWUgPSBzZXJpZXNDbGllbnRUaW1lICogc2VyaWVzQ2xpZW50VGltZTtcbiAgICAgICAgICBjb25zdCBzZXJpZXNDbGllbnRTZXJ2ZXJUaW1lID0gc2VyaWVzQ2xpZW50VGltZSAqIHNlcmllc1NlcnZlclRpbWU7XG5cbiAgICAgICAgICB0aGlzLmxvbmdUZXJtRGF0YVt0aGlzLmxvbmdUZXJtRGF0YU5leHRJbmRleF1cbiAgICAgICAgICAgID0gW3Nlcmllc1RyYXZlbER1cmF0aW9uLCBzZXJpZXNDbGllbnRUaW1lLCBzZXJpZXNTZXJ2ZXJUaW1lLFxuICAgICAgICAgICAgICAgc2VyaWVzQ2xpZW50U3F1YXJlZFRpbWUsIHNlcmllc0NsaWVudFNlcnZlclRpbWVdO1xuICAgICAgICAgIHRoaXMubG9uZ1Rlcm1EYXRhTmV4dEluZGV4ID0gKCsrdGhpcy5sb25nVGVybURhdGFOZXh0SW5kZXgpICUgdGhpcy5sb25nVGVybURhdGFMZW5ndGg7XG5cbiAgICAgICAgICAvLyBtZWFuIG9mIHRoZSB0aW1lIG9mZnNldCBvdmVyIDMgc2FtcGxlcyBhcm91bmQgbWVkaWFuXG4gICAgICAgICAgLy8gKGl0IG1pZ2h0IHVzZSBhIGxvbmdlciB0cmF2ZWwgZHVyYXRpb24pXG4gICAgICAgICAgY29uc3QgYXJvdW5kTWVkaWFuID0gc29ydGVkLnNsaWNlKE1hdGgubWF4KDAsIG1lZGlhbiAtIDEpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBNYXRoLm1pbihzb3J0ZWQubGVuZ3RoLCBtZWRpYW4gKyAxKSApO1xuICAgICAgICAgIHRoaXMudGltZU9mZnNldCA9IG1lYW4oYXJvdW5kTWVkaWFuLCAzKSAtIG1lYW4oYXJvdW5kTWVkaWFuLCAyKTtcblxuICAgICAgICAgIGlmKHRoaXMuc3RhdHVzID09PSAnc3RhcnR1cCdcbiAgICAgICAgICAgICB8fCAodGhpcy5zdGF0dXMgPT09ICd0cmFpbmluZydcbiAgICAgICAgICAgICAgICAgJiYgdGhpcy5nZXRTdGF0dXNEdXJhdGlvbigpIDwgdGhpcy5sb25nVGVybURhdGFUcmFpbmluZ0R1cmF0aW9uKSApIHtcbiAgICAgICAgICAgIC8vIHNldCBvbmx5IHRoZSBwaGFzZSBvZmZzZXQsIG5vdCB0aGUgZnJlcXVlbmN5XG4gICAgICAgICAgICB0aGlzLnNlcnZlclRpbWVSZWZlcmVuY2UgPSB0aGlzLnRpbWVPZmZzZXQ7XG4gICAgICAgICAgICB0aGlzLmNsaWVudFRpbWVSZWZlcmVuY2UgPSAwO1xuICAgICAgICAgICAgdGhpcy5mcmVxdWVuY3lSYXRpbyA9IDE7XG4gICAgICAgICAgICB0aGlzLnNldFN0YXR1cygndHJhaW5pbmcnKTtcbiAgICAgICAgICAgIGxvZygnVCA9ICVzICsgJXMgKiAoJXMgLSAlcykgPSAlcycsXG4gICAgICAgICAgICAgICAgICB0aGlzLnNlcnZlclRpbWVSZWZlcmVuY2UsIHRoaXMuZnJlcXVlbmN5UmF0aW8sXG4gICAgICAgICAgICAgICAgICBzZXJpZXNDbGllbnRUaW1lLCB0aGlzLmNsaWVudFRpbWVSZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgICB0aGlzLmdldFN5bmNUaW1lKHNlcmllc0NsaWVudFRpbWUpKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZigodGhpcy5zdGF0dXMgPT09ICd0cmFpbmluZydcbiAgICAgICAgICAgICAgJiYgdGhpcy5nZXRTdGF0dXNEdXJhdGlvbigpID49IHRoaXMubG9uZ1Rlcm1EYXRhVHJhaW5pbmdEdXJhdGlvbilcbiAgICAgICAgICAgICB8fCB0aGlzLnN0YXR1cyA9PT0gJ3N5bmMnKSB7XG4gICAgICAgICAgICAvLyBsaW5lYXIgcmVncmVzc2lvbiwgUiA9IGNvdmFyaWFuY2UodCxUKSAvIHZhcmlhbmNlKHQpXG4gICAgICAgICAgICBjb25zdCByZWdDbGllbnRUaW1lID0gbWVhbih0aGlzLmxvbmdUZXJtRGF0YSwgMSk7XG4gICAgICAgICAgICBjb25zdCByZWdTZXJ2ZXJUaW1lID0gbWVhbih0aGlzLmxvbmdUZXJtRGF0YSwgMik7XG4gICAgICAgICAgICBjb25zdCByZWdDbGllbnRTcXVhcmVkVGltZSA9IG1lYW4odGhpcy5sb25nVGVybURhdGEsIDMpO1xuICAgICAgICAgICAgY29uc3QgcmVnQ2xpZW50U2VydmVyVGltZSA9IG1lYW4odGhpcy5sb25nVGVybURhdGEsIDQpO1xuXG4gICAgICAgICAgICBjb25zdCBjb3ZhcmlhbmNlID0gcmVnQ2xpZW50U2VydmVyVGltZSAtIHJlZ0NsaWVudFRpbWUgKiByZWdTZXJ2ZXJUaW1lO1xuICAgICAgICAgICAgY29uc3QgdmFyaWFuY2UgPSByZWdDbGllbnRTcXVhcmVkVGltZSAtIHJlZ0NsaWVudFRpbWUgKiByZWdDbGllbnRUaW1lO1xuICAgICAgICAgICAgaWYodmFyaWFuY2UgPiAwKSB7XG4gICAgICAgICAgICAgIC8vIHVwZGF0ZSBmcmVxIGFuZCBzaGlmdFxuICAgICAgICAgICAgICB0aGlzLmZyZXF1ZW5jeVJhdGlvID0gY292YXJpYW5jZSAvIHZhcmlhbmNlO1xuICAgICAgICAgICAgICB0aGlzLmNsaWVudFRpbWVSZWZlcmVuY2UgPSByZWdDbGllbnRUaW1lO1xuICAgICAgICAgICAgICB0aGlzLnNlcnZlclRpbWVSZWZlcmVuY2UgPSByZWdTZXJ2ZXJUaW1lO1xuXG4gICAgICAgICAgICAgIC8vIDAuMDUlIGlzIGEgbG90ICg1MDAgUFBNLCBsaWtlIGFuIG9sZCBtZWNoYW5pY2FsIGNsb2NrKVxuICAgICAgICAgICAgICBpZih0aGlzLmZyZXF1ZW5jeVJhdGlvID4gMC45OTk1ICYmIHRoaXMuZnJlcXVlbmN5UmF0aW8gPCAxLjAwMDUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNldFN0YXR1cygnc3luYycpO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGxvZygnY2xvY2sgZnJlcXVlbmN5IHJhdGlvIG91dCBvZiBzeW5jOiAlcywgdHJhaW5pbmcgYWdhaW4nLFxuICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZnJlcXVlbmN5UmF0aW8pO1xuICAgICAgICAgICAgICAgIC8vIHN0YXJ0IHRoZSB0cmFpbmluZyBhZ2FpbiBmcm9tIHRoZSBsYXN0IHNlcmllc1xuICAgICAgICAgICAgICAgIHRoaXMuc2VydmVyVGltZVJlZmVyZW5jZSA9IHRoaXMudGltZU9mZnNldDsgLy8gb2Zmc2V0IG9ubHlcbiAgICAgICAgICAgICAgICB0aGlzLmNsaWVudFRpbWVSZWZlcmVuY2UgPSAwO1xuICAgICAgICAgICAgICAgIHRoaXMuZnJlcXVlbmN5UmF0aW8gPSAxO1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0U3RhdHVzKCd0cmFpbmluZycpO1xuXG4gICAgICAgICAgICAgICAgdGhpcy5sb25nVGVybURhdGFbMF1cbiAgICAgICAgICAgICAgICAgID0gW3Nlcmllc1RyYXZlbER1cmF0aW9uLCBzZXJpZXNDbGllbnRUaW1lLCBzZXJpZXNTZXJ2ZXJUaW1lLFxuICAgICAgICAgICAgICAgICAgICAgc2VyaWVzQ2xpZW50U3F1YXJlZFRpbWUsIHNlcmllc0NsaWVudFNlcnZlclRpbWVdO1xuICAgICAgICAgICAgICAgIHRoaXMubG9uZ1Rlcm1EYXRhLmxlbmd0aCA9IDE7XG4gICAgICAgICAgICAgICAgdGhpcy5sb25nVGVybURhdGFOZXh0SW5kZXggPSAxO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGxvZygnVCA9ICVzICsgJXMgKiAoJXMgLSAlcykgPSAlcycsXG4gICAgICAgICAgICAgICAgICB0aGlzLnNlcnZlclRpbWVSZWZlcmVuY2UsIHRoaXMuZnJlcXVlbmN5UmF0aW8sXG4gICAgICAgICAgICAgICAgICBzZXJpZXNDbGllbnRUaW1lLCB0aGlzLmNsaWVudFRpbWVSZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgICB0aGlzLmdldFN5bmNUaW1lKHNlcmllc0NsaWVudFRpbWUpICk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgdGhpcy50cmF2ZWxEdXJhdGlvbiA9IG1lYW4oc29ydGVkLCAwKTtcbiAgICAgICAgICB0aGlzLnRyYXZlbER1cmF0aW9uTWluID0gc29ydGVkWzBdWzBdO1xuICAgICAgICAgIHRoaXMudHJhdmVsRHVyYXRpb25NYXggPSBzb3J0ZWRbc29ydGVkLmxlbmd0aCAtIDFdWzBdO1xuXG4gICAgICAgICAgdGhpcy5yZXBvcnRTdGF0dXMocmVwb3J0RnVuY3Rpb24pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIHdlIGFyZSBpbiBhIHNlcmllcywgdXNlIHRoZSBwaW5nSW50ZXJ2YWwgdmFsdWVcbiAgICAgICAgICB0aGlzLnBpbmdEZWxheSA9IHRoaXMucGluZ1Nlcmllc1BlcmlvZDtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMudGltZW91dElkID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgdGhpcy5fX3N5bmNMb29wKHNlbmRGdW5jdGlvbiwgcmVwb3J0RnVuY3Rpb24pO1xuICAgICAgICB9LCAxMDAwICogdGhpcy5waW5nRGVsYXkpO1xuICAgICAgfSAgLy8gcGluZyBhbmQgcG9uZyBJRCBtYXRjaFxuICAgIH0pOyAvLyByZWNlaXZlIGZ1bmN0aW9uXG5cbiAgICB0aGlzLl9fc3luY0xvb3Aoc2VuZEZ1bmN0aW9uLCByZXBvcnRGdW5jdGlvbik7XG4gIH1cblxuICAvKipcbiAgICogR2V0IGxvY2FsIHRpbWUsIG9yIGNvbnZlcnQgYSBzeW5jaHJvbmlzZWQgdGltZSB0byBhIGxvY2FsIHRpbWUuXG4gICAqXG4gICAqIEBmdW5jdGlvbiBTeW5jQ2xpZW50fmdldExvY2FsVGltZVxuICAgKiBAcGFyYW0ge051bWJlcn0gc3luY1RpbWUgdW5kZWZpbmVkIHRvIGdldCBsb2NhbCB0aW1lXG4gICAqIEByZXR1cm5zIHtOdW1iZXJ9IGxvY2FsIHRpbWUsIGluIHNlY29uZHNcbiAgICovXG4gIGdldExvY2FsVGltZShzeW5jVGltZSkge1xuICAgIGlmICh0eXBlb2Ygc3luY1RpbWUgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAvLyBjb252ZXJzaW9uOiB0KFQpID0gdDAgKyAoVCAtIFQwKSAvIFJcbiAgICAgIHJldHVybiB0aGlzLmNsaWVudFRpbWVSZWZlcmVuY2VcbiAgICAgICAgKyAoc3luY1RpbWUgLSB0aGlzLnNlcnZlclRpbWVSZWZlcmVuY2UpIC8gdGhpcy5mcmVxdWVuY3lSYXRpbztcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gcmVhZCBsb2NhbCBjbG9ja1xuICAgICAgcmV0dXJuIHRoaXMuZ2V0VGltZUZ1bmN0aW9uKCk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEdldCBzeW5jaHJvbmlzZWQgdGltZSwgb3IgY29udmVydCBhIGxvY2FsIHRpbWUgdG8gYSBzeW5jaHJvbmlzZWQgdGltZS5cbiAgICpcbiAgICogQGZ1bmN0aW9uIFN5bmNDbGllbnR+Z2V0U3luY1RpbWVcbiAgICogQHBhcmFtIHtOdW1iZXJ9IGxvY2FsVGltZSB1bmRlZmluZWQgdG8gZ2V0IHN5bmNocm9uaXNlZCB0aW1lXG4gICAqIEByZXR1cm5zIHtOdW1iZXJ9IHN5bmNocm9uaXNlZCB0aW1lLCBpbiBzZWNvbmRzLlxuICAgKi9cbiAgZ2V0U3luY1RpbWUobG9jYWxUaW1lID0gdGhpcy5nZXRMb2NhbFRpbWUoKSkge1xuICAgIC8vIGFsd2F5cyBjb252ZXJ0OiBUKHQpID0gVDAgKyBSICogKHQgLSB0MClcbiAgICByZXR1cm4gdGhpcy5zZXJ2ZXJUaW1lUmVmZXJlbmNlXG4gICAgICArIHRoaXMuZnJlcXVlbmN5UmF0aW8gKiAobG9jYWxUaW1lIC0gdGhpcy5jbGllbnRUaW1lUmVmZXJlbmNlKTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBTeW5jQ2xpZW50O1xuIiwiaW1wb3J0IFN5bmNDbGllbnQgZnJvbSAnLi4vLi4vLi4vLi4vZGlzdC9jbGllbnQnO1xuXG5jb25zdCBnZXRUaW1lRnVuY3Rpb24gPSAoKSA9PiB7XG4gIHJldHVybiBwZXJmb3JtYW5jZS5ub3coKSAvIDEwMDA7XG59XG5cbmZ1bmN0aW9uIGluaXQoKSB7XG4gIGNvbnN0IHVybCA9IHdpbmRvdy5sb2NhdGlvbi5vcmlnaW4ucmVwbGFjZSgnaHR0cCcsICd3cycpO1xuXG4gIC8vIGluaXQgc29ja2V0IGNsaWVudFxuICBjb25zdCBzb2NrZXQgPSBuZXcgV2ViU29ja2V0KHVybCk7XG4gIHNvY2tldC5iaW5hcnlUeXBlID0gJ2FycmF5YnVmZmVyJztcbiAgLy8gaW5pdCBzeW5jIGNsaWVudFxuICBjb25zdCBzeW5jQ2xpZW50ID0gbmV3IFN5bmNDbGllbnQoZ2V0VGltZUZ1bmN0aW9uKTtcblxuICBzb2NrZXQuYWRkRXZlbnRMaXN0ZW5lcignb3BlbicsICgpID0+IHtcblxuICAgIGNvbnN0IHNlbmRGdW5jdGlvbiA9IChwaW5nSWQsIGNsaWVudFBpbmdUaW1lKSA9PiB7XG4gICAgICBjb25zdCByZXF1ZXN0ID0gbmV3IEZsb2F0NjRBcnJheSgzKTtcbiAgICAgIHJlcXVlc3RbMF0gPSAwOyAvLyB0aGlzIGlzIGEgcGluZ1xuICAgICAgcmVxdWVzdFsxXSA9IHBpbmdJZDtcbiAgICAgIHJlcXVlc3RbMl0gPSBjbGllbnRQaW5nVGltZTtcblxuICAgICAgY29uc29sZS5sb2coYFtwaW5nXSAtIGlkOiAlcywgcGluZ1RpbWU6ICVzYCwgcmVxdWVzdFsxXSwgcmVxdWVzdFsyXSk7XG5cbiAgICAgIHNvY2tldC5zZW5kKHJlcXVlc3QuYnVmZmVyKTtcbiAgICB9O1xuXG4gICAgY29uc3QgcmVjZWl2ZUZ1bmN0aW9uID0gY2FsbGJhY2sgPT4ge1xuICAgICAgc29ja2V0LmFkZEV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCBlID0+IHtcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBuZXcgRmxvYXQ2NEFycmF5KGUuZGF0YSk7XG5cbiAgICAgICAgaWYgKHJlc3BvbnNlWzBdID09PSAxKSB7IC8vIHRoaXMgaXMgYSBwb25nXG4gICAgICAgICAgY29uc3QgcGluZ0lkID0gcmVzcG9uc2VbMV07XG4gICAgICAgICAgY29uc3QgY2xpZW50UGluZ1RpbWUgPSByZXNwb25zZVsyXTtcbiAgICAgICAgICBjb25zdCBzZXJ2ZXJQaW5nVGltZSA9IHJlc3BvbnNlWzNdO1xuICAgICAgICAgIGNvbnN0IHNlcnZlclBvbmdUaW1lID0gcmVzcG9uc2VbNF07XG5cbiAgICAgICAgICBjb25zb2xlLmxvZyhgW3BvbmddIC0gaWQ6ICVzLCBjbGllbnRQaW5nVGltZTogJXMsIHNlcnZlclBpbmdUaW1lOiAlcywgc2VydmVyUG9uZ1RpbWU6ICVzYCxcbiAgICAgICAgICAgIHBpbmdJZCwgY2xpZW50UGluZ1RpbWUsIHNlcnZlclBpbmdUaW1lLCBzZXJ2ZXJQb25nVGltZSk7XG5cbiAgICAgICAgICBjYWxsYmFjayhwaW5nSWQsIGNsaWVudFBpbmdUaW1lLCBzZXJ2ZXJQaW5nVGltZSwgc2VydmVyUG9uZ1RpbWUpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBjb25zdCAkc3RhdHVzQ29udGFpbmVyID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI3N0YXR1cycpO1xuICAgIGNvbnN0IHN0YXR1c0Z1bmN0aW9uID0gc3RhdHVzID0+IHtcbiAgICAgICRzdGF0dXNDb250YWluZXIuaW5uZXJIVE1MID0gSlNPTi5zdHJpbmdpZnkoc3RhdHVzLCBudWxsLCAyKTtcbiAgICAgIGNvbnNvbGUubG9nKHN0YXR1cylcbiAgICB9O1xuXG4gICAgc3luY0NsaWVudC5zdGFydChzZW5kRnVuY3Rpb24sIHJlY2VpdmVGdW5jdGlvbiwgc3RhdHVzRnVuY3Rpb24pO1xuICB9KTtcblxuICBzb2NrZXQuYWRkRXZlbnRMaXN0ZW5lcignZXJyb3InLCBlcnIgPT4gY29uc29sZS5lcnJvcihlcnIuc3RhY2spKTtcbiAgc29ja2V0LmFkZEV2ZW50TGlzdGVuZXIoJ2Nsb3NlJywgKCkgPT4gY29uc29sZS5sb2coJ3NvY2tldCBjbG9zZWQnKSk7XG59XG5cbndpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdsb2FkJywgaW5pdCk7XG4iLCJtb2R1bGUuZXhwb3J0cyA9IHsgXCJkZWZhdWx0XCI6IHJlcXVpcmUoXCJjb3JlLWpzL2xpYnJhcnkvZm4vanNvbi9zdHJpbmdpZnlcIiksIF9fZXNNb2R1bGU6IHRydWUgfTsiLCJ2YXIgY29yZSA9IHJlcXVpcmUoJy4uLy4uL21vZHVsZXMvX2NvcmUnKTtcbnZhciAkSlNPTiA9IGNvcmUuSlNPTiB8fCAoY29yZS5KU09OID0geyBzdHJpbmdpZnk6IEpTT04uc3RyaW5naWZ5IH0pO1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBzdHJpbmdpZnkoaXQpIHsgLy8gZXNsaW50LWRpc2FibGUtbGluZSBuby11bnVzZWQtdmFyc1xuICByZXR1cm4gJEpTT04uc3RyaW5naWZ5LmFwcGx5KCRKU09OLCBhcmd1bWVudHMpO1xufTtcbiIsInZhciBjb3JlID0gbW9kdWxlLmV4cG9ydHMgPSB7IHZlcnNpb246ICcyLjUuMycgfTtcbmlmICh0eXBlb2YgX19lID09ICdudW1iZXInKSBfX2UgPSBjb3JlOyAvLyBlc2xpbnQtZGlzYWJsZS1saW5lIG5vLXVuZGVmXG4iLCIvLyBzaGltIGZvciB1c2luZyBwcm9jZXNzIGluIGJyb3dzZXJcbnZhciBwcm9jZXNzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcblxuLy8gY2FjaGVkIGZyb20gd2hhdGV2ZXIgZ2xvYmFsIGlzIHByZXNlbnQgc28gdGhhdCB0ZXN0IHJ1bm5lcnMgdGhhdCBzdHViIGl0XG4vLyBkb24ndCBicmVhayB0aGluZ3MuICBCdXQgd2UgbmVlZCB0byB3cmFwIGl0IGluIGEgdHJ5IGNhdGNoIGluIGNhc2UgaXQgaXNcbi8vIHdyYXBwZWQgaW4gc3RyaWN0IG1vZGUgY29kZSB3aGljaCBkb2Vzbid0IGRlZmluZSBhbnkgZ2xvYmFscy4gIEl0J3MgaW5zaWRlIGFcbi8vIGZ1bmN0aW9uIGJlY2F1c2UgdHJ5L2NhdGNoZXMgZGVvcHRpbWl6ZSBpbiBjZXJ0YWluIGVuZ2luZXMuXG5cbnZhciBjYWNoZWRTZXRUaW1lb3V0O1xudmFyIGNhY2hlZENsZWFyVGltZW91dDtcblxuZnVuY3Rpb24gZGVmYXVsdFNldFRpbW91dCgpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3NldFRpbWVvdXQgaGFzIG5vdCBiZWVuIGRlZmluZWQnKTtcbn1cbmZ1bmN0aW9uIGRlZmF1bHRDbGVhclRpbWVvdXQgKCkge1xuICAgIHRocm93IG5ldyBFcnJvcignY2xlYXJUaW1lb3V0IGhhcyBub3QgYmVlbiBkZWZpbmVkJyk7XG59XG4oZnVuY3Rpb24gKCkge1xuICAgIHRyeSB7XG4gICAgICAgIGlmICh0eXBlb2Ygc2V0VGltZW91dCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgY2FjaGVkU2V0VGltZW91dCA9IHNldFRpbWVvdXQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjYWNoZWRTZXRUaW1lb3V0ID0gZGVmYXVsdFNldFRpbW91dDtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY2FjaGVkU2V0VGltZW91dCA9IGRlZmF1bHRTZXRUaW1vdXQ7XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICAgIGlmICh0eXBlb2YgY2xlYXJUaW1lb3V0ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICBjYWNoZWRDbGVhclRpbWVvdXQgPSBjbGVhclRpbWVvdXQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjYWNoZWRDbGVhclRpbWVvdXQgPSBkZWZhdWx0Q2xlYXJUaW1lb3V0O1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjYWNoZWRDbGVhclRpbWVvdXQgPSBkZWZhdWx0Q2xlYXJUaW1lb3V0O1xuICAgIH1cbn0gKCkpXG5mdW5jdGlvbiBydW5UaW1lb3V0KGZ1bikge1xuICAgIGlmIChjYWNoZWRTZXRUaW1lb3V0ID09PSBzZXRUaW1lb3V0KSB7XG4gICAgICAgIC8vbm9ybWFsIGVudmlyb21lbnRzIGluIHNhbmUgc2l0dWF0aW9uc1xuICAgICAgICByZXR1cm4gc2V0VGltZW91dChmdW4sIDApO1xuICAgIH1cbiAgICAvLyBpZiBzZXRUaW1lb3V0IHdhc24ndCBhdmFpbGFibGUgYnV0IHdhcyBsYXR0ZXIgZGVmaW5lZFxuICAgIGlmICgoY2FjaGVkU2V0VGltZW91dCA9PT0gZGVmYXVsdFNldFRpbW91dCB8fCAhY2FjaGVkU2V0VGltZW91dCkgJiYgc2V0VGltZW91dCkge1xuICAgICAgICBjYWNoZWRTZXRUaW1lb3V0ID0gc2V0VGltZW91dDtcbiAgICAgICAgcmV0dXJuIHNldFRpbWVvdXQoZnVuLCAwKTtcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgICAgLy8gd2hlbiB3aGVuIHNvbWVib2R5IGhhcyBzY3Jld2VkIHdpdGggc2V0VGltZW91dCBidXQgbm8gSS5FLiBtYWRkbmVzc1xuICAgICAgICByZXR1cm4gY2FjaGVkU2V0VGltZW91dChmdW4sIDApO1xuICAgIH0gY2F0Y2goZSl7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBXaGVuIHdlIGFyZSBpbiBJLkUuIGJ1dCB0aGUgc2NyaXB0IGhhcyBiZWVuIGV2YWxlZCBzbyBJLkUuIGRvZXNuJ3QgdHJ1c3QgdGhlIGdsb2JhbCBvYmplY3Qgd2hlbiBjYWxsZWQgbm9ybWFsbHlcbiAgICAgICAgICAgIHJldHVybiBjYWNoZWRTZXRUaW1lb3V0LmNhbGwobnVsbCwgZnVuLCAwKTtcbiAgICAgICAgfSBjYXRjaChlKXtcbiAgICAgICAgICAgIC8vIHNhbWUgYXMgYWJvdmUgYnV0IHdoZW4gaXQncyBhIHZlcnNpb24gb2YgSS5FLiB0aGF0IG11c3QgaGF2ZSB0aGUgZ2xvYmFsIG9iamVjdCBmb3IgJ3RoaXMnLCBob3BmdWxseSBvdXIgY29udGV4dCBjb3JyZWN0IG90aGVyd2lzZSBpdCB3aWxsIHRocm93IGEgZ2xvYmFsIGVycm9yXG4gICAgICAgICAgICByZXR1cm4gY2FjaGVkU2V0VGltZW91dC5jYWxsKHRoaXMsIGZ1biwgMCk7XG4gICAgICAgIH1cbiAgICB9XG5cblxufVxuZnVuY3Rpb24gcnVuQ2xlYXJUaW1lb3V0KG1hcmtlcikge1xuICAgIGlmIChjYWNoZWRDbGVhclRpbWVvdXQgPT09IGNsZWFyVGltZW91dCkge1xuICAgICAgICAvL25vcm1hbCBlbnZpcm9tZW50cyBpbiBzYW5lIHNpdHVhdGlvbnNcbiAgICAgICAgcmV0dXJuIGNsZWFyVGltZW91dChtYXJrZXIpO1xuICAgIH1cbiAgICAvLyBpZiBjbGVhclRpbWVvdXQgd2Fzbid0IGF2YWlsYWJsZSBidXQgd2FzIGxhdHRlciBkZWZpbmVkXG4gICAgaWYgKChjYWNoZWRDbGVhclRpbWVvdXQgPT09IGRlZmF1bHRDbGVhclRpbWVvdXQgfHwgIWNhY2hlZENsZWFyVGltZW91dCkgJiYgY2xlYXJUaW1lb3V0KSB7XG4gICAgICAgIGNhY2hlZENsZWFyVGltZW91dCA9IGNsZWFyVGltZW91dDtcbiAgICAgICAgcmV0dXJuIGNsZWFyVGltZW91dChtYXJrZXIpO1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgICAvLyB3aGVuIHdoZW4gc29tZWJvZHkgaGFzIHNjcmV3ZWQgd2l0aCBzZXRUaW1lb3V0IGJ1dCBubyBJLkUuIG1hZGRuZXNzXG4gICAgICAgIHJldHVybiBjYWNoZWRDbGVhclRpbWVvdXQobWFya2VyKTtcbiAgICB9IGNhdGNoIChlKXtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIFdoZW4gd2UgYXJlIGluIEkuRS4gYnV0IHRoZSBzY3JpcHQgaGFzIGJlZW4gZXZhbGVkIHNvIEkuRS4gZG9lc24ndCAgdHJ1c3QgdGhlIGdsb2JhbCBvYmplY3Qgd2hlbiBjYWxsZWQgbm9ybWFsbHlcbiAgICAgICAgICAgIHJldHVybiBjYWNoZWRDbGVhclRpbWVvdXQuY2FsbChudWxsLCBtYXJrZXIpO1xuICAgICAgICB9IGNhdGNoIChlKXtcbiAgICAgICAgICAgIC8vIHNhbWUgYXMgYWJvdmUgYnV0IHdoZW4gaXQncyBhIHZlcnNpb24gb2YgSS5FLiB0aGF0IG11c3QgaGF2ZSB0aGUgZ2xvYmFsIG9iamVjdCBmb3IgJ3RoaXMnLCBob3BmdWxseSBvdXIgY29udGV4dCBjb3JyZWN0IG90aGVyd2lzZSBpdCB3aWxsIHRocm93IGEgZ2xvYmFsIGVycm9yLlxuICAgICAgICAgICAgLy8gU29tZSB2ZXJzaW9ucyBvZiBJLkUuIGhhdmUgZGlmZmVyZW50IHJ1bGVzIGZvciBjbGVhclRpbWVvdXQgdnMgc2V0VGltZW91dFxuICAgICAgICAgICAgcmV0dXJuIGNhY2hlZENsZWFyVGltZW91dC5jYWxsKHRoaXMsIG1hcmtlcik7XG4gICAgICAgIH1cbiAgICB9XG5cblxuXG59XG52YXIgcXVldWUgPSBbXTtcbnZhciBkcmFpbmluZyA9IGZhbHNlO1xudmFyIGN1cnJlbnRRdWV1ZTtcbnZhciBxdWV1ZUluZGV4ID0gLTE7XG5cbmZ1bmN0aW9uIGNsZWFuVXBOZXh0VGljaygpIHtcbiAgICBpZiAoIWRyYWluaW5nIHx8ICFjdXJyZW50UXVldWUpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBkcmFpbmluZyA9IGZhbHNlO1xuICAgIGlmIChjdXJyZW50UXVldWUubGVuZ3RoKSB7XG4gICAgICAgIHF1ZXVlID0gY3VycmVudFF1ZXVlLmNvbmNhdChxdWV1ZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcXVldWVJbmRleCA9IC0xO1xuICAgIH1cbiAgICBpZiAocXVldWUubGVuZ3RoKSB7XG4gICAgICAgIGRyYWluUXVldWUoKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGRyYWluUXVldWUoKSB7XG4gICAgaWYgKGRyYWluaW5nKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdmFyIHRpbWVvdXQgPSBydW5UaW1lb3V0KGNsZWFuVXBOZXh0VGljayk7XG4gICAgZHJhaW5pbmcgPSB0cnVlO1xuXG4gICAgdmFyIGxlbiA9IHF1ZXVlLmxlbmd0aDtcbiAgICB3aGlsZShsZW4pIHtcbiAgICAgICAgY3VycmVudFF1ZXVlID0gcXVldWU7XG4gICAgICAgIHF1ZXVlID0gW107XG4gICAgICAgIHdoaWxlICgrK3F1ZXVlSW5kZXggPCBsZW4pIHtcbiAgICAgICAgICAgIGlmIChjdXJyZW50UXVldWUpIHtcbiAgICAgICAgICAgICAgICBjdXJyZW50UXVldWVbcXVldWVJbmRleF0ucnVuKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcXVldWVJbmRleCA9IC0xO1xuICAgICAgICBsZW4gPSBxdWV1ZS5sZW5ndGg7XG4gICAgfVxuICAgIGN1cnJlbnRRdWV1ZSA9IG51bGw7XG4gICAgZHJhaW5pbmcgPSBmYWxzZTtcbiAgICBydW5DbGVhclRpbWVvdXQodGltZW91dCk7XG59XG5cbnByb2Nlc3MubmV4dFRpY2sgPSBmdW5jdGlvbiAoZnVuKSB7XG4gICAgdmFyIGFyZ3MgPSBuZXcgQXJyYXkoYXJndW1lbnRzLmxlbmd0aCAtIDEpO1xuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMSkge1xuICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgYXJnc1tpIC0gMV0gPSBhcmd1bWVudHNbaV07XG4gICAgICAgIH1cbiAgICB9XG4gICAgcXVldWUucHVzaChuZXcgSXRlbShmdW4sIGFyZ3MpKTtcbiAgICBpZiAocXVldWUubGVuZ3RoID09PSAxICYmICFkcmFpbmluZykge1xuICAgICAgICBydW5UaW1lb3V0KGRyYWluUXVldWUpO1xuICAgIH1cbn07XG5cbi8vIHY4IGxpa2VzIHByZWRpY3RpYmxlIG9iamVjdHNcbmZ1bmN0aW9uIEl0ZW0oZnVuLCBhcnJheSkge1xuICAgIHRoaXMuZnVuID0gZnVuO1xuICAgIHRoaXMuYXJyYXkgPSBhcnJheTtcbn1cbkl0ZW0ucHJvdG90eXBlLnJ1biA9IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLmZ1bi5hcHBseShudWxsLCB0aGlzLmFycmF5KTtcbn07XG5wcm9jZXNzLnRpdGxlID0gJ2Jyb3dzZXInO1xucHJvY2Vzcy5icm93c2VyID0gdHJ1ZTtcbnByb2Nlc3MuZW52ID0ge307XG5wcm9jZXNzLmFyZ3YgPSBbXTtcbnByb2Nlc3MudmVyc2lvbiA9ICcnOyAvLyBlbXB0eSBzdHJpbmcgdG8gYXZvaWQgcmVnZXhwIGlzc3Vlc1xucHJvY2Vzcy52ZXJzaW9ucyA9IHt9O1xuXG5mdW5jdGlvbiBub29wKCkge31cblxucHJvY2Vzcy5vbiA9IG5vb3A7XG5wcm9jZXNzLmFkZExpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3Mub25jZSA9IG5vb3A7XG5wcm9jZXNzLm9mZiA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUxpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlQWxsTGlzdGVuZXJzID0gbm9vcDtcbnByb2Nlc3MuZW1pdCA9IG5vb3A7XG5wcm9jZXNzLnByZXBlbmRMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLnByZXBlbmRPbmNlTGlzdGVuZXIgPSBub29wO1xuXG5wcm9jZXNzLmxpc3RlbmVycyA9IGZ1bmN0aW9uIChuYW1lKSB7IHJldHVybiBbXSB9XG5cbnByb2Nlc3MuYmluZGluZyA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmJpbmRpbmcgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcblxucHJvY2Vzcy5jd2QgPSBmdW5jdGlvbiAoKSB7IHJldHVybiAnLycgfTtcbnByb2Nlc3MuY2hkaXIgPSBmdW5jdGlvbiAoZGlyKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmNoZGlyIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG5wcm9jZXNzLnVtYXNrID0gZnVuY3Rpb24oKSB7IHJldHVybiAwOyB9O1xuIiwibW9kdWxlLmV4cG9ydHMgPSB7IFwiZGVmYXVsdFwiOiByZXF1aXJlKFwiY29yZS1qcy9saWJyYXJ5L2ZuL29iamVjdC9kZWZpbmUtcHJvcGVydHlcIiksIF9fZXNNb2R1bGU6IHRydWUgfTsiLCJcInVzZSBzdHJpY3RcIjtcblxuZXhwb3J0cy5fX2VzTW9kdWxlID0gdHJ1ZTtcblxuZXhwb3J0cy5kZWZhdWx0ID0gZnVuY3Rpb24gKGluc3RhbmNlLCBDb25zdHJ1Y3Rvcikge1xuICBpZiAoIShpbnN0YW5jZSBpbnN0YW5jZW9mIENvbnN0cnVjdG9yKSkge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJDYW5ub3QgY2FsbCBhIGNsYXNzIGFzIGEgZnVuY3Rpb25cIik7XG4gIH1cbn07IiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbmV4cG9ydHMuX19lc01vZHVsZSA9IHRydWU7XG5cbnZhciBfZGVmaW5lUHJvcGVydHkgPSByZXF1aXJlKFwiLi4vY29yZS1qcy9vYmplY3QvZGVmaW5lLXByb3BlcnR5XCIpO1xuXG52YXIgX2RlZmluZVByb3BlcnR5MiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX2RlZmluZVByb3BlcnR5KTtcblxuZnVuY3Rpb24gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChvYmopIHsgcmV0dXJuIG9iaiAmJiBvYmouX19lc01vZHVsZSA/IG9iaiA6IHsgZGVmYXVsdDogb2JqIH07IH1cblxuZXhwb3J0cy5kZWZhdWx0ID0gZnVuY3Rpb24gKCkge1xuICBmdW5jdGlvbiBkZWZpbmVQcm9wZXJ0aWVzKHRhcmdldCwgcHJvcHMpIHtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHByb3BzLmxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIgZGVzY3JpcHRvciA9IHByb3BzW2ldO1xuICAgICAgZGVzY3JpcHRvci5lbnVtZXJhYmxlID0gZGVzY3JpcHRvci5lbnVtZXJhYmxlIHx8IGZhbHNlO1xuICAgICAgZGVzY3JpcHRvci5jb25maWd1cmFibGUgPSB0cnVlO1xuICAgICAgaWYgKFwidmFsdWVcIiBpbiBkZXNjcmlwdG9yKSBkZXNjcmlwdG9yLndyaXRhYmxlID0gdHJ1ZTtcbiAgICAgICgwLCBfZGVmaW5lUHJvcGVydHkyLmRlZmF1bHQpKHRhcmdldCwgZGVzY3JpcHRvci5rZXksIGRlc2NyaXB0b3IpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBmdW5jdGlvbiAoQ29uc3RydWN0b3IsIHByb3RvUHJvcHMsIHN0YXRpY1Byb3BzKSB7XG4gICAgaWYgKHByb3RvUHJvcHMpIGRlZmluZVByb3BlcnRpZXMoQ29uc3RydWN0b3IucHJvdG90eXBlLCBwcm90b1Byb3BzKTtcbiAgICBpZiAoc3RhdGljUHJvcHMpIGRlZmluZVByb3BlcnRpZXMoQ29uc3RydWN0b3IsIHN0YXRpY1Byb3BzKTtcbiAgICByZXR1cm4gQ29uc3RydWN0b3I7XG4gIH07XG59KCk7IiwicmVxdWlyZSgnLi4vLi4vbW9kdWxlcy9lczYub2JqZWN0LmRlZmluZS1wcm9wZXJ0eScpO1xudmFyICRPYmplY3QgPSByZXF1aXJlKCcuLi8uLi9tb2R1bGVzL19jb3JlJykuT2JqZWN0O1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBkZWZpbmVQcm9wZXJ0eShpdCwga2V5LCBkZXNjKSB7XG4gIHJldHVybiAkT2JqZWN0LmRlZmluZVByb3BlcnR5KGl0LCBrZXksIGRlc2MpO1xufTtcbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGl0KSB7XG4gIGlmICh0eXBlb2YgaXQgIT0gJ2Z1bmN0aW9uJykgdGhyb3cgVHlwZUVycm9yKGl0ICsgJyBpcyBub3QgYSBmdW5jdGlvbiEnKTtcbiAgcmV0dXJuIGl0O1xufTtcbiIsInZhciBpc09iamVjdCA9IHJlcXVpcmUoJy4vX2lzLW9iamVjdCcpO1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoaXQpIHtcbiAgaWYgKCFpc09iamVjdChpdCkpIHRocm93IFR5cGVFcnJvcihpdCArICcgaXMgbm90IGFuIG9iamVjdCEnKTtcbiAgcmV0dXJuIGl0O1xufTtcbiIsIi8vIG9wdGlvbmFsIC8gc2ltcGxlIGNvbnRleHQgYmluZGluZ1xudmFyIGFGdW5jdGlvbiA9IHJlcXVpcmUoJy4vX2EtZnVuY3Rpb24nKTtcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGZuLCB0aGF0LCBsZW5ndGgpIHtcbiAgYUZ1bmN0aW9uKGZuKTtcbiAgaWYgKHRoYXQgPT09IHVuZGVmaW5lZCkgcmV0dXJuIGZuO1xuICBzd2l0Y2ggKGxlbmd0aCkge1xuICAgIGNhc2UgMTogcmV0dXJuIGZ1bmN0aW9uIChhKSB7XG4gICAgICByZXR1cm4gZm4uY2FsbCh0aGF0LCBhKTtcbiAgICB9O1xuICAgIGNhc2UgMjogcmV0dXJuIGZ1bmN0aW9uIChhLCBiKSB7XG4gICAgICByZXR1cm4gZm4uY2FsbCh0aGF0LCBhLCBiKTtcbiAgICB9O1xuICAgIGNhc2UgMzogcmV0dXJuIGZ1bmN0aW9uIChhLCBiLCBjKSB7XG4gICAgICByZXR1cm4gZm4uY2FsbCh0aGF0LCBhLCBiLCBjKTtcbiAgICB9O1xuICB9XG4gIHJldHVybiBmdW5jdGlvbiAoLyogLi4uYXJncyAqLykge1xuICAgIHJldHVybiBmbi5hcHBseSh0aGF0LCBhcmd1bWVudHMpO1xuICB9O1xufTtcbiIsIi8vIFRoYW5rJ3MgSUU4IGZvciBoaXMgZnVubnkgZGVmaW5lUHJvcGVydHlcbm1vZHVsZS5leHBvcnRzID0gIXJlcXVpcmUoJy4vX2ZhaWxzJykoZnVuY3Rpb24gKCkge1xuICByZXR1cm4gT2JqZWN0LmRlZmluZVByb3BlcnR5KHt9LCAnYScsIHsgZ2V0OiBmdW5jdGlvbiAoKSB7IHJldHVybiA3OyB9IH0pLmEgIT0gNztcbn0pO1xuIiwidmFyIGlzT2JqZWN0ID0gcmVxdWlyZSgnLi9faXMtb2JqZWN0Jyk7XG52YXIgZG9jdW1lbnQgPSByZXF1aXJlKCcuL19nbG9iYWwnKS5kb2N1bWVudDtcbi8vIHR5cGVvZiBkb2N1bWVudC5jcmVhdGVFbGVtZW50IGlzICdvYmplY3QnIGluIG9sZCBJRVxudmFyIGlzID0gaXNPYmplY3QoZG9jdW1lbnQpICYmIGlzT2JqZWN0KGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQpO1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoaXQpIHtcbiAgcmV0dXJuIGlzID8gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChpdCkgOiB7fTtcbn07XG4iLCJ2YXIgZ2xvYmFsID0gcmVxdWlyZSgnLi9fZ2xvYmFsJyk7XG52YXIgY29yZSA9IHJlcXVpcmUoJy4vX2NvcmUnKTtcbnZhciBjdHggPSByZXF1aXJlKCcuL19jdHgnKTtcbnZhciBoaWRlID0gcmVxdWlyZSgnLi9faGlkZScpO1xudmFyIFBST1RPVFlQRSA9ICdwcm90b3R5cGUnO1xuXG52YXIgJGV4cG9ydCA9IGZ1bmN0aW9uICh0eXBlLCBuYW1lLCBzb3VyY2UpIHtcbiAgdmFyIElTX0ZPUkNFRCA9IHR5cGUgJiAkZXhwb3J0LkY7XG4gIHZhciBJU19HTE9CQUwgPSB0eXBlICYgJGV4cG9ydC5HO1xuICB2YXIgSVNfU1RBVElDID0gdHlwZSAmICRleHBvcnQuUztcbiAgdmFyIElTX1BST1RPID0gdHlwZSAmICRleHBvcnQuUDtcbiAgdmFyIElTX0JJTkQgPSB0eXBlICYgJGV4cG9ydC5CO1xuICB2YXIgSVNfV1JBUCA9IHR5cGUgJiAkZXhwb3J0Llc7XG4gIHZhciBleHBvcnRzID0gSVNfR0xPQkFMID8gY29yZSA6IGNvcmVbbmFtZV0gfHwgKGNvcmVbbmFtZV0gPSB7fSk7XG4gIHZhciBleHBQcm90byA9IGV4cG9ydHNbUFJPVE9UWVBFXTtcbiAgdmFyIHRhcmdldCA9IElTX0dMT0JBTCA/IGdsb2JhbCA6IElTX1NUQVRJQyA/IGdsb2JhbFtuYW1lXSA6IChnbG9iYWxbbmFtZV0gfHwge30pW1BST1RPVFlQRV07XG4gIHZhciBrZXksIG93biwgb3V0O1xuICBpZiAoSVNfR0xPQkFMKSBzb3VyY2UgPSBuYW1lO1xuICBmb3IgKGtleSBpbiBzb3VyY2UpIHtcbiAgICAvLyBjb250YWlucyBpbiBuYXRpdmVcbiAgICBvd24gPSAhSVNfRk9SQ0VEICYmIHRhcmdldCAmJiB0YXJnZXRba2V5XSAhPT0gdW5kZWZpbmVkO1xuICAgIGlmIChvd24gJiYga2V5IGluIGV4cG9ydHMpIGNvbnRpbnVlO1xuICAgIC8vIGV4cG9ydCBuYXRpdmUgb3IgcGFzc2VkXG4gICAgb3V0ID0gb3duID8gdGFyZ2V0W2tleV0gOiBzb3VyY2Vba2V5XTtcbiAgICAvLyBwcmV2ZW50IGdsb2JhbCBwb2xsdXRpb24gZm9yIG5hbWVzcGFjZXNcbiAgICBleHBvcnRzW2tleV0gPSBJU19HTE9CQUwgJiYgdHlwZW9mIHRhcmdldFtrZXldICE9ICdmdW5jdGlvbicgPyBzb3VyY2Vba2V5XVxuICAgIC8vIGJpbmQgdGltZXJzIHRvIGdsb2JhbCBmb3IgY2FsbCBmcm9tIGV4cG9ydCBjb250ZXh0XG4gICAgOiBJU19CSU5EICYmIG93biA/IGN0eChvdXQsIGdsb2JhbClcbiAgICAvLyB3cmFwIGdsb2JhbCBjb25zdHJ1Y3RvcnMgZm9yIHByZXZlbnQgY2hhbmdlIHRoZW0gaW4gbGlicmFyeVxuICAgIDogSVNfV1JBUCAmJiB0YXJnZXRba2V5XSA9PSBvdXQgPyAoZnVuY3Rpb24gKEMpIHtcbiAgICAgIHZhciBGID0gZnVuY3Rpb24gKGEsIGIsIGMpIHtcbiAgICAgICAgaWYgKHRoaXMgaW5zdGFuY2VvZiBDKSB7XG4gICAgICAgICAgc3dpdGNoIChhcmd1bWVudHMubGVuZ3RoKSB7XG4gICAgICAgICAgICBjYXNlIDA6IHJldHVybiBuZXcgQygpO1xuICAgICAgICAgICAgY2FzZSAxOiByZXR1cm4gbmV3IEMoYSk7XG4gICAgICAgICAgICBjYXNlIDI6IHJldHVybiBuZXcgQyhhLCBiKTtcbiAgICAgICAgICB9IHJldHVybiBuZXcgQyhhLCBiLCBjKTtcbiAgICAgICAgfSByZXR1cm4gQy5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgfTtcbiAgICAgIEZbUFJPVE9UWVBFXSA9IENbUFJPVE9UWVBFXTtcbiAgICAgIHJldHVybiBGO1xuICAgIC8vIG1ha2Ugc3RhdGljIHZlcnNpb25zIGZvciBwcm90b3R5cGUgbWV0aG9kc1xuICAgIH0pKG91dCkgOiBJU19QUk9UTyAmJiB0eXBlb2Ygb3V0ID09ICdmdW5jdGlvbicgPyBjdHgoRnVuY3Rpb24uY2FsbCwgb3V0KSA6IG91dDtcbiAgICAvLyBleHBvcnQgcHJvdG8gbWV0aG9kcyB0byBjb3JlLiVDT05TVFJVQ1RPUiUubWV0aG9kcy4lTkFNRSVcbiAgICBpZiAoSVNfUFJPVE8pIHtcbiAgICAgIChleHBvcnRzLnZpcnR1YWwgfHwgKGV4cG9ydHMudmlydHVhbCA9IHt9KSlba2V5XSA9IG91dDtcbiAgICAgIC8vIGV4cG9ydCBwcm90byBtZXRob2RzIHRvIGNvcmUuJUNPTlNUUlVDVE9SJS5wcm90b3R5cGUuJU5BTUUlXG4gICAgICBpZiAodHlwZSAmICRleHBvcnQuUiAmJiBleHBQcm90byAmJiAhZXhwUHJvdG9ba2V5XSkgaGlkZShleHBQcm90bywga2V5LCBvdXQpO1xuICAgIH1cbiAgfVxufTtcbi8vIHR5cGUgYml0bWFwXG4kZXhwb3J0LkYgPSAxOyAgIC8vIGZvcmNlZFxuJGV4cG9ydC5HID0gMjsgICAvLyBnbG9iYWxcbiRleHBvcnQuUyA9IDQ7ICAgLy8gc3RhdGljXG4kZXhwb3J0LlAgPSA4OyAgIC8vIHByb3RvXG4kZXhwb3J0LkIgPSAxNjsgIC8vIGJpbmRcbiRleHBvcnQuVyA9IDMyOyAgLy8gd3JhcFxuJGV4cG9ydC5VID0gNjQ7ICAvLyBzYWZlXG4kZXhwb3J0LlIgPSAxMjg7IC8vIHJlYWwgcHJvdG8gbWV0aG9kIGZvciBgbGlicmFyeWBcbm1vZHVsZS5leHBvcnRzID0gJGV4cG9ydDtcbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGV4ZWMpIHtcbiAgdHJ5IHtcbiAgICByZXR1cm4gISFleGVjKCk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxufTtcbiIsIi8vIGh0dHBzOi8vZ2l0aHViLmNvbS96bG9pcm9jay9jb3JlLWpzL2lzc3Vlcy84NiNpc3N1ZWNvbW1lbnQtMTE1NzU5MDI4XG52YXIgZ2xvYmFsID0gbW9kdWxlLmV4cG9ydHMgPSB0eXBlb2Ygd2luZG93ICE9ICd1bmRlZmluZWQnICYmIHdpbmRvdy5NYXRoID09IE1hdGhcbiAgPyB3aW5kb3cgOiB0eXBlb2Ygc2VsZiAhPSAndW5kZWZpbmVkJyAmJiBzZWxmLk1hdGggPT0gTWF0aCA/IHNlbGZcbiAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLW5ldy1mdW5jXG4gIDogRnVuY3Rpb24oJ3JldHVybiB0aGlzJykoKTtcbmlmICh0eXBlb2YgX19nID09ICdudW1iZXInKSBfX2cgPSBnbG9iYWw7IC8vIGVzbGludC1kaXNhYmxlLWxpbmUgbm8tdW5kZWZcbiIsInZhciBkUCA9IHJlcXVpcmUoJy4vX29iamVjdC1kcCcpO1xudmFyIGNyZWF0ZURlc2MgPSByZXF1aXJlKCcuL19wcm9wZXJ0eS1kZXNjJyk7XG5tb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoJy4vX2Rlc2NyaXB0b3JzJykgPyBmdW5jdGlvbiAob2JqZWN0LCBrZXksIHZhbHVlKSB7XG4gIHJldHVybiBkUC5mKG9iamVjdCwga2V5LCBjcmVhdGVEZXNjKDEsIHZhbHVlKSk7XG59IDogZnVuY3Rpb24gKG9iamVjdCwga2V5LCB2YWx1ZSkge1xuICBvYmplY3Rba2V5XSA9IHZhbHVlO1xuICByZXR1cm4gb2JqZWN0O1xufTtcbiIsIm1vZHVsZS5leHBvcnRzID0gIXJlcXVpcmUoJy4vX2Rlc2NyaXB0b3JzJykgJiYgIXJlcXVpcmUoJy4vX2ZhaWxzJykoZnVuY3Rpb24gKCkge1xuICByZXR1cm4gT2JqZWN0LmRlZmluZVByb3BlcnR5KHJlcXVpcmUoJy4vX2RvbS1jcmVhdGUnKSgnZGl2JyksICdhJywgeyBnZXQ6IGZ1bmN0aW9uICgpIHsgcmV0dXJuIDc7IH0gfSkuYSAhPSA3O1xufSk7XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChpdCkge1xuICByZXR1cm4gdHlwZW9mIGl0ID09PSAnb2JqZWN0JyA/IGl0ICE9PSBudWxsIDogdHlwZW9mIGl0ID09PSAnZnVuY3Rpb24nO1xufTtcbiIsInZhciBhbk9iamVjdCA9IHJlcXVpcmUoJy4vX2FuLW9iamVjdCcpO1xudmFyIElFOF9ET01fREVGSU5FID0gcmVxdWlyZSgnLi9faWU4LWRvbS1kZWZpbmUnKTtcbnZhciB0b1ByaW1pdGl2ZSA9IHJlcXVpcmUoJy4vX3RvLXByaW1pdGl2ZScpO1xudmFyIGRQID0gT2JqZWN0LmRlZmluZVByb3BlcnR5O1xuXG5leHBvcnRzLmYgPSByZXF1aXJlKCcuL19kZXNjcmlwdG9ycycpID8gT2JqZWN0LmRlZmluZVByb3BlcnR5IDogZnVuY3Rpb24gZGVmaW5lUHJvcGVydHkoTywgUCwgQXR0cmlidXRlcykge1xuICBhbk9iamVjdChPKTtcbiAgUCA9IHRvUHJpbWl0aXZlKFAsIHRydWUpO1xuICBhbk9iamVjdChBdHRyaWJ1dGVzKTtcbiAgaWYgKElFOF9ET01fREVGSU5FKSB0cnkge1xuICAgIHJldHVybiBkUChPLCBQLCBBdHRyaWJ1dGVzKTtcbiAgfSBjYXRjaCAoZSkgeyAvKiBlbXB0eSAqLyB9XG4gIGlmICgnZ2V0JyBpbiBBdHRyaWJ1dGVzIHx8ICdzZXQnIGluIEF0dHJpYnV0ZXMpIHRocm93IFR5cGVFcnJvcignQWNjZXNzb3JzIG5vdCBzdXBwb3J0ZWQhJyk7XG4gIGlmICgndmFsdWUnIGluIEF0dHJpYnV0ZXMpIE9bUF0gPSBBdHRyaWJ1dGVzLnZhbHVlO1xuICByZXR1cm4gTztcbn07XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChiaXRtYXAsIHZhbHVlKSB7XG4gIHJldHVybiB7XG4gICAgZW51bWVyYWJsZTogIShiaXRtYXAgJiAxKSxcbiAgICBjb25maWd1cmFibGU6ICEoYml0bWFwICYgMiksXG4gICAgd3JpdGFibGU6ICEoYml0bWFwICYgNCksXG4gICAgdmFsdWU6IHZhbHVlXG4gIH07XG59O1xuIiwiLy8gNy4xLjEgVG9QcmltaXRpdmUoaW5wdXQgWywgUHJlZmVycmVkVHlwZV0pXG52YXIgaXNPYmplY3QgPSByZXF1aXJlKCcuL19pcy1vYmplY3QnKTtcbi8vIGluc3RlYWQgb2YgdGhlIEVTNiBzcGVjIHZlcnNpb24sIHdlIGRpZG4ndCBpbXBsZW1lbnQgQEB0b1ByaW1pdGl2ZSBjYXNlXG4vLyBhbmQgdGhlIHNlY29uZCBhcmd1bWVudCAtIGZsYWcgLSBwcmVmZXJyZWQgdHlwZSBpcyBhIHN0cmluZ1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoaXQsIFMpIHtcbiAgaWYgKCFpc09iamVjdChpdCkpIHJldHVybiBpdDtcbiAgdmFyIGZuLCB2YWw7XG4gIGlmIChTICYmIHR5cGVvZiAoZm4gPSBpdC50b1N0cmluZykgPT0gJ2Z1bmN0aW9uJyAmJiAhaXNPYmplY3QodmFsID0gZm4uY2FsbChpdCkpKSByZXR1cm4gdmFsO1xuICBpZiAodHlwZW9mIChmbiA9IGl0LnZhbHVlT2YpID09ICdmdW5jdGlvbicgJiYgIWlzT2JqZWN0KHZhbCA9IGZuLmNhbGwoaXQpKSkgcmV0dXJuIHZhbDtcbiAgaWYgKCFTICYmIHR5cGVvZiAoZm4gPSBpdC50b1N0cmluZykgPT0gJ2Z1bmN0aW9uJyAmJiAhaXNPYmplY3QodmFsID0gZm4uY2FsbChpdCkpKSByZXR1cm4gdmFsO1xuICB0aHJvdyBUeXBlRXJyb3IoXCJDYW4ndCBjb252ZXJ0IG9iamVjdCB0byBwcmltaXRpdmUgdmFsdWVcIik7XG59O1xuIiwidmFyICRleHBvcnQgPSByZXF1aXJlKCcuL19leHBvcnQnKTtcbi8vIDE5LjEuMi40IC8gMTUuMi4zLjYgT2JqZWN0LmRlZmluZVByb3BlcnR5KE8sIFAsIEF0dHJpYnV0ZXMpXG4kZXhwb3J0KCRleHBvcnQuUyArICRleHBvcnQuRiAqICFyZXF1aXJlKCcuL19kZXNjcmlwdG9ycycpLCAnT2JqZWN0JywgeyBkZWZpbmVQcm9wZXJ0eTogcmVxdWlyZSgnLi9fb2JqZWN0LWRwJykuZiB9KTtcbiIsIi8qKlxuICogVGhpcyBpcyB0aGUgd2ViIGJyb3dzZXIgaW1wbGVtZW50YXRpb24gb2YgYGRlYnVnKClgLlxuICpcbiAqIEV4cG9zZSBgZGVidWcoKWAgYXMgdGhlIG1vZHVsZS5cbiAqL1xuXG5leHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKCcuL2RlYnVnJyk7XG5leHBvcnRzLmxvZyA9IGxvZztcbmV4cG9ydHMuZm9ybWF0QXJncyA9IGZvcm1hdEFyZ3M7XG5leHBvcnRzLnNhdmUgPSBzYXZlO1xuZXhwb3J0cy5sb2FkID0gbG9hZDtcbmV4cG9ydHMudXNlQ29sb3JzID0gdXNlQ29sb3JzO1xuZXhwb3J0cy5zdG9yYWdlID0gJ3VuZGVmaW5lZCcgIT0gdHlwZW9mIGNocm9tZVxuICAgICAgICAgICAgICAgJiYgJ3VuZGVmaW5lZCcgIT0gdHlwZW9mIGNocm9tZS5zdG9yYWdlXG4gICAgICAgICAgICAgICAgICA/IGNocm9tZS5zdG9yYWdlLmxvY2FsXG4gICAgICAgICAgICAgICAgICA6IGxvY2Fsc3RvcmFnZSgpO1xuXG4vKipcbiAqIENvbG9ycy5cbiAqL1xuXG5leHBvcnRzLmNvbG9ycyA9IFtcbiAgJ2xpZ2h0c2VhZ3JlZW4nLFxuICAnZm9yZXN0Z3JlZW4nLFxuICAnZ29sZGVucm9kJyxcbiAgJ2RvZGdlcmJsdWUnLFxuICAnZGFya29yY2hpZCcsXG4gICdjcmltc29uJ1xuXTtcblxuLyoqXG4gKiBDdXJyZW50bHkgb25seSBXZWJLaXQtYmFzZWQgV2ViIEluc3BlY3RvcnMsIEZpcmVmb3ggPj0gdjMxLFxuICogYW5kIHRoZSBGaXJlYnVnIGV4dGVuc2lvbiAoYW55IEZpcmVmb3ggdmVyc2lvbikgYXJlIGtub3duXG4gKiB0byBzdXBwb3J0IFwiJWNcIiBDU1MgY3VzdG9taXphdGlvbnMuXG4gKlxuICogVE9ETzogYWRkIGEgYGxvY2FsU3RvcmFnZWAgdmFyaWFibGUgdG8gZXhwbGljaXRseSBlbmFibGUvZGlzYWJsZSBjb2xvcnNcbiAqL1xuXG5mdW5jdGlvbiB1c2VDb2xvcnMoKSB7XG4gIC8vIE5COiBJbiBhbiBFbGVjdHJvbiBwcmVsb2FkIHNjcmlwdCwgZG9jdW1lbnQgd2lsbCBiZSBkZWZpbmVkIGJ1dCBub3QgZnVsbHlcbiAgLy8gaW5pdGlhbGl6ZWQuIFNpbmNlIHdlIGtub3cgd2UncmUgaW4gQ2hyb21lLCB3ZSdsbCBqdXN0IGRldGVjdCB0aGlzIGNhc2VcbiAgLy8gZXhwbGljaXRseVxuICBpZiAodHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgJiYgd2luZG93LnByb2Nlc3MgJiYgd2luZG93LnByb2Nlc3MudHlwZSA9PT0gJ3JlbmRlcmVyJykge1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgLy8gaXMgd2Via2l0PyBodHRwOi8vc3RhY2tvdmVyZmxvdy5jb20vYS8xNjQ1OTYwNi8zNzY3NzNcbiAgLy8gZG9jdW1lbnQgaXMgdW5kZWZpbmVkIGluIHJlYWN0LW5hdGl2ZTogaHR0cHM6Ly9naXRodWIuY29tL2ZhY2Vib29rL3JlYWN0LW5hdGl2ZS9wdWxsLzE2MzJcbiAgcmV0dXJuICh0eXBlb2YgZG9jdW1lbnQgIT09ICd1bmRlZmluZWQnICYmIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudCAmJiBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuc3R5bGUgJiYgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LnN0eWxlLldlYmtpdEFwcGVhcmFuY2UpIHx8XG4gICAgLy8gaXMgZmlyZWJ1Zz8gaHR0cDovL3N0YWNrb3ZlcmZsb3cuY29tL2EvMzk4MTIwLzM3Njc3M1xuICAgICh0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJyAmJiB3aW5kb3cuY29uc29sZSAmJiAod2luZG93LmNvbnNvbGUuZmlyZWJ1ZyB8fCAod2luZG93LmNvbnNvbGUuZXhjZXB0aW9uICYmIHdpbmRvdy5jb25zb2xlLnRhYmxlKSkpIHx8XG4gICAgLy8gaXMgZmlyZWZveCA+PSB2MzE/XG4gICAgLy8gaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9Ub29scy9XZWJfQ29uc29sZSNTdHlsaW5nX21lc3NhZ2VzXG4gICAgKHR5cGVvZiBuYXZpZ2F0b3IgIT09ICd1bmRlZmluZWQnICYmIG5hdmlnYXRvci51c2VyQWdlbnQgJiYgbmF2aWdhdG9yLnVzZXJBZ2VudC50b0xvd2VyQ2FzZSgpLm1hdGNoKC9maXJlZm94XFwvKFxcZCspLykgJiYgcGFyc2VJbnQoUmVnRXhwLiQxLCAxMCkgPj0gMzEpIHx8XG4gICAgLy8gZG91YmxlIGNoZWNrIHdlYmtpdCBpbiB1c2VyQWdlbnQganVzdCBpbiBjYXNlIHdlIGFyZSBpbiBhIHdvcmtlclxuICAgICh0eXBlb2YgbmF2aWdhdG9yICE9PSAndW5kZWZpbmVkJyAmJiBuYXZpZ2F0b3IudXNlckFnZW50ICYmIG5hdmlnYXRvci51c2VyQWdlbnQudG9Mb3dlckNhc2UoKS5tYXRjaCgvYXBwbGV3ZWJraXRcXC8oXFxkKykvKSk7XG59XG5cbi8qKlxuICogTWFwICVqIHRvIGBKU09OLnN0cmluZ2lmeSgpYCwgc2luY2Ugbm8gV2ViIEluc3BlY3RvcnMgZG8gdGhhdCBieSBkZWZhdWx0LlxuICovXG5cbmV4cG9ydHMuZm9ybWF0dGVycy5qID0gZnVuY3Rpb24odikge1xuICB0cnkge1xuICAgIHJldHVybiBKU09OLnN0cmluZ2lmeSh2KTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgcmV0dXJuICdbVW5leHBlY3RlZEpTT05QYXJzZUVycm9yXTogJyArIGVyci5tZXNzYWdlO1xuICB9XG59O1xuXG5cbi8qKlxuICogQ29sb3JpemUgbG9nIGFyZ3VtZW50cyBpZiBlbmFibGVkLlxuICpcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gZm9ybWF0QXJncyhhcmdzKSB7XG4gIHZhciB1c2VDb2xvcnMgPSB0aGlzLnVzZUNvbG9ycztcblxuICBhcmdzWzBdID0gKHVzZUNvbG9ycyA/ICclYycgOiAnJylcbiAgICArIHRoaXMubmFtZXNwYWNlXG4gICAgKyAodXNlQ29sb3JzID8gJyAlYycgOiAnICcpXG4gICAgKyBhcmdzWzBdXG4gICAgKyAodXNlQ29sb3JzID8gJyVjICcgOiAnICcpXG4gICAgKyAnKycgKyBleHBvcnRzLmh1bWFuaXplKHRoaXMuZGlmZik7XG5cbiAgaWYgKCF1c2VDb2xvcnMpIHJldHVybjtcblxuICB2YXIgYyA9ICdjb2xvcjogJyArIHRoaXMuY29sb3I7XG4gIGFyZ3Muc3BsaWNlKDEsIDAsIGMsICdjb2xvcjogaW5oZXJpdCcpXG5cbiAgLy8gdGhlIGZpbmFsIFwiJWNcIiBpcyBzb21ld2hhdCB0cmlja3ksIGJlY2F1c2UgdGhlcmUgY291bGQgYmUgb3RoZXJcbiAgLy8gYXJndW1lbnRzIHBhc3NlZCBlaXRoZXIgYmVmb3JlIG9yIGFmdGVyIHRoZSAlYywgc28gd2UgbmVlZCB0b1xuICAvLyBmaWd1cmUgb3V0IHRoZSBjb3JyZWN0IGluZGV4IHRvIGluc2VydCB0aGUgQ1NTIGludG9cbiAgdmFyIGluZGV4ID0gMDtcbiAgdmFyIGxhc3RDID0gMDtcbiAgYXJnc1swXS5yZXBsYWNlKC8lW2EtekEtWiVdL2csIGZ1bmN0aW9uKG1hdGNoKSB7XG4gICAgaWYgKCclJScgPT09IG1hdGNoKSByZXR1cm47XG4gICAgaW5kZXgrKztcbiAgICBpZiAoJyVjJyA9PT0gbWF0Y2gpIHtcbiAgICAgIC8vIHdlIG9ubHkgYXJlIGludGVyZXN0ZWQgaW4gdGhlICpsYXN0KiAlY1xuICAgICAgLy8gKHRoZSB1c2VyIG1heSBoYXZlIHByb3ZpZGVkIHRoZWlyIG93bilcbiAgICAgIGxhc3RDID0gaW5kZXg7XG4gICAgfVxuICB9KTtcblxuICBhcmdzLnNwbGljZShsYXN0QywgMCwgYyk7XG59XG5cbi8qKlxuICogSW52b2tlcyBgY29uc29sZS5sb2coKWAgd2hlbiBhdmFpbGFibGUuXG4gKiBOby1vcCB3aGVuIGBjb25zb2xlLmxvZ2AgaXMgbm90IGEgXCJmdW5jdGlvblwiLlxuICpcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gbG9nKCkge1xuICAvLyB0aGlzIGhhY2tlcnkgaXMgcmVxdWlyZWQgZm9yIElFOC85LCB3aGVyZVxuICAvLyB0aGUgYGNvbnNvbGUubG9nYCBmdW5jdGlvbiBkb2Vzbid0IGhhdmUgJ2FwcGx5J1xuICByZXR1cm4gJ29iamVjdCcgPT09IHR5cGVvZiBjb25zb2xlXG4gICAgJiYgY29uc29sZS5sb2dcbiAgICAmJiBGdW5jdGlvbi5wcm90b3R5cGUuYXBwbHkuY2FsbChjb25zb2xlLmxvZywgY29uc29sZSwgYXJndW1lbnRzKTtcbn1cblxuLyoqXG4gKiBTYXZlIGBuYW1lc3BhY2VzYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZXNwYWNlc1xuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gc2F2ZShuYW1lc3BhY2VzKSB7XG4gIHRyeSB7XG4gICAgaWYgKG51bGwgPT0gbmFtZXNwYWNlcykge1xuICAgICAgZXhwb3J0cy5zdG9yYWdlLnJlbW92ZUl0ZW0oJ2RlYnVnJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGV4cG9ydHMuc3RvcmFnZS5kZWJ1ZyA9IG5hbWVzcGFjZXM7XG4gICAgfVxuICB9IGNhdGNoKGUpIHt9XG59XG5cbi8qKlxuICogTG9hZCBgbmFtZXNwYWNlc2AuXG4gKlxuICogQHJldHVybiB7U3RyaW5nfSByZXR1cm5zIHRoZSBwcmV2aW91c2x5IHBlcnNpc3RlZCBkZWJ1ZyBtb2Rlc1xuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gbG9hZCgpIHtcbiAgdmFyIHI7XG4gIHRyeSB7XG4gICAgciA9IGV4cG9ydHMuc3RvcmFnZS5kZWJ1ZztcbiAgfSBjYXRjaChlKSB7fVxuXG4gIC8vIElmIGRlYnVnIGlzbid0IHNldCBpbiBMUywgYW5kIHdlJ3JlIGluIEVsZWN0cm9uLCB0cnkgdG8gbG9hZCAkREVCVUdcbiAgaWYgKCFyICYmIHR5cGVvZiBwcm9jZXNzICE9PSAndW5kZWZpbmVkJyAmJiAnZW52JyBpbiBwcm9jZXNzKSB7XG4gICAgciA9IHByb2Nlc3MuZW52LkRFQlVHO1xuICB9XG5cbiAgcmV0dXJuIHI7XG59XG5cbi8qKlxuICogRW5hYmxlIG5hbWVzcGFjZXMgbGlzdGVkIGluIGBsb2NhbFN0b3JhZ2UuZGVidWdgIGluaXRpYWxseS5cbiAqL1xuXG5leHBvcnRzLmVuYWJsZShsb2FkKCkpO1xuXG4vKipcbiAqIExvY2Fsc3RvcmFnZSBhdHRlbXB0cyB0byByZXR1cm4gdGhlIGxvY2Fsc3RvcmFnZS5cbiAqXG4gKiBUaGlzIGlzIG5lY2Vzc2FyeSBiZWNhdXNlIHNhZmFyaSB0aHJvd3NcbiAqIHdoZW4gYSB1c2VyIGRpc2FibGVzIGNvb2tpZXMvbG9jYWxzdG9yYWdlXG4gKiBhbmQgeW91IGF0dGVtcHQgdG8gYWNjZXNzIGl0LlxuICpcbiAqIEByZXR1cm4ge0xvY2FsU3RvcmFnZX1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIGxvY2Fsc3RvcmFnZSgpIHtcbiAgdHJ5IHtcbiAgICByZXR1cm4gd2luZG93LmxvY2FsU3RvcmFnZTtcbiAgfSBjYXRjaCAoZSkge31cbn1cbiIsIlxuLyoqXG4gKiBUaGlzIGlzIHRoZSBjb21tb24gbG9naWMgZm9yIGJvdGggdGhlIE5vZGUuanMgYW5kIHdlYiBicm93c2VyXG4gKiBpbXBsZW1lbnRhdGlvbnMgb2YgYGRlYnVnKClgLlxuICpcbiAqIEV4cG9zZSBgZGVidWcoKWAgYXMgdGhlIG1vZHVsZS5cbiAqL1xuXG5leHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSBjcmVhdGVEZWJ1Zy5kZWJ1ZyA9IGNyZWF0ZURlYnVnWydkZWZhdWx0J10gPSBjcmVhdGVEZWJ1ZztcbmV4cG9ydHMuY29lcmNlID0gY29lcmNlO1xuZXhwb3J0cy5kaXNhYmxlID0gZGlzYWJsZTtcbmV4cG9ydHMuZW5hYmxlID0gZW5hYmxlO1xuZXhwb3J0cy5lbmFibGVkID0gZW5hYmxlZDtcbmV4cG9ydHMuaHVtYW5pemUgPSByZXF1aXJlKCdtcycpO1xuXG4vKipcbiAqIFRoZSBjdXJyZW50bHkgYWN0aXZlIGRlYnVnIG1vZGUgbmFtZXMsIGFuZCBuYW1lcyB0byBza2lwLlxuICovXG5cbmV4cG9ydHMubmFtZXMgPSBbXTtcbmV4cG9ydHMuc2tpcHMgPSBbXTtcblxuLyoqXG4gKiBNYXAgb2Ygc3BlY2lhbCBcIiVuXCIgaGFuZGxpbmcgZnVuY3Rpb25zLCBmb3IgdGhlIGRlYnVnIFwiZm9ybWF0XCIgYXJndW1lbnQuXG4gKlxuICogVmFsaWQga2V5IG5hbWVzIGFyZSBhIHNpbmdsZSwgbG93ZXIgb3IgdXBwZXItY2FzZSBsZXR0ZXIsIGkuZS4gXCJuXCIgYW5kIFwiTlwiLlxuICovXG5cbmV4cG9ydHMuZm9ybWF0dGVycyA9IHt9O1xuXG4vKipcbiAqIFByZXZpb3VzIGxvZyB0aW1lc3RhbXAuXG4gKi9cblxudmFyIHByZXZUaW1lO1xuXG4vKipcbiAqIFNlbGVjdCBhIGNvbG9yLlxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWVzcGFjZVxuICogQHJldHVybiB7TnVtYmVyfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gc2VsZWN0Q29sb3IobmFtZXNwYWNlKSB7XG4gIHZhciBoYXNoID0gMCwgaTtcblxuICBmb3IgKGkgaW4gbmFtZXNwYWNlKSB7XG4gICAgaGFzaCAgPSAoKGhhc2ggPDwgNSkgLSBoYXNoKSArIG5hbWVzcGFjZS5jaGFyQ29kZUF0KGkpO1xuICAgIGhhc2ggfD0gMDsgLy8gQ29udmVydCB0byAzMmJpdCBpbnRlZ2VyXG4gIH1cblxuICByZXR1cm4gZXhwb3J0cy5jb2xvcnNbTWF0aC5hYnMoaGFzaCkgJSBleHBvcnRzLmNvbG9ycy5sZW5ndGhdO1xufVxuXG4vKipcbiAqIENyZWF0ZSBhIGRlYnVnZ2VyIHdpdGggdGhlIGdpdmVuIGBuYW1lc3BhY2VgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lc3BhY2VcbiAqIEByZXR1cm4ge0Z1bmN0aW9ufVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBjcmVhdGVEZWJ1ZyhuYW1lc3BhY2UpIHtcblxuICBmdW5jdGlvbiBkZWJ1ZygpIHtcbiAgICAvLyBkaXNhYmxlZD9cbiAgICBpZiAoIWRlYnVnLmVuYWJsZWQpIHJldHVybjtcblxuICAgIHZhciBzZWxmID0gZGVidWc7XG5cbiAgICAvLyBzZXQgYGRpZmZgIHRpbWVzdGFtcFxuICAgIHZhciBjdXJyID0gK25ldyBEYXRlKCk7XG4gICAgdmFyIG1zID0gY3VyciAtIChwcmV2VGltZSB8fCBjdXJyKTtcbiAgICBzZWxmLmRpZmYgPSBtcztcbiAgICBzZWxmLnByZXYgPSBwcmV2VGltZTtcbiAgICBzZWxmLmN1cnIgPSBjdXJyO1xuICAgIHByZXZUaW1lID0gY3VycjtcblxuICAgIC8vIHR1cm4gdGhlIGBhcmd1bWVudHNgIGludG8gYSBwcm9wZXIgQXJyYXlcbiAgICB2YXIgYXJncyA9IG5ldyBBcnJheShhcmd1bWVudHMubGVuZ3RoKTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGFyZ3MubGVuZ3RoOyBpKyspIHtcbiAgICAgIGFyZ3NbaV0gPSBhcmd1bWVudHNbaV07XG4gICAgfVxuXG4gICAgYXJnc1swXSA9IGV4cG9ydHMuY29lcmNlKGFyZ3NbMF0pO1xuXG4gICAgaWYgKCdzdHJpbmcnICE9PSB0eXBlb2YgYXJnc1swXSkge1xuICAgICAgLy8gYW55dGhpbmcgZWxzZSBsZXQncyBpbnNwZWN0IHdpdGggJU9cbiAgICAgIGFyZ3MudW5zaGlmdCgnJU8nKTtcbiAgICB9XG5cbiAgICAvLyBhcHBseSBhbnkgYGZvcm1hdHRlcnNgIHRyYW5zZm9ybWF0aW9uc1xuICAgIHZhciBpbmRleCA9IDA7XG4gICAgYXJnc1swXSA9IGFyZ3NbMF0ucmVwbGFjZSgvJShbYS16QS1aJV0pL2csIGZ1bmN0aW9uKG1hdGNoLCBmb3JtYXQpIHtcbiAgICAgIC8vIGlmIHdlIGVuY291bnRlciBhbiBlc2NhcGVkICUgdGhlbiBkb24ndCBpbmNyZWFzZSB0aGUgYXJyYXkgaW5kZXhcbiAgICAgIGlmIChtYXRjaCA9PT0gJyUlJykgcmV0dXJuIG1hdGNoO1xuICAgICAgaW5kZXgrKztcbiAgICAgIHZhciBmb3JtYXR0ZXIgPSBleHBvcnRzLmZvcm1hdHRlcnNbZm9ybWF0XTtcbiAgICAgIGlmICgnZnVuY3Rpb24nID09PSB0eXBlb2YgZm9ybWF0dGVyKSB7XG4gICAgICAgIHZhciB2YWwgPSBhcmdzW2luZGV4XTtcbiAgICAgICAgbWF0Y2ggPSBmb3JtYXR0ZXIuY2FsbChzZWxmLCB2YWwpO1xuXG4gICAgICAgIC8vIG5vdyB3ZSBuZWVkIHRvIHJlbW92ZSBgYXJnc1tpbmRleF1gIHNpbmNlIGl0J3MgaW5saW5lZCBpbiB0aGUgYGZvcm1hdGBcbiAgICAgICAgYXJncy5zcGxpY2UoaW5kZXgsIDEpO1xuICAgICAgICBpbmRleC0tO1xuICAgICAgfVxuICAgICAgcmV0dXJuIG1hdGNoO1xuICAgIH0pO1xuXG4gICAgLy8gYXBwbHkgZW52LXNwZWNpZmljIGZvcm1hdHRpbmcgKGNvbG9ycywgZXRjLilcbiAgICBleHBvcnRzLmZvcm1hdEFyZ3MuY2FsbChzZWxmLCBhcmdzKTtcblxuICAgIHZhciBsb2dGbiA9IGRlYnVnLmxvZyB8fCBleHBvcnRzLmxvZyB8fCBjb25zb2xlLmxvZy5iaW5kKGNvbnNvbGUpO1xuICAgIGxvZ0ZuLmFwcGx5KHNlbGYsIGFyZ3MpO1xuICB9XG5cbiAgZGVidWcubmFtZXNwYWNlID0gbmFtZXNwYWNlO1xuICBkZWJ1Zy5lbmFibGVkID0gZXhwb3J0cy5lbmFibGVkKG5hbWVzcGFjZSk7XG4gIGRlYnVnLnVzZUNvbG9ycyA9IGV4cG9ydHMudXNlQ29sb3JzKCk7XG4gIGRlYnVnLmNvbG9yID0gc2VsZWN0Q29sb3IobmFtZXNwYWNlKTtcblxuICAvLyBlbnYtc3BlY2lmaWMgaW5pdGlhbGl6YXRpb24gbG9naWMgZm9yIGRlYnVnIGluc3RhbmNlc1xuICBpZiAoJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIGV4cG9ydHMuaW5pdCkge1xuICAgIGV4cG9ydHMuaW5pdChkZWJ1Zyk7XG4gIH1cblxuICByZXR1cm4gZGVidWc7XG59XG5cbi8qKlxuICogRW5hYmxlcyBhIGRlYnVnIG1vZGUgYnkgbmFtZXNwYWNlcy4gVGhpcyBjYW4gaW5jbHVkZSBtb2Rlc1xuICogc2VwYXJhdGVkIGJ5IGEgY29sb24gYW5kIHdpbGRjYXJkcy5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZXNwYWNlc1xuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBlbmFibGUobmFtZXNwYWNlcykge1xuICBleHBvcnRzLnNhdmUobmFtZXNwYWNlcyk7XG5cbiAgZXhwb3J0cy5uYW1lcyA9IFtdO1xuICBleHBvcnRzLnNraXBzID0gW107XG5cbiAgdmFyIHNwbGl0ID0gKHR5cGVvZiBuYW1lc3BhY2VzID09PSAnc3RyaW5nJyA/IG5hbWVzcGFjZXMgOiAnJykuc3BsaXQoL1tcXHMsXSsvKTtcbiAgdmFyIGxlbiA9IHNwbGl0Lmxlbmd0aDtcblxuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgaWYgKCFzcGxpdFtpXSkgY29udGludWU7IC8vIGlnbm9yZSBlbXB0eSBzdHJpbmdzXG4gICAgbmFtZXNwYWNlcyA9IHNwbGl0W2ldLnJlcGxhY2UoL1xcKi9nLCAnLio/Jyk7XG4gICAgaWYgKG5hbWVzcGFjZXNbMF0gPT09ICctJykge1xuICAgICAgZXhwb3J0cy5za2lwcy5wdXNoKG5ldyBSZWdFeHAoJ14nICsgbmFtZXNwYWNlcy5zdWJzdHIoMSkgKyAnJCcpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgZXhwb3J0cy5uYW1lcy5wdXNoKG5ldyBSZWdFeHAoJ14nICsgbmFtZXNwYWNlcyArICckJykpO1xuICAgIH1cbiAgfVxufVxuXG4vKipcbiAqIERpc2FibGUgZGVidWcgb3V0cHV0LlxuICpcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gZGlzYWJsZSgpIHtcbiAgZXhwb3J0cy5lbmFibGUoJycpO1xufVxuXG4vKipcbiAqIFJldHVybnMgdHJ1ZSBpZiB0aGUgZ2l2ZW4gbW9kZSBuYW1lIGlzIGVuYWJsZWQsIGZhbHNlIG90aGVyd2lzZS5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZVxuICogQHJldHVybiB7Qm9vbGVhbn1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gZW5hYmxlZChuYW1lKSB7XG4gIHZhciBpLCBsZW47XG4gIGZvciAoaSA9IDAsIGxlbiA9IGV4cG9ydHMuc2tpcHMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICBpZiAoZXhwb3J0cy5za2lwc1tpXS50ZXN0KG5hbWUpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG4gIGZvciAoaSA9IDAsIGxlbiA9IGV4cG9ydHMubmFtZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICBpZiAoZXhwb3J0cy5uYW1lc1tpXS50ZXN0KG5hbWUpKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGZhbHNlO1xufVxuXG4vKipcbiAqIENvZXJjZSBgdmFsYC5cbiAqXG4gKiBAcGFyYW0ge01peGVkfSB2YWxcbiAqIEByZXR1cm4ge01peGVkfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gY29lcmNlKHZhbCkge1xuICBpZiAodmFsIGluc3RhbmNlb2YgRXJyb3IpIHJldHVybiB2YWwuc3RhY2sgfHwgdmFsLm1lc3NhZ2U7XG4gIHJldHVybiB2YWw7XG59XG4iLCIvKipcbiAqIEhlbHBlcnMuXG4gKi9cblxudmFyIHMgPSAxMDAwO1xudmFyIG0gPSBzICogNjA7XG52YXIgaCA9IG0gKiA2MDtcbnZhciBkID0gaCAqIDI0O1xudmFyIHkgPSBkICogMzY1LjI1O1xuXG4vKipcbiAqIFBhcnNlIG9yIGZvcm1hdCB0aGUgZ2l2ZW4gYHZhbGAuXG4gKlxuICogT3B0aW9uczpcbiAqXG4gKiAgLSBgbG9uZ2AgdmVyYm9zZSBmb3JtYXR0aW5nIFtmYWxzZV1cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ3xOdW1iZXJ9IHZhbFxuICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXVxuICogQHRocm93cyB7RXJyb3J9IHRocm93IGFuIGVycm9yIGlmIHZhbCBpcyBub3QgYSBub24tZW1wdHkgc3RyaW5nIG9yIGEgbnVtYmVyXG4gKiBAcmV0dXJuIHtTdHJpbmd8TnVtYmVyfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHZhbCwgb3B0aW9ucykge1xuICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgdmFyIHR5cGUgPSB0eXBlb2YgdmFsO1xuICBpZiAodHlwZSA9PT0gJ3N0cmluZycgJiYgdmFsLmxlbmd0aCA+IDApIHtcbiAgICByZXR1cm4gcGFyc2UodmFsKTtcbiAgfSBlbHNlIGlmICh0eXBlID09PSAnbnVtYmVyJyAmJiBpc05hTih2YWwpID09PSBmYWxzZSkge1xuICAgIHJldHVybiBvcHRpb25zLmxvbmcgPyBmbXRMb25nKHZhbCkgOiBmbXRTaG9ydCh2YWwpO1xuICB9XG4gIHRocm93IG5ldyBFcnJvcihcbiAgICAndmFsIGlzIG5vdCBhIG5vbi1lbXB0eSBzdHJpbmcgb3IgYSB2YWxpZCBudW1iZXIuIHZhbD0nICtcbiAgICAgIEpTT04uc3RyaW5naWZ5KHZhbClcbiAgKTtcbn07XG5cbi8qKlxuICogUGFyc2UgdGhlIGdpdmVuIGBzdHJgIGFuZCByZXR1cm4gbWlsbGlzZWNvbmRzLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBzdHJcbiAqIEByZXR1cm4ge051bWJlcn1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIHBhcnNlKHN0cikge1xuICBzdHIgPSBTdHJpbmcoc3RyKTtcbiAgaWYgKHN0ci5sZW5ndGggPiAxMDApIHtcbiAgICByZXR1cm47XG4gIH1cbiAgdmFyIG1hdGNoID0gL14oKD86XFxkKyk/XFwuP1xcZCspICoobWlsbGlzZWNvbmRzP3xtc2Vjcz98bXN8c2Vjb25kcz98c2Vjcz98c3xtaW51dGVzP3xtaW5zP3xtfGhvdXJzP3xocnM/fGh8ZGF5cz98ZHx5ZWFycz98eXJzP3x5KT8kL2kuZXhlYyhcbiAgICBzdHJcbiAgKTtcbiAgaWYgKCFtYXRjaCkge1xuICAgIHJldHVybjtcbiAgfVxuICB2YXIgbiA9IHBhcnNlRmxvYXQobWF0Y2hbMV0pO1xuICB2YXIgdHlwZSA9IChtYXRjaFsyXSB8fCAnbXMnKS50b0xvd2VyQ2FzZSgpO1xuICBzd2l0Y2ggKHR5cGUpIHtcbiAgICBjYXNlICd5ZWFycyc6XG4gICAgY2FzZSAneWVhcic6XG4gICAgY2FzZSAneXJzJzpcbiAgICBjYXNlICd5cic6XG4gICAgY2FzZSAneSc6XG4gICAgICByZXR1cm4gbiAqIHk7XG4gICAgY2FzZSAnZGF5cyc6XG4gICAgY2FzZSAnZGF5JzpcbiAgICBjYXNlICdkJzpcbiAgICAgIHJldHVybiBuICogZDtcbiAgICBjYXNlICdob3Vycyc6XG4gICAgY2FzZSAnaG91cic6XG4gICAgY2FzZSAnaHJzJzpcbiAgICBjYXNlICdocic6XG4gICAgY2FzZSAnaCc6XG4gICAgICByZXR1cm4gbiAqIGg7XG4gICAgY2FzZSAnbWludXRlcyc6XG4gICAgY2FzZSAnbWludXRlJzpcbiAgICBjYXNlICdtaW5zJzpcbiAgICBjYXNlICdtaW4nOlxuICAgIGNhc2UgJ20nOlxuICAgICAgcmV0dXJuIG4gKiBtO1xuICAgIGNhc2UgJ3NlY29uZHMnOlxuICAgIGNhc2UgJ3NlY29uZCc6XG4gICAgY2FzZSAnc2Vjcyc6XG4gICAgY2FzZSAnc2VjJzpcbiAgICBjYXNlICdzJzpcbiAgICAgIHJldHVybiBuICogcztcbiAgICBjYXNlICdtaWxsaXNlY29uZHMnOlxuICAgIGNhc2UgJ21pbGxpc2Vjb25kJzpcbiAgICBjYXNlICdtc2Vjcyc6XG4gICAgY2FzZSAnbXNlYyc6XG4gICAgY2FzZSAnbXMnOlxuICAgICAgcmV0dXJuIG47XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gIH1cbn1cblxuLyoqXG4gKiBTaG9ydCBmb3JtYXQgZm9yIGBtc2AuXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ9IG1zXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBmbXRTaG9ydChtcykge1xuICBpZiAobXMgPj0gZCkge1xuICAgIHJldHVybiBNYXRoLnJvdW5kKG1zIC8gZCkgKyAnZCc7XG4gIH1cbiAgaWYgKG1zID49IGgpIHtcbiAgICByZXR1cm4gTWF0aC5yb3VuZChtcyAvIGgpICsgJ2gnO1xuICB9XG4gIGlmIChtcyA+PSBtKSB7XG4gICAgcmV0dXJuIE1hdGgucm91bmQobXMgLyBtKSArICdtJztcbiAgfVxuICBpZiAobXMgPj0gcykge1xuICAgIHJldHVybiBNYXRoLnJvdW5kKG1zIC8gcykgKyAncyc7XG4gIH1cbiAgcmV0dXJuIG1zICsgJ21zJztcbn1cblxuLyoqXG4gKiBMb25nIGZvcm1hdCBmb3IgYG1zYC5cbiAqXG4gKiBAcGFyYW0ge051bWJlcn0gbXNcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIGZtdExvbmcobXMpIHtcbiAgcmV0dXJuIHBsdXJhbChtcywgZCwgJ2RheScpIHx8XG4gICAgcGx1cmFsKG1zLCBoLCAnaG91cicpIHx8XG4gICAgcGx1cmFsKG1zLCBtLCAnbWludXRlJykgfHxcbiAgICBwbHVyYWwobXMsIHMsICdzZWNvbmQnKSB8fFxuICAgIG1zICsgJyBtcyc7XG59XG5cbi8qKlxuICogUGx1cmFsaXphdGlvbiBoZWxwZXIuXG4gKi9cblxuZnVuY3Rpb24gcGx1cmFsKG1zLCBuLCBuYW1lKSB7XG4gIGlmIChtcyA8IG4pIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKG1zIDwgbiAqIDEuNSkge1xuICAgIHJldHVybiBNYXRoLmZsb29yKG1zIC8gbikgKyAnICcgKyBuYW1lO1xuICB9XG4gIHJldHVybiBNYXRoLmNlaWwobXMgLyBuKSArICcgJyArIG5hbWUgKyAncyc7XG59XG4iXX0=

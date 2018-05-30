(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
'use strict';

var _stringify = require('babel-runtime/core-js/json/stringify');

var _stringify2 = _interopRequireDefault(_stringify);

var _client = require('@ircam/sync/client');

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

  var $syncTime = document.querySelector('#sync-time');
  setInterval(function () {
    var syncTime = syncClient.getSyncTime();
    $syncTime.innerHTML = syncTime;
  }, 100);

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

},{"@ircam/sync/client":2,"babel-runtime/core-js/json/stringify":3}],2:[function(require,module,exports){
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
   * @return {Number} monotonic, ever increasing, time in second. When possible
   *  the server code should define its own origin (i.e. `time=0`) in order to
   *  maximize the resolution of the clock for a long period of time. When
   *  `SyncServer~start` is called the clock should be running
   *  (cf. `audioContext.currentTime` that needs user interaction to start)
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

},{"babel-runtime/helpers/classCallCheck":5,"babel-runtime/helpers/createClass":6,"debug":26}],3:[function(require,module,exports){
module.exports = { "default": require("core-js/library/fn/json/stringify"), __esModule: true };
},{"core-js/library/fn/json/stringify":7}],4:[function(require,module,exports){
module.exports = { "default": require("core-js/library/fn/object/define-property"), __esModule: true };
},{"core-js/library/fn/object/define-property":8}],5:[function(require,module,exports){
"use strict";

exports.__esModule = true;

exports.default = function (instance, Constructor) {
  if (!(instance instanceof Constructor)) {
    throw new TypeError("Cannot call a class as a function");
  }
};
},{}],6:[function(require,module,exports){
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
},{"../core-js/object/define-property":4}],7:[function(require,module,exports){
var core = require('../../modules/_core');
var $JSON = core.JSON || (core.JSON = { stringify: JSON.stringify });
module.exports = function stringify(it) { // eslint-disable-line no-unused-vars
  return $JSON.stringify.apply($JSON, arguments);
};

},{"../../modules/_core":11}],8:[function(require,module,exports){
require('../../modules/es6.object.define-property');
var $Object = require('../../modules/_core').Object;
module.exports = function defineProperty(it, key, desc) {
  return $Object.defineProperty(it, key, desc);
};

},{"../../modules/_core":11,"../../modules/es6.object.define-property":25}],9:[function(require,module,exports){
module.exports = function (it) {
  if (typeof it != 'function') throw TypeError(it + ' is not a function!');
  return it;
};

},{}],10:[function(require,module,exports){
var isObject = require('./_is-object');
module.exports = function (it) {
  if (!isObject(it)) throw TypeError(it + ' is not an object!');
  return it;
};

},{"./_is-object":21}],11:[function(require,module,exports){
var core = module.exports = { version: '2.5.7' };
if (typeof __e == 'number') __e = core; // eslint-disable-line no-undef

},{}],12:[function(require,module,exports){
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

},{"./_a-function":9}],13:[function(require,module,exports){
// Thank's IE8 for his funny defineProperty
module.exports = !require('./_fails')(function () {
  return Object.defineProperty({}, 'a', { get: function () { return 7; } }).a != 7;
});

},{"./_fails":16}],14:[function(require,module,exports){
var isObject = require('./_is-object');
var document = require('./_global').document;
// typeof document.createElement is 'object' in old IE
var is = isObject(document) && isObject(document.createElement);
module.exports = function (it) {
  return is ? document.createElement(it) : {};
};

},{"./_global":17,"./_is-object":21}],15:[function(require,module,exports){
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

},{"./_core":11,"./_ctx":12,"./_global":17,"./_has":18,"./_hide":19}],16:[function(require,module,exports){
module.exports = function (exec) {
  try {
    return !!exec();
  } catch (e) {
    return true;
  }
};

},{}],17:[function(require,module,exports){
// https://github.com/zloirock/core-js/issues/86#issuecomment-115759028
var global = module.exports = typeof window != 'undefined' && window.Math == Math
  ? window : typeof self != 'undefined' && self.Math == Math ? self
  // eslint-disable-next-line no-new-func
  : Function('return this')();
if (typeof __g == 'number') __g = global; // eslint-disable-line no-undef

},{}],18:[function(require,module,exports){
var hasOwnProperty = {}.hasOwnProperty;
module.exports = function (it, key) {
  return hasOwnProperty.call(it, key);
};

},{}],19:[function(require,module,exports){
var dP = require('./_object-dp');
var createDesc = require('./_property-desc');
module.exports = require('./_descriptors') ? function (object, key, value) {
  return dP.f(object, key, createDesc(1, value));
} : function (object, key, value) {
  object[key] = value;
  return object;
};

},{"./_descriptors":13,"./_object-dp":22,"./_property-desc":23}],20:[function(require,module,exports){
module.exports = !require('./_descriptors') && !require('./_fails')(function () {
  return Object.defineProperty(require('./_dom-create')('div'), 'a', { get: function () { return 7; } }).a != 7;
});

},{"./_descriptors":13,"./_dom-create":14,"./_fails":16}],21:[function(require,module,exports){
module.exports = function (it) {
  return typeof it === 'object' ? it !== null : typeof it === 'function';
};

},{}],22:[function(require,module,exports){
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

},{"./_an-object":10,"./_descriptors":13,"./_ie8-dom-define":20,"./_to-primitive":24}],23:[function(require,module,exports){
module.exports = function (bitmap, value) {
  return {
    enumerable: !(bitmap & 1),
    configurable: !(bitmap & 2),
    writable: !(bitmap & 4),
    value: value
  };
};

},{}],24:[function(require,module,exports){
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

},{"./_is-object":21}],25:[function(require,module,exports){
var $export = require('./_export');
// 19.1.2.4 / 15.2.3.6 Object.defineProperty(O, P, Attributes)
$export($export.S + $export.F * !require('./_descriptors'), 'Object', { defineProperty: require('./_object-dp').f });

},{"./_descriptors":13,"./_export":15,"./_object-dp":22}],26:[function(require,module,exports){
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

},{"./debug":27,"_process":29}],27:[function(require,module,exports){

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

},{"ms":28}],28:[function(require,module,exports){
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

},{}],29:[function(require,module,exports){
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJkaXN0L2NsaWVudC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9AaXJjYW0vc3luYy9jbGllbnQvaW5kZXguanMiLCJub2RlX21vZHVsZXMvYmFiZWwtcnVudGltZS9jb3JlLWpzL2pzb24vc3RyaW5naWZ5LmpzIiwibm9kZV9tb2R1bGVzL2JhYmVsLXJ1bnRpbWUvY29yZS1qcy9vYmplY3QvZGVmaW5lLXByb3BlcnR5LmpzIiwibm9kZV9tb2R1bGVzL2JhYmVsLXJ1bnRpbWUvaGVscGVycy9jbGFzc0NhbGxDaGVjay5qcyIsIm5vZGVfbW9kdWxlcy9iYWJlbC1ydW50aW1lL2hlbHBlcnMvY3JlYXRlQ2xhc3MuanMiLCJub2RlX21vZHVsZXMvY29yZS1qcy9saWJyYXJ5L2ZuL2pzb24vc3RyaW5naWZ5LmpzIiwibm9kZV9tb2R1bGVzL2NvcmUtanMvbGlicmFyeS9mbi9vYmplY3QvZGVmaW5lLXByb3BlcnR5LmpzIiwibm9kZV9tb2R1bGVzL2NvcmUtanMvbGlicmFyeS9tb2R1bGVzL19hLWZ1bmN0aW9uLmpzIiwibm9kZV9tb2R1bGVzL2NvcmUtanMvbGlicmFyeS9tb2R1bGVzL19hbi1vYmplY3QuanMiLCJub2RlX21vZHVsZXMvY29yZS1qcy9saWJyYXJ5L21vZHVsZXMvX2NvcmUuanMiLCJub2RlX21vZHVsZXMvY29yZS1qcy9saWJyYXJ5L21vZHVsZXMvX2N0eC5qcyIsIm5vZGVfbW9kdWxlcy9jb3JlLWpzL2xpYnJhcnkvbW9kdWxlcy9fZGVzY3JpcHRvcnMuanMiLCJub2RlX21vZHVsZXMvY29yZS1qcy9saWJyYXJ5L21vZHVsZXMvX2RvbS1jcmVhdGUuanMiLCJub2RlX21vZHVsZXMvY29yZS1qcy9saWJyYXJ5L21vZHVsZXMvX2V4cG9ydC5qcyIsIm5vZGVfbW9kdWxlcy9jb3JlLWpzL2xpYnJhcnkvbW9kdWxlcy9fZmFpbHMuanMiLCJub2RlX21vZHVsZXMvY29yZS1qcy9saWJyYXJ5L21vZHVsZXMvX2dsb2JhbC5qcyIsIm5vZGVfbW9kdWxlcy9jb3JlLWpzL2xpYnJhcnkvbW9kdWxlcy9faGFzLmpzIiwibm9kZV9tb2R1bGVzL2NvcmUtanMvbGlicmFyeS9tb2R1bGVzL19oaWRlLmpzIiwibm9kZV9tb2R1bGVzL2NvcmUtanMvbGlicmFyeS9tb2R1bGVzL19pZTgtZG9tLWRlZmluZS5qcyIsIm5vZGVfbW9kdWxlcy9jb3JlLWpzL2xpYnJhcnkvbW9kdWxlcy9faXMtb2JqZWN0LmpzIiwibm9kZV9tb2R1bGVzL2NvcmUtanMvbGlicmFyeS9tb2R1bGVzL19vYmplY3QtZHAuanMiLCJub2RlX21vZHVsZXMvY29yZS1qcy9saWJyYXJ5L21vZHVsZXMvX3Byb3BlcnR5LWRlc2MuanMiLCJub2RlX21vZHVsZXMvY29yZS1qcy9saWJyYXJ5L21vZHVsZXMvX3RvLXByaW1pdGl2ZS5qcyIsIm5vZGVfbW9kdWxlcy9jb3JlLWpzL2xpYnJhcnkvbW9kdWxlcy9lczYub2JqZWN0LmRlZmluZS1wcm9wZXJ0eS5qcyIsIm5vZGVfbW9kdWxlcy9kZWJ1Zy9zcmMvYnJvd3Nlci5qcyIsIm5vZGVfbW9kdWxlcy9kZWJ1Zy9zcmMvZGVidWcuanMiLCJub2RlX21vZHVsZXMvbXMvaW5kZXguanMiLCJub2RlX21vZHVsZXMvcHJvY2Vzcy9icm93c2VyLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7O0FDQUE7Ozs7OztBQUVBLElBQU0sa0JBQWtCLFNBQWxCLGVBQWtCLEdBQU07QUFDNUIsU0FBTyxZQUFZLEdBQVosS0FBb0IsSUFBM0I7QUFDRCxDQUZEOztBQUlBLFNBQVMsSUFBVCxHQUFnQjtBQUNkLE1BQU0sTUFBTSxPQUFPLFFBQVAsQ0FBZ0IsTUFBaEIsQ0FBdUIsT0FBdkIsQ0FBK0IsTUFBL0IsRUFBdUMsSUFBdkMsQ0FBWjs7QUFFQTtBQUNBLE1BQU0sU0FBUyxJQUFJLFNBQUosQ0FBYyxHQUFkLENBQWY7QUFDQSxTQUFPLFVBQVAsR0FBb0IsYUFBcEI7QUFDQTtBQUNBLE1BQU0sYUFBYSxxQkFBZSxlQUFmLENBQW5COztBQUVBLE1BQU0sWUFBWSxTQUFTLGFBQVQsQ0FBdUIsWUFBdkIsQ0FBbEI7QUFDQSxjQUFZLFlBQU07QUFDaEIsUUFBTSxXQUFXLFdBQVcsV0FBWCxFQUFqQjtBQUNBLGNBQVUsU0FBVixHQUFzQixRQUF0QjtBQUNELEdBSEQsRUFHRyxHQUhIOztBQUtBLFNBQU8sZ0JBQVAsQ0FBd0IsTUFBeEIsRUFBZ0MsWUFBTTs7QUFFcEMsUUFBTSxlQUFlLFNBQWYsWUFBZSxDQUFDLE1BQUQsRUFBUyxjQUFULEVBQTRCO0FBQy9DLFVBQU0sVUFBVSxJQUFJLFlBQUosQ0FBaUIsQ0FBakIsQ0FBaEI7QUFDQSxjQUFRLENBQVIsSUFBYSxDQUFiLENBRitDLENBRS9CO0FBQ2hCLGNBQVEsQ0FBUixJQUFhLE1BQWI7QUFDQSxjQUFRLENBQVIsSUFBYSxjQUFiOztBQUVBLGNBQVEsR0FBUixrQ0FBNkMsUUFBUSxDQUFSLENBQTdDLEVBQXlELFFBQVEsQ0FBUixDQUF6RDs7QUFFQSxhQUFPLElBQVAsQ0FBWSxRQUFRLE1BQXBCO0FBQ0QsS0FURDs7QUFXQSxRQUFNLGtCQUFrQixTQUFsQixlQUFrQixXQUFZO0FBQ2xDLGFBQU8sZ0JBQVAsQ0FBd0IsU0FBeEIsRUFBbUMsYUFBSztBQUN0QyxZQUFNLFdBQVcsSUFBSSxZQUFKLENBQWlCLEVBQUUsSUFBbkIsQ0FBakI7O0FBRUEsWUFBSSxTQUFTLENBQVQsTUFBZ0IsQ0FBcEIsRUFBdUI7QUFBRTtBQUN2QixjQUFNLFNBQVMsU0FBUyxDQUFULENBQWY7QUFDQSxjQUFNLGlCQUFpQixTQUFTLENBQVQsQ0FBdkI7QUFDQSxjQUFNLGlCQUFpQixTQUFTLENBQVQsQ0FBdkI7QUFDQSxjQUFNLGlCQUFpQixTQUFTLENBQVQsQ0FBdkI7O0FBRUEsa0JBQVEsR0FBUixnRkFDRSxNQURGLEVBQ1UsY0FEVixFQUMwQixjQUQxQixFQUMwQyxjQUQxQzs7QUFHQSxtQkFBUyxNQUFULEVBQWlCLGNBQWpCLEVBQWlDLGNBQWpDLEVBQWlELGNBQWpEO0FBQ0Q7QUFDRixPQWREO0FBZUQsS0FoQkQ7O0FBa0JBLFFBQU0sbUJBQW1CLFNBQVMsYUFBVCxDQUF1QixTQUF2QixDQUF6QjtBQUNBLFFBQU0saUJBQWlCLFNBQWpCLGNBQWlCLFNBQVU7QUFDL0IsdUJBQWlCLFNBQWpCLEdBQTZCLHlCQUFlLE1BQWYsRUFBdUIsSUFBdkIsRUFBNkIsQ0FBN0IsQ0FBN0I7QUFDQSxjQUFRLEdBQVIsQ0FBWSxNQUFaO0FBQ0QsS0FIRDs7QUFLQSxlQUFXLEtBQVgsQ0FBaUIsWUFBakIsRUFBK0IsZUFBL0IsRUFBZ0QsY0FBaEQ7QUFDRCxHQXRDRDs7QUF3Q0EsU0FBTyxnQkFBUCxDQUF3QixPQUF4QixFQUFpQztBQUFBLFdBQU8sUUFBUSxLQUFSLENBQWMsSUFBSSxLQUFsQixDQUFQO0FBQUEsR0FBakM7QUFDQSxTQUFPLGdCQUFQLENBQXdCLE9BQXhCLEVBQWlDO0FBQUEsV0FBTSxRQUFRLEdBQVIsQ0FBWSxlQUFaLENBQU47QUFBQSxHQUFqQztBQUNEOztBQUVELE9BQU8sZ0JBQVAsQ0FBd0IsTUFBeEIsRUFBZ0MsSUFBaEM7Ozs7Ozs7Ozs7Ozs7Ozs7O0FDakVBOzs7Ozs7QUFDQSxJQUFNLE1BQU0scUJBQU0sTUFBTixDQUFaOztBQUVBOztBQUVBOzs7Ozs7O0FBT0EsU0FBUyxXQUFULENBQXFCLElBQXJCLEVBQTJCO0FBQ3pCLE1BQUcsT0FBTyxJQUFQLEtBQWdCLFdBQWhCLElBQ0csT0FBTyxLQUFLLEdBQVosS0FBb0IsV0FEdkIsSUFDc0MsT0FBTyxLQUFLLEdBQVosS0FBb0IsV0FEMUQsSUFFRyxLQUFLLEdBQUwsR0FBVyxLQUFLLEdBRnRCLEVBRTJCO0FBQ3pCLFFBQU0sTUFBTSxLQUFLLEdBQWpCO0FBQ0EsU0FBSyxHQUFMLEdBQVcsS0FBSyxHQUFoQjtBQUNBLFNBQUssR0FBTCxHQUFXLEdBQVg7QUFDRDtBQUNELFNBQU8sSUFBUDtBQUNEOztBQUVEOzs7Ozs7OztBQVFBLFNBQVMsSUFBVCxDQUFjLEtBQWQsRUFBb0M7QUFBQSxNQUFmLFNBQWUsdUVBQUgsQ0FBRzs7QUFDbEMsU0FBTyxNQUFNLE1BQU4sQ0FBYSxVQUFDLENBQUQsRUFBSSxDQUFKO0FBQUEsV0FBVSxJQUFJLEVBQUUsU0FBRixDQUFkO0FBQUEsR0FBYixFQUF5QyxDQUF6QyxJQUE4QyxNQUFNLE1BQTNEO0FBQ0Q7O0lBRUssVTtBQUNKOzs7Ozs7Ozs7QUFTQTs7Ozs7OztBQU9BOzs7Ozs7O0FBT0E7Ozs7Ozs7OztBQVNBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUEyQkE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUF5QkEsc0JBQVksZUFBWixFQUEyQztBQUFBLFFBQWQsT0FBYyx1RUFBSixFQUFJO0FBQUE7O0FBQ3pDLFNBQUssZ0JBQUwsR0FBd0IsUUFBUSxnQkFBUixJQUNuQixFQUFFLEtBQUssQ0FBUCxFQUFVLEtBQUssRUFBZixFQURMO0FBRUEsZ0JBQVksS0FBSyxnQkFBakI7O0FBRUEsU0FBSyxvQkFBTCxHQUE0QixRQUFRLG9CQUFSLElBQWdDLEVBQTVEO0FBQ0EsU0FBSyxnQkFBTCxHQUF3QixRQUFRLGdCQUFSLElBQTRCLEtBQXBEO0FBQ0EsU0FBSyxlQUFMLEdBQXVCLFFBQVEsZUFBUixJQUNsQixFQUFFLEtBQUssRUFBUCxFQUFXLEtBQUssRUFBaEIsRUFETDtBQUVBLGdCQUFZLEtBQUssZUFBakI7O0FBRUEsU0FBSyxTQUFMLEdBQWlCLENBQWpCLENBWHlDLENBV3JCO0FBQ3BCLFNBQUssYUFBTCxHQUFxQixDQUFyQixDQVp5QyxDQVlqQjtBQUN4QixTQUFLLE1BQUwsR0FBYyxDQUFkLENBYnlDLENBYXhCOztBQUVqQixTQUFLLGVBQUwsR0FBdUIsQ0FBdkIsQ0FmeUMsQ0FlZjtBQUMxQixTQUFLLFVBQUwsR0FBa0IsRUFBbEIsQ0FoQnlDLENBZ0JuQjtBQUN0QixTQUFLLG1CQUFMLEdBQTJCLENBQTNCLENBakJ5QyxDQWlCWDtBQUM5QixTQUFLLGdCQUFMLEdBQXdCLEtBQUssb0JBQTdCLENBbEJ5QyxDQWtCVTs7QUFFbkQsU0FBSyw0QkFBTCxHQUNJLFFBQVEsNEJBQVIsSUFBd0MsR0FENUM7O0FBR0E7QUFDQTtBQUNBLFNBQUssb0JBQUwsR0FBNEIsUUFBUSxvQkFBUixJQUFnQyxHQUE1RDtBQUNBLFNBQUssa0JBQUwsR0FBMEIsS0FBSyxHQUFMLENBQ3hCLENBRHdCLEVBRXhCLEtBQUssb0JBQUwsSUFDRyxPQUFPLEtBQUssZUFBTCxDQUFxQixHQUFyQixHQUEyQixLQUFLLGVBQUwsQ0FBcUIsR0FBdkQsQ0FESCxDQUZ3QixDQUExQjs7QUFLQSxTQUFLLFlBQUwsR0FBb0IsRUFBcEIsQ0EvQnlDLENBK0JqQjtBQUN4QixTQUFLLHFCQUFMLEdBQTZCLENBQTdCLENBaEN5QyxDQWdDVDs7QUFFaEMsU0FBSyxVQUFMLEdBQWtCLENBQWxCLENBbEN5QyxDQWtDcEI7QUFDckIsU0FBSyxjQUFMLEdBQXNCLENBQXRCO0FBQ0EsU0FBSyxpQkFBTCxHQUF5QixDQUF6QjtBQUNBLFNBQUssaUJBQUwsR0FBeUIsQ0FBekI7O0FBRUE7QUFDQSxTQUFLLG1CQUFMLEdBQTJCLENBQTNCLENBeEN5QyxDQXdDWDtBQUM5QixTQUFLLG1CQUFMLEdBQTJCLENBQTNCLENBekN5QyxDQXlDWDtBQUM5QixTQUFLLGNBQUwsR0FBc0IsQ0FBdEIsQ0ExQ3lDLENBMENoQjs7QUFFekIsU0FBSyxnQkFBTCxDQUFzQixPQUF0QixHQUFnQyxLQUFLLGdCQUFMLENBQXNCLEdBQXREOztBQUVBLFNBQUssZUFBTCxHQUF1QixlQUF2Qjs7QUFFQSxTQUFLLE1BQUwsR0FBYyxLQUFkO0FBQ0EsU0FBSyxpQkFBTCxHQUF5QixDQUF6Qjs7QUFFQSxTQUFLLGdCQUFMLEdBQXdCLFNBQXhCO0FBQ0EsU0FBSywyQkFBTCxHQUFtQyxDQUFuQztBQUNEOztBQUVEOzs7Ozs7Ozs7Ozs7OzhCQVNVLE0sRUFBUTtBQUNoQixVQUFHLFdBQVcsS0FBSyxNQUFuQixFQUEyQjtBQUN6QixhQUFLLE1BQUwsR0FBYyxNQUFkO0FBQ0EsYUFBSyxpQkFBTCxHQUF5QixLQUFLLFlBQUwsRUFBekI7QUFDRDtBQUNELGFBQU8sSUFBUDtBQUNEOztBQUVEOzs7Ozs7Ozs7d0NBTW9CO0FBQ2xCLGFBQU8sS0FBSyxHQUFMLENBQVMsQ0FBVCxFQUFZLEtBQUssWUFBTCxLQUFzQixLQUFLLGlCQUF2QyxDQUFQO0FBQ0Q7O0FBRUQ7Ozs7Ozs7Ozs7Ozt3Q0FTb0IsZ0IsRUFBa0I7QUFDcEMsVUFBRyxxQkFBcUIsS0FBSyxnQkFBN0IsRUFBK0M7QUFDN0MsYUFBSyxnQkFBTCxHQUF3QixnQkFBeEI7QUFDQSxhQUFLLDJCQUFMLEdBQW1DLEtBQUssWUFBTCxFQUFuQztBQUNEO0FBQ0QsYUFBTyxJQUFQO0FBQ0Q7O0FBRUQ7Ozs7Ozs7Ozs7O2tEQVE4QjtBQUM1QixhQUFPLEtBQUssR0FBTCxDQUFTLENBQVQsRUFBWSxLQUFLLFlBQUwsS0FBc0IsS0FBSywyQkFBdkMsQ0FBUDtBQUNEOztBQUVEOzs7Ozs7Ozs7O2lDQU9hLGMsRUFBZ0I7QUFDM0IsVUFBRyxPQUFPLGNBQVAsS0FBMEIsV0FBN0IsRUFBMEM7QUFDeEMsdUJBQWU7QUFDYixrQkFBUSxLQUFLLE1BREE7QUFFYiwwQkFBZ0IsS0FBSyxpQkFBTCxFQUZIO0FBR2Isc0JBQVksS0FBSyxVQUhKO0FBSWIsMEJBQWdCLEtBQUssY0FKUjtBQUtiLHNCQUFZLEtBQUssZ0JBTEo7QUFNYiw4QkFBb0IsS0FBSywyQkFBTCxFQU5QO0FBT2IsNkJBQW1CLEtBQUssZ0JBQUwsQ0FBc0IsT0FQNUI7QUFRYiwwQkFBZ0IsS0FBSyxjQVJSO0FBU2IsNkJBQW1CLEtBQUssaUJBVFg7QUFVYiw2QkFBbUIsS0FBSztBQVZYLFNBQWY7QUFZRDtBQUNGOztBQUVEOzs7Ozs7Ozs7OzsrQkFRVyxZLEVBQWMsYyxFQUFnQjtBQUFBOztBQUN2QyxtQkFBYSxLQUFLLFNBQWxCO0FBQ0EsUUFBRSxLQUFLLE1BQVA7QUFDQSxtQkFBYSxLQUFLLE1BQWxCLEVBQTBCLEtBQUssWUFBTCxFQUExQjs7QUFFQSxXQUFLLFNBQUwsR0FBaUIsV0FBVyxZQUFNO0FBQ2hDO0FBQ0EsY0FBSyxnQkFBTCxDQUFzQixPQUF0QixHQUFnQyxLQUFLLEdBQUwsQ0FBUyxNQUFLLGdCQUFMLENBQXNCLE9BQXRCLEdBQWdDLENBQXpDLEVBQ1MsTUFBSyxnQkFBTCxDQUFzQixHQUQvQixDQUFoQztBQUVBLFlBQUksd0JBQUosRUFBOEIsTUFBSyxnQkFBTCxDQUFzQixPQUFwRDtBQUNBLGNBQUssbUJBQUwsQ0FBeUIsU0FBekI7QUFDQSxjQUFLLFlBQUwsQ0FBa0IsY0FBbEI7QUFDQTtBQUNBLGNBQUssVUFBTCxDQUFnQixZQUFoQixFQUE4QixjQUE5QjtBQUNELE9BVGdCLEVBU2QsS0FBSyxJQUFMLENBQVUsT0FBTyxLQUFLLGdCQUFMLENBQXNCLE9BQXZDLENBVGMsQ0FBakI7QUFVRDs7QUFFRDs7Ozs7Ozs7Ozs7Ozs7MEJBV00sWSxFQUFjLGUsRUFBaUIsYyxFQUFnQjtBQUFBOztBQUNuRCxXQUFLLFNBQUwsQ0FBZSxTQUFmO0FBQ0EsV0FBSyxtQkFBTCxDQUF5QixTQUF6Qjs7QUFFQSxXQUFLLFVBQUwsR0FBa0IsRUFBbEI7QUFDQSxXQUFLLG1CQUFMLEdBQTJCLENBQTNCOztBQUVBLFdBQUssWUFBTCxHQUFvQixFQUFwQjtBQUNBLFdBQUsscUJBQUwsR0FBNkIsQ0FBN0I7O0FBRUEsc0JBQWdCLFVBQUMsTUFBRCxFQUFTLGNBQVQsRUFBeUIsY0FBekIsRUFBeUMsY0FBekMsRUFBNEQ7QUFDMUU7QUFDQSxZQUFJLFdBQVcsT0FBSyxNQUFwQixFQUE0QjtBQUMxQixZQUFFLE9BQUssZUFBUDtBQUNBLHVCQUFhLE9BQUssU0FBbEI7QUFDQSxpQkFBSyxtQkFBTCxDQUF5QixRQUF6QjtBQUNBO0FBQ0EsaUJBQUssZ0JBQUwsQ0FBc0IsT0FBdEIsR0FBZ0MsS0FBSyxHQUFMLENBQVMsT0FBSyxnQkFBTCxDQUFzQixPQUF0QixHQUFnQyxJQUF6QyxFQUNTLE9BQUssZ0JBQUwsQ0FBc0IsR0FEL0IsQ0FBaEM7O0FBR0E7QUFDQSxjQUFNLGlCQUFpQixPQUFLLFlBQUwsRUFBdkI7QUFDQSxjQUFNLGFBQWEsT0FBTyxpQkFBaUIsY0FBeEIsQ0FBbkI7QUFDQSxjQUFNLGFBQWEsT0FBTyxpQkFBaUIsY0FBeEIsQ0FBbkI7QUFDQSxjQUFNLGlCQUFpQixLQUFLLEdBQUwsQ0FBUyxDQUFULEVBQWEsaUJBQWlCLGNBQWxCLElBQ0EsaUJBQWlCLGNBRGpCLENBQVosQ0FBdkI7QUFFQSxjQUFNLGFBQWEsYUFBYSxVQUFoQzs7QUFFQTtBQUNBLGlCQUFLLFVBQUwsQ0FBZ0IsT0FBSyxtQkFBckIsSUFDSSxDQUFDLGNBQUQsRUFBaUIsVUFBakIsRUFBNkIsVUFBN0IsRUFBeUMsVUFBekMsQ0FESjtBQUVBLGlCQUFLLG1CQUFMLEdBQTRCLEVBQUUsT0FBSyxtQkFBUixHQUErQixPQUFLLGdCQUEvRDs7QUFFQTtBQUNBOztBQUVBO0FBQ0EsY0FBSSxPQUFLLGVBQUwsSUFBd0IsT0FBSyxvQkFBN0IsSUFDRyxPQUFLLFVBQUwsQ0FBZ0IsTUFBaEIsSUFBMEIsT0FBSyxnQkFEdEMsRUFDd0Q7QUFDdEQ7QUFDQSxtQkFBSyxTQUFMLEdBQWlCLE9BQUssZUFBTCxDQUFxQixHQUFyQixHQUNiLEtBQUssTUFBTCxNQUFpQixPQUFLLGVBQUwsQ0FBcUIsR0FBckIsR0FBMkIsT0FBSyxlQUFMLENBQXFCLEdBQWpFLENBREo7QUFFQSxtQkFBSyxlQUFMLEdBQXVCLENBQXZCOztBQUVBO0FBQ0EsZ0JBQU0sU0FBUyxPQUFLLFVBQUwsQ0FBZ0IsS0FBaEIsQ0FBc0IsQ0FBdEIsRUFBeUIsSUFBekIsRUFBZjs7QUFFQSxnQkFBTSx1QkFBdUIsT0FBTyxDQUFQLEVBQVUsQ0FBVixDQUE3Qjs7QUFFQTtBQUNBO0FBQ0E7QUFDQSxnQkFBSSxJQUFJLENBQVI7QUFDQSxtQkFBTSxJQUFJLE9BQU8sTUFBWCxJQUFxQixPQUFPLENBQVAsRUFBVSxDQUFWLEtBQWdCLHVCQUF1QixJQUFsRSxFQUF3RTtBQUN0RSxnQkFBRSxDQUFGO0FBQ0Q7QUFDRCxnQkFBSSxLQUFLLEdBQUwsQ0FBUyxDQUFULEVBQVksSUFBSSxDQUFoQixDQUFKO0FBQ0EsZ0JBQU0sU0FBUyxLQUFLLEtBQUwsQ0FBVyxJQUFJLENBQWYsQ0FBZjs7QUFFQSxnQkFBTSxtQkFBbUIsT0FBTyxNQUFQLEVBQWUsQ0FBZixDQUF6QjtBQUNBLGdCQUFNLG1CQUFtQixPQUFPLE1BQVAsRUFBZSxDQUFmLENBQXpCO0FBQ0EsZ0JBQU0sMEJBQTBCLG1CQUFtQixnQkFBbkQ7QUFDQSxnQkFBTSx5QkFBeUIsbUJBQW1CLGdCQUFsRDs7QUFFQSxtQkFBSyxZQUFMLENBQWtCLE9BQUsscUJBQXZCLElBQ0ksQ0FBQyxvQkFBRCxFQUF1QixnQkFBdkIsRUFBeUMsZ0JBQXpDLEVBQ0MsdUJBREQsRUFDMEIsc0JBRDFCLENBREo7QUFHQSxtQkFBSyxxQkFBTCxHQUE4QixFQUFFLE9BQUsscUJBQVIsR0FBaUMsT0FBSyxrQkFBbkU7O0FBRUE7QUFDQTtBQUNBLGdCQUFNLGVBQWUsT0FBTyxLQUFQLENBQWEsS0FBSyxHQUFMLENBQVMsQ0FBVCxFQUFZLFNBQVMsQ0FBckIsQ0FBYixFQUNhLEtBQUssR0FBTCxDQUFTLE9BQU8sTUFBaEIsRUFBd0IsU0FBUyxDQUFqQyxDQURiLENBQXJCO0FBRUEsbUJBQUssVUFBTCxHQUFrQixLQUFLLFlBQUwsRUFBbUIsQ0FBbkIsSUFBd0IsS0FBSyxZQUFMLEVBQW1CLENBQW5CLENBQTFDOztBQUVBLGdCQUFHLE9BQUssTUFBTCxLQUFnQixTQUFoQixJQUNJLE9BQUssTUFBTCxLQUFnQixVQUFoQixJQUNHLE9BQUssaUJBQUwsS0FBMkIsT0FBSyw0QkFGMUMsRUFFMEU7QUFDeEU7QUFDQSxxQkFBSyxtQkFBTCxHQUEyQixPQUFLLFVBQWhDO0FBQ0EscUJBQUssbUJBQUwsR0FBMkIsQ0FBM0I7QUFDQSxxQkFBSyxjQUFMLEdBQXNCLENBQXRCO0FBQ0EscUJBQUssU0FBTCxDQUFlLFVBQWY7QUFDQSxrQkFBSSw4QkFBSixFQUNNLE9BQUssbUJBRFgsRUFDZ0MsT0FBSyxjQURyQyxFQUVNLGdCQUZOLEVBRXdCLE9BQUssbUJBRjdCLEVBR00sT0FBSyxXQUFMLENBQWlCLGdCQUFqQixDQUhOO0FBSUQ7O0FBRUQsZ0JBQUksT0FBSyxNQUFMLEtBQWdCLFVBQWhCLElBQ0csT0FBSyxpQkFBTCxNQUE0QixPQUFLLDRCQURyQyxJQUVHLE9BQUssTUFBTCxLQUFnQixNQUZ0QixFQUU4QjtBQUM1QjtBQUNBLGtCQUFNLGdCQUFnQixLQUFLLE9BQUssWUFBVixFQUF3QixDQUF4QixDQUF0QjtBQUNBLGtCQUFNLGdCQUFnQixLQUFLLE9BQUssWUFBVixFQUF3QixDQUF4QixDQUF0QjtBQUNBLGtCQUFNLHVCQUF1QixLQUFLLE9BQUssWUFBVixFQUF3QixDQUF4QixDQUE3QjtBQUNBLGtCQUFNLHNCQUFzQixLQUFLLE9BQUssWUFBVixFQUF3QixDQUF4QixDQUE1Qjs7QUFFQSxrQkFBTSxhQUFhLHNCQUFzQixnQkFBZ0IsYUFBekQ7QUFDQSxrQkFBTSxXQUFXLHVCQUF1QixnQkFBZ0IsYUFBeEQ7QUFDQSxrQkFBRyxXQUFXLENBQWQsRUFBaUI7QUFDZjtBQUNBLHVCQUFLLGNBQUwsR0FBc0IsYUFBYSxRQUFuQztBQUNBLHVCQUFLLG1CQUFMLEdBQTJCLGFBQTNCO0FBQ0EsdUJBQUssbUJBQUwsR0FBMkIsYUFBM0I7O0FBRUE7QUFDQSxvQkFBRyxPQUFLLGNBQUwsR0FBc0IsTUFBdEIsSUFBZ0MsT0FBSyxjQUFMLEdBQXNCLE1BQXpELEVBQWlFO0FBQy9ELHlCQUFLLFNBQUwsQ0FBZSxNQUFmO0FBQ0QsaUJBRkQsTUFFTztBQUNMLHNCQUFJLHVEQUFKLEVBQ00sT0FBSyxjQURYO0FBRUE7QUFDQSx5QkFBSyxtQkFBTCxHQUEyQixPQUFLLFVBQWhDLENBSkssQ0FJdUM7QUFDNUMseUJBQUssbUJBQUwsR0FBMkIsQ0FBM0I7QUFDQSx5QkFBSyxjQUFMLEdBQXNCLENBQXRCO0FBQ0EseUJBQUssU0FBTCxDQUFlLFVBQWY7O0FBRUEseUJBQUssWUFBTCxDQUFrQixDQUFsQixJQUNJLENBQUMsb0JBQUQsRUFBdUIsZ0JBQXZCLEVBQXlDLGdCQUF6QyxFQUNDLHVCQURELEVBQzBCLHNCQUQxQixDQURKO0FBR0EseUJBQUssWUFBTCxDQUFrQixNQUFsQixHQUEyQixDQUEzQjtBQUNBLHlCQUFLLHFCQUFMLEdBQTZCLENBQTdCO0FBQ0Q7QUFDRjs7QUFFRCxrQkFBSSw4QkFBSixFQUNNLE9BQUssbUJBRFgsRUFDZ0MsT0FBSyxjQURyQyxFQUVNLGdCQUZOLEVBRXdCLE9BQUssbUJBRjdCLEVBR00sT0FBSyxXQUFMLENBQWlCLGdCQUFqQixDQUhOO0FBSUQ7O0FBRUQsbUJBQUssY0FBTCxHQUFzQixLQUFLLE1BQUwsRUFBYSxDQUFiLENBQXRCO0FBQ0EsbUJBQUssaUJBQUwsR0FBeUIsT0FBTyxDQUFQLEVBQVUsQ0FBVixDQUF6QjtBQUNBLG1CQUFLLGlCQUFMLEdBQXlCLE9BQU8sT0FBTyxNQUFQLEdBQWdCLENBQXZCLEVBQTBCLENBQTFCLENBQXpCOztBQUVBLG1CQUFLLFlBQUwsQ0FBa0IsY0FBbEI7QUFDRCxXQXBHRCxNQW9HTztBQUNMO0FBQ0EsbUJBQUssU0FBTCxHQUFpQixPQUFLLGdCQUF0QjtBQUNEOztBQUVELGlCQUFLLFNBQUwsR0FBaUIsV0FBVyxZQUFNO0FBQ2hDLG1CQUFLLFVBQUwsQ0FBZ0IsWUFBaEIsRUFBOEIsY0FBOUI7QUFDRCxXQUZnQixFQUVkLEtBQUssSUFBTCxDQUFVLE9BQU8sT0FBSyxTQUF0QixDQUZjLENBQWpCO0FBR0QsU0F2SXlFLENBdUl2RTtBQUNKLE9BeElELEVBVm1ELENBa0ovQzs7QUFFSixXQUFLLFVBQUwsQ0FBZ0IsWUFBaEIsRUFBOEIsY0FBOUI7QUFDRDs7QUFFRDs7Ozs7Ozs7OztpQ0FPYSxRLEVBQVU7QUFDckIsVUFBSSxPQUFPLFFBQVAsS0FBb0IsV0FBeEIsRUFBcUM7QUFDbkM7QUFDQSxlQUFPLEtBQUssbUJBQUwsR0FDSCxDQUFDLFdBQVcsS0FBSyxtQkFBakIsSUFBd0MsS0FBSyxjQURqRDtBQUVELE9BSkQsTUFJTztBQUNMO0FBQ0EsZUFBTyxLQUFLLGVBQUwsRUFBUDtBQUNEO0FBQ0Y7O0FBRUQ7Ozs7Ozs7Ozs7a0NBTzZDO0FBQUEsVUFBakMsU0FBaUMsdUVBQXJCLEtBQUssWUFBTCxFQUFxQjs7QUFDM0M7QUFDQSxhQUFPLEtBQUssbUJBQUwsR0FDSCxLQUFLLGNBQUwsSUFBdUIsWUFBWSxLQUFLLG1CQUF4QyxDQURKO0FBRUQ7Ozs7O2tCQUdZLFU7OztBQzFkZjs7QUNBQTs7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0xBO0FBQ0E7QUFDQTs7QUNGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUkE7QUFDQTtBQUNBO0FBQ0E7O0FDSEE7QUFDQTtBQUNBO0FBQ0E7O0FDSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1pBO0FBQ0E7QUFDQTtBQUNBOzs7QUNIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUN6TEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24oKXtmdW5jdGlvbiByKGUsbix0KXtmdW5jdGlvbiBvKGksZil7aWYoIW5baV0pe2lmKCFlW2ldKXt2YXIgYz1cImZ1bmN0aW9uXCI9PXR5cGVvZiByZXF1aXJlJiZyZXF1aXJlO2lmKCFmJiZjKXJldHVybiBjKGksITApO2lmKHUpcmV0dXJuIHUoaSwhMCk7dmFyIGE9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitpK1wiJ1wiKTt0aHJvdyBhLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsYX12YXIgcD1uW2ldPXtleHBvcnRzOnt9fTtlW2ldWzBdLmNhbGwocC5leHBvcnRzLGZ1bmN0aW9uKHIpe3ZhciBuPWVbaV1bMV1bcl07cmV0dXJuIG8obnx8cil9LHAscC5leHBvcnRzLHIsZSxuLHQpfXJldHVybiBuW2ldLmV4cG9ydHN9Zm9yKHZhciB1PVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmUsaT0wO2k8dC5sZW5ndGg7aSsrKW8odFtpXSk7cmV0dXJuIG99cmV0dXJuIHJ9KSgpIiwiaW1wb3J0IFN5bmNDbGllbnQgZnJvbSAnQGlyY2FtL3N5bmMvY2xpZW50JztcblxuY29uc3QgZ2V0VGltZUZ1bmN0aW9uID0gKCkgPT4ge1xuICByZXR1cm4gcGVyZm9ybWFuY2Uubm93KCkgLyAxMDAwO1xufVxuXG5mdW5jdGlvbiBpbml0KCkge1xuICBjb25zdCB1cmwgPSB3aW5kb3cubG9jYXRpb24ub3JpZ2luLnJlcGxhY2UoJ2h0dHAnLCAnd3MnKTtcblxuICAvLyBpbml0IHNvY2tldCBjbGllbnRcbiAgY29uc3Qgc29ja2V0ID0gbmV3IFdlYlNvY2tldCh1cmwpO1xuICBzb2NrZXQuYmluYXJ5VHlwZSA9ICdhcnJheWJ1ZmZlcic7XG4gIC8vIGluaXQgc3luYyBjbGllbnRcbiAgY29uc3Qgc3luY0NsaWVudCA9IG5ldyBTeW5jQ2xpZW50KGdldFRpbWVGdW5jdGlvbik7XG5cbiAgY29uc3QgJHN5bmNUaW1lID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI3N5bmMtdGltZScpO1xuICBzZXRJbnRlcnZhbCgoKSA9PiB7XG4gICAgY29uc3Qgc3luY1RpbWUgPSBzeW5jQ2xpZW50LmdldFN5bmNUaW1lKCk7XG4gICAgJHN5bmNUaW1lLmlubmVySFRNTCA9IHN5bmNUaW1lO1xuICB9LCAxMDApO1xuXG4gIHNvY2tldC5hZGRFdmVudExpc3RlbmVyKCdvcGVuJywgKCkgPT4ge1xuXG4gICAgY29uc3Qgc2VuZEZ1bmN0aW9uID0gKHBpbmdJZCwgY2xpZW50UGluZ1RpbWUpID0+IHtcbiAgICAgIGNvbnN0IHJlcXVlc3QgPSBuZXcgRmxvYXQ2NEFycmF5KDMpO1xuICAgICAgcmVxdWVzdFswXSA9IDA7IC8vIHRoaXMgaXMgYSBwaW5nXG4gICAgICByZXF1ZXN0WzFdID0gcGluZ0lkO1xuICAgICAgcmVxdWVzdFsyXSA9IGNsaWVudFBpbmdUaW1lO1xuXG4gICAgICBjb25zb2xlLmxvZyhgW3BpbmddIC0gaWQ6ICVzLCBwaW5nVGltZTogJXNgLCByZXF1ZXN0WzFdLCByZXF1ZXN0WzJdKTtcblxuICAgICAgc29ja2V0LnNlbmQocmVxdWVzdC5idWZmZXIpO1xuICAgIH07XG5cbiAgICBjb25zdCByZWNlaXZlRnVuY3Rpb24gPSBjYWxsYmFjayA9PiB7XG4gICAgICBzb2NrZXQuYWRkRXZlbnRMaXN0ZW5lcignbWVzc2FnZScsIGUgPT4ge1xuICAgICAgICBjb25zdCByZXNwb25zZSA9IG5ldyBGbG9hdDY0QXJyYXkoZS5kYXRhKTtcblxuICAgICAgICBpZiAocmVzcG9uc2VbMF0gPT09IDEpIHsgLy8gdGhpcyBpcyBhIHBvbmdcbiAgICAgICAgICBjb25zdCBwaW5nSWQgPSByZXNwb25zZVsxXTtcbiAgICAgICAgICBjb25zdCBjbGllbnRQaW5nVGltZSA9IHJlc3BvbnNlWzJdO1xuICAgICAgICAgIGNvbnN0IHNlcnZlclBpbmdUaW1lID0gcmVzcG9uc2VbM107XG4gICAgICAgICAgY29uc3Qgc2VydmVyUG9uZ1RpbWUgPSByZXNwb25zZVs0XTtcblxuICAgICAgICAgIGNvbnNvbGUubG9nKGBbcG9uZ10gLSBpZDogJXMsIGNsaWVudFBpbmdUaW1lOiAlcywgc2VydmVyUGluZ1RpbWU6ICVzLCBzZXJ2ZXJQb25nVGltZTogJXNgLFxuICAgICAgICAgICAgcGluZ0lkLCBjbGllbnRQaW5nVGltZSwgc2VydmVyUGluZ1RpbWUsIHNlcnZlclBvbmdUaW1lKTtcblxuICAgICAgICAgIGNhbGxiYWNrKHBpbmdJZCwgY2xpZW50UGluZ1RpbWUsIHNlcnZlclBpbmdUaW1lLCBzZXJ2ZXJQb25nVGltZSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGNvbnN0ICRzdGF0dXNDb250YWluZXIgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjc3RhdHVzJyk7XG4gICAgY29uc3Qgc3RhdHVzRnVuY3Rpb24gPSBzdGF0dXMgPT4ge1xuICAgICAgJHN0YXR1c0NvbnRhaW5lci5pbm5lckhUTUwgPSBKU09OLnN0cmluZ2lmeShzdGF0dXMsIG51bGwsIDIpO1xuICAgICAgY29uc29sZS5sb2coc3RhdHVzKTtcbiAgICB9O1xuXG4gICAgc3luY0NsaWVudC5zdGFydChzZW5kRnVuY3Rpb24sIHJlY2VpdmVGdW5jdGlvbiwgc3RhdHVzRnVuY3Rpb24pO1xuICB9KTtcblxuICBzb2NrZXQuYWRkRXZlbnRMaXN0ZW5lcignZXJyb3InLCBlcnIgPT4gY29uc29sZS5lcnJvcihlcnIuc3RhY2spKTtcbiAgc29ja2V0LmFkZEV2ZW50TGlzdGVuZXIoJ2Nsb3NlJywgKCkgPT4gY29uc29sZS5sb2coJ3NvY2tldCBjbG9zZWQnKSk7XG59XG5cbndpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdsb2FkJywgaW5pdCk7XG4iLCJpbXBvcnQgZGVidWcgZnJvbSAnZGVidWcnO1xuY29uc3QgbG9nID0gZGVidWcoJ3N5bmMnKTtcblxuLy8vLy8vIGhlbHBlcnNcblxuLyoqXG4gKiBPcmRlciBtaW4gYW5kIG1heCBhdHRyaWJ1dGVzLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge09iamVjdH0gdGhhdCB3aXRoIG1pbiBhbmQgbWF4IGF0dHJpYnV0ZXNcbiAqIEByZXR1cm5zIHtPYmplY3R9IHdpdGggbWluIGFuZCBtYW4gYXR0cmlidXRlcywgc3dhcHBlZCBpZiB0aGF0Lm1pbiA+IHRoYXQubWF4XG4gKi9cbmZ1bmN0aW9uIG9yZGVyTWluTWF4KHRoYXQpIHtcbiAgaWYodHlwZW9mIHRoYXQgIT09ICd1bmRlZmluZWQnXG4gICAgICYmIHR5cGVvZiB0aGF0Lm1pbiAhPT0gJ3VuZGVmaW5lZCcgJiYgdHlwZW9mIHRoYXQubWF4ICE9PSAndW5kZWZpbmVkJ1xuICAgICAmJiB0aGF0Lm1pbiA+IHRoYXQubWF4KSB7XG4gICAgY29uc3QgdG1wID0gdGhhdC5taW47XG4gICAgdGhhdC5taW4gPSB0aGF0Lm1heDtcbiAgICB0aGF0Lm1heCA9IHRtcDtcbiAgfVxuICByZXR1cm4gdGhhdDtcbn1cblxuLyoqXG4gKiBNZWFuIG92ZXIgYW4gYXJyYXksIHNlbGVjdGluZyBvbmUgZGltZW5zaW9uIG9mIHRoZSBhcnJheSB2YWx1ZXMuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7QXJyYXkuPEFycmF5LjxOdW1iZXI+Pn0gYXJyYXlcbiAqIEBwYXJhbSB7TnVtYmVyfSBbZGltZW5zaW9uPTBdXG4gKiBAcmV0dXJucyB7TnVtYmVyfSBtZWFuXG4gKi9cbmZ1bmN0aW9uIG1lYW4oYXJyYXksIGRpbWVuc2lvbiA9IDApIHtcbiAgcmV0dXJuIGFycmF5LnJlZHVjZSgocCwgcSkgPT4gcCArIHFbZGltZW5zaW9uXSwgMCkgLyBhcnJheS5sZW5ndGg7XG59XG5cbmNsYXNzIFN5bmNDbGllbnQge1xuICAvKipcbiAgICogQGNhbGxiYWNrIFN5bmNDbGllbnR+Z2V0VGltZUZ1bmN0aW9uXG4gICAqIEByZXR1cm4ge051bWJlcn0gbW9ub3RvbmljLCBldmVyIGluY3JlYXNpbmcsIHRpbWUgaW4gc2Vjb25kLiBXaGVuIHBvc3NpYmxlXG4gICAqICB0aGUgc2VydmVyIGNvZGUgc2hvdWxkIGRlZmluZSBpdHMgb3duIG9yaWdpbiAoaS5lLiBgdGltZT0wYCkgaW4gb3JkZXIgdG9cbiAgICogIG1heGltaXplIHRoZSByZXNvbHV0aW9uIG9mIHRoZSBjbG9jayBmb3IgYSBsb25nIHBlcmlvZCBvZiB0aW1lLiBXaGVuXG4gICAqICBgU3luY1NlcnZlcn5zdGFydGAgaXMgY2FsbGVkIHRoZSBjbG9jayBzaG91bGQgYmUgcnVubmluZ1xuICAgKiAgKGNmLiBgYXVkaW9Db250ZXh0LmN1cnJlbnRUaW1lYCB0aGF0IG5lZWRzIHVzZXIgaW50ZXJhY3Rpb24gdG8gc3RhcnQpXG4gICAqKi9cblxuICAvKipcbiAgICogQGNhbGxiYWNrIFN5bmNDbGllbnR+c2VuZEZ1bmN0aW9uXG4gICAqIEBzZWUge0BsaW5rY29kZSBTeW5jU2VydmVyfnJlY2VpdmVGdW5jdGlvbn1cbiAgICogQHBhcmFtIHtOdW1iZXJ9IHBpbmdJZCB1bmlxdWUgaWRlbnRpZmllclxuICAgKiBAcGFyYW0ge051bWJlcn0gY2xpZW50UGluZ1RpbWUgdGltZS1zdGFtcCBvZiBwaW5nIGVtaXNzaW9uXG4gICAqKi9cblxuICAvKipcbiAgICogQGNhbGxiYWNrIFN5bmNDbGllbnR+cmVjZWl2ZUZ1bmN0aW9uXG4gICAqIEBzZWUge0BsaW5rY29kZSBTeW5jU2VydmVyfnNlbmRGdW5jdGlvbn1cbiAgICogQHBhcmFtIHtTeW5jQ2xpZW50fnJlY2VpdmVDYWxsYmFja30gcmVjZWl2ZUNhbGxiYWNrIGNhbGxlZCBvblxuICAgKiBlYWNoIG1lc3NhZ2UgbWF0Y2hpbmcgbWVzc2FnZVR5cGUuXG4gICAqKi9cblxuICAvKipcbiAgICogQGNhbGxiYWNrIFN5bmNDbGllbnR+cmVjZWl2ZUNhbGxiYWNrXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBwaW5nSWQgdW5pcXVlIGlkZW50aWZpZXJcbiAgICogQHBhcmFtIHtOdW1iZXJ9IGNsaWVudFBpbmdUaW1lIHRpbWUtc3RhbXAgb2YgcGluZyBlbWlzc2lvblxuICAgKiBAcGFyYW0ge051bWJlcn0gc2VydmVyUGluZ1RpbWUgdGltZS1zdGFtcCBvZiBwaW5nIHJlY2VwdGlvblxuICAgKiBAcGFyYW0ge051bWJlcn0gc2VydmVyUG9uZ1RpbWUgdGltZS1zdGFtcCBvZiBwb25nIGVtaXNzaW9uXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBjbGllbnRQb25nVGltZSB0aW1lLXN0YW1wIG9mIHBvbmcgcmVjZXB0aW9uXG4gICAqKi9cblxuICAvKipcbiAgICogQGNhbGxiYWNrIFN5bmNDbGllbnR+cmVwb3J0RnVuY3Rpb25cbiAgICogQHBhcmFtIHtPYmplY3R9IHJlcG9ydFxuICAgKiBAcGFyYW0ge1N0cmluZ30gcmVwb3J0LnN0YXR1cyBgbmV3YCwgYHN0YXJ0dXBgLFxuICAgKiBgdHJhaW5pbmdgIChvZmZzZXQgYWRhcHRhdGlvbiksIG9yIGBzeW5jYCAob2Zmc2V0IGFuZCByYXRpbyBhZGFwdGF0aW9uKS5cbiAgICogQHBhcmFtIHtOdW1iZXJ9IHJlcG9ydC5zdGF0dXNEdXJhdGlvbiBkdXJhdGlvbiBzaW5jZSBsYXN0IHN0YXR1c1xuICAgKiBjaGFuZ2UuXG4gICAqIEBwYXJhbSB7TnVtYmVyfSByZXBvcnQudGltZU9mZnNldCB0aW1lIGRpZmZlcmVuY2UgYmV0d2VlbiBsb2NhbFxuICAgKiB0aW1lIGFuZCBzeW5jIHRpbWUsIGluIHNlY29uZHMuXG4gICAqIEBwYXJhbSB7TnVtYmVyfSByZXBvcnQuZnJlcXVlbmN5UmF0aW8gdGltZSByYXRpbyBiZXR3ZWVuIGxvY2FsXG4gICAqIHRpbWUgYW5kIHN5bmMgdGltZS5cbiAgICogQHBhcmFtIHtTdHJpbmd9IHJlcG9ydC5jb25uZWN0aW9uIGBvZmZsaW5lYCBvciBgb25saW5lYFxuICAgKiBAcGFyYW0ge051bWJlcn0gcmVwb3J0LmNvbm5lY3Rpb25EdXJhdGlvbiBkdXJhdGlvbiBzaW5jZSBsYXN0IGNvbm5lY3Rpb25cbiAgICogY2hhbmdlLlxuICAgKiBAcGFyYW0ge051bWJlcn0gcmVwb3J0LmNvbm5lY3Rpb25UaW1lT3V0IGR1cmF0aW9uLCBpbiBzZWNvbmRzLCBiZWZvcmVcbiAgICogYSB0aW1lLW91dCBvY2N1cnMuXG4gICAqIEBwYXJhbSB7TnVtYmVyfSByZXBvcnQudHJhdmVsRHVyYXRpb24gZHVyYXRpb24gb2YgYVxuICAgKiBwaW5nLXBvbmcgcm91bmQtdHJpcCwgaW4gc2Vjb25kcywgbWVhbiBvdmVyIHRoZSB0aGUgbGFzdFxuICAgKiBwaW5nLXBvbmcgc2VyaWVzLlxuICAgKiBAcGFyYW0ge051bWJlcn0gcmVwb3J0LnRyYXZlbER1cmF0aW9uTWluIGR1cmF0aW9uIG9mIGFcbiAgICogcGluZy1wb25nIHJvdW5kLXRyaXAsIGluIHNlY29uZHMsIG1pbmltdW0gb3ZlciB0aGUgdGhlIGxhc3RcbiAgICogcGluZy1wb25nIHNlcmllcy5cbiAgICogQHBhcmFtIHtOdW1iZXJ9IHJlcG9ydC50cmF2ZWxEdXJhdGlvbk1heCBkdXJhdGlvbiBvZiBhXG4gICAqIHBpbmctcG9uZyByb3VuZC10cmlwLCBpbiBzZWNvbmRzLCBtYXhpbXVtIG92ZXIgdGhlIHRoZSBsYXN0XG4gICAqIHBpbmctcG9uZyBzZXJpZXMuXG4gICAqKi9cblxuICAvKipcbiAgICogVGhpcyBpcyB0aGUgY29uc3RydWN0b3IuIFNlZSB7QGxpbmtjb2RlIFN5bmNDbGllbnR+c3RhcnR9IG1ldGhvZCB0b1xuICAgKiBhY3R1YWxseSBzdGFydCBhIHN5bmNocm9uaXNhdGlvbiBwcm9jZXNzLlxuICAgKlxuICAgKiBAY29uc3RydWN0cyBTeW5jQ2xpZW50XG4gICAqIEBwYXJhbSB7U3luY0NsaWVudH5nZXRUaW1lRnVuY3Rpb259IGdldFRpbWVGdW5jdGlvblxuICAgKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9ucy5waW5nVGltZU91dERlbGF5XSByYW5nZSBvZiBkdXJhdGlvbiAoaW4gc2Vjb25kcykgdG9cbiAgICogY29uc2lkZXIgYSBwaW5nIHdhcyBub3QgcG9uZ2VkIGJhY2tcbiAgICogQHBhcmFtIHtOdW1iZXJ9IFtvcHRpb25zLnBpbmdUaW1lT3V0RGVsYXkubWluPTFdIG1pbiBhbmQgbWF4IG11c3QgYmUgc2V0IHRvZ2V0aGVyXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBbb3B0aW9ucy5waW5nVGltZU91dERlbGF5Lm1heD0zMF0gbWluIGFuZCBtYXggbXVzdCBiZSBzZXQgdG9nZXRoZXJcbiAgICogQHBhcmFtIHtOdW1iZXJ9IFtvcHRpb25zLnBpbmdTZXJpZXNJdGVyYXRpb25zPTEwXSBudW1iZXIgb2YgcGluZy1wb25ncyBpbiBhXG4gICAqIHNlcmllc1xuICAgKiBAcGFyYW0ge051bWJlcn0gW29wdGlvbnMucGluZ1Nlcmllc1BlcmlvZD0wLjI1MF0gaW50ZXJ2YWwgKGluIHNlY29uZHMpIGJldHdlZW4gcGluZ3NcbiAgICogaW4gYSBzZXJpZXNcbiAgICogQHBhcmFtIHtOdW1iZXJ9IFtvcHRpb25zLnBpbmdTZXJpZXNEZWxheV0gcmFuZ2Ugb2YgaW50ZXJ2YWwgKGluXG4gICAqIHNlY29uZHMpIGJldHdlZW4gcGluZy1wb25nIHNlcmllc1xuICAgKiBAcGFyYW0ge051bWJlcn0gW29wdGlvbnMucGluZ1Nlcmllc0RlbGF5Lm1pbj0xMF0gbWluIGFuZCBtYXggbXVzdCBiZSBzZXQgdG9nZXRoZXJcbiAgICogQHBhcmFtIHtOdW1iZXJ9IFtvcHRpb25zLnBpbmdTZXJpZXNEZWxheS5tYXg9MjBdIG1pbiBhbmQgbWF4IG11c3QgYmUgc2V0IHRvZ2V0aGVyXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBbb3B0aW9ucy5sb25nVGVybURhdGFUcmFpbmluZ0R1cmF0aW9uPTEyMF0gZHVyYXRpb24gb2ZcbiAgICogdHJhaW5pbmcsIGluIHNlY29uZHMsIGFwcHJveGltYXRlbHksIGJlZm9yZSB1c2luZyB0aGUgZXN0aW1hdGUgb2ZcbiAgICogY2xvY2sgZnJlcXVlbmN5XG4gICAqIEBwYXJhbSB7TnVtYmVyfSBbb3B0aW9ucy5sb25nVGVybURhdGFEdXJhdGlvbj05MDBdIGVzdGltYXRlIHN5bmNocm9uaXNhdGlvbiBvdmVyXG4gICAqICB0aGlzIGR1cmF0aW9uLCBpbiBzZWNvbmRzLCBhcHByb3hpbWF0ZWx5XG4gICAqL1xuICBjb25zdHJ1Y3RvcihnZXRUaW1lRnVuY3Rpb24sIG9wdGlvbnMgPSB7fSkge1xuICAgIHRoaXMucGluZ1RpbWVvdXREZWxheSA9IG9wdGlvbnMucGluZ1RpbWVvdXREZWxheVxuICAgICAgfHwgeyBtaW46IDEsIG1heDogMzAgfTtcbiAgICBvcmRlck1pbk1heCh0aGlzLnBpbmdUaW1lb3V0RGVsYXkpO1xuXG4gICAgdGhpcy5waW5nU2VyaWVzSXRlcmF0aW9ucyA9IG9wdGlvbnMucGluZ1Nlcmllc0l0ZXJhdGlvbnMgfHwgMTA7XG4gICAgdGhpcy5waW5nU2VyaWVzUGVyaW9kID0gb3B0aW9ucy5waW5nU2VyaWVzUGVyaW9kIHx8IDAuMjUwO1xuICAgIHRoaXMucGluZ1Nlcmllc0RlbGF5ID0gb3B0aW9ucy5waW5nU2VyaWVzRGVsYXlcbiAgICAgIHx8IHsgbWluOiAxMCwgbWF4OiAyMCB9O1xuICAgIG9yZGVyTWluTWF4KHRoaXMucGluZ1Nlcmllc0RlbGF5KTtcblxuICAgIHRoaXMucGluZ0RlbGF5ID0gMDsgLy8gY3VycmVudCBkZWxheSBiZWZvcmUgbmV4dCBwaW5nXG4gICAgdGhpcy5waW5nVGltZW91dElkID0gMDsgLy8gdG8gY2FuY2VsIHRpbWVvdXQgb24gc3luY19waW5jXG4gICAgdGhpcy5waW5nSWQgPSAwOyAvLyBhYnNvbHV0ZSBJRCB0byBtYWNoIHBvbmcgYWdhaW5zdFxuXG4gICAgdGhpcy5waW5nU2VyaWVzQ291bnQgPSAwOyAvLyBlbGFwc2VkIHBpbmdzIGluIGEgc2VyaWVzXG4gICAgdGhpcy5zZXJpZXNEYXRhID0gW107IC8vIGNpcmN1bGFyIGJ1ZmZlclxuICAgIHRoaXMuc2VyaWVzRGF0YU5leHRJbmRleCA9IDA7IC8vIG5leHQgaW5kZXggdG8gd3JpdGUgaW4gY2lyY3VsYXIgYnVmZmVyXG4gICAgdGhpcy5zZXJpZXNEYXRhTGVuZ3RoID0gdGhpcy5waW5nU2VyaWVzSXRlcmF0aW9uczsgLy8gc2l6ZSBvZiBjaXJjdWxhciBidWZmZXJcblxuICAgIHRoaXMubG9uZ1Rlcm1EYXRhVHJhaW5pbmdEdXJhdGlvblxuICAgICAgPSBvcHRpb25zLmxvbmdUZXJtRGF0YVRyYWluaW5nRHVyYXRpb24gfHwgMTIwO1xuXG4gICAgLy8gdXNlIGEgZml4ZWQtc2l6ZSBjaXJjdWxhciBidWZmZXIsIGV2ZW4gaWYgaXQgZG9lcyBub3QgbWF0Y2hcbiAgICAvLyBleGFjdGx5IHRoZSByZXF1aXJlZCBkdXJhdGlvblxuICAgIHRoaXMubG9uZ1Rlcm1EYXRhRHVyYXRpb24gPSBvcHRpb25zLmxvbmdUZXJtRGF0YUR1cmF0aW9uIHx8IDkwMDtcbiAgICB0aGlzLmxvbmdUZXJtRGF0YUxlbmd0aCA9IE1hdGgubWF4KFxuICAgICAgMixcbiAgICAgIHRoaXMubG9uZ1Rlcm1EYXRhRHVyYXRpb24gL1xuICAgICAgICAoMC41ICogKHRoaXMucGluZ1Nlcmllc0RlbGF5Lm1pbiArIHRoaXMucGluZ1Nlcmllc0RlbGF5Lm1heCkgKSApO1xuXG4gICAgdGhpcy5sb25nVGVybURhdGEgPSBbXTsgLy8gY2lyY3VsYXIgYnVmZmVyXG4gICAgdGhpcy5sb25nVGVybURhdGFOZXh0SW5kZXggPSAwOyAvLyBuZXh0IGluZGV4IHRvIHdyaXRlIGluIGNpcmN1bGFyIGJ1ZmZlclxuXG4gICAgdGhpcy50aW1lT2Zmc2V0ID0gMDsgLy8gbWVhbiBvZiAoc2VydmVyVGltZSAtIGNsaWVudFRpbWUpIGluIHRoZSBsYXN0IHNlcmllc1xuICAgIHRoaXMudHJhdmVsRHVyYXRpb24gPSAwO1xuICAgIHRoaXMudHJhdmVsRHVyYXRpb25NaW4gPSAwO1xuICAgIHRoaXMudHJhdmVsRHVyYXRpb25NYXggPSAwO1xuXG4gICAgLy8gVCh0KSA9IFQwICsgUiAqICh0IC0gdDApXG4gICAgdGhpcy5zZXJ2ZXJUaW1lUmVmZXJlbmNlID0gMDsgLy8gVDBcbiAgICB0aGlzLmNsaWVudFRpbWVSZWZlcmVuY2UgPSAwOyAvLyB0MFxuICAgIHRoaXMuZnJlcXVlbmN5UmF0aW8gPSAxOyAvLyBSXG5cbiAgICB0aGlzLnBpbmdUaW1lb3V0RGVsYXkuY3VycmVudCA9IHRoaXMucGluZ1RpbWVvdXREZWxheS5taW47XG5cbiAgICB0aGlzLmdldFRpbWVGdW5jdGlvbiA9IGdldFRpbWVGdW5jdGlvbjtcblxuICAgIHRoaXMuc3RhdHVzID0gJ25ldyc7XG4gICAgdGhpcy5zdGF0dXNDaGFuZ2VkVGltZSA9IDA7XG5cbiAgICB0aGlzLmNvbm5lY3Rpb25TdGF0dXMgPSAnb2ZmbGluZSc7XG4gICAgdGhpcy5jb25uZWN0aW9uU3RhdHVzQ2hhbmdlZFRpbWUgPSAwO1xuICB9XG5cbiAgLyoqXG4gICAqIFNldCBzdGF0dXMsIGFuZCBzZXQgdGhpcy5zdGF0dXNDaGFuZ2VkVGltZSwgdG8gbGF0ZXJcbiAgICogdXNlIHNlZSB7QGxpbmtjb2RlIFN5bmNDbGllbnR+Z2V0U3RhdHVzRHVyYXRpb259XG4gICAqIGFuZCB7QGxpbmtjb2RlIFN5bmNDbGllbnR+cmVwb3J0U3RhdHVzfS5cbiAgICpcbiAgICogQGZ1bmN0aW9uIFN5bmNDbGllbnR+c2V0U3RhdHVzXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBzdGF0dXNcbiAgICogQHJldHVybnMge09iamVjdH0gdGhpc1xuICAgKi9cbiAgc2V0U3RhdHVzKHN0YXR1cykge1xuICAgIGlmKHN0YXR1cyAhPT0gdGhpcy5zdGF0dXMpIHtcbiAgICAgIHRoaXMuc3RhdHVzID0gc3RhdHVzO1xuICAgICAgdGhpcy5zdGF0dXNDaGFuZ2VkVGltZSA9IHRoaXMuZ2V0TG9jYWxUaW1lKCk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCB0aW1lIHNpbmNlIGxhc3Qgc3RhdHVzIGNoYW5nZS4gU2VlIHtAbGlua2NvZGUgU3luY0NsaWVudH5zZXRTdGF0dXN9XG4gICAqXG4gICAqIEBmdW5jdGlvbiBTeW5jQ2xpZW50fmdldFN0YXR1c0R1cmF0aW9uXG4gICAqIEByZXR1cm5zIHtOdW1iZXJ9IHRpbWUsIGluIHNlY29uZHMsIHNpbmNlIGxhc3Qgc3RhdHVzIGNoYW5nZS5cbiAgICovXG4gIGdldFN0YXR1c0R1cmF0aW9uKCkge1xuICAgIHJldHVybiBNYXRoLm1heCgwLCB0aGlzLmdldExvY2FsVGltZSgpIC0gdGhpcy5zdGF0dXNDaGFuZ2VkVGltZSk7XG4gIH1cblxuICAvKipcbiAgICogU2V0IGNvbm5lY3Rpb25TdGF0dXMsIGFuZCBzZXQgdGhpcy5jb25uZWN0aW9uU3RhdHVzQ2hhbmdlZFRpbWUsXG4gICAqIHRvIGxhdGVyIHVzZSBzZWUge0BsaW5rY29kZSBTeW5jQ2xpZW50fmdldENvbm5lY3Rpb25TdGF0dXNEdXJhdGlvbn1cbiAgICogYW5kIHtAbGlua2NvZGUgU3luY0NsaWVudH5yZXBvcnRTdGF0dXN9LlxuICAgKlxuICAgKiBAZnVuY3Rpb24gU3luY0NsaWVudH5zZXRDb25uZWN0aW9uU3RhdHVzXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBjb25uZWN0aW9uU3RhdHVzXG4gICAqIEByZXR1cm5zIHtPYmplY3R9IHRoaXNcbiAgICovXG4gIHNldENvbm5lY3Rpb25TdGF0dXMoY29ubmVjdGlvblN0YXR1cykge1xuICAgIGlmKGNvbm5lY3Rpb25TdGF0dXMgIT09IHRoaXMuY29ubmVjdGlvblN0YXR1cykge1xuICAgICAgdGhpcy5jb25uZWN0aW9uU3RhdHVzID0gY29ubmVjdGlvblN0YXR1cztcbiAgICAgIHRoaXMuY29ubmVjdGlvblN0YXR1c0NoYW5nZWRUaW1lID0gdGhpcy5nZXRMb2NhbFRpbWUoKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICAvKipcbiAgICogR2V0IHRpbWUgc2luY2UgbGFzdCBjb25uZWN0aW9uU3RhdHVzIGNoYW5nZS5cbiAgICogU2VlIHtAbGlua2NvZGUgU3luY0NsaWVudH5zZXRDb25uZWN0aW9uU3RhdHVzfVxuICAgKlxuICAgKiBAZnVuY3Rpb24gU3luY0NsaWVudH5nZXRDb25uZWN0aW9uU3RhdHVzRHVyYXRpb25cbiAgICogQHJldHVybnMge051bWJlcn0gdGltZSwgaW4gc2Vjb25kcywgc2luY2UgbGFzdCBjb25uZWN0aW9uU3RhdHVzXG4gICAqIGNoYW5nZS5cbiAgICovXG4gIGdldENvbm5lY3Rpb25TdGF0dXNEdXJhdGlvbigpIHtcbiAgICByZXR1cm4gTWF0aC5tYXgoMCwgdGhpcy5nZXRMb2NhbFRpbWUoKSAtIHRoaXMuY29ubmVjdGlvblN0YXR1c0NoYW5nZWRUaW1lKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXBvcnQgdGhlIHN0YXR1cyBvZiB0aGUgc3luY2hyb25pc2F0aW9uIHByb2Nlc3MsIGlmXG4gICAqIHJlcG9ydEZ1bmN0aW9uIGlzIGRlZmluZWQuXG4gICAqXG4gICAqIEBmdW5jdGlvbiBTeW5jQ2xpZW50fnJlcG9ydFN0YXR1c1xuICAgKiBAcGFyYW0ge1N5bmNDbGllbnR+cmVwb3J0RnVuY3Rpb259IHJlcG9ydEZ1bmN0aW9uXG4gICAqL1xuICByZXBvcnRTdGF0dXMocmVwb3J0RnVuY3Rpb24pIHtcbiAgICBpZih0eXBlb2YgcmVwb3J0RnVuY3Rpb24gIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICByZXBvcnRGdW5jdGlvbih7XG4gICAgICAgIHN0YXR1czogdGhpcy5zdGF0dXMsXG4gICAgICAgIHN0YXR1c0R1cmF0aW9uOiB0aGlzLmdldFN0YXR1c0R1cmF0aW9uKCksXG4gICAgICAgIHRpbWVPZmZzZXQ6IHRoaXMudGltZU9mZnNldCxcbiAgICAgICAgZnJlcXVlbmN5UmF0aW86IHRoaXMuZnJlcXVlbmN5UmF0aW8sXG4gICAgICAgIGNvbm5lY3Rpb246IHRoaXMuY29ubmVjdGlvblN0YXR1cyxcbiAgICAgICAgY29ubmVjdGlvbkR1cmF0aW9uOiB0aGlzLmdldENvbm5lY3Rpb25TdGF0dXNEdXJhdGlvbigpLFxuICAgICAgICBjb25uZWN0aW9uVGltZU91dDogdGhpcy5waW5nVGltZW91dERlbGF5LmN1cnJlbnQsXG4gICAgICAgIHRyYXZlbER1cmF0aW9uOiB0aGlzLnRyYXZlbER1cmF0aW9uLFxuICAgICAgICB0cmF2ZWxEdXJhdGlvbk1pbjogdGhpcy50cmF2ZWxEdXJhdGlvbk1pbixcbiAgICAgICAgdHJhdmVsRHVyYXRpb25NYXg6IHRoaXMudHJhdmVsRHVyYXRpb25NYXhcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBQcm9jZXNzIHRvIHNlbmQgcGluZyBtZXNzYWdlcy5cbiAgICpcbiAgICogQHByaXZhdGVcbiAgICogQGZ1bmN0aW9uIFN5bmNDbGllbnR+X19zeW5jTG9vcFxuICAgKiBAcGFyYW0ge1N5bmNDbGllbnR+c2VuZEZ1bmN0aW9ufSBzZW5kRnVuY3Rpb25cbiAgICogQHBhcmFtIHtTeW5jQ2xpZW50fnJlcG9ydEZ1bmN0aW9ufSByZXBvcnRGdW5jdGlvblxuICAgKi9cbiAgX19zeW5jTG9vcChzZW5kRnVuY3Rpb24sIHJlcG9ydEZ1bmN0aW9uKSB7XG4gICAgY2xlYXJUaW1lb3V0KHRoaXMudGltZW91dElkKTtcbiAgICArK3RoaXMucGluZ0lkO1xuICAgIHNlbmRGdW5jdGlvbih0aGlzLnBpbmdJZCwgdGhpcy5nZXRMb2NhbFRpbWUoKSk7XG5cbiAgICB0aGlzLnRpbWVvdXRJZCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgLy8gaW5jcmVhc2UgdGltZW91dCBkdXJhdGlvbiBvbiB0aW1lb3V0LCB0byBhdm9pZCBvdmVyZmxvd1xuICAgICAgdGhpcy5waW5nVGltZW91dERlbGF5LmN1cnJlbnQgPSBNYXRoLm1pbih0aGlzLnBpbmdUaW1lb3V0RGVsYXkuY3VycmVudCAqIDIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGluZ1RpbWVvdXREZWxheS5tYXgpO1xuICAgICAgbG9nKCdzeW5jOnBpbmcgdGltZW91dCA+ICVzJywgdGhpcy5waW5nVGltZW91dERlbGF5LmN1cnJlbnQpO1xuICAgICAgdGhpcy5zZXRDb25uZWN0aW9uU3RhdHVzKCdvZmZsaW5lJyk7XG4gICAgICB0aGlzLnJlcG9ydFN0YXR1cyhyZXBvcnRGdW5jdGlvbik7XG4gICAgICAvLyByZXRyeSAoeWVzLCBhbHdheXMgaW5jcmVtZW50IHBpbmdJZClcbiAgICAgIHRoaXMuX19zeW5jTG9vcChzZW5kRnVuY3Rpb24sIHJlcG9ydEZ1bmN0aW9uKTtcbiAgICB9LCBNYXRoLmNlaWwoMTAwMCAqIHRoaXMucGluZ1RpbWVvdXREZWxheS5jdXJyZW50KSk7XG4gIH1cblxuICAvKipcbiAgICogU3RhcnQgYSBzeW5jaHJvbmlzYXRpb24gcHJvY2VzcyBieSByZWdpc3RlcmluZyB0aGUgcmVjZWl2ZVxuICAgKiBmdW5jdGlvbiBwYXNzZWQgYXMgc2Vjb25kIHBhcmFtZXRlci4gVGhlbiwgc2VuZCByZWd1bGFyIG1lc3NhZ2VzXG4gICAqIHRvIHRoZSBzZXJ2ZXIsIHVzaW5nIHRoZSBzZW5kIGZ1bmN0aW9uIHBhc3NlZCBhcyBmaXJzdCBwYXJhbWV0ZXIuXG4gICAqXG4gICAqIEBmdW5jdGlvbiBTeW5jQ2xpZW50fnN0YXJ0XG4gICAqIEBwYXJhbSB7U3luY0NsaWVudH5zZW5kRnVuY3Rpb259IHNlbmRGdW5jdGlvblxuICAgKiBAcGFyYW0ge1N5bmNDbGllbnR+cmVjZWl2ZUZ1bmN0aW9ufSByZWNlaXZlRnVuY3Rpb24gdG8gcmVnaXN0ZXJcbiAgICogQHBhcmFtIHtTeW5jQ2xpZW50fnJlcG9ydEZ1bmN0aW9ufSByZXBvcnRGdW5jdGlvbiBpZiBkZWZpbmVkLFxuICAgKiBpcyBjYWxsZWQgdG8gcmVwb3J0IHRoZSBzdGF0dXMsIG9uIGVhY2ggc3RhdHVzIGNoYW5nZVxuICAgKi9cbiAgc3RhcnQoc2VuZEZ1bmN0aW9uLCByZWNlaXZlRnVuY3Rpb24sIHJlcG9ydEZ1bmN0aW9uKSB7XG4gICAgdGhpcy5zZXRTdGF0dXMoJ3N0YXJ0dXAnKTtcbiAgICB0aGlzLnNldENvbm5lY3Rpb25TdGF0dXMoJ29mZmxpbmUnKTtcblxuICAgIHRoaXMuc2VyaWVzRGF0YSA9IFtdO1xuICAgIHRoaXMuc2VyaWVzRGF0YU5leHRJbmRleCA9IDA7XG5cbiAgICB0aGlzLmxvbmdUZXJtRGF0YSA9IFtdO1xuICAgIHRoaXMubG9uZ1Rlcm1EYXRhTmV4dEluZGV4ID0gMDtcblxuICAgIHJlY2VpdmVGdW5jdGlvbigocGluZ0lkLCBjbGllbnRQaW5nVGltZSwgc2VydmVyUGluZ1RpbWUsIHNlcnZlclBvbmdUaW1lKSA9PiB7XG4gICAgICAvLyBhY2NlcHQgb25seSB0aGUgcG9uZyB0aGF0IGNvcnJlc3BvbmRzIHRvIHRoZSBsYXN0IHBpbmdcbiAgICAgIGlmIChwaW5nSWQgPT09IHRoaXMucGluZ0lkKSB7XG4gICAgICAgICsrdGhpcy5waW5nU2VyaWVzQ291bnQ7XG4gICAgICAgIGNsZWFyVGltZW91dCh0aGlzLnRpbWVvdXRJZCk7XG4gICAgICAgIHRoaXMuc2V0Q29ubmVjdGlvblN0YXR1cygnb25saW5lJyk7XG4gICAgICAgIC8vIHJlZHVjZSB0aW1lb3V0IGR1cmF0aW9uIG9uIHBvbmcsIGZvciBiZXR0ZXIgcmVhY3Rpdml0eVxuICAgICAgICB0aGlzLnBpbmdUaW1lb3V0RGVsYXkuY3VycmVudCA9IE1hdGgubWF4KHRoaXMucGluZ1RpbWVvdXREZWxheS5jdXJyZW50ICogMC43NSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBpbmdUaW1lb3V0RGVsYXkubWluKTtcblxuICAgICAgICAvLyB0aW1lLWRpZmZlcmVuY2VzIGFyZSB2YWxpZCBvbiBhIHNpbmdsZS1zaWRlIG9ubHkgKGNsaWVudCBvciBzZXJ2ZXIpXG4gICAgICAgIGNvbnN0IGNsaWVudFBvbmdUaW1lID0gdGhpcy5nZXRMb2NhbFRpbWUoKTtcbiAgICAgICAgY29uc3QgY2xpZW50VGltZSA9IDAuNSAqIChjbGllbnRQb25nVGltZSArIGNsaWVudFBpbmdUaW1lKTtcbiAgICAgICAgY29uc3Qgc2VydmVyVGltZSA9IDAuNSAqIChzZXJ2ZXJQb25nVGltZSArIHNlcnZlclBpbmdUaW1lKTtcbiAgICAgICAgY29uc3QgdHJhdmVsRHVyYXRpb24gPSBNYXRoLm1heCgwLCAoY2xpZW50UG9uZ1RpbWUgLSBjbGllbnRQaW5nVGltZSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAtIChzZXJ2ZXJQb25nVGltZSAtIHNlcnZlclBpbmdUaW1lKSk7XG4gICAgICAgIGNvbnN0IG9mZnNldFRpbWUgPSBzZXJ2ZXJUaW1lIC0gY2xpZW50VGltZTtcblxuICAgICAgICAvLyBvcmRlciBpcyBpbXBvcnRhbnQgZm9yIHNvcnRpbmcsIGxhdGVyLlxuICAgICAgICB0aGlzLnNlcmllc0RhdGFbdGhpcy5zZXJpZXNEYXRhTmV4dEluZGV4XVxuICAgICAgICAgID0gW3RyYXZlbER1cmF0aW9uLCBvZmZzZXRUaW1lLCBjbGllbnRUaW1lLCBzZXJ2ZXJUaW1lXTtcbiAgICAgICAgdGhpcy5zZXJpZXNEYXRhTmV4dEluZGV4ID0gKCsrdGhpcy5zZXJpZXNEYXRhTmV4dEluZGV4KSAlIHRoaXMuc2VyaWVzRGF0YUxlbmd0aDtcblxuICAgICAgICAvLyBsb2coJ3BpbmcgJXMsIHRyYXZlbCA9ICVzLCBvZmZzZXQgPSAlcywgY2xpZW50ID0gJXMsIHNlcnZlciA9ICVzJyxcbiAgICAgICAgLy8gICAgICAgcGluZ0lkLCB0cmF2ZWxEdXJhdGlvbiwgb2Zmc2V0VGltZSwgY2xpZW50VGltZSwgc2VydmVyVGltZSk7XG5cbiAgICAgICAgLy8gZW5kIG9mIGEgc2VyaWVzXG4gICAgICAgIGlmICh0aGlzLnBpbmdTZXJpZXNDb3VudCA+PSB0aGlzLnBpbmdTZXJpZXNJdGVyYXRpb25zXG4gICAgICAgICAgICAmJiB0aGlzLnNlcmllc0RhdGEubGVuZ3RoID49IHRoaXMuc2VyaWVzRGF0YUxlbmd0aCkge1xuICAgICAgICAgIC8vIHBsYW4gdGhlIGJlZ2luaW5nIG9mIHRoZSBuZXh0IHNlcmllc1xuICAgICAgICAgIHRoaXMucGluZ0RlbGF5ID0gdGhpcy5waW5nU2VyaWVzRGVsYXkubWluXG4gICAgICAgICAgICArIE1hdGgucmFuZG9tKCkgKiAodGhpcy5waW5nU2VyaWVzRGVsYXkubWF4IC0gdGhpcy5waW5nU2VyaWVzRGVsYXkubWluKTtcbiAgICAgICAgICB0aGlzLnBpbmdTZXJpZXNDb3VudCA9IDA7XG5cbiAgICAgICAgICAvLyBzb3J0IGJ5IHRyYXZlbCB0aW1lIGZpcnN0LCB0aGVuIG9mZnNldCB0aW1lLlxuICAgICAgICAgIGNvbnN0IHNvcnRlZCA9IHRoaXMuc2VyaWVzRGF0YS5zbGljZSgwKS5zb3J0KCk7XG5cbiAgICAgICAgICBjb25zdCBzZXJpZXNUcmF2ZWxEdXJhdGlvbiA9IHNvcnRlZFswXVswXTtcblxuICAgICAgICAgIC8vIFdoZW4gdGhlIGNsb2NrIHRpY2sgaXMgbG9uZyBlbm91Z2gsXG4gICAgICAgICAgLy8gc29tZSB0cmF2ZWwgdGltZXMgKGRpbWVuc2lvbiAwKSBtaWdodCBiZSBpZGVudGljYWwuXG4gICAgICAgICAgLy8gVGhlbiwgdXNlIHRoZSBvZmZzZXQgbWVkaWFuIChkaW1lbnNpb24gMSBpcyB0aGUgc2Vjb25kIHNvcnQga2V5KVxuICAgICAgICAgIGxldCBzID0gMDtcbiAgICAgICAgICB3aGlsZShzIDwgc29ydGVkLmxlbmd0aCAmJiBzb3J0ZWRbc11bMF0gPD0gc2VyaWVzVHJhdmVsRHVyYXRpb24gKiAxLjAxKSB7XG4gICAgICAgICAgICArK3M7XG4gICAgICAgICAgfVxuICAgICAgICAgIHMgPSBNYXRoLm1heCgwLCBzIC0gMSk7XG4gICAgICAgICAgY29uc3QgbWVkaWFuID0gTWF0aC5mbG9vcihzIC8gMik7XG5cbiAgICAgICAgICBjb25zdCBzZXJpZXNDbGllbnRUaW1lID0gc29ydGVkW21lZGlhbl1bMl07XG4gICAgICAgICAgY29uc3Qgc2VyaWVzU2VydmVyVGltZSA9IHNvcnRlZFttZWRpYW5dWzNdO1xuICAgICAgICAgIGNvbnN0IHNlcmllc0NsaWVudFNxdWFyZWRUaW1lID0gc2VyaWVzQ2xpZW50VGltZSAqIHNlcmllc0NsaWVudFRpbWU7XG4gICAgICAgICAgY29uc3Qgc2VyaWVzQ2xpZW50U2VydmVyVGltZSA9IHNlcmllc0NsaWVudFRpbWUgKiBzZXJpZXNTZXJ2ZXJUaW1lO1xuXG4gICAgICAgICAgdGhpcy5sb25nVGVybURhdGFbdGhpcy5sb25nVGVybURhdGFOZXh0SW5kZXhdXG4gICAgICAgICAgICA9IFtzZXJpZXNUcmF2ZWxEdXJhdGlvbiwgc2VyaWVzQ2xpZW50VGltZSwgc2VyaWVzU2VydmVyVGltZSxcbiAgICAgICAgICAgICAgIHNlcmllc0NsaWVudFNxdWFyZWRUaW1lLCBzZXJpZXNDbGllbnRTZXJ2ZXJUaW1lXTtcbiAgICAgICAgICB0aGlzLmxvbmdUZXJtRGF0YU5leHRJbmRleCA9ICgrK3RoaXMubG9uZ1Rlcm1EYXRhTmV4dEluZGV4KSAlIHRoaXMubG9uZ1Rlcm1EYXRhTGVuZ3RoO1xuXG4gICAgICAgICAgLy8gbWVhbiBvZiB0aGUgdGltZSBvZmZzZXQgb3ZlciAzIHNhbXBsZXMgYXJvdW5kIG1lZGlhblxuICAgICAgICAgIC8vIChpdCBtaWdodCB1c2UgYSBsb25nZXIgdHJhdmVsIGR1cmF0aW9uKVxuICAgICAgICAgIGNvbnN0IGFyb3VuZE1lZGlhbiA9IHNvcnRlZC5zbGljZShNYXRoLm1heCgwLCBtZWRpYW4gLSAxKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgTWF0aC5taW4oc29ydGVkLmxlbmd0aCwgbWVkaWFuICsgMSkgKTtcbiAgICAgICAgICB0aGlzLnRpbWVPZmZzZXQgPSBtZWFuKGFyb3VuZE1lZGlhbiwgMykgLSBtZWFuKGFyb3VuZE1lZGlhbiwgMik7XG5cbiAgICAgICAgICBpZih0aGlzLnN0YXR1cyA9PT0gJ3N0YXJ0dXAnXG4gICAgICAgICAgICAgfHwgKHRoaXMuc3RhdHVzID09PSAndHJhaW5pbmcnXG4gICAgICAgICAgICAgICAgICYmIHRoaXMuZ2V0U3RhdHVzRHVyYXRpb24oKSA8IHRoaXMubG9uZ1Rlcm1EYXRhVHJhaW5pbmdEdXJhdGlvbikgKSB7XG4gICAgICAgICAgICAvLyBzZXQgb25seSB0aGUgcGhhc2Ugb2Zmc2V0LCBub3QgdGhlIGZyZXF1ZW5jeVxuICAgICAgICAgICAgdGhpcy5zZXJ2ZXJUaW1lUmVmZXJlbmNlID0gdGhpcy50aW1lT2Zmc2V0O1xuICAgICAgICAgICAgdGhpcy5jbGllbnRUaW1lUmVmZXJlbmNlID0gMDtcbiAgICAgICAgICAgIHRoaXMuZnJlcXVlbmN5UmF0aW8gPSAxO1xuICAgICAgICAgICAgdGhpcy5zZXRTdGF0dXMoJ3RyYWluaW5nJyk7XG4gICAgICAgICAgICBsb2coJ1QgPSAlcyArICVzICogKCVzIC0gJXMpID0gJXMnLFxuICAgICAgICAgICAgICAgICAgdGhpcy5zZXJ2ZXJUaW1lUmVmZXJlbmNlLCB0aGlzLmZyZXF1ZW5jeVJhdGlvLFxuICAgICAgICAgICAgICAgICAgc2VyaWVzQ2xpZW50VGltZSwgdGhpcy5jbGllbnRUaW1lUmVmZXJlbmNlLFxuICAgICAgICAgICAgICAgICAgdGhpcy5nZXRTeW5jVGltZShzZXJpZXNDbGllbnRUaW1lKSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYoKHRoaXMuc3RhdHVzID09PSAndHJhaW5pbmcnXG4gICAgICAgICAgICAgICYmIHRoaXMuZ2V0U3RhdHVzRHVyYXRpb24oKSA+PSB0aGlzLmxvbmdUZXJtRGF0YVRyYWluaW5nRHVyYXRpb24pXG4gICAgICAgICAgICAgfHwgdGhpcy5zdGF0dXMgPT09ICdzeW5jJykge1xuICAgICAgICAgICAgLy8gbGluZWFyIHJlZ3Jlc3Npb24sIFIgPSBjb3ZhcmlhbmNlKHQsVCkgLyB2YXJpYW5jZSh0KVxuICAgICAgICAgICAgY29uc3QgcmVnQ2xpZW50VGltZSA9IG1lYW4odGhpcy5sb25nVGVybURhdGEsIDEpO1xuICAgICAgICAgICAgY29uc3QgcmVnU2VydmVyVGltZSA9IG1lYW4odGhpcy5sb25nVGVybURhdGEsIDIpO1xuICAgICAgICAgICAgY29uc3QgcmVnQ2xpZW50U3F1YXJlZFRpbWUgPSBtZWFuKHRoaXMubG9uZ1Rlcm1EYXRhLCAzKTtcbiAgICAgICAgICAgIGNvbnN0IHJlZ0NsaWVudFNlcnZlclRpbWUgPSBtZWFuKHRoaXMubG9uZ1Rlcm1EYXRhLCA0KTtcblxuICAgICAgICAgICAgY29uc3QgY292YXJpYW5jZSA9IHJlZ0NsaWVudFNlcnZlclRpbWUgLSByZWdDbGllbnRUaW1lICogcmVnU2VydmVyVGltZTtcbiAgICAgICAgICAgIGNvbnN0IHZhcmlhbmNlID0gcmVnQ2xpZW50U3F1YXJlZFRpbWUgLSByZWdDbGllbnRUaW1lICogcmVnQ2xpZW50VGltZTtcbiAgICAgICAgICAgIGlmKHZhcmlhbmNlID4gMCkge1xuICAgICAgICAgICAgICAvLyB1cGRhdGUgZnJlcSBhbmQgc2hpZnRcbiAgICAgICAgICAgICAgdGhpcy5mcmVxdWVuY3lSYXRpbyA9IGNvdmFyaWFuY2UgLyB2YXJpYW5jZTtcbiAgICAgICAgICAgICAgdGhpcy5jbGllbnRUaW1lUmVmZXJlbmNlID0gcmVnQ2xpZW50VGltZTtcbiAgICAgICAgICAgICAgdGhpcy5zZXJ2ZXJUaW1lUmVmZXJlbmNlID0gcmVnU2VydmVyVGltZTtcblxuICAgICAgICAgICAgICAvLyAwLjA1JSBpcyBhIGxvdCAoNTAwIFBQTSwgbGlrZSBhbiBvbGQgbWVjaGFuaWNhbCBjbG9jaylcbiAgICAgICAgICAgICAgaWYodGhpcy5mcmVxdWVuY3lSYXRpbyA+IDAuOTk5NSAmJiB0aGlzLmZyZXF1ZW5jeVJhdGlvIDwgMS4wMDA1KSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXRTdGF0dXMoJ3N5bmMnKTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBsb2coJ2Nsb2NrIGZyZXF1ZW5jeSByYXRpbyBvdXQgb2Ygc3luYzogJXMsIHRyYWluaW5nIGFnYWluJyxcbiAgICAgICAgICAgICAgICAgICAgICB0aGlzLmZyZXF1ZW5jeVJhdGlvKTtcbiAgICAgICAgICAgICAgICAvLyBzdGFydCB0aGUgdHJhaW5pbmcgYWdhaW4gZnJvbSB0aGUgbGFzdCBzZXJpZXNcbiAgICAgICAgICAgICAgICB0aGlzLnNlcnZlclRpbWVSZWZlcmVuY2UgPSB0aGlzLnRpbWVPZmZzZXQ7IC8vIG9mZnNldCBvbmx5XG4gICAgICAgICAgICAgICAgdGhpcy5jbGllbnRUaW1lUmVmZXJlbmNlID0gMDtcbiAgICAgICAgICAgICAgICB0aGlzLmZyZXF1ZW5jeVJhdGlvID0gMTtcbiAgICAgICAgICAgICAgICB0aGlzLnNldFN0YXR1cygndHJhaW5pbmcnKTtcblxuICAgICAgICAgICAgICAgIHRoaXMubG9uZ1Rlcm1EYXRhWzBdXG4gICAgICAgICAgICAgICAgICA9IFtzZXJpZXNUcmF2ZWxEdXJhdGlvbiwgc2VyaWVzQ2xpZW50VGltZSwgc2VyaWVzU2VydmVyVGltZSxcbiAgICAgICAgICAgICAgICAgICAgIHNlcmllc0NsaWVudFNxdWFyZWRUaW1lLCBzZXJpZXNDbGllbnRTZXJ2ZXJUaW1lXTtcbiAgICAgICAgICAgICAgICB0aGlzLmxvbmdUZXJtRGF0YS5sZW5ndGggPSAxO1xuICAgICAgICAgICAgICAgIHRoaXMubG9uZ1Rlcm1EYXRhTmV4dEluZGV4ID0gMTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBsb2coJ1QgPSAlcyArICVzICogKCVzIC0gJXMpID0gJXMnLFxuICAgICAgICAgICAgICAgICAgdGhpcy5zZXJ2ZXJUaW1lUmVmZXJlbmNlLCB0aGlzLmZyZXF1ZW5jeVJhdGlvLFxuICAgICAgICAgICAgICAgICAgc2VyaWVzQ2xpZW50VGltZSwgdGhpcy5jbGllbnRUaW1lUmVmZXJlbmNlLFxuICAgICAgICAgICAgICAgICAgdGhpcy5nZXRTeW5jVGltZShzZXJpZXNDbGllbnRUaW1lKSApO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHRoaXMudHJhdmVsRHVyYXRpb24gPSBtZWFuKHNvcnRlZCwgMCk7XG4gICAgICAgICAgdGhpcy50cmF2ZWxEdXJhdGlvbk1pbiA9IHNvcnRlZFswXVswXTtcbiAgICAgICAgICB0aGlzLnRyYXZlbER1cmF0aW9uTWF4ID0gc29ydGVkW3NvcnRlZC5sZW5ndGggLSAxXVswXTtcblxuICAgICAgICAgIHRoaXMucmVwb3J0U3RhdHVzKHJlcG9ydEZ1bmN0aW9uKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyB3ZSBhcmUgaW4gYSBzZXJpZXMsIHVzZSB0aGUgcGluZ0ludGVydmFsIHZhbHVlXG4gICAgICAgICAgdGhpcy5waW5nRGVsYXkgPSB0aGlzLnBpbmdTZXJpZXNQZXJpb2Q7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnRpbWVvdXRJZCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgIHRoaXMuX19zeW5jTG9vcChzZW5kRnVuY3Rpb24sIHJlcG9ydEZ1bmN0aW9uKTtcbiAgICAgICAgfSwgTWF0aC5jZWlsKDEwMDAgKiB0aGlzLnBpbmdEZWxheSkpO1xuICAgICAgfSAgLy8gcGluZyBhbmQgcG9uZyBJRCBtYXRjaFxuICAgIH0pOyAvLyByZWNlaXZlIGZ1bmN0aW9uXG5cbiAgICB0aGlzLl9fc3luY0xvb3Aoc2VuZEZ1bmN0aW9uLCByZXBvcnRGdW5jdGlvbik7XG4gIH1cblxuICAvKipcbiAgICogR2V0IGxvY2FsIHRpbWUsIG9yIGNvbnZlcnQgYSBzeW5jaHJvbmlzZWQgdGltZSB0byBhIGxvY2FsIHRpbWUuXG4gICAqXG4gICAqIEBmdW5jdGlvbiBTeW5jQ2xpZW50fmdldExvY2FsVGltZVxuICAgKiBAcGFyYW0ge051bWJlcn0gc3luY1RpbWUgdW5kZWZpbmVkIHRvIGdldCBsb2NhbCB0aW1lXG4gICAqIEByZXR1cm5zIHtOdW1iZXJ9IGxvY2FsIHRpbWUsIGluIHNlY29uZHNcbiAgICovXG4gIGdldExvY2FsVGltZShzeW5jVGltZSkge1xuICAgIGlmICh0eXBlb2Ygc3luY1RpbWUgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAvLyBjb252ZXJzaW9uOiB0KFQpID0gdDAgKyAoVCAtIFQwKSAvIFJcbiAgICAgIHJldHVybiB0aGlzLmNsaWVudFRpbWVSZWZlcmVuY2VcbiAgICAgICAgKyAoc3luY1RpbWUgLSB0aGlzLnNlcnZlclRpbWVSZWZlcmVuY2UpIC8gdGhpcy5mcmVxdWVuY3lSYXRpbztcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gcmVhZCBsb2NhbCBjbG9ja1xuICAgICAgcmV0dXJuIHRoaXMuZ2V0VGltZUZ1bmN0aW9uKCk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEdldCBzeW5jaHJvbmlzZWQgdGltZSwgb3IgY29udmVydCBhIGxvY2FsIHRpbWUgdG8gYSBzeW5jaHJvbmlzZWQgdGltZS5cbiAgICpcbiAgICogQGZ1bmN0aW9uIFN5bmNDbGllbnR+Z2V0U3luY1RpbWVcbiAgICogQHBhcmFtIHtOdW1iZXJ9IGxvY2FsVGltZSB1bmRlZmluZWQgdG8gZ2V0IHN5bmNocm9uaXNlZCB0aW1lXG4gICAqIEByZXR1cm5zIHtOdW1iZXJ9IHN5bmNocm9uaXNlZCB0aW1lLCBpbiBzZWNvbmRzLlxuICAgKi9cbiAgZ2V0U3luY1RpbWUobG9jYWxUaW1lID0gdGhpcy5nZXRMb2NhbFRpbWUoKSkge1xuICAgIC8vIGFsd2F5cyBjb252ZXJ0OiBUKHQpID0gVDAgKyBSICogKHQgLSB0MClcbiAgICByZXR1cm4gdGhpcy5zZXJ2ZXJUaW1lUmVmZXJlbmNlXG4gICAgICArIHRoaXMuZnJlcXVlbmN5UmF0aW8gKiAobG9jYWxUaW1lIC0gdGhpcy5jbGllbnRUaW1lUmVmZXJlbmNlKTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBTeW5jQ2xpZW50O1xuIiwibW9kdWxlLmV4cG9ydHMgPSB7IFwiZGVmYXVsdFwiOiByZXF1aXJlKFwiY29yZS1qcy9saWJyYXJ5L2ZuL2pzb24vc3RyaW5naWZ5XCIpLCBfX2VzTW9kdWxlOiB0cnVlIH07IiwibW9kdWxlLmV4cG9ydHMgPSB7IFwiZGVmYXVsdFwiOiByZXF1aXJlKFwiY29yZS1qcy9saWJyYXJ5L2ZuL29iamVjdC9kZWZpbmUtcHJvcGVydHlcIiksIF9fZXNNb2R1bGU6IHRydWUgfTsiLCJcInVzZSBzdHJpY3RcIjtcblxuZXhwb3J0cy5fX2VzTW9kdWxlID0gdHJ1ZTtcblxuZXhwb3J0cy5kZWZhdWx0ID0gZnVuY3Rpb24gKGluc3RhbmNlLCBDb25zdHJ1Y3Rvcikge1xuICBpZiAoIShpbnN0YW5jZSBpbnN0YW5jZW9mIENvbnN0cnVjdG9yKSkge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJDYW5ub3QgY2FsbCBhIGNsYXNzIGFzIGEgZnVuY3Rpb25cIik7XG4gIH1cbn07IiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbmV4cG9ydHMuX19lc01vZHVsZSA9IHRydWU7XG5cbnZhciBfZGVmaW5lUHJvcGVydHkgPSByZXF1aXJlKFwiLi4vY29yZS1qcy9vYmplY3QvZGVmaW5lLXByb3BlcnR5XCIpO1xuXG52YXIgX2RlZmluZVByb3BlcnR5MiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX2RlZmluZVByb3BlcnR5KTtcblxuZnVuY3Rpb24gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChvYmopIHsgcmV0dXJuIG9iaiAmJiBvYmouX19lc01vZHVsZSA/IG9iaiA6IHsgZGVmYXVsdDogb2JqIH07IH1cblxuZXhwb3J0cy5kZWZhdWx0ID0gZnVuY3Rpb24gKCkge1xuICBmdW5jdGlvbiBkZWZpbmVQcm9wZXJ0aWVzKHRhcmdldCwgcHJvcHMpIHtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHByb3BzLmxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIgZGVzY3JpcHRvciA9IHByb3BzW2ldO1xuICAgICAgZGVzY3JpcHRvci5lbnVtZXJhYmxlID0gZGVzY3JpcHRvci5lbnVtZXJhYmxlIHx8IGZhbHNlO1xuICAgICAgZGVzY3JpcHRvci5jb25maWd1cmFibGUgPSB0cnVlO1xuICAgICAgaWYgKFwidmFsdWVcIiBpbiBkZXNjcmlwdG9yKSBkZXNjcmlwdG9yLndyaXRhYmxlID0gdHJ1ZTtcbiAgICAgICgwLCBfZGVmaW5lUHJvcGVydHkyLmRlZmF1bHQpKHRhcmdldCwgZGVzY3JpcHRvci5rZXksIGRlc2NyaXB0b3IpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBmdW5jdGlvbiAoQ29uc3RydWN0b3IsIHByb3RvUHJvcHMsIHN0YXRpY1Byb3BzKSB7XG4gICAgaWYgKHByb3RvUHJvcHMpIGRlZmluZVByb3BlcnRpZXMoQ29uc3RydWN0b3IucHJvdG90eXBlLCBwcm90b1Byb3BzKTtcbiAgICBpZiAoc3RhdGljUHJvcHMpIGRlZmluZVByb3BlcnRpZXMoQ29uc3RydWN0b3IsIHN0YXRpY1Byb3BzKTtcbiAgICByZXR1cm4gQ29uc3RydWN0b3I7XG4gIH07XG59KCk7IiwidmFyIGNvcmUgPSByZXF1aXJlKCcuLi8uLi9tb2R1bGVzL19jb3JlJyk7XG52YXIgJEpTT04gPSBjb3JlLkpTT04gfHwgKGNvcmUuSlNPTiA9IHsgc3RyaW5naWZ5OiBKU09OLnN0cmluZ2lmeSB9KTtcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gc3RyaW5naWZ5KGl0KSB7IC8vIGVzbGludC1kaXNhYmxlLWxpbmUgbm8tdW51c2VkLXZhcnNcbiAgcmV0dXJuICRKU09OLnN0cmluZ2lmeS5hcHBseSgkSlNPTiwgYXJndW1lbnRzKTtcbn07XG4iLCJyZXF1aXJlKCcuLi8uLi9tb2R1bGVzL2VzNi5vYmplY3QuZGVmaW5lLXByb3BlcnR5Jyk7XG52YXIgJE9iamVjdCA9IHJlcXVpcmUoJy4uLy4uL21vZHVsZXMvX2NvcmUnKS5PYmplY3Q7XG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGRlZmluZVByb3BlcnR5KGl0LCBrZXksIGRlc2MpIHtcbiAgcmV0dXJuICRPYmplY3QuZGVmaW5lUHJvcGVydHkoaXQsIGtleSwgZGVzYyk7XG59O1xuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoaXQpIHtcbiAgaWYgKHR5cGVvZiBpdCAhPSAnZnVuY3Rpb24nKSB0aHJvdyBUeXBlRXJyb3IoaXQgKyAnIGlzIG5vdCBhIGZ1bmN0aW9uIScpO1xuICByZXR1cm4gaXQ7XG59O1xuIiwidmFyIGlzT2JqZWN0ID0gcmVxdWlyZSgnLi9faXMtb2JqZWN0Jyk7XG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChpdCkge1xuICBpZiAoIWlzT2JqZWN0KGl0KSkgdGhyb3cgVHlwZUVycm9yKGl0ICsgJyBpcyBub3QgYW4gb2JqZWN0IScpO1xuICByZXR1cm4gaXQ7XG59O1xuIiwidmFyIGNvcmUgPSBtb2R1bGUuZXhwb3J0cyA9IHsgdmVyc2lvbjogJzIuNS43JyB9O1xuaWYgKHR5cGVvZiBfX2UgPT0gJ251bWJlcicpIF9fZSA9IGNvcmU7IC8vIGVzbGludC1kaXNhYmxlLWxpbmUgbm8tdW5kZWZcbiIsIi8vIG9wdGlvbmFsIC8gc2ltcGxlIGNvbnRleHQgYmluZGluZ1xudmFyIGFGdW5jdGlvbiA9IHJlcXVpcmUoJy4vX2EtZnVuY3Rpb24nKTtcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGZuLCB0aGF0LCBsZW5ndGgpIHtcbiAgYUZ1bmN0aW9uKGZuKTtcbiAgaWYgKHRoYXQgPT09IHVuZGVmaW5lZCkgcmV0dXJuIGZuO1xuICBzd2l0Y2ggKGxlbmd0aCkge1xuICAgIGNhc2UgMTogcmV0dXJuIGZ1bmN0aW9uIChhKSB7XG4gICAgICByZXR1cm4gZm4uY2FsbCh0aGF0LCBhKTtcbiAgICB9O1xuICAgIGNhc2UgMjogcmV0dXJuIGZ1bmN0aW9uIChhLCBiKSB7XG4gICAgICByZXR1cm4gZm4uY2FsbCh0aGF0LCBhLCBiKTtcbiAgICB9O1xuICAgIGNhc2UgMzogcmV0dXJuIGZ1bmN0aW9uIChhLCBiLCBjKSB7XG4gICAgICByZXR1cm4gZm4uY2FsbCh0aGF0LCBhLCBiLCBjKTtcbiAgICB9O1xuICB9XG4gIHJldHVybiBmdW5jdGlvbiAoLyogLi4uYXJncyAqLykge1xuICAgIHJldHVybiBmbi5hcHBseSh0aGF0LCBhcmd1bWVudHMpO1xuICB9O1xufTtcbiIsIi8vIFRoYW5rJ3MgSUU4IGZvciBoaXMgZnVubnkgZGVmaW5lUHJvcGVydHlcbm1vZHVsZS5leHBvcnRzID0gIXJlcXVpcmUoJy4vX2ZhaWxzJykoZnVuY3Rpb24gKCkge1xuICByZXR1cm4gT2JqZWN0LmRlZmluZVByb3BlcnR5KHt9LCAnYScsIHsgZ2V0OiBmdW5jdGlvbiAoKSB7IHJldHVybiA3OyB9IH0pLmEgIT0gNztcbn0pO1xuIiwidmFyIGlzT2JqZWN0ID0gcmVxdWlyZSgnLi9faXMtb2JqZWN0Jyk7XG52YXIgZG9jdW1lbnQgPSByZXF1aXJlKCcuL19nbG9iYWwnKS5kb2N1bWVudDtcbi8vIHR5cGVvZiBkb2N1bWVudC5jcmVhdGVFbGVtZW50IGlzICdvYmplY3QnIGluIG9sZCBJRVxudmFyIGlzID0gaXNPYmplY3QoZG9jdW1lbnQpICYmIGlzT2JqZWN0KGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQpO1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoaXQpIHtcbiAgcmV0dXJuIGlzID8gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChpdCkgOiB7fTtcbn07XG4iLCJ2YXIgZ2xvYmFsID0gcmVxdWlyZSgnLi9fZ2xvYmFsJyk7XG52YXIgY29yZSA9IHJlcXVpcmUoJy4vX2NvcmUnKTtcbnZhciBjdHggPSByZXF1aXJlKCcuL19jdHgnKTtcbnZhciBoaWRlID0gcmVxdWlyZSgnLi9faGlkZScpO1xudmFyIGhhcyA9IHJlcXVpcmUoJy4vX2hhcycpO1xudmFyIFBST1RPVFlQRSA9ICdwcm90b3R5cGUnO1xuXG52YXIgJGV4cG9ydCA9IGZ1bmN0aW9uICh0eXBlLCBuYW1lLCBzb3VyY2UpIHtcbiAgdmFyIElTX0ZPUkNFRCA9IHR5cGUgJiAkZXhwb3J0LkY7XG4gIHZhciBJU19HTE9CQUwgPSB0eXBlICYgJGV4cG9ydC5HO1xuICB2YXIgSVNfU1RBVElDID0gdHlwZSAmICRleHBvcnQuUztcbiAgdmFyIElTX1BST1RPID0gdHlwZSAmICRleHBvcnQuUDtcbiAgdmFyIElTX0JJTkQgPSB0eXBlICYgJGV4cG9ydC5CO1xuICB2YXIgSVNfV1JBUCA9IHR5cGUgJiAkZXhwb3J0Llc7XG4gIHZhciBleHBvcnRzID0gSVNfR0xPQkFMID8gY29yZSA6IGNvcmVbbmFtZV0gfHwgKGNvcmVbbmFtZV0gPSB7fSk7XG4gIHZhciBleHBQcm90byA9IGV4cG9ydHNbUFJPVE9UWVBFXTtcbiAgdmFyIHRhcmdldCA9IElTX0dMT0JBTCA/IGdsb2JhbCA6IElTX1NUQVRJQyA/IGdsb2JhbFtuYW1lXSA6IChnbG9iYWxbbmFtZV0gfHwge30pW1BST1RPVFlQRV07XG4gIHZhciBrZXksIG93biwgb3V0O1xuICBpZiAoSVNfR0xPQkFMKSBzb3VyY2UgPSBuYW1lO1xuICBmb3IgKGtleSBpbiBzb3VyY2UpIHtcbiAgICAvLyBjb250YWlucyBpbiBuYXRpdmVcbiAgICBvd24gPSAhSVNfRk9SQ0VEICYmIHRhcmdldCAmJiB0YXJnZXRba2V5XSAhPT0gdW5kZWZpbmVkO1xuICAgIGlmIChvd24gJiYgaGFzKGV4cG9ydHMsIGtleSkpIGNvbnRpbnVlO1xuICAgIC8vIGV4cG9ydCBuYXRpdmUgb3IgcGFzc2VkXG4gICAgb3V0ID0gb3duID8gdGFyZ2V0W2tleV0gOiBzb3VyY2Vba2V5XTtcbiAgICAvLyBwcmV2ZW50IGdsb2JhbCBwb2xsdXRpb24gZm9yIG5hbWVzcGFjZXNcbiAgICBleHBvcnRzW2tleV0gPSBJU19HTE9CQUwgJiYgdHlwZW9mIHRhcmdldFtrZXldICE9ICdmdW5jdGlvbicgPyBzb3VyY2Vba2V5XVxuICAgIC8vIGJpbmQgdGltZXJzIHRvIGdsb2JhbCBmb3IgY2FsbCBmcm9tIGV4cG9ydCBjb250ZXh0XG4gICAgOiBJU19CSU5EICYmIG93biA/IGN0eChvdXQsIGdsb2JhbClcbiAgICAvLyB3cmFwIGdsb2JhbCBjb25zdHJ1Y3RvcnMgZm9yIHByZXZlbnQgY2hhbmdlIHRoZW0gaW4gbGlicmFyeVxuICAgIDogSVNfV1JBUCAmJiB0YXJnZXRba2V5XSA9PSBvdXQgPyAoZnVuY3Rpb24gKEMpIHtcbiAgICAgIHZhciBGID0gZnVuY3Rpb24gKGEsIGIsIGMpIHtcbiAgICAgICAgaWYgKHRoaXMgaW5zdGFuY2VvZiBDKSB7XG4gICAgICAgICAgc3dpdGNoIChhcmd1bWVudHMubGVuZ3RoKSB7XG4gICAgICAgICAgICBjYXNlIDA6IHJldHVybiBuZXcgQygpO1xuICAgICAgICAgICAgY2FzZSAxOiByZXR1cm4gbmV3IEMoYSk7XG4gICAgICAgICAgICBjYXNlIDI6IHJldHVybiBuZXcgQyhhLCBiKTtcbiAgICAgICAgICB9IHJldHVybiBuZXcgQyhhLCBiLCBjKTtcbiAgICAgICAgfSByZXR1cm4gQy5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgfTtcbiAgICAgIEZbUFJPVE9UWVBFXSA9IENbUFJPVE9UWVBFXTtcbiAgICAgIHJldHVybiBGO1xuICAgIC8vIG1ha2Ugc3RhdGljIHZlcnNpb25zIGZvciBwcm90b3R5cGUgbWV0aG9kc1xuICAgIH0pKG91dCkgOiBJU19QUk9UTyAmJiB0eXBlb2Ygb3V0ID09ICdmdW5jdGlvbicgPyBjdHgoRnVuY3Rpb24uY2FsbCwgb3V0KSA6IG91dDtcbiAgICAvLyBleHBvcnQgcHJvdG8gbWV0aG9kcyB0byBjb3JlLiVDT05TVFJVQ1RPUiUubWV0aG9kcy4lTkFNRSVcbiAgICBpZiAoSVNfUFJPVE8pIHtcbiAgICAgIChleHBvcnRzLnZpcnR1YWwgfHwgKGV4cG9ydHMudmlydHVhbCA9IHt9KSlba2V5XSA9IG91dDtcbiAgICAgIC8vIGV4cG9ydCBwcm90byBtZXRob2RzIHRvIGNvcmUuJUNPTlNUUlVDVE9SJS5wcm90b3R5cGUuJU5BTUUlXG4gICAgICBpZiAodHlwZSAmICRleHBvcnQuUiAmJiBleHBQcm90byAmJiAhZXhwUHJvdG9ba2V5XSkgaGlkZShleHBQcm90bywga2V5LCBvdXQpO1xuICAgIH1cbiAgfVxufTtcbi8vIHR5cGUgYml0bWFwXG4kZXhwb3J0LkYgPSAxOyAgIC8vIGZvcmNlZFxuJGV4cG9ydC5HID0gMjsgICAvLyBnbG9iYWxcbiRleHBvcnQuUyA9IDQ7ICAgLy8gc3RhdGljXG4kZXhwb3J0LlAgPSA4OyAgIC8vIHByb3RvXG4kZXhwb3J0LkIgPSAxNjsgIC8vIGJpbmRcbiRleHBvcnQuVyA9IDMyOyAgLy8gd3JhcFxuJGV4cG9ydC5VID0gNjQ7ICAvLyBzYWZlXG4kZXhwb3J0LlIgPSAxMjg7IC8vIHJlYWwgcHJvdG8gbWV0aG9kIGZvciBgbGlicmFyeWBcbm1vZHVsZS5leHBvcnRzID0gJGV4cG9ydDtcbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGV4ZWMpIHtcbiAgdHJ5IHtcbiAgICByZXR1cm4gISFleGVjKCk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxufTtcbiIsIi8vIGh0dHBzOi8vZ2l0aHViLmNvbS96bG9pcm9jay9jb3JlLWpzL2lzc3Vlcy84NiNpc3N1ZWNvbW1lbnQtMTE1NzU5MDI4XG52YXIgZ2xvYmFsID0gbW9kdWxlLmV4cG9ydHMgPSB0eXBlb2Ygd2luZG93ICE9ICd1bmRlZmluZWQnICYmIHdpbmRvdy5NYXRoID09IE1hdGhcbiAgPyB3aW5kb3cgOiB0eXBlb2Ygc2VsZiAhPSAndW5kZWZpbmVkJyAmJiBzZWxmLk1hdGggPT0gTWF0aCA/IHNlbGZcbiAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLW5ldy1mdW5jXG4gIDogRnVuY3Rpb24oJ3JldHVybiB0aGlzJykoKTtcbmlmICh0eXBlb2YgX19nID09ICdudW1iZXInKSBfX2cgPSBnbG9iYWw7IC8vIGVzbGludC1kaXNhYmxlLWxpbmUgbm8tdW5kZWZcbiIsInZhciBoYXNPd25Qcm9wZXJ0eSA9IHt9Lmhhc093blByb3BlcnR5O1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoaXQsIGtleSkge1xuICByZXR1cm4gaGFzT3duUHJvcGVydHkuY2FsbChpdCwga2V5KTtcbn07XG4iLCJ2YXIgZFAgPSByZXF1aXJlKCcuL19vYmplY3QtZHAnKTtcbnZhciBjcmVhdGVEZXNjID0gcmVxdWlyZSgnLi9fcHJvcGVydHktZGVzYycpO1xubW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKCcuL19kZXNjcmlwdG9ycycpID8gZnVuY3Rpb24gKG9iamVjdCwga2V5LCB2YWx1ZSkge1xuICByZXR1cm4gZFAuZihvYmplY3QsIGtleSwgY3JlYXRlRGVzYygxLCB2YWx1ZSkpO1xufSA6IGZ1bmN0aW9uIChvYmplY3QsIGtleSwgdmFsdWUpIHtcbiAgb2JqZWN0W2tleV0gPSB2YWx1ZTtcbiAgcmV0dXJuIG9iamVjdDtcbn07XG4iLCJtb2R1bGUuZXhwb3J0cyA9ICFyZXF1aXJlKCcuL19kZXNjcmlwdG9ycycpICYmICFyZXF1aXJlKCcuL19mYWlscycpKGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShyZXF1aXJlKCcuL19kb20tY3JlYXRlJykoJ2RpdicpLCAnYScsIHsgZ2V0OiBmdW5jdGlvbiAoKSB7IHJldHVybiA3OyB9IH0pLmEgIT0gNztcbn0pO1xuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoaXQpIHtcbiAgcmV0dXJuIHR5cGVvZiBpdCA9PT0gJ29iamVjdCcgPyBpdCAhPT0gbnVsbCA6IHR5cGVvZiBpdCA9PT0gJ2Z1bmN0aW9uJztcbn07XG4iLCJ2YXIgYW5PYmplY3QgPSByZXF1aXJlKCcuL19hbi1vYmplY3QnKTtcbnZhciBJRThfRE9NX0RFRklORSA9IHJlcXVpcmUoJy4vX2llOC1kb20tZGVmaW5lJyk7XG52YXIgdG9QcmltaXRpdmUgPSByZXF1aXJlKCcuL190by1wcmltaXRpdmUnKTtcbnZhciBkUCA9IE9iamVjdC5kZWZpbmVQcm9wZXJ0eTtcblxuZXhwb3J0cy5mID0gcmVxdWlyZSgnLi9fZGVzY3JpcHRvcnMnKSA/IE9iamVjdC5kZWZpbmVQcm9wZXJ0eSA6IGZ1bmN0aW9uIGRlZmluZVByb3BlcnR5KE8sIFAsIEF0dHJpYnV0ZXMpIHtcbiAgYW5PYmplY3QoTyk7XG4gIFAgPSB0b1ByaW1pdGl2ZShQLCB0cnVlKTtcbiAgYW5PYmplY3QoQXR0cmlidXRlcyk7XG4gIGlmIChJRThfRE9NX0RFRklORSkgdHJ5IHtcbiAgICByZXR1cm4gZFAoTywgUCwgQXR0cmlidXRlcyk7XG4gIH0gY2F0Y2ggKGUpIHsgLyogZW1wdHkgKi8gfVxuICBpZiAoJ2dldCcgaW4gQXR0cmlidXRlcyB8fCAnc2V0JyBpbiBBdHRyaWJ1dGVzKSB0aHJvdyBUeXBlRXJyb3IoJ0FjY2Vzc29ycyBub3Qgc3VwcG9ydGVkIScpO1xuICBpZiAoJ3ZhbHVlJyBpbiBBdHRyaWJ1dGVzKSBPW1BdID0gQXR0cmlidXRlcy52YWx1ZTtcbiAgcmV0dXJuIE87XG59O1xuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoYml0bWFwLCB2YWx1ZSkge1xuICByZXR1cm4ge1xuICAgIGVudW1lcmFibGU6ICEoYml0bWFwICYgMSksXG4gICAgY29uZmlndXJhYmxlOiAhKGJpdG1hcCAmIDIpLFxuICAgIHdyaXRhYmxlOiAhKGJpdG1hcCAmIDQpLFxuICAgIHZhbHVlOiB2YWx1ZVxuICB9O1xufTtcbiIsIi8vIDcuMS4xIFRvUHJpbWl0aXZlKGlucHV0IFssIFByZWZlcnJlZFR5cGVdKVxudmFyIGlzT2JqZWN0ID0gcmVxdWlyZSgnLi9faXMtb2JqZWN0Jyk7XG4vLyBpbnN0ZWFkIG9mIHRoZSBFUzYgc3BlYyB2ZXJzaW9uLCB3ZSBkaWRuJ3QgaW1wbGVtZW50IEBAdG9QcmltaXRpdmUgY2FzZVxuLy8gYW5kIHRoZSBzZWNvbmQgYXJndW1lbnQgLSBmbGFnIC0gcHJlZmVycmVkIHR5cGUgaXMgYSBzdHJpbmdcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGl0LCBTKSB7XG4gIGlmICghaXNPYmplY3QoaXQpKSByZXR1cm4gaXQ7XG4gIHZhciBmbiwgdmFsO1xuICBpZiAoUyAmJiB0eXBlb2YgKGZuID0gaXQudG9TdHJpbmcpID09ICdmdW5jdGlvbicgJiYgIWlzT2JqZWN0KHZhbCA9IGZuLmNhbGwoaXQpKSkgcmV0dXJuIHZhbDtcbiAgaWYgKHR5cGVvZiAoZm4gPSBpdC52YWx1ZU9mKSA9PSAnZnVuY3Rpb24nICYmICFpc09iamVjdCh2YWwgPSBmbi5jYWxsKGl0KSkpIHJldHVybiB2YWw7XG4gIGlmICghUyAmJiB0eXBlb2YgKGZuID0gaXQudG9TdHJpbmcpID09ICdmdW5jdGlvbicgJiYgIWlzT2JqZWN0KHZhbCA9IGZuLmNhbGwoaXQpKSkgcmV0dXJuIHZhbDtcbiAgdGhyb3cgVHlwZUVycm9yKFwiQ2FuJ3QgY29udmVydCBvYmplY3QgdG8gcHJpbWl0aXZlIHZhbHVlXCIpO1xufTtcbiIsInZhciAkZXhwb3J0ID0gcmVxdWlyZSgnLi9fZXhwb3J0Jyk7XG4vLyAxOS4xLjIuNCAvIDE1LjIuMy42IE9iamVjdC5kZWZpbmVQcm9wZXJ0eShPLCBQLCBBdHRyaWJ1dGVzKVxuJGV4cG9ydCgkZXhwb3J0LlMgKyAkZXhwb3J0LkYgKiAhcmVxdWlyZSgnLi9fZGVzY3JpcHRvcnMnKSwgJ09iamVjdCcsIHsgZGVmaW5lUHJvcGVydHk6IHJlcXVpcmUoJy4vX29iamVjdC1kcCcpLmYgfSk7XG4iLCIvKipcbiAqIFRoaXMgaXMgdGhlIHdlYiBicm93c2VyIGltcGxlbWVudGF0aW9uIG9mIGBkZWJ1ZygpYC5cbiAqXG4gKiBFeHBvc2UgYGRlYnVnKClgIGFzIHRoZSBtb2R1bGUuXG4gKi9cblxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gcmVxdWlyZSgnLi9kZWJ1ZycpO1xuZXhwb3J0cy5sb2cgPSBsb2c7XG5leHBvcnRzLmZvcm1hdEFyZ3MgPSBmb3JtYXRBcmdzO1xuZXhwb3J0cy5zYXZlID0gc2F2ZTtcbmV4cG9ydHMubG9hZCA9IGxvYWQ7XG5leHBvcnRzLnVzZUNvbG9ycyA9IHVzZUNvbG9ycztcbmV4cG9ydHMuc3RvcmFnZSA9ICd1bmRlZmluZWQnICE9IHR5cGVvZiBjaHJvbWVcbiAgICAgICAgICAgICAgICYmICd1bmRlZmluZWQnICE9IHR5cGVvZiBjaHJvbWUuc3RvcmFnZVxuICAgICAgICAgICAgICAgICAgPyBjaHJvbWUuc3RvcmFnZS5sb2NhbFxuICAgICAgICAgICAgICAgICAgOiBsb2NhbHN0b3JhZ2UoKTtcblxuLyoqXG4gKiBDb2xvcnMuXG4gKi9cblxuZXhwb3J0cy5jb2xvcnMgPSBbXG4gICdsaWdodHNlYWdyZWVuJyxcbiAgJ2ZvcmVzdGdyZWVuJyxcbiAgJ2dvbGRlbnJvZCcsXG4gICdkb2RnZXJibHVlJyxcbiAgJ2RhcmtvcmNoaWQnLFxuICAnY3JpbXNvbidcbl07XG5cbi8qKlxuICogQ3VycmVudGx5IG9ubHkgV2ViS2l0LWJhc2VkIFdlYiBJbnNwZWN0b3JzLCBGaXJlZm94ID49IHYzMSxcbiAqIGFuZCB0aGUgRmlyZWJ1ZyBleHRlbnNpb24gKGFueSBGaXJlZm94IHZlcnNpb24pIGFyZSBrbm93blxuICogdG8gc3VwcG9ydCBcIiVjXCIgQ1NTIGN1c3RvbWl6YXRpb25zLlxuICpcbiAqIFRPRE86IGFkZCBhIGBsb2NhbFN0b3JhZ2VgIHZhcmlhYmxlIHRvIGV4cGxpY2l0bHkgZW5hYmxlL2Rpc2FibGUgY29sb3JzXG4gKi9cblxuZnVuY3Rpb24gdXNlQ29sb3JzKCkge1xuICAvLyBOQjogSW4gYW4gRWxlY3Ryb24gcHJlbG9hZCBzY3JpcHQsIGRvY3VtZW50IHdpbGwgYmUgZGVmaW5lZCBidXQgbm90IGZ1bGx5XG4gIC8vIGluaXRpYWxpemVkLiBTaW5jZSB3ZSBrbm93IHdlJ3JlIGluIENocm9tZSwgd2UnbGwganVzdCBkZXRlY3QgdGhpcyBjYXNlXG4gIC8vIGV4cGxpY2l0bHlcbiAgaWYgKHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnICYmIHdpbmRvdy5wcm9jZXNzICYmIHdpbmRvdy5wcm9jZXNzLnR5cGUgPT09ICdyZW5kZXJlcicpIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIC8vIGlzIHdlYmtpdD8gaHR0cDovL3N0YWNrb3ZlcmZsb3cuY29tL2EvMTY0NTk2MDYvMzc2NzczXG4gIC8vIGRvY3VtZW50IGlzIHVuZGVmaW5lZCBpbiByZWFjdC1uYXRpdmU6IGh0dHBzOi8vZ2l0aHViLmNvbS9mYWNlYm9vay9yZWFjdC1uYXRpdmUvcHVsbC8xNjMyXG4gIHJldHVybiAodHlwZW9mIGRvY3VtZW50ICE9PSAndW5kZWZpbmVkJyAmJiBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQgJiYgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LnN0eWxlICYmIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5zdHlsZS5XZWJraXRBcHBlYXJhbmNlKSB8fFxuICAgIC8vIGlzIGZpcmVidWc/IGh0dHA6Ly9zdGFja292ZXJmbG93LmNvbS9hLzM5ODEyMC8zNzY3NzNcbiAgICAodHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgJiYgd2luZG93LmNvbnNvbGUgJiYgKHdpbmRvdy5jb25zb2xlLmZpcmVidWcgfHwgKHdpbmRvdy5jb25zb2xlLmV4Y2VwdGlvbiAmJiB3aW5kb3cuY29uc29sZS50YWJsZSkpKSB8fFxuICAgIC8vIGlzIGZpcmVmb3ggPj0gdjMxP1xuICAgIC8vIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvVG9vbHMvV2ViX0NvbnNvbGUjU3R5bGluZ19tZXNzYWdlc1xuICAgICh0eXBlb2YgbmF2aWdhdG9yICE9PSAndW5kZWZpbmVkJyAmJiBuYXZpZ2F0b3IudXNlckFnZW50ICYmIG5hdmlnYXRvci51c2VyQWdlbnQudG9Mb3dlckNhc2UoKS5tYXRjaCgvZmlyZWZveFxcLyhcXGQrKS8pICYmIHBhcnNlSW50KFJlZ0V4cC4kMSwgMTApID49IDMxKSB8fFxuICAgIC8vIGRvdWJsZSBjaGVjayB3ZWJraXQgaW4gdXNlckFnZW50IGp1c3QgaW4gY2FzZSB3ZSBhcmUgaW4gYSB3b3JrZXJcbiAgICAodHlwZW9mIG5hdmlnYXRvciAhPT0gJ3VuZGVmaW5lZCcgJiYgbmF2aWdhdG9yLnVzZXJBZ2VudCAmJiBuYXZpZ2F0b3IudXNlckFnZW50LnRvTG93ZXJDYXNlKCkubWF0Y2goL2FwcGxld2Via2l0XFwvKFxcZCspLykpO1xufVxuXG4vKipcbiAqIE1hcCAlaiB0byBgSlNPTi5zdHJpbmdpZnkoKWAsIHNpbmNlIG5vIFdlYiBJbnNwZWN0b3JzIGRvIHRoYXQgYnkgZGVmYXVsdC5cbiAqL1xuXG5leHBvcnRzLmZvcm1hdHRlcnMuaiA9IGZ1bmN0aW9uKHYpIHtcbiAgdHJ5IHtcbiAgICByZXR1cm4gSlNPTi5zdHJpbmdpZnkodik7XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIHJldHVybiAnW1VuZXhwZWN0ZWRKU09OUGFyc2VFcnJvcl06ICcgKyBlcnIubWVzc2FnZTtcbiAgfVxufTtcblxuXG4vKipcbiAqIENvbG9yaXplIGxvZyBhcmd1bWVudHMgaWYgZW5hYmxlZC5cbiAqXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIGZvcm1hdEFyZ3MoYXJncykge1xuICB2YXIgdXNlQ29sb3JzID0gdGhpcy51c2VDb2xvcnM7XG5cbiAgYXJnc1swXSA9ICh1c2VDb2xvcnMgPyAnJWMnIDogJycpXG4gICAgKyB0aGlzLm5hbWVzcGFjZVxuICAgICsgKHVzZUNvbG9ycyA/ICcgJWMnIDogJyAnKVxuICAgICsgYXJnc1swXVxuICAgICsgKHVzZUNvbG9ycyA/ICclYyAnIDogJyAnKVxuICAgICsgJysnICsgZXhwb3J0cy5odW1hbml6ZSh0aGlzLmRpZmYpO1xuXG4gIGlmICghdXNlQ29sb3JzKSByZXR1cm47XG5cbiAgdmFyIGMgPSAnY29sb3I6ICcgKyB0aGlzLmNvbG9yO1xuICBhcmdzLnNwbGljZSgxLCAwLCBjLCAnY29sb3I6IGluaGVyaXQnKVxuXG4gIC8vIHRoZSBmaW5hbCBcIiVjXCIgaXMgc29tZXdoYXQgdHJpY2t5LCBiZWNhdXNlIHRoZXJlIGNvdWxkIGJlIG90aGVyXG4gIC8vIGFyZ3VtZW50cyBwYXNzZWQgZWl0aGVyIGJlZm9yZSBvciBhZnRlciB0aGUgJWMsIHNvIHdlIG5lZWQgdG9cbiAgLy8gZmlndXJlIG91dCB0aGUgY29ycmVjdCBpbmRleCB0byBpbnNlcnQgdGhlIENTUyBpbnRvXG4gIHZhciBpbmRleCA9IDA7XG4gIHZhciBsYXN0QyA9IDA7XG4gIGFyZ3NbMF0ucmVwbGFjZSgvJVthLXpBLVolXS9nLCBmdW5jdGlvbihtYXRjaCkge1xuICAgIGlmICgnJSUnID09PSBtYXRjaCkgcmV0dXJuO1xuICAgIGluZGV4Kys7XG4gICAgaWYgKCclYycgPT09IG1hdGNoKSB7XG4gICAgICAvLyB3ZSBvbmx5IGFyZSBpbnRlcmVzdGVkIGluIHRoZSAqbGFzdCogJWNcbiAgICAgIC8vICh0aGUgdXNlciBtYXkgaGF2ZSBwcm92aWRlZCB0aGVpciBvd24pXG4gICAgICBsYXN0QyA9IGluZGV4O1xuICAgIH1cbiAgfSk7XG5cbiAgYXJncy5zcGxpY2UobGFzdEMsIDAsIGMpO1xufVxuXG4vKipcbiAqIEludm9rZXMgYGNvbnNvbGUubG9nKClgIHdoZW4gYXZhaWxhYmxlLlxuICogTm8tb3Agd2hlbiBgY29uc29sZS5sb2dgIGlzIG5vdCBhIFwiZnVuY3Rpb25cIi5cbiAqXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIGxvZygpIHtcbiAgLy8gdGhpcyBoYWNrZXJ5IGlzIHJlcXVpcmVkIGZvciBJRTgvOSwgd2hlcmVcbiAgLy8gdGhlIGBjb25zb2xlLmxvZ2AgZnVuY3Rpb24gZG9lc24ndCBoYXZlICdhcHBseSdcbiAgcmV0dXJuICdvYmplY3QnID09PSB0eXBlb2YgY29uc29sZVxuICAgICYmIGNvbnNvbGUubG9nXG4gICAgJiYgRnVuY3Rpb24ucHJvdG90eXBlLmFwcGx5LmNhbGwoY29uc29sZS5sb2csIGNvbnNvbGUsIGFyZ3VtZW50cyk7XG59XG5cbi8qKlxuICogU2F2ZSBgbmFtZXNwYWNlc2AuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWVzcGFjZXNcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIHNhdmUobmFtZXNwYWNlcykge1xuICB0cnkge1xuICAgIGlmIChudWxsID09IG5hbWVzcGFjZXMpIHtcbiAgICAgIGV4cG9ydHMuc3RvcmFnZS5yZW1vdmVJdGVtKCdkZWJ1ZycpO1xuICAgIH0gZWxzZSB7XG4gICAgICBleHBvcnRzLnN0b3JhZ2UuZGVidWcgPSBuYW1lc3BhY2VzO1xuICAgIH1cbiAgfSBjYXRjaChlKSB7fVxufVxuXG4vKipcbiAqIExvYWQgYG5hbWVzcGFjZXNgLlxuICpcbiAqIEByZXR1cm4ge1N0cmluZ30gcmV0dXJucyB0aGUgcHJldmlvdXNseSBwZXJzaXN0ZWQgZGVidWcgbW9kZXNcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIGxvYWQoKSB7XG4gIHZhciByO1xuICB0cnkge1xuICAgIHIgPSBleHBvcnRzLnN0b3JhZ2UuZGVidWc7XG4gIH0gY2F0Y2goZSkge31cblxuICAvLyBJZiBkZWJ1ZyBpc24ndCBzZXQgaW4gTFMsIGFuZCB3ZSdyZSBpbiBFbGVjdHJvbiwgdHJ5IHRvIGxvYWQgJERFQlVHXG4gIGlmICghciAmJiB0eXBlb2YgcHJvY2VzcyAhPT0gJ3VuZGVmaW5lZCcgJiYgJ2VudicgaW4gcHJvY2Vzcykge1xuICAgIHIgPSBwcm9jZXNzLmVudi5ERUJVRztcbiAgfVxuXG4gIHJldHVybiByO1xufVxuXG4vKipcbiAqIEVuYWJsZSBuYW1lc3BhY2VzIGxpc3RlZCBpbiBgbG9jYWxTdG9yYWdlLmRlYnVnYCBpbml0aWFsbHkuXG4gKi9cblxuZXhwb3J0cy5lbmFibGUobG9hZCgpKTtcblxuLyoqXG4gKiBMb2NhbHN0b3JhZ2UgYXR0ZW1wdHMgdG8gcmV0dXJuIHRoZSBsb2NhbHN0b3JhZ2UuXG4gKlxuICogVGhpcyBpcyBuZWNlc3NhcnkgYmVjYXVzZSBzYWZhcmkgdGhyb3dzXG4gKiB3aGVuIGEgdXNlciBkaXNhYmxlcyBjb29raWVzL2xvY2Fsc3RvcmFnZVxuICogYW5kIHlvdSBhdHRlbXB0IHRvIGFjY2VzcyBpdC5cbiAqXG4gKiBAcmV0dXJuIHtMb2NhbFN0b3JhZ2V9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBsb2NhbHN0b3JhZ2UoKSB7XG4gIHRyeSB7XG4gICAgcmV0dXJuIHdpbmRvdy5sb2NhbFN0b3JhZ2U7XG4gIH0gY2F0Y2ggKGUpIHt9XG59XG4iLCJcbi8qKlxuICogVGhpcyBpcyB0aGUgY29tbW9uIGxvZ2ljIGZvciBib3RoIHRoZSBOb2RlLmpzIGFuZCB3ZWIgYnJvd3NlclxuICogaW1wbGVtZW50YXRpb25zIG9mIGBkZWJ1ZygpYC5cbiAqXG4gKiBFeHBvc2UgYGRlYnVnKClgIGFzIHRoZSBtb2R1bGUuXG4gKi9cblxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gY3JlYXRlRGVidWcuZGVidWcgPSBjcmVhdGVEZWJ1Z1snZGVmYXVsdCddID0gY3JlYXRlRGVidWc7XG5leHBvcnRzLmNvZXJjZSA9IGNvZXJjZTtcbmV4cG9ydHMuZGlzYWJsZSA9IGRpc2FibGU7XG5leHBvcnRzLmVuYWJsZSA9IGVuYWJsZTtcbmV4cG9ydHMuZW5hYmxlZCA9IGVuYWJsZWQ7XG5leHBvcnRzLmh1bWFuaXplID0gcmVxdWlyZSgnbXMnKTtcblxuLyoqXG4gKiBUaGUgY3VycmVudGx5IGFjdGl2ZSBkZWJ1ZyBtb2RlIG5hbWVzLCBhbmQgbmFtZXMgdG8gc2tpcC5cbiAqL1xuXG5leHBvcnRzLm5hbWVzID0gW107XG5leHBvcnRzLnNraXBzID0gW107XG5cbi8qKlxuICogTWFwIG9mIHNwZWNpYWwgXCIlblwiIGhhbmRsaW5nIGZ1bmN0aW9ucywgZm9yIHRoZSBkZWJ1ZyBcImZvcm1hdFwiIGFyZ3VtZW50LlxuICpcbiAqIFZhbGlkIGtleSBuYW1lcyBhcmUgYSBzaW5nbGUsIGxvd2VyIG9yIHVwcGVyLWNhc2UgbGV0dGVyLCBpLmUuIFwiblwiIGFuZCBcIk5cIi5cbiAqL1xuXG5leHBvcnRzLmZvcm1hdHRlcnMgPSB7fTtcblxuLyoqXG4gKiBQcmV2aW91cyBsb2cgdGltZXN0YW1wLlxuICovXG5cbnZhciBwcmV2VGltZTtcblxuLyoqXG4gKiBTZWxlY3QgYSBjb2xvci5cbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lc3BhY2VcbiAqIEByZXR1cm4ge051bWJlcn1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIHNlbGVjdENvbG9yKG5hbWVzcGFjZSkge1xuICB2YXIgaGFzaCA9IDAsIGk7XG5cbiAgZm9yIChpIGluIG5hbWVzcGFjZSkge1xuICAgIGhhc2ggID0gKChoYXNoIDw8IDUpIC0gaGFzaCkgKyBuYW1lc3BhY2UuY2hhckNvZGVBdChpKTtcbiAgICBoYXNoIHw9IDA7IC8vIENvbnZlcnQgdG8gMzJiaXQgaW50ZWdlclxuICB9XG5cbiAgcmV0dXJuIGV4cG9ydHMuY29sb3JzW01hdGguYWJzKGhhc2gpICUgZXhwb3J0cy5jb2xvcnMubGVuZ3RoXTtcbn1cblxuLyoqXG4gKiBDcmVhdGUgYSBkZWJ1Z2dlciB3aXRoIHRoZSBnaXZlbiBgbmFtZXNwYWNlYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZXNwYWNlXG4gKiBAcmV0dXJuIHtGdW5jdGlvbn1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gY3JlYXRlRGVidWcobmFtZXNwYWNlKSB7XG5cbiAgZnVuY3Rpb24gZGVidWcoKSB7XG4gICAgLy8gZGlzYWJsZWQ/XG4gICAgaWYgKCFkZWJ1Zy5lbmFibGVkKSByZXR1cm47XG5cbiAgICB2YXIgc2VsZiA9IGRlYnVnO1xuXG4gICAgLy8gc2V0IGBkaWZmYCB0aW1lc3RhbXBcbiAgICB2YXIgY3VyciA9ICtuZXcgRGF0ZSgpO1xuICAgIHZhciBtcyA9IGN1cnIgLSAocHJldlRpbWUgfHwgY3Vycik7XG4gICAgc2VsZi5kaWZmID0gbXM7XG4gICAgc2VsZi5wcmV2ID0gcHJldlRpbWU7XG4gICAgc2VsZi5jdXJyID0gY3VycjtcbiAgICBwcmV2VGltZSA9IGN1cnI7XG5cbiAgICAvLyB0dXJuIHRoZSBgYXJndW1lbnRzYCBpbnRvIGEgcHJvcGVyIEFycmF5XG4gICAgdmFyIGFyZ3MgPSBuZXcgQXJyYXkoYXJndW1lbnRzLmxlbmd0aCk7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcmdzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBhcmdzW2ldID0gYXJndW1lbnRzW2ldO1xuICAgIH1cblxuICAgIGFyZ3NbMF0gPSBleHBvcnRzLmNvZXJjZShhcmdzWzBdKTtcblxuICAgIGlmICgnc3RyaW5nJyAhPT0gdHlwZW9mIGFyZ3NbMF0pIHtcbiAgICAgIC8vIGFueXRoaW5nIGVsc2UgbGV0J3MgaW5zcGVjdCB3aXRoICVPXG4gICAgICBhcmdzLnVuc2hpZnQoJyVPJyk7XG4gICAgfVxuXG4gICAgLy8gYXBwbHkgYW55IGBmb3JtYXR0ZXJzYCB0cmFuc2Zvcm1hdGlvbnNcbiAgICB2YXIgaW5kZXggPSAwO1xuICAgIGFyZ3NbMF0gPSBhcmdzWzBdLnJlcGxhY2UoLyUoW2EtekEtWiVdKS9nLCBmdW5jdGlvbihtYXRjaCwgZm9ybWF0KSB7XG4gICAgICAvLyBpZiB3ZSBlbmNvdW50ZXIgYW4gZXNjYXBlZCAlIHRoZW4gZG9uJ3QgaW5jcmVhc2UgdGhlIGFycmF5IGluZGV4XG4gICAgICBpZiAobWF0Y2ggPT09ICclJScpIHJldHVybiBtYXRjaDtcbiAgICAgIGluZGV4Kys7XG4gICAgICB2YXIgZm9ybWF0dGVyID0gZXhwb3J0cy5mb3JtYXR0ZXJzW2Zvcm1hdF07XG4gICAgICBpZiAoJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIGZvcm1hdHRlcikge1xuICAgICAgICB2YXIgdmFsID0gYXJnc1tpbmRleF07XG4gICAgICAgIG1hdGNoID0gZm9ybWF0dGVyLmNhbGwoc2VsZiwgdmFsKTtcblxuICAgICAgICAvLyBub3cgd2UgbmVlZCB0byByZW1vdmUgYGFyZ3NbaW5kZXhdYCBzaW5jZSBpdCdzIGlubGluZWQgaW4gdGhlIGBmb3JtYXRgXG4gICAgICAgIGFyZ3Muc3BsaWNlKGluZGV4LCAxKTtcbiAgICAgICAgaW5kZXgtLTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBtYXRjaDtcbiAgICB9KTtcblxuICAgIC8vIGFwcGx5IGVudi1zcGVjaWZpYyBmb3JtYXR0aW5nIChjb2xvcnMsIGV0Yy4pXG4gICAgZXhwb3J0cy5mb3JtYXRBcmdzLmNhbGwoc2VsZiwgYXJncyk7XG5cbiAgICB2YXIgbG9nRm4gPSBkZWJ1Zy5sb2cgfHwgZXhwb3J0cy5sb2cgfHwgY29uc29sZS5sb2cuYmluZChjb25zb2xlKTtcbiAgICBsb2dGbi5hcHBseShzZWxmLCBhcmdzKTtcbiAgfVxuXG4gIGRlYnVnLm5hbWVzcGFjZSA9IG5hbWVzcGFjZTtcbiAgZGVidWcuZW5hYmxlZCA9IGV4cG9ydHMuZW5hYmxlZChuYW1lc3BhY2UpO1xuICBkZWJ1Zy51c2VDb2xvcnMgPSBleHBvcnRzLnVzZUNvbG9ycygpO1xuICBkZWJ1Zy5jb2xvciA9IHNlbGVjdENvbG9yKG5hbWVzcGFjZSk7XG5cbiAgLy8gZW52LXNwZWNpZmljIGluaXRpYWxpemF0aW9uIGxvZ2ljIGZvciBkZWJ1ZyBpbnN0YW5jZXNcbiAgaWYgKCdmdW5jdGlvbicgPT09IHR5cGVvZiBleHBvcnRzLmluaXQpIHtcbiAgICBleHBvcnRzLmluaXQoZGVidWcpO1xuICB9XG5cbiAgcmV0dXJuIGRlYnVnO1xufVxuXG4vKipcbiAqIEVuYWJsZXMgYSBkZWJ1ZyBtb2RlIGJ5IG5hbWVzcGFjZXMuIFRoaXMgY2FuIGluY2x1ZGUgbW9kZXNcbiAqIHNlcGFyYXRlZCBieSBhIGNvbG9uIGFuZCB3aWxkY2FyZHMuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWVzcGFjZXNcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gZW5hYmxlKG5hbWVzcGFjZXMpIHtcbiAgZXhwb3J0cy5zYXZlKG5hbWVzcGFjZXMpO1xuXG4gIGV4cG9ydHMubmFtZXMgPSBbXTtcbiAgZXhwb3J0cy5za2lwcyA9IFtdO1xuXG4gIHZhciBzcGxpdCA9ICh0eXBlb2YgbmFtZXNwYWNlcyA9PT0gJ3N0cmluZycgPyBuYW1lc3BhY2VzIDogJycpLnNwbGl0KC9bXFxzLF0rLyk7XG4gIHZhciBsZW4gPSBzcGxpdC5sZW5ndGg7XG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW47IGkrKykge1xuICAgIGlmICghc3BsaXRbaV0pIGNvbnRpbnVlOyAvLyBpZ25vcmUgZW1wdHkgc3RyaW5nc1xuICAgIG5hbWVzcGFjZXMgPSBzcGxpdFtpXS5yZXBsYWNlKC9cXCovZywgJy4qPycpO1xuICAgIGlmIChuYW1lc3BhY2VzWzBdID09PSAnLScpIHtcbiAgICAgIGV4cG9ydHMuc2tpcHMucHVzaChuZXcgUmVnRXhwKCdeJyArIG5hbWVzcGFjZXMuc3Vic3RyKDEpICsgJyQnKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGV4cG9ydHMubmFtZXMucHVzaChuZXcgUmVnRXhwKCdeJyArIG5hbWVzcGFjZXMgKyAnJCcpKTtcbiAgICB9XG4gIH1cbn1cblxuLyoqXG4gKiBEaXNhYmxlIGRlYnVnIG91dHB1dC5cbiAqXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIGRpc2FibGUoKSB7XG4gIGV4cG9ydHMuZW5hYmxlKCcnKTtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIHRydWUgaWYgdGhlIGdpdmVuIG1vZGUgbmFtZSBpcyBlbmFibGVkLCBmYWxzZSBvdGhlcndpc2UuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWVcbiAqIEByZXR1cm4ge0Jvb2xlYW59XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIGVuYWJsZWQobmFtZSkge1xuICB2YXIgaSwgbGVuO1xuICBmb3IgKGkgPSAwLCBsZW4gPSBleHBvcnRzLnNraXBzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgaWYgKGV4cG9ydHMuc2tpcHNbaV0udGVzdChuYW1lKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuICBmb3IgKGkgPSAwLCBsZW4gPSBleHBvcnRzLm5hbWVzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgaWYgKGV4cG9ydHMubmFtZXNbaV0udGVzdChuYW1lKSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICB9XG4gIHJldHVybiBmYWxzZTtcbn1cblxuLyoqXG4gKiBDb2VyY2UgYHZhbGAuXG4gKlxuICogQHBhcmFtIHtNaXhlZH0gdmFsXG4gKiBAcmV0dXJuIHtNaXhlZH1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIGNvZXJjZSh2YWwpIHtcbiAgaWYgKHZhbCBpbnN0YW5jZW9mIEVycm9yKSByZXR1cm4gdmFsLnN0YWNrIHx8IHZhbC5tZXNzYWdlO1xuICByZXR1cm4gdmFsO1xufVxuIiwiLyoqXG4gKiBIZWxwZXJzLlxuICovXG5cbnZhciBzID0gMTAwMDtcbnZhciBtID0gcyAqIDYwO1xudmFyIGggPSBtICogNjA7XG52YXIgZCA9IGggKiAyNDtcbnZhciB5ID0gZCAqIDM2NS4yNTtcblxuLyoqXG4gKiBQYXJzZSBvciBmb3JtYXQgdGhlIGdpdmVuIGB2YWxgLlxuICpcbiAqIE9wdGlvbnM6XG4gKlxuICogIC0gYGxvbmdgIHZlcmJvc2UgZm9ybWF0dGluZyBbZmFsc2VdXG4gKlxuICogQHBhcmFtIHtTdHJpbmd8TnVtYmVyfSB2YWxcbiAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc11cbiAqIEB0aHJvd3Mge0Vycm9yfSB0aHJvdyBhbiBlcnJvciBpZiB2YWwgaXMgbm90IGEgbm9uLWVtcHR5IHN0cmluZyBvciBhIG51bWJlclxuICogQHJldHVybiB7U3RyaW5nfE51bWJlcn1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbih2YWwsIG9wdGlvbnMpIHtcbiAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gIHZhciB0eXBlID0gdHlwZW9mIHZhbDtcbiAgaWYgKHR5cGUgPT09ICdzdHJpbmcnICYmIHZhbC5sZW5ndGggPiAwKSB7XG4gICAgcmV0dXJuIHBhcnNlKHZhbCk7XG4gIH0gZWxzZSBpZiAodHlwZSA9PT0gJ251bWJlcicgJiYgaXNOYU4odmFsKSA9PT0gZmFsc2UpIHtcbiAgICByZXR1cm4gb3B0aW9ucy5sb25nID8gZm10TG9uZyh2YWwpIDogZm10U2hvcnQodmFsKTtcbiAgfVxuICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgJ3ZhbCBpcyBub3QgYSBub24tZW1wdHkgc3RyaW5nIG9yIGEgdmFsaWQgbnVtYmVyLiB2YWw9JyArXG4gICAgICBKU09OLnN0cmluZ2lmeSh2YWwpXG4gICk7XG59O1xuXG4vKipcbiAqIFBhcnNlIHRoZSBnaXZlbiBgc3RyYCBhbmQgcmV0dXJuIG1pbGxpc2Vjb25kcy5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gc3RyXG4gKiBAcmV0dXJuIHtOdW1iZXJ9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBwYXJzZShzdHIpIHtcbiAgc3RyID0gU3RyaW5nKHN0cik7XG4gIGlmIChzdHIubGVuZ3RoID4gMTAwKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHZhciBtYXRjaCA9IC9eKCg/OlxcZCspP1xcLj9cXGQrKSAqKG1pbGxpc2Vjb25kcz98bXNlY3M/fG1zfHNlY29uZHM/fHNlY3M/fHN8bWludXRlcz98bWlucz98bXxob3Vycz98aHJzP3xofGRheXM/fGR8eWVhcnM/fHlycz98eSk/JC9pLmV4ZWMoXG4gICAgc3RyXG4gICk7XG4gIGlmICghbWF0Y2gpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgdmFyIG4gPSBwYXJzZUZsb2F0KG1hdGNoWzFdKTtcbiAgdmFyIHR5cGUgPSAobWF0Y2hbMl0gfHwgJ21zJykudG9Mb3dlckNhc2UoKTtcbiAgc3dpdGNoICh0eXBlKSB7XG4gICAgY2FzZSAneWVhcnMnOlxuICAgIGNhc2UgJ3llYXInOlxuICAgIGNhc2UgJ3lycyc6XG4gICAgY2FzZSAneXInOlxuICAgIGNhc2UgJ3knOlxuICAgICAgcmV0dXJuIG4gKiB5O1xuICAgIGNhc2UgJ2RheXMnOlxuICAgIGNhc2UgJ2RheSc6XG4gICAgY2FzZSAnZCc6XG4gICAgICByZXR1cm4gbiAqIGQ7XG4gICAgY2FzZSAnaG91cnMnOlxuICAgIGNhc2UgJ2hvdXInOlxuICAgIGNhc2UgJ2hycyc6XG4gICAgY2FzZSAnaHInOlxuICAgIGNhc2UgJ2gnOlxuICAgICAgcmV0dXJuIG4gKiBoO1xuICAgIGNhc2UgJ21pbnV0ZXMnOlxuICAgIGNhc2UgJ21pbnV0ZSc6XG4gICAgY2FzZSAnbWlucyc6XG4gICAgY2FzZSAnbWluJzpcbiAgICBjYXNlICdtJzpcbiAgICAgIHJldHVybiBuICogbTtcbiAgICBjYXNlICdzZWNvbmRzJzpcbiAgICBjYXNlICdzZWNvbmQnOlxuICAgIGNhc2UgJ3NlY3MnOlxuICAgIGNhc2UgJ3NlYyc6XG4gICAgY2FzZSAncyc6XG4gICAgICByZXR1cm4gbiAqIHM7XG4gICAgY2FzZSAnbWlsbGlzZWNvbmRzJzpcbiAgICBjYXNlICdtaWxsaXNlY29uZCc6XG4gICAgY2FzZSAnbXNlY3MnOlxuICAgIGNhc2UgJ21zZWMnOlxuICAgIGNhc2UgJ21zJzpcbiAgICAgIHJldHVybiBuO1xuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9XG59XG5cbi8qKlxuICogU2hvcnQgZm9ybWF0IGZvciBgbXNgLlxuICpcbiAqIEBwYXJhbSB7TnVtYmVyfSBtc1xuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gZm10U2hvcnQobXMpIHtcbiAgaWYgKG1zID49IGQpIHtcbiAgICByZXR1cm4gTWF0aC5yb3VuZChtcyAvIGQpICsgJ2QnO1xuICB9XG4gIGlmIChtcyA+PSBoKSB7XG4gICAgcmV0dXJuIE1hdGgucm91bmQobXMgLyBoKSArICdoJztcbiAgfVxuICBpZiAobXMgPj0gbSkge1xuICAgIHJldHVybiBNYXRoLnJvdW5kKG1zIC8gbSkgKyAnbSc7XG4gIH1cbiAgaWYgKG1zID49IHMpIHtcbiAgICByZXR1cm4gTWF0aC5yb3VuZChtcyAvIHMpICsgJ3MnO1xuICB9XG4gIHJldHVybiBtcyArICdtcyc7XG59XG5cbi8qKlxuICogTG9uZyBmb3JtYXQgZm9yIGBtc2AuXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ9IG1zXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBmbXRMb25nKG1zKSB7XG4gIHJldHVybiBwbHVyYWwobXMsIGQsICdkYXknKSB8fFxuICAgIHBsdXJhbChtcywgaCwgJ2hvdXInKSB8fFxuICAgIHBsdXJhbChtcywgbSwgJ21pbnV0ZScpIHx8XG4gICAgcGx1cmFsKG1zLCBzLCAnc2Vjb25kJykgfHxcbiAgICBtcyArICcgbXMnO1xufVxuXG4vKipcbiAqIFBsdXJhbGl6YXRpb24gaGVscGVyLlxuICovXG5cbmZ1bmN0aW9uIHBsdXJhbChtcywgbiwgbmFtZSkge1xuICBpZiAobXMgPCBuKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmIChtcyA8IG4gKiAxLjUpIHtcbiAgICByZXR1cm4gTWF0aC5mbG9vcihtcyAvIG4pICsgJyAnICsgbmFtZTtcbiAgfVxuICByZXR1cm4gTWF0aC5jZWlsKG1zIC8gbikgKyAnICcgKyBuYW1lICsgJ3MnO1xufVxuIiwiLy8gc2hpbSBmb3IgdXNpbmcgcHJvY2VzcyBpbiBicm93c2VyXG52YXIgcHJvY2VzcyA9IG1vZHVsZS5leHBvcnRzID0ge307XG5cbi8vIGNhY2hlZCBmcm9tIHdoYXRldmVyIGdsb2JhbCBpcyBwcmVzZW50IHNvIHRoYXQgdGVzdCBydW5uZXJzIHRoYXQgc3R1YiBpdFxuLy8gZG9uJ3QgYnJlYWsgdGhpbmdzLiAgQnV0IHdlIG5lZWQgdG8gd3JhcCBpdCBpbiBhIHRyeSBjYXRjaCBpbiBjYXNlIGl0IGlzXG4vLyB3cmFwcGVkIGluIHN0cmljdCBtb2RlIGNvZGUgd2hpY2ggZG9lc24ndCBkZWZpbmUgYW55IGdsb2JhbHMuICBJdCdzIGluc2lkZSBhXG4vLyBmdW5jdGlvbiBiZWNhdXNlIHRyeS9jYXRjaGVzIGRlb3B0aW1pemUgaW4gY2VydGFpbiBlbmdpbmVzLlxuXG52YXIgY2FjaGVkU2V0VGltZW91dDtcbnZhciBjYWNoZWRDbGVhclRpbWVvdXQ7XG5cbmZ1bmN0aW9uIGRlZmF1bHRTZXRUaW1vdXQoKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdzZXRUaW1lb3V0IGhhcyBub3QgYmVlbiBkZWZpbmVkJyk7XG59XG5mdW5jdGlvbiBkZWZhdWx0Q2xlYXJUaW1lb3V0ICgpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2NsZWFyVGltZW91dCBoYXMgbm90IGJlZW4gZGVmaW5lZCcpO1xufVxuKGZ1bmN0aW9uICgpIHtcbiAgICB0cnkge1xuICAgICAgICBpZiAodHlwZW9mIHNldFRpbWVvdXQgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIGNhY2hlZFNldFRpbWVvdXQgPSBzZXRUaW1lb3V0O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY2FjaGVkU2V0VGltZW91dCA9IGRlZmF1bHRTZXRUaW1vdXQ7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNhY2hlZFNldFRpbWVvdXQgPSBkZWZhdWx0U2V0VGltb3V0O1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgICBpZiAodHlwZW9mIGNsZWFyVGltZW91dCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgY2FjaGVkQ2xlYXJUaW1lb3V0ID0gY2xlYXJUaW1lb3V0O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY2FjaGVkQ2xlYXJUaW1lb3V0ID0gZGVmYXVsdENsZWFyVGltZW91dDtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY2FjaGVkQ2xlYXJUaW1lb3V0ID0gZGVmYXVsdENsZWFyVGltZW91dDtcbiAgICB9XG59ICgpKVxuZnVuY3Rpb24gcnVuVGltZW91dChmdW4pIHtcbiAgICBpZiAoY2FjaGVkU2V0VGltZW91dCA9PT0gc2V0VGltZW91dCkge1xuICAgICAgICAvL25vcm1hbCBlbnZpcm9tZW50cyBpbiBzYW5lIHNpdHVhdGlvbnNcbiAgICAgICAgcmV0dXJuIHNldFRpbWVvdXQoZnVuLCAwKTtcbiAgICB9XG4gICAgLy8gaWYgc2V0VGltZW91dCB3YXNuJ3QgYXZhaWxhYmxlIGJ1dCB3YXMgbGF0dGVyIGRlZmluZWRcbiAgICBpZiAoKGNhY2hlZFNldFRpbWVvdXQgPT09IGRlZmF1bHRTZXRUaW1vdXQgfHwgIWNhY2hlZFNldFRpbWVvdXQpICYmIHNldFRpbWVvdXQpIHtcbiAgICAgICAgY2FjaGVkU2V0VGltZW91dCA9IHNldFRpbWVvdXQ7XG4gICAgICAgIHJldHVybiBzZXRUaW1lb3V0KGZ1biwgMCk7XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICAgIC8vIHdoZW4gd2hlbiBzb21lYm9keSBoYXMgc2NyZXdlZCB3aXRoIHNldFRpbWVvdXQgYnV0IG5vIEkuRS4gbWFkZG5lc3NcbiAgICAgICAgcmV0dXJuIGNhY2hlZFNldFRpbWVvdXQoZnVuLCAwKTtcbiAgICB9IGNhdGNoKGUpe1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gV2hlbiB3ZSBhcmUgaW4gSS5FLiBidXQgdGhlIHNjcmlwdCBoYXMgYmVlbiBldmFsZWQgc28gSS5FLiBkb2Vzbid0IHRydXN0IHRoZSBnbG9iYWwgb2JqZWN0IHdoZW4gY2FsbGVkIG5vcm1hbGx5XG4gICAgICAgICAgICByZXR1cm4gY2FjaGVkU2V0VGltZW91dC5jYWxsKG51bGwsIGZ1biwgMCk7XG4gICAgICAgIH0gY2F0Y2goZSl7XG4gICAgICAgICAgICAvLyBzYW1lIGFzIGFib3ZlIGJ1dCB3aGVuIGl0J3MgYSB2ZXJzaW9uIG9mIEkuRS4gdGhhdCBtdXN0IGhhdmUgdGhlIGdsb2JhbCBvYmplY3QgZm9yICd0aGlzJywgaG9wZnVsbHkgb3VyIGNvbnRleHQgY29ycmVjdCBvdGhlcndpc2UgaXQgd2lsbCB0aHJvdyBhIGdsb2JhbCBlcnJvclxuICAgICAgICAgICAgcmV0dXJuIGNhY2hlZFNldFRpbWVvdXQuY2FsbCh0aGlzLCBmdW4sIDApO1xuICAgICAgICB9XG4gICAgfVxuXG5cbn1cbmZ1bmN0aW9uIHJ1bkNsZWFyVGltZW91dChtYXJrZXIpIHtcbiAgICBpZiAoY2FjaGVkQ2xlYXJUaW1lb3V0ID09PSBjbGVhclRpbWVvdXQpIHtcbiAgICAgICAgLy9ub3JtYWwgZW52aXJvbWVudHMgaW4gc2FuZSBzaXR1YXRpb25zXG4gICAgICAgIHJldHVybiBjbGVhclRpbWVvdXQobWFya2VyKTtcbiAgICB9XG4gICAgLy8gaWYgY2xlYXJUaW1lb3V0IHdhc24ndCBhdmFpbGFibGUgYnV0IHdhcyBsYXR0ZXIgZGVmaW5lZFxuICAgIGlmICgoY2FjaGVkQ2xlYXJUaW1lb3V0ID09PSBkZWZhdWx0Q2xlYXJUaW1lb3V0IHx8ICFjYWNoZWRDbGVhclRpbWVvdXQpICYmIGNsZWFyVGltZW91dCkge1xuICAgICAgICBjYWNoZWRDbGVhclRpbWVvdXQgPSBjbGVhclRpbWVvdXQ7XG4gICAgICAgIHJldHVybiBjbGVhclRpbWVvdXQobWFya2VyKTtcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgICAgLy8gd2hlbiB3aGVuIHNvbWVib2R5IGhhcyBzY3Jld2VkIHdpdGggc2V0VGltZW91dCBidXQgbm8gSS5FLiBtYWRkbmVzc1xuICAgICAgICByZXR1cm4gY2FjaGVkQ2xlYXJUaW1lb3V0KG1hcmtlcik7XG4gICAgfSBjYXRjaCAoZSl7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBXaGVuIHdlIGFyZSBpbiBJLkUuIGJ1dCB0aGUgc2NyaXB0IGhhcyBiZWVuIGV2YWxlZCBzbyBJLkUuIGRvZXNuJ3QgIHRydXN0IHRoZSBnbG9iYWwgb2JqZWN0IHdoZW4gY2FsbGVkIG5vcm1hbGx5XG4gICAgICAgICAgICByZXR1cm4gY2FjaGVkQ2xlYXJUaW1lb3V0LmNhbGwobnVsbCwgbWFya2VyKTtcbiAgICAgICAgfSBjYXRjaCAoZSl7XG4gICAgICAgICAgICAvLyBzYW1lIGFzIGFib3ZlIGJ1dCB3aGVuIGl0J3MgYSB2ZXJzaW9uIG9mIEkuRS4gdGhhdCBtdXN0IGhhdmUgdGhlIGdsb2JhbCBvYmplY3QgZm9yICd0aGlzJywgaG9wZnVsbHkgb3VyIGNvbnRleHQgY29ycmVjdCBvdGhlcndpc2UgaXQgd2lsbCB0aHJvdyBhIGdsb2JhbCBlcnJvci5cbiAgICAgICAgICAgIC8vIFNvbWUgdmVyc2lvbnMgb2YgSS5FLiBoYXZlIGRpZmZlcmVudCBydWxlcyBmb3IgY2xlYXJUaW1lb3V0IHZzIHNldFRpbWVvdXRcbiAgICAgICAgICAgIHJldHVybiBjYWNoZWRDbGVhclRpbWVvdXQuY2FsbCh0aGlzLCBtYXJrZXIpO1xuICAgICAgICB9XG4gICAgfVxuXG5cblxufVxudmFyIHF1ZXVlID0gW107XG52YXIgZHJhaW5pbmcgPSBmYWxzZTtcbnZhciBjdXJyZW50UXVldWU7XG52YXIgcXVldWVJbmRleCA9IC0xO1xuXG5mdW5jdGlvbiBjbGVhblVwTmV4dFRpY2soKSB7XG4gICAgaWYgKCFkcmFpbmluZyB8fCAhY3VycmVudFF1ZXVlKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgZHJhaW5pbmcgPSBmYWxzZTtcbiAgICBpZiAoY3VycmVudFF1ZXVlLmxlbmd0aCkge1xuICAgICAgICBxdWV1ZSA9IGN1cnJlbnRRdWV1ZS5jb25jYXQocXVldWUpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHF1ZXVlSW5kZXggPSAtMTtcbiAgICB9XG4gICAgaWYgKHF1ZXVlLmxlbmd0aCkge1xuICAgICAgICBkcmFpblF1ZXVlKCk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBkcmFpblF1ZXVlKCkge1xuICAgIGlmIChkcmFpbmluZykge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIHZhciB0aW1lb3V0ID0gcnVuVGltZW91dChjbGVhblVwTmV4dFRpY2spO1xuICAgIGRyYWluaW5nID0gdHJ1ZTtcblxuICAgIHZhciBsZW4gPSBxdWV1ZS5sZW5ndGg7XG4gICAgd2hpbGUobGVuKSB7XG4gICAgICAgIGN1cnJlbnRRdWV1ZSA9IHF1ZXVlO1xuICAgICAgICBxdWV1ZSA9IFtdO1xuICAgICAgICB3aGlsZSAoKytxdWV1ZUluZGV4IDwgbGVuKSB7XG4gICAgICAgICAgICBpZiAoY3VycmVudFF1ZXVlKSB7XG4gICAgICAgICAgICAgICAgY3VycmVudFF1ZXVlW3F1ZXVlSW5kZXhdLnJ1bigpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHF1ZXVlSW5kZXggPSAtMTtcbiAgICAgICAgbGVuID0gcXVldWUubGVuZ3RoO1xuICAgIH1cbiAgICBjdXJyZW50UXVldWUgPSBudWxsO1xuICAgIGRyYWluaW5nID0gZmFsc2U7XG4gICAgcnVuQ2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xufVxuXG5wcm9jZXNzLm5leHRUaWNrID0gZnVuY3Rpb24gKGZ1bikge1xuICAgIHZhciBhcmdzID0gbmV3IEFycmF5KGFyZ3VtZW50cy5sZW5ndGggLSAxKTtcbiAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDE7IGkgPCBhcmd1bWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGFyZ3NbaSAtIDFdID0gYXJndW1lbnRzW2ldO1xuICAgICAgICB9XG4gICAgfVxuICAgIHF1ZXVlLnB1c2gobmV3IEl0ZW0oZnVuLCBhcmdzKSk7XG4gICAgaWYgKHF1ZXVlLmxlbmd0aCA9PT0gMSAmJiAhZHJhaW5pbmcpIHtcbiAgICAgICAgcnVuVGltZW91dChkcmFpblF1ZXVlKTtcbiAgICB9XG59O1xuXG4vLyB2OCBsaWtlcyBwcmVkaWN0aWJsZSBvYmplY3RzXG5mdW5jdGlvbiBJdGVtKGZ1biwgYXJyYXkpIHtcbiAgICB0aGlzLmZ1biA9IGZ1bjtcbiAgICB0aGlzLmFycmF5ID0gYXJyYXk7XG59XG5JdGVtLnByb3RvdHlwZS5ydW4gPSBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5mdW4uYXBwbHkobnVsbCwgdGhpcy5hcnJheSk7XG59O1xucHJvY2Vzcy50aXRsZSA9ICdicm93c2VyJztcbnByb2Nlc3MuYnJvd3NlciA9IHRydWU7XG5wcm9jZXNzLmVudiA9IHt9O1xucHJvY2Vzcy5hcmd2ID0gW107XG5wcm9jZXNzLnZlcnNpb24gPSAnJzsgLy8gZW1wdHkgc3RyaW5nIHRvIGF2b2lkIHJlZ2V4cCBpc3N1ZXNcbnByb2Nlc3MudmVyc2lvbnMgPSB7fTtcblxuZnVuY3Rpb24gbm9vcCgpIHt9XG5cbnByb2Nlc3Mub24gPSBub29wO1xucHJvY2Vzcy5hZGRMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLm9uY2UgPSBub29wO1xucHJvY2Vzcy5vZmYgPSBub29wO1xucHJvY2Vzcy5yZW1vdmVMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUFsbExpc3RlbmVycyA9IG5vb3A7XG5wcm9jZXNzLmVtaXQgPSBub29wO1xucHJvY2Vzcy5wcmVwZW5kTGlzdGVuZXIgPSBub29wO1xucHJvY2Vzcy5wcmVwZW5kT25jZUxpc3RlbmVyID0gbm9vcDtcblxucHJvY2Vzcy5saXN0ZW5lcnMgPSBmdW5jdGlvbiAobmFtZSkgeyByZXR1cm4gW10gfVxuXG5wcm9jZXNzLmJpbmRpbmcgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5iaW5kaW5nIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG5cbnByb2Nlc3MuY3dkID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gJy8nIH07XG5wcm9jZXNzLmNoZGlyID0gZnVuY3Rpb24gKGRpcikge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5jaGRpciBpcyBub3Qgc3VwcG9ydGVkJyk7XG59O1xucHJvY2Vzcy51bWFzayA9IGZ1bmN0aW9uKCkgeyByZXR1cm4gMDsgfTtcbiJdfQ==

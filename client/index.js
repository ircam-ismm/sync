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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImluZGV4LmpzIl0sIm5hbWVzIjpbImxvZyIsIm9yZGVyTWluTWF4IiwidGhhdCIsIm1pbiIsIm1heCIsInRtcCIsIm1lYW4iLCJhcnJheSIsImRpbWVuc2lvbiIsInJlZHVjZSIsInAiLCJxIiwibGVuZ3RoIiwiU3luY0NsaWVudCIsImdldFRpbWVGdW5jdGlvbiIsIm9wdGlvbnMiLCJwaW5nVGltZW91dERlbGF5IiwicGluZ1Nlcmllc0l0ZXJhdGlvbnMiLCJwaW5nU2VyaWVzUGVyaW9kIiwicGluZ1Nlcmllc0RlbGF5IiwicGluZ0RlbGF5IiwicGluZ1RpbWVvdXRJZCIsInBpbmdJZCIsInBpbmdTZXJpZXNDb3VudCIsInNlcmllc0RhdGEiLCJzZXJpZXNEYXRhTmV4dEluZGV4Iiwic2VyaWVzRGF0YUxlbmd0aCIsImxvbmdUZXJtRGF0YVRyYWluaW5nRHVyYXRpb24iLCJsb25nVGVybURhdGFEdXJhdGlvbiIsImxvbmdUZXJtRGF0YUxlbmd0aCIsIk1hdGgiLCJsb25nVGVybURhdGEiLCJsb25nVGVybURhdGFOZXh0SW5kZXgiLCJ0aW1lT2Zmc2V0IiwidHJhdmVsRHVyYXRpb24iLCJ0cmF2ZWxEdXJhdGlvbk1pbiIsInRyYXZlbER1cmF0aW9uTWF4Iiwic2VydmVyVGltZVJlZmVyZW5jZSIsImNsaWVudFRpbWVSZWZlcmVuY2UiLCJmcmVxdWVuY3lSYXRpbyIsImN1cnJlbnQiLCJzdGF0dXMiLCJzdGF0dXNDaGFuZ2VkVGltZSIsImNvbm5lY3Rpb25TdGF0dXMiLCJjb25uZWN0aW9uU3RhdHVzQ2hhbmdlZFRpbWUiLCJnZXRMb2NhbFRpbWUiLCJyZXBvcnRGdW5jdGlvbiIsInN0YXR1c0R1cmF0aW9uIiwiZ2V0U3RhdHVzRHVyYXRpb24iLCJjb25uZWN0aW9uIiwiY29ubmVjdGlvbkR1cmF0aW9uIiwiZ2V0Q29ubmVjdGlvblN0YXR1c0R1cmF0aW9uIiwiY29ubmVjdGlvblRpbWVPdXQiLCJzZW5kRnVuY3Rpb24iLCJjbGVhclRpbWVvdXQiLCJ0aW1lb3V0SWQiLCJzZXRUaW1lb3V0Iiwic2V0Q29ubmVjdGlvblN0YXR1cyIsInJlcG9ydFN0YXR1cyIsIl9fc3luY0xvb3AiLCJjZWlsIiwicmVjZWl2ZUZ1bmN0aW9uIiwic2V0U3RhdHVzIiwiY2xpZW50UGluZ1RpbWUiLCJzZXJ2ZXJQaW5nVGltZSIsInNlcnZlclBvbmdUaW1lIiwiY2xpZW50UG9uZ1RpbWUiLCJjbGllbnRUaW1lIiwic2VydmVyVGltZSIsIm9mZnNldFRpbWUiLCJyYW5kb20iLCJzb3J0ZWQiLCJzbGljZSIsInNvcnQiLCJzZXJpZXNUcmF2ZWxEdXJhdGlvbiIsInMiLCJtZWRpYW4iLCJmbG9vciIsInNlcmllc0NsaWVudFRpbWUiLCJzZXJpZXNTZXJ2ZXJUaW1lIiwic2VyaWVzQ2xpZW50U3F1YXJlZFRpbWUiLCJzZXJpZXNDbGllbnRTZXJ2ZXJUaW1lIiwiYXJvdW5kTWVkaWFuIiwiZ2V0U3luY1RpbWUiLCJyZWdDbGllbnRUaW1lIiwicmVnU2VydmVyVGltZSIsInJlZ0NsaWVudFNxdWFyZWRUaW1lIiwicmVnQ2xpZW50U2VydmVyVGltZSIsImNvdmFyaWFuY2UiLCJ2YXJpYW5jZSIsInN5bmNUaW1lIiwibG9jYWxUaW1lIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7OztBQUFBOzs7Ozs7QUFDQSxJQUFNQSxNQUFNLHFCQUFNLE1BQU4sQ0FBWjs7QUFFQTs7QUFFQTs7Ozs7OztBQU9BLFNBQVNDLFdBQVQsQ0FBcUJDLElBQXJCLEVBQTJCO0FBQ3pCLE1BQUcsT0FBT0EsSUFBUCxLQUFnQixXQUFoQixJQUNHLE9BQU9BLEtBQUtDLEdBQVosS0FBb0IsV0FEdkIsSUFDc0MsT0FBT0QsS0FBS0UsR0FBWixLQUFvQixXQUQxRCxJQUVHRixLQUFLQyxHQUFMLEdBQVdELEtBQUtFLEdBRnRCLEVBRTJCO0FBQ3pCLFFBQU1DLE1BQU1ILEtBQUtDLEdBQWpCO0FBQ0FELFNBQUtDLEdBQUwsR0FBV0QsS0FBS0UsR0FBaEI7QUFDQUYsU0FBS0UsR0FBTCxHQUFXQyxHQUFYO0FBQ0Q7QUFD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TUFBUCxHQUFnQixDQUF2QixFQUEwQixDQUExQixDQUF6Qjs7QUFFQSxtQkFBSzhDLFlBQUwsQ0FBa0JaLGNBQWxCO0FBQ0QsV0FwR0QsTUFvR087QUFDTDtBQUNBLG1CQUFLMUIsU0FBTCxHQUFpQixPQUFLRixnQkFBdEI7QUFDRDs7QUFFRCxpQkFBS3FDLFNBQUwsR0FBaUJDLFdBQVcsWUFBTTtBQUNoQyxtQkFBS0csVUFBTCxDQUFnQk4sWUFBaEIsRUFBOEJQLGNBQTlCO0FBQ0QsV0FGZ0IsRUFFZGhCLEtBQUs4QixJQUFMLENBQVUsT0FBTyxPQUFLeEMsU0FBdEIsQ0FGYyxDQUFqQjtBQUdELFNBdkl5RSxDQXVJdkU7QUFDSixPQXhJRCxFQVZtRCxDQWtKL0M7O0FBRUosV0FBS3VDLFVBQUwsQ0FBZ0JOLFlBQWhCLEVBQThCUCxjQUE5QjtBQUNEOztBQUVEOzs7Ozs7Ozs7O2lDQU9hNEMsUSxFQUFVO0FBQ3JCLFVBQUksT0FBT0EsUUFBUCxLQUFvQixXQUF4QixFQUFxQztBQUNuQztBQUNBLGVBQU8sS0FBS3BELG1CQUFMLEdBQ0gsQ0FBQ29ELFdBQVcsS0FBS3JELG1CQUFqQixJQUF3QyxLQUFLRSxjQURqRDtBQUVELE9BSkQsTUFJTztBQUNMO0FBQ0EsZUFBTyxLQUFLekIsZUFBTCxFQUFQO0FBQ0Q7QUFDRjs7QUFFRDs7Ozs7Ozs7OztrQ0FPNkM7QUFBQSxVQUFqQzZFLFNBQWlDLHVFQUFyQixLQUFLOUMsWUFBTCxFQUFxQjs7QUFDM0M7QUFDQSxhQUFPLEtBQUtSLG1CQUFMLEdBQ0gsS0FBS0UsY0FBTCxJQUF1Qm9ELFlBQVksS0FBS3JELG1CQUF4QyxDQURKO0FBRUQ7Ozs7O2tCQUdZekIsVSIsImZpbGUiOiJpbmRleC5qcyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBkZWJ1ZyBmcm9tICdkZWJ1Zyc7XG5jb25zdCBsb2cgPSBkZWJ1Zygnc3luYycpO1xuXG4vLy8vLy8gaGVscGVyc1xuXG4vKipcbiAqIE9yZGVyIG1pbiBhbmQgbWF4IGF0dHJpYnV0ZXMuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7T2JqZWN0fSB0aGF0IHdpdGggbWluIGFuZCBtYXggYXR0cmlidXRlc1xuICogQHJldHVybnMge09iamVjdH0gd2l0aCBtaW4gYW5kIG1hbiBhdHRyaWJ1dGVzLCBzd2FwcGVkIGlmIHRoYXQubWluID4gdGhhdC5tYXhcbiAqL1xuZnVuY3Rpb24gb3JkZXJNaW5NYXgodGhhdCkge1xuICBpZih0eXBlb2YgdGhhdCAhPT0gJ3VuZGVmaW5lZCdcbiAgICAgJiYgdHlwZW9mIHRoYXQubWluICE9PSAndW5kZWZpbmVkJyAmJiB0eXBlb2YgdGhhdC5tYXggIT09ICd1bmRlZmluZWQnXG4gICAgICYmIHRoYXQubWluID4gdGhhdC5tYXgpIHtcbiAgICBjb25zdCB0bXAgPSB0aGF0Lm1pbjtcbiAgICB0aGF0Lm1pbiA9IHRoYXQubWF4O1xuICAgIHRoYXQubWF4ID0gdG1wO1xuICB9XG4gIHJldHVybiB0aGF0O1xufVxuXG4vKipcbiAqIE1lYW4gb3ZlciBhbiBhcnJheSwgc2VsZWN0aW5nIG9uZSBkaW1lbnNpb24gb2YgdGhlIGFycmF5IHZhbHVlcy5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtBcnJheS48QXJyYXkuPE51bWJlcj4+fSBhcnJheVxuICogQHBhcmFtIHtOdW1iZXJ9IFtkaW1lbnNpb249MF1cbiAqIEByZXR1cm5zIHtOdW1iZXJ9IG1lYW5cbiAqL1xuZnVuY3Rpb24gbWVhbihhcnJheSwgZGltZW5zaW9uID0gMCkge1xuICByZXR1cm4gYXJyYXkucmVkdWNlKChwLCBxKSA9PiBwICsgcVtkaW1lbnNpb25dLCAwKSAvIGFycmF5Lmxlbmd0aDtcbn1cblxuY2xhc3MgU3luY0NsaWVudCB7XG4gIC8qKlxuICAgKiBAY2FsbGJhY2sgU3luY0NsaWVudH5nZXRUaW1lRnVuY3Rpb25cbiAgICogQHJldHVybiB7TnVtYmVyfSBtb25vdG9uaWMsIGV2ZXIgaW5jcmVhc2luZywgdGltZSBpbiBzZWNvbmQuIFdoZW4gcG9zc2libGVcbiAgICogIHRoZSBzZXJ2ZXIgY29kZSBzaG91bGQgZGVmaW5lIGl0cyBvd24gb3JpZ2luIChpLmUuIGB0aW1lPTBgKSBpbiBvcmRlciB0b1xuICAgKiAgbWF4aW1pemUgdGhlIHJlc29sdXRpb24gb2YgdGhlIGNsb2NrIGZvciBhIGxvbmcgcGVyaW9kIG9mIHRpbWUuIFdoZW5cbiAgICogIGBTeW5jU2VydmVyfnN0YXJ0YCBpcyBjYWxsZWQgdGhlIGNsb2NrIHNob3VsZCBiZSBydW5uaW5nXG4gICAqICAoY2YuIGBhdWRpb0NvbnRleHQuY3VycmVudFRpbWVgIHRoYXQgbmVlZHMgdXNlciBpbnRlcmFjdGlvbiB0byBzdGFydClcbiAgICoqL1xuXG4gIC8qKlxuICAgKiBAY2FsbGJhY2sgU3luY0NsaWVudH5zZW5kRnVuY3Rpb25cbiAgICogQHNlZSB7QGxpbmtjb2RlIFN5bmNTZXJ2ZXJ+cmVjZWl2ZUZ1bmN0aW9ufVxuICAgKiBAcGFyYW0ge051bWJlcn0gcGluZ0lkIHVuaXF1ZSBpZGVudGlmaWVyXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBjbGllbnRQaW5nVGltZSB0aW1lLXN0YW1wIG9mIHBpbmcgZW1pc3Npb25cbiAgICoqL1xuXG4gIC8qKlxuICAgKiBAY2FsbGJhY2sgU3luY0NsaWVudH5yZWNlaXZlRnVuY3Rpb25cbiAgICogQHNlZSB7QGxpbmtjb2RlIFN5bmNTZXJ2ZXJ+c2VuZEZ1bmN0aW9ufVxuICAgKiBAcGFyYW0ge1N5bmNDbGllbnR+cmVjZWl2ZUNhbGxiYWNrfSByZWNlaXZlQ2FsbGJhY2sgY2FsbGVkIG9uXG4gICAqIGVhY2ggbWVzc2FnZSBtYXRjaGluZyBtZXNzYWdlVHlwZS5cbiAgICoqL1xuXG4gIC8qKlxuICAgKiBAY2FsbGJhY2sgU3luY0NsaWVudH5yZWNlaXZlQ2FsbGJhY2tcbiAgICogQHBhcmFtIHtOdW1iZXJ9IHBpbmdJZCB1bmlxdWUgaWRlbnRpZmllclxuICAgKiBAcGFyYW0ge051bWJlcn0gY2xpZW50UGluZ1RpbWUgdGltZS1zdGFtcCBvZiBwaW5nIGVtaXNzaW9uXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBzZXJ2ZXJQaW5nVGltZSB0aW1lLXN0YW1wIG9mIHBpbmcgcmVjZXB0aW9uXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBzZXJ2ZXJQb25nVGltZSB0aW1lLXN0YW1wIG9mIHBvbmcgZW1pc3Npb25cbiAgICogQHBhcmFtIHtOdW1iZXJ9IGNsaWVudFBvbmdUaW1lIHRpbWUtc3RhbXAgb2YgcG9uZyByZWNlcHRpb25cbiAgICoqL1xuXG4gIC8qKlxuICAgKiBAY2FsbGJhY2sgU3luY0NsaWVudH5yZXBvcnRGdW5jdGlvblxuICAgKiBAcGFyYW0ge09iamVjdH0gcmVwb3J0XG4gICAqIEBwYXJhbSB7U3RyaW5nfSByZXBvcnQuc3RhdHVzIGBuZXdgLCBgc3RhcnR1cGAsXG4gICAqIGB0cmFpbmluZ2AgKG9mZnNldCBhZGFwdGF0aW9uKSwgb3IgYHN5bmNgIChvZmZzZXQgYW5kIHJhdGlvIGFkYXB0YXRpb24pLlxuICAgKiBAcGFyYW0ge051bWJlcn0gcmVwb3J0LnN0YXR1c0R1cmF0aW9uIGR1cmF0aW9uIHNpbmNlIGxhc3Qgc3RhdHVzXG4gICAqIGNoYW5nZS5cbiAgICogQHBhcmFtIHtOdW1iZXJ9IHJlcG9ydC50aW1lT2Zmc2V0IHRpbWUgZGlmZmVyZW5jZSBiZXR3ZWVuIGxvY2FsXG4gICAqIHRpbWUgYW5kIHN5bmMgdGltZSwgaW4gc2Vjb25kcy5cbiAgICogQHBhcmFtIHtOdW1iZXJ9IHJlcG9ydC5mcmVxdWVuY3lSYXRpbyB0aW1lIHJhdGlvIGJldHdlZW4gbG9jYWxcbiAgICogdGltZSBhbmQgc3luYyB0aW1lLlxuICAgKiBAcGFyYW0ge1N0cmluZ30gcmVwb3J0LmNvbm5lY3Rpb24gYG9mZmxpbmVgIG9yIGBvbmxpbmVgXG4gICAqIEBwYXJhbSB7TnVtYmVyfSByZXBvcnQuY29ubmVjdGlvbkR1cmF0aW9uIGR1cmF0aW9uIHNpbmNlIGxhc3QgY29ubmVjdGlvblxuICAgKiBjaGFuZ2UuXG4gICAqIEBwYXJhbSB7TnVtYmVyfSByZXBvcnQuY29ubmVjdGlvblRpbWVPdXQgZHVyYXRpb24sIGluIHNlY29uZHMsIGJlZm9yZVxuICAgKiBhIHRpbWUtb3V0IG9jY3Vycy5cbiAgICogQHBhcmFtIHtOdW1iZXJ9IHJlcG9ydC50cmF2ZWxEdXJhdGlvbiBkdXJhdGlvbiBvZiBhXG4gICAqIHBpbmctcG9uZyByb3VuZC10cmlwLCBpbiBzZWNvbmRzLCBtZWFuIG92ZXIgdGhlIHRoZSBsYXN0XG4gICAqIHBpbmctcG9uZyBzZXJpZXMuXG4gICAqIEBwYXJhbSB7TnVtYmVyfSByZXBvcnQudHJhdmVsRHVyYXRpb25NaW4gZHVyYXRpb24gb2YgYVxuICAgKiBwaW5nLXBvbmcgcm91bmQtdHJpcCwgaW4gc2Vjb25kcywgbWluaW11bSBvdmVyIHRoZSB0aGUgbGFzdFxuICAgKiBwaW5nLXBvbmcgc2VyaWVzLlxuICAgKiBAcGFyYW0ge051bWJlcn0gcmVwb3J0LnRyYXZlbER1cmF0aW9uTWF4IGR1cmF0aW9uIG9mIGFcbiAgICogcGluZy1wb25nIHJvdW5kLXRyaXAsIGluIHNlY29uZHMsIG1heGltdW0gb3ZlciB0aGUgdGhlIGxhc3RcbiAgICogcGluZy1wb25nIHNlcmllcy5cbiAgICoqL1xuXG4gIC8qKlxuICAgKiBUaGlzIGlzIHRoZSBjb25zdHJ1Y3Rvci4gU2VlIHtAbGlua2NvZGUgU3luY0NsaWVudH5zdGFydH0gbWV0aG9kIHRvXG4gICAqIGFjdHVhbGx5IHN0YXJ0IGEgc3luY2hyb25pc2F0aW9uIHByb2Nlc3MuXG4gICAqXG4gICAqIEBjb25zdHJ1Y3RzIFN5bmNDbGllbnRcbiAgICogQHBhcmFtIHtTeW5jQ2xpZW50fmdldFRpbWVGdW5jdGlvbn0gZ2V0VGltZUZ1bmN0aW9uXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc11cbiAgICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zLnBpbmdUaW1lT3V0RGVsYXldIHJhbmdlIG9mIGR1cmF0aW9uIChpbiBzZWNvbmRzKSB0b1xuICAgKiBjb25zaWRlciBhIHBpbmcgd2FzIG5vdCBwb25nZWQgYmFja1xuICAgKiBAcGFyYW0ge051bWJlcn0gW29wdGlvbnMucGluZ1RpbWVPdXREZWxheS5taW49MV0gbWluIGFuZCBtYXggbXVzdCBiZSBzZXQgdG9nZXRoZXJcbiAgICogQHBhcmFtIHtOdW1iZXJ9IFtvcHRpb25zLnBpbmdUaW1lT3V0RGVsYXkubWF4PTMwXSBtaW4gYW5kIG1heCBtdXN0IGJlIHNldCB0b2dldGhlclxuICAgKiBAcGFyYW0ge051bWJlcn0gW29wdGlvbnMucGluZ1Nlcmllc0l0ZXJhdGlvbnM9MTBdIG51bWJlciBvZiBwaW5nLXBvbmdzIGluIGFcbiAgICogc2VyaWVzXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBbb3B0aW9ucy5waW5nU2VyaWVzUGVyaW9kPTAuMjUwXSBpbnRlcnZhbCAoaW4gc2Vjb25kcykgYmV0d2VlbiBwaW5nc1xuICAgKiBpbiBhIHNlcmllc1xuICAgKiBAcGFyYW0ge051bWJlcn0gW29wdGlvbnMucGluZ1Nlcmllc0RlbGF5XSByYW5nZSBvZiBpbnRlcnZhbCAoaW5cbiAgICogc2Vjb25kcykgYmV0d2VlbiBwaW5nLXBvbmcgc2VyaWVzXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBbb3B0aW9ucy5waW5nU2VyaWVzRGVsYXkubWluPTEwXSBtaW4gYW5kIG1heCBtdXN0IGJlIHNldCB0b2dldGhlclxuICAgKiBAcGFyYW0ge051bWJlcn0gW29wdGlvbnMucGluZ1Nlcmllc0RlbGF5Lm1heD0yMF0gbWluIGFuZCBtYXggbXVzdCBiZSBzZXQgdG9nZXRoZXJcbiAgICogQHBhcmFtIHtOdW1iZXJ9IFtvcHRpb25zLmxvbmdUZXJtRGF0YVRyYWluaW5nRHVyYXRpb249MTIwXSBkdXJhdGlvbiBvZlxuICAgKiB0cmFpbmluZywgaW4gc2Vjb25kcywgYXBwcm94aW1hdGVseSwgYmVmb3JlIHVzaW5nIHRoZSBlc3RpbWF0ZSBvZlxuICAgKiBjbG9jayBmcmVxdWVuY3lcbiAgICogQHBhcmFtIHtOdW1iZXJ9IFtvcHRpb25zLmxvbmdUZXJtRGF0YUR1cmF0aW9uPTkwMF0gZXN0aW1hdGUgc3luY2hyb25pc2F0aW9uIG92ZXJcbiAgICogIHRoaXMgZHVyYXRpb24sIGluIHNlY29uZHMsIGFwcHJveGltYXRlbHlcbiAgICovXG4gIGNvbnN0cnVjdG9yKGdldFRpbWVGdW5jdGlvbiwgb3B0aW9ucyA9IHt9KSB7XG4gICAgdGhpcy5waW5nVGltZW91dERlbGF5ID0gb3B0aW9ucy5waW5nVGltZW91dERlbGF5XG4gICAgICB8fCB7IG1pbjogMSwgbWF4OiAzMCB9O1xuICAgIG9yZGVyTWluTWF4KHRoaXMucGluZ1RpbWVvdXREZWxheSk7XG5cbiAgICB0aGlzLnBpbmdTZXJpZXNJdGVyYXRpb25zID0gb3B0aW9ucy5waW5nU2VyaWVzSXRlcmF0aW9ucyB8fCAxMDtcbiAgICB0aGlzLnBpbmdTZXJpZXNQZXJpb2QgPSBvcHRpb25zLnBpbmdTZXJpZXNQZXJpb2QgfHwgMC4yNTA7XG4gICAgdGhpcy5waW5nU2VyaWVzRGVsYXkgPSBvcHRpb25zLnBpbmdTZXJpZXNEZWxheVxuICAgICAgfHwgeyBtaW46IDEwLCBtYXg6IDIwIH07XG4gICAgb3JkZXJNaW5NYXgodGhpcy5waW5nU2VyaWVzRGVsYXkpO1xuXG4gICAgdGhpcy5waW5nRGVsYXkgPSAwOyAvLyBjdXJyZW50IGRlbGF5IGJlZm9yZSBuZXh0IHBpbmdcbiAgICB0aGlzLnBpbmdUaW1lb3V0SWQgPSAwOyAvLyB0byBjYW5jZWwgdGltZW91dCBvbiBzeW5jX3BpbmNcbiAgICB0aGlzLnBpbmdJZCA9IDA7IC8vIGFic29sdXRlIElEIHRvIG1hY2ggcG9uZyBhZ2FpbnN0XG5cbiAgICB0aGlzLnBpbmdTZXJpZXNDb3VudCA9IDA7IC8vIGVsYXBzZWQgcGluZ3MgaW4gYSBzZXJpZXNcbiAgICB0aGlzLnNlcmllc0RhdGEgPSBbXTsgLy8gY2lyY3VsYXIgYnVmZmVyXG4gICAgdGhpcy5zZXJpZXNEYXRhTmV4dEluZGV4ID0gMDsgLy8gbmV4dCBpbmRleCB0byB3cml0ZSBpbiBjaXJjdWxhciBidWZmZXJcbiAgICB0aGlzLnNlcmllc0RhdGFMZW5ndGggPSB0aGlzLnBpbmdTZXJpZXNJdGVyYXRpb25zOyAvLyBzaXplIG9mIGNpcmN1bGFyIGJ1ZmZlclxuXG4gICAgdGhpcy5sb25nVGVybURhdGFUcmFpbmluZ0R1cmF0aW9uXG4gICAgICA9IG9wdGlvbnMubG9uZ1Rlcm1EYXRhVHJhaW5pbmdEdXJhdGlvbiB8fCAxMjA7XG5cbiAgICAvLyB1c2UgYSBmaXhlZC1zaXplIGNpcmN1bGFyIGJ1ZmZlciwgZXZlbiBpZiBpdCBkb2VzIG5vdCBtYXRjaFxuICAgIC8vIGV4YWN0bHkgdGhlIHJlcXVpcmVkIGR1cmF0aW9uXG4gICAgdGhpcy5sb25nVGVybURhdGFEdXJhdGlvbiA9IG9wdGlvbnMubG9uZ1Rlcm1EYXRhRHVyYXRpb24gfHwgOTAwO1xuICAgIHRoaXMubG9uZ1Rlcm1EYXRhTGVuZ3RoID0gTWF0aC5tYXgoXG4gICAgICAyLFxuICAgICAgdGhpcy5sb25nVGVybURhdGFEdXJhdGlvbiAvXG4gICAgICAgICgwLjUgKiAodGhpcy5waW5nU2VyaWVzRGVsYXkubWluICsgdGhpcy5waW5nU2VyaWVzRGVsYXkubWF4KSApICk7XG5cbiAgICB0aGlzLmxvbmdUZXJtRGF0YSA9IFtdOyAvLyBjaXJjdWxhciBidWZmZXJcbiAgICB0aGlzLmxvbmdUZXJtRGF0YU5leHRJbmRleCA9IDA7IC8vIG5leHQgaW5kZXggdG8gd3JpdGUgaW4gY2lyY3VsYXIgYnVmZmVyXG5cbiAgICB0aGlzLnRpbWVPZmZzZXQgPSAwOyAvLyBtZWFuIG9mIChzZXJ2ZXJUaW1lIC0gY2xpZW50VGltZSkgaW4gdGhlIGxhc3Qgc2VyaWVzXG4gICAgdGhpcy50cmF2ZWxEdXJhdGlvbiA9IDA7XG4gICAgdGhpcy50cmF2ZWxEdXJhdGlvbk1pbiA9IDA7XG4gICAgdGhpcy50cmF2ZWxEdXJhdGlvbk1heCA9IDA7XG5cbiAgICAvLyBUKHQpID0gVDAgKyBSICogKHQgLSB0MClcbiAgICB0aGlzLnNlcnZlclRpbWVSZWZlcmVuY2UgPSAwOyAvLyBUMFxuICAgIHRoaXMuY2xpZW50VGltZVJlZmVyZW5jZSA9IDA7IC8vIHQwXG4gICAgdGhpcy5mcmVxdWVuY3lSYXRpbyA9IDE7IC8vIFJcblxuICAgIHRoaXMucGluZ1RpbWVvdXREZWxheS5jdXJyZW50ID0gdGhpcy5waW5nVGltZW91dERlbGF5Lm1pbjtcblxuICAgIHRoaXMuZ2V0VGltZUZ1bmN0aW9uID0gZ2V0VGltZUZ1bmN0aW9uO1xuXG4gICAgdGhpcy5zdGF0dXMgPSAnbmV3JztcbiAgICB0aGlzLnN0YXR1c0NoYW5nZWRUaW1lID0gMDtcblxuICAgIHRoaXMuY29ubmVjdGlvblN0YXR1cyA9ICdvZmZsaW5lJztcbiAgICB0aGlzLmNvbm5lY3Rpb25TdGF0dXNDaGFuZ2VkVGltZSA9IDA7XG4gIH1cblxuICAvKipcbiAgICogU2V0IHN0YXR1cywgYW5kIHNldCB0aGlzLnN0YXR1c0NoYW5nZWRUaW1lLCB0byBsYXRlclxuICAgKiB1c2Ugc2VlIHtAbGlua2NvZGUgU3luY0NsaWVudH5nZXRTdGF0dXNEdXJhdGlvbn1cbiAgICogYW5kIHtAbGlua2NvZGUgU3luY0NsaWVudH5yZXBvcnRTdGF0dXN9LlxuICAgKlxuICAgKiBAZnVuY3Rpb24gU3luY0NsaWVudH5zZXRTdGF0dXNcbiAgICogQHBhcmFtIHtTdHJpbmd9IHN0YXR1c1xuICAgKiBAcmV0dXJucyB7T2JqZWN0fSB0aGlzXG4gICAqL1xuICBzZXRTdGF0dXMoc3RhdHVzKSB7XG4gICAgaWYoc3RhdHVzICE9PSB0aGlzLnN0YXR1cykge1xuICAgICAgdGhpcy5zdGF0dXMgPSBzdGF0dXM7XG4gICAgICB0aGlzLnN0YXR1c0NoYW5nZWRUaW1lID0gdGhpcy5nZXRMb2NhbFRpbWUoKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICAvKipcbiAgICogR2V0IHRpbWUgc2luY2UgbGFzdCBzdGF0dXMgY2hhbmdlLiBTZWUge0BsaW5rY29kZSBTeW5jQ2xpZW50fnNldFN0YXR1c31cbiAgICpcbiAgICogQGZ1bmN0aW9uIFN5bmNDbGllbnR+Z2V0U3RhdHVzRHVyYXRpb25cbiAgICogQHJldHVybnMge051bWJlcn0gdGltZSwgaW4gc2Vjb25kcywgc2luY2UgbGFzdCBzdGF0dXMgY2hhbmdlLlxuICAgKi9cbiAgZ2V0U3RhdHVzRHVyYXRpb24oKSB7XG4gICAgcmV0dXJuIE1hdGgubWF4KDAsIHRoaXMuZ2V0TG9jYWxUaW1lKCkgLSB0aGlzLnN0YXR1c0NoYW5nZWRUaW1lKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTZXQgY29ubmVjdGlvblN0YXR1cywgYW5kIHNldCB0aGlzLmNvbm5lY3Rpb25TdGF0dXNDaGFuZ2VkVGltZSxcbiAgICogdG8gbGF0ZXIgdXNlIHNlZSB7QGxpbmtjb2RlIFN5bmNDbGllbnR+Z2V0Q29ubmVjdGlvblN0YXR1c0R1cmF0aW9ufVxuICAgKiBhbmQge0BsaW5rY29kZSBTeW5jQ2xpZW50fnJlcG9ydFN0YXR1c30uXG4gICAqXG4gICAqIEBmdW5jdGlvbiBTeW5jQ2xpZW50fnNldENvbm5lY3Rpb25TdGF0dXNcbiAgICogQHBhcmFtIHtTdHJpbmd9IGNvbm5lY3Rpb25TdGF0dXNcbiAgICogQHJldHVybnMge09iamVjdH0gdGhpc1xuICAgKi9cbiAgc2V0Q29ubmVjdGlvblN0YXR1cyhjb25uZWN0aW9uU3RhdHVzKSB7XG4gICAgaWYoY29ubmVjdGlvblN0YXR1cyAhPT0gdGhpcy5jb25uZWN0aW9uU3RhdHVzKSB7XG4gICAgICB0aGlzLmNvbm5lY3Rpb25TdGF0dXMgPSBjb25uZWN0aW9uU3RhdHVzO1xuICAgICAgdGhpcy5jb25uZWN0aW9uU3RhdHVzQ2hhbmdlZFRpbWUgPSB0aGlzLmdldExvY2FsVGltZSgpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgdGltZSBzaW5jZSBsYXN0IGNvbm5lY3Rpb25TdGF0dXMgY2hhbmdlLlxuICAgKiBTZWUge0BsaW5rY29kZSBTeW5jQ2xpZW50fnNldENvbm5lY3Rpb25TdGF0dXN9XG4gICAqXG4gICAqIEBmdW5jdGlvbiBTeW5jQ2xpZW50fmdldENvbm5lY3Rpb25TdGF0dXNEdXJhdGlvblxuICAgKiBAcmV0dXJucyB7TnVtYmVyfSB0aW1lLCBpbiBzZWNvbmRzLCBzaW5jZSBsYXN0IGNvbm5lY3Rpb25TdGF0dXNcbiAgICogY2hhbmdlLlxuICAgKi9cbiAgZ2V0Q29ubmVjdGlvblN0YXR1c0R1cmF0aW9uKCkge1xuICAgIHJldHVybiBNYXRoLm1heCgwLCB0aGlzLmdldExvY2FsVGltZSgpIC0gdGhpcy5jb25uZWN0aW9uU3RhdHVzQ2hhbmdlZFRpbWUpO1xuICB9XG5cbiAgLyoqXG4gICAqIFJlcG9ydCB0aGUgc3RhdHVzIG9mIHRoZSBzeW5jaHJvbmlzYXRpb24gcHJvY2VzcywgaWZcbiAgICogcmVwb3J0RnVuY3Rpb24gaXMgZGVmaW5lZC5cbiAgICpcbiAgICogQGZ1bmN0aW9uIFN5bmNDbGllbnR+cmVwb3J0U3RhdHVzXG4gICAqIEBwYXJhbSB7U3luY0NsaWVudH5yZXBvcnRGdW5jdGlvbn0gcmVwb3J0RnVuY3Rpb25cbiAgICovXG4gIHJlcG9ydFN0YXR1cyhyZXBvcnRGdW5jdGlvbikge1xuICAgIGlmKHR5cGVvZiByZXBvcnRGdW5jdGlvbiAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIHJlcG9ydEZ1bmN0aW9uKHtcbiAgICAgICAgc3RhdHVzOiB0aGlzLnN0YXR1cyxcbiAgICAgICAgc3RhdHVzRHVyYXRpb246IHRoaXMuZ2V0U3RhdHVzRHVyYXRpb24oKSxcbiAgICAgICAgdGltZU9mZnNldDogdGhpcy50aW1lT2Zmc2V0LFxuICAgICAgICBmcmVxdWVuY3lSYXRpbzogdGhpcy5mcmVxdWVuY3lSYXRpbyxcbiAgICAgICAgY29ubmVjdGlvbjogdGhpcy5jb25uZWN0aW9uU3RhdHVzLFxuICAgICAgICBjb25uZWN0aW9uRHVyYXRpb246IHRoaXMuZ2V0Q29ubmVjdGlvblN0YXR1c0R1cmF0aW9uKCksXG4gICAgICAgIGNvbm5lY3Rpb25UaW1lT3V0OiB0aGlzLnBpbmdUaW1lb3V0RGVsYXkuY3VycmVudCxcbiAgICAgICAgdHJhdmVsRHVyYXRpb246IHRoaXMudHJhdmVsRHVyYXRpb24sXG4gICAgICAgIHRyYXZlbER1cmF0aW9uTWluOiB0aGlzLnRyYXZlbER1cmF0aW9uTWluLFxuICAgICAgICB0cmF2ZWxEdXJhdGlvbk1heDogdGhpcy50cmF2ZWxEdXJhdGlvbk1heFxuICAgICAgfSk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFByb2Nlc3MgdG8gc2VuZCBwaW5nIG1lc3NhZ2VzLlxuICAgKlxuICAgKiBAcHJpdmF0ZVxuICAgKiBAZnVuY3Rpb24gU3luY0NsaWVudH5fX3N5bmNMb29wXG4gICAqIEBwYXJhbSB7U3luY0NsaWVudH5zZW5kRnVuY3Rpb259IHNlbmRGdW5jdGlvblxuICAgKiBAcGFyYW0ge1N5bmNDbGllbnR+cmVwb3J0RnVuY3Rpb259IHJlcG9ydEZ1bmN0aW9uXG4gICAqL1xuICBfX3N5bmNMb29wKHNlbmRGdW5jdGlvbiwgcmVwb3J0RnVuY3Rpb24pIHtcbiAgICBjbGVhclRpbWVvdXQodGhpcy50aW1lb3V0SWQpO1xuICAgICsrdGhpcy5waW5nSWQ7XG4gICAgc2VuZEZ1bmN0aW9uKHRoaXMucGluZ0lkLCB0aGlzLmdldExvY2FsVGltZSgpKTtcblxuICAgIHRoaXMudGltZW91dElkID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAvLyBpbmNyZWFzZSB0aW1lb3V0IGR1cmF0aW9uIG9uIHRpbWVvdXQsIHRvIGF2b2lkIG92ZXJmbG93XG4gICAgICB0aGlzLnBpbmdUaW1lb3V0RGVsYXkuY3VycmVudCA9IE1hdGgubWluKHRoaXMucGluZ1RpbWVvdXREZWxheS5jdXJyZW50ICogMixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5waW5nVGltZW91dERlbGF5Lm1heCk7XG4gICAgICBsb2coJ3N5bmM6cGluZyB0aW1lb3V0ID4gJXMnLCB0aGlzLnBpbmdUaW1lb3V0RGVsYXkuY3VycmVudCk7XG4gICAgICB0aGlzLnNldENvbm5lY3Rpb25TdGF0dXMoJ29mZmxpbmUnKTtcbiAgICAgIHRoaXMucmVwb3J0U3RhdHVzKHJlcG9ydEZ1bmN0aW9uKTtcbiAgICAgIC8vIHJldHJ5ICh5ZXMsIGFsd2F5cyBpbmNyZW1lbnQgcGluZ0lkKVxuICAgICAgdGhpcy5fX3N5bmNMb29wKHNlbmRGdW5jdGlvbiwgcmVwb3J0RnVuY3Rpb24pO1xuICAgIH0sIE1hdGguY2VpbCgxMDAwICogdGhpcy5waW5nVGltZW91dERlbGF5LmN1cnJlbnQpKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTdGFydCBhIHN5bmNocm9uaXNhdGlvbiBwcm9jZXNzIGJ5IHJlZ2lzdGVyaW5nIHRoZSByZWNlaXZlXG4gICAqIGZ1bmN0aW9uIHBhc3NlZCBhcyBzZWNvbmQgcGFyYW1ldGVyLiBUaGVuLCBzZW5kIHJlZ3VsYXIgbWVzc2FnZXNcbiAgICogdG8gdGhlIHNlcnZlciwgdXNpbmcgdGhlIHNlbmQgZnVuY3Rpb24gcGFzc2VkIGFzIGZpcnN0IHBhcmFtZXRlci5cbiAgICpcbiAgICogQGZ1bmN0aW9uIFN5bmNDbGllbnR+c3RhcnRcbiAgICogQHBhcmFtIHtTeW5jQ2xpZW50fnNlbmRGdW5jdGlvbn0gc2VuZEZ1bmN0aW9uXG4gICAqIEBwYXJhbSB7U3luY0NsaWVudH5yZWNlaXZlRnVuY3Rpb259IHJlY2VpdmVGdW5jdGlvbiB0byByZWdpc3RlclxuICAgKiBAcGFyYW0ge1N5bmNDbGllbnR+cmVwb3J0RnVuY3Rpb259IHJlcG9ydEZ1bmN0aW9uIGlmIGRlZmluZWQsXG4gICAqIGlzIGNhbGxlZCB0byByZXBvcnQgdGhlIHN0YXR1cywgb24gZWFjaCBzdGF0dXMgY2hhbmdlXG4gICAqL1xuICBzdGFydChzZW5kRnVuY3Rpb24sIHJlY2VpdmVGdW5jdGlvbiwgcmVwb3J0RnVuY3Rpb24pIHtcbiAgICB0aGlzLnNldFN0YXR1cygnc3RhcnR1cCcpO1xuICAgIHRoaXMuc2V0Q29ubmVjdGlvblN0YXR1cygnb2ZmbGluZScpO1xuXG4gICAgdGhpcy5zZXJpZXNEYXRhID0gW107XG4gICAgdGhpcy5zZXJpZXNEYXRhTmV4dEluZGV4ID0gMDtcblxuICAgIHRoaXMubG9uZ1Rlcm1EYXRhID0gW107XG4gICAgdGhpcy5sb25nVGVybURhdGFOZXh0SW5kZXggPSAwO1xuXG4gICAgcmVjZWl2ZUZ1bmN0aW9uKChwaW5nSWQsIGNsaWVudFBpbmdUaW1lLCBzZXJ2ZXJQaW5nVGltZSwgc2VydmVyUG9uZ1RpbWUpID0+IHtcbiAgICAgIC8vIGFjY2VwdCBvbmx5IHRoZSBwb25nIHRoYXQgY29ycmVzcG9uZHMgdG8gdGhlIGxhc3QgcGluZ1xuICAgICAgaWYgKHBpbmdJZCA9PT0gdGhpcy5waW5nSWQpIHtcbiAgICAgICAgKyt0aGlzLnBpbmdTZXJpZXNDb3VudDtcbiAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMudGltZW91dElkKTtcbiAgICAgICAgdGhpcy5zZXRDb25uZWN0aW9uU3RhdHVzKCdvbmxpbmUnKTtcbiAgICAgICAgLy8gcmVkdWNlIHRpbWVvdXQgZHVyYXRpb24gb24gcG9uZywgZm9yIGJldHRlciByZWFjdGl2aXR5XG4gICAgICAgIHRoaXMucGluZ1RpbWVvdXREZWxheS5jdXJyZW50ID0gTWF0aC5tYXgodGhpcy5waW5nVGltZW91dERlbGF5LmN1cnJlbnQgKiAwLjc1LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGluZ1RpbWVvdXREZWxheS5taW4pO1xuXG4gICAgICAgIC8vIHRpbWUtZGlmZmVyZW5jZXMgYXJlIHZhbGlkIG9uIGEgc2luZ2xlLXNpZGUgb25seSAoY2xpZW50IG9yIHNlcnZlcilcbiAgICAgICAgY29uc3QgY2xpZW50UG9uZ1RpbWUgPSB0aGlzLmdldExvY2FsVGltZSgpO1xuICAgICAgICBjb25zdCBjbGllbnRUaW1lID0gMC41ICogKGNsaWVudFBvbmdUaW1lICsgY2xpZW50UGluZ1RpbWUpO1xuICAgICAgICBjb25zdCBzZXJ2ZXJUaW1lID0gMC41ICogKHNlcnZlclBvbmdUaW1lICsgc2VydmVyUGluZ1RpbWUpO1xuICAgICAgICBjb25zdCB0cmF2ZWxEdXJhdGlvbiA9IE1hdGgubWF4KDAsIChjbGllbnRQb25nVGltZSAtIGNsaWVudFBpbmdUaW1lKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC0gKHNlcnZlclBvbmdUaW1lIC0gc2VydmVyUGluZ1RpbWUpKTtcbiAgICAgICAgY29uc3Qgb2Zmc2V0VGltZSA9IHNlcnZlclRpbWUgLSBjbGllbnRUaW1lO1xuXG4gICAgICAgIC8vIG9yZGVyIGlzIGltcG9ydGFudCBmb3Igc29ydGluZywgbGF0ZXIuXG4gICAgICAgIHRoaXMuc2VyaWVzRGF0YVt0aGlzLnNlcmllc0RhdGFOZXh0SW5kZXhdXG4gICAgICAgICAgPSBbdHJhdmVsRHVyYXRpb24sIG9mZnNldFRpbWUsIGNsaWVudFRpbWUsIHNlcnZlclRpbWVdO1xuICAgICAgICB0aGlzLnNlcmllc0RhdGFOZXh0SW5kZXggPSAoKyt0aGlzLnNlcmllc0RhdGFOZXh0SW5kZXgpICUgdGhpcy5zZXJpZXNEYXRhTGVuZ3RoO1xuXG4gICAgICAgIC8vIGxvZygncGluZyAlcywgdHJhdmVsID0gJXMsIG9mZnNldCA9ICVzLCBjbGllbnQgPSAlcywgc2VydmVyID0gJXMnLFxuICAgICAgICAvLyAgICAgICBwaW5nSWQsIHRyYXZlbER1cmF0aW9uLCBvZmZzZXRUaW1lLCBjbGllbnRUaW1lLCBzZXJ2ZXJUaW1lKTtcblxuICAgICAgICAvLyBlbmQgb2YgYSBzZXJpZXNcbiAgICAgICAgaWYgKHRoaXMucGluZ1Nlcmllc0NvdW50ID49IHRoaXMucGluZ1Nlcmllc0l0ZXJhdGlvbnNcbiAgICAgICAgICAgICYmIHRoaXMuc2VyaWVzRGF0YS5sZW5ndGggPj0gdGhpcy5zZXJpZXNEYXRhTGVuZ3RoKSB7XG4gICAgICAgICAgLy8gcGxhbiB0aGUgYmVnaW5pbmcgb2YgdGhlIG5leHQgc2VyaWVzXG4gICAgICAgICAgdGhpcy5waW5nRGVsYXkgPSB0aGlzLnBpbmdTZXJpZXNEZWxheS5taW5cbiAgICAgICAgICAgICsgTWF0aC5yYW5kb20oKSAqICh0aGlzLnBpbmdTZXJpZXNEZWxheS5tYXggLSB0aGlzLnBpbmdTZXJpZXNEZWxheS5taW4pO1xuICAgICAgICAgIHRoaXMucGluZ1Nlcmllc0NvdW50ID0gMDtcblxuICAgICAgICAgIC8vIHNvcnQgYnkgdHJhdmVsIHRpbWUgZmlyc3QsIHRoZW4gb2Zmc2V0IHRpbWUuXG4gICAgICAgICAgY29uc3Qgc29ydGVkID0gdGhpcy5zZXJpZXNEYXRhLnNsaWNlKDApLnNvcnQoKTtcblxuICAgICAgICAgIGNvbnN0IHNlcmllc1RyYXZlbER1cmF0aW9uID0gc29ydGVkWzBdWzBdO1xuXG4gICAgICAgICAgLy8gV2hlbiB0aGUgY2xvY2sgdGljayBpcyBsb25nIGVub3VnaCxcbiAgICAgICAgICAvLyBzb21lIHRyYXZlbCB0aW1lcyAoZGltZW5zaW9uIDApIG1pZ2h0IGJlIGlkZW50aWNhbC5cbiAgICAgICAgICAvLyBUaGVuLCB1c2UgdGhlIG9mZnNldCBtZWRpYW4gKGRpbWVuc2lvbiAxIGlzIHRoZSBzZWNvbmQgc29ydCBrZXkpXG4gICAgICAgICAgbGV0IHMgPSAwO1xuICAgICAgICAgIHdoaWxlKHMgPCBzb3J0ZWQubGVuZ3RoICYmIHNvcnRlZFtzXVswXSA8PSBzZXJpZXNUcmF2ZWxEdXJhdGlvbiAqIDEuMDEpIHtcbiAgICAgICAgICAgICsrcztcbiAgICAgICAgICB9XG4gICAgICAgICAgcyA9IE1hdGgubWF4KDAsIHMgLSAxKTtcbiAgICAgICAgICBjb25zdCBtZWRpYW4gPSBNYXRoLmZsb29yKHMgLyAyKTtcblxuICAgICAgICAgIGNvbnN0IHNlcmllc0NsaWVudFRpbWUgPSBzb3J0ZWRbbWVkaWFuXVsyXTtcbiAgICAgICAgICBjb25zdCBzZXJpZXNTZXJ2ZXJUaW1lID0gc29ydGVkW21lZGlhbl1bM107XG4gICAgICAgICAgY29uc3Qgc2VyaWVzQ2xpZW50U3F1YXJlZFRpbWUgPSBzZXJpZXNDbGllbnRUaW1lICogc2VyaWVzQ2xpZW50VGltZTtcbiAgICAgICAgICBjb25zdCBzZXJpZXNDbGllbnRTZXJ2ZXJUaW1lID0gc2VyaWVzQ2xpZW50VGltZSAqIHNlcmllc1NlcnZlclRpbWU7XG5cbiAgICAgICAgICB0aGlzLmxvbmdUZXJtRGF0YVt0aGlzLmxvbmdUZXJtRGF0YU5leHRJbmRleF1cbiAgICAgICAgICAgID0gW3Nlcmllc1RyYXZlbER1cmF0aW9uLCBzZXJpZXNDbGllbnRUaW1lLCBzZXJpZXNTZXJ2ZXJUaW1lLFxuICAgICAgICAgICAgICAgc2VyaWVzQ2xpZW50U3F1YXJlZFRpbWUsIHNlcmllc0NsaWVudFNlcnZlclRpbWVdO1xuICAgICAgICAgIHRoaXMubG9uZ1Rlcm1EYXRhTmV4dEluZGV4ID0gKCsrdGhpcy5sb25nVGVybURhdGFOZXh0SW5kZXgpICUgdGhpcy5sb25nVGVybURhdGFMZW5ndGg7XG5cbiAgICAgICAgICAvLyBtZWFuIG9mIHRoZSB0aW1lIG9mZnNldCBvdmVyIDMgc2FtcGxlcyBhcm91bmQgbWVkaWFuXG4gICAgICAgICAgLy8gKGl0IG1pZ2h0IHVzZSBhIGxvbmdlciB0cmF2ZWwgZHVyYXRpb24pXG4gICAgICAgICAgY29uc3QgYXJvdW5kTWVkaWFuID0gc29ydGVkLnNsaWNlKE1hdGgubWF4KDAsIG1lZGlhbiAtIDEpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBNYXRoLm1pbihzb3J0ZWQubGVuZ3RoLCBtZWRpYW4gKyAxKSApO1xuICAgICAgICAgIHRoaXMudGltZU9mZnNldCA9IG1lYW4oYXJvdW5kTWVkaWFuLCAzKSAtIG1lYW4oYXJvdW5kTWVkaWFuLCAyKTtcblxuICAgICAgICAgIGlmKHRoaXMuc3RhdHVzID09PSAnc3RhcnR1cCdcbiAgICAgICAgICAgICB8fCAodGhpcy5zdGF0dXMgPT09ICd0cmFpbmluZydcbiAgICAgICAgICAgICAgICAgJiYgdGhpcy5nZXRTdGF0dXNEdXJhdGlvbigpIDwgdGhpcy5sb25nVGVybURhdGFUcmFpbmluZ0R1cmF0aW9uKSApIHtcbiAgICAgICAgICAgIC8vIHNldCBvbmx5IHRoZSBwaGFzZSBvZmZzZXQsIG5vdCB0aGUgZnJlcXVlbmN5XG4gICAgICAgICAgICB0aGlzLnNlcnZlclRpbWVSZWZlcmVuY2UgPSB0aGlzLnRpbWVPZmZzZXQ7XG4gICAgICAgICAgICB0aGlzLmNsaWVudFRpbWVSZWZlcmVuY2UgPSAwO1xuICAgICAgICAgICAgdGhpcy5mcmVxdWVuY3lSYXRpbyA9IDE7XG4gICAgICAgICAgICB0aGlzLnNldFN0YXR1cygndHJhaW5pbmcnKTtcbiAgICAgICAgICAgIGxvZygnVCA9ICVzICsgJXMgKiAoJXMgLSAlcykgPSAlcycsXG4gICAgICAgICAgICAgICAgICB0aGlzLnNlcnZlclRpbWVSZWZlcmVuY2UsIHRoaXMuZnJlcXVlbmN5UmF0aW8sXG4gICAgICAgICAgICAgICAgICBzZXJpZXNDbGllbnRUaW1lLCB0aGlzLmNsaWVudFRpbWVSZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgICB0aGlzLmdldFN5bmNUaW1lKHNlcmllc0NsaWVudFRpbWUpKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZigodGhpcy5zdGF0dXMgPT09ICd0cmFpbmluZydcbiAgICAgICAgICAgICAgJiYgdGhpcy5nZXRTdGF0dXNEdXJhdGlvbigpID49IHRoaXMubG9uZ1Rlcm1EYXRhVHJhaW5pbmdEdXJhdGlvbilcbiAgICAgICAgICAgICB8fCB0aGlzLnN0YXR1cyA9PT0gJ3N5bmMnKSB7XG4gICAgICAgICAgICAvLyBsaW5lYXIgcmVncmVzc2lvbiwgUiA9IGNvdmFyaWFuY2UodCxUKSAvIHZhcmlhbmNlKHQpXG4gICAgICAgICAgICBjb25zdCByZWdDbGllbnRUaW1lID0gbWVhbih0aGlzLmxvbmdUZXJtRGF0YSwgMSk7XG4gICAgICAgICAgICBjb25zdCByZWdTZXJ2ZXJUaW1lID0gbWVhbih0aGlzLmxvbmdUZXJtRGF0YSwgMik7XG4gICAgICAgICAgICBjb25zdCByZWdDbGllbnRTcXVhcmVkVGltZSA9IG1lYW4odGhpcy5sb25nVGVybURhdGEsIDMpO1xuICAgICAgICAgICAgY29uc3QgcmVnQ2xpZW50U2VydmVyVGltZSA9IG1lYW4odGhpcy5sb25nVGVybURhdGEsIDQpO1xuXG4gICAgICAgICAgICBjb25zdCBjb3ZhcmlhbmNlID0gcmVnQ2xpZW50U2VydmVyVGltZSAtIHJlZ0NsaWVudFRpbWUgKiByZWdTZXJ2ZXJUaW1lO1xuICAgICAgICAgICAgY29uc3QgdmFyaWFuY2UgPSByZWdDbGllbnRTcXVhcmVkVGltZSAtIHJlZ0NsaWVudFRpbWUgKiByZWdDbGllbnRUaW1lO1xuICAgICAgICAgICAgaWYodmFyaWFuY2UgPiAwKSB7XG4gICAgICAgICAgICAgIC8vIHVwZGF0ZSBmcmVxIGFuZCBzaGlmdFxuICAgICAgICAgICAgICB0aGlzLmZyZXF1ZW5jeVJhdGlvID0gY292YXJpYW5jZSAvIHZhcmlhbmNlO1xuICAgICAgICAgICAgICB0aGlzLmNsaWVudFRpbWVSZWZlcmVuY2UgPSByZWdDbGllbnRUaW1lO1xuICAgICAgICAgICAgICB0aGlzLnNlcnZlclRpbWVSZWZlcmVuY2UgPSByZWdTZXJ2ZXJUaW1lO1xuXG4gICAgICAgICAgICAgIC8vIDAuMDUlIGlzIGEgbG90ICg1MDAgUFBNLCBsaWtlIGFuIG9sZCBtZWNoYW5pY2FsIGNsb2NrKVxuICAgICAgICAgICAgICBpZih0aGlzLmZyZXF1ZW5jeVJhdGlvID4gMC45OTk1ICYmIHRoaXMuZnJlcXVlbmN5UmF0aW8gPCAxLjAwMDUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNldFN0YXR1cygnc3luYycpO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGxvZygnY2xvY2sgZnJlcXVlbmN5IHJhdGlvIG91dCBvZiBzeW5jOiAlcywgdHJhaW5pbmcgYWdhaW4nLFxuICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZnJlcXVlbmN5UmF0aW8pO1xuICAgICAgICAgICAgICAgIC8vIHN0YXJ0IHRoZSB0cmFpbmluZyBhZ2FpbiBmcm9tIHRoZSBsYXN0IHNlcmllc1xuICAgICAgICAgICAgICAgIHRoaXMuc2VydmVyVGltZVJlZmVyZW5jZSA9IHRoaXMudGltZU9mZnNldDsgLy8gb2Zmc2V0IG9ubHlcbiAgICAgICAgICAgICAgICB0aGlzLmNsaWVudFRpbWVSZWZlcmVuY2UgPSAwO1xuICAgICAgICAgICAgICAgIHRoaXMuZnJlcXVlbmN5UmF0aW8gPSAxO1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0U3RhdHVzKCd0cmFpbmluZycpO1xuXG4gICAgICAgICAgICAgICAgdGhpcy5sb25nVGVybURhdGFbMF1cbiAgICAgICAgICAgICAgICAgID0gW3Nlcmllc1RyYXZlbER1cmF0aW9uLCBzZXJpZXNDbGllbnRUaW1lLCBzZXJpZXNTZXJ2ZXJUaW1lLFxuICAgICAgICAgICAgICAgICAgICAgc2VyaWVzQ2xpZW50U3F1YXJlZFRpbWUsIHNlcmllc0NsaWVudFNlcnZlclRpbWVdO1xuICAgICAgICAgICAgICAgIHRoaXMubG9uZ1Rlcm1EYXRhLmxlbmd0aCA9IDE7XG4gICAgICAgICAgICAgICAgdGhpcy5sb25nVGVybURhdGFOZXh0SW5kZXggPSAxO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGxvZygnVCA9ICVzICsgJXMgKiAoJXMgLSAlcykgPSAlcycsXG4gICAgICAgICAgICAgICAgICB0aGlzLnNlcnZlclRpbWVSZWZlcmVuY2UsIHRoaXMuZnJlcXVlbmN5UmF0aW8sXG4gICAgICAgICAgICAgICAgICBzZXJpZXNDbGllbnRUaW1lLCB0aGlzLmNsaWVudFRpbWVSZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgICB0aGlzLmdldFN5bmNUaW1lKHNlcmllc0NsaWVudFRpbWUpICk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgdGhpcy50cmF2ZWxEdXJhdGlvbiA9IG1lYW4oc29ydGVkLCAwKTtcbiAgICAgICAgICB0aGlzLnRyYXZlbER1cmF0aW9uTWluID0gc29ydGVkWzBdWzBdO1xuICAgICAgICAgIHRoaXMudHJhdmVsRHVyYXRpb25NYXggPSBzb3J0ZWRbc29ydGVkLmxlbmd0aCAtIDFdWzBdO1xuXG4gICAgICAgICAgdGhpcy5yZXBvcnRTdGF0dXMocmVwb3J0RnVuY3Rpb24pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIHdlIGFyZSBpbiBhIHNlcmllcywgdXNlIHRoZSBwaW5nSW50ZXJ2YWwgdmFsdWVcbiAgICAgICAgICB0aGlzLnBpbmdEZWxheSA9IHRoaXMucGluZ1Nlcmllc1BlcmlvZDtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMudGltZW91dElkID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgdGhpcy5fX3N5bmNMb29wKHNlbmRGdW5jdGlvbiwgcmVwb3J0RnVuY3Rpb24pO1xuICAgICAgICB9LCBNYXRoLmNlaWwoMTAwMCAqIHRoaXMucGluZ0RlbGF5KSk7XG4gICAgICB9ICAvLyBwaW5nIGFuZCBwb25nIElEIG1hdGNoXG4gICAgfSk7IC8vIHJlY2VpdmUgZnVuY3Rpb25cblxuICAgIHRoaXMuX19zeW5jTG9vcChzZW5kRnVuY3Rpb24sIHJlcG9ydEZ1bmN0aW9uKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgbG9jYWwgdGltZSwgb3IgY29udmVydCBhIHN5bmNocm9uaXNlZCB0aW1lIHRvIGEgbG9jYWwgdGltZS5cbiAgICpcbiAgICogQGZ1bmN0aW9uIFN5bmNDbGllbnR+Z2V0TG9jYWxUaW1lXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBzeW5jVGltZSB1bmRlZmluZWQgdG8gZ2V0IGxvY2FsIHRpbWVcbiAgICogQHJldHVybnMge051bWJlcn0gbG9jYWwgdGltZSwgaW4gc2Vjb25kc1xuICAgKi9cbiAgZ2V0TG9jYWxUaW1lKHN5bmNUaW1lKSB7XG4gICAgaWYgKHR5cGVvZiBzeW5jVGltZSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIC8vIGNvbnZlcnNpb246IHQoVCkgPSB0MCArIChUIC0gVDApIC8gUlxuICAgICAgcmV0dXJuIHRoaXMuY2xpZW50VGltZVJlZmVyZW5jZVxuICAgICAgICArIChzeW5jVGltZSAtIHRoaXMuc2VydmVyVGltZVJlZmVyZW5jZSkgLyB0aGlzLmZyZXF1ZW5jeVJhdGlvO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyByZWFkIGxvY2FsIGNsb2NrXG4gICAgICByZXR1cm4gdGhpcy5nZXRUaW1lRnVuY3Rpb24oKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogR2V0IHN5bmNocm9uaXNlZCB0aW1lLCBvciBjb252ZXJ0IGEgbG9jYWwgdGltZSB0byBhIHN5bmNocm9uaXNlZCB0aW1lLlxuICAgKlxuICAgKiBAZnVuY3Rpb24gU3luY0NsaWVudH5nZXRTeW5jVGltZVxuICAgKiBAcGFyYW0ge051bWJlcn0gbG9jYWxUaW1lIHVuZGVmaW5lZCB0byBnZXQgc3luY2hyb25pc2VkIHRpbWVcbiAgICogQHJldHVybnMge051bWJlcn0gc3luY2hyb25pc2VkIHRpbWUsIGluIHNlY29uZHMuXG4gICAqL1xuICBnZXRTeW5jVGltZShsb2NhbFRpbWUgPSB0aGlzLmdldExvY2FsVGltZSgpKSB7XG4gICAgLy8gYWx3YXlzIGNvbnZlcnQ6IFQodCkgPSBUMCArIFIgKiAodCAtIHQwKVxuICAgIHJldHVybiB0aGlzLnNlcnZlclRpbWVSZWZlcmVuY2VcbiAgICAgICsgdGhpcy5mcmVxdWVuY3lSYXRpbyAqIChsb2NhbFRpbWUgLSB0aGlzLmNsaWVudFRpbWVSZWZlcmVuY2UpO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IFN5bmNDbGllbnQ7XG4iXX0=
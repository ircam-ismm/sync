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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImluZGV4LmpzIl0sIm5hbWVzIjpbImxvZyIsIlN5bmNTZXJ2ZXIiLCJnZXRUaW1lRnVuY3Rpb24iLCJzZW5kRnVuY3Rpb24iLCJyZWNlaXZlRnVuY3Rpb24iLCJpZCIsImNsaWVudFBpbmdUaW1lIiwic2VydmVyUGluZ1RpbWUiLCJnZXRMb2NhbFRpbWUiLCJzeW5jVGltZSIsImxvY2FsVGltZSJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7QUFBQTs7Ozs7O0FBQ0EsSUFBTUEsTUFBTSxxQkFBTSxNQUFOLENBQVo7O0lBRU1DLFU7QUFDSjs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFpQkE7Ozs7Ozs7OztBQVNBOzs7Ozs7O0FBT0E7Ozs7OztBQU1BOzs7Ozs7Ozs7QUFTQSxzQkFBWUMsZUFBWixFQUE2QjtBQUFBOztBQUMzQixTQUFLQSxlQUFMLEdBQXVCQSxlQUF2QjtBQUNEOztBQUVEOzs7Ozs7Ozs7Ozs7OzBCQVNNQyxZLEVBQWNDLGUsRUFBaUI7QUFBQTs7QUFDbkNBLHNCQUFnQixVQUFDQyxFQUFELEVBQUtDLGNBQUwsRUFBd0I7QUFDdEMsWUFBTUMsaUJBQWlCLE1BQUtDLFlBQUwsRUFBdkI7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBTCxxQkFBYUUsRUFBYixFQUFpQkMsY0FBakIsRUFDYUMsY0FEYixFQUM2QixNQUFLQyxZQUFMLEVBRDdCO0FBRUE7QUFDRCxPQVREOztBQVdBO0FBQ0Q7O0FBRUQ7Ozs7Ozs7Ozs7aUNBT2FDLFEsRUFBVTtBQUNyQixVQUFJLE9BQU9BLFFBQVAsS0FBb0IsV0FBeEIsRUFBcUM7QUFDbkMsZUFBT0EsUUFBUCxDQURtQyxDQUNsQjtBQUNsQixPQUZELE1BRU87QUFDTCxlQUFPLEtBQUtQLGVBQUwsRUFBUDtBQUNEO0FBQ0Y7O0FBRUQ7Ozs7Ozs7Ozs7Z0NBT1lRLFMsRUFBVztBQUNyQixhQUFPLEtBQUtGLFlBQUwsQ0FBa0JFLFNBQWxCLENBQVAsQ0FEcUIsQ0FDZ0I7QUFDdEM7Ozs7O2tCQUlZVCxVIiwiZmlsZSI6ImluZGV4LmpzIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IGRlYnVnIGZyb20gJ2RlYnVnJztcbmNvbnN0IGxvZyA9IGRlYnVnKCdzeW5jJyk7XG5cbmNsYXNzIFN5bmNTZXJ2ZXIge1xuICAvKipcbiAgICogQGNhbGxiYWNrIFN5bmNTZXJ2ZXJ+Z2V0VGltZUZ1bmN0aW9uXG4gICAqIEByZXR1cm4ge051bWJlcn0gbW9ub3RvbmljLCBldmVyIGluY3JlYXNpbmcsIHRpbWUgaW4gc2Vjb25kLiBXaGVuIHBvc3NpYmxlXG4gICAqICB0aGUgc2VydmVyIGNvZGUgc2hvdWxkIGRlZmluZSBpdHMgb3duIG9yaWdpbiAoaS5lLiBgdGltZT0wYCkgaW4gb3JkZXIgdG9cbiAgICogIG1heGltaXplIHRoZSByZXNvbHV0aW9uIG9mIHRoZSBjbG9jayBmb3IgYSBsb25nIHBlcmlvZCBvZiB0aW1lLiBXaGVuXG4gICAqICBgU3luY1NlcnZlcn5zdGFydGAgaXMgY2FsbGVkIHRoZSBjbG9jayBzaG91bGQgYmUgcnVubmluZ1xuICAgKiAgKGNmLiBgYXVkaW9Db250ZXh0LmN1cnJlbnRUaW1lYCB0aGF0IG5lZWRzIHVzZXIgaW50ZXJhY3Rpb24gdG8gc3RhcnQpXG4gICAqXG4gICAqIEBleGFtcGxlXG4gICAqIGNvbnN0IHN0YXJ0VGltZSA9IHByb2Nlc3MuaHJ0aW1lKCk7XG4gICAqXG4gICAqIGNvbnN0IGdldFRpbWVGdW5jdGlvbiA9ICgpID0+IHtcbiAgICogICBjb25zdCBub3cgPSBwcm9jZXNzLmhydGltZShzdGFydFRpbWUpO1xuICAgKiAgIHJldHVybiBub3dbMF0gKyBub3dbMV0gKiAxZS05O1xuICAgKiB9O1xuICAgKiovXG5cbiAgLyoqXG4gICAqIEBjYWxsYmFjayBTeW5jU2VydmVyfnNlbmRGdW5jdGlvblxuICAgKiBAc2VlIHtAbGlua2NvZGUgU3luY0NsaWVudH5yZWNlaXZlRnVuY3Rpb259XG4gICAqIEBwYXJhbSB7TnVtYmVyfSBwaW5nSWQgdW5pcXVlIGlkZW50aWZpZXJcbiAgICogQHBhcmFtIHtOdW1iZXJ9IGNsaWVudFBpbmdUaW1lIHRpbWUtc3RhbXAgb2YgcGluZyBlbWlzc2lvblxuICAgKiBAcGFyYW0ge051bWJlcn0gc2VydmVyUGluZ1RpbWUgdGltZS1zdGFtcCBvZiBwaW5nIHJlY2VwdGlvblxuICAgKiBAcGFyYW0ge051bWJlcn0gc2VydmVyUG9uZ1RpbWUgdGltZS1zdGFtcCBvZiBwb25nIGVtaXNzaW9uXG4gICAqKi9cblxuICAvKipcbiAgICogQGNhbGxiYWNrIFN5bmNTZXJ2ZXJ+cmVjZWl2ZUZ1bmN0aW9uXG4gICAqIEBzZWUge0BsaW5rY29kZSBTeW5jQ2xpZW50fnNlbmRGdW5jdGlvbn1cbiAgICogQHBhcmFtIHtTeW5jU2VydmVyfnJlY2VpdmVDYWxsYmFja30gcmVjZWl2ZUNhbGxiYWNrIGNhbGxlZCBvblxuICAgKiBlYWNoIG1lc3NhZ2UgbWF0Y2hpbmcgbWVzc2FnZVR5cGUuXG4gICAqKi9cblxuICAvKipcbiAgICogQGNhbGxiYWNrIFN5bmNTZXJ2ZXJ+cmVjZWl2ZUNhbGxiYWNrXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBwaW5nSWQgdW5pcXVlIGlkZW50aWZpZXJcbiAgICogQHBhcmFtIHtOdW1iZXJ9IGNsaWVudFBpbmdUaW1lIHRpbWUtc3RhbXAgb2YgcGluZyBlbWlzc2lvblxuICAgKiovXG5cbiAgLyoqXG4gICAqIFRoaXMgaXMgdGhlIGNvbnN0cnVjdG9yLiBTZWUge0BsaW5rY29kZSBTeW5jU2VydmVyfnN0YXJ0fSBtZXRob2QgdG9cbiAgICogYWN0dWFsbHkgc3RhcnQgYSBzeW5jaHJvbmlzYXRpb24gcHJvY2Vzcy5cbiAgICpcbiAgICogQGNvbnN0cnVjdHMgU3luY1NlcnZlclxuICAgKiBAcGFyYW0ge1N5bmNTZXJ2ZXJ+Z2V0VGltZUZ1bmN0aW9ufSBnZXRUaW1lRnVuY3Rpb24gY2FsbGVkIHRvIGdldCB0aGUgbG9jYWxcbiAgICogdGltZS4gSXQgbXVzdCByZXR1cm4gYSB0aW1lIGluIHNlY29uZHMsIG1vbm90b25pYywgZXZlclxuICAgKiBpbmNyZWFzaW5nLlxuICAgKi9cbiAgY29uc3RydWN0b3IoZ2V0VGltZUZ1bmN0aW9uKSB7XG4gICAgdGhpcy5nZXRUaW1lRnVuY3Rpb24gPSBnZXRUaW1lRnVuY3Rpb247XG4gIH1cblxuICAvKipcbiAgICogU3RhcnQgYSBzeW5jaHJvbmlzYXRpb24gcHJvY2VzcyBieSByZWdpc3RlcmluZyB0aGUgcmVjZWl2ZVxuICAgKiBmdW5jdGlvbiBwYXNzZWQgYXMgc2Vjb25kIHBhcmFtZXRlci4gT24gZWFjaCByZWNlaXZlZCBtZXNzYWdlLFxuICAgKiBzZW5kIGEgcmVwbHkgdXNpbmcgdGhlIGZ1bmN0aW9uIHBhc3NlZCBhcyBmaXJzdCBwYXJhbWV0ZXIuXG4gICAqXG4gICAqIEBmdW5jdGlvbiBTeW5jU2VydmVyfnN0YXJ0XG4gICAqIEBwYXJhbSB7U3luY1NlcnZlcn5zZW5kRnVuY3Rpb259IHNlbmRGdW5jdGlvblxuICAgKiBAcGFyYW0ge1N5bmNTZXJ2ZXJ+cmVjZWl2ZUZ1bmN0aW9ufSByZWNlaXZlRnVuY3Rpb25cbiAgICovXG4gIHN0YXJ0KHNlbmRGdW5jdGlvbiwgcmVjZWl2ZUZ1bmN0aW9uKSB7XG4gICAgcmVjZWl2ZUZ1bmN0aW9uKChpZCwgY2xpZW50UGluZ1RpbWUpID0+IHtcbiAgICAgIGNvbnN0IHNlcnZlclBpbmdUaW1lID0gdGhpcy5nZXRMb2NhbFRpbWUoKTtcbiAgICAgIC8vIHdpdGggdGhpcyBhbGdvcml0aG0sIHRoZSBkdWFsIGNhbGwgdG8gYGdldExvY2FsVGltZWAgY2FuIGFwcGVhclxuICAgICAgLy8gbm9uLW5lY2Vzc2FyeSwgaG93ZXZlciBrZWVwaW5nIHRoaXMgY2FuIGFsbG93IHRvIGltcGxlbWVudCBvdGhlclxuICAgICAgLy8gYWxnb3JpdGhtcyB3aGlsZSBrZWVwaW5nIHRoZSBBUEkgdW5jaGFuZ2VkLCB0aHVzIG1ha2luZyBlYXNpZXJcbiAgICAgIC8vIHRvIGltcGxlbWVudCBhbmQgY29tcGFyZSBzZXZlcmFsIGFsZ29yaXRobXMuXG4gICAgICBzZW5kRnVuY3Rpb24oaWQsIGNsaWVudFBpbmdUaW1lLFxuICAgICAgICAgICAgICAgICAgIHNlcnZlclBpbmdUaW1lLCB0aGlzLmdldExvY2FsVGltZSgpKTtcbiAgICAgIC8vIGxvZygncGluZzogJXMsICVzLCAlcycsIGlkLCBjbGllbnRQaW5nVGltZSwgc2VydmVyUGluZ1RpbWUpO1xuICAgIH0pO1xuXG4gICAgLy8gcmV0dXJuIHNvbWUgaGFuZGxlIHRoYXQgd291bGQgYWxsb3cgdG8gY2xlYW4gbWVtb3J5ID9cbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgbG9jYWwgdGltZSwgb3IgY29udmVydCBhIHN5bmNocm9uaXNlZCB0aW1lIHRvIGEgbG9jYWwgdGltZS5cbiAgICpcbiAgICogQGZ1bmN0aW9uIFN5bmNTZXJ2ZXJ+Z2V0TG9jYWxUaW1lXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBzeW5jVGltZSB1bmRlZmluZWQgdG8gZ2V0IGxvY2FsIHRpbWVcbiAgICogQHJldHVybnMge051bWJlcn0gbG9jYWwgdGltZSwgaW4gc2Vjb25kc1xuICAgKi9cbiAgZ2V0TG9jYWxUaW1lKHN5bmNUaW1lKSB7XG4gICAgaWYgKHR5cGVvZiBzeW5jVGltZSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIHJldHVybiBzeW5jVGltZTsgLy8gc3luYyB0aW1lIGlzIGxvY2FsOiBubyBjb252ZXJzaW9uXG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiB0aGlzLmdldFRpbWVGdW5jdGlvbigpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgc3luY2hyb25pc2VkIHRpbWUsIG9yIGNvbnZlcnQgYSBsb2NhbCB0aW1lIHRvIGEgc3luY2hyb25pc2VkIHRpbWUuXG4gICAqXG4gICAqIEBmdW5jdGlvbiBTeW5jU2VydmVyfmdldFN5bmNUaW1lXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBsb2NhbFRpbWUgdW5kZWZpbmVkIHRvIGdldCBzeW5jaHJvbmlzZWQgdGltZVxuICAgKiBAcmV0dXJucyB7TnVtYmVyfSBzeW5jaHJvbmlzZWQgdGltZSwgaW4gc2Vjb25kcy5cbiAgICovXG4gIGdldFN5bmNUaW1lKGxvY2FsVGltZSkge1xuICAgIHJldHVybiB0aGlzLmdldExvY2FsVGltZShsb2NhbFRpbWUpOyAvLyBzeW5jIHRpbWUgaXMgbG9jYWwsIGhlcmVcbiAgfVxuXG59XG5cbmV4cG9ydCBkZWZhdWx0IFN5bmNTZXJ2ZXI7XG4iXX0=
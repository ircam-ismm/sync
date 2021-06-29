import debug from 'debug';
const log = debug('sync');

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
      const serverPingTime = this.getLocalTime();
      // with this algorithm, the dual call to `getLocalTime` can appear
      // non-necessary, however keeping this can allow to implement other
      // algorithms while keeping the API unchanged, thus making easier
      // to implement and compare several algorithms.
      sendFunction(id, clientPingTime,
                   serverPingTime, this.getLocalTime());
      // log('ping: %s, %s, %s', id, clientPingTime, serverPingTime);
    });

    // return some handle that would allow to clean memory ?
  }

  /**
   * Get local time, or convert a synchronised time to a local time.
   *
   * @note - `getLocalTime` and `getSyncTime` are basically aliases on the server.
   *
   * @param {Number} [syncTime=undefined] - Get local time according to given
   *  given `syncTime`, if `syncTime` is not defined returns current local time.
   * @returns {Number} - local time, in seconds
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
   * @note - `getLocalTime` and `getSyncTime` are basically aliases on the server.
   *
   * @param {Number} [localTime=undefined]-  Get local time according to given
   *  given `syncTime`, if `localTime` is not defined returns current sync time.
   * @returns {Number} - synchronised time, in seconds.
   */
  getSyncTime(localTime) {
    return this.getLocalTime(localTime); // sync time is local, here
  }

}

export default SyncServer;

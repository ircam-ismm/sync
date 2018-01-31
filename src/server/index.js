import debug from 'debug';
const log = debug('sync');

class SyncServer {
  /**
   * @callback SyncServer~getTimeFunction
   * @return {Number} monotonic, ever increasing, time in second. When possible
   *  the server code should define its own origin (i.e. `time=0`) in order to
   *  maximize the eesolution of the clock for a long period of time.
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
  constructor(getTimeFunction) {
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
   * @function SyncServer~getLocalTime
   * @param {Number} syncTime undefined to get local time
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
   * @function SyncServer~getSyncTime
   * @param {Number} localTime undefined to get synchronised time
   * @returns {Number} synchronised time, in seconds.
   */
  getSyncTime(localTime) {
    return this.getLocalTime(localTime); // sync time is local, here
  }

}

export default SyncServer;

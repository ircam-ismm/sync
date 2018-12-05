/**
 * @fileOverview Estimation of a server time from a client time.
 *
 * @see {@link https://hal.archives-ouvertes.fr/hal-01304889v1}
 * Stabilisation added after the article.
 */

import debug from 'debug';
const log = debug('sync');

////// helpers

/**
 * Order min and max attributes.
 *
 * @private
 * @param {Object} that with min and max attributes
 * @returns {Object} with min and man attributes, swapped if that.min > that.max
 */
function orderMinMax(that) {
  if(typeof that !== 'undefined'
     && typeof that.min !== 'undefined' && typeof that.max !== 'undefined'
     && that.min > that.max) {
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
 * @param {Array.<Number>} a
 * @param {Number.<Number>} b
 * @returns {Number} negative if a < b, positive if a > b, or 0
 */
function dataCompare(a, b) {
  return a[0] - b[0] || a[1] - b[1];
}

class SyncClient {
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
   */
  constructor(getTimeFunction, options = {}) {
    this.pingTimeoutDelay = options.pingTimeoutDelay || { min: 1, max: 30 };
    orderMinMax(this.pingTimeoutDelay);

    this.pingSeriesIterations = options.pingSeriesIterations || 10;
    this.pingSeriesPeriod = (typeof options.pingSeriesPeriod !== 'undefined'
                             ? options.pingSeriesPeriod
                             : 0.250);
    this.pingSeriesDelay = options.pingSeriesDelay || { min: 10, max: 20 };
    orderMinMax(this.pingSeriesDelay);

    this.pingDelay = 0; // current delay before next ping
    this.timeoutId = 0; // to cancel timeout on pong
    this.pingId = 0; // absolute ID to mach pong against

    this.pingSeriesCount = 0; // elapsed pings in a series
    this.seriesData = []; // circular buffer
    this.seriesDataNextIndex = 0; // next index to write in circular buffer
    this.seriesDataLength = this.pingSeriesIterations; // size of circular buffer

    this.longTermDataTrainingDuration
      = options.longTermDataTrainingDuration || 120;

    // use a fixed-size circular buffer, even if it does not match
    // exactly the required duration
    this.longTermDataDuration = options.longTermDataDuration || 900;
    this.longTermDataLength = Math.max(
      2,
      this.longTermDataDuration /
        (0.5 * (this.pingSeriesDelay.min + this.pingSeriesDelay.max) ) );

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
  setStatus(status) {
    if(status !== this.status) {
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
  getStatusDuration() {
    return Math.max(0, this.getLocalTime() - this.statusChangedTime);
  }

  /**
   * Set connectionStatus, and set this.connectionStatusChangedTime, to later
   * use {@linkcode SyncClient~getConnectionStatusDuration} and {@linkcode
   * SyncClient~reportStatus}.
   *
   * @function SyncClient~setConnectionStatus
   * @param {String} connectionStatus
   * @returns {Object} this
   */
  setConnectionStatus(connectionStatus) {
    if(connectionStatus !== this.connectionStatus) {
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
  getConnectionStatusDuration() {
    return Math.max(0, this.getLocalTime() - this.connectionStatusChangedTime);
  }

  /**
   * Report the status of the synchronisation process, if
   * reportFunction is defined.
   *
   * @function SyncClient~reportStatus
   * @param {SyncClient~reportFunction} reportFunction
   */
  reportStatus(reportFunction) {
    if(typeof reportFunction !== 'undefined') {
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
  __syncLoop(sendFunction, reportFunction) {
    clearTimeout(this.timeoutId);
    ++this.pingId;
    sendFunction(this.pingId, this.getLocalTime());

    this.timeoutId = setTimeout(() => {
      // increase timeout duration on timeout, to avoid overflow
      this.pingTimeoutDelay.current = Math.min(this.pingTimeoutDelay.current * 2,
                                               this.pingTimeoutDelay.max);
      log('sync:ping timeout > %s', this.pingTimeoutDelay.current);
      this.setConnectionStatus('offline');
      this.reportStatus(reportFunction);
      // retry (yes, always increment pingId)
      this.__syncLoop(sendFunction, reportFunction);
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
        this.setConnectionStatus('online');
        // reduce timeout duration on pong, for better reactivity
        this.pingTimeoutDelay.current = Math.max(this.pingTimeoutDelay.current * 0.75,
                                                 this.pingTimeoutDelay.min);

        // time-differences are valid on a single-side only (client or server)
        const clientPongTime = this.getLocalTime();
        const clientTime = 0.5 * (clientPongTime + clientPingTime);
        const serverTime = 0.5 * (serverPongTime + serverPingTime);
        const travelDuration = Math.max(0, (clientPongTime - clientPingTime)
                                        - (serverPongTime - serverPingTime));
        const offsetTime = serverTime - clientTime;

        // order is important for sorting, later.
        this.seriesData[this.seriesDataNextIndex]
          = [travelDuration, offsetTime, clientTime, serverTime];
        this.seriesDataNextIndex = (++this.seriesDataNextIndex) % this.seriesDataLength;

        // log('ping %s, travel = %s, offset = %s, client = %s, server = %s',
        //       pingId, travelDuration, offsetTime, clientTime, serverTime);

        // end of a series
        if (this.pingSeriesCount >= this.pingSeriesIterations
            && this.seriesData.length >= this.seriesDataLength) {
          // plan the begining of the next series
          this.pingDelay = this.pingSeriesDelay.min
            + Math.random() * (this.pingSeriesDelay.max - this.pingSeriesDelay.min);
          this.pingSeriesCount = 0;

          // sort by travel time first, then offset time.
          const sorted = this.seriesData.slice(0).sort(dataCompare);

          const seriesTravelDuration = sorted[0][0];

          // When the clock tick is long enough,
          // some travel times (dimension 0) might be identical.
          // Then, use the offset median (dimension 1 is the second sort key)
          // of shortest travel duration
          let quick = 0;
          while(quick < sorted.length && sorted[quick][0] <= seriesTravelDuration * 1.01) {
            ++quick;
          }
          quick = Math.max(0, quick - 1);
          const median = Math.floor(quick / 2);

          const seriesClientTime = sorted[median][2];
          const seriesServerTime = sorted[median][3];
          const seriesClientSquaredTime = seriesClientTime * seriesClientTime;
          const seriesClientServerTime = seriesClientTime * seriesServerTime;

          this.longTermData[this.longTermDataNextIndex]
            = [seriesTravelDuration, seriesClientTime, seriesServerTime,
               seriesClientSquaredTime, seriesClientServerTime];
          this.longTermDataNextIndex = (++this.longTermDataNextIndex) % this.longTermDataLength;

          // mean of the time offset over 3 samples around median
          // (limited to shortest travel duration)
          const aroundMedian = sorted.slice(Math.max(0, median - 1),
                                            Math.min(quick, median + 1) + 1);
          this.timeOffset = mean(aroundMedian, 1);

          if(this.status === 'startup'
             || (this.status === 'training'
                 && this.getStatusDuration() < this.longTermDataTrainingDuration) ) {
            // set only the phase offset, not the frequency
            this.serverTimeReference = this.timeOffset;
            this.clientTimeReference = 0;
            this.frequencyRatio = 1;
            this.setStatus('training');
            log('T = %s + %s * (%s - %s) = %s',
                  this.serverTimeReference, this.frequencyRatio,
                  seriesClientTime, this.clientTimeReference,
                  this.getSyncTime(seriesClientTime));
          }

          if((this.status === 'training'
              && this.getStatusDuration() >= this.longTermDataTrainingDuration)
             || this.status === 'sync') {
            // linear regression, R = covariance(t,T) / variance(t)
            const regClientTime = mean(this.longTermData, 1);
            const regServerTime = mean(this.longTermData, 2);
            const regClientSquaredTime = mean(this.longTermData, 3);
            const regClientServerTime = mean(this.longTermData, 4);

            const covariance = regClientServerTime - regClientTime * regServerTime;
            const variance = regClientSquaredTime - regClientTime * regClientTime;
            if(variance > 0) {
              // update freq and shift
              this.frequencyRatio = covariance / variance;
              this.clientTimeReference = regClientTime;
              this.serverTimeReference = regServerTime;

              // 0.05% is a lot (500 PPM, like an old mechanical clock)
              if(this.frequencyRatio > 0.9995 && this.frequencyRatio < 1.0005) {
                this.setStatus('sync');
              } else {
                log('clock frequency ratio out of sync: %s, training again',
                      this.frequencyRatio);
                // start the training again from the last series
                this.serverTimeReference = this.timeOffset; // offset only
                this.clientTimeReference = 0;
                this.frequencyRatio = 1;
                this.setStatus('training');

                this.longTermData[0]
                  = [seriesTravelDuration, seriesClientTime, seriesServerTime,
                     seriesClientSquaredTime, seriesClientServerTime];
                this.longTermData.length = 1;
                this.longTermDataNextIndex = 1;
              }
            }

            log('T = %s + %s * (%s - %s) = %s',
                  this.serverTimeReference, this.frequencyRatio,
                  seriesClientTime, this.clientTimeReference,
                  this.getSyncTime(seriesClientTime) );
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
          this.__syncLoop(sendFunction, reportFunction);
        }, Math.ceil(1000 * this.pingDelay));
      }  // ping and pong ID match
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
  getLocalTime(syncTime) {
    if (typeof syncTime !== 'undefined') {
      // conversion: t(T) = t0 + (T - T0) / R
      return this.clientTimeReference
        + (syncTime - this.serverTimeReference) / this.frequencyRatio;
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
  getSyncTime(localTime = this.getLocalTime()) {
    // always convert: T(t) = T0 + R * (t - t0)
    return this.serverTimeReference
      + this.frequencyRatio * (localTime - this.clientTimeReference);
  }
}

export default SyncClient;

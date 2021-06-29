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
     * @constant {Number}
     * @value 500 PPM, like an old mechanical clock
     * @static
     */
    SyncClient.minimumStability = 500e-6;
    // 500 PPM, like an old mechanical clock

    this.estimationMonotonicity =
      (typeof options.estimationMonotonicity !== 'undefined'
       ? options.estimationMonotonicity
       : true);
    this.estimationStability = options.estimationStability || 160e-6;
    this.estimationStability = Math.max(0,
                                        Math.min(SyncClient.minimumStability,
                                                 this.estimationStability));

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
    if(status !== this.status) {
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
    if(connectionStatus !== this.connectionStatus) {
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
   * Report the status of the synchronisation process, if
   * reportFunction is defined.
   *
   * @private
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
      // log('sync:ping timeout > %s', this.pingTimeoutDelay.current);
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
        //     pingId, travelDuration, offsetTime, clientTime, serverTime);

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

          const updateClientTime = this.getLocalTime();
          const updateServerTimeBefore = this.getSyncTime(updateClientTime);

          if(this.status === 'startup'
             || (this.status === 'training'
                 && this.getStatusDuration() < this.longTermDataTrainingDuration) ) {
            // set only the phase offset, not the frequency
            this.serverTimeReference = this.timeOffset;
            this.clientTimeReference = 0;
            this.frequencyRatio = 1;
            if(this.status !== 'startup') {
              // no stabilisation on startup
              this._stabilisationUpdate(updateClientTime, updateServerTimeBefore);
            }

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

              // exclude bounds, to ensure strict monotonicity
              if(this.frequencyRatio > 1 - SyncClient.minimumStability
                 && this.frequencyRatio < 1 + SyncClient.minimumStability) {
                this.setStatus('sync');
                this._stabilisationUpdate(updateClientTime, updateServerTimeBefore);
              } else {

                log('clock frequency ratio out of sync: %s, training again',
                    this.frequencyRatio);

                // start the training again from the last series
                this.serverTimeReference = this.timeOffset; // offset only
                this.clientTimeReference = 0;
                this.frequencyRatio = 1;
                this._stabilisationReset();
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
          this._syncLoop(sendFunction, reportFunction);
        }, Math.ceil(1000 * this.pingDelay));
      }  // ping and pong ID match
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

      if(this.estimationMonotonicity
         && T < this.stabilisationServerTimeEnd) {
        // remove stabilisation before conversion
        // S -> T
        const Sss = Math.max(this.stabilisationServerTimeStart, T);

        const stabilisation = this.stabilisationOffset
              * (this.stabilisationServerTimeEnd - Sss)
              / (this.stabilisationServerTimeEnd - this.stabilisationServerTimeStart);

        T -= stabilisation;
      }

      // conversion: t(T) = t0 + (T - T0) / R
      // T -> t
      return this.clientTimeReference
        + (T - this.serverTimeReference) / this.frequencyRatio;
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
    let T = this.serverTimeReference
          + this.frequencyRatio * (localTime - this.clientTimeReference);

    if(this.estimationMonotonicity
       && localTime < this.stabilisationClientTimeEnd) {
      const t = Math.max(this.stabilisationClientTimeStart, localTime);
      // add stabilisation after conversion
      // T -> S
      const stabilisation = this.stabilisationOffset
            * (this.stabilisationClientTimeEnd - t)
            / (this.stabilisationClientTimeEnd - this.stabilisationClientTimeStart);

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
      this.pingTimeoutDelay.current = Math.min(this.pingTimeoutDelay.current * 2,
                                               this.pingTimeoutDelay.max);
      log('sync:ping timeout > %s', this.pingTimeoutDelay.current);
      this.setConnectionStatus('offline');
      this.reportStatus(reportFunction);
      // retry (yes, always increment pingId)
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
    if(!this.estimationMonotonicity || this.status === 'startup') {
      // no stabilisation on startup
      return;
    }

    // estimated server time just after synchronisation update
    // with new parameters and without stabilisation (yet)
    this._stabilisationReset();
    const updateServerTimeAfter = this.getSyncTime(updateClientTime);

    // So is a compensation added to syncTime
    this.stabilisationOffset = updateServerTimeBefore - updateServerTimeAfter;

    // tss
    this.stabilisationClientTimeStart = updateClientTime;

    // tse
    this.stabilisationClientTimeEnd
      = Math.abs(updateServerTimeBefore - updateServerTimeAfter)
      / this.estimationStability
      + this.stabilisationClientTimeStart;

    // Full compensation at Sss, to match new server time wit new one
    // Sss = Tss + So
    this.stabilisationServerTimeStart = updateServerTimeBefore;

    // Sse
    // No compensation for S >= Sse
    // As getSyncTime does _not_ use stabilisation server times,
    // the next call is possible to bootstrap getLocalTime
    this.stabilisationServerTimeEnd
      = this.getSyncTime(this.stabilisationClientTimeEnd);

    log('stabilisation updated',
        'So = ', this.stabilisationOffset,
        ',', 'tss = ', this.stabilisationClientTimeStart,
        ',', 'tse = ', this.stabilisationClientTimeEnd,
        ',', 'Sss = ', this.stabilisationServerTimeStart,
        ',', 'Sse = ', this.stabilisationServerTimeEnd,
        ',', 'Tbefore = ', updateServerTimeBefore,
        ',', 'Tafter = ', updateServerTimeAfter);
  }

}

export default SyncClient;

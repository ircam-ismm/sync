/**
 * @fileoverview Client side syncronization module
 * @author Sebastien.Robaszkiewicz@ircam.fr, Norbert.Schnell@ircam.fr
 */
'use strict';

function getMinOfArray(numArray) {
  return Math.min.apply(null, numArray);
}

function getMaxOfArray(numArray) {
  return Math.max.apply(null, numArray);
}

class SyncProcess {
  constructor(getTimeFunction, sendFunction, receiveFunction, iterations, period, callback) {
    this.id = Math.floor(Math.random() * 1000000);

    this.getTimeFunction = getTimeFunction;
    this.sendFunction = sendFunction;
    this.receiveFunction = receiveFunction;

    this.iterations = iterations;
    this.period = period;
    this.count = 0;

    this.timeOffset = 0;

    this.timeOffsets = [];
    this.travelTimes = [];
    this.avgTimeOffset = 0;
    this.avgTravelTime = 0;
    this.minTravelTime = 0;
    this.maxTravelTime = 0;

    // Send first ping
    this.__sendPing();

    this.callback = callback;

    // When the client receives a 'pong' from the
    // server, calculate the travel time and the
    // time offset.
    // Repeat as many times as needed (__iterations).
    receiveFunction('sync_pong', (id, clientPingTime, serverPongTime) => {
      if (id === this.id) {
        var now = this.getTimeFunction();
        var travelTime = now - clientPingTime;
        const timeOffset = serverPongTime - (now - travelTime / 2);

        this.travelTimes.push(travelTime);
        this.timeOffsets.push(timeOffset);

        if (this.count < this.iterations) {
          setTimeout(() => {
            this.__sendPing();
          }, 1000 * this.period);
        } else {
          this.avgTravelTime = this.travelTimes.reduce((p, q) => p + q) / this.travelTimes.length;
          this.avgTimeOffset = this.timeOffsets.reduce((p, q) => p + q) / this.timeOffsets.length;
          this.minTravelTime = getMinOfArray(this.travelTimes);
          this.maxTravelTime = getMaxOfArray(this.travelTimes);

          this.timeOffset = this.avgTimeOffset;

          this.callback(this.timeOffset);
          // this.socket.emit('sync_stats', stats);
        }
      }
    });
  }

  __sendPing() {
    this.count++;
    this.sendFunction('sync_ping', this.id, this.getTimeFunction());
  }
}

class SyncClient {
  constructor(getTimeFunction, options = {}) {
    this.iterations = options.iterations || 5; // number of ping-pongs per iteration
    this.period = options.period || 0.500; // period of pings
    this.minInterval = this.minInterval || 10; // interval of ping-pongs minimum
    this.maxInterval = this.maxInterval || 20; // interval of ping-pongs maximum

    if (this.minInterval > this.maxInterval) {
      this.minInterval = this.maxInterval;
    }

    this.getTimeFunction = getTimeFunction;
    this.timeOffset = 0;
  }

  start(sendFunction, receiveFunction) {
    this.__syncLoop(sendFunction, receiveFunction);
  }

  __syncLoop(sendFunction, receiveFunction) {
    var interval = this.minInterval + Math.random() * (this.maxInterval - this.minInterval);

    var sync = new SyncProcess(this.getTimeFunction, sendFunction, receiveFunction, this.iterations, this.period, (offset) => {
      this.timeOffset = offset;
    });

    setTimeout(() => {
      this.__syncLoop(sendFunction, receiveFunction);
    }, 1000 * interval);
  }

  getLocalTime(syncTime) {
    if (syncTime)      
      return syncTime - this.timeOffset; // conversion
    else
      return this.getTimeFunction(); // read local clock
  }

  getSyncTime(localTime = this.getTimeFunction()) {
    return localTime + this.timeOffset; // always convert
  }
}

module.exports = SyncClient;
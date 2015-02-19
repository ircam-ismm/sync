/**
 * @fileoverview Client side syncronization module
 * @author Sebastien.Robaszkiewicz@ircam.fr, Norbert.Schnell@ircam.fr
 */
'use strict';

var audioContext = require('audio-context');

function getMinOfArray(numArray) {
  return Math.min.apply(null, numArray);
}

function getMaxOfArray(numArray) {
  return Math.max.apply(null, numArray);
}

class SyncProcess {
  constructor(socket, iterations, period, statsCallback) {
    this.id = Math.floor(Math.random() * 1000000);

    this.socket = socket;
    this.statsCallback = statsCallback;

    this.iterations = iterations;
    this.period = period;
    this.count = 0;

    this.timeOffsets = [];
    this.travelTimes = [];
    this.avgTimeOffset = 0;
    this.avgTravelTime = 0;
    this.minTravelTime = 0;
    this.maxTravelTime = 0;

    // Send first ping
    this.__sendPing();

    // When the client receives a 'pong' from the
    // server, calculate the travel time and the
    // time offset.
    // Repeat as many times as needed (__iterations).
    this.socket.on('sync_pong', (id, clientPingTime, serverPongTime) => {
      if (id === this.id) {
        var now = audioContext.currentTime;
        var travelTime = now - clientPingTime;
        var timeOffset = serverPongTime - (now - travelTime / 2);

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

          var stats = {
            minTravelTime: this.minTravelTime,
            maxTravelTime: this.maxTravelTime,
            avgTravelTime: this.avgTravelTime,
            avgTimeOffset: this.avgTimeOffset
          };

          this.socket.emit('sync_stats', stats);
          statsCallback(stats);
        }
      }
    });
  }

  __sendPing() {
    this.count++;
    this.socket.emit('sync_ping', this.id, audioContext.currentTime);
  }
}

class SyncClient {
  constructor(params = {}) {
    this.iterations = params.iterations || 5; // number of ping-pongs per iteration
    this.period = params.period || 0.500; // period of pings
    this.minInterval = this.minInterval || 10; // interval of ping-pongs minimum
    this.maxInterval = this.maxInterval || 20; // interval of ping-pongs maximum

    if(this.minInterval > this.maxInterval)
      this.minInterval = this.maxInterval;

    // stats
    this.minTravelTimes = [];
    this.maxTravelTimes = [];
    this.avgTravelTimes = [];
    this.avgTimeOffsets = [];

    this.timeOffset = 0;
  }

  start(socket, statsCallback) {
    this.socket = socket;
    this.statsCallback = statsCallback;
    this.__syncLoop();
  }

  __syncLoop() {
    var interval = this.minInterval + Math.random() * (this.maxInterval - this.minInterval);

    var sync = new SyncProcess(this.socket, this.iterations, this.period, (stats) => {
      this.timeOffset = stats.avgTimeOffset;

      this.minTravelTimes.push(stats.minTravelTime);
      this.maxTravelTimes.push(stats.maxTravelTime);
      this.avgTimeOffsets.push(stats.avgTimeOffset);
      this.avgTravelTimes.push(stats.avgTravelTime);

      this.statsCallback(stats);
    });

    setTimeout(() => {
      this.__syncLoop();
    }, 1000 * interval);
  }

  getLocalTime(serverTime) {
    if (serverTime)
      return serverTime - this.timeOffset;

    return audioContext.currentTime;
  }

  getServerTime(localTime = audioContext.currentTime) {
    return localTime + this.timeOffset;
  }
}

module.exports = SyncClient;
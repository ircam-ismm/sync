/**
 * @fileoverview Client side syncronization module
 * @author Sebastien.Robaszkiewicz@ircam.fr, Norbert.Schnell@ircam.fr
 */
'use strict';

const debug = require('debug')('soundworks:sync');

var audioContext = require('audio-context');

function getMinOfArray(numArray) {
  return Math.min.apply(null, numArray);
}

function getMaxOfArray(numArray) {
  return Math.max.apply(null, numArray);
}

class SyncProcess {
  constructor(socket, iterations, period, callback) {
    this.id = Math.floor(Math.random() * 1000000);

    this.socket = socket;

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
    this.socket.on('sync_pong', (id, clientPingTime, serverPongTime) => {
      debug('sync_pong', id);
      if (id === this.id) {
        var now = audioContext.currentTime;
        var travelTime = now - clientPingTime;
        const timeOffset = serverPongTime - (now - travelTime / 2);
        debug("timeOffset = %s", timeOffset);

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

          debug("timeOffset - avgTimeOffset = %s",
                timeOffset - this.avgTimeOffset);
          this.timeOffset = this.avgTimeOffset;

          debug("this.timeOffset = %s", this.avgTimeOffset);
          this.callback(this.timeOffset);
          // this.socket.emit('sync_stats', stats);
        }
      }
    });
  }

  __sendPing() {
    this.count++;
    debug('sync_ping');
    this.socket.emit('sync_ping', this.id, audioContext.currentTime);
  }
}

class SyncClient {
  constructor(params = {}) {
    this.iterations = params.iterations || 5; // number of ping-pongs per iteration
    this.period = params.period || 0.500; // period of pings
    this.minInterval = this.minInterval || 10; // interval of ping-pongs minimum
    this.maxInterval = this.maxInterval || 20; // interval of ping-pongs maximum

    if(this.minInterval > this.maxInterval) {
      this.minInterval = this.maxInterval;
    }

    this.timeOffset = 0;
  }

    start(socket) {
    this.socket = socket;
    this.__syncLoop();
  }

  __syncLoop() {
    var interval = this.minInterval + Math.random() * (this.maxInterval - this.minInterval);

    var sync = new SyncProcess(this.socket, this.iterations, this.period,
                               (offset) => {
                                 this.timeOffset = offset;  
                               });

    setTimeout(() => {
      this.__syncLoop();
    }, 1000 * interval);
  }

  getLocalTime(masterTime) {
    if(typeof masterTime !== 'undefined') {
      // conversion
      return masterTime - this.timeOffset;
    } else {
      // Read local clock
      return audioContext.currentTime;
    }
  }

  getMasterTime(localTime = audioContext.currentTime) {
    // always convert
    return localTime + this.timeOffset;
  }
}

module.exports = SyncClient;

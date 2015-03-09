'use strict';

var EventEmitter = require('events').EventEmitter;

class SyncClient extends EventEmitter {
  constructor(getTimeFunction, options = {}) {
    this.pingIterations = options.pingIterations || 10; // number of ping-pongs in a streak
    this.pingInterval = options.pingInterval || 0.250; // interval between pings in a streak (in seconds)
    this.pingSleepInterval = this.pingSleepInterval || [10, 20]; // range of interval between ping-pong streaks (in seconds)
    this.pingCount = 0; // elapsed pings
    this.pingId = 0; // ping ID

    this.data = []; // circular buffer
    this.dataNextIndex = 0; // next index in circular buffer
    this.dataLength = this.pingIterations; // size of circular buffer
    this.dataBest = Math.min(4, this.dataLength); // number of quickest roundtrip times used to compute mean offset

    this.timeOffset = 0;
    this.travelTime = 0;

    if (this.pingSleepInterval[0] > this.pingSleepInterval[1]) {
      this.pingSleepInterval[0] = this.pingSleepInterval[1];
    }

    this.getTimeFunction = getTimeFunction;
  }

  __syncLoop(sendFunction) {
    let interval;

    if (this.pingCount < this.pingIterations) { // if we are in a streak, use the pingInterval value
      interval = this.pingInterval;
      ++this.pingCount;
    } else { // if we reached the end of a streak, plan for the begining of the next streak
      interval = this.pingSleepInterval[0] + Math.random() * (this.pingSleepInterval[1] - this.pingSleepInterval[0]);
      this.pingCount = 0;
    }
    
    ++this.pingId;
    sendFunction('sync_ping', this.pingId, this.getTimeFunction());

    setTimeout(() => {
      this.__syncLoop(sendFunction);
    }, 1000 * interval);
  }

  start(sendFunction, receiveFunction) {
    receiveFunction('sync_pong', (pingId, clientPingTime, serverPingTime, serverPongTime) => {
      if (pingId === this.pingId) {
        var clientPongTime = this.getTimeFunction();
        var travelTime = Math.max(0, (clientPongTime - clientPingTime) - (serverPongTime - serverPingTime));
        const timeOffset = ((serverPingTime - clientPingTime) + (serverPongTime - clientPongTime)) * 0.5;

        this.data[this.dataNextIndex] = [travelTime, timeOffset];
        this.dataNextIndex = (++this.dataNextIndex) % this.dataLength;

        if (this.data.length >= this.dataLength) {
          // keep only the quickest travel times
          let quickest = this.data.slice(0).sort().slice(0, this.dataBest);
          this.travelTime = quickest.reduce((p, q) => p + q[0], 0) / quickest.length;
          this.timeOffset = quickest.reduce((p, q) => p + q[1], 0) / quickest.length;
          
          this.emit('sync:stats', { timeOffset: this.timeOffset, travelTime: this.travelTime });
        }
      }
    });

    this.__syncLoop(sendFunction);
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
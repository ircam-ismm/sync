# sync

This module synchronizes the server and clients clocks on a common shared clock called “sync clock”.

All time calculations and exchanges should be expressed in the sync clock time, and all times are in seconds.

## Get started

On the client side, you have to launch an instance of `SyncClient` and call the method `start`. You must specify what functions to use to:

- get the local time;
- send a WebSocket message to the server;
- receive a WebSocket message from the server.

For instance, with the [`socket.io`](https://github.com/Automattic/socket.io) library:

```javascript
/* Client side */

var audioContext = new AudioContext() || new webkitAudioContext();
var socket = io();
var Sync = require('sync/client');

// Define the helper functions
var getTimeFunction = audioContext.currentTime; // function to get the local time
var sendFunction = socket.emit; // function to send WebSocket messages to the server
var receiveFunction = socket.on; // function to receive WebSocket messages from the server

// Initialize the sync module and start the synchronization process
var sync = new SyncClient(audioContext.currentTime);
sync.start(sendFunction, receiveFunction);

// Listen for the events that indicate that the clock is in sync
sync.on('sync:stats', () => {
  ... // whatever you need to do once the clock is in sync
})
```

On the server side, you have to launch an instance of `SyncServer` and call the method `start`. Just like on the client side, you must specify what functions to use to:

- get the local time;
- send a WebSocket message to the clients;
- receive a WebSocket message from the clients.

For instance, with the `socket.io` library:

```javascript
/* Server side */

// Require libraries
var io = require('socket.io');
var Sync = require('sync/server');

// Initialize sync module
var getTimeFunction = () => { // function to get the local time
  let time = process.hrtime();
  return time[0] + time[1] * 1e-9;
};
var sync = new Sync(getTimeFunction);

// Set up a WebSocket communication channel with the client
// and start to listen for the messages from that client
io.on('connection', (socket) => {
  let sendFunction = (msg, ...args) => socket.emit(msg, ...args); // function to send a WebSocket message to the client
  let receiveFunction = (msg, callback) => socket.on(msg, callback); // function to receive a WebSocket message from the client

  sync.start(sendFunction, receiveFunction);
  
  ... // the rest of your code
});
```

## API

### Client side

#### Methods

- `constructor(getTimeFunction:Function, options:Object = {})`  
  The `constructor`  method instantiates the `SyncClient` module on the client side. It takes up to two arguments:
  - `getTimeFunction:Function`  
     The `getTimeFunction` argument what function to use to get the local time on the client side. For instance, it can be `AudioContext.currentTime`.
  - `options:Object = {}`  
    The optional `options` argument customizes the configuration of the module. Its optional properties are:
    - `pingInterval:Number = 0.25`  
      The `pingInterval` property indicates the interval (in seconds) between each ping in a streak.
    - `pingIterations:Number = 10`  
      The `pingIterations` property indicates the number of pings sent in a streak.
    - `pingStreakInterval:Array = [10, 20]`  
      The `pingStreakInterval` property indicates the range of intervals between each ping-pong streak (in seconds). When a streak finishes, the next one will start *x* seconds later, where *x* is a random number between `pingStreakInterval[0]` and `pingStreakInterval[1]`. `pingStreakInterval` must be an array of two `Number`s.

- `start(sendFunction:Function, receiveFunction:Function)`  
  The `start` method starts the synchronization process. It takes two arguments:
  - `sendFunction:Function`  
    The `sendFunction` argument indicates what function to use to send a WebSocket message to the server. For instance, if you use the `socket.io` library, it would be `socket.emit`.
  - `receiveFunction:Function`  
    The `receiveFunction` argument indicates what function to use to receive a WebSocket message from the server. For instance, if you use the `socket.io` library, it would be `socket.on`.

- `getLocalTime(syncTime:Number) : Number`  
  The `getLocalTime` method returns the time in the client clock when the sync clock reaches `syncTime`. If no arguments are provided, the method returns the time it is when the method is called, in the client clock (*i.e.* `this.getTimeFunction()`). The returned time is a `Number`, in seconds.

- `getSyncTime(localTime:Number = this.getTimeFunction()) : Number`  
  The `getSyncTime` method returns the time in the sync clock when the client clock reaches `localTime`. If no arguments are provided, the method returns the time it is when the method is called, in the sync clock. The returned time is a `Number`, in seconds.

#### Events

- `sync:stats`  
  The `SyncClient` module emits the `sync:stats` event each time it resynchronizes the local clock on the sync clock. In particular, the first time this event is fired indicates that the clock is now in sync with the sync clock.

### Server side

#### Methods

- `constructor(getTimeFunction:Function)`  
  The `constructor`  method instantiates the `SyncServer` module on the server side. It takes one argument:
  - `getTimeFunction:Function`  
     The `getTimeFunction` argument indicates what function to use to get the local time on the server side. For instance, it can be a function that converts `process.hrtime()` in seconds.

- `start(sendFunction:Function, receiveFunction:Function)`  
  The `start` method listens for a client's WebSocket messages on the server. It takes two arguments:
  - `sendFunction:Function`  
    The `sendFunction` argument indicates what function to use to send a WebSocket message to the client. For instance, if you use the `socket.io` library, it would be `socket.emit`.
  - `receiveFunction:Function`  
    The `receiveFunction` argument indicates what function to use to receive a WebSocket message from a client. For instance, if you use the `socket.io` library, it would be `socket.on`.

- `getLocalTime(syncTime:Number) : Number`  
  The `getLocalTime` method returns the time in the server clock when the sync clock reaches `syncTime`. If no arguments are provided, the method returns the time it is when the method is called, in the server clock (*i.e.* `this.getTimeFunction()`). The returned time is a `Number`, in seconds.

- `getSyncTime(localTime:Number = this.getTimeFunction()) : Number`  
  The `getSyncTime` method returns the time in the sync clock when the server clock reaches `localTime`. If no arguments are provided, the method returns the time it is when the method is called, in the sync clock. The returned time is a `Number`, in seconds.

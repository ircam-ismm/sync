# sync

This module synchronizes the server and clients clocks. On the client side, `SyncClient` uses the `audioContext` clock. On the server side, `SyncServer` uses the `hrprocess` clock. All times are in seconds (method arguments and returned values).

## Usage

To synchronize the clocks, you have to launch an instance of `SyncClient` on the client side and call the method `.start()`.

```javascript
/* Client side */

var sync = new SyncClient();
sync.start();
```

On the server side, you require the module and call the method `.start(socket)` that takes the WebSocket coming from the client as an argument. An example using the `socket.io` library is shown below.

```javascript
/* Server side */

var io = requrie('socket.io');
var sync = require('sync');

io.on('connection', (socket) => {
  sync.start(socket); // set up WebSocket listener on the server side
  
  ... // the rest of your code
});
```

## API

### Client side

- **`getLocalTime(serverTime:Number) : Number`**  
  The `getLocalTime` method returns the time in the client clock when the server clock reaches `serverTime`. If no arguments are provided, the method returns the time is is when the method is called, in the client clock (*i.e.* `audioContext.currentTime`). The returned time is a `Number`, in seconds.

- **`getServerTime(clientTime:Number = audioContext.currentTime) : Number`**  
  The `getServerTime` method returns the time in the server clock when the client clock reaches `clientTime`. If no arguments are provided, the method returns the time is is when the method is called, in the server clock. The returned time is a `Number`, in seconds.

### Server side

- **`getLocalTime() : Number`**  
  Returns the current time in the server clock (*i.e.* a conversion of `process.()` in seconds). The returned time is a `Number`, in seconds.

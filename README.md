# sync

This module synchronizes the server and clients clocks.

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
  Returns the time in the client clock when the server clock reaches `serverTime`. If no argument is provided, returns the current time in the client clock (`audioContext.currentTime`).

- **`getServerTime(clientTime:Number = audioContext.currentTime) : Number`**  
  Returns the time in the server clock when the client clock reaches `clientTime`. If no argument is provided, returns the current time in the server clock.

### Server side

- **`getLocalTime() : Number`**  
  Returns the current time in the server clock.

# make sync work

# notes on `sync` module

## client

- @warning: avoid float in `setInterval`

line 280:
```
this.pingTimeoutDelay.current = Math.min(this.pingTimeoutDelay.current * 2,
                                               this.pingTimeoutDelay.max);
```

- be transport agnostic (remove implicit API deps to `socket.io`)
  + add test with raw socket, server to server using `net` module, some other low-level library such as `primus` or something

- confirm that the API could handle the test of several algorithms with ease

## server

API is ok, the server does nothing except returning the time

can't it be optimized, aka is this really necessary ?

- `this.getLocalTime` is just executed one after the other synchronously... make client-side code more more complicated for probably nothing...

```
const a = process.hrtime();
const b = process.hrtime();
console.log(a[1], b[1]);
```

this has an order of magnitude of 10 * 10^-6 sec (aka 10 µs)

=> response from JP : it should be kept in order to have an API able to handle other algorithms


- `start`
  + return some handle that would allow to clean memory ?


## misc

=> update `woodland`




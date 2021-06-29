# `@ircam/sync`

> Module that synchronises all clients to a server master clock. 

Each client has access to a logical clock that synchronizes to the server
clock. The module also provides helper functions that allows to convert the
master clock, to and from, the local clock. Everybody can use the common master
clock to schedule synchronized events. A good practice is to convert to local
time at the last moment to trigger events, in order to avoid drift.

## Table of Contents

<!-- toc -->

- [Install](#install)
- [Example use](#example-use)
  * [Server-side](#server-side)
  * [Client-side](#client-side)
- [API](#api)
  * [Classes](#classes)
  * [SyncClient](#syncclient)
  * [SyncServer](#syncserver)
- [Caveats](#caveats)
- [Publication](#publication)
- [License](#license)

<!-- tocstop -->

## Install

```sh
npm install [--save] @ircam/sync
```

## Example use

This example show the usage of the library through a simple websocket transport with a naive _ad-hoc_ ping / pong protocol.

### Server-side

```js
import { SyncServer } from '@ircam/sync';

const startTime = process.hrtime();
const getTimeFunction = () => {
  const now = process.hrtime(startTime);
  return now[0] + now[1] * 1e-9;
}

// 
const syncServer = new SyncServer(getTimeFunction);

const wss = new ws.Server({ server: httpServer });
wss.on('connection', (socket) => {
  // the `receiveFunction` and `sendFunction` functions aim at abstracting 
  // the transport layer between the SyncServer and the SyncClient
  const receiveFunction = callback => {
    socket.on('message', request => {
      request = JSON.parse(request);

      if (request[0] === 0) { // this is a ping
        // parse request
        const pingId = request[1];
        const clientPingTime = request[2];
        // notify the SyncServer
        callback(pingId, clientPingTime);
      }
    });
  };

  const sendFunction = (pingId, clientPingTime, serverPingTime, serverPongTime) => {
      // create response object
      const response = [
        1, // this is a pong
        pingId,
        clientPingTime,
        serverPingTime,
        serverPongTime,
      ];
      // send formatted response to the client
      socket.send(JSON.stringify(response));
  };

  syncServer.start(sendFunction, receiveFunction);
});
```

### Client-side

```js
import { SyncClient } from '@ircam/sync';

// return the local time in second
const getTimeFunction = () => {
  return performance.now() / 1000;
}

// init sync client
const syncClient = new SyncClient(getTimeFunction);
// init socket client
const socket = new WebSocket(url);

socket.addEventListener('open', () => {
  const sendFunction = (pingId, clientPingTime) => {
    const request = [
      0, // this is a ping
      pingId,
      clientPingTime,
    ];

    socket.send(JSON.stringify(request));
  };

  const receiveFunction = callback => {
    socket.addEventListener('message', e => {
      const response = JSON.parse(e.data);

      if (response[0] === 1) { // this is a pong
        const pingId = response[1];
        const clientPingTime = response[2];
        const serverPingTime = response[3];
        const serverPongTime = response[4];

        callback(pingId, clientPingTime, serverPingTime, serverPongTime);
      }
    });
  }

  // check the synchronization status, when this function is called for the 
  // first time, you can consider the synchronization process properly 
  // initiated.
  const statusFunction = status => console.log(status);
  // start synchronization process
  syncClient.start(sendFunction, receiveFunction, statusFunction);
});

// monitor the synchronized clock
setInterval(() => {
  const syncTime = syncClient.getSyncTime();
  console.log(syncTime);
}, 100);
```

## API

<!-- api -->

### Classes

<dl>
<dt><a href="#SyncClient">SyncClient</a></dt>
<dd><p><code>SyncClient</code> instances synchronize to the clock provided
by the <a href="#SyncServer">SyncServer</a> instance. The default estimation behavior is
strictly monotonic and guarantee a unique convertion from server time
to local time.</p>
</dd>
<dt><a href="#SyncServer">SyncServer</a></dt>
<dd><p>The <code>SyncServer</code> instance provides a clock on which <a href="#SyncClient">SyncClient</a>
instances synchronize.</p>
</dd>
</dl>

<a name="SyncClient"></a>

### SyncClient
`SyncClient` instances synchronize to the clock provided
by the [SyncServer](#SyncServer) instance. The default estimation behavior is
strictly monotonic and guarantee a unique convertion from server time
to local time.

**Kind**: global class  
**See**: [SyncClient~start](SyncClient~start) method to actually start a synchronisation
process.  

* [SyncClient](#SyncClient)
    * [new SyncClient(getTimeFunction, [options])](#new_SyncClient_new)
    * _instance_
        * [.start(sendFunction, receiveFunction, reportFunction)](#SyncClient+start)
        * [.getLocalTime([syncTime])](#SyncClient+getLocalTime) ⇒ <code>Number</code>
        * [.getSyncTime([localTime])](#SyncClient+getSyncTime) ⇒ <code>Number</code>
    * _static_
        * [.minimumStability](#SyncClient.minimumStability) : <code>Number</code>
    * _inner_
        * [~getTimeFunction](#SyncClient..getTimeFunction) ⇒ <code>Number</code>
        * [~sendFunction](#SyncClient..sendFunction) : <code>function</code>
        * [~receiveFunction](#SyncClient..receiveFunction) : <code>function</code>
        * [~receiveCallback](#SyncClient..receiveCallback) : <code>function</code>
        * [~reportFunction](#SyncClient..reportFunction) : <code>function</code>

<a name="new_SyncClient_new"></a>

#### new SyncClient(getTimeFunction, [options])

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| getTimeFunction | [<code>getTimeFunction</code>](#SyncClient..getTimeFunction) |  |  |
| [options] | <code>Object</code> |  |  |
| [options.pingTimeOutDelay] | <code>Object</code> |  | range of duration (in seconds)   to consider a ping was not ponged back |
| [options.pingTimeOutDelay.min] | <code>Number</code> | <code>1</code> | min and max must be set   together |
| [options.pingTimeOutDelay.max] | <code>Number</code> | <code>30</code> | min and max must be set   together |
| [options.pingSeriesIterations] | <code>Number</code> | <code>10</code> | number of ping-pongs in a   series |
| [options.pingSeriesPeriod] | <code>Number</code> | <code>0.250</code> | interval (in seconds)   between pings in a series |
| [options.pingSeriesDelay] | <code>Number</code> |  | range of interval (in seconds)   between ping-pong series |
| [options.pingSeriesDelay.min] | <code>Number</code> | <code>10</code> | min and max must be set   together |
| [options.pingSeriesDelay.max] | <code>Number</code> | <code>20</code> | min and max must be set   together |
| [options.longTermDataTrainingDuration] | <code>Number</code> | <code>120</code> | duration of   training, in seconds, approximately, before using the estimate of clock   frequency |
| [options.longTermDataDuration] | <code>Number</code> | <code>900</code> | estimate synchronisation over   this duration, in seconds, approximately |
| [options.estimationMonotonicity] | <code>Boolean</code> | <code>true</code> | When `true`, the   estimation of the server time is strictly monotonic, and the maximum   instability of the estimated server time is then limited to   `options.estimationStability`. |
| [options.estimationStability] | <code>Number</code> | <code>160e-6</code> | This option applies   only when `options.estimationMonotonicity` is true. The adaptation to the   estimated server time is then limited by this positive value. 80e-6 (80   parts per million, PPM) is quite stable, and corresponds to the stability   of a conventional clock. 160e-6 is moderately adaptive, and corresponds   to the relative stability of 2 clocks; 500e-6 is quite adaptive, it   compensates 5 milliseconds in 1 second. It is the maximum value   (estimationStability must be lower than 500e-6). |

<a name="SyncClient+start"></a>

#### syncClient.start(sendFunction, receiveFunction, reportFunction)
Start a synchronisation process by registering the receive
function passed as second parameter. Then, send regular messages
to the server, using the send function passed as first parameter.

**Kind**: instance method of [<code>SyncClient</code>](#SyncClient)  

| Param | Type | Description |
| --- | --- | --- |
| sendFunction | [<code>sendFunction</code>](#SyncClient..sendFunction) |  |
| receiveFunction | [<code>receiveFunction</code>](#SyncClient..receiveFunction) | to register |
| reportFunction | [<code>reportFunction</code>](#SyncClient..reportFunction) | if defined, is called to   report the status, on each status change |

<a name="SyncClient+getLocalTime"></a>

#### syncClient.getLocalTime([syncTime]) ⇒ <code>Number</code>
Get local time, or convert a synchronised time to a local time.

**Kind**: instance method of [<code>SyncClient</code>](#SyncClient)  
**Returns**: <code>Number</code> - local time, in seconds  

| Param | Type | Description |
| --- | --- | --- |
| [syncTime] | <code>Number</code> | Get local time according to given  given `syncTime`, if `syncTime` is not defined returns current local time. |

<a name="SyncClient+getSyncTime"></a>

#### syncClient.getSyncTime([localTime]) ⇒ <code>Number</code>
Get synchronised time, or convert a local time to a synchronised time.

**Kind**: instance method of [<code>SyncClient</code>](#SyncClient)  
**Returns**: <code>Number</code> - synchronised time, in seconds.  

| Param | Type | Description |
| --- | --- | --- |
| [localTime] | <code>Number</code> | Get local time according to given  given `syncTime`, if `localTime` is not defined returns current sync time. |

<a name="SyncClient.minimumStability"></a>

#### SyncClient.minimumStability : <code>Number</code>
The minimum stability serves several purposes:

1. The estimation process will restart if the estimated server time
reaches or exceeds this value.
2. The adaptation of a new estimation (after a ping-pong series) is also
limited to this value.
3. Given 1. and 2., this ensures that the estimation is strictly
monotonic.
4. Given 3., the conversion from server time to local time is unique.

**Kind**: static constant of [<code>SyncClient</code>](#SyncClient)  
**Value**: 500 PPM, like an old mechanical clock  
<a name="SyncClient..getTimeFunction"></a>

#### SyncClient~getTimeFunction ⇒ <code>Number</code>
**Kind**: inner typedef of [<code>SyncClient</code>](#SyncClient)  
**Returns**: <code>Number</code> - strictly monotonic, ever increasing, time in second. When
  possible the server code should define its own origin (i.e. `time=0`) in
  order to maximize the resolution of the clock for a long period of
  time. When `SyncServer~start` is called the clock should already be
  running (cf. `audioContext.currentTime` that needs user interaction to
  start)  
<a name="SyncClient..sendFunction"></a>

#### SyncClient~sendFunction : <code>function</code>
**Kind**: inner typedef of [<code>SyncClient</code>](#SyncClient)  
**See**: [receiveFunction](#SyncServer..receiveFunction)  

| Param | Type | Description |
| --- | --- | --- |
| pingId | <code>Number</code> | unique identifier |
| clientPingTime | <code>Number</code> | time-stamp of ping emission |

<a name="SyncClient..receiveFunction"></a>

#### SyncClient~receiveFunction : <code>function</code>
**Kind**: inner typedef of [<code>SyncClient</code>](#SyncClient)  
**See**: [sendFunction](#SyncServer..sendFunction)  

| Param | Type | Description |
| --- | --- | --- |
| receiveCallback | [<code>receiveCallback</code>](#SyncClient..receiveCallback) | called on each message   matching messageType. |

<a name="SyncClient..receiveCallback"></a>

#### SyncClient~receiveCallback : <code>function</code>
**Kind**: inner typedef of [<code>SyncClient</code>](#SyncClient)  

| Param | Type | Description |
| --- | --- | --- |
| pingId | <code>Number</code> | unique identifier |
| clientPingTime | <code>Number</code> | time-stamp of ping emission |
| serverPingTime | <code>Number</code> | time-stamp of ping reception |
| serverPongTime | <code>Number</code> | time-stamp of pong emission |

<a name="SyncClient..reportFunction"></a>

#### SyncClient~reportFunction : <code>function</code>
**Kind**: inner typedef of [<code>SyncClient</code>](#SyncClient)  

| Param | Type | Description |
| --- | --- | --- |
| report | <code>Object</code> |  |
| report.status | <code>String</code> | `new`, `startup`, `training` (offset   adaptation), or `sync` (offset and speed adaptation). |
| report.statusDuration | <code>Number</code> | duration since last status   change. |
| report.timeOffset | <code>Number</code> | time difference between local time and   sync time, in seconds. |
| report.frequencyRatio | <code>Number</code> | time ratio between local   time and sync time. |
| report.connection | <code>String</code> | `offline` or `online` |
| report.connectionDuration | <code>Number</code> | duration since last connection   change. |
| report.connectionTimeOut | <code>Number</code> | duration, in seconds, before   a time-out occurs. |
| report.travelDuration | <code>Number</code> | duration of a ping-pong round-trip,   in seconds, mean over the the last ping-pong series. |
| report.travelDurationMin | <code>Number</code> | duration of a ping-pong   round-trip, in seconds, minimum over the the last ping-pong series. |
| report.travelDurationMax | <code>Number</code> | duration of a ping-pong   round-trip, in seconds, maximum over the the last ping-pong series. |

<a name="SyncServer"></a>

### SyncServer
The `SyncServer` instance provides a clock on which [SyncClient](#SyncClient)
instances synchronize.

**Kind**: global class  
**See**: [SyncServer~start](SyncServer~start) method to
actually start a synchronisation process.  

* [SyncServer](#SyncServer)
    * [new SyncServer(function)](#new_SyncServer_new)
    * _instance_
        * [.start(sendFunction, receiveFunction)](#SyncServer+start)
        * [.getLocalTime([syncTime])](#SyncServer+getLocalTime) ⇒ <code>Number</code>
        * [.getSyncTime([localTime])](#SyncServer+getSyncTime) ⇒ <code>Number</code>
    * _inner_
        * [~getTimeFunction](#SyncServer..getTimeFunction) ⇒ <code>Number</code>
        * [~sendFunction](#SyncServer..sendFunction) : <code>function</code>
        * [~receiveFunction](#SyncServer..receiveFunction) : <code>function</code>
        * [~receiveCallback](#SyncServer..receiveCallback) : <code>function</code>

<a name="new_SyncServer_new"></a>

#### new SyncServer(function)

| Param | Type | Description |
| --- | --- | --- |
| function | [<code>getTimeFunction</code>](#SyncServer..getTimeFunction) | called to get the local time. It must return a time in seconds, monotonic, ever increasing. |

<a name="SyncServer+start"></a>

#### syncServer.start(sendFunction, receiveFunction)
Start a synchronisation process with a `SyncClient` by registering the
receive function passed as second parameter. On each received message,
send a reply using the function passed as first parameter.

**Kind**: instance method of [<code>SyncServer</code>](#SyncServer)  

| Param | Type |
| --- | --- |
| sendFunction | [<code>sendFunction</code>](#SyncServer..sendFunction) | 
| receiveFunction | [<code>receiveFunction</code>](#SyncServer..receiveFunction) | 

<a name="SyncServer+getLocalTime"></a>

#### syncServer.getLocalTime([syncTime]) ⇒ <code>Number</code>
Get local time, or convert a synchronised time to a local time.

**Kind**: instance method of [<code>SyncServer</code>](#SyncServer)  
**Returns**: <code>Number</code> - local time, in seconds  
**Note**: - `getLocalTime` and `getSyncTime` are basically aliases on the server.  

| Param | Type | Description |
| --- | --- | --- |
| [syncTime] | <code>Number</code> | Get local time according to given  given `syncTime`, if `syncTime` is not defined returns current local time. |

<a name="SyncServer+getSyncTime"></a>

#### syncServer.getSyncTime([localTime]) ⇒ <code>Number</code>
Get synchronised time, or convert a local time to a synchronised time.

**Kind**: instance method of [<code>SyncServer</code>](#SyncServer)  
**Returns**: <code>Number</code> - synchronised time, in seconds.  
**Note**: - `getLocalTime` and `getSyncTime` are basically aliases on the server.  

| Param | Type | Description |
| --- | --- | --- |
| [localTime] | <code>Number</code> | Get local time according to given  given `syncTime`, if `localTime` is not defined returns current sync time. |

<a name="SyncServer..getTimeFunction"></a>

#### SyncServer~getTimeFunction ⇒ <code>Number</code>
**Kind**: inner typedef of [<code>SyncServer</code>](#SyncServer)  
**Returns**: <code>Number</code> - monotonic, ever increasing, time in second. When possible
 the server code should define its own origin (i.e. `time=0`) in order to
 maximize the resolution of the clock for a long period of time. When
 `SyncServer~start` is called the clock should be running
 (cf. `audioContext.currentTime` that needs user interaction to start)  
**Example**  
```js
const startTime = process.hrtime();

const getTimeFunction = () => {
  const now = process.hrtime(startTime);
  return now[0] + now[1] * 1e-9;
};
```
<a name="SyncServer..sendFunction"></a>

#### SyncServer~sendFunction : <code>function</code>
**Kind**: inner typedef of [<code>SyncServer</code>](#SyncServer)  
**See**: [receiveFunction](#SyncClient..receiveFunction)  

| Param | Type | Description |
| --- | --- | --- |
| pingId | <code>Number</code> | unique identifier |
| clientPingTime | <code>Number</code> | time-stamp of ping emission |
| serverPingTime | <code>Number</code> | time-stamp of ping reception |
| serverPongTime | <code>Number</code> | time-stamp of pong emission |

<a name="SyncServer..receiveFunction"></a>

#### SyncServer~receiveFunction : <code>function</code>
**Kind**: inner typedef of [<code>SyncServer</code>](#SyncServer)  
**See**: [sendFunction](#SyncClient..sendFunction)  

| Param | Type | Description |
| --- | --- | --- |
| receiveCallback | [<code>receiveCallback</code>](#SyncServer..receiveCallback) | called on each message matching messageType. |

<a name="SyncServer..receiveCallback"></a>

#### SyncServer~receiveCallback : <code>function</code>
**Kind**: inner typedef of [<code>SyncServer</code>](#SyncServer)  

| Param | Type | Description |
| --- | --- | --- |
| pingId | <code>Number</code> | unique identifier |
| clientPingTime | <code>Number</code> | time-stamp of ping emission |


<!-- apistop -->

## Caveats

The synchronisation process is continuous: after a call to the `start` method,
it runs in the background. It is important to avoid blocking it, on the client
side and on the server side.

In many cases, running the sync process in another thread is not an option as
the local clock will be different accross threads or processes.

## Publication

For more information, you can read this [article] presented at the [Web Audio Conference 2016]:
> Jean-Philippe Lambert, Sébastien Robaszkiewicz, Norbert Schnell. Synchronisation for Distributed Audio Rendering over Heterogeneous Devices, in HTML5. 2nd Web Audio Conference, Apr 2016, Atlanta, GA, United States. ⟨hal-01304889⟩ - [https://hal.archives-ouvertes.fr/hal-01304889v1](https://hal.archives-ouvertes.fr/hal-01304889v1)

*Note: the stabilisation of the estimated synchronous time has been added after the publication of this article.*

## License

[BSD-3-Clause]. See the [LICENSE file].

[article]:  https://hal.archives-ouvertes.fr/hal-01304889v1
[BSD-3-Clause]: https://opensource.org/licenses/BSD-3-Clause
[LICENSE file]: ./LICENSE
[Web Audio Conference 2016]: http://webaudio.gatech.edu/

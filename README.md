# sync

> Module that synchronises all clients to a server master clock. 

Each client has access to a logical clock that synchronizes to the server
clock. The module also provides helper functions that allows to convert the
master clock, to and from, the local clock. Everybody can use the common master
clock to schedule synchronized events. A good practice is to convert to local
time at the last moment to trigger events, in order to avoid drift.

## Install

```sh
npm install [--save] @ircam/sync
```


## Documentation

[http://collective-soundworks.github.io/sync/](http://collective-soundworks.github.io/sync/)

You can also read an [article], presented at the [Web Audio Conference 2016],
that describes the synchronisation process in details with measurements.

The stabilisation of the estimated synchronous time was added after this
article.

## Example usage

see [`./examples`](./examples) folder

## Caveats

The synchronisation process is continuous: after a call to the `start` method,
it runs in the background. It is important to avoid blocking it, on the client
side and on the server side.

In many cases, running the sync process in another thread is not an option as
the local clock will be different accross threads or processes.

## License

[BSD-3-Clause]. See the [LICENSE file].

[article]:  https://hal.archives-ouvertes.fr/hal-01304889v1
[BSD-3-Clause]: https://opensource.org/licenses/BSD-3-Clause
[LICENSE file]: ./LICENSE
[Web Audio Conference 2016]: http://webaudio.gatech.edu/

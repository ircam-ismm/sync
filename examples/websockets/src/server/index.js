import 'source-map-support/register';
import http from 'http';
import ws from 'ws';
import connect from 'connect';
import connectRoute from 'connect-route';
import path from 'path';
import portfinder from 'portfinder';
import serveStatic from 'serve-static';
import serveFavicon from 'serve-favicon';
import template from 'ejs-template';
// not very clean but works...
import { getTranspiler } from '../../bin/runner';

// import SyncServer from '@ircam/sync/server';
import { SyncServer } from '@ircam/sync';

/**
 * Configure and start the `websocket` and `sync` servers
 *
 * user-defined protocol:
 * => 0: ping
 * => 1: pong
 */
function initWsSyncServer(httpServer) {
  const startTime = process.hrtime();

  const getTimeFunction = () => {
    const now = process.hrtime(startTime);
    return now[0] + now[1] * 1e-9;
  }

  const wss = new ws.Server({ server: httpServer });
  const syncServer = new SyncServer(getTimeFunction);

  wss.on('connection', (socket) => {
    const receiveFunction = callback => {
      socket.on('message', request => {
        request = JSON.parse(request);

        if (request[0] === 0) { // this is a ping
          const pingId = request[1];
          const clientPingTime = request[2];

          console.log(`[ping] - pingId: %s, clientPingTime: %s`, clientPingTime);

          callback(pingId, clientPingTime);
        }
      });
    };

    const sendFunction = (pingId, clientPingTime, serverPingTime, serverPongTime) => {
      console.log(`[pong] - id: %s, clientPingTime: %s, serverPingTime: %s, serverPongTime: %s`,
        pingId, clientPingTime, serverPingTime, serverPongTime);

        const response = [];
        response[0] = 1; // this is a pong
        response[1] = pingId;
        response[2] = clientPingTime;
        response[3] = serverPingTime;
        response[4] = serverPongTime;
        // create a node Buffer without copy (shared memory)
        socket.send(JSON.stringify(response));
    };

    syncServer.start(sendFunction, receiveFunction);
  });
}


/**
 * boilerplate code to init the `connect` application and launch the http server
 */
const cwd = process.cwd();
portfinder.basePort = 3000;

portfinder.getPortPromise()
  .then(port => {
    const app = connect();

    app.use(serveFavicon('./public/favicon.ico'));
    app.use(serveStatic('./public'));
    app.use(template.middleware({
      basedir: path.join(cwd, 'src', 'client'),
      autoreload: true,
    }));

    app.use(connectRoute(router => {
      const transpiler = getTranspiler();

      const serve = (name, req, res) => {
        // bundle the js file that correspond to the client
        const entryPoint = path.join(cwd, 'dist', 'client', `${name}.js`);
        const outFile = path.join(cwd, 'public', `${name}-bundle.js`);
        // this is the ugly part...
        transpiler.bundle(entryPoint, outFile, () => {
          res.endTemplate('index.ejs', { name });
        });
      };

      router.get('/', (req, res, next) => serve('index', req, res));
      router.get('/:name', (req, res, next) => serve(req.params.name, req, res));
    }));

    const server = http.createServer(app);

    server.listen(port, () => {
      // initialize sync server
      initWsSyncServer(server);

      console.log(`http server started: http://127.0.0.1:${port}`);
    });
  })
  .catch(err => console.error(err.stack));

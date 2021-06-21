import _SyncClient from './client/index.js';
import _SyncServer from './server/index.js';

// support explicit default and named import
// cf. https://ircam-ismm.github.io/javascript/javascript-guidelines.html#supported-syntaxes

// @note:
// the odd file structure aims at supporting imports in old applicationd :
// ```
// import SyncServer from '@ircam/sync/server';
// ```
// and the most recent one
// ```
// import { SyncServer } from '@ircam/sync
// ```
//
// consider making this more simple and release a major version
//
export default {
  SyncClient: _SyncClient,
  SyncServer: _SyncServer,
};

export const SyncClient = _SyncClient;
export const SyncServer = _SyncServer;

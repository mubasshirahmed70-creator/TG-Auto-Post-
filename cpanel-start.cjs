// cPanel Startup Entry (prefers pre-built dist/server.mjs to stay inside shared-host 4GB LVE limits)
const fs = require('node:fs');
const path = require('node:path');

process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.DISABLE_HMR = process.env.DISABLE_HMR || 'true';

const builtServer = path.join(__dirname, 'dist', 'server.mjs');
const entry = fs.existsSync(builtServer) ? './dist/server.mjs' : './server.ts';

import(entry).catch((err) => {
  console.error('Failed to start BazarBot server:', err);
  process.exit(1);
});

// cPanel Startup Entry (auto-builds dist/ under 4GB LVE limits if missing, then starts dist/server.mjs)
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.DISABLE_HMR = process.env.DISABLE_HMR || 'true';

const distIndex = path.join(__dirname, 'dist', 'index.html');
const builtServer = path.join(__dirname, 'dist', 'server.mjs');
const buildScript = path.join(__dirname, 'build-cpanel.mjs');

if ((!fs.existsSync(distIndex) || !fs.existsSync(builtServer)) && fs.existsSync(buildScript)) {
  try {
    console.log('dist/ not found — running 4GB-safe build-cpanel.mjs...');
    execFileSync(process.execPath, [buildScript], { stdio: 'inherit', cwd: __dirname });
  } catch (err) {
    console.error('Automatic build failed:', err);
  }
}

const entry = fs.existsSync(builtServer) ? './dist/server.mjs' : './server.ts';

import(entry).catch((err) => {
  console.error('Failed to start BazarBot server:', err);
  process.exit(1);
});

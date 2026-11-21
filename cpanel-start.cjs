// cPanel Startup Entry (auto-rebuilds dist/ under 4GB LVE limits if missing or outdated, then starts dist/server.mjs)
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.DISABLE_HMR = process.env.DISABLE_HMR || 'true';

const distIndex = path.join(__dirname, 'dist', 'index.html');
const builtServer = path.join(__dirname, 'dist', 'server.mjs');
const buildScript = path.join(__dirname, 'build-cpanel.mjs');

function getNewestMtime(targetPath) {
  if (!fs.existsSync(targetPath)) return 0;
  const stat = fs.statSync(targetPath);
  if (stat.isFile()) return stat.mtimeMs;
  if (!stat.isDirectory()) return 0;
  let max = stat.mtimeMs;
  for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name.endsWith('.bak')) continue;
    const childMtime = getNewestMtime(path.join(targetPath, entry.name));
    if (childMtime > max) max = childMtime;
  }
  return max;
}

function needsRebuild() {
  if (!fs.existsSync(distIndex) || !fs.existsSync(builtServer)) return true;
  const oldestDistMtime = Math.min(
    fs.statSync(distIndex).mtimeMs,
    fs.statSync(builtServer).mtimeMs
  );
  const watchTargets = [
    path.join(__dirname, 'server.ts'),
    path.join(__dirname, 'db.ts'),
    path.join(__dirname, 'build-cpanel.mjs'),
    path.join(__dirname, 'package.json'),
    path.join(__dirname, 'index.html'),
    path.join(__dirname, 'src'),
  ];
  return watchTargets.some((t) => getNewestMtime(t) > oldestDistMtime + 500);
}

if (fs.existsSync(buildScript) && needsRebuild()) {
  try {
    console.log('dist/ missing or outdated — running 4GB-safe build-cpanel.mjs...');
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

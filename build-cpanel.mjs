import fs from 'node:fs';
import path from 'node:path';
import esbuild from 'esbuild';
import { compile } from '@tailwindcss/node';
import { Scanner } from '@tailwindcss/oxide';

const rootDir = process.cwd();
const distDir = path.join(rootDir, 'dist');
const assetsDir = path.join(distDir, 'assets');
const buildTag = Date.now().toString(36);
const cssFileName = `index-${buildTag}.css`;
const jsFileName = `index-${buildTag}.js`;

async function buildAll() {
  const start = Date.now();
  fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(assetsDir, { recursive: true });

  // 1. Compile Tailwind CSS (uses native oxide + node, zero Wasm OOM under 4GB LVE)
  const scanner = new Scanner({
    sources: [
      { base: rootDir, pattern: 'src/**/*', negated: false },
      { base: rootDir, pattern: 'index.html', negated: false },
    ],
  });
  const candidates = scanner.scan();
  const cssInput = fs.readFileSync(path.join(rootDir, 'src', 'index.css'), 'utf8');
  const compiled = await compile(cssInput, {
    base: rootDir,
    onDependency() {},
  });
  const rawCss = compiled.build(candidates);
  const minifiedCss = await esbuild.transform(rawCss, {
    loader: 'css',
    minify: true,
  });
  fs.writeFileSync(path.join(assetsDir, cssFileName), minifiedCss.code, 'utf8');

  // 2. Bundle React client with esbuild (native Go binary, fast and low memory)
  await esbuild.build({
    entryPoints: [path.join(rootDir, 'src', 'main.tsx')],
    bundle: true,
    minify: true,
    format: 'esm',
    target: ['es2020'],
    jsx: 'automatic',
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    outfile: path.join(assetsDir, jsFileName),
    plugins: [
      {
        name: 'strip-css-imports',
        setup(build) {
          build.onResolve({ filter: /\.css$/ }, () => ({
            path: 'virtual-css-stub',
            namespace: 'strip-css',
          }));
          build.onLoad({ filter: /.*/, namespace: 'strip-css' }, () => ({
            contents: '',
            loader: 'js',
          }));
        },
      },
    ],
  });

  // 3. Emit production dist/index.html with hashed asset URLs (busts browser/Cloudflare/htaccess cache)
  const htmlTemplate = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  const prodHtml = htmlTemplate.replace(
    '<script type="module" src="/src/main.tsx"></script>',
    `<link rel="stylesheet" href="/assets/${cssFileName}" />\n    <script type="module" src="/assets/${jsFileName}"></script>`,
  );
  fs.writeFileSync(path.join(distDir, 'index.html'), prodHtml, 'utf8');

  // 4. Bundle server.ts -> dist/server.mjs (avoids Node 22 runtime .ts Wasm stripper)
  await esbuild.build({
    entryPoints: [path.join(rootDir, 'server.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    outfile: path.join(distDir, 'server.mjs'),
  });

  console.log(`BazarBot production build complete in ${Date.now() - start}ms`);
}

buildAll().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});

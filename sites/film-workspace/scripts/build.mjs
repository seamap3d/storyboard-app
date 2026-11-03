import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { build } from 'esbuild';
const files = [
  'index.html',
  'storyboard-editor.mjs',
  'shot-card.mjs',
  'styles.css',
  'shared-client.mjs',
  'http-client.mjs',
  'sites-client.mjs',
  'recovery.mjs',
  'shared-ui.mjs',
  'storyboard-media.mjs',
  'workspace-model.mjs',
  'workspace-ui.mjs',
  'local-draft.mjs',
  'production-model.mjs',
  'production-client.mjs',
  'production-ui.mjs',
];
const assets = {};
for (const file of files)
  assets['/' + file] = {
    text: await readFile('app/' + file, 'utf8'),
    type: file.endsWith('.html')
      ? 'text/html; charset=utf-8'
      : file.endsWith('.css')
        ? 'text/css; charset=utf-8'
        : 'text/javascript; charset=utf-8',
  };
await writeFile(
  'worker/assets.generated.mjs',
  'export const assets=' + JSON.stringify(assets) + ';\n',
);
await rm('dist', { recursive: true, force: true });
await mkdir('dist/server', { recursive: true });
await mkdir('dist/.openai', { recursive: true });
await build({
  entryPoints: ['worker/index.mjs'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  outfile: 'dist/server/index.js',
});
await writeFile('dist/.openai/hosting.json', await readFile('.openai/hosting.json', 'utf8'));
const module = await import('../dist/server/index.js?check=' + Date.now());
if (typeof module.default?.fetch !== 'function') throw new Error('Missing Worker fetch handler.');
console.log('Built and validated Worker ESM artifact.');

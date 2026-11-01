import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('docs/netlify-fallback.json', root), 'utf8'));
for (const [file, expected] of Object.entries(manifest.sha256)) {
  const actual = createHash('sha256')
    .update(await readFile(new URL(file, root)))
    .digest('hex');
  if (actual !== expected)
    throw new Error(
      `${file} changed in the frozen Netlify fallback. Develop in sites/film-workspace or explicitly review a fallback update.`,
    );
}
console.log(`Frozen fallback verified: ${Object.keys(manifest.sha256).length} files.`);

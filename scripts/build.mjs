import { mkdir, rm, copyFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { publicConfig } from '../server/public-config.mjs';
export { publicConfig };

export async function build(env = process.env, output = resolve('dist')) {
  const config = publicConfig(env);
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  // Explicit allowlist prevents publishing backlog, source configuration, or credentials.
  for (const name of ['oauth-consent.html', 'oauth-consent.mjs', 'index.html', 'styles.css', 'shared-client.mjs', 'shared-ui.mjs', 'local-draft.mjs', 'storyboard-media.mjs', 'workspace-model.mjs', 'workspace-ui.mjs']) await copyFile(name, resolve(output, name));
  await writeFile(resolve(output, 'runtime-config.json'), JSON.stringify(config, null, 2) + '\n');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.info(`[build] Starting with Node ${process.version}; context=${['production', 'deploy-preview', 'branch-deploy'].includes(process.env.CONTEXT) ? process.env.CONTEXT : 'local/other'}`);
  for (const name of ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY']) {
    console.info(`[build] ${name}: ${process.env[name] ? 'present' : 'MISSING'}`);
  }
  try {
    await build();
    console.info('[build] Complete: web assets and public runtime-config.json');
  } catch (error) {
    // URL parser errors may include their input. Only report known safe messages.
    const safe = /^(Set SUPABASE_|SUPABASE_URL must|A Supabase secret key|Use a Supabase publishable key)/.test(error.message);
    console.error(`[build] FAILED: ${safe ? error.message : 'Could not write web assets; check repository base directory and filesystem access.'}`);
    process.exitCode = 1;
  }
}

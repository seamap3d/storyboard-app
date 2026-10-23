import { mkdir, rm, copyFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function publicConfig(env) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY for this deployment.');
  let parsed;
  try { parsed = new URL(url); } catch {
    throw new Error('SUPABASE_URL must be a valid HTTPS project origin.');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
    throw new Error('SUPABASE_URL must be an HTTPS project origin.');
  }
  // Only publishable/legacy anon keys may ever enter the public build.
  if (key.startsWith('sb_secret_')) throw new Error('A Supabase secret key must never be published.');
  if (!key.startsWith('sb_publishable_')) {
    let role;
    try { role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role; } catch {}
    if (role !== 'anon') throw new Error('Use a Supabase publishable key or legacy anon key.');
  }
  return { environment: env.APP_ENV === 'production' ? 'production' : 'development', supabaseUrl: parsed.origin, supabasePublishableKey: key };
}

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

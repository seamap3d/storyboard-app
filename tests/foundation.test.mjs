import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publicConfig, build } from '../scripts/build.mjs';
import { checkHealth } from '../netlify/functions/health.mjs';
const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture' };
test('public build requires configuration and rejects privileged keys', () => {
  assert.throws(() => publicConfig({}));
  for (const key of ['sb_secret_fixture', 'invalid', 'a.' + Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url') + '.b']) {
    assert.throws(() => publicConfig({...env, SUPABASE_PUBLISHABLE_KEY:key}));
  }
  assert.equal(publicConfig({...env, APP_ENV:'production'}).environment, 'production');
  assert.throws(() => publicConfig({...env, SUPABASE_URL:'http://example.com'}));
});
test('build publishes only assets and selected public configuration', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'storyboard-build-'));
  try {
    await build({...env, PRIVATE_TEST_SECRET:'must-not-appear'}, dir);
    assert.deepEqual((await readdir(dir)).sort(), ['index.html','runtime-config.json','shared-client.mjs','shared-ui.mjs','styles.css']);
    const config = await readFile(join(dir,'runtime-config.json'),'utf8');
    assert.equal(config.includes('must-not-appear'),false);
    assert.equal(JSON.parse(config).supabaseUrl, env.SUPABASE_URL);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
test('health checks actual Supabase response and reports failures safely', async () => {
  assert.equal((await checkHealth({})).statusCode,503);
  const ok = await checkHealth(env,async (url,options) => {
    assert.equal(url.href,env.SUPABASE_URL+'/auth/v1/settings');
    assert.equal(options.headers.apikey,env.SUPABASE_PUBLISHABLE_KEY);
    return {ok:true};
  });
  assert.equal(ok.statusCode,200);
  assert.equal((await checkHealth(env,async()=>({ok:false}))).statusCode,503);
  const failed = await checkHealth(env,async()=>{throw new Error('sensitive details');});
  assert.equal(failed.statusCode,503); assert.equal(failed.body.includes('sensitive'),false);
});

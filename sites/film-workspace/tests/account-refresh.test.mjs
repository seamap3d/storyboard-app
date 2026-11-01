import test from 'node:test';
import assert from 'node:assert/strict';
import { writeLink, readLink, linkedSession } from '../server/account-vault.mjs';

function fixture() {
  const values = new Map();
  const env = {
    SUPABASE_URL: 'https://lfvsimzmjhceyvjaoats.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
    MCP_OWNER_SUPABASE_USER_ID: 'owner',
    SESSION_VAULT_KEY: Buffer.alloc(32, 9).toString('base64'),
    BUCKET: {
      put: async (key, value) => values.set(key, value),
      get: async (key) =>
        values.has(key) ? { json: async () => JSON.parse(values.get(key)) } : null,
      delete: async (key) => values.delete(key),
    },
  };
  const expired = {
    access_token: 'old-access',
    refresh_token: 'old-refresh',
    expires_at: 1,
    user_id: 'owner',
    email: 'owner@example.test',
  };
  return { env, expired, values };
}

test('expired MCP session rotates and stores verified credentials encrypted', async () => {
  const { env, expired, values } = fixture();
  await writeLink(env, 'refresh-owner', expired);
  const tokens = [];
  const fetcher = async (url, options) => {
    if (url.includes('/token?')) {
      assert.deepEqual(JSON.parse(options.body), { refresh_token: 'old-refresh' });
      return Response.json({
        access_token: 'rotated-access',
        refresh_token: 'rotated-refresh',
        expires_in: 120,
      });
    }
    tokens.push(options.headers.Authorization);
    return Response.json({ id: 'owner', email: 'owner@example.test' });
  };
  const result = await linkedSession(env, 'refresh-owner', fetcher);
  assert.equal(result.session.access_token, 'rotated-access');
  assert.deepEqual(tokens, ['Bearer rotated-access', 'Bearer rotated-access']);
  assert.equal((await readLink(env, 'refresh-owner')).refresh_token, 'rotated-refresh');
  assert.ok(
    [...values.values()].every(
      (value) => !value.includes('rotated-access') && !value.includes('rotated-refresh'),
    ),
  );
});

test('concurrent MCP calls in one isolate share one refresh and receive the rotated account', async () => {
  const { env, expired } = fixture();
  await writeLink(env, 'parallel-owner', expired);
  let release, started;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const requested = new Promise((resolve) => {
    started = resolve;
  });
  let refreshCount = 0;
  const fetcher = async (url) => {
    if (url.includes('/token?')) {
      refreshCount++;
      started();
      await gate;
      return Response.json({
        access_token: 'parallel-access',
        refresh_token: 'parallel-refresh',
        expires_in: 3600,
      });
    }
    return Response.json({ id: 'owner' });
  };
  const results = Promise.all(
    Array.from({ length: 3 }, () => linkedSession(env, 'parallel-owner', fetcher)),
  );
  await requested;
  release();
  assert.ok((await results).every((result) => result.session.access_token === 'parallel-access'));
  assert.equal(refreshCount, 1);
});

test('failed refresh preserves the old link and permits a later independent retry', async () => {
  const { env, expired, values } = fixture();
  await writeLink(env, 'retry-owner', expired);
  const before = [...values.values()];
  await assert.rejects(
    linkedSession(env, 'retry-owner', async () =>
      Response.json({ message: 'Expired' }, { status: 401 }),
    ),
    /Reconnect/,
  );
  assert.deepEqual([...values.values()], before);
  const result = await linkedSession(env, 'retry-owner', async (url) =>
    url.includes('/token?')
      ? Response.json({
          access_token: 'retry-access',
          refresh_token: 'retry-refresh',
          expires_in: 3600,
        })
      : Response.json({ id: 'owner' }),
  );
  assert.equal(result.session.access_token, 'retry-access');
});

test('a refresh credential for a different account cannot replace the encrypted link', async () => {
  const { env, expired, values } = fixture();
  await writeLink(env, 'mismatch-owner', expired);
  const before = [...values.values()];
  await assert.rejects(
    linkedSession(env, 'mismatch-owner', async (url) =>
      url.includes('/token?')
        ? Response.json({ access_token: 'other-access', refresh_token: 'other-refresh' })
        : Response.json({ id: 'different-account' }),
    ),
    /do not match/,
  );
  assert.deepEqual([...values.values()], before);
});

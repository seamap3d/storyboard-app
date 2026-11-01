import test from 'node:test';
import assert from 'node:assert/strict';
import { consumeAuthCallback } from '../app/recovery.mjs';
import { SitesClient } from '../app/sites-client.mjs';
function parse(path) {
  const url = new URL('https://site.test' + path);
  let cleaned = null;
  const value = consumeAuthCallback(url, { replaceState: (a, b, path) => (cleaned = path) });
  return { value, cleaned };
}
test('recovery callback is consumed and scrubbed without exposing secrets in the replacement URL', () => {
  const { value, cleaned } = parse('/#access_token=fixture&refresh_token=refresh&type=recovery');
  assert.equal(value.recovery, true);
  assert.equal(value.session.access_token, 'fixture');
  assert.equal(cleaned, '/');
  const expired = parse('/#error=access_denied&error_code=otp_expired&type=recovery');
  assert.equal(expired.value.error, true);
  assert.equal(expired.value.session, null);
  assert.equal(expired.cleaned, '/');
  const missing = parse('/?flow=recovery');
  assert.equal(missing.value.recovery, true);
  assert.equal(missing.value.session, null);
  assert.equal(parse('/#access_token=incomplete&type=recovery').value.error, true);
  assert.equal(
    parse('/#access_token=signup&refresh_token=signuprefresh&type=signup').value.recovery,
    false,
  );
});
function client(fetcher) {
  const instance = Object.create(SitesClient.prototype);
  instance.url = 'https://dev.supabase.co';
  instance.key = 'sb_publishable_fixture';
  instance.fetcher = fetcher;
  return instance;
}
test('recovery uses only the validated link token, with no account link or refresh dependency', async () => {
  const calls = [];
  const c = client(async (url, options) => {
    calls.push({ url, options });
    return Response.json({ id: 'user', email: 'user@example.test' });
  });
  await c.beginRecovery({ access_token: 'reset-token', refresh_token: 'unused-refresh' });
  assert.equal(c.recoverySession.refresh_token, undefined);
  await c.updateRecoveredPassword('new-password');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.method, 'PUT');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer reset-token');
  assert.equal(c.recoverySession, null);
  assert.equal(
    calls.some((call) => call.url.includes('account-link') || call.url.includes('refresh_token')),
    false,
  );
  await assert.rejects(c.updateRecoveredPassword('another-password'), /valid recovery link/);
});
test('expired recovery cannot update a password or masquerade as success', async () => {
  const c = client(async () => Response.json({ code: 'bad_jwt' }, { status: 401 }));
  await assert.rejects(c.beginRecovery({ access_token: 'expired' }), /expired/);
  assert.equal(c.recoverySession, null);
  await assert.rejects(c.updateRecoveredPassword('new-password'), /valid recovery link/);
  const d = client(async (url, options) =>
    options.method === 'PUT'
      ? Response.json({ code: 'bad_jwt' }, { status: 401 })
      : Response.json({ id: 'user' }),
  );
  await d.beginRecovery({ access_token: 'expires-after-landing' });
  await assert.rejects(d.updateRecoveredPassword('new-password'), /expired/);
  assert.equal(d.recoverySession, null);
});

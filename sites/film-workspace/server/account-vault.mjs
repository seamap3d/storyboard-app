// Dispatch-owned Site identity + independently verified Supabase login.
// Email is display data, never an account-linking or authorization key.
const encode = (value) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
const base64 = (bytes) => btoa(String.fromCharCode(...bytes));
export function identity(request) {
  const id = request.headers.get('oai-authenticated-user-id');
  if (!id || id.length > 256) throw new Error('ChatGPT sign-in required.');
  return id;
}
async function keyFor(id) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id));
  return (
    'account-links/' +
    Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('') +
    '.json'
  );
}
async function aes(env) {
  if (!env.SESSION_VAULT_KEY || !env.BUCKET) throw new Error('Account connection unavailable.');
  return crypto.subtle.importKey('raw', encode(env.SESSION_VAULT_KEY), 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
}
export async function writeLink(env, id, session) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(id) },
    await aes(env),
    new TextEncoder().encode(JSON.stringify(session)),
  );
  await env.BUCKET.put(
    await keyFor(id),
    JSON.stringify({ iv: base64(iv), ciphertext: base64(new Uint8Array(ciphertext)) }),
    { httpMetadata: { contentType: 'application/json' } },
  );
}
export async function readLink(env, id) {
  if (!env.BUCKET) throw new Error('Account connection unavailable.');
  const object = await env.BUCKET.get(await keyFor(id));
  if (!object) return null;
  const value = await object.json();
  const bytes = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: encode(value.iv), additionalData: new TextEncoder().encode(id) },
    await aes(env),
    encode(value.ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(bytes));
}
export async function deleteLink(env, id) {
  await env.BUCKET.delete(await keyFor(id));
}
export function configuration(env) {
  if (
    env.SUPABASE_URL !== 'https://lfvsimzmjhceyvjaoats.supabase.co' ||
    !env.SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_')
  )
    throw new Error('Development database configuration unavailable.');
  return { supabaseUrl: env.SUPABASE_URL, supabasePublishableKey: env.SUPABASE_PUBLISHABLE_KEY };
}
export async function authRequest(env, path, body, token, fetcher = (...args) => fetch(...args)) {
  const config = configuration(env);
  const response = await fetcher(config.supabaseUrl + '/auth/v1/' + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      apikey: config.supabasePublishableKey,
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: 'manual',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('Reconnect your storyboard account.');
  return response.json();
}
function sessionValue(data, user) {
  if (typeof data.access_token !== 'string' || typeof data.refresh_token !== 'string')
    throw new Error('Reconnect your storyboard account.');
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() / 1000 + Math.min(Number(data.expires_in) || 3600, 3600),
    user_id: user.id,
    email: user.email,
  };
}
export function assertMcpOwner(env, user) {
  if (!env.MCP_OWNER_SUPABASE_USER_ID || !user?.id || user.id !== env.MCP_OWNER_SUPABASE_USER_ID)
    throw new Error('ChatGPT tools are reserved for the app provider.');
}
export async function linkAccount(env, id, input, fetcher = (...args) => fetch(...args)) {
  for (const key of ['access_token', 'refresh_token'])
    if (typeof input[key] !== 'string' || input[key].length > 12000 || !input[key])
      throw new Error('A valid storyboard sign-in is required.');
  const user = await authRequest(env, 'user', null, input.access_token, fetcher);
  if (!user.id || user.is_anonymous) throw new Error('A permanent storyboard account is required.');
  assertMcpOwner(env, user);
  // Verify the refresh credential belongs to that same account, then store only
  // the newly rotated session. Never trust a caller's expiry/user ID/email.
  const rotated = await authRequest(
    env,
    'token?grant_type=refresh_token',
    { refresh_token: input.refresh_token },
    null,
    fetcher,
  );
  const verified = await authRequest(env, 'user', null, rotated.access_token, fetcher);
  if (verified.id !== user.id) throw new Error('Account credentials do not match.');
  await writeLink(env, id, sessionValue(rotated, verified));
  return { linked: true, user: { id: verified.id, email: verified.email } };
}
const refreshes = new Map();
export async function linkedSession(env, id, fetcher = (...args) => fetch(...args)) {
  let session = await readLink(env, id);
  if (!session)
    throw new Error('Open the Site and connect your existing storyboard account first.');
  if (session.expires_at < Date.now() / 1000 + 60) {
    let pending = refreshes.get(id);
    if (!pending) {
      pending = (async () => {
        // Reread after a preceding request may have rotated the credentials.
        const stored = await readLink(env, id);
        if (!stored) throw new Error('Reconnect your storyboard account.');
        if (stored.expires_at >= Date.now() / 1000 + 60) return stored;
        const rotated = await authRequest(
          env,
          'token?grant_type=refresh_token',
          { refresh_token: stored.refresh_token },
          null,
          fetcher,
        );
        const user = await authRequest(env, 'user', null, rotated.access_token, fetcher);
        if (user.id !== stored.user_id) throw new Error('Account credentials do not match.');
        const updated = sessionValue(rotated, user);
        await writeLink(env, id, updated);
        return updated;
      })();
      refreshes.set(id, pending);
      pending
        .finally(() => {
          if (refreshes.get(id) === pending) refreshes.delete(id);
        })
        .catch(() => {});
    }
    session = await pending;
  }
  const user = await authRequest(env, 'user', null, session.access_token, fetcher);
  if (user.id !== session.user_id || user.is_anonymous)
    throw new Error('Reconnect your storyboard account.');
  return { session, user };
}

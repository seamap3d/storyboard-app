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


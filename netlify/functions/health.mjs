export async function checkHealth(env, fetcher = fetch) {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
    return { statusCode: 503, body: JSON.stringify({ status: 'unavailable', dependency: 'supabase' }) };
  }
  try {
    const response = await fetcher(new URL('/auth/v1/settings', env.SUPABASE_URL), {
      headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY },
      signal: AbortSignal.timeout(5000),
      redirect: 'error',
    });
    return { statusCode: response.ok ? 200 : 503, body: JSON.stringify({ status: response.ok ? 'ok' : 'unavailable', dependency: 'supabase-auth' }) };
  } catch {
    return { statusCode: 503, body: JSON.stringify({ status: 'unavailable', dependency: 'supabase-auth' }) };
  }
}
export async function handler() {
  const result = await checkHealth(process.env);
  return { ...result, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } };
}

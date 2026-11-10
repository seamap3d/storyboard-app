import { authRequest, configuration } from '../server/account-vault.mjs';
import { boundedJson, json, rpcs } from './http.mjs';

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isPermanent = (user) => Boolean(user.id) && !user.is_anonymous;
const isRedirect = (response) => response.status >= 300 && response.status < 400;

async function forwardRpc(env, token, name, body, fetcher) {
  const config = configuration(env);
  try {
    const response = await fetcher(config.supabaseUrl + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: {
        apikey: config.supabasePublishableKey,
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      redirect: 'manual',
      signal: AbortSignal.timeout(60000),
    });
    if (isRedirect(response)) return json({ message: 'Request redirect rejected.' }, 502);
    return new Response(response.body, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/json',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return json(
      {
        code: name === 'save_storyboard' ? 'SAVE_UNCONFIRMED' : 'RPC_UNCONFIRMED',
        message:
          'Request confirmation timed out. Check shared data before retrying; keep your current draft.',
      },
      504,
    );
  }
}

export async function handleProjectRpc(request, env, url, fetcher) {
  const name = url.pathname.slice('/api/project-rpc/'.length);
  if (request.method !== 'POST' || !rpcs.has(name))
    return json({ message: 'Operation not available.' }, 403);
  const token = /^Bearer ([^\s]+)$/.exec(request.headers.get('Authorization') || '')?.[1];
  if (!token) return json({ message: 'Storyboard sign-in required.' }, 401);
  const user = await authRequest(env, 'user', null, token, fetcher);
  if (!isPermanent(user)) return json({ message: 'Storyboard sign-in required.' }, 401);
  const body = await boundedJson(request, 6 * 1024 * 1024);
  if (!isObject(body)) return json({ message: 'Invalid request.' }, 400);
  return forwardRpc(env, token, name, body, fetcher);
}

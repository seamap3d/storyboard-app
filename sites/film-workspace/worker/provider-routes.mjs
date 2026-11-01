import {
  identity,
  configuration,
  linkAccount,
  linkedSession,
  readLink,
  deleteLink,
  assertMcpOwner,
  authRequest,
} from '../server/account-vault.mjs';
import { allowedProxy, boundedJson, json } from './http.mjs';

async function optionalLink(request, env) {
  let siteUser;
  try {
    siteUser = identity(request);
  } catch {
    return { siteUser: null, link: null };
  }
  try {
    return { siteUser, link: await readLink(env, siteUser) };
  } catch {
    return { siteUser, link: null };
  }
}

export async function handleMcpStatus(request, env, fetcher) {
  if (request.method !== 'GET') return json({ message: 'Method not allowed.' }, 405);
  const token = /^Bearer ([^\s]+)$/.exec(request.headers.get('Authorization') || '')?.[1];
  if (!token) return json({ message: 'Storyboard sign-in required.' }, 401);
  const user = await authRequest(env, 'user', null, token, fetcher);
  assertMcpOwner(env, user);
  const { siteUser, link } = await optionalLink(request, env);
  return json({
    owner: true,
    chatgpt_signed_in: Boolean(siteUser),
    linked: link?.user_id === user.id,
  });
}

async function handleAccount(request, env, siteUser, fetcher) {
  if (request.method !== 'GET') return json({ message: 'Method not allowed.' }, 405);
  const link = await readLink(env, siteUser);
  if (!link) return json({ linked: false });
  const { user } = await linkedSession(env, siteUser, fetcher);
  assertMcpOwner(env, user);
  return json({ linked: true, user: { id: user.id, email: user.email } });
}

async function unlink(env, siteUser, fetcher) {
  const stored = await readLink(env, siteUser);
  // Remove this identity's link even when remote logout is unavailable.
  await deleteLink(env, siteUser);
  if (!stored) return;
  const config = configuration(env);
  try {
    await fetcher(config.supabaseUrl + '/auth/v1/logout?scope=local', {
      method: 'POST',
      headers: {
        apikey: config.supabasePublishableKey,
        Authorization: 'Bearer ' + stored.access_token,
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    /* Local access has already been removed. */
  }
}

async function handleAccountLink(request, env, siteUser, fetcher) {
  if (request.method === 'POST')
    return json(await linkAccount(env, siteUser, await boundedJson(request, 32000), fetcher));
  if (request.method === 'DELETE') {
    await unlink(env, siteUser, fetcher);
    return json({ linked: false });
  }
  return json({ message: 'Method not allowed.' }, 405);
}

async function handleSupabaseProxy(request, env, siteUser, fetcher) {
  const url = new URL(request.url);
  const path = url.pathname.slice('/api/supabase'.length);
  if (!allowedProxy(path, request.method))
    return json({ message: 'Operation not available.' }, 403);
  const { session, user } = await linkedSession(env, siteUser, fetcher);
  assertMcpOwner(env, user);
  const config = configuration(env);
  if (Number(request.headers.get('Content-Length') || 0) > 7_100_000)
    return json({ message: 'Request exceeds size limit.' }, 413);
  const writing = !['GET', 'HEAD'].includes(request.method);
  const response = await fetcher(config.supabaseUrl + path + url.search, {
    method: request.method,
    headers: {
      apikey: config.supabasePublishableKey,
      Authorization: 'Bearer ' + session.access_token,
      ...(request.headers.has('Content-Type')
        ? { 'Content-Type': request.headers.get('Content-Type') }
        : {}),
    },
    ...(writing ? { body: request.body, duplex: 'half' } : {}),
    redirect: 'manual',
    signal: AbortSignal.timeout(60000),
  });
  return new Response(response.body, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('Content-Type') || 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export function handleProviderRoute(request, env, url, fetcher) {
  if (!url.pathname.startsWith('/api/')) return null;
  let siteUser;
  try {
    siteUser = identity(request);
  } catch {
    return json({ message: 'ChatGPT sign-in is required only for owner tools.' }, 401);
  }
  const route = { '/api/account': handleAccount, '/api/account-link': handleAccountLink }[
    url.pathname
  ];
  if (route) return route(request, env, siteUser, fetcher);
  if (url.pathname.startsWith('/api/supabase/'))
    return handleSupabaseProxy(request, env, siteUser, fetcher);
  return null;
}

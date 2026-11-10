import { configuration } from '../server/account-vault.mjs';
import { json } from './http.mjs';
import { handleMcp } from './mcp.mjs';
import { handleProjectRpc } from './project-rpc.mjs';
import { handleMcpStatus, handleProviderRoute } from './provider-routes.mjs';
import { serveAsset } from './public-assets.mjs';
import { accountError } from './errors.mjs';
export { allowedProxy } from './http.mjs';

export async function handle(request, env, _ctx = {}, fetcher = (...args) => fetch(...args)) {
  const url = new URL(request.url);
  if (url.pathname === '/mcp') return handleMcp(request, env, fetcher);
  if (url.pathname === '/health')
    return json({
      service: 'apeonawhale-storyboard',
      hosting: 'chatgpt-sites',
      database: 'development',
    });
  const writing = !['GET', 'HEAD'].includes(request.method);
  if (writing && request.headers.get('Origin') !== url.origin)
    return json({ message: 'Same-origin request required.' }, 403);
  try {
    if (url.pathname.startsWith('/api/project-rpc/'))
      return await handleProjectRpc(request, env, url, fetcher);
    if (url.pathname === '/api/mcp-status') return await handleMcpStatus(request, env, fetcher);
    const provider = await handleProviderRoute(request, env, url, fetcher);
    if (provider) return provider;
    if (url.pathname === '/runtime-config.json')
      return json({ ...configuration(env), environment: 'development', hosting: 'chatgpt-sites' });
    return serveAsset(request, url);
  } catch (error) {
    return accountError(error);
  }
}
export default { fetch: (request, env, ctx) => handle(request, env, ctx) };

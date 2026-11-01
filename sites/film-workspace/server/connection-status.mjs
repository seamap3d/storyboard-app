import { configuration, identity, readLink } from './account-vault.mjs';
export function failureCode(error) {
  if (/illegal invocation/i.test(error.message)) return 'FETCH_ILLEGAL_INVOCATION';
  if (/AbortSignal.*timeout|timeout is not a function/i.test(error.message))
    return 'TIMEOUT_UNSUPPORTED';
  if (error.name === 'TimeoutError' || error.name === 'AbortError') return 'AUTH_TIMEOUT';
  if (error.message === 'Development database configuration unavailable.') return 'CONFIG_INVALID';
  return error.code || 'AUTH_NETWORK_FAILED';
}
export async function connectionStatus(request, env, fetcher = (...args) => fetch(...args)) {
  const siteUser = identity(request);
  const result = {
    site_user_id: siteUser,
    provider_configured: Boolean(env.MCP_OWNER_SUPABASE_USER_ID),
    auth_reachable: false,
    account_linked: false,
  };
  try {
    result.account_linked = Boolean(await readLink(env, siteUser));
  } catch {
    result.vault_error = 'VAULT_UNAVAILABLE';
  }
  try {
    const config = configuration(env);
    const response = await fetcher(config.supabaseUrl + '/auth/v1/settings', {
      headers: { apikey: config.supabasePublishableKey },
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
    });
    result.auth_http_status = response.status;
    result.auth_reachable = response.ok;
  } catch (error) {
    result.auth_error = failureCode(error);
    // This probe has no user token/body. Return only a redacted message, never
    // the Error/Request object, headers, environment values or stack.
    result.auth_error_name = String(error.name || 'Error').slice(0, 40);
    result.auth_error_detail = String(error.message || 'Request failed')
      .replace(/https?:\/\/\S+/g, '[request URL]')
      .replace(/sb_(?:publishable|secret)_[A-Za-z0-9_-]+/g, '[key]')
      .replace(/[A-Za-z0-9_-]{60,}/g, '[redacted]')
      .slice(0, 220);
  }
  return result;
}

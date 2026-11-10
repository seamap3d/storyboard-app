// Consume sensitive callback fragments before any asynchronous initialization.
// Credentials remain in memory only; errors never echo the callback URL.
export function consumeAuthCallback(location, history) {
  const hash = new URLSearchParams(location.hash.slice(1));
  const url = new URL(location.href);
  const requested = url.searchParams.get('flow') === 'recovery' || hash.get('type') === 'recovery';
  const hasCredentials = hash.has('access_token') || hash.has('refresh_token');
  const hasError = hash.has('error') || hash.has('error_code');
  const session =
    hash.get('access_token') && hash.get('refresh_token')
      ? { access_token: hash.get('access_token'), refresh_token: hash.get('refresh_token') }
      : null;
  if (hasCredentials || hasError || hash.has('type'))
    history.replaceState(null, '', location.pathname + location.search);
  return {
    recovery: requested || (Boolean(session) && !hash.get('type')),
    session,
    error: hasError || (hasCredentials && !session),
  };
}

import { failureCode } from '../server/connection-status.mjs';
import { json } from './http.mjs';

export function accountError(error) {
  if (error.message === 'ChatGPT tools are reserved for the app provider.') {
    return json({ message: error.message, code: 'PROVIDER_ONLY' }, 403);
  }
  const auth =
    /^(Reconnect|Open the Site|ChatGPT (sign-in|tools)|A valid|A permanent|Account credentials)/.test(
      error.message,
    );
  return json(
    {
      message: auth
        ? error.message
        : 'Account connection unavailable. Retry or reconnect your storyboard account.',
      code: auth ? 'SESSION_INVALID' : failureCode(error),
    },
    auth ? 401 : 503,
  );
}

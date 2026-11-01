import { requestSignal, requestOptions, responseData, requestError } from './http-client.mjs';
function sameJson(a, b) {
  if (a === b) return true;
  if (
    !a ||
    !b ||
    typeof a !== 'object' ||
    typeof b !== 'object' ||
    Array.isArray(a) !== Array.isArray(b)
  )
    return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => Object.hasOwn(b, key) && sameJson(a[key], b[key]));
}
export class SharedClient {
  constructor(config, { fetcher = (...args) => fetch(...args), storage = sessionStorage } = {}) {
    this.url = new URL(config.supabaseUrl).origin;
    this.key = config.supabasePublishableKey;
    this.fetcher = fetcher;
    this.storage = storage;
    this.uploadedImages = new Set();
    this.storageKey = `storyboard-session:${this.url}`;
    try {
      this.session = JSON.parse(storage.getItem(this.storageKey));
    } catch {
      this.session = null;
    }
  }
  setSession(session) {
    const previous = this.session;
    this.session = session?.access_token
      ? { ...session, expires_at: session.expires_at || Date.now() / 1000 + session.expires_in }
      : null;
    const sameUser = previous?.user?.id && previous.user.id === this.session?.user?.id;
    if (!sameUser && previous?.access_token !== this.session?.access_token)
      this.uploadedImages.clear();
    if (this.session) this.storage.setItem(this.storageKey, JSON.stringify(this.session));
    else {
      this.storage.removeItem(this.storageKey);
      this.uploadedImages.clear();
    }
  }
  endpoint(path) {
    return this.url + path;
  }
  async request(path, options = {}) {
    const auth = options.auth !== false;
    if (auth && !this.session) throw new Error('Sign in to use shared projects.');
    if (auth && this.session.expires_at < Date.now() / 1000 + 60) await this.refresh();
    try {
      return await this.raw(path, options);
    } catch (error) {
      if (!auth || error.status !== 401) throw error;
      await this.refresh();
      return this.raw(path, options);
    }
  }
  async raw(
    path,
    {
      body,
      method = body ? 'POST' : 'GET',
      auth = true,
      binary = false,
      responseType = 'json',
    } = {},
  ) {
    const rpc = path.startsWith('/rest/v1/rpc/');
    const signal = requestSignal(path, binary, responseType);
    try {
      const response = await this.fetcher(
        this.endpoint(path),
        requestOptions(this.key, this.session, { body, method, auth, binary }, signal),
      );
      return await responseData(response, path, responseType, signal);
    } catch (error) {
      throw requestError(error, signal, rpc);
    }
  }
  async refresh() {
    try {
      this.setSession(
        await this.raw('/auth/v1/token?grant_type=refresh_token', {
          auth: false,
          body: { refresh_token: this.session.refresh_token },
        }),
      );
    } catch (error) {
      if (error.status === 400 || error.status === 401) this.setSession(null);
      throw error;
    }
  }
  async signIn(email, password) {
    this.setSession(
      await this.request('/auth/v1/token?grant_type=password', {
        auth: false,
        body: { email, password },
      }),
    );
  }
  async signUp(email, password, redirectTo) {
    const data = await this.request(
      '/auth/v1/signup' + (redirectTo ? '?redirect_to=' + encodeURIComponent(redirectTo) : ''),
      { auth: false, body: { email, password } },
    );
    if (data?.access_token) this.setSession(data);
  }
  async user() {
    return this.request('/auth/v1/user');
  }
  async signOut() {
    try {
      if (this.session) await this.request('/auth/v1/logout', { method: 'POST' });
    } finally {
      this.setSession(null);
    }
  }
  async rpc(name, body) {
    let result;
    try {
      result = await this.request('/rest/v1/rpc/' + name, { body });
    } catch (error) {
      // A timed-out write might have committed. Only READ to reconcile it;
      // never replay a write automatically or accept somebody else's changes.
      if (name === 'save_storyboard' && ['SAVE_UNCONFIRMED', '40001'].includes(error.code)) {
        try {
          const rows = await this.list(
            'storyboards',
            'select=*&id=eq.' + encodeURIComponent(body.p_id),
          );
          const current = rows.length === 1 ? rows[0] : null;
          if (
            current?.id === body.p_id &&
            current.version === body.p_version + 1 &&
            current.name === (typeof body.p_name === 'string' ? body.p_name.trim() : body.p_name) &&
            sameJson(current.document, body.p_document)
          )
            return current;
        } catch {
          /* The draft remains current even when confirmation is unreachable. */
        }
        if (error.code === 'SAVE_UNCONFIRMED')
          throw Object.assign(
            new Error(
              'The save could not be confirmed. Your changes are still in this tab. Export JSON before reloading; do not discard this draft.',
            ),
            { code: 'SAVE_UNCONFIRMED' },
          );
      }
      throw error;
    }
    if (['create_storyboard', 'save_storyboard'].includes(name) && Array.isArray(result)) {
      if (result.length !== 1)
        throw new Error('Storyboard response was incomplete. Reload before retrying.');
      return result[0];
    }
    return result;
  }
  async uploadImage(path, blob) {
    if (this.uploadedImages.has(path)) return;
    const url = '/storage/v1/object/storyboard-images/' + path;
    try {
      await this.request(url, { body: blob, binary: true });
      this.uploadedImages.add(path);
    } catch (error) {
      if (error.status !== 409 && error.code !== 'Duplicate' && error.storageStatus !== 409)
        throw error;
      await this.downloadImage(path);
    }
  }
  async downloadImage(path) {
    const blob = await this.request('/storage/v1/object/authenticated/storyboard-images/' + path, {
      responseType: 'blob',
    });
    // This immutable object is already present and readable for this session.
    // Subsequent saves reuse it instead of POSTing/GETting every loaded image.
    this.uploadedImages.add(path);
    return blob;
  }
  list(table, query = '') {
    return this.request('/rest/v1/' + table + '?' + query);
  }
}

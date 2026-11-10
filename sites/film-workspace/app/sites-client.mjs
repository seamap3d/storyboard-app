import { SharedClient } from './shared-client.mjs';
export class SitesClient extends SharedClient {
  constructor(config) {
    super(config);
    if (this.session?.access_token === 'sites-managed') this.setSession(null);
  }
  endpoint(path) {
    if (path.startsWith('/rest/v1/rpc/'))
      return '/api/project-rpc/' + path.slice('/rest/v1/rpc/'.length);
    return super.endpoint(path);
  }
  async beginRecovery(session) {
    this.recoverySession = null;
    const response = await this.fetcher(this.url + '/auth/v1/user', {
      headers: { apikey: this.key, Authorization: 'Bearer ' + session.access_token },
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new Error('This reset link has expired or is invalid. Request a new recovery email.');
    const user = await response.json();
    if (!user?.id || user.is_anonymous)
      throw new Error('This reset link is invalid. Request a new recovery email.');
    this.recoverySession = { access_token: session.access_token };
    return user;
  }
  async updateRecoveredPassword(password) {
    if (!this.recoverySession)
      throw new Error('Open a valid recovery link from your newest email first.');
    if (typeof password !== 'string' || password.length < 8)
      throw new Error('Use at least 8 characters.');
    const response = await this.fetcher(this.url + '/auth/v1/user', {
      method: 'PUT',
      headers: {
        apikey: this.key,
        Authorization: 'Bearer ' + this.recoverySession.access_token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password }),
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      if (response.status === 401 || response.status === 403) {
        this.recoverySession = null;
        throw new Error('This reset link has expired. Request a new recovery email.');
      }
      if (data?.code === 'same_password')
        throw new Error('Choose a password different from your previous password.');
      if (data?.code === 'weak_password')
        throw new Error('Choose a stronger password and try again.');
      throw new Error(
        'The password could not be updated. Try a stronger password or request a new recovery email.',
      );
    }
    this.recoverySession = null;
    return true;
  }
  async connect(session) {
    this.setSession(session);
  }
  async bootstrap() {
    if (!this.session) return;
    try {
      await this.user();
    } catch (error) {
      if (!this.session || error.status === 400 || error.status === 401) this.setSession(null);
      throw error;
    }
  }
  async ownerToolsStatus() {
    if (!this.session) return null;
    await this.user();
    const response = await this.fetcher('/api/mcp-status', {
      headers: { Authorization: 'Bearer ' + this.session.access_token },
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 403 && data.code === 'PROVIDER_ONLY') return null;
    if (!response.ok)
      throw new Error(
        'Provider connection check failed' +
          (data.code ? ' (' + data.code + ')' : '') +
          '. Try Check connection.',
      );
    return data;
  }
  async connectOwnerTools(password) {
    const user = await this.user();
    // A separate login creates an independent refresh-token family for MCP.
    // Regular browser sign-in does not enroll or grant any ChatGPT tools.
    const session = await super.raw('/auth/v1/token?grant_type=password', {
      auth: false,
      body: { email: user.email, password },
    });
    const response = await this.fetcher('/api/account-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      }),
    });
    if (!response.ok)
      throw new Error(
        'Could not connect owner tools. Sign into ChatGPT using the owner link, then try again.',
      );
  }
  async disconnectOwnerTools() {
    const response = await this.fetcher('/api/account-link', { method: 'DELETE' });
    if (!response.ok) throw new Error('Could not disconnect owner tools. Try again.');
  }
  async signOut() {
    try {
      if (this.session) await this.request('/auth/v1/logout?scope=local', { method: 'POST' });
    } finally {
      this.setSession(null);
    }
  }
}

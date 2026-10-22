export class SharedClient {
  constructor(config, { fetcher = (...args) => fetch(...args), storage = sessionStorage } = {}) {
    this.url = new URL(config.supabaseUrl).origin;
    this.key = config.supabasePublishableKey;
    this.fetcher = fetcher;
    this.storage = storage;
    this.storageKey = `storyboard-session:${this.url}`;
    try { this.session = JSON.parse(storage.getItem(this.storageKey)); } catch { this.session = null; }
  }
  setSession(session) {
    this.session = session?.access_token ? { ...session, expires_at: session.expires_at || Date.now()/1000 + session.expires_in } : null;
    if (this.session) this.storage.setItem(this.storageKey, JSON.stringify(this.session));
    else this.storage.removeItem(this.storageKey);
  }
  async request(path, { body, method = body ? 'POST' : 'GET', auth = true } = {}) {
    if (auth && !this.session) throw new Error('Sign in to use shared projects.');
    if (auth && this.session.expires_at < Date.now()/1000 + 60) await this.refresh();
    try { return await this.raw(path, {body,method,auth}); }
    catch (error) {
      if (!auth || error.status !== 401) throw error;
      await this.refresh();
      return this.raw(path, {body,method,auth});
    }
  }
  async raw(path, { body, method = body ? 'POST' : 'GET', auth = true } = {}) {
    const response = await this.fetcher(this.url+path, {
      method, headers: { apikey: this.key, ...(auth ? {Authorization:`Bearer ${this.session.access_token}`} : {}), ...(body ? {'Content-Type':'application/json'} : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000), redirect: 'error',
    });
    const data = await response.json().catch(()=>null);
    if (!response.ok) {
      const error = new Error(data?.code === '40001' ? 'Another member saved this storyboard. Export your changes, then reload the shared version.' : (data?.message || data?.msg || data?.error_description || `Request failed (${response.status}).`));
      error.status = response.status; error.code = data?.code;
      throw error;
    }
    return data;
  }
  async refresh() {
    try { this.setSession(await this.raw('/auth/v1/token?grant_type=refresh_token', {auth:false,body:{refresh_token:this.session.refresh_token}})); }
    catch (error) { if (error.status===400 || error.status===401) this.setSession(null); throw error; }
  }
  async signIn(email,password) { this.setSession(await this.request('/auth/v1/token?grant_type=password',{auth:false,body:{email,password}})); }
  async signUp(email,password) {
    const data = await this.request('/auth/v1/signup',{auth:false,body:{email,password}});
    if (data?.access_token) this.setSession(data);
  }
  async user() { return this.request('/auth/v1/user'); }
  async signOut() { try { if (this.session) await this.request('/auth/v1/logout',{method:'POST'}); } finally { this.setSession(null); } }
  async rpc(name,body) {
    const result = await this.request('/rest/v1/rpc/'+name,{body});
    // PostgREST may represent composite return types as a one-row array.
    if (['create_storyboard','save_storyboard'].includes(name) && Array.isArray(result)) {
      if (result.length !== 1) throw new Error('Storyboard response was incomplete. Reload before retrying.');
      return result[0];
    }
    return result;
  }
  list(table,query='') { return this.request('/rest/v1/'+table+'?'+query); }
}

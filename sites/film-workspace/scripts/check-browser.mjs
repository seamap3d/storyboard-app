import { checkResourcesBrowser } from './check-resources-browser.mjs';
import { productionBrowserFixture } from './production-browser-fixture.mjs';
import { checkProductionBrowser } from './check-production-browser.mjs';
import { checkPlanningBrowser } from './check-planning-browser.mjs';
import { collectBrowserCoverage } from './browser-coverage.mjs';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import assert from 'node:assert/strict';
import { handle } from '../worker/index.mjs';
const objects = new Map(),
  images = new Map();
const user = { id: '11111111-1111-4111-8111-111111111111', email: 'owner@example.test' };
const users = {
  owner: user,
  editor: { id: '44444444-4444-4444-8444-444444444444', email: 'editor@example.test' },
  viewer: { id: '55555555-5555-4555-8555-555555555555', email: 'viewer@example.test' },
  stranger: { id: '66666666-6666-4666-8666-666666666666', email: 'stranger@example.test' },
};
const env = {
  MCP_OWNER_SUPABASE_USER_ID: user.id,
  SUPABASE_URL: 'https://lfvsimzmjhceyvjaoats.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
  SESSION_VAULT_KEY: Buffer.alloc(32, 4).toString('base64'),
  BUCKET: {
    put: async (k, v) => objects.set(k, v),
    get: async (k) => (objects.has(k) ? { json: async () => JSON.parse(objects.get(k)) } : null),
    delete: async (k) => objects.delete(k),
  },
};
const project = {
  id: '22222222-2222-4222-8222-222222222222',
  owner_id: user.id,
  name: 'AfterLife',
};
const board = {
  id: '33333333-3333-4333-8333-333333333333',
  project_id: project.id,
  name: 'Test storyboard',
  version: 3,
  document: {
    meta: { title: 'Private film' },
    shots: [{ id: 'shot-1', scene: 'Beach', desc: 'Opening frame', location: 'Beach' }],
  },
};
const productionFixture = productionBrowserFixture(project, board);
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jfUQAAAAASUVORK5CYII=',
  'base64',
);
let siteIdentity = null,
  saves = 0,
  ownerLinks = 0,
  imagePosts = 0,
  saveAttempts = 0,
  loseNextSaveResponse = false,
  failNextSave = false;
const session = (role) => ({
  access_token: role + '-access',
  refresh_token: role + '-refresh',
  expires_in: 3600,
});
async function backend(input, options = {}) {
  const url = new URL(input),
    headers = new Headers(options.headers);
  const token = headers.get('Authorization')?.replace('Bearer ', '') || '';
  const role = token.split('-')[0];
  const authenticated = users[role];
  const body = async () => (options.body ? new Response(options.body).json() : {});
  if (url.pathname === '/auth/v1/token') {
    const value = await body();
    const name = value.email?.split('@')[0] || 'owner';
    return Response.json(session(value.password === 'tools-password' ? 'owner-tools' : name));
  }
  if (url.pathname === '/auth/v1/user')
    return authenticated
      ? Response.json(authenticated)
      : Response.json({ message: 'invalid' }, { status: 401 });
  if (url.pathname === '/auth/v1/logout') return Response.json({});
  if (!authenticated) return Response.json({ message: 'Sign-in required' }, { status: 401 });
  const invited = role !== 'stranger';
  if (url.pathname.endsWith('_project_production'))
    return productionFixture.handle(url.pathname.split('/').at(-1), await body(), role);
  if (url.pathname === '/rest/v1/film_projects') return Response.json(invited ? [project] : []);
  if (url.pathname === '/rest/v1/project_members')
    return Response.json(
      invited && role !== 'owner'
        ? [{ project_id: project.id, user_id: authenticated.id, role }]
        : [],
    );
  if (url.pathname === '/rest/v1/project_invitations') return Response.json([]);
  if (url.pathname === '/rest/v1/storyboards') {
    const requested = url.searchParams.get('id')?.slice(3);
    return Response.json(
      invited
        ? [board, ...productionFixture.extraBoards].filter(
            (item) => !requested || item.id === requested,
          )
        : [],
    );
  }
  if (url.pathname === '/rest/v1/rpc/save_storyboard') {
    saveAttempts++;
    if (failNextSave) {
      failNextSave = false;
      throw new DOMException('Fixture timeout before commit', 'TimeoutError');
    }
    if (!['owner', 'editor'].includes(role))
      return Response.json({ code: '42501', message: 'Editing access required.' }, { status: 403 });
    const value = await body();
    if (value.p_version !== board.version) return Response.json({ code: '40001' }, { status: 400 });
    board.document = value.p_document;
    board.name = value.p_name;
    board.version++;
    saves++;
    if (loseNextSaveResponse) {
      loseNextSaveResponse = false;
      throw new DOMException('Fixture lost commit response', 'TimeoutError');
    }
    return Response.json(board);
  }
  if (url.pathname.startsWith('/storage/v1/object/authenticated/storyboard-images/')) {
    const key = url.pathname.split('/storyboard-images/')[1];
    return images.has(key) && invited
      ? new Response(images.get(key), { headers: { 'Content-Type': 'image/png' } })
      : Response.json({ message: 'denied' }, { status: 403 });
  }
  if (url.pathname.startsWith('/storage/v1/object/storyboard-images/')) {
    imagePosts++;
    if (!['owner', 'editor'].includes(role))
      return Response.json({ message: 'denied' }, { status: 403 });
    const key = url.pathname.split('/storyboard-images/')[1];
    images.set(key, await new Response(options.body).arrayBuffer());
    return Response.json({ Key: key });
  }
  throw Error('Unexpected backend ' + url.pathname);
}
const server = createServer(async (req, res) => {
  try {
    const headers = new Headers(req.headers);
    if (siteIdentity) headers.set('oai-authenticated-user-id', siteIdentity);
    else headers.delete('oai-authenticated-user-id');
    if (req.url === '/api/account-link' && req.method === 'POST') ownerLinks++;
    const request = new Request('http://127.0.0.1:' + server.address().port + req.url, {
      method: req.method,
      headers,
      ...(!['GET', 'HEAD'].includes(req.method)
        ? { body: Readable.toWeb(req), duplex: 'half' }
        : {}),
    });
    const response = await handle(request, env, {}, backend);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error(error.message);
    res.writeHead(500).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: ['--no-sandbox'],
  });
  if (process.env.COLLECT_BROWSER_COVERAGE === '1') collectBrowserCoverage(browser);
  const origin = 'http://127.0.0.1:' + server.address().port;
  const errors = [];
  async function open(role) {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await context.route('https://**/*', async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      if (!url.hostname.endsWith('.supabase.co')) {
        await route.abort();
        return;
      }
      const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': '*',
      };
      if (req.method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers });
        return;
      }
      const response = await backend(url, {
        method: req.method(),
        headers: req.headers(),
        body: req.postDataBuffer(),
      });
      await route.fulfill({
        status: response.status,
        headers: { ...headers, ...Object.fromEntries(response.headers) },
        body: Buffer.from(await response.arrayBuffer()),
      });
    });
    await page.goto(origin);
    assert.equal(await page.title(), 'ApeOnAWhale Film Planner');
    assert.equal(page.url(), origin + '/');
    await page.locator('#accountEmail').fill(users[role].email);
    await page.locator('#accountPassword').fill('fixture-password');
    await page.locator('#authForm button[type=submit]').click();
    await page.waitForFunction(
      (email) => document.getElementById('accountLabel').textContent.includes(email),
      users[role].email,
    );
    return { context, page };
  }
  // A collaborator signs in, uploads an image, edits and saves without ChatGPT.
  const editor = await open('editor');
  await editor.page.locator('#projectSelect').selectOption(project.id);
  await editor.page.waitForFunction(() =>
    document.getElementById('sharedStatus').textContent.includes('1 shots'),
  );
  await checkProductionBrowser(editor.page, productionFixture, board);
  await checkResourcesBrowser(editor.page, productionFixture, board);
  assert.equal(await editor.page.locator('#ownerTools').isHidden(), true);
  assert.equal(ownerLinks, 0);
  assert.equal(objects.size, 0);
  await editor.page.locator('.desc').fill('Edited by invited collaborator');
  await editor.page
    .locator('.image-upload')
    .setInputFiles({ name: 'frame.png', mimeType: 'image/png', buffer: png });
  await editor.page.locator('.shot img').first().waitFor({ state: 'visible' });
  await editor.page.locator('#cloudSave').click();
  await editor.page.waitForFunction(() =>
    document.getElementById('sharedStatus').textContent.includes('Saved'),
  );
  assert.equal(saves, 1);
  assert.equal(images.size, 1);
  assert.equal(board.document.shots[0].desc, 'Edited by invited collaborator');
  await editor.page.reload();
  await editor.page.waitForFunction(() =>
    document.getElementById('accountLabel').textContent.includes('editor@example.test'),
  );
  await editor.page.locator('#projectSelect').selectOption(project.id);
  await editor.page.waitForFunction(() =>
    document.getElementById('sharedStatus').textContent.includes('1 shots'),
  );
  assert.equal(await editor.page.locator('.desc').inputValue(), 'Edited by invited collaborator');
  const initialImagePosts = imagePosts;
  loseNextSaveResponse = true;
  await editor.page.locator('#projTitle').fill('Confirmed despite lost response');
  await editor.page.locator('#cloudSave').click();
  await editor.page.waitForFunction(() =>
    document.getElementById('sharedStatus').textContent.includes('Saved to shared storage'),
  );
  assert.equal(saves, 2);
  assert.equal(imagePosts, initialImagePosts);
  assert.equal(board.document.meta.title, 'Confirmed despite lost response');
  failNextSave = true;
  await editor.page.locator('#projTitle').fill('Preserve this unsaved title');
  await editor.page.locator('#cloudSave').click();
  await editor.page.waitForFunction(() =>
    document.getElementById('sharedStatus').textContent.includes('save could not be confirmed'),
  );
  assert.equal(saves, 2);
  assert.equal(await editor.page.locator('#projTitle').inputValue(), 'Preserve this unsaved title');
  assert.equal(await editor.page.locator('#btnExport').isEnabled(), true);
  assert.equal(imagePosts, initialImagePosts);
  await editor.page.locator('#cloudSave').click();
  await editor.page.waitForFunction(() =>
    document.getElementById('sharedStatus').textContent.includes('Saved to shared storage'),
  );
  assert.equal(saves, 3);
  assert.equal(saveAttempts, 4);
  assert.equal(imagePosts, initialImagePosts);

  const deniedMcp = await editor.page.evaluate(async () => {
    const r = await fetch('/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'list_storyboards', arguments: {} },
      }),
    });
    return r.json();
  });
  assert.equal(deniedMcp.result.isError, true);
  await editor.page.locator('#signOut').click();
  await editor.page.waitForFunction(
    () =>
      sessionStorage.getItem('storyboard-session:https://lfvsimzmjhceyvjaoats.supabase.co') ===
      null,
  );
  assert.equal(
    await editor.page.evaluate(() =>
      sessionStorage.getItem('storyboard-session:https://lfvsimzmjhceyvjaoats.supabase.co'),
    ),
    null,
  );
  await editor.context.close();
  const viewer = await open('viewer');
  await viewer.page.locator('#projectSelect').selectOption(project.id);
  await viewer.page.waitForFunction(() =>
    document.getElementById('sharedStatus').textContent.includes('1 shots'),
  );
  await viewer.page.locator('#tab-people').click();
  await viewer.page.waitForFunction(() =>
    document.getElementById('productionStatus').textContent.includes('Project records loaded'),
  );
  await viewer.page.locator('#productionRecords button').first().click();
  assert.equal(await viewer.page.locator('#productionSave').isDisabled(), true);
  assert.equal(await viewer.page.locator('#production-name').isDisabled(), true);
  await viewer.page.locator('#tab-requirements').click();
  assert.equal(await viewer.page.locator('#resourcesSave').isDisabled(), true);
  assert.match(await viewer.page.locator('#projectResourcesTable').textContent(), /Radio/);
  await viewer.page.locator('#tab-storyboard').click();
  assert.equal(await viewer.page.locator('.desc').isDisabled(), true);
  assert.equal(await viewer.page.locator('.image-upload').isDisabled(), true);
  assert.equal(await viewer.page.locator('#cloudSave').isDisabled(), true);
  assert.equal(await viewer.page.locator('#ownerTools').isHidden(), true);
  await viewer.context.close();
  const stranger = await open('stranger');
  assert.equal(await stranger.page.locator('#projectSelect option').count(), 1);
  await stranger.context.close();
  // Only the provider opts into a separately authenticated ChatGPT/MCP session.
  siteIdentity = 'local-site-owner';
  const owner = await open('owner');
  await owner.page.locator('#ownerTools').waitFor({ state: 'visible' });
  await owner.page.locator('#ownerTools summary').click();
  await owner.page.locator('#ownerToolsPassword').fill('tools-password');
  await owner.page.locator('#ownerToolsForm button').click();
  await owner.page.waitForFunction(() =>
    document.getElementById('ownerToolsStatus').textContent.includes('are connected'),
  );
  assert.equal(objects.size, 1);
  assert.equal(ownerLinks, 1);
  const browserSession = await owner.page.evaluate(() =>
    JSON.parse(
      sessionStorage.getItem('storyboard-session:https://lfvsimzmjhceyvjaoats.supabase.co'),
    ),
  );
  assert.equal(browserSession.access_token, 'owner-access');
  const rpc = await owner.page.evaluate(async () => {
    const r = await fetch('/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'get_planning_gaps',
          arguments: { storyboard_id: '33333333-3333-4333-8333-333333333333' },
        },
      }),
    });
    return r.json();
  });
  assert.equal(rpc.result.structuredContent.total_shots, 1);
  const beforeImage = board.document.shots[0].imagePath;
  const populated = await owner.page.evaluate(async (revision) => {
    const response = await fetch('/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/call',
        params: {
          name: 'update_shots',
          arguments: {
            storyboard_id: '33333333-3333-4333-8333-333333333333',
            expected_revision: revision,
            updates: [
              {
                shot_id: 'shot-1',
                changes: {
                  location: 'Rural road',
                  cast: 'Casey',
                  props: 'Technical case',
                },
              },
            ],
          },
        },
      }),
    });
    return response.json();
  }, board.version);
  assert.equal(populated.result.structuredContent.changed, true);
  assert.equal(board.document.shots[0].location, 'Rural road');
  assert.equal(board.document.shots[0].props, 'Technical case');

  const edited = await owner.page.evaluate(async (revision) => {
    const r = await fetch('/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'update_shot',
          arguments: {
            storyboard_id: '33333333-3333-4333-8333-333333333333',
            shot_id: 'shot-1',
            expected_revision: revision,
            changes: {
              title: 'Closing frame',
              scene: 'EXT. RURAL ROAD – DAWN',
              description: 'The pickup drives into the sunrise.',
            },
          },
        },
      }),
    });
    return r.json();
  }, board.version);
  assert.equal(edited.result.structuredContent.changed, true);
  assert.equal(board.document.shots[0].imagePath, beforeImage);
  await owner.page.locator('#projectSelect').selectOption(project.id);
  await owner.page.waitForFunction(() =>
    document.getElementById('sharedStatus').textContent.includes('1 shots'),
  );
  assert.equal(
    await owner.page.locator('.desc').inputValue(),
    'The pickup drives into the sunrise.',
  );

  assert.equal(await owner.page.locator('.location').inputValue(), 'Rural road');
  assert.equal(await owner.page.locator('.props').inputValue(), 'Technical case');
  await owner.page.locator('#disconnectTools').click();
  await owner.page.waitForFunction(() =>
    document
      .getElementById('ownerToolsStatus')
      .textContent.includes('Confirm your storyboard password'),
  );
  assert.equal(objects.size, 0);
  await owner.context.close();
  siteIdentity = null;
  // Recovery cannot depend on the account-link endpoint or existing account vault.
  const recoveryContext = await browser.newContext();
  const reset = await recoveryContext.newPage();
  let linkAttempts = 0,
    passwordUpdates = 0,
    recoveryRequests = 0;
  let expired = false;
  await recoveryContext.route('**/api/account*', async (route) => {
    linkAttempts++;
    await route.fulfill({ status: 503, json: { message: 'Fixture account link unavailable' } });
  });
  await recoveryContext.route('https://**/*', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': '*',
    };
    if (req.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers });
      return;
    }
    if (url.pathname === '/auth/v1/recover') {
      recoveryRequests++;
      await route.fulfill({
        status: 429,
        headers,
        json: { code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' },
      });
      return;
    }
    if (url.pathname === '/auth/v1/user') {
      if (expired) {
        await route.fulfill({ status: 401, headers, json: { message: 'expired fixture' } });
        return;
      }
      assert.equal(req.headers().authorization, 'Bearer reset-fixture');
      if (req.method() === 'PUT') {
        assert.equal(req.postDataJSON().password, 'new-fixture-password');
        passwordUpdates++;
      }
      await route.fulfill({ headers, json: user });
      return;
    }
    await route.abort();
  });
  await reset.goto(
    origin + '/#access_token=reset-fixture&refresh_token=reset-refresh-fixture&type=recovery',
  );
  await reset.locator('#recoveryPassword').waitFor({ state: 'visible' });
  await reset.waitForFunction(() => !document.getElementById('recoveryPassword').disabled);
  assert.equal(new URL(reset.url()).hash, '');
  assert.equal(linkAttempts, 0);
  assert.equal(
    await reset.evaluate(() => JSON.stringify(sessionStorage).includes('reset-fixture')),
    false,
  );
  await reset.locator('#recoveryPassword').fill('new-fixture-password');
  await reset.locator('#recoveryConfirm').fill('different-password');
  await reset.locator('#updatePassword').click();
  await reset.waitForFunction(() =>
    document.getElementById('recoveryStatus').textContent.includes('do not match'),
  );
  assert.equal(passwordUpdates, 0);
  await reset.locator('#recoveryConfirm').fill('new-fixture-password');
  await reset.locator('#updatePassword').click();
  await reset.waitForFunction(() =>
    document.getElementById('recoveryStatus').textContent.includes('Password updated'),
  );
  assert.equal(passwordUpdates, 1);
  assert.equal(linkAttempts, 0);
  assert.equal(await reset.locator('#authForm').isVisible(), true);
  expired = true;
  await reset.goto(
    origin + '/#access_token=reset-fixture&refresh_token=reset-refresh-fixture&type=recovery',
  );
  await reset.waitForFunction(() =>
    document.getElementById('recoveryStatus').textContent.includes('expired'),
  );
  assert.equal(await reset.locator('#updatePassword').isDisabled(), true);
  assert.equal(new URL(reset.url()).hash, '');
  await reset.goto(origin + '/#error=access_denied&error_code=otp_expired&type=recovery');
  await reset.waitForFunction(() =>
    document.getElementById('recoveryStatus').textContent.includes('expired or incomplete'),
  );
  assert.equal(await reset.locator('#updatePassword').isDisabled(), true);
  await reset.locator('#accountEmail').fill(user.email);
  await reset.locator('#recover').click();
  await reset.waitForFunction(() =>
    document.getElementById('sharedStatus').textContent.includes('temporarily rate limited'),
  );
  assert.equal(recoveryRequests, 1);
  assert.equal(await reset.locator('#recover').isDisabled(), true);
  await recoveryContext.close();

  const planning = await open('owner');
  await planning.page.locator('#projectSelect').selectOption(project.id);
  await planning.page.waitForFunction(() =>
    document.getElementById('sharedStatus').textContent.includes('1 shots'),
  );
  await checkPlanningBrowser(planning.page, png);
  await planning.context.close();

  assert.deepEqual(errors, []);
  console.log(
    'Browser checks pass: no-ChatGPT editor login/upload/edit/save/reload, viewer read-only, uninvited isolation, owner-only independent MCP link/disconnect and text editing with preserved image, lost-save-response reconciliation, safe retry/draft preservation, and password recovery. APIs are mocked.',
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}

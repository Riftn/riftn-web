import test from 'node:test';
import assert from 'node:assert/strict';
import { AccountMcpAuth, validRedirect } from './account-mcp-auth.js';
import { accountTools, callAccountTool, handleAccountMcp, pkce, RESOURCE, ORIGIN, SCOPES } from './account-mcp.js';

const A = '0x' + 'a'.repeat(40), B = '0x' + 'b'.repeat(40);
const jobId = '9dbdd100-45bc-4a9c-a8c2-9ea19a933001';
class Storage {
  data = new Map(); queue = Promise.resolve();
  async get(key) { return structuredClone(this.data.get(key)); }
  async put(key, value) { this.data.set(key, structuredClone(value)); }
  async delete(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) this.data.delete(key); }
  async getAlarm() { return this.alarm; }
  async setAlarm(value) { this.alarm = value; }
  async list({ prefix = '', startAfter = '', limit = 1000 } = {}) { return new Map([...this.data].sort().filter(([key]) => key.startsWith(prefix) && key > startAfter).slice(0, limit)); }
  transaction(callback) { const next = this.queue.then(() => callback(this)); this.queue = next.catch(() => {}); return next; }
}
function fixture(extra) {
  const calls = [], store = new Storage();
  const sessions = [];
  const fetcher = async (url, init = {}) => {
    // The connector's own Riftn session is plumbing, kept out of `calls`.
    if (String(url).endsWith('/auth/connector-session')) {
      const token = new Headers(init.headers).get('Authorization')?.slice(7);
      sessions.push({ kind: 'issue', token });
      return Response.json({ status: true, token, refreshToken: `session-${token}-0` });
    }
    if (String(url).endsWith('/auth/refresh')) {
      const { refreshToken } = JSON.parse(init.body);
      sessions.push({ kind: 'refresh', refreshToken });
      const [, token, n] = /^session-(\w+)-(\d+)$/.exec(refreshToken);
      return Response.json({ status: true, accessToken: token, refreshToken: `session-${token}-${Number(n) + 1}` });
    }
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/auth/verify')) {
      const token = new Headers(init.headers).get('Authorization');
      return token === 'Bearer one' ? Response.json({ address: A }) : token === 'Bearer two' ? Response.json({ address: B }) : Response.json({ error: 'Invalid token' }, { status: 401 });
    }
    if (String(url).endsWith('/ai-quote')) return Response.json({ priceDhb: 100, priceUsd: 0.1 });
    if (extra) return extra(String(url), init);
    throw new Error(`Unexpected upstream request: ${url}`);
  };
  return { service: new AccountMcpAuth({ storage: store }, {}, fetcher), store, calls, sessions, fetcher };
}
const req = (path, method = 'GET', body, headers = {}) => new Request(ORIGIN + path, {
  method, headers: { ...(body && typeof body !== 'string' ? { 'Content-Type': 'application/json' } : {}), ...headers },
  ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
});
async function pending(f, { scope = SCOPES.join(' '), redirect = 'https://chatgpt.com/callback' } = {}) {
  const registration = await f.service.fetch(req('/mcp/oauth/register', 'POST', { client_name: 'Test chat', redirect_uris: [redirect], token_endpoint_auth_method: 'none' }));
  assert.equal(registration.status, 201);
  const { client_id } = await registration.json();
  const verifier = 'a'.repeat(64);
  const params = new URLSearchParams({ client_id, redirect_uri: redirect, resource: RESOURCE, response_type: 'code', code_challenge_method: 'S256', code_challenge: await pkce(verifier), scope, state: 'state with punctuation !' });
  const authorize = await f.service.fetch(req('/mcp/oauth/authorize?' + params));
  assert.equal(authorize.status, 302);
  const request_id = new URL(authorize.headers.get('Location')).searchParams.get('authorization');
  return { client_id, redirect, verifier, request_id, params };
}
async function approve(f, flow, token = 'one', approve = true) {
  return f.service.fetch(req('/mcp/oauth/approve', 'POST', { request_id: flow.request_id, approve }, { Origin: ORIGIN, 'x-dehub-token': token }));
}
async function exchange(f, flow, code, overrides = {}) {
  const body = new URLSearchParams({ grant_type: 'authorization_code', code, client_id: flow.client_id, redirect_uri: flow.redirect, code_verifier: flow.verifier, resource: RESOURCE, ...overrides });
  return f.service.fetch(req('/mcp/oauth/token', 'POST', body.toString()));
}
async function connect(f, options = {}, token = 'one') {
  const flow = await pending(f, options);
  const consent = await approve(f, flow, token);
  assert.equal(consent.status, 200);
  const redirect = new URL((await consent.json()).redirect);
  assert.equal(redirect.searchParams.get('state'), 'state with punctuation !');
  const code = redirect.searchParams.get('code');
  const exchanged = await exchange(f, flow, code);
  assert.equal(exchanged.status, 200);
  return { ...flow, code, ...await exchanged.json() };
}
const rpc = (f, name, args, token) => f.service.fetch(req('/mcp', 'POST', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, token ? { Authorization: `Bearer ${token}` } : {}));

test('OAuth metadata and tool descriptors are explicit about account scopes and writes', async () => {
  const metadata = await handleAccountMcp(req('/.well-known/oauth-protected-resource/mcp'), {});
  assert.equal((await metadata.json()).resource, RESOURCE);
  assert.equal(validRedirect('https://chatgpt.com/callback'), true);
  for (const bad of ['http://chatgpt.com/callback','https://user:pass@chatgpt.com/callback','https://chatgpt.com/callback#fragment','javascript:alert(1)']) assert.equal(validRedirect(bad), false);
  for (const { descriptor, scope } of accountTools) {
    assert.equal(descriptor.inputSchema.additionalProperties, false);
    assert.equal(descriptor.securitySchemes[0].type, scope ? 'oauth2' : 'noauth');
    for (const key of ['readOnlyHint','destructiveHint','openWorldHint']) assert.equal(typeof descriptor.annotations[key], 'boolean');
  }
  assert.equal(accountTools.find(t => t.name === 'dehub_update_profile').descriptor.annotations.destructiveHint, true);
});
test('expanded post controls declare the right access and reject untrusted input', async () => {
  for (const name of ['dehub_quote_post','dehub_edit_post','dehub_delete_post','dehub_post_visibility','dehub_reschedule_post','dehub_create_poll','dehub_vote_poll','dehub_add_post_images']) {
    const entry = accountTools.find(tool => tool.name === name);
    assert.equal(entry.scope, 'dehub:social', name);
    assert.equal(entry.descriptor.inputSchema.additionalProperties, false, name);
  }
  for (const name of ['dehub_post_stats','dehub_best_post_times','dehub_scheduled_posts','dehub_fans_online']) {
    assert.equal(accountTools.find(tool => tool.name === name).scope, 'dehub:read', name);
  }
  assert.equal(accountTools.find(tool => tool.name === 'dehub_poll').scope, null);
  const invalid = await callAccountTool('dehub_reschedule_post', { token_id: '42', scheduled_at: 'yesterday' }, { token: 'one', scopes: SCOPES });
  assert.equal(invalid.isError, true);
  const wrongScope = await callAccountTool('dehub_delete_post', { token_id: '42' }, { token: 'one', scopes: ['dehub:read'] });
  assert.equal(wrongScope.isError, true);
});
test('the feature guide covers the tool catalogue and uses Riftn links for app workflows', async () => {
  const { structuredContent: guide } = await callAccountTool('dehub_features', {}, {});
  const listed = guide.features.flatMap(feature => feature.tools);
  const registered = accountTools.map(tool => tool.name).filter(name => name !== 'dehub_features');
  assert.deepEqual(listed.sort(), registered.sort());
  for (const { url } of guide.in_app) assert.equal(new URL(url).origin, ORIGIN);
  assert.ok(guide.in_app.some(({ url }) => url === `${ORIGIN}/app/messages`));
  assert.ok(guide.in_app.some(({ url }) => url === `${ORIGIN}/app/wallet`));
});
test('bookmark changes use the authenticated folder routes and retry creation only once', async () => {
  const seen = [];
  const f = fixture((url, init) => {
    seen.push({ url: new URL(url), method: init.method, body: init.body && JSON.parse(init.body), token: new Headers(init.headers).get('Authorization') });
    return Response.json({ status: true, result: { id: 'folder-1' } });
  });
  const social = await connect(f, { scope: 'dehub:social' });
  const read = await connect(f, { scope: 'dehub:read' }, 'two');
  const args = { request_id: jobId, name: 'Watch later' };
  const call = async (name, input, token = social.access_token) => (await (await rpc(f, name, input, token)).json()).result;
  assert.equal((await call('dehub_create_bookmark_folder', args, read.access_token)).isError, true);
  await Promise.all([call('dehub_create_bookmark_folder', args), call('dehub_create_bookmark_folder', args)]);
  assert.equal((await call('dehub_create_bookmark_folder', args)).structuredContent.result.id, 'folder-1');
  assert.equal((await call('dehub_update_bookmark_folder', { folder_id: '.', is_public: true })).isError, true);
  assert.equal((await call('dehub_update_bookmark_folder', { folder_id: 'folder-1' })).isError, true);
  await call('dehub_update_bookmark_folder', { folder_id: 'folder-1', description: '', is_public: false });
  await call('dehub_remove_bookmark', { folder_id: 'folder-1', token_id: '42' });
  await call('dehub_delete_bookmark_folder', { folder_id: 'folder-1' });
  await call('dehub_public_playlists', { owner_wallet: A, playlist_id: 'folder-1', cursor: 'a+b' });
  assert.deepEqual(seen.map(row => [row.method, row.url.pathname, row.body, row.token]), [
    ['POST', '/api/bookmark-folders', { name: 'Watch later', isPublic: false }, 'Bearer one'],
    ['PUT', '/api/bookmark-folders/folder-1', { description: '', isPublic: false }, 'Bearer one'],
    ['DELETE', '/api/bookmark-folders/folder-1/items/42', undefined, 'Bearer one'],
    ['DELETE', '/api/bookmark-folders/folder-1', undefined, 'Bearer one'],
    ['GET', `/api/users/${A}/playlists/folder-1`, undefined, null],
  ]);
  assert.equal(seen.at(-1).url.searchParams.get('cursor'), 'a+b');
});
test('notifications and follow requests use the existing Riftn routes and require the correct scopes', async () => {
  const seen = [];
  const f = fixture((url, init) => {
    const path = new URL(url);
    seen.push([init.method, path.pathname + path.search]);
    if (path.pathname === '/api/follow-requests') {
      return Response.json({ items: [{ requestId: 'request-1', user: { username: 'friend', address: B }, requestedAt: '2026-01-01' }] });
    }
    return Response.json({ status: true });
  });
  const read = await connect(f, { scope: 'dehub:read' });
  const full = await connect(f, { scope: 'dehub:read dehub:social' });
  const call = async (name, input, grant) => (await (await rpc(f, name, input, grant.access_token)).json()).result;
  assert.equal((await call('dehub_decide_follow_request', { request_id: 'request-1', decision: 'accept' }, read)).isError, true);
  assert.equal((await call('dehub_mark_notifications_read', {}, read)).isError, true);
  const requests = await call('dehub_follow_requests', {}, read);
  assert.equal(requests.structuredContent.requests[0].request_id, 'request-1');
  await call('dehub_decide_follow_request', { request_id: 'request-1', decision: 'accept' }, full);
  await call('dehub_notifications', { category: 'social', unread_only: true, filtered: true }, read);
  await call('dehub_unread_notifications', {}, read);
  await call('dehub_mark_notifications_read', { category: 'social' }, full);
  assert.deepEqual(seen, [
    ['GET', '/api/follow-requests'],
    ['POST', '/api/follow-requests/request-1/accept'],
    ['GET', '/api/notification?page=1&limit=20&unreadOnly=true&category=social&filtered=true'],
    ['GET', '/api/notification/unread-count'],
    ['POST', '/api/notification/mark-all-read?category=social'],
  ]);
});
test('block and mute tools require newly granted moderation access and use the connected session', async () => {
  const seen = [];
  const f = fixture((url, init) => {
    seen.push([init.method, new URL(url).pathname, init.body && JSON.parse(init.body), new Headers(init.headers).get('Authorization')]);
    return Response.json({ status: true });
  });
  const existing = await connect(f, { scope: 'dehub:read dehub:social' });
  const full = await connect(f, { scope: 'dehub:moderation' }, 'two');
  const call = async (name, input, grant) => (await (await rpc(f, name, input, grant.access_token)).json()).result;
  const denied = await call('dehub_moderation_list', { type: 'mute' }, existing);
  assert.equal(denied.isError, true);
  assert.match(denied._meta['mcp/www_authenticate'][0], /scope="dehub:moderation"/);
  assert.equal((await call('dehub_set_moderation', { target_wallet: B, type: 'block', enabled: true }, full)).isError, true);
  await call('dehub_moderation_list', { type: 'block' }, full);
  await call('dehub_set_moderation', { target_wallet: A, type: 'block', enabled: true }, full);
  await call('dehub_set_moderation', { target_wallet: A, type: 'mute', enabled: false }, full);
  assert.deepEqual(seen, [
    ['GET', '/api/block', undefined, 'Bearer two'],
    ['POST', '/api/block', { address: A }, 'Bearer two'],
    ['DELETE', `/api/mute/${A}`, undefined, 'Bearer two'],
  ]);
});
test('signed-in feed, comments and co-authors go through Riftn access checks', async () => {
  const seen = [];
  const f = fixture((url, init) => {
    const endpoint = new URL(url);
    const token = new Headers(init.headers).get('Authorization');
    seen.push([init.method, endpoint.pathname + endpoint.search, init.body && JSON.parse(init.body), token]);
    if (endpoint.pathname === '/api/nft_info/42' && token !== 'Bearer one') {
      return Response.json({ error: 'Post not available to this viewer' }, { status: 404 });
    }
    return Response.json({ status: true });
  });
  const owner = await connect(f, { scope: 'dehub:read dehub:social' });
  const other = await connect(f, { scope: 'dehub:read' }, 'two');
  const call = async (name, input, grant = owner) => (await (await rpc(f, name, input, grant.access_token)).json()).result;
  assert.notEqual((await call('dehub_read_post_as_me', { token_id: '42' })).isError, true);
  assert.equal((await call('dehub_read_post_as_me', { token_id: '42' }, other)).isError, true);
  await call('dehub_my_feed', { following_only: true });
  await call('dehub_saved_posts', { page: 2 });
  await call('dehub_edit_comment', { comment_id: '123', content: 'Updated comment' });
  await call('dehub_delete_comment', { comment_id: '123' });
  await call('dehub_coauthors', { token_id: '42' });
  await call('dehub_invite_coauthor', { token_id: '42', user: '@friend' });
  await call('dehub_answer_coauthor_invite', { token_id: '42', accept: false });
  await call('dehub_remove_coauthor', { token_id: '42', target_wallet: B });
  assert.deepEqual(seen, [
    ['GET', '/api/nft_info/42', undefined, 'Bearer one'],
    ['GET', '/api/nft_info/42', undefined, 'Bearer two'],
    ['GET', '/api/feed?page=1&limit=20&sortBy=createdAt&sortOrder=desc&status=all&followingOnly=true', undefined, 'Bearer one'],
    ['GET', '/api/savedPosts?page=2&limit=20', undefined, 'Bearer one'],
    ['POST', '/api/edit_comment', { commentId: '123', content: 'Updated comment' }, 'Bearer one'],
    ['DELETE', '/api/delete_comment', { commentId: 123 }, 'Bearer one'],
    ['GET', '/api/nft/42/co-authors', undefined, 'Bearer one'],
    ['POST', '/api/nft/42/co-authors', { user: '@friend' }, 'Bearer one'],
    ['POST', '/api/nft/42/co-authors/respond', { accept: false }, 'Bearer one'],
    ['DELETE', `/api/nft/42/co-authors/${B}`, undefined, 'Bearer one'],
  ]);
});
test('post drafts stay private to the connected account and can be edited or deleted', async () => {
  const f = fixture();
  const one = await connect(f, { scope: 'dehub:read dehub:social' });
  const two = await connect(f, { scope: 'dehub:read dehub:social' }, 'two');
  const draft_id = '9dbdd100-45bc-4a9c-a8c2-9ea19a933002';
  const save = await (await rpc(f, 'dehub_save_draft', { draft_id, content: 'First', title: 'Keep this title', category: 'Music' }, one.access_token)).json();
  assert.equal(save.result.structuredContent.content, 'First');
  await rpc(f, 'dehub_save_draft', { draft_id, content: 'Edited' }, one.access_token);
  const own = await (await rpc(f, 'dehub_drafts', {}, one.access_token)).json();
  const other = await (await rpc(f, 'dehub_drafts', {}, two.access_token)).json();
  assert.equal(own.result.structuredContent.drafts[0].content, 'Edited');
  assert.equal(own.result.structuredContent.drafts[0].title, 'Keep this title');
  assert.equal(own.result.structuredContent.drafts[0].category, 'Music');
  assert.deepEqual(other.result.structuredContent.drafts, []);
  await rpc(f, 'dehub_delete_draft', { draft_id }, one.access_token);
  assert.deepEqual((await (await rpc(f, 'dehub_drafts', {}, one.access_token)).json()).result.structuredContent.drafts, []);
});
test('a post retry keeps its result without spending a second daily slot', async () => {
  let created = 0;
  const f = fixture(async (url) => {
    if (url.endsWith('/user_mint')) { created++; return Response.json({ result: { createdTokenId: '42' } }); }
    throw new Error(`Unexpected upstream request: ${url}`);
  });
  const c = await connect(f, { scope: 'dehub:social' });
  const { DAILY_LIMITS } = await import('./account-mcp.js');
  const before = DAILY_LIMITS.post;
  DAILY_LIMITS.post = 1;
  try {
    const args = { request_id: jobId, content: 'One post' };
    const first = await (await rpc(f, 'dehub_create_post', args, c.access_token)).json();
    const retry = await (await rpc(f, 'dehub_create_post', args, c.access_token)).json();
    assert.equal(first.result.structuredContent.token_id, '42');
    assert.equal(retry.result.structuredContent.token_id, '42');
    assert.equal(created, 1);
    const next = await (await rpc(f, 'dehub_create_post', { request_id: '9dbdd100-45bc-4a9c-a8c2-9ea19a933003', content: 'Another' }, c.access_token)).json();
    assert.match(next.result.structuredContent.error, /Daily limit/);
  } finally { DAILY_LIMITS.post = before; }
});
test('a connected account can publish an inline chat image without an external URL', async () => {
  let upload;
  const f = fixture(async (url, init) => {
    if (url.endsWith('/user_mint')) { upload = init.body; return Response.json({ result: { createdTokenId: '42' } }); }
    throw new Error(`Unexpected upstream request: ${url}`);
  });
  const connected = await connect(f, { scope: 'dehub:social' });
  const result = await (await rpc(f, 'dehub_create_post', { request_id: jobId, content: 'Image post', image_data_url: 'data:image/png;base64,iVBORw0KGgo=', media_type: 'image' }, connected.access_token)).json();
  assert.equal(result.result.structuredContent.token_id, '42');
  assert.equal(upload.get('postType'), 'feed-images');
  assert.equal(upload.get('file').type, 'image/png');
});
test('opening /mcp in a browser lands on the connect guide; chat apps still get the MCP reply', async () => {
  const f = fixture();
  const page = await f.service.fetch(req('/mcp', 'GET', undefined, { Accept: 'text/html,application/xhtml+xml' }));
  assert.equal(page.status, 302);
  assert.equal(page.headers.get('Location'), `${ORIGIN}/connect`);
  assert.equal((await f.service.fetch(req('/mcp', 'GET', undefined, { Accept: 'text/event-stream' }))).status, 405);
});
test('anonymous private access returns a linking challenge without calling backend', async () => {
  const f = fixture();
  const response = await rpc(f, 'dehub_account', {});
  const { result } = await response.json();
  assert.equal(result.isError, true);
  assert.match(result._meta['mcp/www_authenticate'][0], /resource_metadata/);
  assert.equal(f.calls.length, 0);
});
test('OAuth validates exact redirect, PKCE, resource, one-use code and returns no underlying session', async () => {
  const f = fixture();
  const flow = await pending(f);
  const altered = new URLSearchParams(flow.params); altered.set('redirect_uri', 'https://evil.example/callback');
  const bad = await f.service.fetch(req('/mcp/oauth/authorize?' + altered));
  assert.equal(bad.status, 400); assert.equal(bad.headers.get('Location'), null);
  const consent = await approve(f, flow);
  const redirect = new URL((await consent.json()).redirect), code = redirect.searchParams.get('code');
  assert.equal((await exchange(f, flow, code, { code_verifier: 'b'.repeat(64) })).status, 400);
  assert.equal((await exchange(f, flow, code, { resource: 'https://other.example/mcp' })).status, 400);
  const response = await exchange(f, flow, code), raw = await response.text();
  assert.equal(response.status, 200); assert.equal(raw.includes('"one"'), false);
  assert.match(JSON.parse(raw).access_token, /^dhm_[a-f0-9]{64}$/);
  assert.equal((await exchange(f, flow, code)).status, 400);
});
test('consent is tied to verified identity and the Riftn browser origin', async () => {
  const f = fixture(), flow = await pending(f);
  const foreign = await f.service.fetch(req('/mcp/oauth/approve', 'POST', { request_id: flow.request_id, approve: true }, { Origin: 'https://evil.example', 'x-dehub-token': 'one' }));
  assert.equal(foreign.status, 403);
  const mismatch = await f.service.fetch(req('/mcp/oauth/approve', 'POST', { request_id: flow.request_id, approve: true }, { Origin: ORIGIN, 'x-dehub-token': 'one', 'x-wallet-address': B }));
  assert.equal(mismatch.status, 403);
  const denied = await approve(f, flow, 'one', false), target = new URL((await denied.json()).redirect);
  assert.equal(target.searchParams.get('error'), 'access_denied');
  assert.equal(target.searchParams.has('code'), false);
});
test('read-only grants cannot update a profile; unknown wallet arguments are rejected', async () => {
  const f = fixture(), connection = await connect(f, { scope: 'dehub:read' });
  const response = await rpc(f, 'dehub_update_profile', { bio: 'New bio' }, connection.access_token);
  assert.equal((await response.json()).result.isError, true);
  const result = await callAccountTool('dehub_creator_library', { wallet: B }, { token: 'one', scopes: SCOPES });
  assert.equal(result.isError, true);
  assert.equal(f.calls.filter(c => !c.url.endsWith('/auth/verify')).length, 0);
});
test('refresh tokens rotate, keep resource binding and cannot outlive grant revocation', async () => {
  const f = fixture(), c = await connect(f);
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: c.refresh_token, client_id: c.client_id, resource: RESOURCE });
  const refreshed = await f.service.fetch(req('/mcp/oauth/token', 'POST', body.toString()));
  assert.equal(refreshed.status, 200);
  assert.equal((await f.service.fetch(req('/mcp/oauth/token', 'POST', body.toString()))).status, 400);
  const list = await f.service.fetch(req('/mcp/oauth/connections', 'POST', {}, { Origin: ORIGIN, 'x-dehub-token': 'one' }));
  const connection = (await list.json()).connections[0];
  assert.equal(typeof connection.id, 'string'); assert.equal(connection.token, undefined);
  await f.service.fetch(req('/mcp/oauth/disconnect', 'POST', { id: connection.id }, { Origin: ORIGIN, 'x-dehub-token': 'two' }));
  assert.equal((await f.service.bearer(req('/mcp', 'GET', undefined, { Authorization: `Bearer ${c.access_token}` }))).wallet, A);
  await f.service.fetch(req('/mcp/oauth/disconnect', 'POST', { id: connection.id }, { Origin: ORIGIN, 'x-dehub-token': 'one' }));
  assert.equal((await rpc(f, 'dehub_account', {}, c.access_token)).status, 401);
});
test('invalid bearer credentials fail closed even for public calls', async () => {
  const f = fixture();
  assert.equal((await rpc(f, 'dehub_feed', {}, 'garbage')).status, 401);
  assert.equal(f.calls.length, 0);
});
test('generation uses verified account, original payment guards and deduplicates concurrent retries', async () => {
  let starts = 0;
  const f = fixture((url, init) => {
    if (url.endsWith('/generate-video')) {
      const body = JSON.parse(init.body);
      if (body.predictionId) return Response.json({ status: 'succeeded', videoUrl: 'https://media.example/result.mp4' });
      starts++;
      assert.equal(init.headers['x-dehub-token'], 'one'); assert.equal(init.headers['x-wallet-address'], A);
      assert.equal(body.txHash, 'credits'); assert.equal(body.clientJobId, jobId);
      assert.equal(body.duration, '5s');
      return Response.json({ predictionId: 'trusted-ticket', provider: 'fal', falAppId: 'trusted-app' });
    }
    throw new Error(url);
  });
  const c = await connect(f), other = await connect(f, {}, 'two');
  const args = { request_id: jobId, kind: 'video', model_id: 'kling-3-turbo-standard', prompt: 'A tree in the wind', payment: 'credits', duration_seconds: 5, max_price_dhb: 100 };
  const responses = await Promise.all([rpc(f, 'dehub_generate_content', args, c.access_token), rpc(f, 'dehub_generate_content', args, c.access_token)]);
  assert.equal(starts, 1);
  for (const response of responses) assert.equal((await response.json()).result.isError, undefined);
  const stranger = await rpc(f, 'dehub_generation_status', { job_id: jobId }, other.access_token);
  assert.equal((await stranger.json()).result.isError, true);
  const changed = await rpc(f, 'dehub_generate_content', { ...args, prompt: 'Different prompt' }, c.access_token);
  assert.equal((await changed.json()).result.isError, true); assert.equal(starts, 1);
  const status = await rpc(f, 'dehub_generation_status', { job_id: jobId }, c.access_token);
  assert.equal((await status.json()).result.structuredContent.status, 'succeeded');
});
test('ambiguous generation errors cannot cause a second paid submission', async () => {
  let starts = 0;
  const f = fixture(() => { starts++; throw new Error('Connection lost'); });
  const c = await connect(f), args = { request_id: jobId, kind: 'image', model_id: 'flux-2-pro', prompt: 'A portrait', payment: 'credits', max_price_dhb: 100 };
  for (let i = 0; i < 2; i++) { const response = await rpc(f, 'dehub_generate_content', args, c.access_token); assert.equal((await response.json()).result.isError, true); }
  assert.equal(starts, 1);
});
test('media input rejects arbitrary hosts, credentials and wallet spoofing', async () => {
  for (const url of ['http://127.0.0.1/secret', 'https://evil.example/image.png', 'https://user:pass@aigxuutjaqsywioxjefr.supabase.co/storage/image']) {
    const response = await callAccountTool('dehub_update_profile', { avatar_url: url }, { token: 'one', scopes: SCOPES });
    assert.equal(response.isError, true);
  }
  const response = await callAccountTool('dehub_create_post', { request_id: jobId, content: 'test', wallet: B }, { token: 'one', scopes: SCOPES });
  assert.equal(response.isError, true);
});
test('a price change cannot spend above the agreed maximum', async () => {
  let generations = 0;
  const f = fixture(() => { generations++; throw new Error('Generation must not run'); });
  const c = await connect(f);
  const response = await rpc(f, 'dehub_generate_content', { request_id: jobId, kind: 'image', model_id: 'flux-2-pro', prompt: 'A portrait', payment: 'credits', max_price_dhb: 50 }, c.access_token);
  assert.equal((await response.json()).result.isError, true);
  assert.equal(generations, 0);
});
test('expired connections are rejected and old records are collected', async () => {
  const f = fixture(), c = await connect(f);
  for (const [key, value] of f.store.data) if (key.startsWith('grant:')) value.expires = Date.now() - 1;
  assert.equal((await rpc(f, 'dehub_account', {}, c.access_token)).status, 401);
  await f.service.alarm();
  assert.equal([...f.store.data.keys()].some(key => key.startsWith('grant:')), false);
});
test('chat apps that send a client secret method or no resource can still connect', async () => {
  const f = fixture();
  const redirect = 'https://claude.ai/api/mcp/auth_callback';
  const registration = await f.service.fetch(req('/mcp/oauth/register', 'POST', { client_name: 'Chat app', redirect_uris: [redirect], token_endpoint_auth_method: 'client_secret_post' }));
  assert.equal(registration.status, 201);
  const { client_id, token_endpoint_auth_method } = await registration.json();
  assert.equal(token_endpoint_auth_method, 'none');
  const verifier = 'a'.repeat(64);
  const params = new URLSearchParams({ client_id, redirect_uri: redirect, response_type: 'code', code_challenge_method: 'S256', code_challenge: await pkce(verifier) });
  const authorize = await f.service.fetch(req('/mcp/oauth/authorize?' + params));
  assert.equal(authorize.status, 302);
  const flow = { client_id, redirect, verifier, request_id: new URL(authorize.headers.get('Location')).searchParams.get('authorization') };
  const code = new URL((await (await approve(f, flow)).json()).redirect).searchParams.get('code');
  const body = new URLSearchParams({ grant_type: 'authorization_code', code, client_id, redirect_uri: redirect, code_verifier: verifier, resource: RESOURCE + '/' });
  const token = await f.service.fetch(req('/mcp/oauth/token', 'POST', body.toString()));
  assert.equal(token.status, 200);
});
test('a connection keeps working past the 15 minute Riftn token by rotating its own session once', async () => {
  const f = fixture();
  const c = await connect(f, { scope: 'dehub:read' });
  assert.deepEqual(f.sessions, [{ kind: 'issue', token: 'one' }]);
  const [grantKey] = [...f.store.data.keys()].filter(key => key.startsWith('grant:'));
  const grant = f.store.data.get(grantKey);
  assert.equal(grant.value.session, 'session-one-0');
  assert.ok(grant.expires - Date.now() > 29 * 24 * 3600000);
  grant.value.at = Date.now() - 20 * 60000;
  const [a, b] = await Promise.all([f.service.bearer(new Request(ORIGIN + '/mcp', { headers: { Authorization: `Bearer ${c.access_token}` } })),
    f.service.bearer(new Request(ORIGIN + '/mcp', { headers: { Authorization: `Bearer ${c.access_token}` } }))]);
  assert.equal(a.session, 'session-one-1'); assert.equal(b.session, 'session-one-1');
  assert.equal(f.sessions.filter(s => s.kind === 'refresh').length, 1);
});

const C = '0x' + 'c'.repeat(40);
const auth = init => new Headers(init.headers).get('Authorization');
test('riftn.com and dehub.io both serve the connector, each bound to its own address', async () => {
  for (const origin of ['https://riftn.com', 'https://dehub.io']) {
    const meta = await handleAccountMcp(new Request(`${origin}/.well-known/oauth-protected-resource/mcp`), {});
    assert.equal((await meta.json()).resource, `${origin}/mcp`);
    const server = await (await handleAccountMcp(new Request(`${origin}/.well-known/oauth-authorization-server`), {})).json();
    assert.equal(server.issuer, origin);
    assert.equal(server.token_endpoint, `${origin}/mcp/oauth/token`);
  }
  assert.equal((await handleAccountMcp(new Request('https://evil.example/mcp'), {})).status, 404);
  // A dehub.io authorization cannot be exchanged as riftn.com (and the reverse).
  const f = fixture(), flow = await pending(f);
  assert.equal(new URL((await f.service.fetch(req('/mcp/oauth/authorize?' + flow.params))).headers.get('Location')).origin, 'https://riftn.com');
  const consent = await approve(f, flow);
  const code = new URL((await consent.json()).redirect).searchParams.get('code');
  const body = new URLSearchParams({ grant_type: 'authorization_code', code, client_id: flow.client_id, redirect_uri: flow.redirect, code_verifier: flow.verifier });
  assert.equal((await f.service.fetch(new Request('https://dehub.io/mcp/oauth/token', { method: 'POST', body: body.toString() }))).status, 400);
  // Old dehub.io pages may still approve.
  const old = await pending(f);
  const legacy = await f.service.fetch(req('/mcp/oauth/approve', 'POST', { request_id: old.request_id, approve: true }, { Origin: 'https://dehub.io', 'x-dehub-token': 'one' }));
  assert.equal(legacy.status, 200);
});
test('personal keys: made on the site, shown once, work as a bearer, listed and revocable', async () => {
  const f = fixture(async (url, init) => {
    if (url.endsWith('/account_info/' + A)) return Response.json({ result: { username: 'alice', _id: 'u1' } });
    throw new Error(`Unexpected upstream request: ${url}`);
  });
  const make = (body, headers = { Origin: ORIGIN, 'x-dehub-token': 'one' }) => f.service.fetch(req('/mcp/oauth/keys', 'POST', body, headers));
  assert.equal((await make({ name: 'Bot', scopes: ['dehub:read'] }, { Origin: 'https://evil.example', 'x-dehub-token': 'one' })).status, 403);
  assert.equal((await make({ name: 'Bot', scopes: ['admin'] })).status, 400);
  const created = await make({ name: 'My bot', scopes: ['dehub:read'] });
  assert.equal(created.status, 201);
  const { key, id } = await created.json();
  assert.match(key, /^dhk_[a-f0-9]{64}$/);
  assert.ok(![...f.store.data.keys()].some(k => k.includes(key)), 'the key itself is never stored');
  const account = await (await rpc(f, 'dehub_account', {}, key)).json();
  assert.equal(account.result.structuredContent.username, 'alice');
  const write = await (await rpc(f, 'dehub_update_profile', { bio: 'x' }, key)).json();
  assert.equal(write.result.isError, true);
  const list = await (await f.service.fetch(req('/mcp/oauth/connections', 'POST', {}, { Origin: ORIGIN, 'x-dehub-token': 'one' }))).json();
  assert.equal(list.connections[0].kind, 'key');
  assert.equal(list.connections[0].hint, key.slice(-4));
  // Someone else cannot remove it; the owner can.
  await f.service.fetch(req('/mcp/oauth/disconnect', 'POST', { id }, { Origin: ORIGIN, 'x-dehub-token': 'two' }));
  assert.equal((await rpc(f, 'dehub_account', {}, key)).status, 200);
  await f.service.fetch(req('/mcp/oauth/disconnect', 'POST', { id }, { Origin: ORIGIN, 'x-dehub-token': 'one' }));
  assert.equal((await rpc(f, 'dehub_account', {}, key)).status, 401);
});
test('acting as an agent needs the agents permission and a server-issued session for an owned agent', async () => {
  const sessions = [];
  const f = fixture(async (url, init) => {
    if (url.endsWith('/my-agents/helper/session')) { sessions.push(auth(init)); return Response.json({ status: true, token: 'agent', address: C, username: 'helper' }); }
    if (url.endsWith('/my-agents/stranger/session')) return Response.json({ statusCode: 404, message: 'That is not one of your agents.' }, { status: 404 });
    if (url.endsWith('/my-agents')) return Response.json({ status: true, result: [{ address: C, username: 'helper', displayName: 'Helper' }] });
    if (url.includes('/request_follow')) return Response.json({ status: true, auth: auth(init), body: JSON.parse(init.body) });
    if (url.endsWith('/account_info/' + B)) return Response.json({ result: { isFollowing: false } });
    throw new Error(`Unexpected upstream request: ${url}`);
  });
  const social = await connect(f, { scope: 'dehub:read dehub:social' });
  const blocked = await (await rpc(f, 'dehub_follow', { target_wallet: B, action: 'follow', as_agent: 'helper' }, social.access_token)).json();
  assert.equal(blocked.result.isError, true);
  assert.match(blocked.result._meta['mcp/www_authenticate'][0], /dehub:agents/);
  assert.equal(sessions.length, 0);
  const full = await connect(f, { scope: 'dehub:read dehub:social dehub:agents' });
  const agents = await (await rpc(f, 'dehub_my_agents', {}, full.access_token)).json();
  assert.equal(agents.result.structuredContent.agents[0].username, 'helper');
  const followed = await (await rpc(f, 'dehub_follow', { target_wallet: B, action: 'follow', as_agent: '@helper' }, full.access_token)).json();
  assert.equal(followed.result.structuredContent.auth, 'Bearer agent');
  assert.equal(followed.result.structuredContent.acting_as.address, C);
  assert.deepEqual(sessions, ['Bearer one']);
  const stranger = await (await rpc(f, 'dehub_follow', { target_wallet: B, action: 'follow', as_agent: 'stranger' }, full.access_token)).json();
  assert.equal(stranger.result.isError, true);
  assert.equal(f.store.data.get(`rate:day:follow:${A}`)?.value, 1);
  // The tool input can never pick a wallet to act as.
  assert.equal((await callAccountTool('dehub_follow', { target_wallet: B, action: 'follow', as_agent: B, wallet: C }, { token: 'one', scopes: SCOPES })).isError, true);
});
test('writes stop at the daily limit, counted across the account and its agents', async () => {
  const f = fixture(async (url, init) => {
    if (url.endsWith('/my-agents/helper/session')) return Response.json({ status: true, token: 'agent', address: C, username: 'helper' });
    if (url.includes('/account_info/')) return Response.json({ result: { isFollowing: false } });
    if (url.includes('/request_follow')) return Response.json({ status: true });
    throw new Error(`Unexpected upstream request: ${url}`);
  });
  const c = await connect(f);
  const { DAILY_LIMITS } = await import('./account-mcp.js');
  const before = DAILY_LIMITS.follow;
  DAILY_LIMITS.follow = 2;
  try {
    assert.equal((await (await rpc(f, 'dehub_follow', { target_wallet: B, action: 'follow' }, c.access_token)).json()).result.isError, undefined);
    assert.equal((await (await rpc(f, 'dehub_follow', { target_wallet: B, action: 'follow', as_agent: 'helper' }, c.access_token)).json()).result.isError, undefined);
    const third = await (await rpc(f, 'dehub_follow', { target_wallet: B, action: 'follow' }, c.access_token)).json();
    assert.equal(third.result.isError, true);
    assert.match(third.result.structuredContent.error, /Daily limit/);
  } finally { DAILY_LIMITS.follow = before; }
});
test('repost checks the current state and never toggles by accident', async () => {
  let reposted = true, posts = 0;
  const f = fixture(async (url) => {
    if (url.endsWith('/nft_info/42')) return Response.json({ result: { tokenId: 42, isReposted: reposted } });
    if (url.endsWith('/repost')) { posts++; reposted = !reposted; return Response.json({ status: true, reposted, repostCount: 3 }); }
    throw new Error(`Unexpected upstream request: ${url}`);
  });
  const c = await connect(f);
  const again = await (await rpc(f, 'dehub_repost', { token_id: '42' }, c.access_token)).json();
  assert.equal(again.result.structuredContent.skipped, true);
  const undo = await (await rpc(f, 'dehub_repost', { token_id: '42', action: 'undo' }, c.access_token)).json();
  assert.equal(undo.result.structuredContent.reposted, false);
  assert.equal(posts, 1);
});

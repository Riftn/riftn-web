import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { IMAGE_COST_USD, VIDEO_COST_USD, MODEL3D_COST_USD, TOOL_COST_USD, quotePriceDhb, dhbToUsd } from '../supabase/functions/_shared/ai-pricing.ts';
import { CREATOR_FAL_VIDEO_MODELS } from '../supabase/functions/_shared/creator-fal-catalog.ts';

// riftn.com is the home of the connector. dehub.io keeps answering so apps
// linked before the move (and the published ChatGPT app) keep working.
export const ORIGIN = 'https://riftn.com';
export const LEGACY_ORIGIN = 'https://dehub.io';
export const MCP_ORIGINS = [ORIGIN, LEGACY_ORIGIN];
export const RESOURCE = `${ORIGIN}/mcp`;
/** The origin a request came in on: dehub.io or riftn.com. */
export const originOf = url => new URL(url).hostname === 'dehub.io' ? LEGACY_ORIGIN : ORIGIN;
export const resourceOf = url => `${originOf(url)}/mcp`;
const EDGE = 'https://aigxuutjaqsywioxjefr.supabase.co/functions/v1';
export const API = 'https://api.dehub.io/api';
export const SCOPES = ['dehub:read', 'dehub:profile', 'dehub:social', 'dehub:generate', 'dehub:agents'];
// Writes per day for one person, counted across their own account and all their agents.
export const DAILY_LIMITS = { post: 50, comment: 300, reaction: 1000, follow: 200, repost: 200, profile: 30 };
const text = (max = 2000) => z.string().trim().min(1).max(max);
const id = z.string().regex(/^\d{1,15}$/);
const wallet = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const media = z.string().url().max(4096).refine(value => {
  const u = new URL(value);
  // Fetch only Riftn's media hosts. Never fetch caller-selected internal URLs.
  return u.protocol === 'https:' && !u.username && !u.password && !u.port &&
    ['dehubcdn.ams3.cdn.digitaloceanspaces.com', 'aigxuutjaqsywioxjefr.supabase.co'].includes(u.hostname);
}, 'Use a media URL from your Riftn library or uploads.');
const page = z.number().int().min(1).max(1000).default(1);
const limit = z.number().int().min(1).max(50).default(20);
const enc = encodeURIComponent;
const unwrap = value => value?.result ?? value;
const success = payload => ({ content: [{ type: 'text', text: JSON.stringify(payload) }], structuredContent: payload });
const failure = (message, extra = {}) => ({ ...success({ error: message, ...extra }), isError: true });
export const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
});
export const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
export const random = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
export const pkce = async value => {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
};

export async function readJson(response) {
  let data;
  try { data = await response.json(); } catch { throw new Error(`Service returned HTTP ${response.status} without a JSON result.`); }
  if (!response.ok || data?.error || data?.status === false || data?.result === false) {
    const error = new Error(String(data.error || data.message || `Service returned HTTP ${response.status}`).slice(0, 500));
    error.status = response.status;
    error.details = Object.fromEntries(['code', 'priceDhb', 'paymentRestored'].filter(k => data[k] !== undefined).map(k => [k, data[k]]));
    throw error;
  }
  return data;
}
export async function verifySession(token, fetcher = fetch) {
  const result = await readJson(await fetcher(`${API}/auth/verify`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(12000) }));
  const address = typeof result.address === 'string' ? result.address.toLowerCase() : '';
  if (!/^0x[a-f0-9]{40}$/.test(address)) throw new Error('Invalid Riftn session. Sign in again.');
  return address;
}
async function api(ctx, path, method = 'GET', body) {
  return readJson(await ctx.fetch(`${API}${path}`, { method,
    headers: { ...(ctx.token ? { Authorization: `Bearer ${ctx.token}` } : {}), ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    redirect: 'manual', signal: AbortSignal.timeout(25000),
  }));
}
export async function edge(ctx, name, body) {
  return readJson(await ctx.fetch(`${EDGE}/${name}`, { method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/json', 'x-dehub-token': ctx.token, 'x-wallet-address': ctx.wallet },
    body: JSON.stringify(body),
  }));
}
async function file(ctx, url, kind, maxBytes = 12 * 1024 * 1024) {
  const response = await ctx.fetch(media.parse(url), { redirect: 'manual', signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error('Could not download the Riftn media.');
  const mime = (response.headers.get('Content-Type') || '').split(';')[0];
  if (!mime.startsWith(`${kind}/`)) throw new Error(`Expected ${kind} media.`);
  if (Number(response.headers.get('Content-Length')) > maxBytes) throw new Error('Media is too large for a chat upload. Use Riftn to publish it.');
  const reader = response.body.getReader(), chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error('Media is too large for a chat upload. Use Riftn to publish it.');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return new Blob(chunks, { type: mime });
}
function inlineImage(value) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length > 5_600_000) throw new Error('Provide a PNG, JPEG or WebP data URL under 4 MB.');
  const bytes = Uint8Array.from(atob(match[2]), character => character.charCodeAt(0));
  if (bytes.length > 4 * 1024 * 1024) throw new Error('Image is too large.');
  return new Blob([bytes], { type: match[1] });
}

const tools = [];
const asAgent = z.string().trim().toLowerCase().regex(/^@?[a-z0-9_.-]{1,60}$/).optional()
  .describe('Act as one of your agents (its @username, from dehub_my_agents) instead of your own account. Needs the agents permission.');
function tool(name, title, description, shape, scope, handler, { destructive = false, open = false, read = false, idempotent = false, profile = false, agents = false, cap = null } = {}) {
  const schema = z.object(agents ? { ...shape, as_agent: asAgent } : shape).strict();
  const securitySchemes = scope ? [{ type: 'oauth2', scopes: [scope] }] : [{ type: 'noauth' }];
  tools.push({ name, scope, schema, handler, agents, cap, descriptor: { name, title, description,
    inputSchema: zodToJsonSchema(schema, { $refStrategy: 'none' }),
    ...(profile ? { outputSchema: { type: 'object', properties: { id: { type: 'string', minLength: 1, pattern: '\\S' }, name: { type: 'string' }, nickname: { type: 'string' } }, required: ['id'], additionalProperties: false } } : {}),
    annotations: { readOnlyHint: read, destructiveHint: destructive, openWorldHint: open, idempotentHint: idempotent },
    securitySchemes, _meta: { securitySchemes, ...(profile ? { 'openai/profile': true } : {}) },
  } });
}

tool('dehub_features', 'Discover Riftn account controls', 'List the chat controls available for each Riftn feature and open the app for features that need its editor, live media or wallet signatures.', {}, null, async () => success({
  endpoint: RESOURCE,
  features: [
    { feature: 'Profile and privacy', tools: ['dehub_account','dehub_update_profile'] },
    { feature: 'Posts and conversations', tools: ['dehub_feed','dehub_post','dehub_search','dehub_my_posts','dehub_save_draft','dehub_drafts','dehub_delete_draft','dehub_create_post','dehub_quote_post','dehub_edit_post','dehub_delete_post','dehub_post_visibility','dehub_post_stats','dehub_best_post_times','dehub_scheduled_posts','dehub_reschedule_post','dehub_fans_online','dehub_create_poll','dehub_poll','dehub_vote_poll','dehub_remove_poll_vote','dehub_close_poll','dehub_post_image_allowance','dehub_add_post_images','dehub_replace_post_image','dehub_replace_video_cover','dehub_comments','dehub_comment','dehub_set_reaction','dehub_repost'] },
    { feature: 'Your agents', tools: ['dehub_my_agents'], note: 'Pass as_agent to post, reply, react, repost, follow, edit the profile or read notifications as one of your agents.' },
    { feature: 'Social and notifications', tools: ['dehub_follow','dehub_follow_list','dehub_notifications','dehub_mark_notification_read'] },
    { feature: 'Bookmarks', tools: ['dehub_bookmark_folders','dehub_bookmark_items','dehub_save_bookmark'] },
    { feature: 'Creator Studio', tools: ['dehub_creator_models','dehub_quote_generation','dehub_generate_content','dehub_generation_status','dehub_creator_library'], url: `${ORIGIN}/creator` },
  ],
  in_app: [
    { feature: 'Encrypted messages', url: `${ORIGIN}/app/messages`, reason: 'Messages require the account keys held by the app.' },
    { feature: 'Timeline editing and live recording', url: `${ORIGIN}/editor`, reason: 'Use the editor for interactive editing and capture.' },
    { feature: 'Wallet transfers, minting and staking', url: `${ORIGIN}/app`, reason: 'Approve blockchain signatures in your wallet.' },
    { feature: 'Create or set up agents', url: `${ORIGIN}/app/agents`, reason: 'Make new agents and set their autonomous behaviour in the app.' },
  ],
  daily_limits: DAILY_LIMITS,
}), { read: true });

// Public reads continue through the existing server, including its view accounting.
for (const [name, title, shape] of [
  ['dehub_feed', 'Browse Riftn posts', { sort: z.enum(['new','hot','trending','discussed']).optional(), category: text(100).optional(), search: text(200).optional(), limit, offset: z.number().int().min(0).max(10000).default(0) }],
  ['dehub_post', 'Read a Riftn post', { token_id: id }],
  ['dehub_comments', 'Read post comments', { token_id: id, limit, page: z.number().int().min(0).max(1000).default(0) }],
  ['dehub_search', 'Search posts and people', { query: text(200), type: z.enum(['all','posts','users']).default('all'), limit }],
  ['dehub_profile', 'Look up a public profile', { user: text(100) }],
]) tool(name, title, `${title}. Public information; no account linking required.`, shape, null, async (args, ctx) => {
  const response = await ctx.fetch(`${EDGE}/dehub-mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) });
  if (!response.ok) throw new Error(`Public Riftn lookup returned HTTP ${response.status}.`);
  const raw = (await response.text()).trim();
  const frame = raw.startsWith('{') ? raw : raw.split(/\r?\n/).filter(line => line.startsWith('data:')).at(-1)?.slice(5).trim();
  const result = JSON.parse(frame || '{}');
  if (result.error || !result.result) throw new Error('Public Riftn lookup failed.');
  return result.result;
}, { open: true, read: true });

tool('dehub_account', 'Get my connected Riftn account', 'Identify the connected account and read its profile. Use before changing a profile or publishing to confirm the active identity.', {}, 'dehub:read', async (_, ctx) => {
  const p = unwrap(await api(ctx, `/account_info/${ctx.wallet}`));
  return success({ id: ctx.wallet, display_name: p.displayName || p.username || ctx.wallet, username: p.username,
    profile: p, url: `${ORIGIN}/${enc(p.username || ctx.wallet)}`, granted_scopes: ctx.scopes });
}, { read: true, agents: true });

tool('dehub_connected_profile', 'Identify the linked Riftn profile', 'Return the immutable identity and display label of the profile represented by this request\'s validated credentials.', {}, 'dehub:read', async (_, ctx) => {
  const p = unwrap(await api(ctx, `/account_info/${ctx.wallet}`));
  const profileId = p?._id ?? p?.id;
  if (!['string','number'].includes(typeof profileId) || !String(profileId).trim()) throw new Error('The connected profile has no persistent identity.');
  return success({ id: String(profileId), name: p.displayName || p.username || ctx.wallet, ...(p.username ? { nickname: `@${p.username}` } : {}) });
}, { read: true, profile: true });

tool('dehub_update_profile', 'Update my Riftn profile', 'Change only the connected person\'s profile: bio, display name, username, avatar or cover. Images must come from Riftn uploads or the Creator library. Overwrites the selected profile fields.', {
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{1,30}$/).optional(), bio: z.string().max(2000).optional(), display_name: text(100).optional(),
  is_private: z.boolean().optional(), hide_badge_and_balance: z.boolean().optional(), hide_followers: z.boolean().optional(),
  avatar_url: media.optional(), banner_url: media.optional(),
}, 'dehub:profile', async (a, ctx) => {
  if (!Object.keys(a).length) throw new Error('Provide at least one profile field.');
  if (a.username) {
    const current = unwrap(await api(ctx, `/account_info/${ctx.wallet}`));
    if (a.username !== current.username) {
      const availability = await api(ctx, `/username/check?username=${enc(a.username)}`);
      if (availability.available !== true) throw new Error('Username is taken or reserved. Choose another.');
    }
  }
  const form = new FormData();
  for (const [key, field] of [['username','username'],['bio','aboutMe'],['display_name','displayName']]) if (a[key] !== undefined) form.set(field, a[key]);
  if (a.is_private !== undefined) form.set('isPrivate', String(a.is_private));
  if (a.hide_badge_and_balance !== undefined) form.set('hideBadgeAndBalance', String(a.hide_badge_and_balance));
  if (a.hide_followers !== undefined) form.set('hideFollowers', String(a.hide_followers));
  if (a.avatar_url) form.set('avatarImg', await file(ctx, a.avatar_url, 'image'), 'avatar.png');
  if (a.banner_url) form.set('coverImg', await file(ctx, a.banner_url, 'image'), 'cover.png');
  await api(ctx, '/update_profile', 'POST', form);
  const profile = unwrap(await api(ctx, `/account_info/${ctx.wallet}`));
  const verified = !a.avatar_url && !a.banner_url && (!a.username || profile.username === a.username) && (a.bio === undefined || profile.aboutMe === a.bio) && (!a.display_name || profile.displayName === a.display_name)
    && (a.is_private === undefined || profile.isPrivate === a.is_private) && (a.hide_badge_and_balance === undefined || profile.hideBadgeAndBalance === a.hide_badge_and_balance)
    && (a.hide_followers === undefined || profile.hideFollowers === a.hide_followers);
  return success({ saved: true, verified, profile, url: `${ORIGIN}/${enc(profile.username || ctx.wallet)}`, ...(verified ? {} : { message: 'Save accepted; the profile read has not reflected all changes yet. Read the account again before retrying.' }) });
}, { destructive: true, open: true, agents: true, cap: 'profile' });

tool('dehub_my_posts', 'List my posts', 'Read the connected account\'s own published posts.', { page, limit }, 'dehub:read', async (a, ctx) => success(await api(ctx, `/myPosts?page=${a.page}&limit=${a.limit}`)), { read: true, agents: true });
tool('dehub_save_draft', 'Save a post draft', 'Save or replace a private connector draft by ID. Drafts are available to this account through MCP for 180 days after the last edit.', { draft_id: z.string().uuid(), content: text(500), title: text(150).optional(), category: text(100).optional() }, 'dehub:social', async (a, ctx) => success(await ctx.drafts('save', { id: a.draft_id, content: a.content, title: a.title, category: a.category })), { idempotent: true });
tool('dehub_drafts', 'List my post drafts', 'Read private drafts saved through this account connector.', {}, 'dehub:read', async (_, ctx) => success({ drafts: await ctx.drafts('list') }), { read: true });
tool('dehub_delete_draft', 'Delete a post draft', 'Delete a private connector draft by ID.', { draft_id: z.string().uuid() }, 'dehub:social', async (a, ctx) => success(await ctx.drafts('delete', { id: a.draft_id })), { destructive: true, idempotent: true });
tool('dehub_create_post', 'Publish a Riftn post', 'Publish or schedule an ordinary text, image or video post as the connected person. Requires an explicit request to publish. Does not mint or sign blockchain transactions. Reuse request_id on retries. Video needs a thumbnail.', {
  request_id: z.string().uuid(), content: text(500), title: text(150).optional(), media_url: media.optional(), media_urls: z.array(media).min(2).max(10).optional(), image_data_url: z.string().max(5_600_030).optional(), media_type: z.enum(['image','video']).optional(), thumbnail_url: media.optional(), category: text(100).default('General'), scheduled_at: z.string().datetime({ offset: true }).optional(), visibility: z.enum(['public','followers','direct']).optional(), reply_policy: z.enum(['public','followers','following','mentioned']).optional(), quote_policy: z.enum(['public','followers','nobody']).optional(),
}, 'dehub:social', async (a, ctx) => ctx.once('post', a.request_id, a, async () => {
  if ([a.media_url, a.media_urls, a.image_data_url].filter(Boolean).length > 1) throw new Error('Use only one media source.');
  if (!!(a.media_url || a.media_urls || a.image_data_url) !== !!a.media_type) throw new Error('Provide media and media_type together.');
  if (a.image_data_url && a.media_type !== 'image') throw new Error('Inline image requires image media type.');
  if (a.media_urls && a.media_type !== 'image') throw new Error('Multiple media URLs require image type.');
  if (a.media_type === 'video' && !a.thumbnail_url) throw new Error('Video posts need a thumbnail.');
  if (a.scheduled_at && Date.parse(a.scheduled_at) <= Date.now()) throw new Error('scheduled_at must be in the future.');
  const form = new FormData();
  for (const [key, value] of Object.entries({ name: a.title && !a.content.startsWith(a.title) ? a.title : ' ', description: a.content,
    postType: a.media_url || a.media_urls || a.image_data_url ? a.media_type === 'video' ? 'video' : 'feed-images' : 'feed-simple', chainId: '8453',
    category: JSON.stringify([a.category]), minter: ctx.wallet, mintOptOut: 'true', idempotencyKey: a.request_id,
    streamInfo: JSON.stringify({ isLockContent: false, isPayPerView: false, isAddBounty: false }) })) form.set(key, value);
  if (a.scheduled_at) form.set('scheduledAt', a.scheduled_at);
  if (a.visibility && a.visibility !== 'public') form.set('visibility', a.visibility);
  if (a.reply_policy && a.reply_policy !== 'public') form.set('replyPolicy', a.reply_policy);
  if (a.quote_policy && a.quote_policy !== 'public') form.set('quotePolicy', a.quote_policy);
  if (a.media_urls) for (const url of a.media_urls) form.append('file', await file(ctx, url, 'image'), 'image.png');
  if (a.image_data_url) form.append('file', inlineImage(a.image_data_url), 'image.png');
  if (a.media_url) {
    form.append('file', await file(ctx, a.media_url, a.media_type, a.media_type === 'video' ? 64 * 1024 * 1024 : undefined), a.media_type === 'video' ? 'video.mp4' : 'image.png');
    form.set('media_type', a.media_type);
    if (a.thumbnail_url) form.append('file', await file(ctx, a.thumbnail_url, 'image'), 'thumbnail.png');
  }
  const result = unwrap(await api(ctx, '/user_mint', 'POST', form));
  if (!result?.createdTokenId) throw new Error('Publication outcome is unknown. Read your posts before retrying.');
  return success({ published: !a.scheduled_at, scheduled: !!a.scheduled_at, scheduled_at: a.scheduled_at || null, minted: false, token_id: result.createdTokenId, url: `${ORIGIN}/app/post/${result.createdTokenId}` });
}), { open: true, agents: true, cap: 'post' });
tool('dehub_quote_post', 'Quote a post', 'Publish an ordinary quote post with your commentary. Reuse request_id on retries.', { request_id: z.string().uuid(), quoted_token_id: id, content: text(500), category: text(100).default('General') }, 'dehub:social', async (a, ctx) => ctx.once('post', a.request_id, a, async () => {
  const form = new FormData();
  for (const [key, value] of Object.entries({ quotedTokenId: a.quoted_token_id, name: ' ', description: a.content, postType: 'feed-simple', category: JSON.stringify([a.category]), chainId: '8453', minter: ctx.wallet, mintOptOut: 'true', idempotencyKey: a.request_id, streamInfo: JSON.stringify({}) })) form.set(key, value);
  const result = unwrap(await api(ctx, '/quote_post', 'POST', form));
  if (!result?.createdTokenId) throw new Error('Quote outcome is unknown. Read your posts before retrying.');
  return success({ published: true, minted: false, token_id: result.createdTokenId, url: `${ORIGIN}/app/post/${result.createdTokenId}` });
}), { open: true, agents: true, cap: 'post' });
tool('dehub_edit_post', 'Edit my post', 'Edit text, category, content warning, or reply and quote rules on a post you own.', {
  token_id: id, title: text(150).optional(), content: text(2000).optional(), category: text(100).optional(), spoiler_text: z.string().max(300).optional(), comments_disabled: z.boolean().optional(), reply_policy: z.enum(['public','followers','following','mentioned']).optional(), quote_policy: z.enum(['public','followers','nobody']).optional(),
}, 'dehub:social', async (a, ctx) => {
  const body = Object.fromEntries(Object.entries({ name: a.title, description: a.content, category: a.category ? [a.category] : undefined, spoilerText: a.spoiler_text, commentsDisabled: a.comments_disabled, replyPolicy: a.reply_policy, quotePolicy: a.quote_policy }).filter(([, v]) => v !== undefined));
  if (!Object.keys(body).length) throw new Error('Provide at least one field to edit.');
  return success(await api(ctx, `/nft/${a.token_id}`, 'PATCH', body));
}, { destructive: true, open: true, agents: true });
tool('dehub_delete_post', 'Delete my post', 'Permanently delete a post you own. Requires an explicit request to delete.', { token_id: id }, 'dehub:social', async (a, ctx) => success(await api(ctx, `/nft/${a.token_id}`, 'DELETE')), { destructive: true, open: true, agents: true });
tool('dehub_post_visibility', 'Show or hide my post', 'Set a post you own to public or hidden. Hidden posts are not shown in public feeds.', { token_id: id, visibility: z.enum(['public','hidden']) }, 'dehub:social', async (a, ctx) => success(await api(ctx, '/token_visibility', 'POST', { id: Number(a.token_id), isHidden: a.visibility === 'hidden' })), { destructive: true, open: true, agents: true, idempotent: true });
tool('dehub_post_stats', 'Read my post analytics', 'Read reach, retention, engagement and follower impact for a post you own.', { token_id: id }, 'dehub:read', async (a, ctx) => success(await api(ctx, `/post-stats/${a.token_id}`)), { read: true, agents: true });
tool('dehub_best_post_times', 'See best posting times', 'Read the account audience activity grid by UTC hour.', {}, 'dehub:read', async (_, ctx) => success(await api(ctx, '/post-stats/best-times')), { read: true, agents: true });
tool('dehub_scheduled_posts', 'List my scheduled posts', 'List posts waiting for publication.', {}, 'dehub:read', async (_, ctx) => success(await api(ctx, '/scheduled_posts')), { read: true, agents: true });
tool('dehub_reschedule_post', 'Move a scheduled post', 'Change the publication time of your scheduled post; use now to publish promptly.', { token_id: id, scheduled_at: z.union([z.literal('now'), z.string().datetime({ offset: true })]) }, 'dehub:social', async (a, ctx) => success(await api(ctx, `/scheduled_posts/${a.token_id}`, 'PATCH', { scheduledAt: a.scheduled_at })), { destructive: true, open: true, agents: true });
tool('dehub_fans_online', 'See when followers are online', 'Read the follower activity grid by UTC hour to plan a scheduled post.', {}, 'dehub:read', async (_, ctx) => success(await api(ctx, '/scheduled_posts/fans_online')), { read: true, agents: true });
tool('dehub_create_poll', 'Attach a poll to my post', 'Add a poll to a post you own. A post can have only one poll.', { token_id: id, question: text(300), options: z.array(text(100)).min(2).max(10), expires_at: z.string().datetime({ offset: true }).optional(), multiple_choice: z.boolean().default(false) }, 'dehub:social', async (a, ctx) => success(await api(ctx, '/poll', 'POST', { tokenId: Number(a.token_id), question: a.question, options: a.options, expiresAt: a.expires_at, isMultipleChoice: a.multiple_choice })), { open: true, agents: true });
tool('dehub_poll', 'Read a post poll', 'Read the poll attached to a post.', { token_id: id }, null, async (a, ctx) => success(await api(ctx, `/poll/${a.token_id}`)), { read: true });
tool('dehub_vote_poll', 'Vote in a poll', 'Submit one or more option indexes to a post poll.', { token_id: id, option_indexes: z.array(z.number().int().min(0).max(9)).min(1).max(10) }, 'dehub:social', async (a, ctx) => success(await api(ctx, `/poll/${a.token_id}/vote`, 'POST', { optionIndexes: a.option_indexes })), { open: true, agents: true });
tool('dehub_remove_poll_vote', 'Remove my poll vote', 'Remove the connected account vote on a post poll.', { token_id: id }, 'dehub:social', async (a, ctx) => success(await api(ctx, `/poll/${a.token_id}/vote`, 'DELETE')), { destructive: true, open: true, agents: true });
tool('dehub_close_poll', 'Close my poll', 'Close a poll attached to a post you own.', { token_id: id }, 'dehub:social', async (a, ctx) => success(await api(ctx, `/poll/${a.token_id}/close`, 'POST')), { destructive: true, open: true, agents: true });
tool('dehub_post_image_allowance', 'Check post image allowance', 'Read how many images a post can hold.', { token_id: id }, 'dehub:read', async (a, ctx) => success(await api(ctx, `/nft/${a.token_id}/image-allowance`)), { read: true, agents: true });
tool('dehub_add_post_images', 'Add images to my post', 'Append images from Riftn media URLs to a post you own.', { token_id: id, media_urls: z.array(media).min(1).max(10) }, 'dehub:social', async (a, ctx) => {
  const form = new FormData();
  for (const url of a.media_urls) form.append('images', await file(ctx, url, 'image'), 'image.png');
  return success(await api(ctx, `/nft/${a.token_id}/images`, 'POST', form));
}, { open: true, agents: true });
tool('dehub_replace_post_image', 'Replace a post image', 'Replace an image in a post you own by its zero-based index.', { token_id: id, index: z.number().int().min(0).max(19), media_url: media }, 'dehub:social', async (a, ctx) => {
  const form = new FormData(); form.append('image', await file(ctx, a.media_url, 'image'), 'image.png');
  return success(await api(ctx, `/nft/${a.token_id}/images/${a.index}`, 'POST', form));
}, { destructive: true, open: true, agents: true });
tool('dehub_replace_video_cover', 'Replace my video cover', 'Set the thumbnail of a video post you own.', { token_id: id, media_url: media }, 'dehub:social', async (a, ctx) => {
  const form = new FormData(); form.append('thumbnail', await file(ctx, a.media_url, 'image'), 'cover.png');
  return success(await api(ctx, `/nft/${a.token_id}/thumbnail`, 'POST', form));
}, { destructive: true, open: true, agents: true });
tool('dehub_comment', 'Comment or reply', 'Publish a comment or threaded reply as the connected person. Read the thread first. Reuse request_id on retries.', {
  request_id: z.string().uuid(), token_id: id, content: text(2000), reply_to_comment_id: id.optional(),
}, 'dehub:social', async (a, ctx) => ctx.once('comment', a.request_id, a, async () => success(await api(ctx, '/request_comment', 'POST', {
  streamTokenId: Number(a.token_id), content: a.content, ...(a.reply_to_comment_id ? { commentId: Number(a.reply_to_comment_id) } : {}),
}))), { open: true, agents: true, cap: 'comment' });
tool('dehub_follow', 'Follow or unfollow a person', 'Set the connected account\'s follow relationship. Checks the existing relationship before changing it.', {
  target_wallet: wallet, action: z.enum(['follow','unfollow']),
}, 'dehub:social', async (a, ctx) => {
  const p = unwrap(await api(ctx, `/account_info/${enc(a.target_wallet)}`));
  const follows = p.isFollowing === true || p.isFollowRequestPending === true;
  if ((a.action === 'follow') === follows) return success({ success: true, skipped: true });
  return success(await api(ctx, '/request_follow', 'POST', { following: a.target_wallet, ...(a.action === 'unfollow' ? { unFollowing: true } : {}) }));
}, { open: true, agents: true, cap: 'follow' });
tool('dehub_follow_list', 'Read followers or following', 'List the connected account\'s followers or followed accounts.', { type: z.enum(['followers','following']), page, limit }, 'dehub:read', async (a, ctx) => success(await api(ctx, `/follow_list/${ctx.wallet}?type=${a.type}&page=${a.page}&limit=${a.limit}`)), { read: true, agents: true });
tool('dehub_agent_welcomes', 'See my agents\' new member welcomes', 'List the agents the connected person owns, whether each follows and/or messages new members, its welcome text, daily number and what it did today.', {}, 'dehub:read', async (_, ctx) => success(await api(ctx, '/agent-welcome')), { read: true });
tool('dehub_set_agent_welcome', 'Make my agent welcome new members', 'Switch one of the connected person\'s agents to follow and/or message people who just joined Riftn, or switch it off. The message is the person\'s own text ({name} becomes the new member\'s @username, no links). per_day is 1-10 (default 3); the agent never welcomes the same person twice and skips anyone who blocked or muted them, turned off new messages or hid from New members.', {
  agent: text(60), follow: z.boolean().optional(), message: z.boolean().optional(), text: z.string().max(500).optional(), per_day: z.number().int().min(1).max(10).optional(),
}, 'dehub:social', async (a, ctx) => success(await api(ctx, `/agent-welcome/${enc(a.agent)}`, 'POST', { follow: a.follow, message: a.message, text: a.text, perDay: a.per_day })), { open: true, idempotent: true });
tool('dehub_agent_welcome_log', 'Read my agent\'s welcome log', 'Who one of the connected person\'s agents followed or messaged as a welcome, and who it skipped and why.', { agent: text(60) }, 'dehub:read', async (a, ctx) => success(await api(ctx, `/agent-welcome/${enc(a.agent)}/log`)), { read: true });
tool('dehub_set_reaction', 'Set or remove my post reaction', 'Set one reaction on a post, or remove it with reaction=null. Checks the current reaction so an existing reaction is not accidentally toggled off. Reuse request_id on retries.', {
  request_id: z.string().uuid(), token_id: id, reaction: z.enum(['like','love','respect','hot','hundred','lol','sad','cry','poo','dislike']).nullable(),
}, 'dehub:social', async (a, ctx) => ctx.once('reaction', a.request_id, a, async () => {
  const current = unwrap(await api(ctx, `/post-reactions?tokenId=${a.token_id}`));
  const reaction = current.myReaction ?? null;
  if (reaction === a.reaction) return success({ success: true, skipped: true, reaction });
  const next = a.reaction || reaction;
  return success(await api(ctx, `/request_reaction?reaction=${enc(next)}`, 'POST', { streamTokenId: Number(a.token_id), reaction: next }));
}), { open: true, agents: true, cap: 'reaction' });
tool('dehub_my_agents', 'List my agents', 'List the agents the connected person owns. Pass one of their usernames as as_agent to post, reply, react, repost, follow, edit its profile or read its notifications. Only your own agents are listed; you can never act as anyone else.', {}, 'dehub:agents', async (_, ctx) => {
  const agents = unwrap(await api(ctx, '/my-agents'));
  return success({ agents: (Array.isArray(agents) ? agents : []).map(a => ({ username: a.username, display_name: a.displayName || a.username, address: a.address, url: `${ORIGIN}/${enc(a.username || a.address)}` })),
    daily_limits: DAILY_LIMITS, create_url: `${ORIGIN}/app/agents` });
}, { read: true });
tool('dehub_repost', 'Repost or undo a repost', 'Repost a post to the profile of the connected person (or one of their agents), or undo it. Checks the current state first so nothing toggles by accident.', {
  token_id: id, action: z.enum(['repost','undo']).default('repost'),
}, 'dehub:social', async (a, ctx) => {
  const post = unwrap(await api(ctx, `/nft_info/${a.token_id}`));
  if (!post || post.tokenId === undefined && post.isReposted === undefined) throw new Error('Post not found.');
  if (!!post.isReposted === (a.action === 'repost')) return success({ success: true, skipped: true, reposted: !!post.isReposted });
  const result = await api(ctx, '/repost', 'POST', { tokenId: Number(a.token_id) });
  return success({ success: true, reposted: !!result.reposted, repost_count: result.repostCount, url: `${ORIGIN}/app/post/${a.token_id}` });
}, { open: true, idempotent: true, agents: true, cap: 'repost' });
tool('dehub_notifications', 'Read my notifications', 'Read the connected account\'s notifications. Reading does not mark them as read.', { page, limit, unread_only: z.boolean().default(false) }, 'dehub:read', async (a, ctx) => success(await api(ctx, `/notification?page=${a.page}&limit=${a.limit}&unreadOnly=${a.unread_only}`)), { read: true, agents: true });
tool('dehub_mark_notification_read', 'Mark a notification as read', 'Mark one of the connected account\'s notifications as read.', { notification_id: text(100) }, 'dehub:social', async (a, ctx) => success(await api(ctx, `/notification/${enc(a.notification_id)}`, 'PATCH', {})), { idempotent: true, agents: true });
tool('dehub_bookmark_folders', 'List my bookmark folders', 'Read the connected account\'s bookmark folders and playlists.', {}, 'dehub:read', async (_, ctx) => success(await api(ctx, '/bookmark-folders')), { read: true });
tool('dehub_bookmark_items', 'Read a bookmark folder', 'Read posts saved in a folder accessible to the connected account.', { folder_id: text(100), page, limit }, 'dehub:read', async (a, ctx) => success(await api(ctx, `/bookmark-folders/${enc(a.folder_id)}/items?page=${a.page}&limit=${a.limit}`)), { read: true });
tool('dehub_save_bookmark', 'Save a post to a folder', 'Save a post in an existing bookmark folder owned by the connected account.', { folder_id: text(100), token_id: id }, 'dehub:social', async (a, ctx) => success(await api(ctx, `/bookmark-folders/${enc(a.folder_id)}/items`, 'POST', { tokenId: Number(a.token_id) })));

tool('dehub_creator_models', 'Explore Creator Studio models', 'Discover image, video, audio and 3D model IDs and current prices from the same catalogue as Riftn web and mobile. Quote the chosen options before generating.', { kind: z.enum(['image','video','model3d','audio']) }, null, async a => {
  const costs = a.kind === 'image' ? IMAGE_COST_USD : a.kind === 'video' ? VIDEO_COST_USD : a.kind === 'model3d' ? MODEL3D_COST_USD : Object.fromEntries(['ace-step','minimax-music','dia-tts'].map(key => [key, TOOL_COST_USD[key]]));
  return success({ kind: a.kind, models: Object.keys(costs).map(model_id => {
    const v = CREATOR_FAL_VIDEO_MODELS[model_id];
    const options = v ? { durationSeconds: v.defaultDuration } : {};
    const price_dhb = quotePriceDhb(a.kind === 'audio' ? 'tool' : a.kind, model_id, options);
    return { model_id, price_dhb, price_usd: price_dhb === null ? null : dhbToUsd(price_dhb),
      ...(v ? { name: v.name, supports: v.supports, default_duration: v.defaultDuration, min_duration: v.minDuration, max_duration: v.maxDuration, allowed_durations: v.allowedDurations, aspect_ratios: v.aspectRatios, resolutions: v.resolutions } : {}),
      free_starter_eligible: a.kind === 'image' && IMAGE_COST_USD[model_id] <= 0.02 };
  }), creator_url: `${ORIGIN}/creator` });
}, { read: true });
tool('dehub_quote_generation', 'Quote a content generation', 'Get the current server price before spending credits or DHB. This does not generate or charge anything.', {
  kind: z.enum(['image','video','model3d','audio']), model_id: text(150), duration_seconds: z.number().min(1).max(600).optional(), quality: z.enum(['none','standard','HD']).optional(),
}, null, async (a, ctx) => success(await edge(ctx, 'ai-quote', { kind: a.kind === 'audio' ? 'tool' : a.kind, modelId: a.model_id, durationSeconds: a.duration_seconds, quality: a.quality })), { read: true });
tool('dehub_generate_content', 'Generate content in Creator Studio', 'Create an image, video, 3D model or music using the connected account\'s existing Creator service. Quote first, obtain the person\'s agreement to the cost, then choose credits, a confirmed DHB transfer, or an eligible free starter image. Reuse request_id on retries. Returns a job immediately for queued renders. Never publish automatically. Results use the same library as web and mobile.', {
  request_id: z.string().uuid(), kind: z.enum(['image','video','model3d','audio']), model_id: text(150), prompt: text(10000),
  payment: z.enum(['credits','transfer','free']), tx_hash: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
  max_price_dhb: z.number().finite().min(0).describe('Maximum DHB-equivalent price the person agreed to after seeing the quote. Use 0 for an eligible free image.'),
  source_image: media.optional(), aspect_ratio: z.enum(['21:9','16:9','4:3','1:1','3:4','9:16']).optional(),
  duration_seconds: z.number().int().min(1).max(600).optional(), resolution: text(30).optional(),
  quality: z.enum(['none','standard','HD']).optional().describe('3D texture quality; must match the quoted quality'),
}, 'dehub:generate', async (a, ctx) => {
  if (a.payment === 'transfer' && !a.tx_hash) throw new Error('Provide the confirmed DHB transfer hash.');
  if (a.payment !== 'transfer' && a.tx_hash) throw new Error('A transfer hash is only valid with transfer payment.');
  if (a.payment === 'free' && (a.kind !== 'image' || !(IMAGE_COST_USD[a.model_id] <= 0.02))) throw new Error('Only eligible starter image models accept free payment.');
  if (a.kind === 'audio' && !['ace-step','minimax-music','dia-tts'].includes(a.model_id)) throw new Error('Choose an audio model from dehub_creator_models.');
  if (quotePriceDhb(a.kind === 'audio' ? 'tool' : a.kind, a.model_id, { durationSeconds: a.duration_seconds }) === null) throw new Error('Unknown model. Read dehub_creator_models first.');
  return ctx.generate(a);
}, { destructive: true });
tool('dehub_generation_status', 'Check one of my content jobs', 'Read a job started through this connection. Call once when requested; if still running, return its state and avoid repeated polling. Does not create or charge another generation.', { job_id: z.string().uuid() }, 'dehub:read', async (a, ctx) => ctx.generationStatus(a.job_id), { read: true });
tool('dehub_creator_library', 'Read my Creator library', 'Read the connected account\'s saved images, videos, audio and 3D assets, shared with web and mobile. Media links expire; request the library again when needed.', { offset: z.number().int().min(0).max(10000).default(0) }, 'dehub:read', async (a, ctx) => success(await edge(ctx, 'creator-library', { action: 'list', offset: a.offset })), { read: true });

export const accountTools = tools;
const authError = scope => failure(scope === 'dehub:agents' ? 'Reconnect Riftn and allow "Act as your agents" to use this.' : 'Link your Riftn account to use this tool.', { connect_url: `${ORIGIN}/connect` });
export function challenge(scope = 'dehub:read', origin = ORIGIN) {
  return `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource", scope="${scope}"`;
}
export async function callAccountTool(name, input, ctx) {
  const t = tools.find(item => item.name === name);
  if (!t) return failure('Unknown Riftn tool.');
  let args;
  try { args = t.schema.parse(input); } catch (error) { return failure('Invalid tool arguments.', { issues: error.issues?.map(({ path, message }) => ({ path, message })) }); }
  const needs = [t.scope, ...(args.as_agent ? ['dehub:agents'] : [])].filter(Boolean);
  const missing = needs.find(scope => !ctx.token || !ctx.scopes?.includes(scope));
  if (missing) return { ...authError(missing), _meta: { 'mcp/www_authenticate': [challenge(missing, ctx.origin)] } };
  try {
    if (t.cap && ctx.spend && !await ctx.spend(t.cap)) return failure(`Daily limit reached: ${DAILY_LIMITS[t.cap]} ${t.cap === 'reaction' ? 'reactions' : t.cap === 'profile' ? 'profile edits' : `${t.cap}s`} a day across your account and agents. Try again tomorrow.`, { limit: DAILY_LIMITS[t.cap] });
    let run = ctx;
    if (args.as_agent) {
      // The server checks ownership and hands out a short session for that agent only.
      run = { ...ctx, ...await ctx.agent(args.as_agent.replace(/^@/, '')) };
      // Retries are matched per acting account, so one request_id can never post as two agents.
      run.once = (kind, id, input, operation) => ctx.once(kind, id, { ...input, acting_as: run.wallet }, operation);
    }
    const { as_agent, ...rest } = args;
    const output = await t.handler(rest, run);
    return as_agent && output?.structuredContent && !output.isError
      ? success({ ...output.structuredContent, acting_as: { username: run.agentUsername, address: run.wallet } }) : output;
  } catch (error) {
    return { ...failure(error.message || 'Riftn could not complete this request.', error.details),
      ...([401,403].includes(error.status) ? { _meta: { 'mcp/www_authenticate': [challenge(t.scope, ctx.origin)] } } : {}) };
  }
}

export function isAccountMcpRoute(path) {
  return path === '/mcp' || path.startsWith('/mcp/') || path === '/.well-known/oauth-protected-resource' || path === '/.well-known/oauth-protected-resource/mcp' || path === '/.well-known/oauth-authorization-server' || path === '/.well-known/oauth-authorization-server/mcp';
}
export async function handleAccountMcp(request, env) {
  const url = new URL(request.url);
  if (url.hostname !== 'dehub.io' && url.hostname !== 'riftn.com') return json({ error: `Use ${RESOURCE}` }, 404);
  const origin = originOf(url), resource = `${origin}/mcp`;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, MCP-Protocol-Version, MCP-Session-Id', 'Access-Control-Expose-Headers': 'WWW-Authenticate' } });
  if (url.pathname.startsWith('/.well-known/oauth-protected-resource')) return json({ resource, authorization_servers: [origin], scopes_supported: SCOPES, bearer_methods_supported: ['header'], resource_name: 'Riftn account' });
  if (url.pathname.startsWith('/.well-known/oauth-authorization-server')) return json({ issuer: origin, authorization_endpoint: `${resource}/oauth/authorize`, token_endpoint: `${resource}/oauth/token`, registration_endpoint: `${resource}/oauth/register`, revocation_endpoint: `${resource}/oauth/revoke`, scopes_supported: SCOPES, response_types_supported: ['code'], grant_types_supported: ['authorization_code','refresh_token'], token_endpoint_auth_methods_supported: ['none'], code_challenge_methods_supported: ['S256'] });
  if (!env.ACCOUNT_MCP) return json({ error: 'Account connection is unavailable.' }, 503);
  try { return await env.ACCOUNT_MCP.get(env.ACCOUNT_MCP.idFromName('account-mcp-v1')).fetch(request); }
  catch { return json({ error: 'Riftn connection is temporarily unavailable.' }, 503); }
}

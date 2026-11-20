/**
 * Monolith share cards for the pages that had no picture of their own: an
 * event with no cover, a community with no avatar or banner, a clip with no
 * poster, a DEX token with no logo, and a co-stream guest invite. Each one
 * used to unfurl as the plain brand card.
 *
 * Same grid as the post cards (see post-share-card.js): brand chrome backdrop,
 * a chrome object on the right, the name on the column foot, one footer row.
 * Every card is drawn from a row the worker reads with the anon key, never
 * from the URL, so nobody can make riftn.com draw words of their choosing.
 */
import { M, ctaPill, monolithFrame, statRow, textLines, wrapBold, wrapPostText } from './post-share-card.js';

export const ENTITY_CARD_VERSION = 'v1';
export const ENTITY_KINDS = ['event', 'community', 'clip', 'dex', 'costream'];
const ORIGIN = 'https://riftn.com';

const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
const clean = (v) => String(v ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
const count = (v) => Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : 0;

/** The card's URL. A DEX id is `<chain>~<token>`. */
export function entityShareImageUrl(kind, id) {
  return `${ORIGIN}/_og/${kind}/${ENTITY_CARD_VERSION}/${encodeURIComponent(String(id))}.png`;
}

/** The chrome object drawn on the right of each kind (public/brand-kit/icons). */
export const ENTITY_ART = { event: 'calendar', community: 'globe', clip: 'play', dex: 'coin', costream: 'camera' };

const DEX_CHAINS = { base: 'Base', ethereum: 'Ethereum', robinhood: 'Robinhood Chain', solana: 'Solana' };

function utcWhen(value) {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return '';
  return `${date.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC`;
}

/** What a row says on its card; null when the row cannot have one. */
export function entityCardProps(kind, row) {
  if (!row) return null;
  if (kind === 'event') {
    if (row.is_private) return null;
    const ended = row.ends_at && Date.parse(row.ends_at) < Date.now();
    return {
      tag: ended ? 'EVENT · ENDED' : 'EVENT', title: clean(row.title) || 'Event',
      sub: [utcWhen(row.starts_at), clean(row.location)].filter(Boolean).join(' · '),
      stats: [[row.going_count, 'people']], statLabel: 'going', cta: ended ? 'See the event' : 'I’m going', path: `riftn.com/events/${row.event_number}`,
    };
  }
  if (kind === 'community') {
    if (row.is_private) return null;
    return {
      tag: 'COMMUNITY', title: clean(row.name) || 'Community', sub: clean(row.description),
      stats: [[row.member_count, 'people']], statLabel: 'members', cta: 'Join the community', path: `riftn.com/communities/${row.slug}`,
    };
  }
  if (kind === 'clip') {
    const streamer = clean(row.streamer_username).replace(/^@/, '');
    return {
      tag: 'CLIP', title: clean(row.title) || clean(row.stream_title) || (streamer ? `A clip from @${streamer}` : 'Live clip'),
      sub: [streamer && `From @${streamer}'s live`, row.kind === 'viewer' && row.clipper_username ? `clipped by @${clean(row.clipper_username)}` : ''].filter(Boolean).join(', '),
      stats: [], cta: 'Watch the clip', path: `riftn.com/clip/${row.short_id}`,
    };
  }
  if (kind === 'dex') {
    const symbol = clean(row.symbol).toUpperCase();
    return {
      tag: `DEX · ${(DEX_CHAINS[row.chain] || clean(row.chain)).toUpperCase()}`, title: symbol ? `$${symbol}` : clean(row.name) || 'Token',
      sub: [clean(row.name), `${symbol || 'Token'}/USD on the Riftn DEX`].filter(Boolean).join(' · '),
      stats: [], cta: `Trade ${symbol || 'now'}`, path: `riftn.com/dex/${row.chain}`,
    };
  }
  if (kind === 'costream') {
    const host = clean(row.host_username).replace(/^@/, '');
    const live = row.status === 'active';
    return {
      tag: live ? 'LIVE' : 'LIVE · ENDED', live, title: host ? `Join @${host} live` : 'Join a live',
      sub: live ? 'You have been invited on screen. Open the link to join with your camera.' : 'This live has ended.',
      stats: [], cta: live ? 'Join on camera' : 'See their channel', path: 'riftn.com/live',
    };
  }
  return null;
}

/** The anon-readable row each kind is drawn from. */
export function entityQuery(kind, id) {
  if (kind === 'event' && /^\d{1,9}$/.test(id)) return `community_events?event_number=eq.${id}&select=*&limit=1`;
  if (kind === 'community' && /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(id)) return `communities?slug=eq.${encodeURIComponent(id)}&select=name,slug,description,member_count,is_private&limit=1`;
  if (kind === 'clip' && /^\d{1,15}$/.test(id)) return `live_clips?short_id=eq.${id}&status=eq.posted&select=short_id,title,stream_title,streamer_username,clipper_username,kind&limit=1`;
  if (kind === 'costream' && /^[0-9a-f-]{36}$/i.test(id)) return `live_costreams?id=eq.${id}&select=id,host_username,status&limit=1`;
  const dex = kind === 'dex' && id.match(/^(base|ethereum|robinhood|solana)~(0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/);
  if (dex) return `dex_pools?chain=eq.${dex[1]}&token_address=eq.${encodeURIComponent(dex[1] === 'solana' ? dex[2] : dex[2].toLowerCase())}&select=chain,token_address,name,symbol&limit=1`;
  return null;
}

/** The card itself. `images` holds data URIs: logo, backdrop and art (any may be missing). */
export function renderEntityCardSvg(props, images = {}) {
  const size = props.title.length > 40 ? 60 : props.title.length > 20 ? 76 : 96;
  const lines = wrapBold(props.title, size, 700, 3);
  const step = Math.ceil(size * 1.02);
  const sub = props.sub ? wrapPostText(props.sub, 26, 720, 2) : [];
  const subTop = M.bottom - (sub.length ? (sub.length - 1) * 34 : 0);
  const titleBottom = sub.length ? subTop - 46 : M.bottom;
  const titleY = titleBottom - (lines.length - 1) * step;
  const back = `${images.backdrop ? `<image xlink:href="${images.backdrop}" width="1200" height="630" preserveAspectRatio="xMidYMid slice" opacity=".6"/>` : ''}
  ${images.art ? `<image data-art="" xlink:href="${images.art}" x="700" y="70" width="460" height="460" preserveAspectRatio="xMidYMid meet"/>` : ''}`;
  const stats = props.stats.filter(([value]) => count(value) > 0);
  const path = wrapPostText(props.path, 18, 330, 1)[0] || '';
  const row = statRow(stats, M.x + Math.ceil(path.length * 10.5) + 36, M.footY);
  const label = stats.length && props.statLabel ? `<text x="${row.end + 10}" y="${M.footY + 7}" font-family="Consolas" font-size="18" fill="#a1a3ad">${escape(props.statLabel)}</text>` : '';
  return `${monolithFrame({ backdrop: back, logo: images.logo, tag: props.tag, live: !!props.live })}
  <g font-family="Manrope" font-weight="500" data-entity="">
    ${textLines(lines, M.x, titleY, size, step, '#f6f6f8', 700, ' letter-spacing="-2"')}
    ${sub.length ? textLines(sub, M.x, subTop, 26, 34, '#c9cad1') : ''}
    <text x="${M.x}" y="${M.footY + 7}" font-family="Consolas" font-size="18" fill="#c9cad1">${escape(path)}</text>
    ${row.svg}${label}
    ${ctaPill(props.cta, M.footY)}
  </g>
</svg>`;
}

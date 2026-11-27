import { liveShareState, saysOnlyLive } from './live-share-copy.js';

export const POST_CARD_VERSION = 'v8';
export const POST_CARD_TTL = 300;
const ORIGIN = 'https://riftn.com';
const CDN = 'https://dehubcdn.ams3.cdn.digitaloceanspaces.com';

export function postShareImageUrl(tokenId) {
  return `${ORIGIN}/_og/post/${POST_CARD_VERSION}/${encodeURIComponent(tokenId)}.png`;
}

export function plainPostText(value) {
  return String(value ?? '').slice(0, 20000)
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>|<\/(?:p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity) => {
      const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
      if (entity[0] !== '#') return named[entity.toLowerCase()] ?? match;
      const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/[\t ]+/g, ' ').replace(/\n\s*\n/g, '\n').trim();
}

const flag = (v) => v === true || v === 1 || v === 'true';
const count = (v) => Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : 0;
const SHARE_IMAGE = `${ORIGIN}/og/riftn-share.png`;
const CARD_POST_TYPES = ['feed-simple', 'text', 'video', 'feed-video', 'image', 'feed-images', 'live', 'audio', 'feed-audio'];
const AUDIO_POST_TYPES = ['audio', 'feed-audio'];

/** An absent rating reads as safe, as it does everywhere else. Mature, blocked and pending posts never show their content to a stranger. */
export function hasSafeRating(post) {
  return !post?.contentRating || post.contentRating === 'safe';
}

function cdnUrl(path) {
  if (!path) return '';
  try {
    const url = new URL(path, `${CDN}/`);
    return url.origin === CDN && /^\/[\w-]+\/[^?#]+$/.test(url.pathname) ? url.href : '';
  } catch { return ''; }
}

/** The picture the post itself shows: a video's poster, otherwise its first image or cover (see buildImageUrl in src/lib/media-url.ts). */
export function postCardMedia(post) {
  const video = !!post.videoUrl || ['video', 'feed-video', 'live'].includes(post.postType);
  const image = (raw) => {
    const path = String(raw || '').trim().replace(/^statics\//, '');
    if (!path || /^https?:/.test(path)) return cdnUrl(path);
    // Live streams keep their thumbnail under live/thumbnails/.
    if (/^(?:images|shorts|live)\//.test(path)) return cdnUrl(path);
    return cdnUrl(`images/${post.tokenId}.${(path.match(/\.([a-z0-9-]+)$/i)?.[1] || 'png').toLowerCase()}`);
  };
  // Covers saved under the legacy nfts/images/ prefix moved to feed-images/.
  const cover = (raw) => String(raw || '').startsWith('nfts/images/') ? cdnUrl(`feed-images/${raw.split('/').pop()}`) : image(raw);
  const feedImage = (raw) => {
    const path = String(raw || '').trim();
    return /^https?:/.test(path) ? cdnUrl(path) : path ? cdnUrl(`feed-images/${path.split('/').pop()}`) : '';
  };
  const candidates = video ? [image(post.thumbnail_url), image(post.imageUrl)]
    : [cover(post.socialImageUrl), cover(post.articleImageUrl), feedImage(post.imageUrls?.[0]), image(post.imageUrl)];
  const url = candidates.find(Boolean);
  return url ? { url, video } : null;
}

/** Only anonymous, unrestricted, safe-rated posts are eligible for a public raster. */
export function postCardData(post) {
  if (!post || !/^[1-9]\d{0,14}$/.test(String(post.tokenId))) return null;
  if (!CARD_POST_TYPES.includes(post.postType) || !hasSafeRating(post)) return null;
  if (['draft', 'scheduled', 'deleted'].includes(post.status)) return null;
  if (['private', 'followers', 'subscribers', 'unlisted'].includes(post.visibility)) return null;
  if (post.isPublic === false || post.community?.is_private || post.community?.isPrivate) return null;
  for (const source of [post, post.streamInfo, post.streamStatus]) {
    if (!source) continue;
    if (['isHidden', 'isDeleted', 'isPrivate', 'is_private', 'isPayPerView', 'is_ppv', 'isLockContent',
      'isLocked', 'is_locked', 'isSubscriberOnly', 'isLockedWithPPV', 'isLockedWithHoldings',
      'isLockedWithSubscription'].some((key) => flag(source[key]))) return null;
  }
  if (post.plansDetails?.length || post.subscriberPlans?.length || post.subscriptionPlans?.length) return null;
  const media = postCardMedia(post);
  // A video or photo post whose picture the record does not name keeps the page's own preview.
  // Audio posts may have no cover: their title on the brand backdrop is the card.
  if (!media && !['feed-simple', 'text', ...AUDIO_POST_TYPES].includes(post.postType)) return null;
  const title = plainPostText(post.title) || plainPostText(post.name);
  const body = plainPostText(post.description);
  if (!title && !body && !media) return null;
  const author = plainPostText(post.minterDisplayName || post.minterUser?.displayName || post.mintername || post.minterUsername || 'Riftn');
  const handle = plainPostText(post.mintername || post.minterUsername || post.minterUser?.username).replace(/^@/, '');
  const rawAvatar = post.minterAvatarUrl || post.minterUser?.avatarImageUrl || '';
  let avatar = '';
  try {
    const url = new URL(rawAvatar.replace(/^statics\//, ''), `${CDN}/`);
    if (rawAvatar && url.origin === CDN && url.pathname.startsWith('/avatars/')) avatar = url.href;
  } catch { /* Initials cover absent or invalid avatars. */ }
  return {
    tokenId: String(post.tokenId), title, body: body === title ? '' : body,
    author, handle, avatar, media,
    likes: count(post.totalVotes?.for ?? (Array.isArray(post.likes) ? post.likes.length : post.likes) ?? post.like_count ?? post.reactionCounts?.like),
    comments: count(post.commentCount ?? post.comment_count ?? post.comments?.length),
    views: count(post.totalViews ?? post.views ?? post.view_count),
    tips: count(post.totalTips),
    createdAt: post.createdAt || post.created_at || '',
    // Only a live post carries this, so every other card keeps its fingerprint.
    live: liveShareState(post) || undefined,
    audio: AUDIO_POST_TYPES.includes(post.postType) || undefined,
  };
}

const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

function setShareTags(html, tags) {
  let out = html;
  for (const [name, value] of Object.entries(tags)) {
    const tag = `<meta ${name.startsWith('twitter:') ? 'name' : 'property'}="${name}" content="${escape(value)}">`;
    const re = new RegExp(`<meta (?:property|name)="${name}"[^>]*>`, 'g');
    out = re.test(out) ? out.replace(re, () => tag) : out.replace('</head>', () => `${tag}\n</head>`);
  }
  return out;
}

/**
 * Point a post page's share tags at its rendered card. A post that is not
 * rated safe, or whose record could not be read, shares as the brand card and
 * drops its og:video, so nothing it carries reaches a preview.
 */
export function applyPostShareImage(html, post) {
  // A live post with no usable thumbnail would otherwise keep the page's own
  // og:image, which for streams points at a file that was never written.
  const liveWithoutCard = post?.postType === 'live' && !postCardData(post);
  if (!post || !hasSafeRating(post) || liveWithoutCard) {
    return setShareTags(html.replace(/<meta property="og:video(?::[a-z_:]+)?" content="[^"]*">\s*/g, ''), {
      'og:image': SHARE_IMAGE, 'og:image:secure_url': SHARE_IMAGE, 'og:image:type': 'image/png',
      'og:image:width': '1200', 'og:image:height': '630', 'og:image:alt': 'Riftn',
      'twitter:card': 'summary_large_image', 'twitter:image': SHARE_IMAGE, 'twitter:image:alt': 'Riftn',
    });
  }
  const data = postCardData(post);
  if (!data) return html;
  const image = postShareImageUrl(data.tokenId);
  const alt = `${data.author}: ${data.title || data.body || (data.media?.video ? 'a video' : 'a photo')}`.slice(0, 420);
  const out = setShareTags(html, {
    'og:image': image, 'og:image:secure_url': image, 'og:image:type': 'image/png',
    'og:image:width': '1200', 'og:image:height': '630', 'og:image:alt': alt,
    'twitter:card': 'summary_large_image', 'twitter:image': image, 'twitter:image:alt': alt,
  });
  // A media post's JSON-LD keeps its own picture: that is what the post shows.
  if (data.media) return out;
  return out.replace(/(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/g, (whole, open, json, close) => {
    try {
      const ld = JSON.parse(json);
      const nodes = ld['@graph'] || [ld];
      for (const node of nodes) if (['Article', 'SocialMediaPosting'].includes(node['@type'])) node.image = image;
      return open + JSON.stringify(ld).replace(/</g, '\\u003c') + close;
    } catch { return whole; }
  });
}

export function formatPostCardCount(value) {
  const n = count(value);
  return n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`
    : n >= 1e3 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K` : String(n);
}

// Conservative Exo advances keep text inside the panel, including long URLs.
function textWidth(text, size) {
  return Array.from(text).reduce((width, c) => width + (/[ilI.,!':;| ]/.test(c) ? .3
    : /[MW@%]/.test(c) ? .94 : c.codePointAt(0) > 0x2fff ? 1 : /[A-Z]/.test(c) ? .7 : .58) * size, 0);
}

// The card fonts have no emoji, which would draw as empty boxes.
const EMOJI = /[\p{Extended_Pictographic}\p{Regional_Indicator}\u{1F3FB}-\u{1F3FF}\u200d\ufe0f\u20e3]/gu;

export function wrapPostText(text, size, width, maxLines) {
  const lines = [];
  let line = '';
  for (const word of String(text).replace(EMOJI, (c) => '©®™'.includes(c) ? c : '').replace(/[ \t]{2,}/g, ' ').split(/(\s+)/u)) {
    if (word.includes('\n')) { if (line.trim()) lines.push(line.trim()); line = ''; continue; }
    if (!word.trim()) { if (line) line += ' '; continue; }
    if (line && textWidth(line + word, size) > width) { lines.push(line.trim()); line = ''; }
    for (const char of word) {
      if (textWidth(line + char, size) > width && line) { lines.push(line.trim()); line = ''; }
      line += char;
    }
  }
  if (line.trim()) lines.push(line.trim());
  if (lines.length > maxLines) {
    lines.length = maxLines;
    let tail = lines[maxLines - 1];
    while (tail && textWidth(tail + '…', size) > width) tail = Array.from(tail).slice(0, -1).join('');
    lines[maxLines - 1] = tail.trimEnd() + '…';
  }
  return lines;
}

export function textLines(lines, x, y, size, lineHeight, color, weight = 500, extra = '') {
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${color}"${extra}>${lines.map((line, i) => `<tspan x="${x}" dy="${i ? lineHeight : 0}">${escape(line)}</tspan>`).join('')}</text>`;
}

/*
 * Monolith: the post's own picture fills the card, everything else sits in one
 * left column on a 64px grid. Logo top-left, a mono tag top-right, the words
 * anchored to the column's foot, then one footer row: author, counts, the way in.
 */
export const M = { x: 64, top: 128, bottom: 466, footY: 548, right: 1136 };
const BOLD = 1.07; // Manrope 700 runs a little wider than the 500 advances textWidth models.
const MONO = 'Consolas';

/** Wrap at a bold weight by measuring against a narrower column. */
export const wrapBold = (text, size, width, maxLines) => wrapPostText(text, size, width / BOLD, maxLines);

function pollLayout(poll, width, questionWidth = width) {
  if (!poll) return null;
  const question = wrapBold(poll.question, 34, questionWidth, poll.options.length >= 4 ? 1 : 2);
  const rowH = poll.options.length >= 4 ? 40 : 46;
  const rows = poll.options.map(option => ({ ...option, lines: wrapPostText(option.text, 19, width - 110, 1), height: rowH }));
  const height = (question.length ? question.length * 42 + 16 : 0) + rows.length * (rowH + 9) - 9 + 34;
  return { ...poll, question, rows, height, width };
}

/**
 * Lay the post's words (and poll) out as one block whose foot sits on the
 * column's bottom line, so a short post reads as a headline over its footer
 * and a long one fills upward to the top line without crossing it.
 */
export function layoutPostCardCopy(data, { width = 980 } = {}) {
  const gap = 20;
  const poll = pollLayout(data.poll, Math.min(width, 640), width);
  const space = M.bottom - M.top - (poll ? poll.height + gap : 0);
  const titleSize = poll ? 34 : data.body ? (data.title.length > 70 ? 40 : 52) : data.title.length > 140 ? 40 : data.title.length > 60 ? 52 : 64;
  const bodySize = poll ? 24 : data.title ? 26 : data.body.length > 260 ? 32 : data.body.length > 120 ? 38 : 46;
  const titleStep = Math.ceil(titleSize * 1.08);
  const bodyStep = Math.ceil(bodySize * 1.28);
  const bodyReserve = data.body ? bodyStep + gap : 0;
  const titleFit = Math.min(data.body ? 2 : 5, Math.floor((space - bodyReserve + titleStep - titleSize) / titleStep));
  const titleLines = titleFit > 0 ? wrapBold(data.title, titleSize, width, titleFit) : [];
  const titleH = titleLines.length ? (titleLines.length - 1) * titleStep + titleSize : 0;
  const bodyRoom = space - (titleH ? titleH + gap : 0);
  const bodyFit = Math.floor((bodyRoom + bodyStep - bodySize) / bodyStep);
  const bodyLines = bodyFit > 0 ? wrapPostText(data.body, bodySize, width, bodyFit) : [];
  const bodyH = bodyLines.length ? (bodyLines.length - 1) * bodyStep + bodySize : 0;
  const height = titleH + (titleH && bodyH ? gap : 0) + bodyH + (poll ? (titleH || bodyH ? gap : 0) + poll.height : 0);
  const top = M.bottom - height;
  const title = { lines: titleLines, size: titleSize, step: titleStep, top, y: top + titleSize * .8, bottom: top + titleH };
  const bodyTop = titleH ? title.bottom + gap : top;
  const body = { lines: bodyLines, size: bodySize, step: bodyStep, top: bodyTop, y: bodyTop + bodySize * .8, bottom: bodyTop + bodyH };
  const before = bodyH ? body.bottom : title.bottom;
  return { title, body, poll: poll ? { ...poll, top: (titleH || bodyH) ? before + gap : top } : null, top, bottom: M.bottom, gap };
}

function renderPoll(poll) {
  if (!poll) return '';
  const x = M.x;
  let y = poll.top;
  const question = poll.question.length ? textLines(poll.question, x, y + 28, 34, 42, '#f4f4f6', 700) : '';
  y += poll.question.length ? poll.question.length * 42 + 16 : 0;
  const rows = poll.rows.map((row, index) => {
    const top = y;
    y += row.height + 9;
    const barWidth = poll.ended ? Math.max(0, Math.min(poll.width, poll.width * row.percent / 100)) : 0;
    const check = row.winner ? `<path d="m0 5 4 4 8-8" transform="translate(${x + 16} ${top + row.height / 2 - 5})" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>` : '';
    return `<g data-poll-option="${row.index}" data-winner="${row.winner}"><defs><clipPath id="poll-${index}"><rect x="${x}" y="${top}" width="${poll.width}" height="${row.height}" rx="10"/></clipPath></defs><rect x="${x}" y="${top}" width="${poll.width}" height="${row.height}" rx="10" fill="#fff" fill-opacity=".06" stroke="#fff" stroke-opacity=".16"/>${barWidth ? `<rect x="${x}" y="${top}" width="${barWidth}" height="${row.height}" fill="#fff" fill-opacity="${row.winner ? .24 : .11}" clip-path="url(#poll-${index})"/>` : ''}${check}${textLines(row.lines, row.winner ? x + 40 : x + 18, top + row.height / 2 + 7, 19, 22, '#ececf0')}${poll.ended ? `<text x="${x + poll.width - 16}" y="${top + row.height / 2 + 6}" text-anchor="end" font-family="${MONO}" font-size="17" fill="#d6d7dd">${row.percent}%</text>` : ''}</g>`;
  }).join('');
  return `<g data-poll-state="${poll.ended ? 'closed' : 'open'}">${question}${rows}</g>`;
}

const ICONS = {
  likes: '<path d="M7 10v11H3V10h4Zm0 10h11a2 2 0 0 0 2-1.6l1.6-7.6A2 2 0 0 0 19.6 8H14l.8-4c.2-1.6-1.7-2.5-2.7-1.2L7 10"/>',
  comments: '<path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-8l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/>',
  views: '<path d="M1.5 12S5.5 4.5 12 4.5 22.5 12 22.5 12 18.5 19.5 12 19.5 1.5 12 1.5 12Z"/><circle cx="12" cy="12" r="3.2"/>',
  tips: '<circle cx="12" cy="12" r="10"/><path d="M12 6.5v11M15.2 8.8c-.6-.9-1.7-1.4-3.2-1.4-1.8 0-3 .9-3 2.2 0 3.1 6.4 1.6 6.4 4.8 0 1.4-1.3 2.2-3.4 2.2-1.6 0-2.8-.5-3.5-1.5"/>',
  people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 4.8a3.4 3.4 0 0 1 0 6.4M18 14.8c2 .7 3.2 2.4 3.5 5.2"/>',
};

/** Counts in mono with their icons, laid left to right from x; returns the svg and where it ended. */
export function statRow(stats, x, y) {
  let at = x;
  const svg = stats.map(([value, icon]) => {
    const text = formatPostCardCount(value);
    const out = `<g data-stat="${icon}"><g transform="translate(${at} ${y - 15}) scale(.84)" fill="none" stroke="#e2e3e8" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICONS[icon]}</g><text x="${at + 28}" y="${y + 1}" font-family="${MONO}" font-size="19" fill="#e2e3e8">${escape(text)}</text></g>`;
    at += 28 + text.length * 10.5 + 26;
    return out;
  }).join('');
  return { svg, end: at - 26 };
}

/** The white call-to-action pill, right-aligned on the footer line. */
export function ctaPill(label, y) {
  const width = Math.ceil(textWidth(label, 19) * BOLD) + 70;
  const x = M.right - width;
  return `<g data-cta="${escape(label)}"><rect x="${x}" y="${y - 24}" width="${width}" height="48" rx="12" fill="#f4f4f6"/><text x="${x + 20}" y="${y + 7}" font-size="19" font-weight="700" fill="#060607">${escape(label)}</text><path d="M${M.right - 36} ${y + 6}l11-11m-10 0h10v10" fill="none" stroke="#060607" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></g>`;
}

/** The mono tag top-right: red for a stream on air. */
function cornerTag(label, live = false) {
  const width = Math.ceil(label.length * 9.6) + (live ? 52 : 30);
  const x = M.right - width;
  return `<g data-tag="${escape(label)}"${live ? ' data-live-tag="live"' : ''}><rect x="${x}" y="50" width="${width}" height="36" rx="10" fill="${live ? '#e5243b' : '#000'}" fill-opacity="${live ? 1 : .38}" stroke="#fff" stroke-opacity="${live ? 0 : .28}"/>${live ? `<circle cx="${x + 21}" cy="68" r="5" fill="#fff"/>` : ''}<text x="${x + (live ? 36 : 15)}" y="74" font-family="${MONO}" font-size="16" letter-spacing="1" fill="#fff">${escape(label)}</text></g>`;
}

/** Shared frame: background, scrim, wordmark, corner tag. */
export function monolithFrame({ backdrop, scrim = true, logo, tag, live }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="630" viewBox="0 0 1200 630" data-look="monolith">
  <defs>
    <linearGradient id="side" x2="1"><stop stop-color="#050506" stop-opacity=".93"/><stop offset=".55" stop-color="#050506" stop-opacity=".58"/><stop offset="1" stop-color="#050506" stop-opacity=".16"/></linearGradient>
    <linearGradient id="foot" x2="0" y2="1"><stop offset=".45" stop-color="#050506" stop-opacity="0"/><stop offset="1" stop-color="#050506" stop-opacity=".96"/></linearGradient>
    <clipPath id="face"><rect x="${M.x}" y="${M.footY - 26}" width="52" height="52" rx="14"/></clipPath>
  </defs>
  <rect width="1200" height="630" fill="#050506"/>
  ${backdrop}
  ${scrim ? '<rect width="1200" height="630" fill="url(#side)"/><rect width="1200" height="630" fill="url(#foot)"/>' : ''}
  ${logo ? `<image data-brand="riftn-wordmark" x="${M.x}" y="56" width="88" height="26" xlink:href="${logo}"/>` : ''}
  ${tag ? cornerTag(tag, live) : ''}`;
}

/** Author chip: face, name with profile badges, handle. Returns svg and its right edge. */
function authorChip(data, avatar, badges) {
  const x = M.x, y = M.footY;
  const initials = Array.from(data.author).slice(0, 2).join('').toUpperCase();
  const name = wrapBold(data.author, 20, 230, 1)[0] || '';
  let at = x + 66 + textWidth(name, 20) * BOLD + 6;
  const badgeArt = badges.map((badge) => {
    const left = at;
    if (badge.kind === 'new') {
      at += 54;
      return `<g data-profile-badge="New"><rect x="${left}" y="${y - 26}" width="48" height="20" rx="5" fill="#000" fill-opacity=".4" stroke="#fff" stroke-opacity=".3"/><text x="${left + 9}" y="${y - 11}" font-size="12" fill="#e2e3e8">New</text></g>`;
    }
    const h = 20;
    const w = h * (badge.bounds[2] - badge.bounds[0]) / (badge.bounds[3] - badge.bounds[1]);
    at += w + 5;
    const [l, t, r, b] = badge.bounds;
    return `<svg data-profile-badge="${escape(badge.name)}" x="${left}" y="${y - 27}" width="${w}" height="${h}" viewBox="${l} ${t} ${r - l} ${b - t}" overflow="visible"><image width="${badge.canvas}" height="${badge.canvas}" xlink:href="${badge.uri}"/></svg>`;
  }).join('');
  const handle = data.handle ? wrapPostText(`@${data.handle}`, 16, 230, 1)[0] : '';
  const face = avatar
    ? `<rect x="${x}" y="${y - 26}" width="52" height="52" rx="14" fill="#25262c"/><image x="${x}" y="${y - 26}" width="52" height="52" preserveAspectRatio="xMidYMid slice" clip-path="url(#face)" xlink:href="${avatar}"/>`
    : `<rect x="${x}" y="${y - 26}" width="52" height="52" rx="14" fill="#25262c" stroke="#5d5f69"/><text x="${x + 26}" y="${y + 7}" text-anchor="middle" font-size="19" fill="#dedee3">${escape(initials)}</text>`;
  const svg = `<g data-author="">${face}<text x="${x + 66}" y="${y - 6}" font-size="20" font-weight="700" fill="#f4f4f6">${escape(name)}</text>${badgeArt}${handle ? `<text x="${x + 66}" y="${y + 17}" font-size="16" fill="#a1a3ad">${escape(handle)}</text>` : ''}</g>`;
  return { svg, end: Math.max(at, x + 66 + textWidth(handle, 16)) };
}

/**
 * A post's card. Pass `media` (the post's picture as a data URI) to fill the
 * card with it; without it a media post falls back to its words.
 */
export function renderPostCardSvg(data, { logo, avatar = '', badges = [], media = '', backdrop = '' }) {
  const showMedia = !!(media && data.media);
  const live = data.live;
  // `pureglo is live` under a finished stream would be wrong: it says whose stream it was instead.
  const over = (live === 'replay' || live === 'ended') && saysOnlyLive(data.title);
  const words = over ? { title: live === 'replay' ? `${data.author}'s live replay` : `${data.author} was live`, body: '' }
    : showMedia ? { title: data.title || data.body, body: data.title ? data.body : '' } : { title: data.title, body: data.body };
  const copy = layoutPostCardCopy({ ...words, poll: showMedia ? null : data.poll }, { width: showMedia ? 720 : 980 });
  const tag = live === 'live' ? 'LIVE' : live === 'replay' ? 'REPLAY' : live === 'upcoming' ? 'UPCOMING' : live === 'ended' ? 'STREAM ENDED'
    : data.poll && !showMedia ? `POLL · ${data.poll.ended ? `${formatPostCardCount(data.poll.totalVotes)} VOTES` : 'OPEN'}`
    : data.audio ? 'AUDIO' : showMedia ? data.media.video ? 'VIDEO' : 'PHOTO' : 'POST';
  const cta = live === 'live' ? 'Watch live on Riftn' : live === 'replay' ? 'Watch the replay'
    : live ? 'View on Riftn' : data.audio ? 'Listen on Riftn' : data.poll && !showMedia ? 'Vote on Riftn' : showMedia ? data.media.video ? 'Watch on Riftn' : 'View the post' : 'Read the post';
  const picture = showMedia
    ? `<g data-media="${data.media.video ? 'video-poster' : 'image'}"><image x="0" y="0" width="1200" height="630" preserveAspectRatio="xMidYMid slice" xlink:href="${media}"/></g>`
    : backdrop ? `<image x="0" y="0" width="1200" height="630" preserveAspectRatio="xMidYMid slice" opacity=".5" xlink:href="${backdrop}"/>` : '';
  const replay = live === 'replay' ? '<g data-live-tag="replay"/>' : '';
  const author = authorChip(data, avatar, badges);
  const stats = [[data.likes, 'likes'], [data.comments, 'comments'], [data.views, 'views'], ...(data.tips ? [[data.tips, 'tips']] : [])];
  const ctaWidth = Math.ceil(textWidth(cta, 19) * BOLD) + 70;
  // Counts that would run into the button lose the last ones first.
  let row = statRow(stats, author.end + 36, M.footY);
  while (stats.length > 1 && row.end > M.right - ctaWidth - 28) { stats.pop(); row = statRow(stats, author.end + 36, M.footY); }
  return `${monolithFrame({ backdrop: picture, logo, tag, live: live === 'live' })}
  ${replay}
  <g font-family="Manrope" font-weight="500">
    ${textLines(copy.title.lines, M.x, copy.title.y, copy.title.size, copy.title.step, '#f6f6f8', 700, ' letter-spacing="-1"')}
    ${textLines(copy.body.lines, M.x, copy.body.y, copy.body.size, copy.body.step, copy.title.lines.length ? '#c9cad1' : '#f2f2f5')}
    ${renderPoll(copy.poll)}
    ${author.svg}
    ${row.svg}
    ${ctaPill(cta, M.footY)}
  </g>
</svg>`;
}

export const PROFILE_CARD_VERSION = 'v4';
const PROFILE_HANDLE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$/;

export function profileShareImageUrl(handle) {
  return `${ORIGIN}/_og/profile/${PROFILE_CARD_VERSION}/${encodeURIComponent(handle)}.png`;
}

/** A public account_info row as card copy; null for a banned or unnamed account. */
export function profileCardData(account) {
  if (!account || flag(account.isBanned)) return null;
  const handle = plainPostText(account.username).replace(/^@/, '');
  if (!PROFILE_HANDLE.test(handle)) return null;
  const raw = String(account.avatarImageUrl || '');
  let avatar = '';
  try {
    const url = new URL(raw.replace(/^statics\//, ''), `${CDN}/`);
    if (raw && url.origin === CDN && url.pathname.startsWith('/avatars/')) avatar = url.href;
  } catch { /* Initials cover absent or invalid avatars. */ }
  return {
    handle, avatar,
    name: plainPostText(account.displayName || account.display_name) || handle,
    followers: flag(account.hideFollowers) ? null : count(account.followers),
    posts: count(account.uploads),
  };
}

/** Point a profile page's share tags at its rendered card. */
export function applyProfileShareImage(html, account) {
  const data = profileCardData(account);
  if (!data) return html;
  const image = profileShareImageUrl(data.handle);
  const alt = `${data.name} (@${data.handle}) on Riftn`;
  return setShareTags(html, {
    'og:image': image, 'og:image:secure_url': image, 'og:image:type': 'image/png',
    'og:image:width': '1200', 'og:image:height': '630', 'og:image:alt': alt,
    'twitter:card': 'summary_large_image', 'twitter:image': image, 'twitter:image:alt': alt,
  });
}


/** A profile card: the face fills the right half, name and handle on the left column. */
export function renderProfileCardSvg(data, { logo, avatar = '', backdrop = '' }) {
  const column = avatar ? 700 : 1040;
  const size = wrapBold(data.name, 84, column, 1)[0] === data.name ? 84 : 72;
  const lines = wrapBold(data.name, size, column, 2);
  const handleY = M.bottom;
  const nameBottom = handleY - 48;
  const nameY = nameBottom - (lines.length - 1) * Math.ceil(size * 1.02);
  const face = avatar
    ? `<g data-face=""><defs><linearGradient id="fade" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".45" stop-color="#fff"/></linearGradient><mask id="facemask"><rect x="560" width="640" height="630" fill="url(#fade)"/></mask></defs><image x="560" y="0" width="640" height="630" preserveAspectRatio="xMidYMid slice" mask="url(#facemask)" xlink:href="${avatar}"/></g>`
    : '';
  const back = backdrop ? `<image x="0" y="0" width="1200" height="630" preserveAspectRatio="xMidYMid slice" opacity=".55" xlink:href="${backdrop}"/>` : '';
  const stats = [...(data.followers === null ? [] : [[data.followers, 'people']]), ...(data.posts ? [[data.posts, 'comments']] : [])];
  const row = statRow(stats, M.x + 150, M.footY);
  return `${monolithFrame({ backdrop: back + face, logo, tag: 'PROFILE' })}
  <g font-family="Manrope" font-weight="500">
    ${textLines(lines, M.x, nameY, size, Math.ceil(size * 1.02), '#f6f6f8', 700, ' letter-spacing="-2"')}
    <text x="${M.x}" y="${handleY}" font-size="28" fill="#c9cad1">${escape(wrapPostText(`@${data.handle}`, 28, 700, 1)[0])}</text>
    <text x="${M.x}" y="${M.footY + 7}" font-family="${MONO}" font-size="18" fill="#c9cad1">riftn.com</text>
    ${row.svg}
    ${ctaPill('Follow on Riftn', M.footY)}
  </g>
</svg>`;
}

/**
 * Profile post backgrounds: a backdrop the owner picks for the text-only posts
 * on their own profile (hold your profile header to choose).
 *
 * Stored on the account's `customs` blob (the free-form settings the backend
 * persists as-is; values are scalars only):
 *   - postBg        one of the ids below, 'photo' for the owner's own picture, or '' for none
 *   - postBgColors  "#rrggbb,#rrggbb,#rrggbb": the colour choice for that backdrop (optional)
 *   - postBgImage   CDN key of the owner's own picture, GIF or video loop, written by the server on upload
 * Only these ids, plain hex colours and our own upload keys ever render, so a
 * hand-written value can never put anything else behind a post. Apps that
 * predate colours just show the backdrop's first colourway.
 *
 * The same list lives in riftn-mobile (libs/postBackgrounds.ts); keep them in step.
 */

export const POST_BG_CUSTOMS_KEY = 'postBg';
export const POST_BG_COLORS_KEY = 'postBgColors';
export const POST_BG_IMAGE_KEY = 'postBgImage';
export const POST_BG_PHOTO_ID = 'photo';

export type PostBgKind = 'still' | 'moving' | 'photo';
/** Three colours, in the order each backdrop uses them (usually base, accent, second accent). */
export type PostBgPalette = readonly [string, string, string];

export interface PostBg {
  id: string;
  name: string;
  kind: PostBgKind;
  /** Text colour on this backdrop, worked out from its colours. */
  tone: 'light' | 'dark';
  /** Colourways to choose from, first is the default. Empty: this backdrop has its own colours. */
  palettes: readonly PostBgPalette[];
  /** How much each colour counts towards the text colour. */
  weights?: readonly [number, number, number];
  /** The colours in use (set once a choice is applied). */
  colors?: PostBgPalette;
  /** Picked a colourway that is not one of the presets. */
  custom?: boolean;
  /** Full URL of the owner's own picture (kind 'photo'). */
  image?: string;
}

type Def = Omit<PostBg, 'tone' | 'colors' | 'custom' | 'image'> & { tone?: 'light' | 'dark' };
const P = (a: string, b: string, c: string): PostBgPalette => [a, b, c];

const DEFS: readonly Def[] = [
  // ---- Still ----
  { id: 'ink', name: 'Ink Wash', kind: 'still', palettes: [P('#0d1324', '#2f4380', '#155566'), P('#0b0b0d', '#55565e', '#2a2b30'), P('#1a0d12', '#803a4c', '#66311a'), P('#0b1a14', '#2f8060', '#53661a'), P('#170d26', '#6a2f80', '#661544')] },
  { id: 'news', name: 'Newsprint', kind: 'still', palettes: [P('#e7e5e0', '#17161b', '#b9b4a8'), P('#f1e6cf', '#3b2a12', '#c9b48c'), P('#dfe6ea', '#0d2a3a', '#a9bcc6'), P('#19191b', '#ffffff', '#3a3a3e')] },
  { id: 'split', name: 'Dusk Split', kind: 'still', weights: [1, 1, 0], palettes: [P('#b5370b', '#4a1a8f', '#ffffff'), P('#0b6e4f', '#0d1b3e', '#ffffff'), P('#c2185b', '#1a237e', '#ffffff'), P('#e8590c', '#212529', '#ffffff'), P('#1c1c1e', '#3d3d42', '#ffffff')] },
  { id: 'blue', name: 'Blueprint', kind: 'still', palettes: [P('#0a3871', '#ffffff', '#ffffff'), P('#0b0b0c', '#ffffff', '#ffffff'), P('#3d0a52', '#ff9be8', '#ffffff'), P('#0f3d2e', '#b6ffd9', '#ffffff'), P('#f2f2ee', '#1b4bd1', '#1b4bd1')] },
  { id: 'terra', name: 'Terrazzo', kind: 'still', palettes: [P('#ecebe7', '#e0795c', '#3f7f74'), P('#1c1c1f', '#d8b04a', '#9db6c9'), P('#f3e9e2', '#c74b6c', '#4a6fa5'), P('#e9efe6', '#2c6e49', '#d68c45')] },
  { id: 'half', name: 'Halftone Pop', kind: 'still', palettes: [P('#0f0f12', '#ff3f84', '#ff3f84'), P('#0f0f12', '#3fd1ff', '#3fd1ff'), P('#101418', '#ffd23f', '#ffd23f'), P('#0b0b0b', '#ffffff', '#ffffff'), P('#fff4e0', '#e63946', '#e63946')] },
  { id: 'topo', name: 'Contour', kind: 'still', palettes: [P('#1f2e24', '#dcffe1', '#dcffe1'), P('#0c0c0e', '#ffffff', '#ffffff'), P('#2a1d12', '#ffd9a8', '#ffd9a8'), P('#10213a', '#a8d4ff', '#a8d4ff'), P('#ece8df', '#3a3226', '#3a3226')] },
  { id: 'velvet', name: 'Velvet', kind: 'still', weights: [1, 0.4, 0], palettes: [P('#2b0610', '#7c1733', '#ffffff'), P('#08122b', '#1d3f8a', '#ffffff'), P('#0b2416', '#1d6b3e', '#ffffff'), P('#1a0b2b', '#5b2a8c', '#ffffff'), P('#140f06', '#7a5a1a', '#ffffff')] },
  { id: 'sorbet', name: 'Sorbet', kind: 'still', weights: [1, 1, 1], palettes: [P('#ffd8c2', '#ffc4d9', '#d9cbff'), P('#c9f2e7', '#cfe3ff', '#f0d6ff'), P('#fff3b0', '#ffd0a6', '#ffb3c1'), P('#1d1b2f', '#3a2350', '#14324a')] },
  { id: 'carbon', name: 'Carbon', kind: 'still', palettes: [P('#141414', '#1d1d1d', '#0e0e0e'), P('#0b1220', '#18233a', '#070c16'), P('#1a0a0c', '#2c1216', '#120608'), P('#0a140f', '#15241b', '#060d09')] },
  // These three differ per post: Echo blurs the profile picture, Cards and Deck pick a variant from the post.
  { id: 'echo', name: 'Profile Echo', kind: 'still', tone: 'dark', palettes: [] },
  { id: 'cards', name: 'Colour Cards', kind: 'still', tone: 'dark', palettes: [] },
  { id: 'deck', name: 'Pattern Deck', kind: 'still', palettes: [P('#0c0d10', '#aebfce', '#ffffff'), P('#0c0d10', '#ff7ab6', '#ffffff'), P('#0c0d10', '#7affc1', '#ffffff'), P('#f4f3ef', '#1b1b1f', '#1b1b1f')] },

  // ---- Moving ----
  { id: 'aurora', name: 'Aurora', kind: 'moving', palettes: [P('#04101c', '#28e6aa', '#6e5aff'), P('#06060a', '#ffffff', '#8f9bb3'), P('#0d0716', '#ff5fa2', '#ffb35c'), P('#020c10', '#2fd6ff', '#33ffa0'), P('#100612', '#c56bff', '#4b7bff')] },
  { id: 'lava', name: 'Lava Lamp', kind: 'moving', palettes: [P('#24072a', '#ff5f6d', '#ffb347'), P('#06121f', '#2ea8ff', '#5ff0d0'), P('#0c0c0c', '#e8e8e8', '#7a7a7a'), P('#14071f', '#b25bff', '#ff6bd5'), P('#0b1a0a', '#a3ff4f', '#2fd18b')] },
  { id: 'stars', name: 'Starfield', kind: 'moving', palettes: [P('#03050d', '#1a2350', '#ffffff'), P('#000000', '#1c1c1c', '#ffffff'), P('#08030f', '#3b1452', '#ffd6f5'), P('#020a0a', '#0f3b3a', '#c6fff6')] },
  { id: 'rain', name: 'Rain on Glass', kind: 'moving', palettes: [P('#0e1620', '#ffc878', '#bedcff'), P('#08080a', '#ffffff', '#cfd3da'), P('#140b1d', '#ff6fb5', '#c9b8ff'), P('#071613', '#5cffc8', '#bfffe9')] },
  { id: 'drive', name: 'Night Drive', kind: 'moving', palettes: [P('#120a2b', '#ff4d8d', '#ffd36b'), P('#050507', '#ffffff', '#9a9aa2'), P('#04122a', '#2fd6ff', '#9dffef'), P('#140a02', '#ff7a1a', '#ffe08a')] },
  { id: 'breathe', name: 'Breathe', kind: 'moving', palettes: [P('#0b1a1d', '#28dcc8', '#7c8cff'), P('#09090b', '#ffffff', '#9aa0aa'), P('#1d0b14', '#ff6f91', '#ffc36b'), P('#0d0b1d', '#8c7cff', '#4fd1ff')] },
  { id: 'spin', name: 'Prism Spin', kind: 'moving', palettes: [P('#0d0d12', '#ff6b6b', '#4cc9f0'), P('#0a0a0c', '#ffffff', '#6d6d75'), P('#0b0812', '#ff4fd8', '#ffd84f'), P('#05100c', '#33ffa0', '#3f8cff')] },
  { id: 'tide', name: 'Tide', kind: 'moving', palettes: [P('#05202e', '#50d1ff', '#e6fbff'), P('#060608', '#d9dde3', '#ffffff'), P('#1b0a24', '#ff7ac8', '#ffe3f4'), P('#071a10', '#4fffa6', '#e7fff2')] },
  { id: 'ember', name: 'Embers', kind: 'moving', palettes: [P('#140804', '#ff8a3d', '#ffd18a'), P('#08080a', '#ffffff', '#bfc4cc'), P('#04081a', '#4f9dff', '#b8e0ff'), P('#0f0416', '#ff4fd8', '#ffb8f0')] },
  { id: 'holo', name: 'Holo Foil', kind: 'moving', weights: [1, 1, 1], palettes: [P('#ffd6e8', '#d6f0ff', '#e6ffd6'), P('#e9e9ee', '#ffffff', '#c9ccd4'), P('#ffe0c2', '#ffd6f0', '#d9d0ff'), P('#2a2440', '#21384a', '#3a2440')] },
  // New in Nov 2026.
  { id: 'rift', name: 'Rift', kind: 'moving', palettes: [P('#030305', '#ffffff', '#8b7cff'), P('#030305', '#ffffff', '#cfd3da'), P('#05020a', '#ffe8f6', '#ff4fa3'), P('#020608', '#e8fbff', '#2fd6ff'), P('#070402', '#fff4e0', '#ff8a1f')] },
  { id: 'chrome', name: 'Liquid Chrome', kind: 'moving', palettes: [P('#0a0a0c', '#f2f4f7', '#7d8591'), P('#0b0a10', '#f6eaff', '#9a7bd6'), P('#0a0806', '#fff1d6', '#c39a52'), P('#04090c', '#e6faff', '#4a9bb5')] },
  { id: 'mesh', name: 'Mesh', kind: 'moving', palettes: [P('#0b0b14', '#7b61ff', '#ff6fb5'), P('#0a0a0a', '#d9d9d9', '#5c5c5c'), P('#06140f', '#2fd6a0', '#e8ff6b'), P('#140a05', '#ff7a1a', '#ff3f6c'), P('#f4f1ff', '#b9a8ff', '#ffc2dc')] },
  { id: 'grain', name: 'Film Grain', kind: 'moving', palettes: [P('#0d0b0a', '#ff9a52', '#ff4f6d'), P('#0a0a0a', '#ffffff', '#9a9a9a'), P('#070b12', '#5fb8ff', '#b07cff'), P('#0b0d08', '#d9ff6b', '#4fffb0')] },
  { id: 'orbit', name: 'Orbit', kind: 'moving', palettes: [P('#050507', '#ffffff', '#ffffff'), P('#04060f', '#9db8ff', '#ffd36b'), P('#0b0410', '#ff9be8', '#ffffff'), P('#f3f2ee', '#17161b', '#17161b')] },
  { id: 'ripple', name: 'Ripple', kind: 'moving', palettes: [P('#04090f', '#8fd8ff', '#ffffff'), P('#060607', '#ffffff', '#ffffff'), P('#0f0610', '#ff8fd0', '#ffe3f4'), P('#060f08', '#8fffb8', '#e7fff0')] },
  { id: 'dotwave', name: 'Dot Wave', kind: 'moving', palettes: [P('#060608', '#ffffff', '#8b7cff'), P('#060608', '#ffffff', '#ffffff'), P('#06080f', '#7fd4ff', '#4fffd1'), P('#0f0606', '#ffb38a', '#ff4f6d'), P('#f2f1ec', '#17161b', '#4b5bff')] },
  { id: 'scan', name: 'CRT', kind: 'moving', palettes: [P('#040806', '#59ff9c', '#c8ffe0'), P('#050505', '#f2f2f2', '#ffffff'), P('#0a0503', '#ffb347', '#ffe6c2'), P('#03050a', '#5fb8ff', '#d6ecff')] },
  { id: 'silk', name: 'Silk', kind: 'moving', palettes: [P('#0d0d10', '#e9e9ef', '#3a3a44'), P('#1a0710', '#ff9bb8', '#5c1430'), P('#06101c', '#9fd0ff', '#14365c'), P('#120d04', '#ffd98a', '#5c3f0c'), P('#f1eee8', '#ffffff', '#b8b0a2')] },
  { id: 'bokeh', name: 'Bokeh', kind: 'moving', palettes: [P('#0a0812', '#ffb35c', '#ff6fb5'), P('#08080a', '#ffffff', '#a8adb8'), P('#040c14', '#4fd1ff', '#8c7cff'), P('#0c0f05', '#d9ff6b', '#ffd36b')] },
  { id: 'snow', name: 'Snowfall', kind: 'moving', palettes: [P('#0a1220', '#ffffff', '#9fb6d9'), P('#050506', '#ffffff', '#8a8a90'), P('#120a1c', '#ffe9f6', '#b89be0'), P('#04120e', '#eafff7', '#7fd4b8')] },

  // The owner's own picture, GIF or video.
  { id: POST_BG_PHOTO_ID, name: 'Your photo', kind: 'photo', tone: 'dark', palettes: [] },
];

const HEX = /^#[0-9a-f]{6}$/i;
/** Our own upload keys only: postbgs/<wallet>-<hash>.<jpg|webp|mp4>. */
const IMAGE_KEY = /^postbgs\/0x[0-9a-f]{40}-[0-9a-f]{8,64}\.(?:jpg|webp|mp4)$/;
const STORED_PHOTO_KEY = /^postbgs\/[a-z0-9-]+\.(jpg|webp|mp4)$/i;
const CDN_BASE = 'https://dehubcdn.ams3.cdn.digitaloceanspaces.com/';

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255);
}

/** Light backdrops get dark text and the other way round. */
export function postBgTone(colors: PostBgPalette, weights: readonly [number, number, number] = [1, 0, 0]): 'light' | 'dark' {
  let sum = 0;
  let total = 0;
  colors.forEach((c, i) => { sum += luminance(c) * weights[i]; total += weights[i]; });
  // 0.36 is where dark ink starts to read better than white on these.
  return total && sum / total > 0.36 ? 'light' : 'dark';
}

function build(def: Def): PostBg {
  const colors = def.palettes[0];
  return { ...def, tone: def.tone ?? (colors ? postBgTone(colors, def.weights) : 'dark'), ...(colors ? { colors } : {}) };
}

export const POST_BACKGROUNDS: readonly PostBg[] = DEFS.map(build);

const BY_ID = new Map(POST_BACKGROUNDS.map((b) => [b.id, b]));

/** "#a,#b,#c" → three colours, or null if anything is off. */
export function parsePostBgColors(raw: unknown): PostBgPalette | null {
  if (typeof raw !== 'string') return null;
  const parts = raw.split(',').map((s) => s.trim().toLowerCase());
  if (parts.length !== 3 || !parts.every((p) => HEX.test(p))) return null;
  return [parts[0], parts[1], parts[2]];
}

export function postBgColorsString(colors: PostBgPalette): string {
  return colors.map((c) => c.toLowerCase()).join(',');
}

const samePalette = (a: PostBgPalette, b: PostBgPalette) => a.every((c, i) => c.toLowerCase() === b[i].toLowerCase());

/** The backdrop with a colour choice applied (null = its default colours). Backdrops with their own colours ignore it. */
export function withPostBgColors(bg: PostBg, colors: PostBgPalette | null | undefined): PostBg {
  const def = BY_ID.get(bg.id) ?? bg;
  if (!def.palettes.length || !colors) return { ...def, image: bg.image };
  const preset = def.palettes.some((p) => samePalette(p, colors));
  return { ...def, colors, custom: !preset, tone: postBgTone(colors, def.weights), image: bg.image };
}

/** Which preset a backdrop is on (-1 = its own custom colours). */
export function postBgPaletteIndex(bg: PostBg | null): number {
  if (!bg?.colors) return 0;
  return bg.palettes.findIndex((p) => samePalette(p, bg.colors!));
}

/** Added to the blob: URL of a picked video so its local preview is played, not painted. */
export const POST_BG_VIDEO_HINT = '#video';

/** The owner's own backdrop is a video loop: one of our .mp4 uploads, or a local preview of a picked video. */
export function postBgIsVideo(url: string | null | undefined): boolean {
  return !!url && (/\.mp4(?:[?#]|$)/i.test(url) || (url.startsWith('blob:') && url.endsWith(POST_BG_VIDEO_HINT)));
}

export function postBgImageUrl(key: unknown, cdnBase = CDN_BASE): string | null {
  return typeof key === 'string' && IMAGE_KEY.test(key) ? cdnBase + key : null;
}

/** The backdrop a customs blob asks for, or null for none / unknown. */
export function parsePostBg(customs: Record<string, unknown> | null | undefined, cdnBase = CDN_BASE): PostBg | null {
  const raw = customs?.[POST_BG_CUSTOMS_KEY];
  const bg = typeof raw === 'string' ? BY_ID.get(raw) ?? null : null;
  if (!bg) return null;
  if (bg.kind === 'photo') {
    const image = postBgImageUrl(customs?.[POST_BG_IMAGE_KEY], cdnBase);
    return image ? { ...bg, image } : null;
  }
  return withPostBgColors(bg, parsePostBgColors(customs?.[POST_BG_COLORS_KEY]));
}

/** Which of `count` looks a post gets on a backdrop that varies per post. Stable for the same post. */
export function postBgVariant(seed: string | number | null | undefined, count: number): number {
  const text = String(seed ?? '');
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return hash % count;
}

export function postBgById(id: string | null | undefined): PostBg | null {
  return id ? BY_ID.get(id) ?? null : null;
}

/**
 * One string that carries a whole look (id, colours, picture) to places that
 * only take a string, like the full-screen reel: "aurora|#..,#..,#..|https://…".
 */
export function postBgToken(bg: PostBg | null): string | null {
  if (!bg) return null;
  return [bg.id, bg.colors && bg.palettes.length ? postBgColorsString(bg.colors) : '', bg.image ?? ''].join('|');
}

export function postBgFromToken(token: string | null | undefined): PostBg | null {
  if (!token) return null;
  const [id, colors, image] = token.split('|');
  const bg = postBgById(id);
  if (!bg) return null;
  if (bg.kind === 'photo') {
    return image && (image.startsWith(CDN_BASE) || image.startsWith('blob:') || /^https:\/\/[^/]+\/postbgs\//.test(image)) ? { ...bg, image } : null;
  }
  return withPostBgColors(bg, parsePostBgColors(colors));
}

/**
 * One post's own backdrop as the server stores it on the post (Token.postBg):
 * "id|#a,#b,#c|postbgs/key". The picture part is a CDN key, not a URL.
 */
export function postBgFromStored(raw: unknown, cdnBase = CDN_BASE): PostBg | null {
  if (typeof raw !== 'string' || !raw) return null;
  const [id, colors, key] = raw.split('|');
  const bg = postBgById(id);
  if (!bg) return null;
  if (bg.kind === 'photo') {
    return key && STORED_PHOTO_KEY.test(key) ? { ...bg, image: cdnBase + key } : null;
  }
  return withPostBgColors(bg, parsePostBgColors(colors));
}

/** Reuse the exact stored photo shown in the picker without uploading it again. */
export function postBgPhotoStored(url: string | null | undefined): string | null {
  if (!url?.startsWith(CDN_BASE)) return null;
  const key = url.slice(CDN_BASE.length);
  return STORED_PHOTO_KEY.test(key) ? `photo||${key}` : null;
}

/** The stored string for a backdrop with colours (no picture): what /post_background takes. */
export function postBgStored(id: string | null, colors: PostBgPalette | null | undefined): string {
  const bg = id ? BY_ID.get(id) : undefined;
  if (!bg || bg.kind === 'photo') return '';
  const c = bg.palettes.length && colors && !samePalette(colors, bg.palettes[0]) ? postBgColorsString(colors) : '';
  return c ? `${bg.id}|${c}` : bg.id;
}

export interface PostBgChoice {
  id: string | null;
  /** Colours for the backdrop; null or the default colourway clears them. */
  colors?: PostBgPalette | null;
}

/** customs with the backdrop set (or cleared with ''), every other key kept. */
export function mergePostBg(customs: Record<string, unknown> | null | undefined, choice: string | null | PostBgChoice): Record<string, unknown> {
  const c: PostBgChoice = choice !== null && typeof choice === 'object' ? choice : { id: choice as string | null };
  const bg = c.id ? BY_ID.get(c.id) : undefined;
  const next: Record<string, unknown> = { ...(customs ?? {}), [POST_BG_CUSTOMS_KEY]: bg ? bg.id : '' };
  const colors = bg && bg.palettes.length && c.colors && !samePalette(c.colors, bg.palettes[0]) ? postBgColorsString(c.colors) : '';
  next[POST_BG_COLORS_KEY] = colors;
  // The picture stays on the account so switching back to it is free.
  return next;
}

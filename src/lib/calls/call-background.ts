/**
 * Call background
 * ===============
 * Blur the room behind you, or swap it for a scene or your own photo, during a
 * direct or group video call. The picture work is the live studio's own
 * (lib/studio/background: MediaPipe's selfie segmenter on a canvas); this
 * module only names the choices a call offers and remembers the last one, so
 * the next call starts the way you left the last.
 *
 * The app offers the same choices with the same ids (riftn-mobile
 * libs/callBackground.ts), so a person who switches devices finds the same row.
 */

import type { BackgroundMode, BackgroundOptions } from '@/lib/studio/background';
import type { FaceFilterId } from '@/lib/studio/face-filters';

export type CallBackgroundId = 'none' | 'blur' | 'night' | 'ocean' | 'sunset' | 'forest' | 'photo';

export interface CallBackgroundChoice {
  id: CallBackgroundId;
  /** i18n key under `calls.` and its English fallback. */
  labelKey: string;
  label: string;
  /** CSS for the round swatch in the picker. */
  swatch: string;
  /** Gradient stops for the scenes, drawn once into a canvas. */
  stops?: [string, string, string];
}

export const CALL_BACKGROUNDS: readonly CallBackgroundChoice[] = [
  { id: 'none', labelKey: 'calls.backgroundOff', label: 'Off', swatch: 'transparent' },
  { id: 'blur', labelKey: 'calls.backgroundBlur', label: 'Blur', swatch: 'transparent' },
  { id: 'night', labelKey: 'calls.backgroundNight', label: 'Night', swatch: 'linear-gradient(160deg,#1b2140,#0b0d1a 60%,#2a1840)', stops: ['#1b2140', '#0b0d1a', '#2a1840'] },
  { id: 'ocean', labelKey: 'calls.backgroundOcean', label: 'Ocean', swatch: 'linear-gradient(160deg,#5fc6d8,#0e5a78 55%,#082a40)', stops: ['#5fc6d8', '#0e5a78', '#082a40'] },
  { id: 'sunset', labelKey: 'calls.backgroundSunset', label: 'Sunset', swatch: 'linear-gradient(160deg,#ffb36b,#e0605a 55%,#5b2a6e)', stops: ['#ffb36b', '#e0605a', '#5b2a6e'] },
  { id: 'forest', labelKey: 'calls.backgroundForest', label: 'Forest', swatch: 'linear-gradient(160deg,#9fd27a,#2f6b45 55%,#122c22)', stops: ['#9fd27a', '#2f6b45', '#122c22'] },
  { id: 'photo', labelKey: 'calls.backgroundPhoto', label: 'Your photo', swatch: 'transparent' },
];

const CHOICE_KEY = 'riftn.call.background';
const PHOTO_KEY = 'riftn.call.background.photo';
/** Long side of a saved photo. The camera is 720p, so anything bigger is wasted storage. */
const PHOTO_SIDE = 1280;

export function isCallBackgroundId(value: unknown): value is CallBackgroundId {
  return CALL_BACKGROUNDS.some(choice => choice.id === value);
}

export function loadCallBackground(): CallBackgroundId {
  try {
    const saved = localStorage.getItem(CHOICE_KEY);
    if (!isCallBackgroundId(saved)) return 'none';
    if (saved === 'photo' && !localStorage.getItem(PHOTO_KEY)) return 'none';
    return saved;
  } catch {
    return 'none';
  }
}

export function saveCallBackground(id: CallBackgroundId) {
  try { localStorage.setItem(CHOICE_KEY, id); } catch { /* private mode: this call only */ }
}

export function loadCallBackgroundPhoto(): string | null {
  try { return localStorage.getItem(PHOTO_KEY); } catch { return null; }
}

/**
 * Shrinks a picked picture to a JPEG data URL and keeps it, so "Your photo"
 * survives a reload. Resolves the data URL even when storage is full; the
 * choice then simply lasts for this session.
 */
export async function storeCallBackgroundPhoto(file: Blob): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImageElement(url);
    const scale = Math.min(1, PHOTO_SIDE / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round((image.naturalWidth || 1) * scale));
    canvas.height = Math.max(1, Math.round((image.naturalHeight || 1) * scale));
    canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    try { localStorage.setItem(PHOTO_KEY, dataUrl); } catch { /* too big for storage: keep it for this call */ }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('That picture could not be opened.'));
    image.src = src;
  });
}

const sceneCache = new Map<CallBackgroundId, HTMLCanvasElement>();
function sceneCanvas(choice: CallBackgroundChoice): HTMLCanvasElement {
  const cached = sceneCache.get(choice.id);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 1280;
  const ctx = canvas.getContext('2d');
  if (ctx && choice.stops) {
    const gradient = ctx.createLinearGradient(0, 0, canvas.width * 0.6, canvas.height);
    gradient.addColorStop(0, choice.stops[0]);
    gradient.addColorStop(0.55, choice.stops[1]);
    gradient.addColorStop(1, choice.stops[2]);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // A soft light behind the head, so the cut-out does not sit on a flat card.
    const glow = ctx.createRadialGradient(canvas.width / 2, canvas.height * 0.38, 0, canvas.width / 2, canvas.height * 0.38, canvas.width * 0.55);
    glow.addColorStop(0, 'rgba(255,255,255,0.16)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  sceneCache.set(choice.id, canvas);
  return canvas;
}

/** The studio mode and options for a choice. `photo` needs the picture's data URL. */
export async function callBackgroundSettings(
  id: CallBackgroundId,
  photo: string | null,
): Promise<{ mode: BackgroundMode; opts?: BackgroundOptions }> {
  if (id === 'none') return { mode: 'none' };
  if (id === 'blur') return { mode: 'blur', opts: { blurPx: 18 } };
  if (id === 'photo') {
    if (!photo) return { mode: 'blur', opts: { blurPx: 18 } };
    const image = await loadImageElement(photo);
    return { mode: 'image', opts: { image, color: '#111318' } };
  }
  const choice = CALL_BACKGROUNDS.find(entry => entry.id === id);
  if (!choice) return { mode: 'none' };
  return { mode: 'image', opts: { image: sceneCanvas(choice), color: choice.stops?.[1] } };
}

// ---------------------------------------------------------------------------
// Face filters (lib/studio/face-filters draws them)
// ---------------------------------------------------------------------------

export interface CallFaceFilterChoice {
  id: FaceFilterId;
  labelKey: string;
  label: string;
  emoji: string;
}

export const CALL_FACE_FILTERS: readonly CallFaceFilterChoice[] = [
  { id: 'none', labelKey: 'calls.backgroundOff', label: 'Off', emoji: '' },
  { id: 'shades', labelKey: 'calls.filterShades', label: 'Shades', emoji: '🕶️' },
  { id: 'cat', labelKey: 'calls.filterCat', label: 'Cat', emoji: '🐱' },
  { id: 'crown', labelKey: 'calls.filterCrown', label: 'Crown', emoji: '👑' },
  { id: 'hearts', labelKey: 'calls.filterHearts', label: 'Hearts', emoji: '💕' },
];

const FACE_KEY = 'riftn.call.faceFilter';

export function loadCallFaceFilter(): FaceFilterId {
  try {
    const saved = localStorage.getItem(FACE_KEY);
    return CALL_FACE_FILTERS.some(choice => choice.id === saved) ? (saved as FaceFilterId) : 'none';
  } catch {
    return 'none';
  }
}

export function saveCallFaceFilter(id: FaceFilterId) {
  try { localStorage.setItem(FACE_KEY, id); } catch { /* this call only */ }
}

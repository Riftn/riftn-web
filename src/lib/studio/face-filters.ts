/**
 * Face filters
 * ============
 * Shades, cat ears, a crown or hearts that follow your face, drawn on the
 * camera on your own device before the track is sent — the same contract as
 * the camera background (./background): draw the camera into a canvas and
 * hand back the canvas's own MediaStreamTrack.
 *
 * Per frame the camera is drawn as-is, the face tracker (./face-tracker,
 * loaded on the first pick) finds up to two faces, and each filter is drawn
 * in the face's own frame: centred between the eyes, turned with the eye
 * line and sized by the distance between the eyes. That frame is smoothed
 * from one detection to the next so the props sit still on a still face.
 *
 * The source is borrowed, never owned: `stop()` retires the canvas track and
 * the loop and leaves the source running.
 */

import { createLogger } from '@/lib/logger';
import type { FaceLandmarks, FaceTracker } from './face-tracker';

const logger = createLogger('FaceFilters');

export type FaceFilterId = 'none' | 'shades' | 'cat' | 'crown' | 'hearts';
export const FACE_FILTERS: readonly FaceFilterId[] = ['none', 'shades', 'cat', 'crown', 'hearts'];

export function isFaceFilterId(value: unknown): value is FaceFilterId {
  return FACE_FILTERS.includes(value as FaceFilterId);
}

export interface FaceFilterStage {
  track: MediaStreamTrack;
  /** The track this stage reads from. */
  source: MediaStreamTrack;
  setFilter(filter: FaceFilterId): void;
  stop(): void;
}

// ---------------------------------------------------------------------------
// Pure parts — exported for the tests
// ---------------------------------------------------------------------------

/** Mesh points the filters hang off. */
export const LM = {
  rightEyeOuter: 33,
  rightEyeInner: 133,
  leftEyeInner: 362,
  leftEyeOuter: 263,
  foreheadTop: 10,
  chin: 152,
  noseTip: 1,
} as const;

/** A face's own frame, in output pixels. Local y points down the face; x runs across the eyes. */
export interface FaceFrame {
  cx: number;
  cy: number;
  angle: number;
  /** Distance between the eye centres. Every prop is sized in this unit. */
  unit: number;
  /** The top of the forehead and the nose tip, in the face's local frame. */
  top: number;
  noseX: number;
  noseY: number;
}

export function faceFrame(points: FaceLandmarks, width: number, height: number): FaceFrame | null {
  const at = (index: number) => {
    const point = points[index];
    return point ? { x: point.x * width, y: point.y * height } : null;
  };
  const a1 = at(LM.rightEyeOuter), a2 = at(LM.rightEyeInner), b1 = at(LM.leftEyeInner), b2 = at(LM.leftEyeOuter);
  const top = at(LM.foreheadTop), nose = at(LM.noseTip);
  if (!a1 || !a2 || !b1 || !b2 || !top || !nose) return null;
  const left = { x: (a1.x + a2.x) / 2, y: (a1.y + a2.y) / 2 };
  const right = { x: (b1.x + b2.x) / 2, y: (b1.y + b2.y) / 2 };
  const unit = Math.hypot(right.x - left.x, right.y - left.y);
  if (!(unit > 2)) return null;
  const cx = (left.x + right.x) / 2;
  const cy = (left.y + right.y) / 2;
  const angle = Math.atan2(right.y - left.y, right.x - left.x);
  const local = (p: { x: number; y: number }) => {
    const dx = p.x - cx, dy = p.y - cy;
    const cos = Math.cos(-angle), sin = Math.sin(-angle);
    return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
  };
  const topLocal = local(top);
  const noseLocal = local(nose);
  return { cx, cy, angle, unit, top: topLocal.y, noseX: noseLocal.x, noseY: noseLocal.y };
}

/** Eases a frame toward the newest detection. Angles take the short way round. */
export function smoothFrame(previous: FaceFrame | null, next: FaceFrame, amount = 0.55): FaceFrame {
  if (!previous) return next;
  // A jump of more than a face width is a different face or a cut: snap.
  if (Math.hypot(next.cx - previous.cx, next.cy - previous.cy) > next.unit * 2.5) return next;
  const mix = (a: number, b: number) => a + (b - a) * amount;
  let delta = next.angle - previous.angle;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return {
    cx: mix(previous.cx, next.cx),
    cy: mix(previous.cy, next.cy),
    angle: previous.angle + delta * amount,
    unit: mix(previous.unit, next.unit),
    top: mix(previous.top, next.top),
    noseX: mix(previous.noseX, next.noseX),
    noseY: mix(previous.noseY, next.noseY),
  };
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function heartPath(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const s = size / 2;
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.9);
  ctx.bezierCurveTo(x - s * 1.6, y - s * 0.2, x - s * 0.7, y - s * 1.3, x, y - s * 0.45);
  ctx.bezierCurveTo(x + s * 0.7, y - s * 1.3, x + s * 1.6, y - s * 0.2, x, y + s * 0.9);
  ctx.closePath();
}

function drawShades(ctx: CanvasRenderingContext2D, u: number) {
  const lensW = u * 0.82, lensH = u * 0.56;
  const lens = ctx.createLinearGradient(0, -lensH / 2, 0, lensH / 2);
  lens.addColorStop(0, 'rgba(30,30,40,0.95)');
  lens.addColorStop(0.55, 'rgba(10,10,16,0.92)');
  lens.addColorStop(1, 'rgba(60,40,90,0.9)');
  ctx.lineWidth = Math.max(2, u * 0.06);
  ctx.strokeStyle = '#111';
  for (const side of [-1, 1]) {
    roundedRect(ctx, side * u * 0.5 - lensW / 2, -lensH * 0.45, lensW, lensH, lensH * 0.45);
    ctx.fillStyle = lens;
    ctx.fill();
    ctx.stroke();
    // A glint, so they read as glass.
    ctx.beginPath();
    ctx.moveTo(side * u * 0.5 - lensW * 0.28, -lensH * 0.22);
    ctx.lineTo(side * u * 0.5 - lensW * 0.08, -lensH * 0.32);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = Math.max(1.5, u * 0.035);
    ctx.stroke();
    ctx.strokeStyle = '#111';
    ctx.lineWidth = Math.max(2, u * 0.06);
  }
  ctx.beginPath();
  ctx.moveTo(-u * 0.5 + lensW / 2, -lensH * 0.2);
  ctx.quadraticCurveTo(0, -lensH * 0.42, u * 0.5 - lensW / 2, -lensH * 0.2);
  ctx.stroke();
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * (u * 0.5 + lensW / 2), -lensH * 0.3);
    ctx.lineTo(side * u * 1.08, -lensH * 0.38);
    ctx.stroke();
  }
}

function drawCat(ctx: CanvasRenderingContext2D, frame: FaceFrame) {
  const u = frame.unit;
  const top = frame.top;
  for (const side of [-1, 1]) {
    const baseX = side * u * 0.72;
    ctx.beginPath();
    ctx.moveTo(baseX - side * u * 0.42, top + u * 0.28);
    ctx.lineTo(baseX + side * u * 0.05, top - u * 0.8);
    ctx.lineTo(baseX + side * u * 0.42, top + u * 0.12);
    ctx.closePath();
    ctx.fillStyle = '#2b2b30';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(baseX - side * u * 0.22, top + u * 0.16);
    ctx.lineTo(baseX + side * u * 0.04, top - u * 0.5);
    ctx.lineTo(baseX + side * u * 0.24, top + u * 0.06);
    ctx.closePath();
    ctx.fillStyle = '#f5a3bf';
    ctx.fill();
  }
  // Nose and whiskers.
  const nx = frame.noseX, ny = frame.noseY;
  ctx.beginPath();
  ctx.moveTo(nx - u * 0.13, ny - u * 0.06);
  ctx.lineTo(nx + u * 0.13, ny - u * 0.06);
  ctx.lineTo(nx, ny + u * 0.08);
  ctx.closePath();
  ctx.fillStyle = '#f27aa0';
  ctx.fill();
  ctx.strokeStyle = 'rgba(30,30,30,0.85)';
  ctx.lineWidth = Math.max(1.5, u * 0.025);
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    for (const tilt of [-0.12, 0, 0.12]) {
      ctx.beginPath();
      ctx.moveTo(nx + side * u * 0.28, ny + u * 0.12);
      ctx.lineTo(nx + side * u * 0.95, ny + u * 0.12 + tilt * u * 1.6);
      ctx.stroke();
    }
  }
}

function drawCrown(ctx: CanvasRenderingContext2D, frame: FaceFrame) {
  const u = frame.unit;
  const base = frame.top - u * 0.12;
  const w = u * 2.1, h = u * 0.95;
  const gold = ctx.createLinearGradient(0, base - h, 0, base);
  gold.addColorStop(0, '#ffe58a');
  gold.addColorStop(0.5, '#f4c430');
  gold.addColorStop(1, '#b8860b');
  ctx.beginPath();
  ctx.moveTo(-w / 2, base);
  ctx.lineTo(-w / 2, base - h * 0.55);
  ctx.lineTo(-w / 4, base - h * 0.25);
  ctx.lineTo(0, base - h);
  ctx.lineTo(w / 4, base - h * 0.25);
  ctx.lineTo(w / 2, base - h * 0.55);
  ctx.lineTo(w / 2, base);
  ctx.closePath();
  ctx.fillStyle = gold;
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, u * 0.03);
  ctx.strokeStyle = '#8a6508';
  ctx.stroke();
  const gems: [number, number, string][] = [[-w / 4, base - h * 0.12, '#e0245e'], [0, base - h * 0.14, '#2a7fff'], [w / 4, base - h * 0.12, '#17bf63']];
  for (const [x, y, color] of gems) {
    ctx.beginPath();
    ctx.arc(x, y, u * 0.075, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
  for (const x of [-w / 2, 0, w / 2]) {
    ctx.beginPath();
    ctx.arc(x, x === 0 ? base - h : base - h * 0.55, u * 0.06, 0, Math.PI * 2);
    ctx.fillStyle = '#fff3c4';
    ctx.fill();
  }
}

function drawHearts(ctx: CanvasRenderingContext2D, frame: FaceFrame, timeMs: number) {
  const u = frame.unit;
  const count = 6;
  const t = timeMs / 1000;
  for (let i = 0; i < count; i++) {
    const phase = (i / count) * Math.PI * 2 + t * 0.9;
    const x = Math.cos(phase) * u * 1.35;
    const y = frame.top - u * 0.45 + Math.sin(phase) * u * 0.28;
    const size = u * (0.42 + 0.08 * Math.sin(t * 3 + i));
    heartPath(ctx, x, y, size);
    ctx.fillStyle = i % 2 ? '#ff5d8f' : '#ff2e63';
    ctx.globalAlpha = 0.75 + 0.25 * Math.sin(phase);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Draws one filter on one face. The canvas transform is restored after. */
export function drawFaceFilter(ctx: CanvasRenderingContext2D, filter: FaceFilterId, frame: FaceFrame, timeMs: number) {
  if (filter === 'none') return;
  ctx.save();
  ctx.translate(frame.cx, frame.cy);
  ctx.rotate(frame.angle);
  if (filter === 'shades') drawShades(ctx, frame.unit);
  else if (filter === 'cat') drawCat(ctx, frame);
  else if (filter === 'crown') drawCrown(ctx, frame);
  else if (filter === 'hearts') drawHearts(ctx, frame, timeMs);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Support and loading
// ---------------------------------------------------------------------------

export function faceFiltersSupported(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  if (typeof WebAssembly !== 'object' || typeof WebAssembly.instantiate !== 'function') return false;
  if (typeof MediaStream === 'undefined' || typeof HTMLCanvasElement === 'undefined') return false;
  return typeof HTMLCanvasElement.prototype.captureStream === 'function';
}

let trackerPromise: Promise<FaceTracker> | null = null;
function loadTracker(): Promise<FaceTracker> {
  if (!trackerPromise) {
    trackerPromise = import('./face-tracker')
      .then(m => m.createFaceTracker())
      .catch(error => {
        trackerPromise = null;
        throw error;
      });
  }
  return trackerPromise;
}

async function playTrack(track: MediaStreamTrack): Promise<HTMLVideoElement> {
  const video = document.createElement('video');
  video.srcObject = new MediaStream([track]);
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  await new Promise<void>(resolve => {
    if (video.readyState >= 1) { resolve(); return; }
    video.addEventListener('loadedmetadata', () => resolve(), { once: true });
    setTimeout(resolve, 3000);
  });
  try { await video.play(); } catch (error) { logger.warn('Face filter source failed to play', error); }
  return video;
}

/** Model work per frame is capped: past this, the last faces are reused for a frame. */
const MAX_DETECT_MS = 40;
const MAX_SIDE = 1280;

/** Loads the tracker lazily on first call. Rejects if unsupported or the model fails to load. */
export async function startFaceFilterStage(source: MediaStreamTrack, filter: FaceFilterId): Promise<FaceFilterStage> {
  if (!faceFiltersSupported()) throw new Error('Face filters are not supported in this browser.');
  const [tracker, video] = await Promise.all([loadTracker(), playTrack(source)]);

  const settings = source.getSettings?.() ?? {};
  const srcW = settings.width || video.videoWidth || 1280;
  const srcH = settings.height || video.videoHeight || 720;
  const scale = Math.min(1, MAX_SIDE / Math.max(srcW, srcH));
  const width = Math.max(2, Math.round((srcW * scale) / 2) * 2);
  const height = Math.max(2, Math.round((srcH * scale) / 2) * 2);
  const frameRate = Math.min(60, Math.round(settings.frameRate || 30));
  const frameIntervalMs = 1000 / frameRate;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas 2D is unavailable, so face filters cannot run.');

  let current: FaceFilterId = filter;
  let stopped = false;
  let frames: (FaceFrame | null)[] = [];
  let skipNext = false;
  let failures = 0;

  const drawFrame = () => {
    if (stopped) return;
    const now = performance.now();
    lastDrawAt = now;
    if (video.readyState < 2 || video.videoWidth === 0) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);
      return;
    }
    ctx.drawImage(video, 0, 0, width, height);
    if (current === 'none' || failures >= 3) return;
    if (!skipNext) {
      const started = performance.now();
      try {
        const faces = tracker.detect(video, now);
        const next = faces.map(points => faceFrame(points, width, height));
        frames = next.map((frame, index) => (frame ? smoothFrame(frames[index] ?? null, frame) : null));
        failures = 0;
      } catch (error) {
        failures += 1;
        logger.warn('Face tracking failed', error);
      }
      skipNext = performance.now() - started > MAX_DETECT_MS;
    } else {
      skipNext = false;
    }
    for (const frame of frames) if (frame) drawFaceFilter(ctx, current, frame, now);
  };

  type FrameCallbackVideo = HTMLVideoElement & {
    requestVideoFrameCallback?: (cb: () => void) => number;
    cancelVideoFrameCallback?: (handle: number) => void;
  };
  const pumpVideo = video as FrameCallbackVideo;
  let frameHandle = 0;
  let timerHandle = 0;
  let lastDrawAt = 0;
  if (typeof pumpVideo.requestVideoFrameCallback === 'function') {
    const onFrame = () => {
      if (stopped) return;
      drawFrame();
      frameHandle = pumpVideo.requestVideoFrameCallback!(onFrame);
    };
    frameHandle = pumpVideo.requestVideoFrameCallback(onFrame);
  } else {
    const onTick = () => {
      if (stopped) return;
      const started = performance.now();
      drawFrame();
      timerHandle = window.setTimeout(onTick, Math.max(0, frameIntervalMs - (performance.now() - started)));
    };
    timerHandle = window.setTimeout(onTick, 0);
  }
  // Keeps the picture moving if frame callbacks stall (a throttled tab).
  const watchdog = window.setInterval(() => {
    if (performance.now() - lastDrawAt > 200) drawFrame();
  }, 250);

  drawFrame();
  const track = canvas.captureStream(frameRate).getVideoTracks()[0];
  if (!track) {
    stopped = true;
    window.clearInterval(watchdog);
    window.clearTimeout(timerHandle);
    video.srcObject = null;
    throw new Error('The face filter canvas produced no video track.');
  }
  logger.info('Face filters started', { filter, width, height, frameRate });

  return {
    track,
    source,
    setFilter: next => {
      if (stopped) return;
      current = next;
      frames = [];
    },
    stop: () => {
      if (stopped) return;
      stopped = true;
      window.clearInterval(watchdog);
      window.clearTimeout(timerHandle);
      if (frameHandle && typeof pumpVideo.cancelVideoFrameCallback === 'function') pumpVideo.cancelVideoFrameCallback(frameHandle);
      track.stop();
      video.srcObject = null;
    },
  };
}

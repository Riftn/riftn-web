/**
 * Light around a video that does not fill the phone screen in the swipe player.
 *
 * The space above and below the picture is filled with the picture itself,
 * mirrored outward from its own edges and softened, so the colour at each edge
 * of the video carries straight on into the fill and there is no line where
 * one stops and the other starts. It is drawn from the playing video a few
 * times a second, so it follows what is on screen.
 *
 * - The copy is 40px wide and blurred inside the canvas; stretching it to the
 *   screen is what makes it smooth. Nothing frame-sized is filtered.
 * - Each draw blends a fifth of the new frame into the last, so a cut in the
 *   video turns into a drift of colour around it.
 * - Until the video has a frame, the cover image is drawn the same way.
 *
 * `look="floor"` is the other fill: nothing above the picture, and under it
 * a mirror image of the playing video that fades out, as if it stood on a
 * polished floor. That one is drawn sharper and on every video frame, since a
 * reflection that lags its picture reads as a second video.
 *
 * Drawing a cross-origin video only marks the canvas as unreadable; it still
 * shows, which is all this needs.
 */
import { useEffect, useRef, type RefObject } from 'react';

const DRAW_EVERY_MS = 120;
const BLEND = 0.2;
const CANVAS_WIDTH = 40;
const SOFTEN = 'blur(4px) saturate(135%)';
// The same softness on the stretched canvas, for browsers without canvas filters.
const SOFTEN_CSS = 'blur(40px) saturate(135%)';
const FLOOR_CANVAS_WIDTH = 240;
const FLOOR_EVERY_MS = 33;

type Frame = CanvasImageSource & { videoWidth?: number; videoHeight?: number; naturalWidth?: number; naturalHeight?: number };

/** The picture where `object-contain` puts it, and mirror copies out to the edges. */
function drawMirroredFill(ctx: CanvasRenderingContext2D, frame: Frame, fw: number, fh: number, cw: number, ch: number) {
  const scale = Math.min(cw / fw, ch / fh);
  const pw = fw * scale;
  const ph = fh * scale;
  const px = (cw - pw) / 2;
  const py = (ch - ph) / 2;
  // Bars at the sides (a tall clip on a wide screen): the stretched picture is enough.
  ctx.drawImage(frame, 0, 0, cw, ch);
  if (py < 0.5 || ph < 1) return;
  const tile = (y: number, flipped: boolean) => {
    if (!flipped) {
      ctx.drawImage(frame, px, y, pw, ph);
      return;
    }
    ctx.save();
    ctx.translate(0, y + ph);
    ctx.scale(1, -1);
    ctx.drawImage(frame, px, 0, pw, ph);
    ctx.restore();
  };
  tile(py, false);
  for (let k = 1, y = py - ph; y > -ph; k++, y -= ph) tile(y, k % 2 === 1);
  for (let k = 1, y = py + ph; y < ch; k++, y += ph) tile(y, k % 2 === 1);
}

/** The picture's mirror image directly under it, fading to black. */
function drawFloorReflection(ctx: CanvasRenderingContext2D, frame: Frame, fw: number, fh: number, cw: number, ch: number) {
  const scale = Math.min(cw / fw, ch / fh);
  const pw = fw * scale;
  const ph = fh * scale;
  const px = (cw - pw) / 2;
  const floor = (ch - ph) / 2 + ph;
  ctx.clearRect(0, 0, cw, ch);
  if (ch - floor < 1 || ph < 1) return;
  ctx.save();
  ctx.translate(0, floor + ph);
  ctx.scale(1, -1);
  ctx.drawImage(frame, px, 0, pw, ph);
  ctx.restore();
  const fade = ctx.createLinearGradient(0, floor, 0, floor + ph * 0.8);
  fade.addColorStop(0, 'rgba(0,0,0,0.45)');
  fade.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, floor, cw, ch - floor);
  // The edge of the floor catches a little light.
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(px, floor, pw, Math.max(1, ch / 900));
}

interface ShortsLiveGlowProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  thumbnail?: string;
  /** This slide is the one playing. Its neighbours keep the cover's light. */
  live: boolean;
  look?: 'glow' | 'floor';
}

export function ShortsLiveGlow({ videoRef, thumbnail, live, look = 'glow' }: ShortsLiveGlowProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const box = boxRef.current;
    const canvas = canvasRef.current;
    if (!box || !canvas) return;
    const ctx = canvas.getContext('2d');
    const scratch = document.createElement('canvas');
    const scratchCtx = scratch.getContext('2d');
    if (!ctx || !scratchCtx) return;
    const floor = look === 'floor';
    const canvasWidth = floor ? FLOOR_CANVAS_WIDTH : CANVAS_WIDTH;
    const inCanvasFilter = 'filter' in ctx;
    canvas.style.filter = inCanvasFilter || floor ? '' : SOFTEN_CSS;
    let painted = false;
    let fromVideo = false;
    let cover: HTMLImageElement | null = null;

    const paint = (frame: Frame, fw: number, fh: number, blend: boolean) => {
      const cw = canvas.width;
      const ch = canvas.height;
      if (!fw || !fh || !cw || !ch) return false;
      try {
        if (floor) {
          drawFloorReflection(ctx, frame, fw, fh, cw, ch);
          if (!painted) {
            painted = true;
            canvas.style.opacity = '1';
          }
          return true;
        }
        scratchCtx.clearRect(0, 0, cw, ch);
        drawMirroredFill(scratchCtx, frame, fw, fh, cw, ch);
        if (inCanvasFilter) ctx.filter = SOFTEN;
        ctx.globalAlpha = blend && painted ? BLEND : 1;
        ctx.drawImage(scratch, 0, 0);
        ctx.globalAlpha = 1;
        if (!painted) {
          painted = true;
          canvas.style.opacity = '1';
        }
        return true;
      } catch {
        // Not drawable yet (still attaching): whatever is there stays.
        return false;
      }
    };

    const drawVideo = () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
      // The first live frame replaces the cover outright, then frames blend.
      if (paint(video, video.videoWidth, video.videoHeight, fromVideo)) fromVideo = true;
    };
    const drawCover = () => {
      if (fromVideo || !cover?.naturalWidth) return;
      paint(cover, cover.naturalWidth, cover.naturalHeight, false);
    };

    const fitCanvas = (entries: ResizeObserverEntry[]) => {
      const rect = entries[entries.length - 1]?.contentRect;
      const width = rect?.width ?? 0;
      const height = rect?.height ?? 0;
      if (!width || !height) return;
      const h = Math.max(8, Math.round(canvasWidth * (height / width)));
      if (canvas.height === h && canvas.width === canvasWidth) return;
      canvas.width = scratch.width = canvasWidth;
      canvas.height = scratch.height = h;
      painted = false;
      fromVideo = false;
      drawCover();
      if (live) drawVideo();
    };
    const resize = new ResizeObserver(fitCanvas);
    resize.observe(box);

    if (thumbnail) {
      cover = new Image();
      cover.decoding = 'async';
      cover.onload = drawCover;
      cover.src = thumbnail;
    }

    if (!live) {
      return () => {
        resize.disconnect();
        if (cover) cover.onload = null;
      };
    }

    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer == null) timer = setInterval(drawVideo, floor ? FLOOR_EVERY_MS : DRAW_EVERY_MS);
    };
    const stop = () => {
      if (timer != null) clearInterval(timer);
      timer = null;
    };
    // The player element is handed to this slide a moment after it turns
    // active, so look for it again until it is there.
    let video: HTMLVideoElement | null = null;
    const unbind = () => {
      video?.removeEventListener('playing', start);
      video?.removeEventListener('pause', stop);
      video?.removeEventListener('seeked', drawVideo);
      video?.removeEventListener('loadeddata', drawVideo);
    };
    const bind = () => {
      const next = videoRef.current;
      if (next === video) return;
      unbind();
      video = next;
      if (!video) return;
      video.addEventListener('playing', start);
      video.addEventListener('pause', stop);
      video.addEventListener('seeked', drawVideo);
      video.addEventListener('loadeddata', drawVideo);
      drawVideo();
      if (!video.paused) start();
    };
    bind();
    const rebind = setInterval(bind, 400);
    return () => {
      clearInterval(rebind);
      stop();
      unbind();
      resize.disconnect();
      if (cover) cover.onload = null;
    };
  }, [videoRef, live, thumbnail, look]);

  return (
    <div ref={boxRef} data-shorts-live-glow data-keep-dark aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden bg-black">
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={87}
        className="absolute inset-0 h-full w-full opacity-0 transition-opacity duration-500"
      />
      {/* Deepens only the far top and bottom, where the buttons and caption sit. */}
      {look === 'glow' && <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.34),rgba(0,0,0,0.04)_30%,rgba(0,0,0,0)_50%,rgba(0,0,0,0.04)_70%,rgba(0,0,0,0.4))]" />}
    </div>
  );
}

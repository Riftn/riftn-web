/**
 * Drawing a moment's final picture.
 *
 * Everything the creator adds (text, drawing, @mentions) is laid out in the
 * 9:16 stage in fractions of its size, so it lands in the same place on the
 * 1080 x 1920 file whatever the screen was. A photo moment gets it all drawn
 * into the photo; a video moment gets a transparent layer the viewer lays
 * over the clip.
 */

import { captionFontStyle, type CaptionFont } from "./caption-fonts";

export const OUT_W = 1080;
export const OUT_H = 1920;

export interface TextLayer {
  id: string;
  kind: 'text' | 'mention';
  text: string;
  /** Centre, 0..1 of the stage. */
  x: number;
  y: number;
  /** Font size as a fraction of the stage width. */
  size: number;
  font?: CaptionFont;
  color: string;
  /** Rounded box behind the words. */
  box: boolean;
  /** Clockwise degrees around the centre. */
  rotation?: number;
  /** Mentions: whose profile the words open. */
  address?: string;
}

export const TEXT_COLORS = ['#ffffff', '#000000', '#ff5c7a', '#ffb34d', '#ffe14d', '#5ce08a', '#4dc3ff', '#a391fc'];

function boxColor(color: string): string {
  return color.toLowerCase() === '#ffffff' ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.92)';
}

/** Where a text layer's lines sit, in output pixels. Shared by drawing and mention tap targets. */
export function measureText(ctx: CanvasRenderingContext2D, layer: TextLayer) {
  const px = Math.round(layer.size * OUT_W);
  const { fontFamily, fontStyle, fontWeight } = captionFontStyle(layer.font);
  ctx.font = `${fontStyle} ${fontWeight} ${px}px ${fontFamily}`;
  const lines = layer.text.split('\n');
  const lineH = px * 1.18;
  const padX = px * 0.32;
  const widths = lines.map(l => ctx.measureText(l || ' ').width);
  const w = Math.max(...widths) + padX * 2;
  const h = lines.length * lineH + px * 0.2;
  return { px, lines, lineH, padX, widths, w, h, cx: layer.x * OUT_W, cy: layer.y * OUT_H };
}

export function drawTextLayer(ctx: CanvasRenderingContext2D, layer: TextLayer) {
  if (!layer.text.trim()) return;
  ctx.save();
  const m = measureText(ctx, layer);
  ctx.translate(m.cx, m.cy);
  ctx.rotate((layer.rotation ?? 0) * Math.PI / 180);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  const top = -m.h / 2;
  m.lines.forEach((line, i) => {
    const y = top + m.px * 0.1 + m.lineH * (i + 0.5);
    if (layer.box) {
      const w = m.widths[i] + m.padX * 2;
      ctx.fillStyle = boxColor(layer.color);
      roundRect(ctx, -w / 2, y - m.lineH / 2, w, m.lineH, m.px * 0.28);
      ctx.fill();
    } else {
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = m.px * 0.35;
    }
    ctx.fillStyle = layer.box && layer.color.toLowerCase() === '#ffffff' ? '#ffffff' : layer.color;
    ctx.fillText(line, 0, y);
    ctx.shadowBlur = 0;
  });
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** The tap target of each @mention, in 0..1 of the frame. */
export function mentionBoxes(layers: TextLayer[]): { address: string; x: number; y: number; w: number; h: number }[] {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];
  return layers
    .filter(l => l.kind === 'mention' && l.address)
    .map(l => {
      const m = measureText(ctx, l);
      return {
        address: l.address!,
        x: Math.max(0, (m.cx - m.w / 2) / OUT_W),
        y: Math.max(0, (m.cy - m.h / 2) / OUT_H),
        w: Math.min(1, m.w / OUT_W),
        h: Math.min(1, m.h / OUT_H),
      };
    });
}

/** Draw a picture to fill the frame, or, when it is much wider, whole over a blurred copy of itself. */
function drawMedia(ctx: CanvasRenderingContext2D, source: CanvasImageSource, sw: number, sh: number) {
  const frame = OUT_W / OUT_H;
  const ratio = sw / sh;
  const cover = () => {
    const scale = Math.max(OUT_W / sw, OUT_H / sh);
    const w = sw * scale;
    const h = sh * scale;
    ctx.drawImage(source, (OUT_W - w) / 2, (OUT_H - h) / 2, w, h);
  };
  if (ratio <= 0.75) {
    cover();
    return;
  }
  ctx.save();
  ctx.filter = 'blur(40px) brightness(0.6)';
  cover();
  ctx.restore();
  ctx.filter = 'none';
  const w = OUT_W;
  const h = OUT_W / ratio;
  ctx.drawImage(source, 0, (OUT_H - h) / 2, w, h);
  void frame;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not make the picture'))), type, quality),
  );
}

/** A photo moment: the photo, the drawing and the words, flattened into one JPEG. */
export async function composePhoto(image: HTMLImageElement, drawing: HTMLCanvasElement | null, layers: TextLayer[]): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = OUT_W;
  canvas.height = OUT_H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, OUT_W, OUT_H);
  drawMedia(ctx, image, image.naturalWidth, image.naturalHeight);
  if (drawing) ctx.drawImage(drawing, 0, 0, OUT_W, OUT_H);
  layers.forEach(l => drawTextLayer(ctx, l));
  return toBlob(canvas, 'image/jpeg', 0.9);
}

/** A video moment's layer: the drawing and the words on a transparent PNG, or null when there are none. */
export async function composeOverlay(drawing: HTMLCanvasElement | null, drew: boolean, layers: TextLayer[]): Promise<Blob | null> {
  const visible = layers.filter(l => l.text.trim());
  if (!drew && !visible.length) return null;
  const canvas = document.createElement('canvas');
  canvas.width = OUT_W;
  canvas.height = OUT_H;
  const ctx = canvas.getContext('2d')!;
  if (drawing && drew) ctx.drawImage(drawing, 0, 0, OUT_W, OUT_H);
  visible.forEach(l => drawTextLayer(ctx, l));
  return toBlob(canvas, 'image/png');
}

/** A still from the live camera, mirrored like the preview when it is the front camera. */
export function grabFrame(video: HTMLVideoElement, mirror: boolean): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d')!;
  if (mirror) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0);
  return toBlob(canvas, 'image/jpeg', 0.92);
}

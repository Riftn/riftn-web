/**
 * ImageMarkupDialog
 * =================
 * Crop and draw on a screenshot before it goes into a request: cut it down to
 * the part that matters, circle the broken button, underline the wrong label.
 * Crop: drag a box over the picture, drag inside it to move it. Strokes are
 * drawn onto a copy of the image, and Done hands back a PNG (cropped when a
 * box is set) that replaces the attachment.
 *
 * @module components/app/features/ImageMarkupDialog
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Long edge of the saved image; a phone screenshot keeps its detail. */
const MAX_EDGE = 2000;
const PEN_COLORS = ['#ff3b30', '#ffd60a', '#0a84ff', '#ffffff'];

type Stroke = { color: string; width: number; points: Array<[number, number]> };
type Rect = { x: number; y: number; w: number; h: number };
/** Smallest crop box, in image pixels; a tap is not a crop. */
const MIN_CROP = 24;

interface ImageMarkupDialogProps {
  file: File | null;
  onClose: () => void;
  onSave: (file: File) => void;
}

export function ImageMarkupDialog({ file, onClose, onSave }: ImageMarkupDialogProps) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const drawingRef = useRef<Stroke | null>(null);
  const [color, setColor] = useState(PEN_COLORS[0]);
  const [strokeCount, setStrokeCount] = useState(0);
  const [ready, setReady] = useState(false);
  const [tool, setTool] = useState<'crop' | 'draw'>('crop');
  const cropRef = useRef<Rect | null>(null);
  const cropDragRef = useRef<{ kind: 'new' | 'move'; from: [number, number]; start: Rect | null } | null>(null);
  const [hasCrop, setHasCrop] = useState(false);

  const redraw = useCallback((forExport = false) => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !image || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const all = drawingRef.current ? [...strokesRef.current, drawingRef.current] : strokesRef.current;
    for (const stroke of all) {
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.beginPath();
      stroke.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      if (stroke.points.length === 1) ctx.lineTo(stroke.points[0][0] + 0.1, stroke.points[0][1]);
      ctx.stroke();
    }
    const crop = cropRef.current;
    if (crop && !forExport) {
      // Dim everything outside the box, then a white frame with thirds.
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath();
      ctx.rect(0, 0, canvas.width, canvas.height);
      ctx.rect(crop.x, crop.y + crop.h, crop.w, -crop.h);
      ctx.fill('evenodd');
      const line = Math.max(2, Math.round(Math.max(canvas.width, canvas.height) * 0.002));
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = line;
      ctx.strokeRect(crop.x, crop.y, crop.w, crop.h);
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = Math.max(1, line / 2);
      for (let i = 1; i < 3; i += 1) {
        ctx.beginPath();
        ctx.moveTo(crop.x + (crop.w * i) / 3, crop.y); ctx.lineTo(crop.x + (crop.w * i) / 3, crop.y + crop.h);
        ctx.moveTo(crop.x, crop.y + (crop.h * i) / 3); ctx.lineTo(crop.x + crop.w, crop.y + (crop.h * i) / 3);
        ctx.stroke();
      }
      ctx.restore();
    }
  }, []);

  useEffect(() => {
    if (!file) return;
    setReady(false);
    strokesRef.current = [];
    drawingRef.current = null;
    cropRef.current = null;
    cropDragRef.current = null;
    setHasCrop(false);
    setTool('crop');
    setStrokeCount(0);
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      imageRef.current = image;
      const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = Math.round(image.naturalWidth * scale);
        canvas.height = Math.round(image.naturalHeight * scale);
      }
      setReady(true);
      redraw();
    };
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file, redraw]);

  const pointFor = (event: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return [
      ((event.clientX - rect.left) / rect.width) * canvas.width,
      ((event.clientY - rect.top) / rect.height) * canvas.height,
    ];
  };

  const clampRect = (r: Rect, canvas: HTMLCanvasElement): Rect => {
    const w = Math.min(Math.abs(r.w), canvas.width);
    const h = Math.min(Math.abs(r.h), canvas.height);
    const x = Math.max(0, Math.min(r.w < 0 ? r.x + r.w : r.x, canvas.width - w));
    const y = Math.max(0, Math.min(r.h < 0 ? r.y + r.h : r.y, canvas.height - h));
    return { x, y, w, h };
  };

  const handleDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!ready) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const canvas = event.currentTarget;
    if (tool === 'crop') {
      const at = pointFor(event);
      const crop = cropRef.current;
      const inside = crop && at[0] >= crop.x && at[0] <= crop.x + crop.w && at[1] >= crop.y && at[1] <= crop.y + crop.h;
      cropDragRef.current = { kind: inside ? 'move' : 'new', from: at, start: crop ? { ...crop } : null };
      return;
    }
    // About 0.6% of the long edge: a clear mark on a phone screenshot and a laptop one.
    const width = Math.max(4, Math.round(Math.max(canvas.width, canvas.height) * 0.006));
    drawingRef.current = { color, width, points: [pointFor(event)] };
    redraw();
  };

  const handleMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = cropDragRef.current;
    if (drag) {
      const canvas = event.currentTarget;
      const at = pointFor(event);
      const dx = at[0] - drag.from[0];
      const dy = at[1] - drag.from[1];
      cropRef.current = drag.kind === 'move' && drag.start
        ? clampRect({ ...drag.start, x: drag.start.x + dx, y: drag.start.y + dy }, canvas)
        : clampRect({ x: drag.from[0], y: drag.from[1], w: dx, h: dy }, canvas);
      redraw();
      return;
    }
    if (!drawingRef.current) return;
    drawingRef.current.points.push(pointFor(event));
    redraw();
  };

  const handleUp = () => {
    if (cropDragRef.current) {
      cropDragRef.current = null;
      const crop = cropRef.current;
      if (crop && (crop.w < MIN_CROP || crop.h < MIN_CROP)) cropRef.current = null;
      setHasCrop(!!cropRef.current);
      redraw();
      return;
    }
    if (!drawingRef.current) return;
    strokesRef.current = [...strokesRef.current, drawingRef.current];
    drawingRef.current = null;
    setStrokeCount(strokesRef.current.length);
    redraw();
  };

  const undo = () => {
    strokesRef.current = strokesRef.current.slice(0, -1);
    setStrokeCount(strokesRef.current.length);
    redraw();
  };

  const resetCrop = () => {
    cropRef.current = null;
    setHasCrop(false);
    redraw();
  };

  const save = () => {
    const canvas = canvasRef.current;
    if (!canvas || !file) return;
    // Paint without the crop frame, then keep only the box.
    redraw(true);
    const crop = cropRef.current;
    let out: HTMLCanvasElement = canvas;
    if (crop) {
      out = document.createElement('canvas');
      out.width = Math.round(crop.w);
      out.height = Math.round(crop.h);
      out.getContext('2d')?.drawImage(canvas, crop.x, crop.y, crop.w, crop.h, 0, 0, out.width, out.height);
    }
    out.toBlob((blob) => {
      redraw();
      if (!blob) return;
      const base = file.name.replace(/\.[^.]+$/, '') || 'screenshot';
      onSave(new File([blob], `${base}-edited.png`, { type: 'image/png' }));
    }, 'image/png');
  };

  return (
    <Dialog open={!!file} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl w-[calc(100vw-1rem)] p-3 sm:p-4 gap-3 grid-cols-[minmax(0,1fr)]">
        <DialogTitle className="text-base text-white pr-8">{t('features.cropDraw', 'Crop & draw')}</DialogTitle>
        <div className="flex flex-wrap items-center gap-1.5 min-w-0" role="tablist">
          {(['crop', 'draw'] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tool === id}
              data-markup-tool={id}
              onClick={() => setTool(id)}
              className={cn(
                'h-8 px-3 rounded-lg text-sm font-medium border transition-colors',
                tool === id ? 'bg-white text-black border-white' : 'bg-white/[0.06] text-white border-white/10 hover:bg-white/10',
              )}
            >
              {id === 'crop' ? t('features.crop', 'Crop') : t('editor.draw.heading', 'Draw')}
            </button>
          ))}
          <span className="basis-full sm:basis-auto sm:ml-1 text-xs text-zinc-400 leading-snug">
            {tool === 'crop'
              ? t('features.cropHint', 'Drag a box over the part to keep. Drag inside it to move it.')
              : t('features.drawHint', 'Draw on the picture to point things out.')}
          </span>
        </div>
        <div className="flex min-w-0 items-center justify-center rounded-lg bg-black/40 overflow-hidden max-h-[50vh] sm:max-h-[65vh]">
          <canvas
            ref={canvasRef}
            onPointerDown={handleDown}
            onPointerMove={handleMove}
            onPointerUp={handleUp}
            onPointerCancel={handleUp}
            data-markup-canvas
            className="max-w-full max-h-[50vh] sm:max-h-[65vh] w-auto h-auto touch-none cursor-crosshair"
            aria-label={tool === 'crop' ? t('features.crop', 'Crop') : t('editor.draw.heading', 'Draw')}
          />
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {tool === 'crop' && (
            <Button type="button" variant="ghost" size="sm" className="rounded-lg" disabled={!hasCrop} onClick={resetCrop}>
              {t('features.resetCrop', 'Reset crop')}
            </Button>
          )}
          {tool === 'draw' && PEN_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={t('editor.draw.colour', 'Pen colour')}
              aria-pressed={color === c}
              className={cn(
                'w-7 h-7 rounded-full border-2 transition-transform',
                color === c ? 'border-white scale-110' : 'border-white/20',
              )}
              style={{ backgroundColor: c }}
            />
          ))}
          {tool === 'draw' && <Button type="button" variant="ghost" size="sm" className="rounded-lg" disabled={strokeCount === 0} onClick={undo}>
            {t('common.undo', 'Undo')}
          </Button>}
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="ghost" size="sm" className="rounded-lg" onClick={onClose}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button type="button" variant="glass" size="sm" className="rounded-lg" disabled={!ready} onClick={save}>
              {t('common.done', 'Done')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Circle, Eraser, Loader2, PaintBucket, Paintbrush, Pencil, Redo2, Slash, Square, Trash2, Undo2, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  ART_TOOLS,
  DEFAULT_SIZE,
  endStroke,
  PAINT_ASPECTS,
  PAINT_PALETTE,
  PAPER,
  PaintHistory,
  SIZE_MAX,
  SIZE_MIN,
  floodFill,
  isShape,
  moveStroke,
  paintingFileName,
  shapeOp,
  startStroke,
  type PaintAspect,
  type PaintTool,
  type Stroke,
} from '@/lib/painting/engine';
import { drawOps } from '@/lib/painting/draw2d';

/**
 * Painting: a full-screen canvas opened from the composer's post options.
 * Paint-style tools (pencil, brush, eraser, fill, line, rectangle, ellipse)
 * plus oil, pastel, watercolour and charcoal brushes. Done hands the picture
 * back as an image file, so it posts (and can be minted) like any photo.
 *
 * The page is black like the photo studio; the paper is white on every theme.
 */

interface Props {
  onClose: () => void;
  onDone: (file: File) => void;
}

/** Snapshots kept for undo; each is a full frame. */
const UNDO_LIMIT = 20;
/** Above this a painting goes out as JPEG instead of PNG. */
const PNG_MAX_BYTES = 4_500_000;

const BASIC: { tool: PaintTool; Icon: typeof Pencil; label: string; fallback: string }[] = [
  { tool: 'pencil', Icon: Pencil, label: 'painting.tools.pencil', fallback: 'Pencil' },
  { tool: 'brush', Icon: Paintbrush, label: 'painting.tools.brush', fallback: 'Brush' },
  { tool: 'eraser', Icon: Eraser, label: 'painting.tools.eraser', fallback: 'Eraser' },
  { tool: 'fill', Icon: PaintBucket, label: 'painting.tools.fill', fallback: 'Fill' },
  { tool: 'line', Icon: Slash, label: 'painting.tools.line', fallback: 'Line' },
  { tool: 'rect', Icon: Square, label: 'painting.tools.rect', fallback: 'Rectangle' },
  { tool: 'ellipse', Icon: Circle, label: 'painting.tools.ellipse', fallback: 'Ellipse' },
];
const ART_FALLBACK: Record<string, string> = { oil: 'Oil', pastel: 'Pastel', watercolor: 'Watercolour', charcoal: 'Charcoal' };
const ASPECT_FALLBACK: Record<PaintAspect, string> = { portrait: 'Portrait', square: 'Square', wide: 'Wide' };

function ToolButton({ on, onClick, label, disabled, children }: { on?: boolean; onClick: () => void; label: string; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={on === undefined ? undefined : on}
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-zinc-300 transition-colors disabled:opacity-35',
        on ? 'border-white/50 bg-white/20 text-white' : 'border-white/15 bg-white/5 hover:text-white',
      )}
    >
      {children}
    </button>
  );
}

function Chip({ label, on, onClick, disabled }: { label: string; on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className={cn(
        'h-10 shrink-0 rounded-full border px-3.5 text-xs transition-colors disabled:opacity-35',
        on ? 'border-white bg-white font-semibold text-black' : 'border-white/15 text-white/70 hover:text-white',
      )}
    >
      {label}
    </button>
  );
}

export default function PaintingStudio({ onClose, onDone }: Props) {
  const { t } = useTranslation();
  const [tool, setTool] = useState<PaintTool>('brush');
  const [color, setColor] = useState('#000000');
  const [size, setSize] = useState(DEFAULT_SIZE);
  const [fillShape, setFillShape] = useState(false);
  const [aspect, setAspect] = useState<PaintAspect>(() =>
    typeof window !== 'undefined' && window.innerWidth > window.innerHeight * 1.2 ? 'wide' : 'portrait',
  );
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [, setVersion] = useState(0);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [saving, setSaving] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef<PaintHistory<ImageData> | null>(null);
  const strokeRef = useRef<Stroke | null>(null);
  const shapeRef = useRef<{ x: number; y: number; ex: number; ey: number; even: boolean } | null>(null);
  const pointerRef = useRef<number | null>(null);

  const { w: W, h: H } = PAINT_ASPECTS[aspect];
  const ctx = () => canvasRef.current?.getContext('2d', { willReadFrequently: true }) ?? null;
  const bump = () => setVersion((v) => v + 1);
  const history = historyRef.current;
  const canUndo = !!history?.canUndo;
  const canRedo = !!history?.canRedo;

  // White paper at the chosen size; a new size starts a new painting.
  useLayoutEffect(() => {
    const c = ctx();
    if (!c) return;
    c.fillStyle = PAPER;
    c.fillRect(0, 0, W, H);
    const first = c.getImageData(0, 0, W, H);
    if (historyRef.current) historyRef.current.reset(first);
    else historyRef.current = new PaintHistory(first, UNDO_LIMIT);
    bump();
  }, [W, H]);

  // Fit the paper into the stage.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const fit = () => {
      const pad = 12;
      const aw = Math.max(1, stage.clientWidth - pad * 2);
      const ah = Math.max(1, stage.clientHeight - pad * 2);
      const k = Math.min(aw / W, ah / H);
      setBox({ w: Math.floor(W * k), h: Math.floor(H * k) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [W, H]);

  const commit = useCallback(() => {
    const c = canvasRef.current?.getContext('2d', { willReadFrequently: true });
    if (!c || !historyRef.current) return;
    historyRef.current.push(c.getImageData(0, 0, W, H));
    bump();
  }, [W, H]);

  const undo = useCallback(() => {
    const frame = historyRef.current?.undo();
    if (frame) ctx()?.putImageData(frame, 0, 0);
    bump();
  }, []);
  const redo = useCallback(() => {
    const frame = historyRef.current?.redo();
    if (frame) ctx()?.putImageData(frame, 0, 0);
    bump();
  }, []);
  const clear = () => {
    const c = ctx();
    if (!c) return;
    c.fillStyle = PAPER;
    c.fillRect(0, 0, W, H);
    commit();
  };

  const cancel = useCallback(() => {
    if (historyRef.current?.canUndo) setConfirmDiscard(true);
    else onClose();
  }, [onClose]);

  // Esc closes, Ctrl/Cmd+Z undoes (with Shift, or Ctrl+Y, redoes); the page
  // behind does not scroll while the canvas is up.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA)$/.test(e.target.tagName) && (e.target as HTMLInputElement).type !== 'color';
      if (typing) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        if (confirmDiscard) setConfirmDiscard(false);
        else cancel();
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cancel, confirmDiscard, undo, redo]);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const toCanvas = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * W) / r.width, y: ((e.clientY - r.top) * H) / r.height };
  };
  const pressureOf = (e: PointerEvent) => (e.pointerType === 'pen' ? e.pressure : 1);

  const drawPreview = (op: ReturnType<typeof shapeOp>) => {
    const o = overlayRef.current?.getContext('2d');
    if (!o) return;
    o.clearRect(0, 0, W, H);
    if (op) drawOps(o, [op]);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointerRef.current !== null) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const c = ctx();
    if (!c) return;
    e.preventDefault();
    const p = toCanvas(e);
    if (tool === 'fill') {
      const frame = c.getImageData(0, 0, W, H);
      if (floodFill(frame.data, W, H, p.x, p.y, color)) {
        c.putImageData(frame, 0, 0);
        commit();
      }
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    pointerRef.current = e.pointerId;
    if (isShape(tool)) {
      shapeRef.current = { x: p.x, y: p.y, ex: p.x, ey: p.y, even: e.shiftKey };
      return;
    }
    const { stroke, ops } = startStroke(tool, color, size, p.x, p.y, pressureOf(e.nativeEvent), Math.floor(Math.random() * 2 ** 31));
    strokeRef.current = stroke;
    drawOps(c, ops);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointerRef.current !== e.pointerId) return;
    const shape = shapeRef.current;
    if (shape) {
      const p = toCanvas(e);
      shape.ex = p.x;
      shape.ey = p.y;
      shape.even = e.shiftKey;
      drawPreview(shapeOp(tool, shape.x, shape.y, p.x, p.y, size, color, fillShape, e.shiftKey));
      return;
    }
    const stroke = strokeRef.current;
    const c = ctx();
    if (!stroke || !c) return;
    // Every sample the pointer took since the last frame, for fine detail.
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
    for (const ev of events.length ? events : [e.nativeEvent]) {
      const p = toCanvas(ev);
      const ops = moveStroke(stroke, p.x, p.y, pressureOf(ev));
      if (ops.length) drawOps(c, ops);
    }
  };

  const onPointerEnd = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointerRef.current !== e.pointerId) return;
    pointerRef.current = null;
    const shape = shapeRef.current;
    shapeRef.current = null;
    if (shape) {
      drawPreview(null);
      const op = shapeOp(tool, shape.x, shape.y, shape.ex, shape.ey, size, color, fillShape, shape.even);
      const c = ctx();
      if (op && c) {
        drawOps(c, [op]);
        commit();
      }
      return;
    }
    const stroke = strokeRef.current;
    if (stroke) {
      strokeRef.current = null;
      const c = ctx();
      const tail = endStroke(stroke);
      if (c && tail.length) drawOps(c, tail);
      commit();
    }
  };

  const done = async () => {
    const canvas = canvasRef.current;
    if (!canvas || saving) return;
    setSaving(true);
    try {
      const encode = (type: string, quality?: number) =>
        new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
      let blob = await encode('image/png');
      let ext: 'png' | 'jpg' = 'png';
      if (!blob || blob.size > PNG_MAX_BYTES) {
        blob = await encode('image/jpeg', 0.92);
        ext = 'jpg';
      }
      if (!blob) throw new Error('encode failed');
      onDone(new File([blob], paintingFileName(ext), { type: ext === 'png' ? 'image/png' : 'image/jpeg' }));
    } catch {
      toast.error(t('painting.saveFailed', { defaultValue: "Couldn't save the painting. Try again." }));
      setSaving(false);
    }
  };

  const scale = box ? box.w / W : 1;
  const dot = Math.max(2, Math.min(40, (tool === 'pencil' ? Math.max(1, size / 4) : size) * scale));
  const custom = !PAINT_PALETTE.includes(color.toLowerCase());
  const blank = !canUndo;

  const body = (
    <div
      // Opened from the composer sheet, which locks clicks to itself while it
      // is open; portaled to body, take clicks back explicitly.
      className="pointer-events-auto fixed inset-0 z-[300] flex flex-col bg-black text-white"
      data-overlay-content
      data-drop-attach
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }}
      onDrop={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }}
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      role="dialog"
      aria-modal="true"
      aria-label={t('painting.title', { defaultValue: 'Painting' })}
    >
      {/* Top bar */}
      <div className="mx-auto flex w-full max-w-4xl items-center gap-2 px-3 py-2.5">
        <button type="button" onClick={cancel} aria-label={t('painting.close', { defaultValue: 'Close' })} className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white">
          <X className="h-5 w-5" />
        </button>
        <span className="flex-1 text-sm font-semibold">{t('painting.title', { defaultValue: 'Painting' })}</span>
        <ToolButton onClick={undo} disabled={!canUndo} label={t('painting.undo', { defaultValue: 'Undo' })}>
          <Undo2 className="h-4 w-4" />
        </ToolButton>
        <ToolButton onClick={redo} disabled={!canRedo} label={t('painting.redo', { defaultValue: 'Redo' })}>
          <Redo2 className="h-4 w-4" />
        </ToolButton>
        <button type="button" onClick={done} disabled={saving || blank} className="ml-1 min-w-[64px] rounded-full bg-white px-4 py-1.5 text-[13px] font-semibold text-black disabled:opacity-50">
          {saving ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : t('painting.done', { defaultValue: 'Done' })}
        </button>
      </div>

      {blank && (
        <div className="mx-auto flex w-full max-w-4xl items-center justify-center gap-1.5 px-3 pb-1" role="group" aria-label={t('painting.shape', { defaultValue: 'Canvas shape' })}>
          {(Object.keys(PAINT_ASPECTS) as PaintAspect[]).map((a) => (
            <button
              key={a}
              type="button"
              aria-pressed={aspect === a}
              onClick={() => setAspect(a)}
              className={cn('rounded-full border px-3 py-1 text-[11px] transition-colors', aspect === a ? 'border-white/60 bg-white/15 text-white' : 'border-white/15 text-white/60 hover:text-white')}
            >
              {t(`painting.aspect.${a}`, { defaultValue: ASPECT_FALLBACK[a] })}
            </button>
          ))}
        </div>
      )}

      {/* Paper */}
      <div ref={stageRef} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        <div className="relative shadow-[0_0_0_1px_rgba(127,127,127,0.35),0_8px_30px_rgba(0,0,0,0.35)]" style={{ width: box?.w ?? 0, height: box?.h ?? 0 }}>
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            data-painting-canvas
            className={cn('block h-full w-full select-none', tool === 'fill' ? 'cursor-cell' : 'cursor-crosshair')}
            style={{ touchAction: 'none', background: PAPER }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            onContextMenu={(e) => e.preventDefault()}
          />
          <canvas ref={overlayRef} width={W} height={H} className="pointer-events-none absolute inset-0 h-full w-full" />
        </div>
      </div>

      {/* Tools */}
      <div className="mx-auto w-full max-w-4xl space-y-2.5 px-4 pb-3 pt-2">
        <div className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-1 scrollbar-hide">
          {BASIC.map(({ tool: id, Icon, label, fallback }) => (
            <ToolButton key={id} on={tool === id} onClick={() => setTool(id)} label={t(label, { defaultValue: fallback })}>
              <Icon className="h-[18px] w-[18px]" />
            </ToolButton>
          ))}
          <span className="mx-1 h-6 w-px shrink-0 bg-white/15" aria-hidden="true" />
          {ART_TOOLS.map((id) => (
            <Chip key={id} on={tool === id} onClick={() => setTool(id)} label={t(`painting.tools.${id}`, { defaultValue: ART_FALLBACK[id] })} />
          ))}
        </div>

        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center" aria-hidden="true">
            <span className="rounded-full border border-white/30" style={{ width: dot, height: dot, background: tool === 'eraser' ? PAPER : color }} />
          </span>
          <label className="flex min-w-0 flex-1 items-center gap-2 text-[11px] text-white/60">
            <span className="shrink-0">{t('painting.size', { defaultValue: 'Size' })}</span>
            <input
              type="range"
              min={SIZE_MIN}
              max={SIZE_MAX}
              step={1}
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
              className="h-6 min-w-0 flex-1 cursor-pointer accent-white"
            />
            <span className="w-7 shrink-0 text-right tabular-nums text-white/70">{size}</span>
          </label>
          {(tool === 'rect' || tool === 'ellipse') && (
            <Chip on={fillShape} onClick={() => setFillShape((v) => !v)} label={t('painting.fillShape', { defaultValue: 'Fill shape' })} />
          )}
          <ToolButton onClick={clear} disabled={blank} label={t('painting.clear', { defaultValue: 'Clear' })}>
            <Trash2 className="h-4 w-4" />
          </ToolButton>
        </div>

        <div className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 py-1 scrollbar-hide sm:flex-wrap" role="group" aria-label={t('painting.colour', { defaultValue: 'Colour' })}>
          {PAINT_PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={c}
              aria-pressed={color.toLowerCase() === c}
              className={cn('h-7 w-7 shrink-0 rounded-full border-2 transition-transform', color.toLowerCase() === c ? 'scale-110 border-white' : 'border-white/20')}
              style={{ backgroundColor: c }}
            />
          ))}
          <label
            title={t('painting.customColour', { defaultValue: 'Custom colour' })}
            className={cn('relative h-7 w-7 shrink-0 cursor-pointer overflow-hidden rounded-full border-2', custom ? 'scale-110 border-white' : 'border-white/20')}
            style={{ background: custom ? color : 'conic-gradient(#ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)' }}
          >
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              aria-label={t('painting.customColour', { defaultValue: 'Custom colour' })}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </label>
        </div>
      </div>

      {confirmDiscard && (
        <div className="absolute inset-0 z-10 flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={() => setConfirmDiscard(false)}>
          <div role="alertdialog" aria-modal="true" className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-900 p-4" onClick={(e) => e.stopPropagation()}>
            <p className="mb-4 text-sm font-semibold text-white">{t('painting.discardTitle', { defaultValue: 'Discard this painting?' })}</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirmDiscard(false)} className="flex-1 rounded-xl border border-white/15 px-3 py-2 text-sm text-white hover:bg-white/10">
                {t('painting.keep', { defaultValue: 'Keep painting' })}
              </button>
              <button type="button" onClick={onClose} className="flex-1 rounded-xl bg-red-500 px-3 py-2 text-sm font-semibold text-white hover:bg-red-500/90">
                {t('painting.discard', { defaultValue: 'Discard' })}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(body, document.body);
}

/**
 * Making a moment: record or pick, add to it, share.
 *
 * 1. Camera opens straight away. Tap the shutter for a photo, hold it to
 *    film (up to 60 s), or pick a photo or video from the device.
 * 2. Add words, a drawing, a song or an @mention; trim and mute a video; pick
 *    who sees it (Everyone or Followers).
 * 3. Share closes this at once. Your own tile on the shelf fills as it
 *    uploads, and the moment is up for 24 hours.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AtSign, Pencil, RefreshCw, Type, Undo2, Users, Globe2, Volume2, VolumeX, Scissors } from 'lucide-react';
import Close from '@/components/ui/cut-icons/close';
import Images from '@/components/ui/cut-icons/images';
import Music from '@/components/ui/cut-icons/music';
import Check from '@/components/ui/cut-icons/check';
import { SoundPicker } from '@/features/post/components/SoundPicker';
import type { AttachedSound } from '@/features/post/hooks/usePostSound';
import { soundWindow } from '@/lib/sound-window';
import { searchUsersForDM } from '@/lib/api/dehub/dm';
import type { DeHubUser } from '@/lib/api/dehub';
import { STORY_LIFETIMES, type StoryAudience, type StoryLifetime, type StorySong } from '@/lib/api/dehub/stories';
import { getMediaUrl } from '@/lib/api/dehub/core';
import { useRefreshStoryShelf } from '@/hooks/use-story-shelf';
import type { StoryRemixSource } from '@/store/storiesStore';
import { composeOverlay, composePhoto, grabFrame, mentionBoxes, OUT_H, OUT_W, TEXT_COLORS, type TextLayer } from './story-compose';
import { shareMoment } from './story-upload';
import '@/styles/stories.css';

const MAX_VIDEO_S = 60;
const AUDIENCE_KEY = 'riftn.stories.audience';

type Media = { kind: 'photo' | 'video'; url: string; blob: Blob; duration?: number };
type Tool = null | 'text' | 'draw' | 'mention' | 'trim' | 'lifetime';

const uid = () => Math.random().toString(36).slice(2, 9);

export function StoryCreator({ onClose, remixSource }: { onClose: () => void; remixSource?: StoryRemixSource }) {
  const { t } = useTranslation();
  const refreshShelf = useRefreshStoryShelf();
  const [media, setMedia] = useState<Media | null>(null);
  const remixLabel = remixSource ? t('stories.remixing', { name: remixSource.name, defaultValue: "Remixing {{name}}'s moment" }) : undefined;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const body = (
    <div data-stories data-story-creator data-keep-dark role="dialog" aria-modal="true" aria-label={remixLabel ?? t('stories.newMoment', { defaultValue: 'New moment' })}>
      {media ? (
        <Editor
          media={media}
          remixSourceId={remixSource?.id}
          remixLabel={remixLabel}
          onBack={() => { URL.revokeObjectURL(media.url); setMedia(null); }}
          onClose={onClose}
          onShared={() => refreshShelf()}
        />
      ) : (
        <Capture onPicked={setMedia} onClose={onClose} remixLabel={remixLabel} />
      )}
    </div>
  );
  return createPortal(body, document.body);
}

// ── Step 1: record or pick ──────────────────────────────────────────

function Capture({ onPicked, onClose, remixLabel }: { onPicked: (m: Media) => void; onClose: () => void; remixLabel?: string }) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const holdRef = useRef<number | null>(null);
  const startedRef = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [camera, setCamera] = useState<'starting' | 'on' | 'off'>('starting');
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    let alive = true;
    setCamera('starting');
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: facing, width: { ideal: 1080 }, height: { ideal: 1920 } }, audio: true })
      .catch(() => navigator.mediaDevices.getUserMedia({ video: { facingMode: facing } }))
      .then(stream => {
        if (!alive) { stream.getTracks().forEach(tr => tr.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCamera('on');
      })
      .catch(() => alive && setCamera('off'));
    return () => {
      alive = false;
      streamRef.current?.getTracks().forEach(tr => tr.stop());
      streamRef.current = null;
    };
  }, [facing]);

  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => {
      const s = (performance.now() - startedRef.current) / 1000;
      setElapsed(s);
      if (s >= MAX_VIDEO_S) stopRecording();
    }, 100);
    return () => window.clearInterval(id);
  }, [recording]);

  const takePhoto = async () => {
    const v = videoRef.current;
    if (!v || camera !== 'on') return;
    const blob = await grabFrame(v, facing === 'user');
    onPicked({ kind: 'photo', blob, url: URL.createObjectURL(blob) });
  };

  const startRecording = () => {
    const stream = streamRef.current;
    if (!stream || typeof MediaRecorder === 'undefined') return;
    const type = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9,opus', 'video/webm'].find(m => MediaRecorder.isTypeSupported?.(m));
    const rec = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: 4_000_000 } : undefined);
    chunksRef.current = [];
    rec.ondataavailable = e => e.data.size && chunksRef.current.push(e.data);
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'video/webm' });
      const duration = (performance.now() - startedRef.current) / 1000;
      if (blob.size > 0) onPicked({ kind: 'video', blob, url: URL.createObjectURL(blob), duration: Math.min(MAX_VIDEO_S, duration) });
    };
    recRef.current = rec;
    startedRef.current = performance.now();
    rec.start(250);
    setRecording(true);
  };

  const stopRecording = () => {
    if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop();
    recRef.current = null;
    setRecording(false);
  };

  // Tap = photo, hold = video.
  const onShutterDown = () => {
    holdRef.current = window.setTimeout(() => { holdRef.current = null; startRecording(); }, 260);
  };
  const onShutterUp = () => {
    if (holdRef.current) {
      window.clearTimeout(holdRef.current);
      holdRef.current = null;
      void takePhoto();
    } else if (recording) {
      stopRecording();
    }
  };

  const onFile = (file?: File | null) => {
    if (!file) return;
    if (file.type.startsWith('image/')) {
      onPicked({ kind: 'photo', blob: file, url: URL.createObjectURL(file) });
    } else if (file.type.startsWith('video/')) {
      const url = URL.createObjectURL(file);
      const probe = document.createElement('video');
      probe.preload = 'metadata';
      probe.onloadedmetadata = () => onPicked({ kind: 'video', blob: file, url, duration: probe.duration || undefined });
      probe.onerror = () => onPicked({ kind: 'video', blob: file, url });
      probe.src = url;
    } else {
      toast.error(t('stories.pickPhotoOrVideo', { defaultValue: 'Pick a photo or a video.' }));
    }
  };

  return (
    <>
      <div data-sc-stage>
        {camera !== 'off' ? (
          <video ref={videoRef} autoPlay playsInline muted style={{ transform: facing === 'user' ? 'scaleX(-1)' : undefined }} />
        ) : (
          <div className="absolute inset-0 grid place-items-center p-8 text-center">
            <div>
              <p className="text-[17px] font-semibold mb-2">{t('stories.noCamera', { defaultValue: 'Camera is off' })}</p>
              <p className="text-[14px] text-white/70 mb-5">{t('stories.noCameraBody', { defaultValue: 'Pick a photo or video instead, or allow the camera in your browser.' })}</p>
              <button type="button" data-sc-chip data-st-dark-glass onClick={() => fileRef.current?.click()}>
                <Images className="w-4 h-4" />{t('stories.pick', { defaultValue: 'Pick from device' })}
              </button>
            </div>
          </div>
        )}
        {recording && (
          <div className="absolute left-1/2 -translate-x-1/2 top-[76px] z-[6] px-3 py-1 rounded-full bg-black/50 text-[13px] font-semibold tabular-nums">
            ● {Math.floor(elapsed)}s / {MAX_VIDEO_S}s
          </div>
        )}
      </div>
      <div data-sc-top>
        <button type="button" data-sc-btn data-st-dark-glass onClick={onClose} aria-label={t('common.close', { defaultValue: 'Close' })}><Close className="w-5 h-5" /></button>
        {remixLabel && <span data-sc-chip data-st-dark-glass className="min-w-0"><span className="truncate">{remixLabel}</span></span>}
        <span className="flex-1" />
        {camera === 'on' && (
          <button type="button" data-sc-btn data-st-dark-glass onClick={() => setFacing(f => (f === 'user' ? 'environment' : 'user'))} aria-label={t('stories.flip', { defaultValue: 'Flip camera' })}>
            <RefreshCw className="w-5 h-5" />
          </button>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={e => onFile(e.target.files?.[0])} />
      <div data-sc-bottom style={{ justifyContent: 'flex-start' }}>
        <button type="button" data-sc-btn data-st-dark-glass onClick={() => fileRef.current?.click()} aria-label={t('stories.pick', { defaultValue: 'Pick from device' })}>
          <Images className="w-5 h-5" />
        </button>
      </div>
      {camera === 'on' && !recording && (
        <span data-sc-hint>{t('stories.shutterHint', { defaultValue: 'Tap for photo, hold for video' })}</span>
      )}
      {camera === 'on' && (
        <button
          type="button"
          data-sc-shutter
          data-recording={recording ? 'true' : 'false'}
          aria-label={t('stories.shutter', { defaultValue: 'Take a photo, or hold to film' })}
          onPointerDown={onShutterDown}
          onPointerUp={onShutterUp}
          onPointerLeave={() => recording && stopRecording()}
          onContextMenu={e => e.preventDefault()}
        />
      )}
    </>
  );
}

// ── Step 2: add to it, then share ───────────────────────────────────

function useStageBox(ref: React.RefObject<HTMLDivElement>) {
  const [box, setBox] = useState({ w: 360, h: 640 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const r = el.getBoundingClientRect();
      const w = Math.min(r.width, (r.height * 9) / 16);
      setBox({ w, h: (w * 16) / 9 });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return box;
}

function Editor({ media, onBack, onClose, onShared, remixSourceId, remixLabel }: {
  media: Media;
  onBack: () => void;
  onClose: () => void;
  onShared: () => void;
  remixSourceId?: string;
  remixLabel?: string;
}) {
  const { t } = useTranslation();
  const areaRef = useRef<HTMLDivElement>(null);
  const box = useStageBox(areaRef);
  const imgRef = useRef<HTMLImageElement>(null);
  const drawRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<number>(0);
  const [drew, setDrew] = useState(false);
  const [layers, setLayers] = useState<TextLayer[]>([]);
  const [tool, setTool] = useState<Tool>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [penColor, setPenColor] = useState(TEXT_COLORS[0]);
  const [song, setSong] = useState<AttachedSound | null>(null);
  const [soundOpen, setSoundOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [trim, setTrim] = useState<[number, number]>([0, Math.min(MAX_VIDEO_S, media.duration || MAX_VIDEO_S)]);
  const [audience, setAudience] = useState<StoryAudience>(() => {
    try { return localStorage.getItem(AUDIENCE_KEY) === 'followers' ? 'followers' : 'everyone'; } catch { return 'everyone'; }
  });
  const [lifetime, setLifetime] = useState<StoryLifetime>(24);
  const lifetimeLabel = t('stories.lifetime', { defaultValue: 'Story duration' });
  const [busy, setBusy] = useState(false);
  const historyRef = useRef<ImageData[]>([]);

  const editingLayer = layers.find(l => l.id === editing) ?? null;

  // ── Drawing ───────────────────────────────────────────────────────
  useEffect(() => {
    const c = drawRef.current;
    if (!c) return;
    c.width = OUT_W;
    c.height = OUT_H;
  }, []);

  const drawing = useRef<{ x: number; y: number } | null>(null);
  const toCanvas = (e: React.PointerEvent) => {
    const r = drawRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * OUT_W, y: ((e.clientY - r.top) / r.height) * OUT_H };
  };
  const onDrawDown = (e: React.PointerEvent) => {
    if (tool !== 'draw') return;
    const ctx = drawRef.current!.getContext('2d')!;
    historyRef.current.push(ctx.getImageData(0, 0, OUT_W, OUT_H));
    if (historyRef.current.length > 20) historyRef.current.shift();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drawing.current = toCanvas(e);
  };
  const onDrawMove = (e: React.PointerEvent) => {
    if (tool !== 'draw' || !drawing.current) return;
    const ctx = drawRef.current!.getContext('2d')!;
    const p = toCanvas(e);
    ctx.strokeStyle = penColor;
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(drawing.current.x, drawing.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    drawing.current = p;
    strokesRef.current += 1;
    if (!drew) setDrew(true);
  };
  const onDrawUp = () => { drawing.current = null; };
  const undoDraw = () => {
    const prev = historyRef.current.pop();
    if (prev) drawRef.current!.getContext('2d')!.putImageData(prev, 0, 0);
    if (!historyRef.current.length) setDrew(false);
  };

  // ── Words ─────────────────────────────────────────────────────────
  const addText = () => {
    const layer: TextLayer = { id: uid(), kind: 'text', text: '', x: 0.5, y: 0.42, size: 0.075, color: TEXT_COLORS[0], box: false };
    setLayers(l => [...l, layer]);
    setEditing(layer.id);
    setTool('text');
  };
  const patch = (id: string, p: Partial<TextLayer>) => setLayers(l => l.map(x => (x.id === id ? { ...x, ...p } : x)));
  const finishText = () => {
    setLayers(l => l.filter(x => x.text.trim()));
    setEditing(null);
    setTool(null);
  };

  const dragRef = useRef<{ id: string; dx: number; dy: number; moved: boolean } | null>(null);
  const onLayerDown = (e: React.PointerEvent, layer: TextLayer) => {
    if (tool === 'draw') return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const stage = areaRef.current!.querySelector('[data-sc-canvas]')!.getBoundingClientRect();
    dragRef.current = { id: layer.id, dx: e.clientX - (stage.left + layer.x * stage.width), dy: e.clientY - (stage.top + layer.y * stage.height), moved: false };
  };
  const onLayerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const stage = areaRef.current!.querySelector('[data-sc-canvas]')!.getBoundingClientRect();
    const x = Math.min(0.95, Math.max(0.05, (e.clientX - d.dx - stage.left) / stage.width));
    const y = Math.min(0.95, Math.max(0.05, (e.clientY - d.dy - stage.top) / stage.height));
    d.moved = true;
    patch(d.id, { x, y });
  };
  const onLayerUp = (layer: TextLayer) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (d && !d.moved && layer.kind === 'text') {
      setEditing(layer.id);
      setTool('text');
    }
  };

  // ── Mentions ──────────────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<DeHubUser[]>([]);
  useEffect(() => {
    if (tool !== 'mention') return;
    const q = query.trim();
    if (q.length < 2) { setPeople([]); return; }
    const id = window.setTimeout(() => {
      searchUsersForDM(q, 0, 8).then(r => setPeople(r.items)).catch(() => setPeople([]));
    }, 220);
    return () => window.clearTimeout(id);
  }, [query, tool]);
  const addMention = (u: DeHubUser) => {
    if (!u.address) return;
    const name = u.username || u.address.slice(0, 8);
    setLayers(l => [...l, { id: uid(), kind: 'mention', text: `@${name}`, x: 0.5, y: 0.6, size: 0.06, color: '#ffffff', box: true, address: u.address!.toLowerCase() }]);
    setQuery('');
    setPeople([]);
    setTool(null);
  };

  // ── Song ──────────────────────────────────────────────────────────
  const songAudio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    songAudio.current?.pause();
    if (!song) return;
    const a = new Audio(song.url.split('#')[0]);
    a.loop = true;
    a.currentTime = soundWindow(song.url)?.start ?? 0;
    a.play().catch(() => {});
    songAudio.current = a;
    return () => a.pause();
  }, [song]);

  // ── Video preview loop inside the trim ───────────────────────────
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const loop = () => {
      if (v.currentTime >= trim[1] || v.currentTime < trim[0] - 0.2) v.currentTime = trim[0];
    };
    v.addEventListener('timeupdate', loop);
    return () => v.removeEventListener('timeupdate', loop);
  }, [trim]);

  // ── Share ─────────────────────────────────────────────────────────
  const share = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      try { localStorage.setItem(AUDIENCE_KEY, audience); } catch { /* private mode */ }
      const visible = layers.filter(l => l.text.trim());
      const mentions = mentionBoxes(visible);
      let songField: StorySong | null = null;
      if (song) {
        const raw = song.url.split('#')[0];
        const audioUrl = /^https:\/\//.test(raw) ? raw : getMediaUrl(raw);
        if (audioUrl && /^https:\/\//.test(audioUrl)) {
          songField = {
            title: song.title,
            artist: song.creator,
            audioUrl,
            artworkUrl: song.creatorAvatar && /^https:\/\//.test(song.creatorAvatar) ? song.creatorAvatar : undefined,
            startMs: Math.round((soundWindow(song.url)?.start ?? 0) * 1000),
            source: song.source,
          };
        }
      }
      const fields = { audience, expiresInHours: lifetime, mentions, song: songField, muted: media.kind === 'video' ? muted : false, remixSourceId };
      if (media.kind === 'photo') {
        const img = imgRef.current!;
        if (!img.complete) await new Promise(r => { img.onload = r; });
        const blob = await composePhoto(img, drew ? drawRef.current : null, visible);
        shareMoment({ kind: 'photo', file: blob, preview: URL.createObjectURL(blob), fields }, onShared);
      } else {
        const overlay = await composeOverlay(drawRef.current, drew, visible);
        const poster = await videoPoster(videoRef.current);
        shareMoment({
          kind: 'video',
          file: media.blob,
          overlay,
          preview: poster || '',
          fields: { ...fields, trimStart: trim[0], trimEnd: trim[1] },
        }, onShared);
      }
      songAudio.current?.pause();
      onClose();
    } catch {
      toast.error(t('stories.couldNotPrepare', { defaultValue: "Couldn't get your moment ready. Try again." }));
      setBusy(false);
    }
  }, [busy, audience, lifetime, layers, song, media, muted, drew, trim, remixSourceId, onShared, onClose, t]);

  const isVideo = media.kind === 'video';
  const duration = media.duration || MAX_VIDEO_S;
  const fontPx = (l: TextLayer) => l.size * box.w;

  return (
    <>
      <div ref={areaRef} data-sc-stage style={{ background: 'transparent', display: 'grid', placeItems: 'center' }}>
        <div
          data-sc-canvas
          className="relative overflow-hidden rounded-[20px] bg-black"
          style={{ width: box.w, height: box.h }}
          onPointerMove={onLayerMove}
        >
          {isVideo ? (
            <video ref={videoRef} src={media.url} autoPlay loop playsInline muted={muted || !!song} className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <PhotoPreview imgRef={imgRef} url={media.url} />
          )}
          <canvas
            ref={drawRef}
            data-sc-draw
            className="absolute inset-0 w-full h-full"
            style={{ pointerEvents: tool === 'draw' ? 'auto' : 'none', touchAction: 'none' }}
            onPointerDown={onDrawDown}
            onPointerMove={onDrawMove}
            onPointerUp={onDrawUp}
            onPointerCancel={onDrawUp}
          />
          {layers.map(l => (
            <div
              key={l.id}
              data-sc-text
              style={{
                left: `${l.x * 100}%`,
                top: `${l.y * 100}%`,
                fontSize: fontPx(l),
                color: l.box && l.color.toLowerCase() !== '#ffffff' ? l.color : l.box ? '#fff' : l.color,
                textShadow: l.box ? undefined : '0 2px 14px rgba(0,0,0,.45)',
                outline: editing === l.id ? '1px dashed rgba(255,255,255,.6)' : undefined,
              }}
              onPointerDown={e => onLayerDown(e, l)}
              onPointerUp={() => onLayerUp(l)}
            >
              <span style={{ background: l.box ? (l.color.toLowerCase() === '#ffffff' ? 'rgba(0,0,0,.45)' : 'rgba(255,255,255,.92)') : undefined }}>
                {l.text || ' '}
              </span>
            </div>
          ))}
          {song && (
            <div data-sv-song data-st-dark-glass style={{ top: 72 }}>
              <Music className="w-4 h-4" />
              <span>{song.title}{song.creator ? ` · ${song.creator}` : ''}</span>
              <button type="button" className="ml-1 opacity-80" onClick={() => setSong(null)} aria-label={t('stories.removeSong', { defaultValue: 'Remove song' })}><Close className="w-3.5 h-3.5" /></button>
            </div>
          )}
        </div>
      </div>

      <div data-sc-top>
        <button type="button" data-sc-btn data-st-dark-glass onClick={onBack} aria-label={t('common.back', { defaultValue: 'Back' })}><Close className="w-5 h-5" /></button>
        {remixLabel && <span data-sc-chip data-st-dark-glass className="min-w-0"><span className="truncate">{remixLabel}</span></span>}
        <span className="flex-1" />
      </div>

      <div data-sc-tools>
        <button type="button" data-sc-btn data-st-dark-glass data-on={tool === 'text' ? 'true' : 'false'} onClick={addText} aria-label={t('stories.text', { defaultValue: 'Text' })}><Type className="w-5 h-5" /></button>
        <button type="button" data-sc-btn data-st-dark-glass data-on={tool === 'draw' ? 'true' : 'false'} onClick={() => setTool(tl => (tl === 'draw' ? null : 'draw'))} aria-label={t('stories.draw', { defaultValue: 'Draw' })}><Pencil className="w-5 h-5" /></button>
        <button type="button" data-sc-btn data-st-dark-glass data-on={song ? 'true' : 'false'} onClick={() => setSoundOpen(true)} aria-label={t('stories.song', { defaultValue: 'Song' })}><Music className="w-5 h-5" /></button>
        <button type="button" data-sc-btn data-st-dark-glass data-on={tool === 'mention' ? 'true' : 'false'} onClick={() => setTool(tl => (tl === 'mention' ? null : 'mention'))} aria-label={t('stories.mention', { defaultValue: 'Mention someone' })}><AtSign className="w-5 h-5" /></button>
        {isVideo && (
          <>
            <button type="button" data-sc-btn data-st-dark-glass data-on={tool === 'trim' ? 'true' : 'false'} onClick={() => setTool(tl => (tl === 'trim' ? null : 'trim'))} aria-label={t('stories.trim', { defaultValue: 'Trim' })}><Scissors className="w-5 h-5" /></button>
            <button type="button" data-sc-btn data-st-dark-glass data-on={muted ? 'true' : 'false'} onClick={() => setMuted(m => !m)} aria-label={muted ? t('stories.unmute', { defaultValue: 'Sound on' }) : t('stories.mute', { defaultValue: 'Mute' })}>
              {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
          </>
        )}
      </div>

      {!tool && (
        <div data-sc-bottom>
          <button
            type="button"
            data-sc-chip
            data-st-dark-glass
            onClick={() => setAudience(a => (a === 'everyone' ? 'followers' : 'everyone'))}
          >
            {audience === 'everyone' ? <Globe2 className="w-4 h-4" /> : <Users className="w-4 h-4" />}
            {audience === 'everyone' ? t('stories.everyone', { defaultValue: 'Everyone' }) : t('stories.followersOnly', { defaultValue: 'Followers' })}
          </button>
          <button type="button" data-sc-chip data-st-dark-glass onClick={() => setTool('lifetime')} aria-label={`${lifetimeLabel}, ${lifetime}h`}>
            {lifetime}h
          </button>
          <button type="button" data-sc-share onClick={share} disabled={busy}>
            {t('stories.share', { defaultValue: 'Share' })}
          </button>
        </div>
      )}

      {tool === 'lifetime' && (
        <div data-sc-panel data-sc-text-panel>
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">{lifetimeLabel}</p>
            <button type="button" data-sc-btn data-st-dark-glass onClick={() => setTool(null)} aria-label={t('common.close', { defaultValue: 'Close' })}><Close className="size-[18px]" /></button>
          </div>
          <div className="flex gap-2">
            {STORY_LIFETIMES.map(hours => (
              <button key={hours} type="button" data-sc-chip data-st-dark-glass aria-pressed={hours === lifetime}
                data-on={hours === lifetime ? 'true' : 'false'}
                onClick={() => { setLifetime(hours); setTool(null); }}>
                {hours}h
              </button>
            ))}
          </div>
        </div>
      )}

      {tool === 'text' && editingLayer && (
        <div data-sc-panel data-sc-text-panel onPointerDown={e => e.stopPropagation()}>
          <textarea
            autoFocus
            value={editingLayer.text}
            maxLength={200}
            rows={2}
            onChange={e => patch(editingLayer.id, { text: e.target.value })}
            placeholder={t('stories.typeSomething', { defaultValue: 'Type something' })}
            className="w-full bg-transparent text-white text-[17px] outline-none resize-none mb-3 placeholder:text-white/50"
          />
          <div data-sc-swatches className="mb-3">
            {TEXT_COLORS.map(c => (
              <button key={c} type="button" style={{ background: c }} data-on={editingLayer.color === c ? 'true' : 'false'} onClick={() => patch(editingLayer.id, { color: c })} aria-label={c} />
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button type="button" data-sc-chip data-st-dark-glass data-on={editingLayer.box ? 'true' : 'false'} onClick={() => patch(editingLayer.id, { box: !editingLayer.box })}>
              {editingLayer.box ? t('stories.boxOn', { defaultValue: 'Box on' }) : t('stories.boxOff', { defaultValue: 'Box off' })}
            </button>
            <input type="range" min={0.045} max={0.14} step={0.005} value={editingLayer.size} onChange={e => patch(editingLayer.id, { size: Number(e.target.value) })} className="flex-1" aria-label={t('stories.size', { defaultValue: 'Size' })} />
            <button type="button" data-sc-btn data-st-dark-glass onClick={finishText} aria-label={t('common.done', { defaultValue: 'Done' })}><Check className="w-5 h-5" /></button>
          </div>
        </div>
      )}

      {tool === 'draw' && (
        <div data-sc-bottom>
          <div data-sc-swatches className="flex-1">
            {TEXT_COLORS.map(c => (
              <button key={c} type="button" style={{ background: c }} data-on={penColor === c ? 'true' : 'false'} onClick={() => setPenColor(c)} aria-label={c} />
            ))}
          </div>
          <button type="button" data-sc-btn data-st-dark-glass onClick={undoDraw} aria-label={t('common.undo', { defaultValue: 'Undo' })}><Undo2 className="w-5 h-5" /></button>
          <button type="button" data-sc-btn data-st-dark-glass onClick={() => setTool(null)} aria-label={t('common.done', { defaultValue: 'Done' })}><Check className="w-5 h-5" /></button>
        </div>
      )}

      {tool === 'mention' && (
        <div data-sc-panel data-st-dark-glass onPointerDown={e => e.stopPropagation()}>
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t('stories.searchPeople', { defaultValue: 'Search people' })}
            className="w-full h-11 rounded-full px-4 bg-white/10 text-white outline-none mb-2 placeholder:text-white/50"
          />
          {people.map(u => (
            <button key={u.address || u._id} type="button" className="w-full flex items-center gap-3 py-2 text-left" onClick={() => addMention(u)}>
              <span className="w-8 h-8 rounded-full bg-white/15 shrink-0" />
              <span className="min-w-0">
                <span className="block text-[14px] font-medium truncate">{u.displayName || u.username}</span>
                {u.username && <span className="block text-[12px] text-white/60 truncate">@{u.username}</span>}
              </span>
            </button>
          ))}
        </div>
      )}

      {tool === 'trim' && isVideo && (
        <div data-sc-panel data-st-dark-glass onPointerDown={e => e.stopPropagation()}>
          <p className="text-[14px] font-semibold mb-1">{t('stories.trimTitle', { defaultValue: 'Keep up to 60 seconds' })}</p>
          <p className="text-[12px] text-white/60 mb-3 tabular-nums">{trim[0].toFixed(1)}s – {trim[1].toFixed(1)}s</p>
          <label className="block text-[12px] text-white/70 mb-1">{t('stories.start', { defaultValue: 'Start' })}</label>
          <input
            type="range" min={0} max={Math.max(0, duration - 0.5)} step={0.1} value={trim[0]} className="w-full mb-3"
            onChange={e => { const s = Number(e.target.value); setTrim(([, end]) => [s, Math.min(Math.max(end, s + 0.5), s + MAX_VIDEO_S, duration)]); }}
          />
          <label className="block text-[12px] text-white/70 mb-1">{t('stories.end', { defaultValue: 'End' })}</label>
          <input
            type="range" min={0.5} max={duration} step={0.1} value={trim[1]} className="w-full mb-3"
            onChange={e => { const end = Number(e.target.value); setTrim(([s]) => [Math.max(Math.min(s, end - 0.5), end - MAX_VIDEO_S, 0), end]); }}
          />
          <button type="button" data-sc-chip data-st-dark-glass onClick={() => setTool(null)}><Check className="w-4 h-4" />{t('common.done', { defaultValue: 'Done' })}</button>
        </div>
      )}

      {soundOpen && (
        <SoundPicker
          isOpen={soundOpen}
          onClose={() => setSoundOpen(false)}
          onSelect={s => setSong(s)}
          currentSound={song}
          clipSeconds={isVideo ? Math.round(trim[1] - trim[0]) : 15}
        />
      )}
    </>
  );
}

function PhotoPreview({ imgRef, url }: { imgRef: React.RefObject<HTMLImageElement>; url: string }) {
  const [wide, setWide] = useState(false);
  return (
    <>
      {wide && <img src={url} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ filter: 'blur(40px) brightness(0.6)', transform: 'scale(1.2)' }} />}
      <img
        ref={imgRef}
        data-sc-media
        src={url}
        alt=""
        draggable={false}
        className="absolute inset-0 w-full h-full"
        style={{ objectFit: wide ? 'contain' : 'cover' }}
        onLoad={e => setWide(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight > 0.75)}
      />
    </>
  );
}

/** A still of the clip for your tile while it uploads. */
async function videoPoster(video: HTMLVideoElement | null): Promise<string | null> {
  if (!video || !video.videoWidth) return null;
  try {
    const c = document.createElement('canvas');
    c.width = 270;
    c.height = 480;
    const ctx = c.getContext('2d')!;
    const scale = Math.max(c.width / video.videoWidth, c.height / video.videoHeight);
    const w = video.videoWidth * scale;
    const h = video.videoHeight * scale;
    ctx.drawImage(video, (c.width - w) / 2, (c.height - h) / 2, w, h);
    return c.toDataURL('image/jpeg', 0.8);
  } catch {
    return null;
  }
}

export default StoryCreator;

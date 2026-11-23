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
import { AtSign, Sticker, Wand2, Timer, Pencil, RefreshCw, RotateCw, Type, Undo2, Users, Globe2, Volume2, VolumeX, Scissors } from 'lucide-react';
import Back from '@/components/ui/cut-icons/back';
import Close from '@/components/ui/cut-icons/close';
import Images from '@/components/ui/cut-icons/images';
import Music from '@/components/ui/cut-icons/music';
import Check from '@/components/ui/cut-icons/check';
import { SoundPicker } from '@/features/post/components/SoundPicker';
import type { AttachedSound } from '@/features/post/hooks/usePostSound';
import { bindSoundWindow, soundWindow } from '@/lib/sound-window';
import { searchUsersForDM } from '@/lib/api/dehub/dm';
import type { DeHubUser } from '@/lib/api/dehub';
import { getStoryShelf, STORY_LIFETIMES, type StoryAudience, type StoryLifetime, type StorySong } from '@/lib/api/dehub/stories';
import { getMediaUrl } from '@/lib/api/dehub/core';
import { useRefreshStoryShelf } from '@/hooks/use-story-shelf';
import { useQuery } from '@tanstack/react-query';
import type { StoryRemixSource } from '@/store/storiesStore';
import { backdropCss, composeOverlay, composePhoto, grabFrame, mentionBoxes, OUT_H, OUT_W, PHOTO_BACKDROPS, PHOTO_LOOKS, TEXT_COLORS, type PhotoBackdrop, type PhotoLook, type TextLayer } from './story-compose';
import { CAPTION_FONTS, captionFonts, captionFontStyle, type CaptionFont } from "./caption-fonts";
import { shareMoment } from './story-upload';
import '@/styles/stories.css';

const MAX_VIDEO_S = 60;
const AUDIENCE_KEY = 'riftn.stories.audience';
/** The saved Close friends list (people picked once, reused for "Only selected people"). */
const CLOSE_FRIENDS_KEY = 'riftn.stories.closeFriends';
function readCloseFriends(): DeHubUser[] {
  try {
    const list = JSON.parse(localStorage.getItem(CLOSE_FRIENDS_KEY) || '[]');
    return Array.isArray(list) ? list.filter((u: DeHubUser) => u && typeof u.address === 'string').slice(0, 50) : [];
  } catch { return []; }
}

type Media = { kind: 'photo' | 'video'; url: string; blob: Blob; duration?: number };
type Tool = null | 'text' | 'draw' | 'mention' | 'trim' | 'timer' | 'lifetime' | 'audience' | 'sticker' | 'effects';

/** Stickers are big glyph layers: emoji keep their own colours, the shapes take the text colour. */
const STICKER_EMOJI = ['🔥', '😂', '😍', '🥳', '👀', '💯', '🎉', '❤️', '✨', '👏', '🙌', '😎', '🤯', '🫶', '🙏', '💀', '🚀', '⚡', '🌙', '☀️'];
const STICKER_SHAPES = ['→', '←', '↑', '↓', '↗', '↘', '➜', '○', '✓', '✗', '★', '♥', '!', '?'];

const uid = () => Math.random().toString(36).slice(2, 9);

export function StoryCreator({ onClose, remixSource }: { onClose: () => void; remixSource?: StoryRemixSource }) {
  const { t } = useTranslation();
  const refreshShelf = useRefreshStoryShelf();
  const { data: storyCapabilities } = useQuery({
    queryKey: ['story-posting-capabilities'],
    queryFn: async () => getStoryShelf('', false).then(({ supportsCustomAudience, supportsCustomLifetime, supportsPhotoDuration }) => ({ supportsCustomAudience, supportsCustomLifetime, supportsPhotoDuration })),
    staleTime: 60_000,
    retry: false,
  });
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
          customLifetime={!!storyCapabilities?.supportsCustomLifetime} customAudience={!!storyCapabilities?.supportsCustomAudience} customPhotoDuration={!!storyCapabilities?.supportsPhotoDuration}
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
        <button type="button" data-sc-btn data-sc-close onClick={onClose} aria-label={t('common.close', { defaultValue: 'Close' })}><Close className="w-5 h-5" /></button>
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

function Editor({ media, onBack, onClose, onShared, remixSourceId, remixLabel, customLifetime, customAudience, customPhotoDuration }: {
  media: Media;
  onBack: () => void;
  onClose: () => void;
  onShared: () => void;
  remixSourceId?: string;
  remixLabel?: string;
  customLifetime: boolean;
  customAudience: boolean;
  customPhotoDuration: boolean;
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
  const [photoSeconds, setPhotoSeconds] = useState(5);
  const [look, setLook] = useState<PhotoLook>('none');
  const [backdrop, setBackdrop] = useState<PhotoBackdrop>('blur');
  const [trim, setTrim] = useState<[number, number]>([0, Math.min(MAX_VIDEO_S, media.duration || MAX_VIDEO_S)]);
  const [audience, setAudience] = useState<StoryAudience>(() => {
    try { return localStorage.getItem(AUDIENCE_KEY) === 'followers' ? 'followers' : 'everyone'; } catch { return 'everyone'; }
  });
  const [audiencePeople, setAudiencePeople] = useState<DeHubUser[]>([]);
  const restrictPeople = audience === 'selected' || audience === 'except';
  const audienceLabels = {
    everyone: t('stories.everyone', { defaultValue: 'Everyone' }),
    followers: t('stories.followersOnly', { defaultValue: 'Followers' }),
    selected: t('stories.selectedPeople', { defaultValue: 'Only selected people' }),
    except: t('stories.hideFromPeople', { defaultValue: 'Hide from selected people' }),
  };
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
  const addSticker = (glyph: string) => {
    const layer: TextLayer = { id: uid(), kind: 'text', text: glyph, x: 0.5, y: 0.45, size: 0.16, color: TEXT_COLORS[0], box: false };
    setLayers(l => [...l, layer]);
    setTool(null);
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
    if (tool !== 'mention' && tool !== 'audience') return;
    const q = query.trim().replace(/^@/, '');
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
  const selectSong = (next: AttachedSound | null) => {
    songAudio.current?.pause();
    setSong(next);
    if (!next) return;
    // Keep playback inside the selection tap for iOS Safari.
    const audio = songAudio.current ?? new Audio();
    songAudio.current = audio;
    bindSoundWindow(audio);
    audio.src = next.url;
    audio.loop = true;
    void audio.play().catch(() => {});
  };
  useEffect(() => () => songAudio.current?.pause(), []);

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
    if (busy || (restrictPeople && !audiencePeople.length)) return;
    setBusy(true);
    try {
      try { if (!restrictPeople) localStorage.setItem(AUDIENCE_KEY, audience); } catch { /* private mode */ }
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
      const fields = { audience, audienceAddresses: restrictPeople ? audiencePeople.map(user => user.address!) : undefined, expiresInHours: customLifetime ? lifetime : undefined, mentions, song: songField, muted: media.kind === 'video' ? muted : false, remixSourceId };
      if (media.kind === 'photo') {
        const img = imgRef.current!;
        if (!img.complete) await new Promise(r => { img.onload = r; });
        const blob = await composePhoto(img, drew ? drawRef.current : null, visible, look, backdrop);
        shareMoment({ kind: 'photo', file: blob, preview: URL.createObjectURL(blob), fields: { ...fields, photoDurationSeconds: customPhotoDuration ? photoSeconds : undefined } }, onShared);
      } else {
        const overlay = await composeOverlay(drawRef.current, drew, visible);
        shareMoment({
          kind: 'video',
          file: media.blob,
          overlay,
          preview: '',
          fields: { ...fields, trimStart: trim[0], trimEnd: trim[1] },
        }, onShared);
      }
      songAudio.current?.pause();
      onClose();
    } catch {
      toast.error(t('stories.couldNotPrepare', { defaultValue: "Couldn't get your moment ready. Try again." }));
      setBusy(false);
    }
  }, [busy, audience, audiencePeople, restrictPeople, customLifetime, lifetime, layers, song, media, muted, drew, trim, photoSeconds, customPhotoDuration, remixSourceId, onShared, onClose, t]);

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
            <PhotoPreview imgRef={imgRef} url={media.url} look={look} backdrop={backdrop} />
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
                transform: `translate(-50%, -50%) rotate(${l.rotation ?? 0}deg)`,
                ...captionFontStyle(l.font),
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
              <button type="button" className="ml-1 opacity-80" onClick={() => selectSong(null)} aria-label={t('stories.removeSong', { defaultValue: 'Remove song' })}><Close className="w-3.5 h-3.5" /></button>
            </div>
          )}
        </div>
      </div>

      <div data-sc-top>
        <button type="button" data-sc-btn data-st-dark-glass onClick={onBack} aria-label={t('common.back', { defaultValue: 'Back' })}><Back className="w-5 h-5" /></button>
        <button type="button" data-sc-btn data-sc-close onClick={() => { URL.revokeObjectURL(media.url); onClose(); }} aria-label={t('common.close', { defaultValue: 'Close' })}><Close className="w-5 h-5" /></button>
        {remixLabel && <span data-sc-chip data-st-dark-glass className="min-w-0"><span className="truncate">{remixLabel}</span></span>}
        <span className="flex-1" />
      </div>

      <div data-sc-tools>
        {!isVideo && customPhotoDuration && (
          <button type="button" data-sc-btn data-st-dark-glass data-on={tool === 'timer' ? 'true' : 'false'}
            onClick={() => setTool(tl => tl === 'timer' ? null : 'timer')}
            aria-label={t('liveStudio.fields.duration', { defaultValue: 'Seconds on screen' })}>
            <Timer className="w-5 h-5" />
          </button>
        )}
        <button type="button" data-sc-btn data-st-dark-glass data-on={tool === 'text' ? 'true' : 'false'} onClick={addText} aria-label={t('stories.text', { defaultValue: 'Text' })}><Type className="w-5 h-5" /></button>
        {!isVideo && (
          <button type="button" data-sc-btn data-st-dark-glass data-on={tool === 'effects' || look !== 'none' ? 'true' : 'false'} onClick={() => setTool(tl => (tl === 'effects' ? null : 'effects'))} aria-label={t('stories.effects', { defaultValue: 'Effects' })}><Wand2 className="w-5 h-5" /></button>
        )}
        <button type="button" data-sc-btn data-st-dark-glass data-on={tool === 'sticker' ? 'true' : 'false'} onClick={() => setTool(tl => (tl === 'sticker' ? null : 'sticker'))} aria-label={t('stories.stickers', { defaultValue: 'Stickers' })}><Sticker className="w-5 h-5" /></button>
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
            onClick={() => { setQuery(''); setPeople([]); setTool('audience'); }}
          >
            {audience === 'everyone' ? <Globe2 className="w-4 h-4" /> : <Users className="w-4 h-4" />}
            {audienceLabels[audience]}
          </button>
          {customLifetime ? (
            <button type="button" data-sc-chip data-st-dark-glass onClick={() => setTool('lifetime')} aria-label={`${lifetimeLabel}, ${lifetime}h`}>
              {lifetime}h
            </button>
          ) : <span data-sc-chip data-st-dark-glass>24h</span>}
          <button type="button" data-sc-share onClick={share} disabled={busy || (restrictPeople && !audiencePeople.length)}>
            {t('stories.share', { defaultValue: 'Share' })}
          </button>
        </div>
      )}

      {tool === 'audience' && (
        <div data-sc-panel data-sc-text-panel className="max-h-[70dvh] overflow-y-auto">
          <div className="mb-2 flex items-center justify-between">
            <strong>{t('settings.privacy', { defaultValue: 'Privacy' })}</strong>
            <button type="button" data-sc-chip data-st-dark-glass onClick={() => { setQuery(''); setTool(null); }}>
              {t('common.done', { defaultValue: 'Done' })}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(audienceLabels) as StoryAudience[]).filter(mode => customAudience || mode === 'everyone' || mode === 'followers').map(mode => (
              <button key={mode} type="button" data-sc-chip data-st-dark-glass aria-pressed={audience === mode}
                onClick={() => { if (audience !== mode) setAudiencePeople([]); setAudience(mode); }}>
                {audience === mode && <Check className="size-4" />}{audienceLabels[mode]}
              </button>
            ))}
          </div>
          {customAudience && (
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" data-sc-chip data-st-dark-glass data-sc-close-friends
                disabled={!readCloseFriends().length}
                onClick={() => { setAudience('selected'); setAudiencePeople(readCloseFriends()); }}>
                {t('stories.closeFriends', { defaultValue: 'Close friends' })} ({readCloseFriends().length})
              </button>
              {audience === 'selected' && audiencePeople.length > 0 && (
                <button type="button" data-sc-chip data-st-dark-glass
                  onClick={() => {
                    try { localStorage.setItem(CLOSE_FRIENDS_KEY, JSON.stringify(audiencePeople.map(u => ({ address: u.address, username: u.username, displayName: u.displayName })))); } catch { /* private mode */ }
                    toast.success(t('stories.closeFriendsSaved', { defaultValue: 'Saved as your Close friends' }));
                  }}>
                  {t('stories.saveCloseFriends', { defaultValue: 'Save as Close friends' })}
                </button>
              )}
            </div>
          )}
          {restrictPeople && (
            <>
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t('common.search', { defaultValue: 'Search' })}
                aria-label={t('common.search', { defaultValue: 'Search' })} className="my-2 w-full rounded-full bg-white/10 px-4 py-2" />
              {audiencePeople.map(user => (
                <button key={user.address} type="button" data-sc-chip data-st-dark-glass
                  onClick={() => setAudiencePeople(current => current.filter(item => item.address !== user.address))}>@{user.username} ×</button>
              ))}
              {people.filter(user => user.address && user.username && !audiencePeople.some(item => item.address === user.address)).map(user => (
                <button type="button" key={user.address} className="block py-2" disabled={audiencePeople.length >= 50}
                  onClick={() => { setAudiencePeople(current => [...current, user]); setQuery(''); setPeople([]); }}>
                  {user.displayName} @{user.username}
                </button>
              ))}
            </>
          )}
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
            style={captionFontStyle(editingLayer.font)}
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
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" data-sc-chip data-st-dark-glass data-on={editingLayer.box ? 'true' : 'false'} onClick={() => patch(editingLayer.id, { box: !editingLayer.box })}>
              {editingLayer.box ? t('stories.boxOn', { defaultValue: 'Box on' }) : t('stories.boxOff', { defaultValue: 'Box off' })}
            </button>
            <button type="button" data-sc-chip data-st-dark-glass
              aria-label={`${t('dmVideo.rotate', { defaultValue: 'Rotate' })} · ${editingLayer.rotation ?? 0}°`}
              onClick={() => patch(editingLayer.id, { rotation: ((editingLayer.rotation ?? 0) + 45) % 360 })}>
              <RotateCw className="w-4 h-4" />{editingLayer.rotation ?? 0}°
            </button>
            <select
              data-sc-caption-font
              aria-label={t('stories.captionFont', { defaultValue: 'Caption font' })}
              className="rounded-lg bg-zinc-800 px-2 py-1.5 text-sm text-white"
              value={editingLayer.font ?? 'classic'}
              onChange={event => patch(editingLayer.id, { font: event.target.value as CaptionFont })}
            >
              {captionFonts.map(id => (
                <option key={id} value={id} style={captionFontStyle(id)}>
                  {t(`stories.captionStyles.${id}`, { defaultValue: CAPTION_FONTS[id].label })}
                </option>
              ))}
            </select>
            <input type="range" min={0.045} max={0.14} step={0.005} value={editingLayer.size} onChange={e => patch(editingLayer.id, { size: Number(e.target.value) })} className="flex-1" aria-label={t('articles.textSize', { defaultValue: 'Text size' })} />
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

      {tool === 'effects' && !isVideo && (
        <div data-sc-panel data-st-dark-glass data-sc-effects onPointerDown={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-white text-sm font-semibold">{t('stories.effects', { defaultValue: 'Effects' })}</span>
            <button type="button" data-sc-btn data-st-dark-glass onClick={() => setTool(null)} aria-label={t('common.done', { defaultValue: 'Done' })}><Check className="w-5 h-5" /></button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {(Object.keys(PHOTO_LOOKS) as PhotoLook[]).map(key => (
              <button key={key} type="button" data-sc-chip data-st-dark-glass aria-pressed={look === key} onClick={() => setLook(key)}>
                {look === key && <Check className="size-4" />}{t(`stories.looks.${key}`, { defaultValue: key === 'none' ? 'Original' : key[0].toUpperCase() + key.slice(1) })}
              </button>
            ))}
          </div>
          <span className="block text-white/60 text-xs mb-1">{t('stories.backdrop', { defaultValue: 'Background (shows around wide photos)' })}</span>
          <div className="flex gap-2 overflow-x-auto">
            {(Object.keys(PHOTO_BACKDROPS) as PhotoBackdrop[]).map(key => (
              <button key={key} type="button" aria-pressed={backdrop === key} onClick={() => setBackdrop(key)}
                aria-label={t(`stories.backdrops.${key}`, { defaultValue: key })}
                className="size-10 shrink-0 rounded-full border-2"
                style={{ borderColor: backdrop === key ? '#fff' : 'rgba(255,255,255,.25)', background: backdropCss(key) ?? 'rgba(255,255,255,.15)' }}>
                {key === 'blur' && <span className="text-[10px] text-white">{t('stories.backdrops.blur', { defaultValue: 'Blur' })}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {tool === 'sticker' && (
        <div data-sc-panel data-st-dark-glass data-sc-stickers onPointerDown={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-white text-sm font-semibold">{t('stories.stickers', { defaultValue: 'Stickers' })}</span>
            <button type="button" data-sc-btn data-st-dark-glass onClick={() => setTool(null)} aria-label={t('common.close', { defaultValue: 'Close' })}><Close className="size-[18px]" /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-2">
            {STICKER_EMOJI.map(g => (
              <button key={g} type="button" className="h-11 rounded-xl text-[26px] leading-none hover:bg-white/10" onClick={() => addSticker(g)} aria-label={g}>{g}</button>
            ))}
          </div>
          <span className="block text-white/60 text-xs mb-1">{t('stories.shapes', { defaultValue: 'Arrows and shapes. Tap one after adding it to change its colour, size or angle.' })}</span>
          <div className="grid grid-cols-7 gap-1">
            {STICKER_SHAPES.map(g => (
              <button key={g} type="button" className="h-11 rounded-xl text-[24px] leading-none font-bold text-white hover:bg-white/10" onClick={() => addSticker(g)} aria-label={g}>{g}</button>
            ))}
          </div>
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

      {tool === 'timer' && !isVideo && (
        <div data-sc-panel data-st-dark-glass onPointerDown={e => e.stopPropagation()}>
          <label className="block text-sm font-semibold">
            {t('liveStudio.fields.duration', { defaultValue: 'Seconds on screen' })} · {photoSeconds}s
            <input type="range" min={1} max={60} step={1} value={photoSeconds} className="my-3 w-full"
              onChange={e => setPhotoSeconds(e.target.valueAsNumber)} />
          </label>
          <button type="button" data-sc-chip data-st-dark-glass onClick={() => setTool(null)}>
            <Check className="w-4 h-4" />{t('common.done', { defaultValue: 'Done' })}
          </button>
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
          aboveMomentEditor
          onSelect={selectSong}
          currentSound={song}
          clipSeconds={isVideo ? Math.round(trim[1] - trim[0]) : photoSeconds}
        />
      )}
    </>
  );
}

function PhotoPreview({ imgRef, url, look = 'none', backdrop = 'blur' }: { imgRef: React.RefObject<HTMLImageElement>; url: string; look?: PhotoLook; backdrop?: PhotoBackdrop }) {
  const [wide, setWide] = useState(false);
  const fill = backdropCss(backdrop);
  return (
    <>
      {wide && (fill
        ? <div className="absolute inset-0" style={{ background: fill }} />
        : <img src={url} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ filter: 'blur(40px) brightness(0.6)', transform: 'scale(1.2)' }} />)}
      <img
        ref={imgRef}
        data-sc-media
        src={url}
        alt=""
        draggable={false}
        className="absolute inset-0 w-full h-full"
        style={{ objectFit: wide ? 'contain' : 'cover', filter: PHOTO_LOOKS[look] === 'none' ? undefined : PHOTO_LOOKS[look] }}
        onLoad={e => setWide(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight > 0.75)}
      />
    </>
  );
}

export default StoryCreator;

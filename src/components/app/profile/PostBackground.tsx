import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  POST_BACKGROUNDS,
  POST_BG_PHOTO_ID,
  POST_BG_VIDEO_HINT,
  postBgById,
  postBgIsVideo,
  postBgPaletteIndex,
  postBgVariant,
  withPostBgColors,
  type PostBg,
  type PostBgPalette,
} from '@/lib/post-backgrounds';
import '@/styles/post-backgrounds.css';

/** The backdrop for the profile being viewed (null = plain posts). */
export const ProfilePostBgContext = createContext<PostBg | null>(null);
export const useProfilePostBg = () => useContext(ProfilePostBgContext);

/**
 * Posts that carry their own backdrop (post id -> backdrop, null = back to the
 * profile's). Filled from the posts themselves plus any save made on this page.
 */
export const ProfilePostBgMapContext = createContext<ReadonlyMap<string, PostBg | null> | null>(null);

/** For lists: a function giving each text post's backdrop, its own if it has one, else the profile's. */
export function usePostBgResolver(): (postId: string | number | null | undefined) => PostBg | null {
  const profileBg = useContext(ProfilePostBgContext);
  const own = useContext(ProfilePostBgMapContext);
  return useCallback((postId) => {
    const key = postId == null ? '' : String(postId);
    return (key && own?.get(key)) || profileBg;
  }, [own, profileBg]);
}

/** The profile picture of the profile being viewed, for the backdrop that blurs it (Profile Echo). */
export const ProfilePostBgArtContext = createContext<string | null>(null);

/** Phones with little memory get a still frame instead of motion. */
const lowEndDevice = (() => {
  if (typeof navigator === 'undefined') return false;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return typeof mem === 'number' && mem > 0 && mem < 3;
})();

/**
 * Props that turn any card element into a backdrop host. Spread on the
 * element that wraps a text post, and render <PostBgLayer> as its first child.
 */
export function postBgHostProps(bg: PostBg | null, postId?: string | number | null): Record<string, string> {
  // data-pbg-text marks every text post, with or without a backdrop, so the
  // owner can hold it to open the picker; data-pbg-post says which post.
  const who: Record<string, string> = { 'data-pbg-text': '', ...(postId != null ? { 'data-pbg-post': String(postId) } : {}) };
  if (!bg) return who;
  return { ...who, 'data-pbg': bg.id, 'data-pbg-tone': bg.tone, 'data-pbg-kind': bg.kind };
}

let sharedObserver: IntersectionObserver | null = null;
function observe(el: Element) {
  if (typeof IntersectionObserver === 'undefined') return () => {};
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) e.target.removeAttribute('data-pbg-off');
        else e.target.setAttribute('data-pbg-off', '');
      }),
      { rootMargin: '120px' },
    );
  }
  sharedObserver.observe(el);
  return () => sharedObserver?.unobserve(el);
}

/** `seed` (the post's id) picks the look on backdrops that differ per post; without one each tile keeps its own. */
export function PostBgLayer({ bg, seed }: { bg: PostBg | null; seed?: string | number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const art = useContext(ProfilePostBgArtContext);
  const own = React.useId();
  const moving = bg?.kind === 'moving';
  useEffect(() => {
    if (!moving || !ref.current) return;
    return observe(ref.current);
  }, [moving]);
  if (!bg) return null;
  const style: Record<string, string> = {};
  if (bg.colors) {
    style['--c1'] = bg.colors[0];
    style['--c2'] = bg.colors[1];
    style['--c3'] = bg.colors[2];
  }
  if (bg.id === 'echo' && art && !art.endsWith('/placeholder.svg')) style['--pbg-art'] = `url("${art.replace(/["\\\n]/g, '')}")`;
  const video = bg.kind === 'photo' && postBgIsVideo(bg.image);
  if (bg.kind === 'photo' && bg.image && !video) style['--pbg-img'] = `url("${bg.image.replace(/["\\\n]/g, '')}")`;
  return (
    <span
      ref={ref}
      aria-hidden
      className={`pbg pbg-${bg.id}`}
      data-pbg-n={postBgVariant(seed ?? own, 8)}
      style={style as React.CSSProperties}
      data-pbg-off={moving ? '' : undefined}
      data-pbg-still={moving && lowEndDevice ? '' : undefined}
    >
      {moving && (<><i /><i /><i /></>)}
      {video && <PostBgVideo src={bg.image!} />}
    </span>
  );
}

/** The owner's video loop: plays while on screen, holds its first frame under reduce motion or on a low-memory phone. */
function PostBgVideo({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (lowEndDevice || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const play = () => { v.play().catch(() => {}); };
    if (typeof IntersectionObserver === 'undefined') { play(); return; }
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? play() : v.pause()), { rootMargin: '120px' });
    io.observe(v);
    return () => io.disconnect();
  }, [src]);
  return <video ref={ref} className="pbg-video" src={src} muted loop playsInline preload="metadata" disablePictureInPicture />;
}

const HOLD_SKIP = 'a, button, input, textarea, select, video, audio, [role="button"]';

/**
 * Long-press (450 ms) on the owner's header opens the picker. With a
 * `selector`, the hold only starts on a matching element inside the host
 * (e.g. text posts in the profile feed), never on buttons or links inside it. A small ring
 * fills under the finger while holding. Right-click opens it straight away on
 * a computer. The click that ends a completed hold is swallowed so it does not
 * also open the avatar or a link underneath.
 */
export function usePostBgHold(enabled: boolean, onOpen: (held?: HTMLElement | null) => void, selector?: string) {
  const [ring, setRing] = useState<{ x: number; y: number; p: number } | null>(null);
  const state = useRef<{ t0: number; x: number; y: number; raf: number; fired: boolean; id: number | null }>({ t0: 0, x: 0, y: 0, raf: 0, fired: false, id: null });
  const hostRef = useRef<HTMLDivElement | null>(null);

  const stop = useCallback(() => {
    cancelAnimationFrame(state.current.raf);
    state.current.id = null;
    setRing(null);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!enabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    // The profile picture and banner have their own hold menu.
    if ((e.target as Element).closest?.('[data-profile-image-target]')) return;
    const host = hostRef.current;
    if (!host) return;
    if (selector) {
      const target = e.target as HTMLElement;
      const item = target.closest(selector);
      if (!item || !host.contains(item)) return;
      const hit = target.closest(HOLD_SKIP);
      if (hit && hit !== item && item.contains(hit)) return;
    }
    const box = host.getBoundingClientRect();
    const s = state.current;
    const held = selector ? ((e.target as HTMLElement).closest(selector) as HTMLElement | null) : null;
    s.t0 = performance.now();
    s.x = e.clientX;
    s.y = e.clientY;
    s.fired = false;
    s.id = e.pointerId;
    const lx = e.clientX - box.left;
    const ly = e.clientY - box.top;
    const tick = () => {
      if (s.id === null) return;
      const p = Math.min(1, (performance.now() - s.t0) / 450);
      // Hide the ring for the first 120 ms so a normal tap never flashes it.
      setRing(p > 0.25 ? { x: lx, y: ly, p } : null);
      if (p >= 1) {
        s.fired = true;
        stop();
        try { navigator.vibrate?.(12); } catch { /* not supported */ }
        onOpen(held);
        return;
      }
      s.raf = requestAnimationFrame(tick);
    };
    s.raf = requestAnimationFrame(tick);
  }, [enabled, onOpen, stop, selector]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const s = state.current;
    if (s.id === null || e.pointerId !== s.id) return;
    if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10) stop();
  }, [stop]);

  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (state.current.fired) {
      e.preventDefault();
      e.stopPropagation();
      state.current.fired = false;
    }
  }, []);

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    if (!enabled) return;
    // Keep the browser menu on links and images people may want to copy.
    const target = e.target as HTMLElement;
    if (selector) {
      const item = target.closest(selector);
      if (!item) return;
      const hit = target.closest(HOLD_SKIP);
      if (hit && hit !== item && item.contains(hit)) return;
    } else if (target.closest('a, input, textarea')) return;
    e.preventDefault();
    stop();
    onOpen(selector ? (target.closest(selector) as HTMLElement | null) : null);
  }, [enabled, onOpen, stop, selector]);

  const handlers = enabled
    ? {
        onPointerDown,
        onPointerMove,
        onPointerUp: stop,
        onPointerCancel: stop,
        onPointerLeave: stop,
        onClickCapture,
        onContextMenu,
        ...(selector ? { 'data-pbg-hold': '' } : { style: { WebkitTouchCallout: 'none' } as React.CSSProperties }),
      }
    : {};

  const ringEl = ring ? (
    <span className="pbg-hold-ring" style={{ left: ring.x, top: ring.y, ['--p' as string]: ring.p } as React.CSSProperties} aria-hidden />
  ) : null;

  return { hostRef, handlers, ringEl };
}

const STILL = POST_BACKGROUNDS.filter((b) => b.kind === 'still');
const MOVING = POST_BACKGROUNDS.filter((b) => b.kind === 'moving');
const PHOTO = postBgById(POST_BG_PHOTO_ID)!;

export interface PostBgSave {
  id: string | null;
  colors: PostBgPalette | null;
  /** A new picture or GIF to upload for "Your photo". */
  file?: File | null;
  /** 'post': only the post that was held. 'all': the whole profile, every post. */
  scope?: PostBgScope;
}

export type PostBgScope = 'post' | 'all';

export interface PostBgPickerProps {
  open: boolean;
  current: PostBg | null;
  name: string;
  handle: string;
  avatarUrl?: string;
  /** The owner's newest text post, shown on the preview. */
  sampleText?: string;
  /** The owner's own picture, if they ever uploaded one. */
  photoUrl?: string | null;
  saving?: boolean;
  /**
   * Set when the picker was opened from one post: shows "This post / All posts".
   * `postCurrent` is that post's own backdrop (undefined = it uses the profile's).
   */
  postId?: string | null;
  postCurrent?: PostBg | null;
  onCancel: () => void;
  onSave: (choice: PostBgSave) => void;
}

const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
const MAX_VIDEO_MB = 90;

/**
 * Full-screen preview of a text post on the chosen backdrop. Under it: the
 * colourways for that backdrop (plus your own colours), a row of jump chips,
 * and one swipeable strip of every backdrop (None, your photo, moving, still).
 * Whatever sits in the middle of the strip is applied live; Done saves.
 * On a computer it is a centred panel and the arrow keys step through.
 */
export function PostBgPicker({ open, current: profileCurrent, name, handle, avatarUrl, sampleText, photoUrl, saving, postId, postCurrent, onCancel, onSave }: PostBgPickerProps) {
  const { t } = useTranslation();
  const [scope, setScope] = useState<PostBgScope>('all');
  useEffect(() => { if (open) setScope(postId ? 'post' : 'all'); }, [open, postId]);
  // In "This post", start from what that post shows now.
  const current = scope === 'post' && postCurrent !== undefined ? postCurrent : profileCurrent;
  const [sel, setSel] = useState<string | null>(current?.id ?? null);
  // Colours per backdrop while the picker is open, so flicking away and back keeps a choice.
  const [colorsById, setColorsById] = useState<Record<string, PostBgPalette>>({});
  const [customOpen, setCustomOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const settle = useRef<number>(0);
  const order = useMemo(() => [null, POST_BG_PHOTO_ID, ...MOVING.map((b) => b.id), ...STILL.map((b) => b.id)] as (string | null)[], []);

  const centre = useCallback((id: string | null, smooth: boolean) => {
    const strip = stripRef.current;
    const tile = strip?.querySelector<HTMLElement>(`[data-pbg-id="${id ?? ''}"]`);
    if (!strip || !tile) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    strip.scrollTo({ left: tile.offsetLeft - strip.clientWidth / 2 + tile.offsetWidth / 2, behavior: smooth && !reduce ? 'smooth' : 'auto' });
  }, []);

  useEffect(() => {
    if (!open) return;
    setSel(current?.id ?? null);
    setColorsById(current?.colors && current.palettes.length ? { [current.id]: current.colors } : {});
    setCustomOpen(!!current?.custom);
    setFile(null);
    setFileError(null);
    const id = requestAnimationFrame(() => centre(current?.id ?? null, false));
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { cancelAnimationFrame(id); document.body.style.overflow = prev; };
  }, [open, current, centre]);

  useEffect(() => {
    if (!file) { setFileUrl(null); return; }
    const url = URL.createObjectURL(file);
    setFileUrl(/^video\//.test(file.type) ? url + POST_BG_VIDEO_HINT : url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onScroll = () => {
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => {
      const strip = stripRef.current;
      if (!strip) return;
      const mid = strip.scrollLeft + strip.clientWidth / 2;
      let best: HTMLElement | null = null;
      let dist = Infinity;
      strip.querySelectorAll<HTMLElement>('[data-pbg-id]').forEach((el) => {
        const d = Math.abs(el.offsetLeft + el.offsetWidth / 2 - mid);
        if (d < dist) { dist = d; best = el; }
      });
      const id = (best as HTMLElement | null)?.dataset.pbgId || null;
      setSel((cur) => (cur === id ? cur : id));
    }, 90);
  };

  const photoSrc = fileUrl ?? photoUrl ?? null;
  const pickPhotoFile = () => fileInput.current?.click();

  const pick = (id: string | null) => {
    setSel(id);
    centre(id, true);
    if (id === POST_BG_PHOTO_ID && !photoSrc) pickPhotoFile();
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const isVideo = /^video\//.test(f.type);
    if (!isVideo && !/^image\//.test(f.type)) { setFileError(t('postBg.mediaType')); return; }
    if (isVideo && f.size > MAX_VIDEO_MB * 1024 * 1024) { setFileError(t('postBg.videoSize', { n: MAX_VIDEO_MB })); return; }
    if (!isVideo && f.size > MAX_PHOTO_BYTES) { setFileError(t('postBg.photoSize', 'That file is over 15 MB. Pick a smaller one.')); return; }
    setFileError(null);
    setFile(f);
    setSel(POST_BG_PHOTO_ID);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); return; }
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const i = order.indexOf(sel);
    const next = order[Math.max(0, Math.min(order.length - 1, i + (e.key === 'ArrowRight' ? 1 : -1)))];
    pick(next);
  };

  if (!open || typeof document === 'undefined') return null;

  const base = postBgById(sel);
  const chosenColors = base ? colorsById[base.id] ?? null : null;
  const bg: PostBg | null = !base
    ? null
    : base.kind === 'photo'
      ? (photoSrc ? { ...base, image: photoSrc } : base)
      : withPostBgColors(base, chosenColors);
  // On one post, None means "same as my profile": preview and name that.
  const followsProfile = scope === 'post' && !!postId && !base;
  const previewBg = followsProfile ? profileCurrent ?? null : bg && (bg.kind !== 'photo' || bg.image) ? bg : null;
  const paletteIndex = postBgPaletteIndex(bg);
  const setColors = (colors: PostBgPalette) => { if (base) setColorsById((m) => ({ ...m, [base.id]: colors })); };
  const setOneColor = (i: number, value: string) => {
    if (!bg?.colors) return;
    const next = [...bg.colors] as [string, string, string];
    next[i] = value.toLowerCase();
    setColors(next);
  };
  const canSave = !saving && !(sel === POST_BG_PHOTO_ID && !photoSrc);

  const kindLabel = (b: PostBg) => (b.kind === 'moving' ? t('postBg.moving', 'Moving') : b.kind === 'photo' ? t('postBg.yours', 'Yours') : t('postBg.still', 'Still'));

  const tile = (b: PostBg | null) => {
    const shown = b && b.kind === 'photo' ? (photoSrc ? { ...b, image: photoSrc } : null) : b && colorsById[b.id] ? withPostBgColors(b, colorsById[b.id]) : b;
    return (
      <button
        key={b?.id ?? 'none'}
        type="button"
        role="radio"
        aria-checked={sel === (b?.id ?? null)}
        data-pbg-id={b?.id ?? ''}
        className="pbg-tile"
        onClick={() => pick(b?.id ?? null)}
      >
        {!b ? (
          <span className="pbg-tile-swatch pbg-tile-swatch--none" />
        ) : shown ? (
          <span className="pbg-tile-swatch" {...postBgHostProps(shown)}><PostBgLayer bg={shown} /></span>
        ) : (
          <span className="pbg-tile-swatch pbg-tile-swatch--add" aria-hidden>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          </span>
        )}
        <span className="pbg-tile-label">{b ? t(`postBg.names.${b.id}`, b.name) : scope === 'post' && postId ? t('postBg.sameAsProfile', 'Profile') : t('postBg.none', 'None')}</span>
      </button>
    );
  };

  const jump = (id: string) => pick(id);

  return createPortal(
    <ProfilePostBgArtContext.Provider value={avatarUrl ?? null}>
    <div className="pbg-picker" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="pbg-picker-panel" role="dialog" aria-modal="true" aria-label={t('postBg.title', 'Post background')} onKeyDown={onKeyDown} tabIndex={-1} ref={(el) => el?.focus({ preventScroll: true })}>
        <div className="pbg-picker-top">
          <button type="button" className="pbg-picker-btn" onClick={onCancel}>{t('common.cancel', 'Cancel')}</button>
          <h2>{t('postBg.title', 'Post background')}</h2>
          <button
            type="button"
            className="pbg-picker-btn pbg-picker-btn--done"
            disabled={!canSave}
            onClick={() => onSave({ id: sel, colors: bg && bg.palettes.length ? bg.colors ?? null : null, file: sel === POST_BG_PHOTO_ID ? file : null, scope: postId ? scope : 'all' })}
          >
            <span>{saving ? t('postBg.saving', 'Saving') : t('common.done', 'Done')}</span>
          </button>
        </div>

        <div className="pbg-picker-stage">
          {postId && (
            <div className="pbg-chips pbg-scope" role="radiogroup" aria-label={t('postBg.scope', 'Apply to')}>
              <button type="button" role="radio" aria-checked={scope === 'post'} aria-pressed={scope === 'post'} className="pbg-chip" onClick={() => setScope('post')}>
                {t('postBg.thisPost', 'This post')}
              </button>
              <button type="button" role="radio" aria-checked={scope === 'all'} aria-pressed={scope === 'all'} className="pbg-chip" onClick={() => setScope('all')}>
                {t('postBg.allPosts', 'All posts')}
              </button>
            </div>
          )}
          <div className="pbg-preview" {...postBgHostProps(previewBg)}>
            <PostBgLayer bg={previewBg} />
            <div className="pbg-preview-who">
              {avatarUrl ? <img src={avatarUrl} alt="" /> : <span className="pbg-preview-av" />}
              <span><b>{name}</b><span>{handle}</span></span>
            </div>
            <div className="pbg-preview-text">{sampleText?.trim() || t('postBg.sample', 'This is how your text posts look on your profile.')}</div>
          </div>
        </div>

        <div className="pbg-picker-name" aria-live="polite">
          <b>{bg ? t(`postBg.names.${bg.id}`, bg.name) : followsProfile ? t('postBg.sameAsProfile', 'Profile') : t('postBg.none', 'None')}</b>
          <span>{bg ? kindLabel(bg) : followsProfile ? t('postBg.sameAsProfileSub', 'Same as your profile') : t('postBg.plain', 'Plain posts')}</span>
        </div>

        <div className="pbg-colors">
          {bg && bg.palettes.length > 0 && (
            <>
              <div className="pbg-color-row" role="radiogroup" aria-label={t('postBg.colours', 'Colours')}>
                {bg.palettes.map((p, i) => (
                  <button
                    key={i}
                    type="button"
                    role="radio"
                    aria-checked={paletteIndex === i}
                    aria-label={t('postBg.colourway', 'Colours {{n}}', { n: i + 1 })}
                    className="pbg-color"
                    style={{ background: `conic-gradient(from 200deg, ${p[1]} 0 33%, ${p[2]} 0 55%, ${p[0]} 0)` }}
                    onClick={() => { setColors(p); setCustomOpen(false); }}
                  />
                ))}
                <button
                  type="button"
                  role="radio"
                  aria-checked={paletteIndex === -1 || customOpen}
                  aria-label={t('postBg.ownColours', 'Your own colours')}
                  className="pbg-color pbg-color--own"
                  onClick={() => setCustomOpen((v) => !v)}
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                </button>
              </div>
              {customOpen && bg.colors && (
                <div className="pbg-own">
                  {[t('postBg.base', 'Base'), t('postBg.accent', 'Accent'), t('postBg.accent2', 'Accent 2')].map((label, i) => (
                    <label key={i} className="pbg-own-well">
                      <span className="pbg-own-dot" style={{ background: bg.colors![i] }}>
                        <input type="color" value={bg.colors![i]} onChange={(e) => setOneColor(i, e.target.value)} aria-label={label} />
                      </span>
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              )}
            </>
          )}
          {bg?.kind === 'photo' && (
            <div className="pbg-photo-row">
              <button type="button" className="pbg-chip pbg-chip--solid" onClick={pickPhotoFile}>
                {photoSrc ? t('postBg.changeMedia') : t('postBg.addMedia')}
              </button>
              {fileError && <span className="pbg-photo-error" role="alert">{fileError}</span>}
            </div>
          )}
          <input ref={fileInput} type="file" accept="image/*,video/*" hidden onChange={onFile} />
        </div>

        <div className="pbg-chips" role="group" aria-label={t('postBg.jump', 'Jump to')}>
          <button type="button" className="pbg-chip" aria-pressed={sel === POST_BG_PHOTO_ID} onClick={() => jump(POST_BG_PHOTO_ID)}>{t('postBg.yours', 'Yours')}</button>
          <button type="button" className="pbg-chip" aria-pressed={!!bg && bg.kind === 'moving'} onClick={() => jump(MOVING[0].id)}>{t('postBg.moving', 'Moving')} · {MOVING.length}</button>
          <button type="button" className="pbg-chip" aria-pressed={!!bg && bg.kind === 'still'} onClick={() => jump(STILL[0].id)}>{t('postBg.still', 'Still')} · {STILL.length}</button>
        </div>

        <div className="pbg-strip" ref={stripRef} role="radiogroup" aria-label={t('postBg.title', 'Post background')} onScroll={onScroll}>
          {tile(null)}
          {tile(PHOTO)}
          <span className="pbg-strip-divider" aria-hidden />
          {MOVING.map(tile)}
          <span className="pbg-strip-divider" aria-hidden />
          {STILL.map(tile)}
        </div>
        <p className="pbg-picker-hint">{t('postBg.hint2', 'Swipe to try each one, tap a colour to change it. Only you can change this.')}</p>
      </div>
    </div>
    </ProfilePostBgArtContext.Provider>,
    document.body,
  );
}

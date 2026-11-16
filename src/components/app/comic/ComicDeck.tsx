/**
 * Comic posts shown as collector cards.
 *
 * Every page of a comic is a foil card: the art, its caption under it and the
 * page number on top. A tap or a sideways swipe deals the next page: the top
 * card glides off to the left while the next one straightens up from the fan
 * behind it. Nothing leans, flashes or bounces. Tapping the caption strip (or
 * the ALT tag) turns the card over to the caption and alt text in full; a tap
 * on the back turns it face up again.
 *
 * The feed shows the top card with the next two fanned behind it; tapping
 * opens the post. The post page adds the hand of every page under the card
 * and a "Read all pages" view that lists the pages in order.
 */
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cdnImage } from '@/lib/media-url';
import { cn } from '@/lib/utils';
import { ANIMATED_COMIC_BORDERS, isComicBorder } from '@/lib/comic-borders';
import '@/styles/comic.css';

export interface ComicDeckProps {
  images: string[];
  captions?: string[];
  descriptions?: string[];
  title?: string;
  /** Feed: a tap on the card opens the post. Leave out on the post page. */
  onOpen?: () => void;
  /** Post page: the hand of pages and the full read. */
  full?: boolean;
  aboveFold?: boolean;
  /** Border preset (src/lib/comic-borders); absent is the theme's foil. */
  border?: string;
}

/** How long a deal takes, and the curve it eases on: quick off the mark, soft landing, no overshoot. */
const DEAL_MS = 420;
const EASE = 'cubic-bezier(0.22, 0.8, 0.3, 1)';

/** Cover URL to its clamped aspect ratio. */
const coverRatios = new Map<string, number>();

function prefersReducedMotion() {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

export const ComicDeck = memo(function ComicDeck({ images, captions, descriptions, title, onOpen, full = false, aboveFold = false, border }: ComicDeckProps) {
  const { t } = useTranslation();
  const total = images.length;
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reading, setReading] = useState(false);
  const stackRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // A deal in flight: the page it lands on. The cards ease to their new
  // places first, then the index follows, so nothing jumps at the end.
  const [deal, setDeal] = useState<{ to: number; dir: 1 | -1 } | null>(null);
  // Sideways finger offset while a swipe is being dragged.
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const go = useCallback((to: number) => {
    const next = Math.max(0, Math.min(total - 1, to));
    setFlipped(false);
    setDragX(0);
    if (next === index || deal) return;
    // Next door is dealt; further away (the hand of pages) just shows the page.
    if (Math.abs(next - index) > 1 || prefersReducedMotion()) { setIndex(next); return; }
    setDeal({ to: next, dir: next > index ? 1 : -1 });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { setIndex(next); setDeal(null); }, DEAL_MS + 30);
  }, [total, index, deal]);

  const caption = captions?.[index]?.trim() || '';
  const alt = descriptions?.[index]?.trim() || '';

  /** A plain tap: face up again if turned over, turn over on the text strip, else the next page. */
  const tap = (target: EventTarget | null) => {
    if (flipped) { setFlipped(false); return; }
    const strip = target instanceof Element ? target.closest('.comic-cap, .comic-alt') : null;
    if (strip && (caption || alt)) { setFlipped(true); return; }
    if (index < total - 1) go(index + 1);
  };

  // Pointer: a sideways swipe drags the top card, a tap deals or turns it over.
  const press = useRef<{ x: number; y: number; t: number; sideways: boolean } | null>(null);
  // A feed card waits for the first touch, so scrolling by loads nothing extra.
  const [warm, setWarm] = useState(false);
  const onPointerDown = (e: React.PointerEvent) => {
    setWarm(true);
    if (deal) return;
    press.current = { x: e.clientX, y: e.clientY, t: performance.now(), sideways: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = press.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.sideways && total > 1 && !flipped && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
      d.sideways = true;
      setDragging(true);
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }
    if (d.sideways) {
      const edge = (dx > 0 && index === 0) || (dx < 0 && index === total - 1);
      setDragX(edge ? dx / 5 : dx);
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = press.current;
    press.current = null;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    setDragging(false);
    if (d.sideways) {
      if (dx < -50 && index < total - 1) go(index + 1);
      else if (dx > 50 && index > 0) go(index - 1);
      else setDragX(0);
      return;
    }
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8 && performance.now() - d.t < 450) {
      if (onOpen) onOpen();
      else tap(e.target);
    }
  };
  const onPointerCancel = () => { press.current = null; setDragging(false); setDragX(0); };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1); }
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (onOpen) onOpen(); else if (flipped) setFlipped(false); else go(index + 1);
    } else if (e.key === 'f' && !onOpen && (caption || alt)) { setFlipped(f => !f); }
  };

  // The art box takes the cover's shape (kept between tall and wide), so a
  // landscape strip is not letterboxed in a portrait card. Remembered per
  // cover, so the post page opens at the size the feed card already had
  // instead of starting portrait and jumping.
  const [ratio, setRatio] = useState(() => coverRatios.get(images[0]) ?? 0.75);
  useEffect(() => {
    const known = coverRatios.get(images[0]);
    if (known) { setRatio(known); return; }
    const img = new Image();
    img.onload = () => {
      if (!img.naturalWidth || !img.naturalHeight) return;
      const next = Math.max(0.62, Math.min(1.5, img.naturalWidth / img.naturalHeight));
      coverRatios.set(images[0], next);
      setRatio(next);
    };
    img.src = cdnImage(images[0], { width: 720 }) || '';
  }, [images]);

  // Holographic and glitter strips only move while the card is on screen.
  const preset = isComicBorder(border) ? border : undefined;
  const animated = !!preset && ANIMATED_COMIC_BORDERS.has(preset);
  const [live, setLive] = useState(false);
  useEffect(() => {
    const el = rootRef.current;
    if (!animated || !el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setLive(entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [animated, reading]);

  // Warm the pages either side, so a deal never shows an empty frame.
  useEffect(() => {
    if (index === 0 && !full && !warm) return;
    for (const i of [index + 1, index + 2, index - 1]) {
      const src = i >= 0 && i < total ? cdnImage(images[i], { width: 720 }) : '';
      if (src) { const img = new Image(); img.decoding = 'async'; img.src = src; }
    }
  }, [index, images, total, full, warm]);

  // How far the deal has got: 0 at rest, 1 once the next page is on top, -1
  // once the previous one is back. The finger while dragging, the target while easing.
  const width = stackRef.current?.offsetWidth || 320;
  const progress = deal ? deal.dir : Math.max(-1, Math.min(1, -dragX / width));
  const eased = !dragging && !prefersReducedMotion();
  const at = deal ? deal.to : index;
  const pageLabel = (i: number) => `${pad2(i + 1)} / ${pad2(total)}`;
  const name = title || t('comic.title', { defaultValue: 'Comic' });
  const dealt = [index - 1, index, index + 1, index + 2, index + 3].filter(i => i >= 0 && i < total);

  if (reading) {
    return (
      <div data-comic className="relative px-1 pb-2">
        <div className="flex items-center justify-between gap-2 py-2">
          <p className="min-w-0 truncate text-sm font-semibold">{title || t('comic.title', { defaultValue: 'Comic' })}</p>
          <button type="button" className="shrink-0 rounded-xl border border-border px-3 py-1.5 text-xs font-medium" onClick={() => setReading(false)}>
            {t('comic.cards', { defaultValue: 'Back to cards' })}
          </button>
        </div>
        <ol className="space-y-5">
          {images.map((src, i) => (
            <li key={`${src}-${i}`}>
              <img
                src={cdnImage(src, { width: 1080 })}
                alt={descriptions?.[i] || ''}
                loading={i < 2 ? 'eager' : 'lazy'}
                decoding="async"
                className="w-full rounded-lg bg-black/40"
              />
              <div className="mt-2 flex gap-2 text-sm leading-snug">
                <span className="shrink-0 font-mono text-xs text-muted-foreground pt-0.5">{String(i + 1).padStart(2, '0')}</span>
                {captions?.[i]?.trim() ? <p style={{ fontFamily: 'var(--comic-serif)', fontStyle: 'italic' }}>{captions[i]}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  const face = (i: number) => (
    <div className="comic-in">
      <div className="comic-top">
        <em>{name}</em>
        <span>{pageLabel(i)}</span>
      </div>
      <div className="comic-art" style={{ aspectRatio: String(ratio) }}>
        <img
          src={cdnImage(images[i], { width: 720 })}
          alt={i === index ? alt : ''}
          draggable={false}
          loading={i === 0 && !aboveFold ? 'lazy' : 'eager'}
          decoding={i === 0 ? 'async' : 'sync'}
        />
        {descriptions?.[i]?.trim() ? <span className="comic-alt">ALT</span> : null}
      </div>
      <div className={cn('comic-cap', i === index && !onOpen && (caption || alt) && 'cursor-help')}>{captions?.[i]?.trim() || ''}</div>
    </div>
  );

  return (
    <div
      ref={rootRef}
      data-comic
      data-comic-border={preset}
      data-comic-live={animated && live ? '' : undefined}
      data-no-swipe={total > 1 ? '' : undefined}
      className={cn('relative flex flex-col items-center select-none pt-3', full ? 'pb-3' : 'pb-5')}
    >
      {/* The art takes at most ~60% of the screen height, so the card, its page
          hand and the button stay on screen on a laptop. */}
      <div
        ref={stackRef}
        className="comic-stack relative"
        data-wide={ratio > 1 ? '' : undefined}
        data-full={full ? '' : undefined}
        style={{ maxWidth: `calc(${ratio.toFixed(3)} * ${full ? 60 : 56}vh)` }}
      >
        <div className="comic-floor" style={{ left: '8%', right: '8%', bottom: -18, height: 28, zIndex: -5 }} />

        {/* Unseen: gives the stack the height of one card. */}
        <div aria-hidden className="comic-card invisible"><div className="comic-side comic-front">{face(index)}</div></div>

        <div
          role="button"
          tabIndex={0}
          aria-label={onOpen
            ? t('comic.open', { defaultValue: 'Open comic, page {{page}} of {{total}}', page: index + 1, total })
            : t('comic.next', { defaultValue: 'Page {{page}} of {{total}}. Tap for the next page', page: index + 1, total })}
          className="comic-deal-layer absolute inset-0 cursor-pointer outline-none"
          style={{ touchAction: 'pan-y' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onPointerEnter={() => setWarm(true)}
          onKeyDown={onKeyDown}
        >
          {dealt.map((i) => {
            // 0 is the top card, 1 and 2 are fanned behind it, below 0 has been dealt away.
            const slot = Math.max(-1, Math.min(3, i - index - progress));
            const away = slot < 0 ? -slot : 0;
            const back = Math.max(0, slot);
            const top = i === index;
            return (
              <div
                key={i}
                aria-hidden={!top}
                className="comic-dealt"
                style={{
                  zIndex: 60 - i,
                  transform: away
                    ? `translate(${-away * 108}%, ${away * 3}%) rotate(${-away * 8}deg)`
                    : `translate(${back * 14}px, ${back * 6}px) rotate(${back * 4}deg) scale(${1 - back * 0.04})`,
                  opacity: away ? (away < 0.6 ? 1 : 1 - (away - 0.6) / 0.4) : back > 2 ? 0 : 1,
                  filter: back ? `brightness(${1 - Math.min(2, back) * 0.2})` : undefined,
                  transition: eased
                    ? `transform ${DEAL_MS}ms ${EASE}, filter ${DEAL_MS}ms ${EASE}, opacity ${DEAL_MS * 0.4}ms linear ${away ? DEAL_MS * 0.45 : 0}ms`
                    : 'none',
                }}
              >
                {top ? (
                  <div className="comic-card" data-flipped={flipped ? '' : undefined}>
                    <div className="comic-side comic-front">
                      {face(i)}
                      <div className="comic-holo" />
                      <div className="comic-sheen" />
                    </div>
                    <div className="comic-side comic-back" aria-hidden={!flipped}>
                      <span className="comic-lab">{t('comic.page', { defaultValue: 'Page {{page}}', page: index + 1 })}</span>
                      <h3>{caption || name}</h3>
                      {alt ? (
                        <>
                          <span className="comic-lab">{t('comic.alt', { defaultValue: 'Alt text' })}</span>
                          <p>{alt}</p>
                        </>
                      ) : null}
                      <div className="comic-ft"><span>{title}</span><span>{pageLabel(index)}</span></div>
                      <div className="comic-holo" />
                    </div>
                  </div>
                ) : (
                  <div className="comic-side comic-front">{face(i)}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {full && total > 1 ? (
        <div className="relative mt-7 h-12 w-full max-w-[360px]" role="tablist" aria-label={t('comic.pages', { defaultValue: 'Pages' })}>
          {images.map((src, i) => {
            const mid = (total - 1) / 2;
            const angle = (i - mid) * Math.min(8, 110 / total);
            const shift = (i - mid) * Math.min(24, 300 / total);
            const lift = i === at ? -10 : 0;
            return (
              <button
                key={`${src}-${i}`}
                type="button"
                role="tab"
                aria-current={i === at}
                aria-label={t('comic.goto', { defaultValue: 'Page {{page}}', page: i + 1 })}
                className="comic-mini"
                style={{ transform: `translateX(${shift}px) rotate(${angle}deg) translateY(${lift}px)`, zIndex: i === at ? total : i }}
                onClick={() => go(i)}
              >
                <img src={cdnImage(src, { width: 96 })} alt="" loading="lazy" decoding="async" />
              </button>
            );
          })}
        </div>
      ) : null}

      {full && total > 1 ? (
        <button
          type="button"
          className="mt-4 h-9 rounded-xl border border-border px-4 text-sm font-medium"
          onClick={() => setReading(true)}
        >
          {t('comic.showAll', { defaultValue: 'Show all {{count}} pages', count: total })}
        </button>
      ) : null}
    </div>
  );
});

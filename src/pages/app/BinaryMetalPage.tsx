/**
 * Binary Metal
 * ============
 * `/music/binary-metal`: type anything and hear it as a metal riff. Every
 * letter becomes its byte, every byte one bar of eight notes: on the low
 * string 0 plays open and 1 the first fret. Bass doubles the guitar, the kick
 * follows the 1s and the snare keeps the backbeat. Download WAV or MP3, or
 * post the MP3 to your feed.
 *
 * From the Requests board (c0chraniz3r, "Text to binary metal music
 * generator"). Everything is drawn on the listener's device by
 * public/binary-metal/engine.js; nothing is uploaded unless they post it.
 * The app has the same screen (riftn-mobile screens/BinaryMetalScreen.tsx)
 * running the same engine file.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Download, Loader2, Minus, Pause, Play, Plus, Send, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { SEOHead } from '@/components/SEOHead';
import { IslandAction, KitButton, PageBody, PageIsland, PageSection, PageTabs } from '@/components/app/page-kit/PageKit';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/contexts/AuthContext';
import { useGlobalDropZone } from '@/hooks/use-global-drop-zone';
import { cn } from '@/lib/utils';
import {
  formatClock,
  loadBinaryMetal,
  type BinaryMetalByte,
  type BinaryMetalEngine,
  type BinaryMetalOptions,
  type BinaryMetalStyle,
  type BinaryMetalTuning,
} from '@/lib/binary-metal';

const PAGE_URL = 'https://riftn.com/music/binary-metal';
const OG_IMAGE = 'https://riftn.com/og/music-binary-metal.jpg';
const DEFAULT_TEXT = 'Riftn rules';
const STYLES: BinaryMetalStyle[] = ['thrash', 'doom', 'blast', 'groove'];
const TUNINGS: BinaryMetalTuning[] = ['drop-d', 'e-standard', 'drop-c', 'b-standard'];
const STYLE_BPM: Record<BinaryMetalStyle, number> = { thrash: 180, doom: 90, blast: 200, groove: 140 };
const BPM_STEP = 10;
/** Bars of the drum and bass lanes shown at once on computers. */
const LANE_BARS = 8;

type Busy = null | 'render' | 'wav' | 'mp3' | 'post';

const ACTIVE = { background: 'var(--kit-chip-active-bg)', color: 'var(--kit-chip-active-ink)' } as const;

function save(bytes: Uint8Array, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** One letter and its byte. Only the playing one re-renders as the riff moves. */
const ByteChip = memo(function ByteChip({ entry, active }: { entry: BinaryMetalByte; active: boolean }) {
  return (
    <span
      data-bm-byte
      className={cn('flex flex-col items-center rounded-lg px-1.5 py-1 transition-colors duration-150', !active && 'text-white')}
      style={active ? ACTIVE : undefined}
    >
      <span className="text-[13px] font-bold leading-5">{entry.ch === ' ' ? '␣' : entry.ch}</span>
      <span className={cn('font-mono text-[11px] tracking-[0.06em]', !active && 'text-zinc-400')}>{entry.bits}</span>
    </span>
  );
});

/** One bar of tab: six strings, eight notes. `bit` is the playing note, or -1. */
const TabBar = memo(function TabBar({ lines, bit }: { lines: string[]; bit: number }) {
  return (
    <div data-bm-bar className="flex flex-col border-r border-white/15 px-1 font-mono text-[13px] leading-[1.55]">
      {lines.map((line, row) => (
        <div key={row} className="flex whitespace-pre">
          {Array.from({ length: 8 }, (_, i) => {
            const note = line[i * 2];
            const now = i === bit;
            // The playing note lights up; the rest of its column gets a faint wash.
            const lit = now && note !== '-';
            return (
              <span
                key={i}
                className={cn('inline-block w-[1.1em] text-center transition-colors duration-100', note === '-' ? 'text-zinc-600' : 'font-bold', note !== '-' && !lit && 'text-white', now && 'rounded-[3px]')}
                style={lit ? ACTIVE : now ? { background: 'var(--kit-chip-bg)' } : undefined}
              >
                {note}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
});

function Lanes({ engine, bytes, opts, at }: { engine: BinaryMetalEngine; bytes: BinaryMetalByte[]; opts: BinaryMetalOptions; at: { byte: number; bit: number } | null }) {
  const { t } = useTranslation();
  const style = engine.STYLES[opts.style];
  const first = at ? Math.floor(at.byte / LANE_BARS) * LANE_BARS : 0;
  const shown = bytes.slice(first, first + LANE_BARS);
  const cells = shown.flatMap((b, bi) => Array.from(b.bits, (bit, si) => ({ bit, si, bar: first + bi })));
  const lane = (label: string, on: (bit: string, si: number) => boolean) => (
    <div className="flex items-center gap-3">
      <span className="w-14 shrink-0 text-[12px] font-semibold text-zinc-400">{label}</span>
      <div className="flex min-w-0 flex-1 gap-[2px]">
        {cells.map((c, i) => {
          const playing = at?.byte === c.bar && at.bit === c.si;
          return (
            <i
              key={i}
              className={cn('h-6 min-w-0 flex-1 rounded-[3px] transition-opacity duration-100', c.si === 0 && i > 0 && 'ml-1')}
              style={{
                background: on(c.bit, c.si) ? 'var(--kit-chip-active-bg)' : 'var(--kit-chip-bg)',
                opacity: playing ? 1 : on(c.bit, c.si) ? 0.75 : 1,
                boxShadow: playing ? 'inset 0 0 0 2px var(--kit-chip-active-ink)' : undefined,
              }}
            />
          );
        })}
      </div>
    </div>
  );
  return (
    <div className="flex flex-col gap-2">
      {lane(t('binaryMetal.guitar', { defaultValue: 'Guitar' }), (bit) => bit === '1')}
      {lane(t('binaryMetal.bass', { defaultValue: 'Bass' }), (bit) => bit === '1')}
      {lane(t('binaryMetal.kick', { defaultValue: 'Kick' }), (bit, si) => style.kick === 'all' || (style.kick === 'ones' && bit === '1') || (style.kick === 'first' && si === 0))}
      {lane(t('binaryMetal.snare', { defaultValue: 'Snare' }), (_bit, si) => style.snare.includes(si))}
    </div>
  );
}

export default function BinaryMetalPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const { isAuthenticated, openLoginModal } = useAuth();
  const { openPostModalWithFiles } = useGlobalDropZone();

  const [engine, setEngine] = useState<BinaryMetalEngine | null>(null);
  const [text, setText] = useState(() => params.get('text') ?? DEFAULT_TEXT);
  const [opts, setOpts] = useState<BinaryMetalOptions>(() => {
    const style = (STYLES as string[]).includes(params.get('style') ?? '') ? (params.get('style') as BinaryMetalStyle) : 'thrash';
    return { style, bpm: STYLE_BPM[style], tuning: 'drop-d', power: false };
  });
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [mp3Progress, setMp3Progress] = useState(0);
  const [clock, setClock] = useState(0);

  const audio = useRef<{ ctx: AudioContext | null; source: AudioBufferSourceNode | null; startedAt: number; offset: number }>({ ctx: null, source: null, startedAt: 0, offset: 0 });
  const cache = useRef<{ key: string; buffer: AudioBuffer } | null>(null);
  const tabScroller = useRef<HTMLDivElement>(null);
  const frame = useRef(0);

  useEffect(() => {
    let alive = true;
    loadBinaryMetal()
      .then((e) => alive && setEngine(e))
      .catch(() => alive && toast.error(t('binaryMetal.loadFailed', { defaultValue: 'Binary Metal did not load. Refresh to try again.' })));
    return () => {
      alive = false;
    };
  }, [t]);

  const clipped = engine ? engine.clip(text) : text;
  const key = JSON.stringify([clipped, opts]);
  const bytes = useMemo(() => (engine ? engine.bytesOf(clipped) : []), [engine, clipped]);
  const tab = useMemo(() => (engine ? engine.tabLines(clipped, opts) : []), [engine, clipped, opts]);
  const timeline = useMemo(() => (engine ? engine.timeline(clipped, opts) : null), [engine, clipped, opts]);
  const at = engine && playing ? engine.positionAt(clipped, opts, clock) : null;
  const duration = timeline?.duration ?? 0;
  const empty = bytes.length === 0;

  const stop = useCallback((keepOffset: boolean) => {
    const a = audio.current;
    if (a.source) {
      a.source.onended = null;
      try { a.source.stop(); } catch { /* already stopped */ }
      a.source = null;
    }
    if (keepOffset && a.ctx) a.offset += a.ctx.currentTime - a.startedAt;
    if (!keepOffset) a.offset = 0;
    window.cancelAnimationFrame(frame.current);
    setPlaying(false);
  }, []);

  // A new text or setting is a new riff: stop and start again from the top.
  useEffect(() => {
    stop(false);
    setClock(0);
  }, [key, stop]);

  useEffect(() => () => {
    stop(false);
    void audio.current.ctx?.close().catch(() => undefined);
  }, [stop]);

  const riff = useCallback(async () => {
    if (!engine) throw new Error('not ready');
    if (cache.current?.key === key) return cache.current.buffer;
    const buffer = await engine.render(clipped, opts);
    cache.current = { key, buffer };
    return buffer;
  }, [engine, key, clipped, opts]);

  const tick = useCallback(() => {
    const a = audio.current;
    if (!a.ctx || !a.source) return;
    setClock(a.offset + a.ctx.currentTime - a.startedAt);
    frame.current = window.requestAnimationFrame(tick);
  }, []);

  const play = useCallback(async () => {
    if (playing) {
      stop(true);
      return;
    }
    if (empty || busy) return;
    try {
      // Make the context inside the tap, or iOS keeps it silent.
      const a = audio.current;
      if (!a.ctx) a.ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      void a.ctx.resume();
      setBusy('render');
      const buffer = await riff();
      setBusy(null);
      if (a.offset >= buffer.duration - 0.05) a.offset = 0;
      const source = a.ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(a.ctx.destination);
      source.onended = () => {
        a.source = null;
        a.offset = 0;
        window.cancelAnimationFrame(frame.current);
        setPlaying(false);
        setClock(0);
      };
      a.startedAt = a.ctx.currentTime;
      source.start(0, a.offset);
      a.source = source;
      setPlaying(true);
      frame.current = window.requestAnimationFrame(tick);
    } catch {
      setBusy(null);
      toast.error(t('binaryMetal.playFailed', { defaultValue: 'That riff did not play. Try again.' }));
    }
  }, [playing, empty, busy, riff, stop, tick, t]);

  // Keep the playing bar in view in the tab.
  const playingBar = at?.byte ?? -1;
  useEffect(() => {
    const box = tabScroller.current;
    if (!box || playingBar < 0) return;
    const bar = box.querySelectorAll<HTMLElement>('[data-bm-bar]')[playingBar];
    if (!bar) return;
    const inBox = bar.getBoundingClientRect().left - box.getBoundingClientRect().left;
    if (inBox < 0 || inBox + bar.offsetWidth > box.clientWidth) {
      box.scrollTo({ left: Math.max(0, box.scrollLeft + inBox - 8), behavior: 'smooth' });
    }
  }, [playingBar]);

  const exportFile = useCallback(async (kind: 'wav' | 'mp3' | 'post') => {
    if (!engine || empty || busy) return;
    if (kind === 'post' && !isAuthenticated) {
      openLoginModal?.();
      return;
    }
    setBusy(kind === 'post' ? 'post' : kind);
    setMp3Progress(0);
    try {
      const buffer = await riff();
      if (kind === 'wav') {
        save(engine.toWav(buffer), engine.fileName(clipped, opts, 'wav'), 'audio/wav');
        return;
      }
      const mp3 = await engine.toMp3(buffer, (f) => setMp3Progress(f));
      const name = engine.fileName(clipped, opts, 'mp3');
      if (kind === 'mp3') {
        save(mp3, name, 'audio/mpeg');
        return;
      }
      const list = new DataTransfer();
      list.items.add(new File([mp3 as BlobPart], name, { type: 'audio/mpeg' }));
      openPostModalWithFiles(list.files, t('binaryMetal.postCaption', { defaultValue: '"{{text}}" as a metal riff. Make yours: {{url}}', text: clipped, url: PAGE_URL }));
    } catch {
      toast.error(t('binaryMetal.exportFailed', { defaultValue: 'That file did not save. Try again.' }));
    } finally {
      setBusy(null);
    }
  }, [engine, empty, busy, isAuthenticated, openLoginModal, riff, clipped, opts, openPostModalWithFiles, t]);

  const share = useCallback(() => {
    const url = `${PAGE_URL}?text=${encodeURIComponent(clipped)}&style=${opts.style}`;
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) {
      void nav.share({ url, title: t('binaryMetal.title', { defaultValue: 'Binary Metal' }) }).catch(() => undefined);
      return;
    }
    void navigator.clipboard?.writeText(url).then(() => toast.success(t('binaryMetal.linkCopied', { defaultValue: 'Link copied' })));
  }, [clipped, opts.style, t]);

  const setStyle = (style: BinaryMetalStyle) => setOpts((o) => ({ ...o, style, bpm: STYLE_BPM[style] }));
  const bump = (d: number) => setOpts((o) => ({ ...o, bpm: Math.max(engine?.MIN_BPM ?? 60, Math.min(engine?.MAX_BPM ?? 240, o.bpm + d)) }));
  const nextTuning = () => setOpts((o) => ({ ...o, tuning: TUNINGS[(TUNINGS.indexOf(o.tuning) + 1) % TUNINGS.length] }));

  const title = t('binaryMetal.title', { defaultValue: 'Binary Metal' });
  const styleLabel = (s: BinaryMetalStyle) => t(`binaryMetal.styles.${s}`, { defaultValue: { thrash: 'Thrash', doom: 'Doom', blast: 'Blast', groove: 'Groove' }[s] });
  const tuningLabel = (k: BinaryMetalTuning) => t(`binaryMetal.tunings.${k}`, { defaultValue: { 'e-standard': 'E standard', 'drop-d': 'Drop D', 'drop-c': 'Drop C', 'b-standard': 'B standard' }[k] });
  const maxChars = engine?.MAX_CHARS ?? 200;
  const chars = Array.from(text).length;

  const row = 'flex min-h-12 items-center justify-between gap-3 border-b border-white/10 py-2 text-[14px] last:border-b-0';

  const player = (
    <PageSection>
      <div className="flex items-center justify-between text-[13px] tabular-nums text-zinc-400">
        <span>{formatClock(clock)}</span>
        <span>{formatClock(duration)}</span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full" style={{ background: 'var(--kit-chip-bg)' }}>
        <div className="h-full rounded-full" style={{ ...ACTIVE, width: `${duration ? Math.min(100, (clock / duration) * 100) : 0}%` }} />
      </div>
      <KitButton onClick={() => void play()} disabled={!engine || empty || (busy !== null && busy !== 'render')} className="mt-3 w-full">
          {busy === 'render' ? <Loader2 className="h-4 w-4 animate-spin" /> : playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {busy === 'render' ? t('binaryMetal.making', { defaultValue: 'Making' }) : playing ? t('binaryMetal.pause', { defaultValue: 'Pause' }) : t('binaryMetal.play', { defaultValue: 'Play' })}
      </KitButton>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <KitButton variant="quiet" onClick={() => void exportFile('wav')} disabled={!engine || empty || busy !== null}>
          {busy === 'wav' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          WAV
        </KitButton>
        <KitButton variant="quiet" onClick={() => void exportFile('mp3')} disabled={!engine || empty || busy !== null}>
          {busy === 'mp3' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {busy === 'mp3' ? `${Math.round(mp3Progress * 100)}%` : 'MP3'}
        </KitButton>
        <KitButton variant="quiet" onClick={() => void exportFile('post')} disabled={!engine || empty || busy !== null}>
          {busy === 'post' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {busy === 'post' ? `${Math.round(mp3Progress * 100)}%` : t('binaryMetal.post', { defaultValue: 'Post' })}
        </KitButton>
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-zinc-500">
        {t('binaryMetal.onDevice', { defaultValue: 'Made on your device. Nothing is uploaded unless you post it.' })}
      </p>
    </PageSection>
  );

  return (
    <div className="min-h-screen">
      <SEOHead
        title={t('binaryMetal.seoTitle', { defaultValue: 'Binary Metal: turn text into a metal riff | Riftn' })}
        description={t('binaryMetal.seoDescription', { defaultValue: 'Type anything and hear it as heavy metal. Every letter becomes binary, every 0 an open string and every 1 the first fret, with drums and bass to match. Download WAV or MP3, free.' })}
        image={OG_IMAGE}
        url={PAGE_URL}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'WebApplication',
          name: 'Binary Metal',
          url: PAGE_URL,
          image: OG_IMAGE,
          applicationCategory: 'MultimediaApplication',
          operatingSystem: 'Web browser',
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        }}
      />
      <PageIsland
        back
        backFallback="/arcade"
        icon="audio"
        title={title}
        actions={
          <IslandAction label={t('binaryMetal.share', { defaultValue: 'Share' })} onClick={share}>
            <Share2 className="h-4 w-4" />
          </IslandAction>
        }
      />
      <PageBody>
        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <div className="flex min-w-0 flex-col gap-3">
            <PageSection>
              <label htmlFor="bm-text" className="text-[15px] font-semibold text-white">
                {t('binaryMetal.typeLabel', { defaultValue: 'Type anything' })}
              </label>
              <textarea
                id="bm-text"
                value={text}
                onChange={(e) => setText(Array.from(e.target.value).slice(0, maxChars).join(''))}
                rows={2}
                spellCheck={false}
                placeholder={t('binaryMetal.placeholder', { defaultValue: 'Your words, your riff' })}
                className="mt-3 w-full resize-none rounded-xl border border-white/15 bg-black/30 px-3 py-3 text-[16px] font-semibold leading-snug text-white placeholder:text-zinc-500 focus:border-white/40 focus:outline-none lg:text-[20px]"
              />
              <p className="mt-2 text-right text-[12px] tabular-nums text-zinc-500">{chars}/{maxChars}</p>
            </PageSection>

            <PageSection eyebrow={t('binaryMetal.binaryEyebrow', { defaultValue: 'Binary · each letter is one bar of 8 notes' })}>
              {empty ? (
                <p className="text-[13px] text-zinc-500">{t('binaryMetal.empty', { defaultValue: 'Type something above to make a riff.' })}</p>
              ) : (
                <div className="flex max-h-44 flex-wrap gap-1 overflow-y-auto">
                  {bytes.map((b, i) => <ByteChip key={i} entry={b} active={at?.byte === i} />)}
                </div>
              )}
            </PageSection>

            <PageSection eyebrow={t('binaryMetal.tabEyebrow', { defaultValue: 'Guitar tab · low string, 0 = open, 1 = first fret' })}>
              {empty ? null : (
                <div className="flex">
                  <div className="flex shrink-0 flex-col pr-1 font-mono text-[13px] leading-[1.55] text-zinc-400">
                    {tab.map((l, i) => <span key={i} className="whitespace-pre">{l.name.padEnd(2)}</span>)}
                  </div>
                  <div ref={tabScroller} className="flex min-w-0 overflow-x-auto border-l border-white/15 pb-1 [scrollbar-width:thin]">
                    {bytes.map((_, bi) => (
                      <TabBar key={bi} lines={tab.map((l) => l.bars[bi])} bit={at?.byte === bi ? at.bit : -1} />
                    ))}
                  </div>
                </div>
              )}
            </PageSection>

            {engine && !empty ? (
              <PageSection className="hidden lg:block" eyebrow={t('binaryMetal.lanesEyebrow', { defaultValue: 'Drums and bass follow the bits' })}>
                <Lanes engine={engine} bytes={bytes} opts={opts} at={at} />
              </PageSection>
            ) : null}

            <div className="lg:hidden">{player}</div>
          </div>

          <div className="flex flex-col gap-3 lg:sticky lg:top-24">
            <PageSection eyebrow={t('binaryMetal.styleEyebrow', { defaultValue: 'Style' })}>
              <PageTabs size="sm" value={opts.style} onChange={setStyle} tabs={STYLES.map((s) => ({ id: s, label: styleLabel(s) }))} />
              <div className="mt-2">
                <div className={row}>
                  <span className="text-zinc-400">{t('binaryMetal.tempo', { defaultValue: 'Tempo' })}</span>
                  <span className="flex items-center gap-2">
                    <button type="button" data-kit-square onClick={() => bump(-BPM_STEP)} aria-label={t('binaryMetal.slower', { defaultValue: 'Slower' })} className="flex h-9 w-9 items-center justify-center">
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-[4.5rem] text-center font-semibold tabular-nums text-white">{t('binaryMetal.bpm', { defaultValue: '{{bpm}} BPM', bpm: opts.bpm })}</span>
                    <button type="button" data-kit-square onClick={() => bump(BPM_STEP)} aria-label={t('binaryMetal.faster', { defaultValue: 'Faster' })} className="flex h-9 w-9 items-center justify-center">
                      <Plus className="h-4 w-4" />
                    </button>
                  </span>
                </div>
                <div className={row}>
                  <span className="text-zinc-400">{t('binaryMetal.tuning', { defaultValue: 'Tuning' })}</span>
                  <button type="button" data-kit-chip data-size="sm" onClick={nextTuning} className="font-semibold">
                    {tuningLabel(opts.tuning)}
                  </button>
                </div>
                <label className={cn(row, 'cursor-pointer')}>
                  <span className="text-zinc-400">{t('binaryMetal.power', { defaultValue: 'Power chords' })}</span>
                  <Switch checked={opts.power} onCheckedChange={(power) => setOpts((o) => ({ ...o, power }))} />
                </label>
              </div>
            </PageSection>
            <div className="hidden lg:block">{player}</div>
            <PageSection eyebrow={t('binaryMetal.howEyebrow', { defaultValue: 'How it works' })}>
              <p className="text-[13px] leading-relaxed text-zinc-400">
                {t('binaryMetal.how', { defaultValue: 'Each letter becomes its 8-bit binary code and plays as one bar. On the low string, 0 is the open string and 1 is the first fret. The bass doubles the guitar, the kick drum follows the 1s and the snare keeps the beat.' })}
              </p>
            </PageSection>
          </div>
        </div>
      </PageBody>
    </div>
  );
}

import { useTranslation as _useCopy } from 'react-i18next';
import { useSurfaceDraft } from '@/hooks/use-surface-draft';
/**
 * Sound Picker
 * =============
 * Bottom sheet to put a song on a post. One list and one search over three
 * libraries, shown Riftn first, then Audius, then the free library:
 *  - Audius: free songs from independent artists (Audius Open Music License)
 *  - Riftn: audio posts people uploaded here
 *  - Free library: public domain / CC0 / CC BY music on Wikimedia Commons
 * Pick a song, then pick the part of it the post plays.
 */

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from "lucide-react";
import Check from "@/components/ui/cut-icons/check";
import Music from "@/components/ui/cut-icons/music";
import Back from "@/components/ui/cut-icons/back";

import Search from "@/components/ui/cut-icons/search";
import Play from "@/components/ui/cut-icons/play";
import Pause from "@/components/ui/cut-icons/pause";

import { useInfiniteQuery } from '@tanstack/react-query';
import { searchNFTs, getMediaUrl, DEHUB_CDN_BASE } from '@/lib/api/dehub';
import type { DeHubNFT } from '@/lib/api/dehub';
import { DEHUB_API_BASE } from '@/lib/api/dehub/core';
import { buildAvatarUrl } from '@/lib/media-url';
import { outsideImage } from '@/lib/outside-image';
import { bindSoundWindow, clock, soundWindow, withSoundWindow, SOUND_SOURCE_NAMES } from '@/lib/sound-window';
import { AppState } from '@/components/app/AppState';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { AttachedSound } from '../hooks/usePostSound';

export type Library = 'audius' | 'riftn' | 'commons';

/** One song in the list, from any library. */
export interface SoundCandidate {
  key: string;
  library: Library;
  /** Plain stream link, no part or credit yet. */
  url: string;
  title: string;
  creator: string;
  artwork?: string;
  tokenId: string;
  duration?: number;
  pageUrl?: string;
  license?: string;
  licenseUrl?: string;
}

interface OutsideTrack {
  id: string; source: 'audius' | 'commons'; title: string; artist: string; artwork?: string;
  duration: number; streamUrl: string; pageUrl: string; license: string; licenseUrl?: string;
}

interface SoundPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (sound: AttachedSound) => void;
  currentSound?: AttachedSound | null;
  aboveMomentEditor?: boolean;
  /** Length of the attached video, in seconds: the part matches it. */
  clipSeconds?: number;
  /** Open straight on the part step for this song (state gallery). */
  initialPicked?: SoundCandidate;
  /** @deprecated The list shows every library at once; kept so callers compile. */
  initialLibrary?: Library;
}

const LENGTHS = [15, 30, 60] as const;
const PAGE = 20;

async function fetchOutside(source: 'audius' | 'commons', q: string, offset: number) {
  const params = new URLSearchParams({ source, offset: String(offset) });
  if (q) params.set('q', q);
  const res = await fetch(`${DEHUB_API_BASE}/api/sounds?${params}`);
  if (!res.ok) throw new Error(`sounds ${res.status}`);
  const body = await res.json() as { tracks?: OutsideTrack[]; nextOffset?: number };
  return {
    items: (body.tracks ?? []).map((t): SoundCandidate => ({
      key: t.id, library: t.source, url: t.streamUrl, title: t.title, creator: t.artist,
      artwork: t.artwork, tokenId: '0', duration: t.duration, pageUrl: t.pageUrl,
      license: t.license, licenseUrl: t.licenseUrl,
    })),
    next: body.nextOffset,
  };
}

async function fetchRiftn(q: string, page: number) {
  const searchParams = { page, unit: PAGE, sortMode: 'popular' as const, status: 'all' as const, ...(q ? { search: q } : {}) };
  type Row = DeHubNFT & Record<string, unknown> & { audioUrl?: string; audioDuration?: number; media_url?: string; token_id?: string | number; minterDisplayName?: string; mintername?: string };
  const empty = { data: [] as DeHubNFT[], has_more: false };
  const [audioRes, feedAudioRes] = await Promise.all([
    searchNFTs({ ...searchParams, postType: 'audio' }).catch(() => empty),
    searchNFTs({ ...searchParams, postType: 'feed-audio' }).catch(() => empty),
  ]);
  const seen = new Set<string>();
  const items = ([...audioRes.data, ...feedAudioRes.data] as Row[]).flatMap((nft): SoundCandidate[] => {
    const tokenId = String(nft.tokenId || nft.id || nft.token_id);
    if (seen.has(tokenId)) return [];
    seen.add(tokenId);
    const raw = nft.audioUrl || nft.videoUrl || nft.media_url;
    return [{
      key: `riftn:${tokenId}`, library: 'riftn', tokenId,
      url: getMediaUrl(raw) ?? `${DEHUB_CDN_BASE}feed-audio/${tokenId}-audio.mp3`,
      title: nft.name?.trim() || nft.title?.trim() || nft.description?.split('\n')[0]?.trim() || 'Untitled',
      creator: nft.minterUsername || nft.minterDisplayName || nft.mintername || 'Unknown',
      artwork: buildAvatarUrl(nft.minter || nft.creator?.id || '', nft.minterAvatarUrl),
      duration: nft.audioDuration || nft.videoDuration || nft.duration,
    }];
  });
  return { items, next: audioRes.has_more || feedAudioRes.has_more ? page + 1 : undefined };
}

/** Where each library's next page starts; a library with nothing left is absent. */
type Cursor = { riftn?: number; audius?: number; commons?: number };

/** The order the one list is shown in. */
const LIBRARY_ORDER: Library[] = ['riftn', 'audius', 'commons'];

/** One page of every library that still has songs, for the single list. */
async function fetchAll(q: string, cursor: Cursor) {
  const none = { items: [] as SoundCandidate[], next: undefined as number | undefined };
  const jobs = [
    cursor.riftn === undefined ? null : fetchRiftn(q, cursor.riftn),
    cursor.audius === undefined ? null : fetchOutside('audius', q, cursor.audius),
    cursor.commons === undefined ? null : fetchOutside('commons', q, cursor.commons),
  ];
  const settled = await Promise.allSettled(jobs.map(job => job ?? Promise.resolve(none)));
  // One library being down should not empty the list; all of them down is an error.
  if (settled.every((result, i) => jobs[i] === null || result.status === 'rejected')) throw new Error('sounds unavailable');
  const page = (i: number) => {
    const result = settled[i];
    return result && result.status === 'fulfilled' ? result.value : none;
  };
  const riftn = page(0);
  const audius = page(1);
  const commons = page(2);
  const next: Cursor = { riftn: riftn.next, audius: audius.next, commons: commons.next };
  return {
    items: [...riftn.items, ...audius.items, ...commons.items],
    next: LIBRARY_ORDER.some(library => next[library] !== undefined) ? next : undefined,
  };
}

/** Stable bar heights per song, so the same song always draws the same wave. */
function waveFor(seed: string, count: number): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return Array.from({ length: count }, (_, i) => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) + i;
    return 0.25 + 0.75 * (((h >>> 0) % 1000) / 1000) * (Math.abs(Math.sin(i * 0.45)) * 0.5 + 0.5);
  });
}

export function SoundPicker({ isOpen, onClose, onSelect, currentSound, clipSeconds, initialPicked, aboveMomentEditor = false }: SoundPickerProps) {
  const { t: _copy } = _useCopy();
  const { t } = useTranslation();
  const [search, setSearch] = useSurfaceDraft("features/post/components/SoundPicker.tsx:search", '');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [picked, setPicked] = useState<SoundCandidate | null>(initialPicked ?? null);
  const [start, setStart] = useState(initialPicked ? 42 : 0);
  const [length, setLength] = useState<number>(30);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => { bindSoundWindow(audioRef.current); });

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError } = useInfiniteQuery({
    queryKey: ['sound-picker', 'all', debouncedSearch],
    queryFn: ({ pageParam }) => fetchAll(debouncedSearch, pageParam),
    getNextPageParam: (lastPage) => lastPage.next,
    initialPageParam: { riftn: 0, audius: 0, commons: 0 } as Cursor,
    enabled: isOpen,
    staleTime: 5 * 60 * 1000,
  });

  const tracks = useMemo(() => {
    const seen = new Set<string>();
    // Riftn first, then Audius, then the free library, however the pages arrived.
    return (data?.pages.flatMap(p => p.items) ?? [])
      .filter(item => !seen.has(item.key) && !!seen.add(item.key))
      .sort((a, b) => LIBRARY_ORDER.indexOf(a.library) - LIBRARY_ORDER.indexOf(b.library));
  }, [data]);

  const stopPreview = useCallback(() => {
    audioRef.current?.pause();
    setPlayingKey(null);
  }, []);

  const playPreview = useCallback((key: string, url: string) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playingKey === key && !audio.paused) { stopPreview(); return; }
    if (audio.getAttribute('src') !== url) audio.src = url;
    else if (soundWindow(url)) audio.currentTime = soundWindow(url)!.start;
    audio.play().catch(() => setPlayingKey(current => current === key ? null : current));
    setPlayingKey(key);
  }, [playingKey, stopPreview]);

  useEffect(() => {
    if (!isOpen) { stopPreview(); setPicked(null); }
  }, [isOpen, stopPreview]);

  // The part's length: the video's, or a chosen length for photos.
  const fixedLength = clipSeconds && clipSeconds > 0 ? Math.max(3, Math.round(clipSeconds)) : undefined;
  const duration = picked?.duration && picked.duration > 0 ? picked.duration : undefined;
  const partLength = Math.min(fixedLength ?? length, duration ?? Infinity);
  const wholeSong = !duration || duration <= partLength + 0.5;
  const maxStart = duration && !wholeSong ? Math.max(0, duration - partLength) : 0;
  const end = wholeSong ? undefined : start + partLength;

  const pick = useCallback((track: SoundCandidate) => {
    stopPreview();
    setPicked(track);
    const resumed = currentSound && currentSound.title === track.title && currentSound.url.split('#')[0] === track.url
      ? soundWindow(currentSound.url)?.start ?? 0 : 0;
    setStart(resumed);
  }, [currentSound, stopPreview]);

  const partUrl = useCallback((track: SoundCandidate) => withSoundWindow(
    track.url,
    wholeSong && start <= 0 ? null : { start, end },
    track.library === 'riftn' ? null : { source: track.library, page: track.pageUrl, license: track.license, licenseUrl: track.licenseUrl },
  ), [wholeSong, start, end]);

  const confirm = useCallback(() => {
    if (!picked) return;
    stopPreview();
    onSelect({
      url: partUrl(picked),
      title: picked.title,
      creator: picked.creator,
      creatorAvatar: picked.artwork,
      tokenId: picked.tokenId,
      duration: picked.duration,
      source: picked.library,
    });
    setPicked(null);
    onClose();
  }, [picked, stopPreview, onSelect, partUrl, onClose]);

  // Moving the part restarts the preview at its new start.
  useEffect(() => {
    if (!picked || playingKey !== `part:${picked.key}`) return;
    const audio = audioRef.current;
    if (!audio) return;
    const timer = setTimeout(() => {
      audio.src = partUrl(picked);
      audio.play().catch(() => setPlayingKey(null));
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, partLength]);

  const bars = useMemo(() => waveFor(picked?.key ?? '', 56), [picked?.key]);

  const credit = picked && picked.library !== 'riftn'
    ? [picked.license, SOUND_SOURCE_NAMES[picked.library]].filter(Boolean).join(' · ')
    : '';

  return (
    <Drawer open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DrawerContent column glass
        overlayClassName={aboveMomentEditor ? 'z-[2147482101]' : undefined}
        className={cn('border-t border-white/10 max-h-[90dvh]', aboveMomentEditor && 'z-[2147482102]')}>
        <DrawerHeader className="border-b border-white/10 pb-3">
          <DrawerTitle className="text-white flex items-center gap-2">
            {picked ? (
              <button
                type="button"
                onClick={() => { stopPreview(); setPicked(null); }}
                className="-ml-1 grid h-8 w-8 place-items-center rounded-full hover:bg-white/10"
                aria-label={t('common.back')}
              >
                <Back className="h-5 w-5" />
              </button>
            ) : <Music className="w-5 h-5" />}
            {picked ? _copy("copy.55b1ec6f0360", { defaultValue: "Pick the part" }) : _copy("copy.76d311c4cef6", { defaultValue: "Add Sound" })}
          </DrawerTitle>
        </DrawerHeader>

        {picked ? (
          <div className="flex flex-col gap-4 px-4 pt-4 pb-6">
            <div className="flex items-center gap-3">
              <SoundArt src={picked.artwork} className="h-14 w-14 rounded-xl" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-semibold text-white">{picked.title}</div>
                <div className="truncate text-sm text-white/60">{picked.creator}</div>
                {credit && (
                  picked.pageUrl ? (
                    <a href={picked.pageUrl} target="_blank" rel="noopener noreferrer" className="block truncate text-[11px] text-white/45 underline-offset-2 hover:underline">© {picked.creator} · {credit}</a>
                  ) : <div className="truncate text-[11px] text-white/45">© {picked.creator} · {credit}</div>
                )}
              </div>
              <button
                type="button"
                onClick={() => playPreview(`part:${picked.key}`, partUrl(picked))}
                className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white text-black"
                aria-label={playingKey === `part:${picked.key}` ? t('audioPost.pause') : t('audioPost.play')}
              >
                {playingKey === `part:${picked.key}` ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 translate-x-px fill-current" />}
              </button>
            </div>

            {/* The song as a wave; the lit stretch is the part the post plays. */}
            <div className="rounded-2xl bg-white/[0.06] px-3 pt-4 pb-3">
              <div className="relative">
                <div className="flex h-14 items-center gap-[2px] text-white" aria-hidden="true">
                  {bars.map((h, i) => {
                    const at = duration ? ((i + 0.5) / bars.length) * duration : 0;
                    const lit = wholeSong || (at >= start && at <= start + partLength);
                    return (
                      <i
                        key={i}
                        className={cn('block flex-1 rounded-full bg-current transition-opacity', lit ? 'opacity-100' : 'opacity-25')}
                        style={{ height: `${Math.round(h * 100)}%` }}
                      />
                    );
                  })}
                </div>
                {!wholeSong && (
                  <input
                    type="range"
                    min={0}
                    max={maxStart}
                    step={0.5}
                    value={Math.min(start, maxStart)}
                    onChange={(e) => setStart(Number(e.target.value))}
                    aria-label={_copy("copy.284b838e96e5", { defaultValue: "Where the part starts" })}
                    className="dh-sound-range absolute inset-0 h-full w-full cursor-grab opacity-0"
                  />
                )}
              </div>
              <div className="mt-2 flex items-center justify-between text-xs tabular-nums text-white/60">
                <span>{clock(wholeSong ? 0 : start)} – {clock(wholeSong ? (duration ?? 0) : start + partLength)}</span>
                <span>{wholeSong ? _copy("copy.46b0e30a32b0", { defaultValue: "Whole song" }) : _copy("copy.3a84120779c5", { defaultValue: "Slide to pick the part" })}</span>
              </div>
            </div>

            {fixedLength ? (
              <p className="text-xs text-white/50">{_copy("copy.1cb1b494ee3b", { defaultValue: "The part matches your video ({{value1}}).", value1: clock(fixedLength) })}</p>
            ) : (
              <div className="flex gap-2">
                {LENGTHS.map(seconds => (
                  <button
                    key={seconds}
                    type="button"
                    onClick={() => { setLength(seconds); if (duration) setStart(s => Math.min(s, Math.max(0, duration - seconds))); }}
                    className={cn(
                      'h-9 flex-1 rounded-full text-sm font-medium transition-colors',
                      length === seconds ? 'bg-white/25 text-white font-semibold ring-1 ring-inset ring-white/60' : 'bg-white/[0.06] text-white/60 hover:bg-white/10',
                    )}
                  >
                    {seconds}s
                  </button>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={confirm}
              className="h-12 w-full rounded-full bg-white text-base font-semibold text-black transition-opacity hover:opacity-90"
            >
              {_copy("copy.0418db35eb35", { defaultValue: "Use this sound" })}
            </button>
          </div>
        ) : (
          <>
            {/* Search */}
            <div className="px-4 py-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={_copy("copy.db66c92fd9e0", { defaultValue: "Search sounds..." })}
                  className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/30"
                />
              </div>
            </div>

            {/* Track list */}
            <div className="flex-1 overflow-y-auto max-h-[50vh] pb-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 text-white/40 animate-spin" />
                </div>
              ) : tracks.length === 0 ? (
                <AppState
                  icon={debouncedSearch ? 'search' : 'audio'}
                  title={isError
                    ? _copy("copy.d0c1a3684775", { defaultValue: "Songs didn't load. Try again in a moment." })
                    : debouncedSearch ? _copy("copy.950e8e5b8f0e", { defaultValue: "No sounds found" }) : _copy("copy.4a8e3a5bada7", { defaultValue: "No audio tracks available" })}
                  kind={debouncedSearch ? 'search-empty' : 'empty'}
                  size="compact"
                />
              ) : (
                <>
                  {tracks.map((track) => {
                    const isSelected = !!currentSound && currentSound.url.split('#')[0] === track.url;
                    const isPlaying = playingKey === track.key;
                    return (
                      <div
                        key={track.key}
                        role="button"
                        tabIndex={0}
                        onClick={() => pick(track)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(track); } }}
                        className={cn('w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/5 transition-colors cursor-pointer', isSelected && 'bg-white/10')}
                      >
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); playPreview(track.key, track.url); }}
                          aria-label={isPlaying ? t('audioPost.pause') : t('audioPost.play')}
                          className="relative flex-shrink-0 w-11 h-11 overflow-hidden rounded-lg bg-white/10"
                        >
                          <SoundArt bare src={track.artwork} className="absolute inset-0 h-full w-full" />
                          <span className={cn('absolute inset-0 grid place-items-center bg-black/35 text-white', track.artwork ? '' : 'bg-transparent')}>
                            {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 ml-0.5 fill-current" />}
                          </span>
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-white font-medium truncate">{track.title}</div>
                          <div className="text-xs text-white/50 truncate">
                            {track.creator}
                            {track.duration ? <span className="text-white/30"> · {clock(track.duration)}</span> : null}
                            {track.license && track.library === 'commons' ? <span className="text-white/30"> · {track.license}</span> : null}
                          </div>
                        </div>
                        {isSelected && <Check className="w-5 h-5 text-white flex-shrink-0" />}
                      </div>
                    );
                  })}

                  {hasNextPage && (
                    <button
                      type="button"
                      onClick={() => fetchNextPage()}
                      disabled={isFetchingNextPage}
                      className="w-full py-3 text-sm text-white/50 hover:text-white/70 transition-colors"
                    >
                      {isFetchingNextPage ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : t('common.loadMore')}
                    </button>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {/* Hidden audio for previewing */}
        <audio
          ref={audioRef}
          onEnded={() => setPlayingKey(null)}
          onError={() => setPlayingKey(null)}
          preload="none"
        />
      </DrawerContent>
    </Drawer>
  );
}

/** `bare` leaves the note icon out: a list row draws its play button in that spot. */
function SoundArt({ src, className, bare }: { src?: string; className?: string; bare?: boolean }) {
  const [failed, setFailed] = useState(false);
  const url = src && !failed ? outsideImage(src) : undefined;
  return url ? (
    <img src={url} alt="" loading="lazy" onError={() => setFailed(true)} className={cn('object-cover', className)} />
  ) : (
    <span className={cn('grid place-items-center bg-white/10 text-white/60', className)}>
      {bare ? null : <Music className="h-5 w-5" />}
    </span>
  );
}

/**
 * The Glass Shelf: one row of tall glass tiles at the top of Home.
 *
 * "Your day" first (tap + to share a moment, or watch your own), then
 * everyone live right now as tiles (it replaces the Live now row), then
 * people's moments: something new has a ring in the theme's colour, watched
 * ones go grey and move to the end. A tile opens the full-screen viewer.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Add from '@/components/ui/cut-icons/add';
import Refresh from '@/components/ui/cut-icons/refresh';
import { useAuth } from '@/contexts/AuthContext';
import { useLiveNowItems, pictureOf, faceUrlOf, type LiveNowItem } from '@/components/app/feeds/LiveNowBar';
import { useStoryShelf } from '@/hooks/use-story-shelf';
import { useStoriesStore } from '@/store/storiesStore';
import { buildAvatarUrl, buildAvatarCdnFallbackUrl } from '@/lib/media-url';
import type { ShelfEntry } from '@/lib/api/dehub/stories';
import { ageLabel, coverOf, nameOf, playable } from './story-utils';
import '@/styles/stories.css';

const bg = (url?: string | null) => (url ? { backgroundImage: `url("${url.replace(/"/g, '%22')}")` } : undefined);

export function StoryShelf() {
  const { isAuthenticated, walletAddress, user, openLoginModal } = useAuth();
  const { data } = useStoryShelf();
  const { items: live, open: openLive } = useLiveNowItems();
  const openViewer = useStoriesStore(s => s.openViewer);
  const openCreator = useStoriesStore(s => s.openCreator);
  const pending = useStoriesStore(s => s.pending);

  const shelf = useMemo(() => data?.shelf ?? [], [data]);
  const own = shelf.find(e => e.own) ?? null;
  // What the viewer can page through: your own day when it has something, then everyone else.
  const watchable = useMemo(
    () => shelf.map(e => ({ ...e, items: playable(e.items) })).filter(e => e.items.length > 0),
    [shelf],
  );
  const others = watchable.filter(e => !e.own);
  const ownWatchable = watchable.find(e => e.own) ?? null;

  // Fetch the viewer's code while the shelf is on screen, so the first tap opens at once.
  const hasMoments = watchable.length > 0;
  useEffect(() => {
    if (!hasMoments) return;
    const id = window.setTimeout(() => void import('./StoriesHost'), 1500);
    return () => window.clearTimeout(id);
  }, [hasMoments]);

  if (!isAuthenticated && others.length === 0 && live.length === 0) return null;

  const openEntry = (entry: ShelfEntry, el: HTMLElement) => {
    const index = watchable.findIndex(e => e.author.address === entry.author.address);
    if (index >= 0) openViewer(watchable, index, { from: el.getBoundingClientRect() });
  };

  const addMoment = () => (isAuthenticated ? openCreator() : openLoginModal());

  return (
    <div data-stories data-story-shelf role="list">
      {isAuthenticated && (
        <MeTile
          address={walletAddress ?? ''}
          avatar={user?.avatarImageUrl ?? own?.author.avatarImageUrl ?? null}
          entry={ownWatchable}
          processing={!!own?.items.some(i => i.status === 'processing')}
          pending={pending}
          onAdd={addMoment}
          onOpen={el => ownWatchable && openEntry(ownWatchable, el)}
        />
      )}
      {live.map(item => (
        <LiveTile key={`${item.kind}-${item.id}`} item={item} onOpen={() => openLive(item)} />
      ))}
      {others.map(entry => (
        <PersonTile key={entry.author.address} entry={entry} onOpen={el => openEntry(entry, el)} />
      ))}
    </div>
  );
}

function MeTile({ address, avatar, entry, processing, pending, onAdd, onOpen }: {
  address: string;
  avatar: string | null;
  entry: ShelfEntry | null;
  processing: boolean;
  pending: ReturnType<typeof useStoriesStore.getState>['pending'];
  onAdd: () => void;
  onOpen: (el: HTMLElement) => void;
}) {
  const { t } = useTranslation();
  const face = avatar ? buildAvatarUrl(address, avatar) : buildAvatarCdnFallbackUrl(address, undefined);
  const cover = pending?.preview || (entry ? coverOf(entry) : null);
  const empty = !cover;
  const busy = pending && pending.state !== 'failed';

  return (
    <button
      type="button"
      role="listitem"
      data-story-tile
      data-kind="me"
      data-empty={empty ? 'true' : 'false'}
      aria-label={t('stories.yourDay', { defaultValue: 'Your day' })}
      onClick={e => (entry && !pending ? onOpen(e.currentTarget) : !busy ? (pending?.retry ? pending.retry() : onAdd()) : undefined)}
    >
      <span data-st-bg style={bg(cover || face)} />
      {!empty && <span data-st-shade />}
      {busy && <span data-st-fill style={{ height: `${Math.max(6, pending!.state === 'processing' ? 100 : pending!.progress)}%` }} />}
      {empty ? (
        <span data-st-glass data-st-plus><Add className="w-5 h-5" /></span>
      ) : pending?.state === 'failed' ? (
        <span data-st-glass data-st-plus><Refresh className="w-5 h-5" /></span>
      ) : (
        <span
          data-st-glass
          data-st-plus-corner
          role="button"
          aria-label={t('stories.addMoment', { defaultValue: 'Add a moment' })}
          onClick={e => { e.stopPropagation(); onAdd(); }}
        >
          <Add className="w-3.5 h-3.5" />
        </span>
      )}
      <span data-st-label>
        {pending?.state === 'failed'
          ? t('stories.tapToRetry', { defaultValue: 'Tap to retry' })
          : busy || processing
            ? t('stories.posting', { defaultValue: 'Posting…' })
            : t('stories.yourDay', { defaultValue: 'Your day' })}
      </span>
    </button>
  );
}

function LiveTile({ item, onOpen }: { item: LiveNowItem; onOpen: () => void }) {
  const { t } = useTranslation();
  const [faceBroken, setFaceBroken] = useState(false);
  const face = faceUrlOf(item);
  return (
    <button type="button" role="listitem" data-story-tile data-kind="live" onClick={onOpen} aria-label={item.title}>
      <span data-st-bg style={bg(pictureOf(item))} />
      <span data-st-shade />
      <span data-st-live><i />{t('stages.liveBadge', { defaultValue: 'LIVE' })}</span>
      <span data-st-who>
        {face && !faceBroken ? <img src={face} alt="" onError={() => setFaceBroken(true)} /> : <span data-st-face />}
        <span>{item.displayName || item.username || item.wallet.slice(0, 6)}</span>
      </span>
    </button>
  );
}

function PersonTile({ entry, onOpen }: { entry: ShelfEntry; onOpen: (el: HTMLElement) => void }) {
  const a = entry.author;
  const [faceBroken, setFaceBroken] = useState(false);
  const face = a.avatarImageUrl ? buildAvatarUrl(a.address, a.avatarImageUrl) : buildAvatarCdnFallbackUrl(a.address, undefined);
  const latest = entry.items[entry.items.length - 1];
  return (
    <button
      type="button"
      role="listitem"
      data-story-tile
      data-kind="person"
      data-seen={entry.seen ? 'true' : 'false'}
      onClick={e => onOpen(e.currentTarget)}
      aria-label={nameOf(a)}
    >
      <span data-st-bg style={bg(coverOf(entry))} />
      <span data-st-shade />
      {!entry.seen && <span data-st-ring />}
      <span data-st-time>{ageLabel(latest?.createdAt)}</span>
      <span data-st-who>
        {face && !faceBroken ? <img src={face} alt="" onError={() => setFaceBroken(true)} /> : <span data-st-face />}
        <span>{nameOf(a)}</span>
      </span>
    </button>
  );
}

/**
 * The Glass Shelf: one row of tall glass tiles at the top of Home.
 *
 * "Your day" first (tap + to share a moment, or watch your own), then
 * everyone live right now as tiles (it replaces the Live now row), then
 * people's moments, with viewed ones at the end. A tile opens the full-screen viewer.
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import Refresh from '@/components/ui/cut-icons/refresh';
import { useBadgeBalance, useBadgeVisual } from '@/hooks/use-badge-balance';
import { useAuth } from '@/contexts/AuthContext';
import { useLiveNowItems, faceUrlOf, type LiveNowItem } from '@/components/app/feeds/LiveNowBar';
import { useStoriesEnabled } from '@/hooks/use-stories-enabled';
import { useStoryShelf } from '@/hooks/use-story-shelf';
import { useMatureContent } from '@/hooks/use-mature-content';
import { useKidsModeLock } from '@/hooks/use-kids-mode';
import { useStoriesStore } from '@/store/storiesStore';
import { buildAvatarUrl, buildAvatarCdnFallbackUrl, deviceWidth } from '@/lib/media-url';
import type { ShelfEntry } from '@/lib/api/dehub/stories';
import { coverOf, handleOf, nameOf, playable } from './story-utils';
import { rememberShelfSeat } from '@/lib/story-shelf-seat';
import { StoryCreatePill, StoryCreateTile } from './StoryCreatePill';
import { useMomentPreviewsBlurred } from '@/lib/moment-preview-blur';
import '@/styles/stories.css';

const bg = (url?: string | null) => (url ? { backgroundImage: `url("${url.replace(/"/g, '%22')}")` } : undefined);

export function StoryShelf() {
  const { isAuthenticated, walletAddress, user, openLoginModal } = useAuth();
  const { items: live, open: openLive } = useLiveNowItems();
  const { showMatureContent } = useMatureContent();
  const kidsMode = useKidsModeLock();
  const canSeeMature = isAuthenticated && showMatureContent && !kidsMode;
  const liveHosts = [...new Set(live.map(item => (item.wallet || '').toLowerCase()).filter(Boolean))].sort().slice(0, 100).join(',');
  const { storiesEnabled } = useStoriesEnabled();
  const { data, isLoading } = useStoryShelf(liveHosts, canSeeMature, storiesEnabled || !!liveHosts);
  const eligibleLive = live.filter(item => data?.liveHosts?.includes((item.wallet || '').toLowerCase()));
  const openViewer = useStoriesStore(s => s.openViewer);
  const openCreator = useStoriesStore(s => s.openCreator);
  const pending = useStoriesStore(s => s.pending);

  const shelf = useMemo(() => data?.shelf ?? [], [data]);
  const own = shelf.find(e => e.own) ?? null;
  // What the viewer can page through: your own day when it has something, then everyone else.
  const watchable = useMemo(
    () => shelf.map(e => ({ ...e, items: playable(e.items).filter(item => canSeeMature || !item.isMature) })).filter(e => e.items.length > 0),
    [shelf, canSeeMature],
  );
  const others = watchable.filter(e => !e.own);
  const ownWatchable = watchable.find(e => e.own) ?? null;

  // Fetch the viewer's code while the shelf is on screen, so the first tap opens at once.
  const hasMoments = watchable.length > 0;
  useEffect(() => {
    if (!storiesEnabled || !hasMoments) return;
    const id = window.setTimeout(() => void import('./StoriesHost'), 1500);
    return () => window.clearTimeout(id);
  }, [storiesEnabled, hasMoments]);

  // While the first load is out the row keeps its seat with loading tiles,
  // signed in or not, so the feed under it never jumps down when it lands.
  const hidden = (!storiesEnabled || (!isAuthenticated && others.length === 0 && !isLoading)) && eligibleLive.length === 0;
  // Signed in and nobody has a Moment up (yours included): a thin pill that
  // invites you to create takes the row's place instead of a lone tile.
  const bare = storiesEnabled && isAuthenticated && !isLoading && !pending && !own?.items.length
    && others.length === 0 && eligibleLive.length === 0;
  // The loading skeletons read this to hold the row's seat on the next visit.
  useEffect(() => {
    if (!isLoading) rememberShelfSeat(!hidden && !bare);
  }, [isLoading, hidden, bare]);
  if (hidden) return null;
  if (bare) return <StoryCreatePill />;

  const openEntry = (entry: ShelfEntry, el: HTMLElement) => {
    const index = watchable.findIndex(e => e.author.address === entry.author.address);
    if (index >= 0) openViewer(watchable, index, { from: el.getBoundingClientRect() });
  };

  const addMoment = () => (isAuthenticated ? openCreator() : openLoginModal());

  return (
    <div data-stories data-story-shelf data-no-swipe role="list">
      {storiesEnabled && isAuthenticated && <StoryCreateTile />}
      {storiesEnabled && isAuthenticated && (pending || ownWatchable) && (
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
      {eligibleLive.map(item => (
        <LiveTile key={`${item.kind}-${item.id}`} item={item} onOpen={() => openLive(item)} />
      ))}
      {storiesEnabled && isLoading && [0, 1, 2, 3].map(index => (
        <div key={index} data-story-tile aria-hidden="true" className="!bg-foreground/[0.04]">
          <span data-st-avatar className="!border-0 !bg-foreground/10" />
          <span className="absolute bottom-2 left-2 h-2 w-10 rounded bg-foreground/10" />
        </div>
      ))}
      {storiesEnabled && others.map(entry => (
        <PersonTile key={entry.author.address} entry={entry} onOpen={el => openEntry(entry, el)} />
      ))}
    </div>
  );
}

function ShelfAvatar({ src }: { src?: string | null }) {
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  return src && brokenSrc !== src ? (
    <img data-st-avatar src={src} alt="" onError={() => setBrokenSrc(src)} />
  ) : (
    <span data-st-avatar aria-hidden="true" />
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
  const face = avatar ? buildAvatarUrl(address, avatar, deviceWidth(68)) : buildAvatarCdnFallbackUrl(address, undefined);
  const cover = pending ? pending.preview : entry && coverOf(entry);
  const busy = pending && pending.state !== 'failed';
  const fill = busy ? `${Math.max(6, pending.state === 'processing' ? 100 : pending.progress)}%` : undefined;

  return (
    <button
      type="button"
      role="listitem"
      data-story-tile
      data-kind="me"
      aria-label={t('stories.yourDay', { defaultValue: 'Your day' })}
      onClick={e => (entry && !pending ? onOpen(e.currentTarget) : !busy ? (pending?.retry ? pending.retry() : onAdd()) : undefined)}
    >
      <span data-st-bg style={bg(cover)} />
      <span data-st-shade />
      {pending?.state !== 'failed' && <ShelfAvatar src={face} />}
      {fill && <span data-st-fill style={{ '--st-upload-progress': fill } as CSSProperties} />}
      {pending?.state === 'failed' && (
        <span data-st-glass data-st-retry><Refresh className="w-5 h-5" /></span>
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

function TileIdentity({ address, username, displayName, live }: {
  address: string;
  username: string | null;
  displayName?: string | null;
  live?: LiveNowItem;
}) {
  const account = useBadgeBalance(address, live?.badgeBalance);
  const badge = useBadgeVisual({
    badgeBalance: live?.badgeBalance ?? account.badgeBalance,
    badgeLock: live?.badgeLock ?? account.badgeLock,
    username: username ?? account.username,
    lookupId: address,
  });
  const label = displayName?.trim() || account.displayName?.trim() || handleOf({ address, username });
  return (
    <span data-st-label>
      <span data-st-name>{label}</span>
      {badge.url && !live?.hideBadgeAndBalance && !account.hideBadgeAndBalance && (
        <img data-st-badge src={badge.url} alt={badge.name ?? ''} />
      )}
    </span>
  );
}

function LiveTile({ item, onOpen }: { item: LiveNowItem; onOpen: () => void }) {
  const { t } = useTranslation();
  const face = faceUrlOf(item);
  return (
    <button type="button" role="listitem" data-story-tile data-kind="live" onClick={onOpen} aria-label={item.title}>
      <span data-st-bg style={bg(item.cover)} />
      <span data-st-shade />
      <span data-st-live role="img" aria-label={t('stages.liveBadge', { defaultValue: 'LIVE' })}>
        <i /><i /><i />
      </span>
      <ShelfAvatar src={face} />
      <TileIdentity address={item.wallet} username={item.username} displayName={item.displayName} live={item} />
    </button>
  );
}

function PersonTile({ entry, onOpen }: { entry: ShelfEntry; onOpen: (el: HTMLElement) => void }) {
  const a = entry.author;
  const face = a.avatarImageUrl ? buildAvatarUrl(a.address, a.avatarImageUrl, deviceWidth(68)) : buildAvatarCdnFallbackUrl(a.address, undefined);
  const blurred = useMomentPreviewsBlurred();
  return (
    <button
      type="button"
      role="listitem"
      data-story-tile
      data-kind="person"
      data-seen={entry.seen ? 'true' : 'false'}
      data-close-friends={entry.closeFriends && !entry.own ? '' : undefined}
      data-blur={blurred ? 'true' : undefined}
      onClick={e => onOpen(e.currentTarget)}
      aria-label={nameOf(a)}
    >
      <span data-st-bg style={bg(coverOf(entry))} />
      <span data-st-shade />
      <ShelfAvatar src={face} />
      <TileIdentity address={a.address} username={a.username} displayName={a.displayName} />
    </button>
  );
}

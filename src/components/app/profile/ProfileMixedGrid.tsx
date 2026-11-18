/**
 * ProfileMixedGrid
 * ================
 * The All tab on a phone: every post type in one three-across grid instead of
 * a stack of full feed cards. Each type gets a tile that reads at a glance —
 * a video shows its length and views, a song is a square cover over its own
 * blur with a waveform, a text post becomes a poster of its own words, an
 * article shows its cover and title, a live stream wears a solid red LIVE
 * chip. Anything that isn't a plain photo carries one small glass badge in the
 * same top-right spot saying what it is.
 *
 * A tile opens the profile reel: this creator's posts one by one, full screen,
 * from the tapped one (lib/profile-reel). A repost opens its own post page. Desktop keeps the feed cards — this is only mounted below `md`.
 *
 * @module components/app/profile/ProfileMixedGrid
 */

import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useDragReorder } from '@/hooks/use-drag-reorder';
import { warmPostPage } from '@/lib/preload-post-page';
import { cdnImage, deviceWidth } from '@/lib/media-url';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Lock, Pin } from 'lucide-react';
import Film from '@/components/ui/cut-icons/video';
import Shorts from '@/components/ui/cut-icons/shorts';
import Images from '@/components/ui/cut-icons/images';
import Music from '@/components/ui/cut-icons/music';
import MessageSquare from '@/components/ui/cut-icons/messages';
import ThumbsUp from '@/components/ui/cut-icons/like';
import Blog from '@/components/ui/cut-icons/blog';
import Radio from '@/components/ui/cut-icons/live';
import Repeat2 from '@/components/ui/cut-icons/repost';
import { ProposalLinkEmbed } from '@/components/app/governance/ProposalLinkEmbed';
import type { ProfileContentItem } from '@/hooks/use-profile-page';
import type { TextPost, ImagePost, VideoItem } from '@/types/feed.types';
import { noteProfileFeedOpen, useProfileFeedContext } from '@/lib/profile-feed-origin';
import { openBrainrotFeed } from '@/lib/brainrot-feed';
import { PostBgLayer, postBgHostProps, useProfilePostBg } from './PostBackground';
import { postBgToken, postBgVariant } from '@/lib/post-backgrounds';
import { ArticleTileFace, useProfileArticleTile } from './ArticleTile';
import { articleReadMinutes } from '@/lib/article-tile';
import { GridCardFace, GridKindPill, GridPollProbe } from './GridCardTile';
import { mediaCardOf, textCardOf, wordsWithoutLinks } from '@/lib/grid-card';
import './profile-mixed-grid.css';

/** One cell's worth of content. Optimistic posts arrive in the same shape. */
export interface MixedGridEntry {
  key: string;
  type: 'post' | 'image' | 'video' | 'proposal';
  data: TextPost | ImagePost | VideoItem | { id: string; proposalId: string };
  isPinned?: boolean;
  isRepost?: boolean;
  isOptimistic?: boolean;
}

interface ProfileMixedGridProps {
  entries: MixedGridEntry[];
  /**
   * Own profile: each of the owner's posts carries a grip in its bottom right
   * corner. Hold the grip and slide the tile to a new place; `before` lists
   * the posts now ahead of it, nearest first. The tile's own tap and hold are as before.
   */
  onMove?: (movedId: string, beforeIds: string[]) => Promise<void>;
}

/** The one key that changed place between two orders of the same keys. */
function movedKey(prev: string[], next: string[]): string | null {
  const i = prev.findIndex((key, index) => key !== next[index]);
  if (i < 0) return null;
  return next[i + 1] === prev[i] ? next[i] : prev[i];
}

/** Bar heights for a song tile — stable per post so a re-render never reshuffles them. */
function waveFor(id: string, bars = 18): number[] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return Array.from({ length: bars }, (_, i) => {
    h = (h * 1103515245 + 12345) >>> 0;
    const wobble = (h % 1000) / 1000;
    return 0.28 + 0.62 * Math.abs(Math.sin(i * 0.9 + wobble * 2));
  });
}

function compact(n: number | undefined): string {
  if (!n) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(n);
}

/**
 * A tile is a third of the screen (about 130 CSS px on a phone), but feed
 * pictures arrive sized for a full-width card (1080 px), so a profile pulled
 * ~1.8 MB of pictures for its first rows. Ask for the tile's own size instead,
 * with room for a wide picture cropped to the 3:4 tile.
 */
function tileImage(url: string | undefined): string | undefined {
  if (!url || typeof window === 'undefined') return url;
  // The grid is never wider than the profile column (~720px on desktop).
  return cdnImage(url, { width: deviceWidth(Math.ceil(Math.min(window.innerWidth, 720) / 3) * 1.4) });
}

/** Strip markdown-ish noise so a poster tile shows words, not syntax. */
function plainText(text: string | undefined): string {
  return (text || '')
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/(www\.)?/g, '')
    .replace(/[#*_>`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function Badge({ children, label }: { children: ReactNode; label: string }) {
  return (
    <span className="pmg-badge" aria-label={label} title={label}>
      {children}
    </span>
  );
}

export const ProfileMixedGrid = memo(function ProfileMixedGrid({ entries, onMove }: ProfileMixedGridProps) {
  const { t } = useTranslation();

  // Pinned tiles, reposts and posts still uploading have no place in the order.
  const movable = useCallback((entry: MixedGridEntry) => !!onMove && !entry.isPinned && !entry.isRepost && !entry.isOptimistic && entry.type !== 'proposal', [onMove]);
  const keys = useMemo(() => entries.map((entry) => entry.key), [entries]);
  // The dropped order, shown until the saved one comes back from the server.
  const [dropped, setDropped] = useState<string[] | null>(null);
  const shownKeys = useMemo(() => {
    if (!dropped) return keys;
    const known = new Set(keys);
    const placed = new Set(dropped);
    return [...dropped.filter((key) => known.has(key)), ...keys.filter((key) => !placed.has(key))];
  }, [dropped, keys]);
  const onCommit = useCallback((next: string[]) => {
    const key = movedKey(shownKeys, next);
    if (!key || !onMove) return;
    const byKey = new Map(entries.map((entry) => [entry.key, entry]));
    const before: string[] = [];
    for (let i = next.indexOf(key) - 1; i >= 0; i -= 1) {
      const entry = byKey.get(next[i]);
      if (entry && movable(entry)) before.push(entry.data.id);
    }
    const moved = byKey.get(key);
    if (!moved) return;
    setDropped(next);
    void onMove(moved.data.id, before).finally(() => setDropped(null));
  }, [shownKeys, entries, movable, onMove]);
  const reorder = useDragReorder({ ids: shownKeys, onCommit, disabled: !onMove || !!dropped, handle: true, holdMs: 160, liftScale: 1.05 });
  const shown = useMemo(() => {
    const byKey = new Map(entries.map((entry) => [entry.key, entry]));
    return reorder.order.map((key) => byKey.get(key)).filter((entry): entry is MixedGridEntry => !!entry);
  }, [entries, reorder.order]);
  /** Spread on a tile so it can slide; `grip` goes inside the ones that move. */
  const tileProps = (entry: MixedGridEntry) => (onMove ? { ...reorder.itemProps(entry.key), 'data-grip': movable(entry) ? '' : undefined } : {});
  const grip = (entry: MixedGridEntry) => (movable(entry) ? (
    <span className="pmg-grip" role="button" aria-label={t('profile.arrange.drag', 'Drag to move')} title={t('profile.arrange.drag', 'Drag to move')} {...reorder.handleProps(entry.key)}>
      <span className="pmg-grip-chip" aria-hidden><i /><i /><i /><i /><i /><i /></span>
    </span>
  ) : null);

  const postBg = useProfilePostBg();
  const articleLook = useProfileArticleTile();
  const navigate = useNavigate();
  // Every tile opens a post. Fetch the post page's code while the reader is
  // still browsing, so a tap shows the post at once instead of a blank page
  // with a spinner while it downloads.
  useEffect(() => {
    const idle = window.requestIdleCallback;
    if (idle) {
      const id = idle(() => warmPostPage(), { timeout: 3000 });
      return () => window.cancelIdleCallback?.(id);
    }
    const timer = window.setTimeout(warmPostPage, 1500);
    return () => window.clearTimeout(timer);
  }, []);

  const profileFeed = useProfileFeedContext();
  /**
   * A post of this profile's own list opens the reel: their posts one by one,
   * full screen, from this one (lib/profile-reel). A repost belongs to someone
   * else's list, so it still opens its post page.
   */
  const openReel = (entry: MixedGridEntry, id: string): boolean => {
    if (entry.isRepost || entry.isOptimistic || !profileFeed?.current) return false;
    // A pinned post that is not also in the loaded list is usually an old one:
    // the reel would have to page back through the whole history to find it.
    if (entry.isPinned && !entries.some((other) => !other.isPinned && !other.isRepost && other.data.id === entry.data.id)) return false;
    noteProfileFeedOpen(profileFeed, id);
    openBrainrotFeed(id, undefined, { bgId: postBgToken(postBg) });
    return true;
  };
  const openPost = (id: string, slug?: string, entry?: MixedGridEntry) => {
    if (entry && openReel(entry, id)) return;
    noteProfileFeedOpen(profileFeed, id);
    navigate(`/app/post/${slug || id}`, { state: { fromFeed: true } });
  };

  return (
    <>
      <div data-profile-mixed-grid className="pmg-grid">
        {shown.map((entry, index) => {
          const pinChip = entry.isPinned ? (
            <span className="pmg-chip pmg-chip--pin"><Pin className="pmg-chip-icon" />{t('profile.pinnedShort', 'Pinned')}</span>
          ) : entry.isRepost ? (
            <span className="pmg-chip pmg-chip--soft"><Repeat2 className="pmg-chip-icon" />{t('profile.repostedShort', 'Repost')}</span>
          ) : null;
          const eager = index < 6;

          if (entry.type === 'proposal') {
            const p = entry.data as { id: string; proposalId: string };
            return (
              <div key={entry.key} className="pmg-wide">
                <ProposalLinkEmbed proposalId={p.proposalId} />
              </div>
            );
          }

          if (entry.type === 'image') {
            const post = entry.data as ImagePost;
            const images = post.imageUrls?.length ? post.imageUrls : [post.image];
            const multi = images.length > 1;
            const mediaKind = mediaCardOf(post);
            return (
              <button
                key={entry.key}
                {...tileProps(entry)}
                type="button"
                data-tile="photo"
                className="pmg-tile"
                disabled={entry.isOptimistic}
                onClick={() => openPost(post.id, post.articleSlug, entry)}
                aria-label={post.caption || post.title || t('profile.tabs.images', 'Image')}
              >
                <img src={tileImage(post.image)} alt="" loading={eager ? 'eager' : 'lazy'} decoding="async" className={post.isPPV ? 'pmg-img pmg-img--locked' : 'pmg-img'} />
                {(multi || pinChip || mediaKind) && <span className="pmg-shade" />}
                {multi && <Badge label={t('profile.multiPhoto', 'Photos')}><Images /></Badge>}
                {post.isPPV && <span className="pmg-lock"><Lock /></span>}
                {pinChip ?? (mediaKind && <GridKindPill kind={mediaKind} />)}
                {grip(entry)}
              </button>
            );
          }

          if (entry.type === 'video') {
            const video = entry.data as VideoItem;
            const isLive = !!(video.isLiveNow || video.liveIsActive);
            const locked = !!(video.isPPV || video.isLocked) && !video.isUnlocked && !video.isOwner;
            const mediaKind = mediaCardOf(video);

            if (video.isAudio) {
              const cover = video.thumbnail;
              return (
                <button key={entry.key} {...tileProps(entry)} type="button" data-tile="audio" className="pmg-tile pmg-audio" disabled={entry.isOptimistic} onClick={() => openPost(video.id, video.articleSlug, entry)} aria-label={video.title}>
                  {cover ? <span className="pmg-audio-blur" style={{ backgroundImage: `url(${cover})` }} /> : <span className="pmg-audio-blur pmg-audio-blur--empty" />}
                  <span className="pmg-audio-cover" style={cover ? { backgroundImage: `url(${cover})` } : undefined}>{!cover && <Music />}</span>
                  <Badge label={t('profile.tabs.songs', 'Audio')}><Music /></Badge>
                  <span className="pmg-wave" aria-hidden>
                    {waveFor(video.id).map((h, i) => <i key={i} style={{ height: `${Math.round(h * 100)}%` }} />)}
                  </span>
                  <span className="pmg-audio-title">{video.title}</span>
                  {pinChip}
                  {grip(entry)}
                </button>
              );
            }

            return (
              <button key={entry.key} {...tileProps(entry)} type="button" data-tile={isLive ? 'live' : 'video'} className={isLive ? 'pmg-tile pmg-live' : 'pmg-tile'} disabled={entry.isOptimistic} onClick={() => openPost(video.id, video.articleSlug, entry)} aria-label={video.title}>
                {video.thumbnail ? <img src={tileImage(video.thumbnail)} alt="" loading={eager ? 'eager' : 'lazy'} decoding="async" className={locked ? 'pmg-img pmg-img--locked' : 'pmg-img'} /> : <span className="pmg-img pmg-img--empty" />}
                <span className="pmg-shade" />
                {isLive ? (
                  <span className="pmg-chip pmg-chip--live"><i />{t('live.liveBadge', 'LIVE')}</span>
                ) : (
                  <>
                    <Badge label={video.isLivePost ? t('profile.tabs.live', 'Live') : video.isShort ? t('profile.gridCard.short', 'Short') : t('profile.tabs.videos', 'Video')}>{video.isLivePost ? <Radio /> : video.isShort ? <Shorts /> : <Film />}</Badge>
                    {!!video.duration && video.duration !== '0:00' && <span className="pmg-dur">{video.duration}</span>}
                  </>
                )}
                {!!video.views && video.views !== '0' && <span className="pmg-views">{video.views}</span>}
                {locked && <span className="pmg-lock"><Lock /></span>}
                {!isLive && (pinChip ?? (mediaKind && <GridKindPill kind={mediaKind} />))}
                {grip(entry)}
              </button>
            );
          }

          const post = entry.data as TextPost;
          const isArticle = !!post.articleBody;
          const openThis = () => {
            if (openReel(entry, post.id)) return;
            noteProfileFeedOpen(profileFeed, post.id);
            navigate(post.articleSlug ? `/app/post/${post.articleSlug}` : post.newPostId ? `/newpost/${post.newPostId}` : `/app/post/${post.id}`, { state: { fromFeed: true } });
          };

          if (isArticle) {
            const title = plainText(post.title || post.content);
            return (
              <button
                key={entry.key}
                {...tileProps(entry)}
                type="button"
                data-tile="article"
                data-article-tile={articleLook}
                className={articleLook === 'dropcap' ? 'pmg-tile pmg-adrop' : 'pmg-tile'}
                disabled={entry.isOptimistic}
                onClick={openThis}
                aria-label={title}
              >
                <ArticleTileFace
                  look={articleLook}
                  cover={post.articleImageUrl ? tileImage(post.articleImageUrl) : undefined}
                  title={title}
                  minutes={articleReadMinutes(post.articleBody)}
                  views={post.views && post.views !== '0' ? post.views : undefined}
                  eager={eager}
                />
                {articleLook === 'cover' && <Badge label={t('profile.tabs.articles', 'Article')}><Blog /></Badge>}
                {pinChip}
                {grip(entry)}
              </button>
            );
          }

          const locked = !!post.isLocked && !post.isUnlocked && !post.isOwner;
          // A post whose feed card is a stage, poll, event, link... is drawn as
          // a small copy of that card (GridCardTile). Locked words stay hidden.
          const card = locked ? null : textCardOf(post);
          const words = plainText(card ? wordsWithoutLinks(post.content || post.title || '') : post.content || post.title);
          const tokenId = Number(String(post.id).replace(/^[a-z]+-/, '')) || 0;
          const poster = (pill?: ReactNode) => (
            <>
              <Badge label={t('profile.tabs.posts', 'Post')}><MessageSquare /></Badge>
              {pinChip ?? pill ?? <span className="pmg-quote" aria-hidden>“</span>}
              <span className="pmg-words">{locked ? <><Lock className="pmg-inline-lock" />{t('profile.lockedPost', 'Locked post')}</> : words}</span>
              <span className="pmg-meta pmg-stats">
                <span><MessageSquare />{compact(post.stats?.comments)}</span>
                <span><ThumbsUp />{compact(post.stats?.likes)}</span>
              </span>
            </>
          );
          if (card) {
            return (
              <button key={entry.key} {...tileProps(entry)} type="button" data-tile="text" data-card={card.kind} className="pmg-tile pmg-poster pmg-text" disabled={entry.isOptimistic} onClick={openThis} aria-label={words.slice(0, 80) || post.title || t('profile.tabs.posts', 'Post')}>
                <GridCardFace card={card} tokenId={tokenId} quotedPost={post.quotedPost} words={words} chip={pinChip ?? undefined} fallback={poster(<GridKindPill kind={card.kind} inline />)} />
                {grip(entry)}
              </button>
            );
          }
          return (
            <button key={entry.key} {...tileProps(entry)} type="button" data-tile="text" className="pmg-tile pmg-poster pmg-text" disabled={entry.isOptimistic} onClick={openThis} aria-label={words.slice(0, 80)} data-soft={postBgVariant(post.id, 3)} {...(entry.isRepost ? {} : postBgHostProps(postBg))}>
              {!entry.isRepost && <PostBgLayer bg={postBg} seed={post.id} />}
              {locked || entry.isOptimistic || tokenId <= 0
                ? poster()
                : <GridPollProbe tokenId={tokenId} words={words} chip={pinChip ?? undefined} poster={poster()} fallback={poster(<GridKindPill kind="poll" inline />)} />}
              {grip(entry)}
            </button>
          );
        })}
      </div>
    </>
  );
});

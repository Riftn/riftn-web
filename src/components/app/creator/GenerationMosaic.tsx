import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Heart, ImageOff, MessageCircle, Play } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { generationPath, readGenerations } from '@/lib/creator/gallery';
import '@/styles/creator-gallery.css';

function mosaicThumbnail(url: string, width: number | null, height: number | null) {
  if (!url.includes('/storage/v1/object/public/')) return url;
  const thumbnail = new URL(url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/'));
  thumbnail.searchParams.set('width', '640');
  thumbnail.searchParams.set('height', String(width && height ? Math.max(1, Math.round(640 * height / width)) : 640));
  thumbnail.searchParams.set('resize', 'contain');
  thumbnail.searchParams.set('quality', '65');
  return thumbnail.toString();
}

const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
// Skeleton heights vary so loading looks like the masonry it becomes.
const SKELETONS = [220, 300, 180, 260, 340, 200, 280, 240];

export function GenerationMosaic({ preview = false, hideHeading = false }: { preview?: boolean; hideHeading?: boolean }) {
  const { t } = useTranslation();
  const { walletAddress } = useAuth();
  const query = useInfiniteQuery({ queryKey: ['public-generations', 'list', walletAddress], initialPageParam: 0,
    queryFn: ({ pageParam }) => readGenerations(pageParam, undefined, walletAddress), getNextPageParam: (page, pages) => page.length === 40 ? pages.length * 40 : undefined });
  const items = query.data?.pages.flat() ?? [];
  const shown = preview ? items.slice(0, 12) : items;
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  // The full gallery keeps loading as you near the end, like a Chat list.
  useEffect(() => {
    const node = sentinel.current;
    if (preview || !node || !hasNextPage) return;
    const observer = new IntersectionObserver(entries => { if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage(); }, { rootMargin: '800px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [preview, hasNextPage, isFetchingNextPage, fetchNextPage]);

  return <section data-gallery-look className={hideHeading ? "px-3 pb-6 pt-1 sm:px-4" : "px-3 py-5 sm:px-4"} aria-label={t('creator.communityFeed')}>
    {hideHeading ? <h2 className="sr-only">{t('creator.madeOnDehub')}</h2> : <div data-gallery-grid-head>
      <h2>{t('creator.madeOnDehub')}</h2>
      {preview && <Link data-gallery-pill to="/creator/gallery">{t('creator.gallery.browse', { defaultValue: 'Browse generations' })}<ArrowRight /></Link>}
    </div>}
    {query.isError && <div data-gallery-empty><ImageOff size={28} /><button data-gallery-pill onClick={() => void query.refetch()}>{t('common.retry', { defaultValue: 'Retry' })}</button></div>}
    {!query.isLoading && !query.isError && !items.length && <div data-gallery-empty><ImageOff size={28} /><p>{t('creator.noCreationsYet')}</p></div>}
    <div className="columns-2 gap-3 md:columns-3 xl:columns-4 2xl:columns-5" aria-busy={query.isLoading || isFetchingNextPage}>
      {query.isLoading && SKELETONS.map((height, i) => <div key={i} data-gallery-skeleton style={{ height }} aria-hidden />)}
      {shown.map(item => {
        const label = item.title || t('creator.aiGenerationCommunityAlt');
        const hasStats = item.likes > 0 || item.comments > 0;
        return <Link key={item.id} to={generationPath(item.id)} data-gallery-tile aria-label={label}>
          <img src={mosaicThumbnail(item.image_url, item.width, item.height)} alt={label} loading="lazy" decoding="async"
            width={item.width ?? undefined} height={item.height ?? undefined} />
          {item.video_url && <span data-gallery-video-badge aria-hidden><Play fill="currentColor" /></span>}
          <span data-gallery-tile-meta data-has-stats={hasStats || undefined} aria-hidden>
            <span>{item.title}</span>
            <span className="flex shrink-0 gap-2.5">
              {item.likes > 0 && <span data-gallery-stat><Heart fill="currentColor" />{compact.format(item.likes)}</span>}
              {item.comments > 0 && <span data-gallery-stat><MessageCircle fill="currentColor" />{compact.format(item.comments)}</span>}
            </span>
          </span>
        </Link>;
      })}
      {isFetchingNextPage && SKELETONS.slice(0, 4).map((height, i) => <div key={`more-${i}`} data-gallery-skeleton style={{ height }} aria-hidden />)}
    </div>
    {!preview && hasNextPage && <div ref={sentinel} className="mt-4 flex justify-center">
      <button data-gallery-pill disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>{t('common.loadMore')}</button>
    </div>}
  </section>;
}

import { Link } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { generationPath, readGenerations } from '@/lib/creator/gallery';
function mosaicThumbnail(url: string, width: number | null, height: number | null) {
  if (!url.includes('/storage/v1/object/public/')) return url;
  const thumbnail = new URL(url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/'));
  thumbnail.searchParams.set('width', '640');
  thumbnail.searchParams.set('height', String(width && height ? Math.max(1, Math.round(640 * height / width)) : 640));
  thumbnail.searchParams.set('resize', 'contain');
  thumbnail.searchParams.set('quality', '65');
  return thumbnail.toString();
}

export function GenerationMosaic({ preview = false }: { preview?: boolean }) {
  const { t } = useTranslation();
  const { walletAddress } = useAuth();
  const query = useInfiniteQuery({ queryKey: ['public-generations', 'list', walletAddress], initialPageParam: 0,
    queryFn: ({ pageParam }) => readGenerations(pageParam, undefined, walletAddress), getNextPageParam: (page, pages) => page.length === 40 ? pages.length * 40 : undefined });
  const items = query.data?.pages.flat() ?? [];
  return <section className="px-3 py-5 sm:px-4" aria-label={t('creator.communityFeed')}>
    <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-2xl font-bold">{t('creator.madeOnDehub')}</h2>
      {preview && <Link className="underline" to="/creator/gallery">{t('creator.gallery.browse', { defaultValue: 'Browse generations' })}</Link>}</div>
    {query.isLoading && <p role="status">{t('common.loading')}</p>}
    {query.isError && <button onClick={() => void query.refetch()}>{t('common.retry', { defaultValue: 'Retry' })}</button>}
    {!query.isLoading && !query.isError && !items.length && <p>{t('creator.noCreationsYet')}</p>}
    <div className="columns-2 gap-3 md:columns-3 xl:columns-4">
      {(preview ? items.slice(0, 12) : items).map(item => <Link key={item.id} to={generationPath(item.id)}
        className="mb-3 block break-inside-avoid overflow-hidden rounded-xl border border-current/10 bg-current/5 focus-visible:outline focus-visible:outline-2"
        aria-label={item.title || t('creator.aiGenerationCommunityAlt')}>
        <img src={mosaicThumbnail(item.image_url, item.width, item.height)} alt={item.title || t('creator.aiGenerationCommunityAlt')} loading="lazy" decoding="async"
          width={item.width ?? undefined} height={item.height ?? undefined} className="h-auto w-full" />
      </Link>)}
    </div>
    {!preview && query.hasNextPage && <button className="mx-auto mt-4 block rounded-full border px-5 py-2" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{t('common.loadMore')}</button>}
  </section>;
}

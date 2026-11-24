import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Archive, Film, Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useKidsModeLock } from '@/hooks/use-kids-mode';
import { useMatureContent } from '@/hooks/use-mature-content';
import { getStoryArchive } from '@/lib/api/dehub/stories';

export function MomentArchive({ profileAddress }: { profileAddress: string }) {
  const { walletAddress, isAuthenticated } = useAuth();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const address = walletAddress?.toLowerCase();
  if (!isAuthenticated || !address || profileAddress.toLowerCase() !== address) return null;

  return (
    <section className="mt-3">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}
        className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 font-medium hover:bg-white/10">
        <Archive aria-hidden size={17} />{t('stories.momentArchive', { defaultValue: 'Moment archive' })}
        {/* Nobody else gets this list from the server; say so. */}
        <Lock aria-hidden size={12} className="ml-1 opacity-60" />
        <span className="text-xs font-normal opacity-60">{t('stories.archiveOnlyYou', { defaultValue: 'Only you can see this' })}</span>
      </button>
      {open && <ArchiveItems address={address} />}
    </section>
  );
}

function ArchiveItems({ address }: { address: string }) {
  const { t, i18n } = useTranslation();
  const { showMatureContent } = useMatureContent();
  const kidsMode = useKidsModeLock();
  const canSeeMature = showMatureContent && !kidsMode;
  const archive = useInfiniteQuery({
    queryKey: ['moment-archive', address, canSeeMature],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => getStoryArchive(pageParam),
    getNextPageParam: page => page.next ?? undefined,
    gcTime: 0,
    retry: false,
  });
  const items = archive.data?.pages.flatMap(page => page.items)
    .filter(item => item.address.toLowerCase() === address && (!item.isMature || canSeeMature)) ?? [];
  return (
    <div className="flex items-center gap-2 overflow-x-auto py-2">
      {items.map(item => {
        const cover = item.posterUrl || (item.type === 'photo' ? item.mediaUrl : null);
        const date = new Date(item.createdAt).toLocaleDateString(i18n.language);
        return (
          <Link key={item.id} to={`/app/moment/${item.id}`} state={{ fromMomentArchive: true }} aria-label={item.caption ? `${date} · ${item.caption}` : date}
            className="relative grid h-28 w-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-zinc-800 text-white">
            {cover ? <img src={cover} alt="" loading="lazy" className="size-full object-cover" /> : <Film aria-hidden />}
            <span className="absolute inset-x-0 bottom-0 bg-black/70 px-1 py-1 text-center text-xs">{date}</span>
          </Link>
        );
      })}
      {archive.isLoading && <span role="status">{t('common.loading')}</span>}
      {!items.length && archive.isSuccess && <span>{t('nftMarket.noActivity')}</span>}
      {archive.isError || archive.hasNextPage ? (
        <button type="button" disabled={archive.isFetching} className="shrink-0 rounded-lg px-3 py-2"
          onClick={() => archive.hasNextPage ? void archive.fetchNextPage() : void archive.refetch()}>
          {t(archive.isError ? 'common.retry' : 'common.loadMore')}
        </button>
      ) : null}
    </div>
  );
}

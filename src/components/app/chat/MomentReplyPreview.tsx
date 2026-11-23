import { useEffect, useReducer } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Layers } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useKidsModeLock } from '@/hooks/use-kids-mode';
import { useMatureContent } from '@/hooks/use-mature-content';
import { getStory } from '@/lib/api/dehub/stories';
import { nameOf } from '../stories/story-utils';

export function MomentReplyPreview({ id }: { id: string }) {
  const { t } = useTranslation();
  const { walletAddress, isAuthenticated } = useAuth();
  const { showMatureContent } = useMatureContent();
  const kidsMode = useKidsModeLock();
  const canSeeMature = isAuthenticated && showMatureContent && !kidsMode;
  const { data, isSuccess } = useQuery({
    queryKey: ['moment-reply-preview', id, isAuthenticated && walletAddress, canSeeMature],
    queryFn: () => getStory(id, isAuthenticated),
    enabled: isAuthenticated && !!walletAddress,
    gcTime: 0,
    retry: false,
  });
  const expires = Date.parse(data?.item.expiresAt ?? '');
  const [, onExpiry] = useReducer((value: number) => value + 1, 0);
  useEffect(() => {
    if (expires > Date.now()) {
      const timer = window.setTimeout(onExpiry, expires - Date.now() + 1);
      return () => window.clearTimeout(timer);
    }
  }, [expires]);
  const item = isSuccess && data.author && expires > Date.now() && !data.item.expired && data.item.status === 'ready'
    && (!data.item.isMature || canSeeMature) ? data.item : null;
  const thumb = item?.posterUrl || (item?.type === 'photo' ? item.mediaUrl : null);
  const author = item && data?.author ? nameOf(data.author) : null;
  return (
    <Link to={`/app/moment/${id}?reply=1`} onClick={event => event.stopPropagation()}
      className="flex w-full items-center gap-2.5 rounded-lg border-s-2 border-current bg-white/[0.06] px-2 py-1.5 text-start hover:bg-white/10">
      <span className="grid h-11 w-8 shrink-0 place-items-center overflow-hidden rounded-md bg-zinc-800 text-white">
        {thumb ? <img src={thumb} alt="" className="size-full object-cover" /> : <Layers size={16} aria-hidden />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-xs opacity-70">{t('stories.watchOriginal', { defaultValue: 'Watch original moment' })}</span>
        {author && <span dir="auto" className="truncate text-sm font-semibold">{author}</span>}
      </span>
      <ChevronRight size={14} className="shrink-0 opacity-70 rtl:rotate-180" aria-hidden />
    </Link>
  );
}

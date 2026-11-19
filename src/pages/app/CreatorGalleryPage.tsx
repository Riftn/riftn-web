import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ChevronLeft, ChevronRight, Bookmark, Download, ImageOff, Maximize, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { CardHeader } from '@/components/app/cards/CardHeader';
import { getAccountSummaries } from '@/lib/api/dehub/users';
import { ActionBar } from '@/components/app/cards/ActionBar';
import { FullscreenImageViewerLazy } from '@/components/app/cards/FullscreenImageViewerLazy';
import { GenerationMosaic } from '@/components/app/creator/GenerationMosaic';
import { GenerationDiscussion } from '@/components/app/creator/GenerationDiscussion';
import { generationPath, readGenerations, writeGeneration } from '@/lib/creator/gallery';
import { downloadMedia } from '@/lib/download-media';

export default function CreatorGalleryPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { walletAddress, user, openLoginModal } = useAuth();
  const qc = useQueryClient();
  const [fullscreen, setFullscreen] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const comments = useRef<HTMLDivElement>(null);
  const list = useInfiniteQuery({ queryKey: ['public-generations', 'list', walletAddress], initialPageParam: 0,
    queryFn: ({ pageParam }) => readGenerations(pageParam, undefined, walletAddress), getNextPageParam: (page, pages) => page.length === 40 ? pages.length * 40 : undefined, enabled: !!id });
  const detail = useQuery({ queryKey: ['public-generations', id, walletAddress], queryFn: () => readGenerations(0, id, walletAddress), enabled: !!id });
  const item = detail.data?.[0];
  const author = useQuery({ queryKey: ['generation-author', item?.owner_wallet], enabled: !!item?.owner_wallet, staleTime: 300_000, queryFn: async () => (await getAccountSummaries([item!.owner_wallet!]))[0] }).data;
  const items = list.data?.pages.flat() ?? [];
  const index = items.findIndex(row => row.id === id);
  // Deep links can start beyond the first page; continue until their neighbours are available.
  useEffect(() => { if (id && list.hasNextPage && !list.isFetchingNextPage && (index < 0 || index >= items.length - 2)) void list.fetchNextPage(); }, [id, index, items.length, list.hasNextPage, list.isFetchingNextPage, list.fetchNextPage]);
  const move = useCallback((delta: number) => { const next = items[index + delta]; if (index >= 0 && next) navigate(generationPath(next.id), { replace: true }); }, [index, items, navigate]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (fullscreen || (event.target instanceof HTMLElement && (event.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)))) return;
      if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); }
      if (event.key === 'ArrowRight') { event.preventDefault(); move(1); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [move, fullscreen]);
  const mutation = useMutation({ mutationFn: ({ action, data }: { action: string; data: Record<string, string | boolean | null> }) => writeGeneration(id!, action, { ...data, username: user?.username ?? null, avatar: user?.avatarImageUrl ?? null }, walletAddress),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['public-generations'] }); }, onError: (error: Error) => toast.error(error.message) });
  const share = async () => {
    const url = `${window.location.origin}${generationPath(id!)}`;
    try { if (navigator.share) await navigator.share({ url, title: item?.title }); else { await navigator.clipboard.writeText(url); toast.success(t('common.copied', { defaultValue: 'Link copied' })); } }
    catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) toast.error(t('common.somethingWentWrong')); }
  };
  const authorName = item?.owner_wallet ? author?.displayName || author?.username || item.owner_wallet.slice(0, 6) + '…' + item.owner_wallet.slice(-4) : null;
  const prevDisabled = index <= 0;
  const nextDisabled = index < 0 || index >= items.length - 1;
  return <main data-gallery-look data-gallery-page data-creator-gallery data-glass-page>
    <header data-gallery-bar>
      <div data-gallery-bar-pill>
        <Link data-gallery-icon to={id ? '/creator/gallery' : '/creator'} aria-label={t('common.back')}><ArrowLeft /></Link>
        <h1 data-gallery-bar-title>{id && item ? item.title || t('creator.aiGenerationAlt') : t('creator.madeOnDehub')}
          {id && authorName && <small>{authorName}</small>}</h1>
        {id && <>
          <button data-gallery-icon disabled={prevDisabled} onClick={() => move(-1)} aria-label={t('common.previous', { defaultValue: 'Previous' })}><ChevronLeft /></button>
          <button data-gallery-icon disabled={nextDisabled} onClick={() => move(1)} aria-label={t('common.next', { defaultValue: 'Next' })}><ChevronRight /></button>
        </>}
        {!id && <Link data-gallery-pill to="/creator" className="mr-1"><Sparkles />{t('creator.gallery.create', { defaultValue: 'Create' })}</Link>}
      </div>
    </header>
    {!id ? <div className="mx-auto max-w-[1800px]"><GenerationMosaic hideHeading /></div>
      : detail.isLoading ? <div className="mx-auto grid max-w-[1800px] gap-4 px-3 pb-6 sm:px-4 lg:grid-cols-[minmax(0,1fr)_400px]" role="status" aria-label={t('common.loading')}>
        <div data-gallery-skeleton className="h-[60dvh]" /><div data-gallery-skeleton className="h-[40dvh]" /></div>
      : detail.isError ? <div className="px-3 sm:px-4"><div data-gallery-empty><ImageOff size={28} /><button data-gallery-pill onClick={() => void detail.refetch()}>{t('common.retry', { defaultValue: 'Retry' })}</button></div></div>
      : !item ? <div className="px-3 sm:px-4"><div data-gallery-empty><ImageOff size={28} /><p>{t('creator.gallery.missing', { defaultValue: 'This generation is unavailable.' })}</p>
        <Link data-gallery-pill to="/creator/gallery">{t('creator.gallery.browse', { defaultValue: 'Browse generations' })}</Link></div></div> :
      <div className="mx-auto grid max-w-[1800px] gap-4 px-3 pb-8 sm:px-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 lg:sticky lg:top-[88px] lg:self-start">
          <div data-gallery-stage className="min-h-[30dvh] lg:h-[calc(100dvh-180px)]" style={{ touchAction: 'pan-y pinch-zoom' }}
            onTouchStart={event => { const touch = event.touches[0]; start.current = event.touches.length === 1 ? { x: touch.clientX, y: touch.clientY } : null; }}
            onTouchEnd={event => { const touch = event.changedTouches[0]; const origin = start.current; start.current = null; if (!origin) return; const dx = touch.clientX - origin.x; const dy = touch.clientY - origin.y; if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) move(dx < 0 ? 1 : -1); }}>
            <div data-gallery-stage-glow style={{ backgroundImage: `url("${item.image_url}")` }} aria-hidden />
            {item.video_url ? <video key={id} src={item.video_url} controls playsInline className="max-h-[80dvh] w-full object-contain lg:h-full lg:max-h-none" /> : <img src={item.image_url} alt={item.title || t('creator.aiGenerationAlt')} width={item.width ?? undefined} height={item.height ?? undefined} className="max-h-[80dvh] w-full object-contain lg:h-full lg:max-h-none" />}
            {!item.video_url && <button data-gallery-stage-tool aria-label={t('creator.gallery.fullscreen', { defaultValue: 'View full screen' })} onClick={() => setFullscreen(true)}><Maximize /></button>}
            <button data-gallery-stage-nav data-side="prev" disabled={prevDisabled} onClick={() => move(-1)} aria-label={t('common.previous', { defaultValue: 'Previous' })}><ChevronLeft /></button>
            <button data-gallery-stage-nav data-side="next" disabled={nextDisabled} onClick={() => move(1)} aria-label={t('common.next', { defaultValue: 'Next' })}><ChevronRight /></button>
          </div>
          <div data-gallery-card data-gallery-actions className="mt-3">
            <ActionBar key={id} postId={`generation:${id}`} shareUrl={`${window.location.origin}${generationPath(id)}`} hideUtility hideDislike
              isLiked={!!item.my_reaction && item.my_reaction !== 'dislike'} myReaction={item.my_reaction} reactionCounts={item.reaction_counts} likeCount={item.likes} commentCount={item.comments} voteWeight={1}
              disabled={mutation.isPending} onReaction={reaction => mutation.mutateAsync({ action: 'react', data: { reaction } })}
              onComment={() => { comments.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); comments.current?.querySelector('textarea')?.focus({ preventScroll: true }); }} onShare={() => void share()} />
          </div>
        </div>
        <aside className="flex min-w-0 flex-col gap-3">
          <div data-gallery-card className="p-4">
            {item.owner_wallet && authorName && <CardHeader username={authorName} handle={author?.username || undefined} avatarSeed={author?.avatarImageUrl || item.owner_wallet} creatorId={item.owner_wallet} creatorUsername={author?.username || undefined} contentType={item.video_url ? 'video' : 'image'} badgeLookupId={item.owner_wallet} timestamp={new Date(item.created_at).toLocaleDateString()} className="mb-3" />}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><h2 className="text-lg font-bold leading-snug">{item.title || t('creator.aiGenerationAlt')}</h2>
                <p data-gallery-muted className="text-xs">{new Date(item.created_at).toLocaleDateString()}</p></div>
              <div className="flex gap-1.5">
                <button data-gallery-icon data-boxed aria-label={t('common.save', { defaultValue: 'Save' })} aria-pressed={item.saved} disabled={mutation.isPending} onClick={() => { if (!walletAddress) openLoginModal(); else mutation.mutate({ action: 'save', data: { saved: !item.saved } }); }}><Bookmark fill={item.saved ? 'currentColor' : 'none'} /></button>
                <button data-gallery-icon data-boxed aria-label={t('common.download', { defaultValue: 'Download' })} onClick={() => void downloadMedia(item.image_url, `generation-${id}.png`).catch(() => toast.error(t('common.somethingWentWrong')))}><Download /></button>
              </div>
            </div>
          </div>
          <div ref={comments} data-gallery-card className="scroll-mt-24 p-4"><GenerationDiscussion key={id} id={id} owner={item.owner_wallet} focusCommentId={params.get('comment')} /></div>
        </aside>
      </div>}
    {item && fullscreen && <FullscreenImageViewerLazy images={[item.image_url]} initialIndex={0} isOpen onClose={() => setFullscreen(false)} downloadable />}
  </main>;
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ChevronLeft, ChevronRight, Bookmark, Download, Maximize } from 'lucide-react';
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
    catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) toast.error(t('common.error', { defaultValue: 'Something went wrong. Please try again.' })); }
  };
  const button = 'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-current/15 px-3 disabled:opacity-30';
  return <main className="min-h-dvh bg-background text-foreground" data-creator-gallery>
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-current/10 bg-background/95 px-4 py-3 backdrop-blur-xl">
      <Link className={button} to={id ? '/creator/gallery' : '/creator'} aria-label={t('common.back')}><ArrowLeft size={20} /></Link>
      <h1 className="font-bold">{t('creator.madeOnDehub')}</h1>
      <div className="flex gap-2">{id && <><button className={button} disabled={index <= 0} onClick={() => move(-1)} aria-label={t('common.previous', { defaultValue: 'Previous' })}><ChevronLeft /></button><button className={button} disabled={index < 0 || index >= items.length - 1} onClick={() => move(1)} aria-label={t('common.next', { defaultValue: 'Next' })}><ChevronRight /></button></>}</div>
    </header>
    {!id ? <GenerationMosaic /> : detail.isLoading ? <p role="status" className="p-8">{t('common.loading')}</p> : detail.isError ? <button onClick={() => void detail.refetch()}>{t('common.retry', { defaultValue: 'Retry' })}</button> : !item ? <p className="p-8">{t('creator.gallery.missing', { defaultValue: 'This generation is unavailable.' })}</p> :
      <div className="mx-auto grid max-w-[1800px] lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 lg:sticky lg:top-20 lg:self-start">
          <div className="relative flex min-h-[30dvh] items-center justify-center bg-black lg:h-[calc(100dvh-9rem)]" style={{ touchAction: 'pan-y pinch-zoom' }}
            onTouchStart={event => { const touch = event.touches[0]; start.current = event.touches.length === 1 ? { x: touch.clientX, y: touch.clientY } : null; }}
            onTouchEnd={event => { const touch = event.changedTouches[0]; const origin = start.current; start.current = null; if (!origin) return; const dx = touch.clientX - origin.x; const dy = touch.clientY - origin.y; if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) move(dx < 0 ? 1 : -1); }}>
            {item.video_url ? <video key={id} src={item.video_url} controls playsInline className="max-h-[80dvh] w-full object-contain" /> : <img src={item.image_url} alt={item.title || t('creator.aiGenerationAlt')} width={item.width ?? undefined} height={item.height ?? undefined} className="max-h-[80dvh] w-full object-contain" />}
            {!item.video_url && <button className="absolute right-3 top-3 rounded-full bg-black/60 p-3 text-white" aria-label={t('creator.gallery.fullscreen', { defaultValue: 'View full screen' })} onClick={() => setFullscreen(true)}><Maximize size={18} /></button>}
          </div>
          <ActionBar key={id} postId={`generation:${id}`} shareUrl={`${window.location.origin}${generationPath(id)}`} hideUtility hideDislike
            isLiked={!!item.my_reaction && item.my_reaction !== 'dislike'} myReaction={item.my_reaction} reactionCounts={item.reaction_counts} likeCount={item.likes} commentCount={item.comments} voteWeight={1}
            disabled={mutation.isPending} onReaction={reaction => mutation.mutateAsync({ action: 'react', data: { reaction } })}
            onComment={() => { comments.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); comments.current?.querySelector('textarea')?.focus({ preventScroll: true }); }} onShare={() => void share()} />
        </div>
        <aside className="min-w-0 border-current/10 p-4 lg:border-l">
          {item.owner_wallet && <CardHeader username={author?.displayName || author?.username || item.owner_wallet.slice(0, 6) + '…' + item.owner_wallet.slice(-4)} handle={author?.username || undefined} avatarSeed={author?.avatarImageUrl || item.owner_wallet} creatorId={item.owner_wallet} creatorUsername={author?.username || undefined} contentType={item.video_url ? 'video' : 'image'} badgeLookupId={item.owner_wallet} timestamp={new Date(item.created_at).toLocaleDateString()} className="mb-4" />}
          <div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold">{item.title || t('creator.aiGenerationAlt')}</h2>
            <p className="text-xs opacity-60">{new Date(item.created_at).toLocaleDateString()}</p></div>
            <div className="flex gap-2"><button className={button} aria-label={t('common.save', { defaultValue: 'Save' })} aria-pressed={item.saved} disabled={mutation.isPending} onClick={() => { if (!walletAddress) openLoginModal(); else mutation.mutate({ action: 'save', data: { saved: !item.saved } }); }}><Bookmark size={18} fill={item.saved ? 'currentColor' : 'none'} /></button>
              <button className={button} aria-label={t('common.download', { defaultValue: 'Download' })} onClick={() => void downloadMedia(item.image_url, `generation-${id}.png`).catch(() => toast.error(t('common.error', { defaultValue: 'Something went wrong. Please try again.' })))}><Download size={18} /></button></div></div>
          <div ref={comments} className="scroll-mt-24"><GenerationDiscussion key={id} id={id} owner={item.owner_wallet} focusCommentId={params.get('comment')} /></div>
        </aside>
      </div>}
    {item && fullscreen && <FullscreenImageViewerLazy images={[item.image_url]} initialIndex={0} isOpen onClose={() => setFullscreen(false)} downloadable />}
  </main>;
}

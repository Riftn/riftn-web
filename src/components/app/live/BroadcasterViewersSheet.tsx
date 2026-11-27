import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer';
import { useAuth } from '@/contexts/AuthContext';
import { getBroadcasterViewers, type ViewerPeriod } from '@/lib/api/dehub/livestream';
import { buildAvatarUrl } from '@/lib/media-url';

interface Props {
  streamId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  live?: boolean;
}

function ViewerList({ streamId, address, live }: { streamId: string; address: string; live: boolean }) {
  const { t } = useTranslation();
  const [selection, setSelection] = useState<ViewerPeriod>('now');
  const [offsets, setOffsets] = useState([0]);
  const period = live ? selection : 'past';
  const offset = offsets[offsets.length - 1];
  const query = useQuery({
    queryKey: ['broadcaster-viewers', address, streamId, period, offset],
    queryFn: () => getBroadcasterViewers(streamId, period, offset),
    gcTime: 0,
    staleTime: 0,
    retry: false,
    refetchInterval: live && offset === 0 ? 15_000 : false,
  });
  const next = query.isError ? null : query.data?.nextOffset;

  return (
    <>
      {live && (
        <div className="flex shrink-0 gap-2 pb-2">
          {(['now', 'past'] as const).map((tab) => (
            <Button key={tab} type="button" size="sm" variant={tab === period ? 'default' : 'ghost'}
              aria-pressed={tab === period} onClick={() => { setSelection(tab); setOffsets([0]); }}>
              {tab === 'now' ? t('liveAudience.hereNow', 'Here now') : t('liveAudience.wasHere', 'Was here')}
            </Button>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" key={`${period}:${offset}`} data-vaul-no-drag>
        {query.isPending ? (
          <p role="status" className="py-4 text-sm text-muted-foreground">{t('common.loading', 'Loading…')}</p>
        ) : query.isError ? (
          <div className="space-y-2 py-4">
            <p role="status" className="text-sm text-muted-foreground">{t('liveAudience.viewersFailed', 'Could not load viewers.')}</p>
            <Button type="button" size="sm" variant="outline" onClick={() => void query.refetch()}>{t('common.retry', 'Retry')}</Button>
          </div>
        ) : query.data.viewers.length === 0 ? (
          <p role="status" className="py-4 text-sm text-muted-foreground">{t('liveAudience.noViewersSharing', 'No viewers to show.')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {query.data.viewers.map((viewer) => {
              const name = viewer.displayName || viewer.username || t('liveAudience.unnamedViewer', 'Riftn viewer');
              return (
                <li key={viewer.id} className="flex min-h-12 items-center gap-3 py-1.5">
                  <Avatar className="size-8 shrink-0">
                    <AvatarImage src={buildAvatarUrl('', viewer.avatarImageUrl)} alt="" />
                    <AvatarFallback>{name[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{name}</span>
                    {viewer.username && viewer.username !== name && (
                      <span className="block truncate text-xs text-muted-foreground">@{viewer.username}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {(offset > 0 || next != null) && (
        <div className="flex shrink-0 justify-between gap-2 border-t border-border pt-2">
          <Button type="button" size="sm" variant="ghost" disabled={offset === 0}
            onClick={() => setOffsets((pages) => pages.slice(0, -1))}>{t('common.previous', 'Previous')}</Button>
          <Button type="button" size="sm" variant="ghost" disabled={next == null}
            onClick={() => { if (next != null) setOffsets((pages) => [...pages, next]); }}>{t('common.next', 'Next')}</Button>
        </div>
      )}
    </>
  );
}

export function BroadcasterViewersSheet({ streamId, open, onOpenChange, live = false }: Props) {
  const { t } = useTranslation();
  const { walletAddress, isAuthenticated } = useAuth();
  const address = isAuthenticated ? walletAddress?.toLowerCase() : undefined;

  return (
    <Drawer open={open && !!address} onOpenChange={onOpenChange}>
      <DrawerContent column glass className="max-h-[82dvh] px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <DrawerTitle className="pt-2 text-base font-semibold">
          {live ? t('liveAudience.viewers', 'Viewers') : t('liveAudience.wasHere', 'Was here')}
        </DrawerTitle>
        <DrawerDescription className="pb-3 pt-1 text-sm text-muted-foreground">
          {t('liveAudience.presencePrivacy', 'Only viewers who share their presence appear here.')}
        </DrawerDescription>
        {open && address && <ViewerList key={`${address}:${streamId}:${live}`} address={address} streamId={streamId} live={live} />}
      </DrawerContent>
    </Drawer>
  );
}

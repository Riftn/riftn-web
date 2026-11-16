/**
 * Scheduled messages for one direct chat: the strip above the composer that
 * says something is waiting, and the drawer where each one can be edited,
 * moved, sent now or deleted.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import Clock from '@/components/ui/cut-icons/clock';
import Edit from '@/components/ui/cut-icons/edit';
import Send from '@/components/ui/cut-icons/send';
import Trash from '@/components/ui/cut-icons/delete';
import X from '@/components/ui/cut-icons/close';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { ScheduleSheet } from '@/features/post/components/ScheduleSheet';
import { cn } from '@/lib/utils';
import {
  cancelScheduledDm,
  listScheduledDms,
  updateScheduledDm,
  type ScheduledDm,
} from '@/lib/api/dehub/dm-scheduled';
import { onScheduledDmUpdate } from '@/lib/api/dehub/dm-socket';
import { decryptFromPeer, prepareOutgoing } from '@/lib/dm-e2ee/keys';
import { isEncryptedContent } from '@/lib/dm-e2ee/crypto';
import { messagesKeys } from '@/hooks/use-messages';

export const scheduledDmKey = (dmId: string) => ['dm-scheduled', dmId] as const;

/** A scheduled message with its words opened for the person who wrote it. */
export interface ScheduledDmView extends ScheduledDm {
  text: string;
  /** Sealed on another device, so this one cannot show or edit the words. */
  unreadable: boolean;
}

async function openScheduled(rows: ScheduledDm[], peerAddress?: string | null): Promise<ScheduledDmView[]> {
  return Promise.all(rows.map(async (row) => {
    if (!isEncryptedContent(row.content)) return { ...row, text: row.content, unreadable: false };
    const text = peerAddress ? await decryptFromPeer(peerAddress, row.content).catch(() => null) : null;
    return { ...row, text: text ?? '', unreadable: text === null };
  }));
}

/**
 * The caller's waiting and failed messages in this chat. Kept fresh by the
 * socket note the server sends when one is sent or refused.
 */
export function useScheduledDms(dmId: string | null | undefined, peerAddress?: string | null) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const enabled = !!dmId;
  const query = useQuery({
    queryKey: scheduledDmKey(dmId || ''),
    queryFn: async () => openScheduled(await listScheduledDms(dmId!), peerAddress),
    enabled,
    staleTime: 30_000,
    retry: false,
  });

  useEffect(() => {
    if (!dmId) return;
    return onScheduledDmUpdate((update) => {
      if (update.dmId !== dmId) return;
      queryClient.invalidateQueries({ queryKey: scheduledDmKey(dmId) });
      if (update.status === 'sent') {
        queryClient.invalidateQueries({ queryKey: messagesKeys.messages(dmId) });
        queryClient.invalidateQueries({ queryKey: messagesKeys.conversations() });
      } else {
        toast.error(t('dmSchedule.failedToast', { defaultValue: 'A scheduled message could not be sent' }), {
          description: update.failureReason,
        });
      }
    });
  }, [dmId, queryClient, t]);

  // The next one is due: look again just after, in case the socket note was missed.
  const nextAt = query.data?.find(r => r.status === 'scheduled')?.sendAt;
  useEffect(() => {
    if (!dmId || !nextAt) return;
    const wait = new Date(nextAt).getTime() - Date.now() + 15_000;
    if (wait > 2_147_000_000) return;
    const timer = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: scheduledDmKey(dmId) });
      queryClient.invalidateQueries({ queryKey: messagesKeys.messages(dmId) });
    }, Math.max(wait, 1000));
    return () => clearTimeout(timer);
  }, [dmId, nextAt, queryClient]);

  return { items: query.data ?? [], isLoading: enabled && query.isLoading, refetch: query.refetch };
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "Today, 9:00 AM" / "Tomorrow, 9:00 AM" / "Fri 20 Nov, 9:00 AM", in the viewer's own zone. */
export function useWhenLabel() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || undefined;
  return (iso: string | Date) => {
    const at = new Date(iso);
    const days = Math.round((startOfDay(at) - startOfDay(new Date())) / 86_400_000);
    const day = days === 0
      ? t('whenSheet.today', { defaultValue: 'Today' })
      : days === 1
        ? t('whenSheet.tomorrow', { defaultValue: 'Tomorrow' })
        : at.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short', ...(at.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
    return `${day}, ${at.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })}`;
  };
}

/** One line above the composer while anything is waiting. Opens the drawer. */
export function ScheduledStrip({ items, onOpen }: { items: ScheduledDmView[]; onOpen: () => void }) {
  const { t } = useTranslation();
  const whenLabel = useWhenLabel();
  if (!items.length) return null;
  const failed = items.filter(r => r.status === 'failed').length;
  const waiting = items.filter(r => r.status === 'scheduled');
  return (
    <button
      type="button"
      onClick={onOpen}
      data-scheduled-strip
      className="flex w-full items-center gap-2 border-t border-white/10 bg-white/5 px-4 py-2 text-left text-xs text-zinc-300 transition-colors hover:bg-white/10"
    >
      <Clock className="h-3.5 w-3.5 flex-shrink-0 text-current" />
      <span className="min-w-0 flex-1 truncate">
        {waiting.length > 0 && (
          <span className="font-semibold text-white">
            {t('dmSchedule.waiting', { defaultValue: '{{n}} scheduled', n: waiting.length })}
          </span>
        )}
        {failed > 0 && (
          <span className="font-semibold text-amber-400">
            {waiting.length > 0 ? ' · ' : ''}{t('dmSchedule.failedCount', { defaultValue: '{{n}} not sent', n: failed })}
          </span>
        )}
        {waiting.length > 0 && (
          <span className="text-zinc-400">{' · '}{t('dmSchedule.next', { defaultValue: 'next {{when}}', when: whenLabel(waiting[0].sendAt) })}</span>
        )}
      </span>
      <span className="flex-shrink-0 font-semibold text-white">{t('dmSchedule.view', { defaultValue: 'View' })}</span>
    </button>
  );
}

interface ScheduledMessagesDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dmId: string;
  peerAddress?: string | null;
  peerName?: string;
  items: ScheduledDmView[];
  isLoading?: boolean;
}

export function ScheduledMessagesDrawer({ open, onOpenChange, dmId, peerAddress, peerName, items, isLoading }: ScheduledMessagesDrawerProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const whenLabel = useWhenLabel();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [movingId, setMovingId] = useState<string | null>(null);
  const moving = useMemo(() => items.find(r => r._id === movingId) ?? null, [items, movingId]);

  useEffect(() => {
    if (!open) { setEditingId(null); setMovingId(null); }
  }, [open]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: scheduledDmKey(dmId) });
  const run = async (id: string, work: () => Promise<unknown>, done?: string) => {
    setBusyId(id);
    try {
      await work();
      if (done) toast.success(done);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('dmSchedule.error', { defaultValue: 'That did not work. Try again.' }));
    } finally {
      setBusyId(null);
      refresh();
    }
  };

  const saveEdit = (row: ScheduledDmView) => {
    const text = draft.trim();
    if (!text) return;
    if (text === row.text) { setEditingId(null); return; }
    void run(row._id, async () => {
      // Sealed again for this chat, the same as a message sent by hand.
      const wire = await prepareOutgoing(peerAddress, text);
      await updateScheduledDm(row._id, { content: wire.content });
      setEditingId(null);
    });
  };

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent glass hideHandle column scrollable className="max-h-[88dvh] px-4 pb-4" data-scheduled-drawer>
          <DrawerHeader className="relative mx-auto w-full max-w-[520px] px-0 pb-3">
            <div className="flex items-center justify-between">
              <button type="button" onClick={() => onOpenChange(false)} aria-label={t('common.close', { defaultValue: 'Close' })} className="-ml-2 rounded-xl p-2 transition-colors hover:bg-white/10">
                <X className="h-5 w-5 text-white/70" />
              </button>
              <DrawerTitle className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap font-semibold text-white">
                {t('dmSchedule.title', { defaultValue: 'Scheduled messages' })}
              </DrawerTitle>
              <span className="w-9" />
            </div>
          </DrawerHeader>

          <div className="mx-auto w-full max-w-[520px] space-y-2.5">
            {isLoading && (
              <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-white/60" /></div>
            )}

            {!isLoading && items.length === 0 && (
              <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
                <Clock className="h-9 w-9 text-white/45" />
                <p className="text-sm font-semibold text-white">{t('dmSchedule.emptyTitle', { defaultValue: 'Nothing scheduled' })}</p>
                <p className="text-xs leading-relaxed text-white/60">
                  {t('dmSchedule.emptyBody', { defaultValue: 'Write a message, then tap the clock to pick when it is sent.' })}
                </p>
              </div>
            )}

            {items.map(row => {
              const busy = busyId === row._id;
              const editing = editingId === row._id;
              const failed = row.status === 'failed';
              return (
                <div key={row._id} data-scheduled-row className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <div className="flex items-center gap-1.5 text-xs font-semibold">
                    <Clock className={cn('h-3.5 w-3.5', failed ? 'text-amber-400' : 'text-white/70')} />
                    <span className={failed ? 'text-amber-400' : 'text-white'}>
                      {failed ? t('dmSchedule.notSent', { defaultValue: 'Not sent' }) : whenLabel(row.sendAt)}
                    </span>
                    {busy && <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-white/60" />}
                  </div>
                  {failed && row.failureReason && (
                    <p className="mt-1 text-xs leading-relaxed text-amber-400/90">{row.failureReason}</p>
                  )}

                  {editing ? (
                    <div className="mt-2 space-y-2">
                      <textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        rows={3}
                        maxLength={5000}
                        autoFocus
                        aria-label={t('dmSchedule.editLabel', { defaultValue: 'Edit message' })}
                        className="w-full resize-none rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-base text-white outline-none placeholder:text-white/40 focus:border-white/30 md:text-sm"
                      />
                      <div className="flex gap-2">
                        <button type="button" data-kit-button="quiet" className="flex-1" onClick={() => setEditingId(null)}>
                          {t('common.cancel', { defaultValue: 'Cancel' })}
                        </button>
                        <button type="button" data-kit-button="primary" className="flex-1" disabled={!draft.trim() || busy} onClick={() => saveEdit(row)}>
                          {t('common.save', { defaultValue: 'Save' })}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className={cn('mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed', row.unreadable ? 'italic text-white/50' : 'text-white/90')}>
                        {row.unreadable
                          ? t('dmSchedule.unreadable', { defaultValue: 'Written on another device. It will still be sent.' })
                          : row.text}
                      </p>
                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                        {!row.unreadable && (
                          <button
                            type="button"
                            data-kit-chip
                            disabled={busy}
                            onClick={() => { setDraft(row.text); setEditingId(row._id); }}
                            className="!h-8 !gap-1.5 !px-2.5 !text-xs"
                          >
                            <Edit className="h-3.5 w-3.5" />{t('dmSchedule.edit', { defaultValue: 'Edit' })}
                          </button>
                        )}
                        <button type="button" data-kit-chip disabled={busy} onClick={() => setMovingId(row._id)} className="!h-8 !gap-1.5 !px-2.5 !text-xs">
                          <Clock className="h-3.5 w-3.5" />{t('dmSchedule.changeTime', { defaultValue: 'Change time' })}
                        </button>
                        <button
                          type="button"
                          data-kit-chip
                          disabled={busy}
                          onClick={() => run(row._id, () => updateScheduledDm(row._id, { sendAt: 'now' }))}
                          className="!h-8 !gap-1.5 !px-2.5 !text-xs"
                        >
                          <Send className="h-3.5 w-3.5" />{t('dmSchedule.sendNow', { defaultValue: 'Send now' })}
                        </button>
                        <button
                          type="button"
                          data-kit-chip
                          disabled={busy}
                          onClick={() => run(row._id, () => cancelScheduledDm(row._id), t('dmSchedule.deleted', { defaultValue: 'Scheduled message deleted' }))}
                          aria-label={t('common.delete', { defaultValue: 'Delete' })}
                          title={t('common.delete', { defaultValue: 'Delete' })}
                          className="!ml-auto !h-8 !w-8 !px-0"
                        >
                          <Trash className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}

            {items.length > 0 && (
              <p className="px-1 pt-1 text-center text-[11px] leading-relaxed text-white/50">
                {peerName
                  ? t('dmSchedule.footnoteNamed', { defaultValue: 'Times are in your time zone. {{name}} only sees a message once it is sent.', name: peerName })
                  : t('dmSchedule.footnote', { defaultValue: 'Times are in your time zone. Nobody sees a message until it is sent.' })}
              </p>
            )}
            <div className="h-[env(safe-area-inset-bottom,0px)]" />
          </div>
        </DrawerContent>
      </Drawer>

      <ScheduleSheet
        isOpen={!!moving}
        onClose={() => setMovingId(null)}
        scheduledDate={moving && moving.status === 'scheduled' ? new Date(moving.sendAt) : null}
        onSchedule={(date) => {
          if (!date || !moving) return;
          const id = moving._id;
          void run(id, () => updateScheduledDm(id, { sendAt: date }));
        }}
        kind="message"
        moving
        title={t('dmSchedule.whenTitle', { defaultValue: 'Send when?' })}
      />
    </>
  );
}

/**
 * Ask to join, in the live's own controls rather than on the picture.
 * Press once to ask the host; press again to take the ask back.
 * Shows only while the host takes requests and the viewer has no other seat
 * state (invited and on-screen are the invite card's job).
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Hand, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import './costream-invite.css';
import { cn } from '@/lib/utils';
import { cancelRequest, requestToJoin } from '@/lib/live/costream-api';
import { useCoStreamViewer } from './use-costream-viewer';

export function CoStreamAskButton({
  streamId,
  owner,
  variant = 'pill',
  className,
  preview = false,
}: {
  streamId?: string;
  owner?: string | null;
  /** pill: icon + words (page row). square: icon only, for the on-picture rows. */
  variant?: 'pill' | 'square';
  className?: string;
  /** Gallery: show the seeded state, never fetch. */
  preview?: boolean;
}) {
  const { t } = useTranslation();
  const { user, isAuthenticated, openLoginModal } = useAuth();
  const { state, seat, me, refresh } = useCoStreamViewer(streamId, owner, preview);
  const [busy, setBusy] = useState(false);

  if (!state || state.room.status !== 'active') return null;
  const room = state.room;
  if (me && room.host_wallet === me) return null;
  const asked = seat?.status === 'requested';
  const canAsk = room.accepting_requests && (!seat || seat.status === 'declined' || seat.status === 'left');
  if (!asked && !canAsk) return null;

  const label = asked
    ? t('costream.cancelRequest', { defaultValue: 'Cancel request' })
    : t('costream.askToJoin', { defaultValue: 'Ask to join' });

  const press = async () => {
    if (!isAuthenticated || !me) { openLoginModal?.(); return; }
    setBusy(true);
    try {
      if (asked && seat) {
        await cancelRequest(me, seat.id);
      } else {
        await requestToJoin(me, room.id, user?.username);
        toast(t('costream.askedToast', { defaultValue: 'Asked to join. Tap again to cancel.' }));
      }
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('costream.couldNotJoin', { defaultValue: 'Could not join the live' }));
    } finally {
      setBusy(false);
    }
  };

  const icon = busy
    ? <Loader2 className="h-4 w-4 animate-spin" />
    : asked
      ? <X className="h-4 w-4" />
      : <Hand className="h-4 w-4" />;

  if (variant === 'square') {
    return (
      <button
        type="button"
        data-costream-ask={asked ? 'asked' : 'idle'}
        data-on-media
        aria-label={label}
        title={label}
        disabled={busy}
        onClick={(e) => { e.stopPropagation(); void press(); }}
        className={cn('costream-ask-sq', className)}
      >
        {icon}
      </button>
    );
  }

  return (
    <button
      type="button"
      data-kit-button="quiet"
      data-costream-ask={asked ? 'asked' : 'idle'}
      disabled={busy}
      onClick={(e) => { e.stopPropagation(); void press(); }}
      className={cn('inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] px-3 text-[13px] font-semibold', className)}
    >
      {asked && !busy ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" aria-hidden /> : icon}
      {label}
    </button>
  );
}

export default CoStreamAskButton;

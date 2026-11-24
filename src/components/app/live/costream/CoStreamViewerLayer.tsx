/**
 * What a viewer sees of a co-stream on the live player: the host's invite
 * card, the "you're in" moment that opens the guest room, and the battle bar.
 * Ask to join lives in the live's own controls (CoStreamAskButton), not on
 * the picture.
 *
 * The picture itself needs nothing here — the guests are already in the
 * broadcast. The room is polled once for every part that shows it
 * (useCoStreamViewer).
 */
import { lazy, Suspense, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { CoStreamBattleBar } from './CoStreamBattleBar';
import { acceptInvite, battlePhase, declineInvite } from '@/lib/live/costream-api';
import { participantLabel } from '@/hooks/use-costream-host';
import { buildAvatarUrl } from '@/lib/media-url';
import { CoStreamInviteCard } from './CoStreamInviteCard';
import { useCoStreamViewer } from './use-costream-viewer';

const CoStreamGuestRoom = lazy(() => import('./CoStreamGuestRoom'));

const PILL =
  'pointer-events-auto inline-flex h-8 items-center gap-1.5 rounded-xl border border-white/20 bg-black/40 px-3 text-[11px] font-medium text-white backdrop-blur-xl hover:bg-black/55 disabled:opacity-60';

export function CoStreamViewerLayer({
  streamId,
  owner,
  hostAvatar,
  onRoomChange,
}: {
  streamId: string;
  /** The stream owner's wallet; rows naming anyone else are ignored. */
  owner?: string | null;
  /** The host's face, for the invite card. */
  hostAvatar?: string | null;
  /** The guest room opened or closed — the player should go quiet under it. */
  onRoomChange?: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [roomOpen, setRoomOpen] = useState(false);
  const { state, seat, me, refresh: load } = useCoStreamViewer(streamId, owner, roomOpen);

  useEffect(() => { onRoomChange?.(roomOpen); }, [roomOpen, onRoomChange]);

  const act = async (task: () => Promise<void>) => {
    setBusy(true);
    try {
      await task();
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('costream.couldNotJoin', { defaultValue: 'Could not join the live' }));
    } finally {
      setBusy(false);
    }
  };

  if (!state || state.room.status !== 'active') return null;
  const room = state.room;
  // The host and their live partners run this from their own broadcaster.
  if (me && (room.host_wallet === me || (seat?.status === 'accepted' && seat.stream_id))) return null;
  const battling = battlePhase(room) !== 'idle';

  const host = participantLabel(room.host_username, room.host_wallet);

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-[max(3.25rem,calc(env(safe-area-inset-top)+3.25rem))] z-30 flex flex-col items-center gap-2">
        {battling && <CoStreamBattleBar state={state} streamId={streamId} />}
        {seat?.status === 'invited' && (
          <CoStreamInviteCard
            hostName={host}
            hostAvatar={hostAvatar}
            myName={user?.username ?? null}
            myAvatar={user?.avatarImageUrl && user?.address ? buildAvatarUrl(user.address, user.avatarImageUrl) : null}
            busy={busy}
            onJoin={() => void act(async () => {
              await acceptInvite(me!, seat.id, null, user?.username);
              setRoomOpen(true);
            })}
            onDecline={() => void act(() => declineInvite(me!, seat.id))}
          />
        )}

        {seat?.status === 'accepted' && !roomOpen && (
          <button type="button" className={PILL} onClick={() => setRoomOpen(true)}>
            {t('costream.goOnScreen', { defaultValue: "You're in — go on screen" })}
          </button>
        )}

      </div>

      {roomOpen && me && (
        <Suspense fallback={null}>
          <CoStreamGuestRoom
            roomId={room.id}
            wallet={me}
            onClose={() => { setRoomOpen(false); void load(); }}
          />
        </Suspense>
      )}
    </>
  );
}

export default CoStreamViewerLayer;

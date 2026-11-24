import { useContext, useState, type ContextType } from 'react';
import { useTranslation } from 'react-i18next';
import { Phone } from 'lucide-react';
import Video from '@/components/ui/cut-icons/video';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { AuthContext } from '@/contexts/AuthContext';
import { CallContext } from '@/contexts/CallContext';
import { useGroupCallRoster, GROUP_CALL_MAX_RING } from '@/lib/group-call';

/**
 * Voice and video call buttons for a group chat, and the "Join call" pill
 * while one is going. Starting rings every member; joining just steps into
 * the room.
 */
/** `joinOnly`: just the "Join call" pill while a call is on, nothing otherwise (Public Chat on phones starts calls from its + menu). */
export function GroupCallButtons({ groupId, groupName, canStart = true, ring = true, joinOnly = false }: { groupId: string; groupName: string; canStart?: boolean; ring?: boolean; joinOnly?: boolean }) {
  // Context reads, not the throwing hooks: the chat also renders in previews with no call or auth provider.
  const call = useContext(CallContext);
  const walletAddress = useContext(AuthContext)?.walletAddress ?? null;
  return call && walletAddress ? <GroupCallControls groupId={groupId} groupName={groupName} walletAddress={walletAddress} call={call} canStart={canStart && !joinOnly} ring={ring} /> : null;
}

function GroupCallControls({ groupId, groupName, walletAddress, call, canStart, ring }: {
  groupId: string; groupName: string; walletAddress: string; call: NonNullable<ContextType<typeof CallContext>>; canStart: boolean;
  /** false for an open room (Public Chat): starting opens the room without ringing anyone, others join from the pill. */
  ring: boolean;
}) {
  const { t } = useTranslation();
  const { startGroupCall, joinGroupCall, currentCall } = call;
  const roster = useGroupCallRoster(groupId);
  const [starting, setStarting] = useState(false);
  const me = walletAddress.toLowerCase();
  const inThisCall = currentCall?.group_id === groupId;
  const others = roster.filter(entry => entry.wallet !== me);
  const busy = !!currentCall || starting;

  const start = async (callType: 'audio' | 'video') => {
    if (busy) return;
    setStarting(true);
    try {
      if (!ring) {
        await joinGroupCall({ id: groupId, name: groupName }, callType);
        return;
      }
      const { data, error } = await withWalletHeader(
        supabase.from('community_members').select('wallet_address').eq('community_id', groupId).eq('status', 'active')
          .order('joined_at', { ascending: true }).limit(GROUP_CALL_MAX_RING + 1),
        walletAddress,
      );
      if (error) throw error;
      const members = (data ?? []).map((row: { wallet_address: string }) => row.wallet_address);
      await startGroupCall({ id: groupId, name: groupName }, members, callType);
    } catch (error) {
      console.warn('Group call start failed', error);
      toast.error(t('copy.8786057edfc1', { defaultValue: 'Could not connect to call' }));
    } finally {
      setStarting(false);
    }
  };

  if (others.length && !inThisCall) {
    const callType = others.some(entry => entry.type === 'video') ? 'video' : 'audio';
    return (
      <button
        type="button"
        data-group-call-join
        disabled={busy}
        onClick={() => { void joinGroupCall({ id: groupId, name: groupName }, callType); }}
        aria-label={`${t('calls.joinCall', 'Join call')} · ${t('calls.inCall', { count: others.length, defaultValue: '{{count}} in the call' })}`}
        className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-white/[0.1] px-3 py-1 text-[12px] font-semibold text-white transition-colors hover:bg-white/[0.16] disabled:opacity-50"
      >
        {callType === 'video' ? <Video className="h-3.5 w-3.5" /> : <Phone className="h-3.5 w-3.5" />}
        {/* Phones: just the icon and how many are in, so the pill never
            pushes the chat name off the bar or wraps onto two lines. */}
        <span className="max-lg:hidden">{t('calls.joinCall', 'Join call')}</span>
        <span className="font-normal text-white/60 max-lg:hidden">{t('calls.inCall', { count: others.length, defaultValue: '{{count}} in the call' })}</span>
        <span className="tabular-nums lg:hidden" aria-hidden="true">{others.length}</span>
      </button>
    );
  }

  // Who may ring the group is a group setting (Permissions > Start group calls);
  // the database refuses the ring otherwise, so the buttons stand down too.
  if (!canStart) return null;

  const button = 'flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-40';
  return (
    <div className="flex items-center gap-0.5" data-group-call-buttons>
      <button
        type="button"
        className={button}
        disabled={busy}
        onClick={() => { void start('audio'); }}
        aria-label={t('calls.startGroupVoice', 'Start a group voice call')}
        title={t('calls.startGroupVoice', 'Start a group voice call')}
      >
        <Phone className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={button}
        disabled={busy}
        onClick={() => { void start('video'); }}
        aria-label={t('calls.startGroupVideo', 'Start a group video call')}
        title={t('calls.startGroupVideo', 'Start a group video call')}
      >
        <Video className="h-4 w-4" />
      </button>
    </div>
  );
}

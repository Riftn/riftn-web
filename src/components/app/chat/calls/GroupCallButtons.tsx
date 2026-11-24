import { useContext, useState, type ContextType } from 'react';
import { useTranslation } from 'react-i18next';
import { Phone, Users } from 'lucide-react';
import Video from '@/components/ui/cut-icons/video';
import { AuthContext } from '@/contexts/AuthContext';
import { CallContext } from '@/contexts/CallContext';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { useGroupCallRoster, groupCallLoad, GROUP_CALL_MAX_RING, PUBLIC_CHAT_CALL_ID } from '@/lib/group-call';
import { formatCount } from '@/lib/format-count';

/**
 * Voice and video call buttons for a group chat, and the "Join call" pill
 * while one is going. Starting rings the group's members (Riftn's main chat
 * rings nobody: people join from the pill); joining just steps into the
 * room. A room at its limit shows "Call full".
 */
/** `joinOnly`: just the "Join call" pill while a call is on, nothing otherwise (Public Chat on phones starts calls from its + menu). */
export function GroupCallButtons({ groupId, groupName, canStart = true, joinOnly = false }: { groupId: string; groupName: string; canStart?: boolean; joinOnly?: boolean }) {
  // Context reads, not the throwing hooks: the chat also renders in previews with no call or auth provider.
  const call = useContext(CallContext);
  const walletAddress = useContext(AuthContext)?.walletAddress ?? null;
  return call && walletAddress ? <GroupCallControls groupId={groupId} groupName={groupName} walletAddress={walletAddress} call={call} canStart={canStart && !joinOnly} /> : null;
}

function GroupCallControls({ groupId, groupName, walletAddress, call, canStart }: {
  groupId: string; groupName: string; walletAddress: string; call: NonNullable<ContextType<typeof CallContext>>; canStart: boolean;
}) {
  const { t } = useTranslation();
  const { startGroupCall, joinGroupCall, currentCall } = call;
  const roster = useGroupCallRoster(groupId);
  const [starting, setStarting] = useState(false);
  const me = walletAddress.toLowerCase();
  const inThisCall = currentCall?.group_id === groupId;
  const others = roster.filter(entry => entry.wallet !== me);
  const { full } = groupCallLoad(roster, me);
  const busy = !!currentCall || starting;

  const group = { id: groupId, name: groupName };
  const join = async (callType: 'audio' | 'video') => {
    if (busy) return;
    setStarting(true);
    try { await joinGroupCall(group, callType); } finally { setStarting(false); }
  };
  const start = async (callType: 'audio' | 'video') => {
    if (groupId === PUBLIC_CHAT_CALL_ID) return join(callType);
    if (busy) return;
    setStarting(true);
    try {
      const { data, error } = await withWalletHeader(
        supabase.from('community_members').select('wallet_address').eq('community_id', groupId).eq('status', 'active')
          .order('joined_at', { ascending: true }).limit(GROUP_CALL_MAX_RING + 1),
        walletAddress,
      );
      if (error) throw error;
      await startGroupCall(group, (data ?? []).map((row: { wallet_address: string }) => row.wallet_address), callType);
    } catch (error) {
      console.warn('Group call start failed', error);
      toast.error(t('copy.8786057edfc1', { defaultValue: 'Could not connect to call' }));
    } finally {
      setStarting(false);
    }
  };

  if (others.length && !inThisCall) {
    const callType = others.some(entry => entry.type === 'video') ? 'video' : 'audio';
    const inCallText = t('calls.inCall', { count: others.length, defaultValue: '{{count}} in the call' });
    const label = full ? t('calls.callFull', 'Call full') : t('calls.joinCall', 'Join call');
    return (
      <button
        type="button"
        data-group-call-join
        data-full={full ? 'true' : undefined}
        disabled={busy || full}
        onClick={() => { void join(callType); }}
        aria-label={`${label} · ${inCallText}`}
        title={full ? t('calls.callFullHint', "It already has the most people a call can take. You can join once someone leaves.") : undefined}
        className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-white/[0.1] px-3 py-1 text-[12px] font-semibold text-white transition-colors hover:bg-white/[0.16] disabled:opacity-50 data-[full=true]:bg-white/[0.06] data-[full=true]:text-white/70 data-[full=true]:opacity-100"
      >
        {full ? <Users className="h-3.5 w-3.5" /> : callType === 'video' ? <Video className="h-3.5 w-3.5" /> : <Phone className="h-3.5 w-3.5" />}
        {/* Phones: just the icon and how many are in (or "Full"), so the pill
            never pushes the chat name off the bar or wraps onto two lines. */}
        <span className="max-lg:hidden">{label}</span>
        <span className="font-normal text-white/60 max-lg:hidden">{inCallText}</span>
        <span className="tabular-nums lg:hidden" aria-hidden="true">{full ? t('calls.full', 'Full') : formatCount(others.length)}</span>
      </button>
    );
  }

  // Who may start a call is a group setting (Permissions > Start group calls).
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

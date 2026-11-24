import { useContext, useState, type ContextType } from 'react';
import { useTranslation } from 'react-i18next';
import { Phone, Users } from 'lucide-react';
import Video from '@/components/ui/cut-icons/video';
import { AuthContext } from '@/contexts/AuthContext';
import { CallContext } from '@/contexts/CallContext';
import { useGroupCallRoster, groupCallLoad } from '@/lib/group-call';
import { formatCount } from '@/lib/format-count';

/**
 * Voice and video call buttons for a group chat, and the "Join call" pill
 * while one is going. Starting opens the room without ringing or notifying
 * anyone; members join from the pill. A room at its limit shows "Call full".
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
  const { joinGroupCall, currentCall } = call;
  const roster = useGroupCallRoster(groupId);
  const [starting, setStarting] = useState(false);
  const me = walletAddress.toLowerCase();
  const inThisCall = currentCall?.group_id === groupId;
  const others = roster.filter(entry => entry.wallet !== me);
  const { full } = groupCallLoad(roster, me);
  const busy = !!currentCall || starting;

  const open = async (callType: 'audio' | 'video') => {
    if (busy) return;
    setStarting(true);
    try { await joinGroupCall({ id: groupId, name: groupName }, callType); } finally { setStarting(false); }
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
        onClick={() => { void open(callType); }}
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
        onClick={() => { void open('audio'); }}
        aria-label={t('calls.startGroupVoice', 'Start a group voice call')}
        title={t('calls.startGroupVoice', 'Start a group voice call')}
      >
        <Phone className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={button}
        disabled={busy}
        onClick={() => { void open('video'); }}
        aria-label={t('calls.startGroupVideo', 'Start a group video call')}
        title={t('calls.startGroupVideo', 'Start a group video call')}
      >
        <Video className="h-4 w-4" />
      </button>
    </div>
  );
}

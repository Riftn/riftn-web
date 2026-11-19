/**
 * Every step of a call, drawn with the real call components and made-up call
 * state, so the stage can be checked in each theme without placing a call.
 * Opened from the state gallery: /app/state-gallery?theme=hazy&calls=ringing
 *
 * calls = chat | ringing | incoming | connecting | active | muted | mini |
 *         ended | declined | no-answer | missed | notes
 * Add "-video" for the video version (ringing-video, active-video, mini-video).
 * Prefix "group-" for a group call (group-incoming, group-ringing, group-active,
 * group-active-video, group-mini, group-ended); `people=` sets how many others are in it.
 */
import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, Phone, Search, MoreVertical } from 'lucide-react';
import VideoIcon from '@/components/ui/cut-icons/video';
import { useAppTheme } from '@/contexts/ThemeContext';
import { CallContext } from '@/contexts/CallContext';
import { AuthContext } from '@/contexts/AuthContext';
import type { CallOutcome, UseCallReturn } from '@/hooks/use-call';
import VoiceCallModal from '@/components/app/chat/calls/VoiceCallModal';
import VideoCallModal from '@/components/app/chat/calls/VideoCallModal';
import GroupCallModal from '@/components/app/chat/calls/GroupCallModal';
import CallEndedScreen from '@/components/app/chat/calls/CallEndedScreen';
import { CallMiniPlayer } from '@/components/app/chat/calls/CallMiniPlayer';
import { CallNoteCard } from '@/components/app/chat/calls/CallNoteCard';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

const PEER = '0x2222222222222222222222222222222222222222';
const ME = '0x1111111111111111111111111111111111111111';
const OUTCOMES: Record<string, CallOutcome> = { ended: 'ended', declined: 'declined', 'no-answer': 'no_answer', missed: 'missed' };
const paint = (background: string) => (node: HTMLDivElement | null) => { if (node) node.style.background = background; };

function Bubble({ own, children }: { own?: boolean; children: React.ReactNode }) {
  return <div className={`flex py-1 ${own ? 'justify-end' : ''}`}><div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${own ? 'bg-zinc-100 text-zinc-900' : 'bg-zinc-800 text-zinc-100'}`}>{children}</div></div>;
}

function SampleChat({ notes }: { notes: boolean }) {
  return (
    <div data-page-bento data-bento-flat className="relative mx-auto flex h-screen w-full max-w-3xl flex-col overflow-hidden">
      <div data-chat-header className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="icon" className="text-white hover:bg-zinc-800"><ArrowLeft className="h-5 w-5" /></Button>
          <Avatar className="h-10 w-10"><AvatarFallback className="bg-zinc-700 font-medium text-white">E</AvatarFallback></Avatar>
          <div className="min-w-0">
            <h2 className="truncate font-semibold text-white">Erica</h2>
            <p className="text-xs text-zinc-500">@erica</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="icon" className="text-zinc-400"><Search className="h-5 w-5" /></Button>
          <Button variant="ghost" size="icon" className="text-zinc-400"><Phone className="h-5 w-5" /></Button>
          <Button variant="ghost" size="icon" className="text-zinc-400"><VideoIcon className="h-5 w-5" /></Button>
          <Button variant="ghost" size="icon" className="text-zinc-400"><MoreVertical className="h-5 w-5" /></Button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden px-4 py-3">
        <Bubble>you free for a quick call?</Bubble>
        <Bubble own>yep, ringing you now</Bubble>
        {notes && [
          ['📞 Voice call', '12 minutes ago', true],
          ['📞 Voice call ended · 04:32', '8 minutes ago', true],
          ['📵 Missed video call', '5 minutes ago', false],
          ['📵 Voice call declined', '4 minutes ago', true],
          ['📵 Missed voice call', '2 minutes ago', true],
        ].map(([content, time, own]) => (
          <div key={content as string} className="flex justify-center py-2">
            <CallNoteCard content={content as string} time={time as string} isOwn={own as boolean} peerAddress={PEER} />
          </div>
        ))}
      </div>
      <div className="border-t border-white/[0.07] px-4 py-3"><div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-500">Message</div></div>
    </div>
  );
}

export default function CallStageGallery() {
  const [params] = useSearchParams();
  const { themeChoice, setTheme } = useAppTheme();
  const want = params.get('theme') || 'system';
  useEffect(() => { if (want !== themeChoice) setTheme(want); }, [want, themeChoice, setTheme]);

  const raw = params.get('calls') || 'chat';
  const group = raw.startsWith('group-');
  const step = group ? raw.slice(6) : raw;
  const video = step.endsWith('-video');
  const base = video ? step.slice(0, -6) : step;
  const people = Math.max(1, Math.min(8, Number(params.get('people')) || 3));
  const outcome = OUTCOMES[base];
  const live = base === 'active' || base === 'muted' || base === 'mini';
  const inCall = live || base === 'ringing' || base === 'incoming' || base === 'connecting';

  const call = useMemo(() => {
    const noop = () => {};
    const value: Partial<UseCallReturn> = {
      isCallActive: live, isIncoming: base === 'incoming', isConnecting: base === 'ringing' || base === 'connecting', isRinging: base === 'ringing',
      currentCall: inCall ? {
        id: 'sample', caller_address: base === 'incoming' ? PEER : ME, recipient_address: base === 'incoming' ? ME : PEER,
        status: live || base === 'connecting' ? 'connected' : 'ringing', call_type: video ? 'video' : 'audio', created_at: new Date().toISOString(),
        ...(group ? { group_id: '00000000-0000-0000-0000-000000000001', group_name: 'Weekend crew' } : {}),
      } : null,
      callSummary: outcome ? { peerAddress: PEER, callType: video ? 'video' : 'audio', outcome, duration: outcome === 'ended' ? '04:32' : null, groupName: group ? 'Weekend crew' : null } : null,
      isGroupCall: group,
      selfSpeaking: false,
      // Others in the room: every other one on camera in a video call, the second one talking, the third muted.
      groupParticipants: group && live ? Array.from({ length: people }, (_, index) => ({
        uid: index + 2, wallet: `0x${String(index + 3).repeat(40).slice(0, 40)}`,
        audio: index !== 2, video: video && index % 2 === 0, speaking: index === 1,
      })) : [],
      attachGroupVideo: (uid: number) => paint(['linear-gradient(160deg, #3b2f63, #1f4a5c)', 'linear-gradient(200deg, #5c3b2f, #1f2a5c)', 'linear-gradient(120deg, #2f5c45, #3b1f5c)'][uid % 3]),
      startGroupCall: async () => {}, joinGroupCall: async () => {},
      peerAddress: PEER, isMuted: base === 'muted', isCameraOff: false, isMinimized: base === 'mini',
      callStartedAt: live ? Date.now() - 272_000 : null, mediaRevision: 0,
      remoteAudioRef: { current: null }, localVideoTrack: { current: null },
      attachLocalVideo: paint(params.get('self') ? `center / cover url("${params.get('self')}")` : '#3f3f46'),
      attachRemoteVideo: paint(params.get('remote') ? `center 20% / cover url("${params.get('remote')}")` : 'linear-gradient(160deg, #3b2f63, #1f4a5c)'),
      startCall: async () => {}, endCall: noop, acceptCall: noop, rejectCall: noop, toggleMute: noop, toggleCamera: noop, switchCamera: noop,
      minimizeCall: noop, maximizeCall: noop, dismissCallSummary: noop, clearCallFailure: noop, debugCallState: noop,
      checkForCalls: async () => {}, setCallMessageHandler: noop,
    };
    return value as UseCallReturn;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  return (
    <AuthContext.Provider value={{ walletAddress: ME, isAuthenticated: true } as never}>
      <CallContext.Provider value={call}>
        <div id="call-gallery-ready">
          <div id="app-root" className="min-h-screen overflow-x-clip bg-black text-white"><SampleChat notes={base === 'notes' || base === 'mini'} /></div>
          {outcome ? <CallEndedScreen /> : base === 'mini' ? <CallMiniPlayer /> : inCall ? (group ? <GroupCallModal /> : video ? <VideoCallModal /> : <VoiceCallModal />) : null}
        </div>
      </CallContext.Provider>
    </AuthContext.Provider>
  );
}

import { ensureWalletSession } from '@/lib/wallet-session';
import { walletScopedClient } from '@/lib/supabase-wallet-client';
import { useTranslation as _useCopy } from 'react-i18next';
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { apiCall, getAuthToken } from '@/lib/api/dehub/core';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { simpleCallCheck, debugAllCalls } from '@/utils/simple-call-check';
import { formatCallDuration } from '@/lib/call-duration';
import { visualActivity } from '@/lib/visual-activity';
import { leaseChannel, type ChannelLease } from '@/lib/realtime-channel-lease';
import { groupCallChannel, groupCallPresenceTopic, groupCallUid, presenceList, GROUP_CALL_MAX_RING, type GroupCallPresence } from '@/lib/group-call';

export interface CallSession {
  id: string; caller_address: string; recipient_address: string;
  status: 'ringing' | 'connected' | 'ended'; call_type: 'audio' | 'video';
  signaling_data?: any; created_at: string;
  /** Set on a group call: the group whose room this is. */
  group_id?: string | null; group_name?: string | null;
}
/** Someone else in a group call's room. */
export interface GroupParticipant {
  uid: number;
  /** From the room's presence; null for the moment between joining and announcing. */
  wallet: string | null;
  audio: boolean; video: boolean; speaking: boolean;
}
export interface GroupCallTarget { id: string; name: string }
/** How a call finished, kept briefly so the stage can say so and offer a way back. */
export type CallOutcome = 'ended' | 'declined' | 'no_answer' | 'missed';
export interface CallSummary {
  peerAddress: string; callType: 'audio' | 'video'; outcome: CallOutcome;
  /** Formatted length of a call that connected; null for one that never did. */
  duration: string | null;
  /** Set when it was a group call: the group's name stands in for the peer. */
  groupName?: string | null;
}
export interface UseCallReturn {
  isGroupCall: boolean;
  groupParticipants: GroupParticipant[];
  /** Is your own microphone picking up speech right now (group tiles). */
  selfSpeaking: boolean;
  attachGroupVideo: (uid: number) => (node: HTMLDivElement | null) => void;
  /** Ring every member of a group and open its room. */
  startGroupCall: (group: GroupCallTarget, members: string[], callType?: 'audio' | 'video') => Promise<void>;
  /** Step into a group call that is already going. */
  joinGroupCall: (group: GroupCallTarget, callType?: 'audio' | 'video') => Promise<void>;
  /** The caller's side while the other phone is still ringing. */
  isRinging: boolean;
  callSummary: CallSummary | null; dismissCallSummary: () => void;
  isCallActive: boolean; isIncoming: boolean; currentCall: CallSession | null;
  isConnecting: boolean; isMuted: boolean; isCameraOff: boolean; isUserOffline: boolean;
  callFailureReason: 'user_offline' | 'technical_error' | null;
  clearCallFailure: () => void; isMinimized: boolean;
  minimizeCall: () => void; maximizeCall: () => void; callStartedAt: number | null;
  mediaRevision: number; peerAddress: string;
  localVideoRef: React.RefObject<HTMLDivElement>; remoteVideoRef: React.RefObject<HTMLDivElement>;
  attachLocalVideo: (node: HTMLDivElement | null) => void;
  attachRemoteVideo: (node: HTMLDivElement | null) => void;
  remoteAudioRef: React.RefObject<HTMLAudioElement>;
  startCall: (recipientAddress: string, callType?: 'audio' | 'video') => Promise<void>;
  endCall: () => void; acceptCall: () => void; rejectCall: () => void;
  toggleMute: () => void; toggleCamera: () => void; switchCamera: () => void;
  localVideoTrack: React.MutableRefObject<any>; debugCallState: () => void;
  checkForCalls: () => Promise<void>;
  setCallMessageHandler: (handler: ((content: string) => void) | null) => void;
  /** The call's room once it is live (`dm-call-<id>` or `group-call-<group>`), for subtitles. */
  captionRoom: string | null;
  /** Wallets whose subtitles this call shows: the two people, or everyone in the group room. */
  captionSpeakers: string[];
  /** The raw microphone, read by live subtitles. */
  getMicStream: () => MediaStream | null;
  /** Everyone else's volume (100 = normal), lowered under a dubbed line. */
  setCallVolume: (volume: number) => void;
}
type GroupRemote = { audio: any; video: any };
type CallMedia = {
  client: any; audio: any; video: any; remoteVideo: any; remoteAudio: any; closed: boolean;
  remotes: Map<number, GroupRemote>; presence: ChannelLease | null;
};
/** The starter's own side of a group call has no row of its own. */
const isSessionId = (id: string) => id !== 'pending' && !id.startsWith('group:');
const callChecksVisible = () => document.visibilityState !== 'hidden';

export const useCall = (): UseCallReturn => {
  const { t: _copy } = _useCopy();
  const [isCallActive, setIsCallActive] = useState(false);
  const [isIncoming, setIsIncoming] = useState(false);
  const [currentCall, setCurrentCall] = useState<CallSession | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isUserOffline, setIsUserOffline] = useState(false);
  const [callFailureReason, setCallFailureReason] = useState<'user_offline' | 'technical_error' | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [mediaRevision, setMediaRevision] = useState(0);
  const [callSummary, setCallSummary] = useState<CallSummary | null>(null);
  const [groupParticipants, setGroupParticipants] = useState<GroupParticipant[]>([]);
  const [selfSpeaking, setSelfSpeaking] = useState(false);
  const rosterRef = useRef<Map<number, string>>(new Map());
  const speakingRef = useRef<Set<number>>(new Set());
  /** Ring rows a group call's starter wrote, so an unanswered start can stop the phones. */
  const groupRingIdsRef = useRef<string[]>([]);
  const summaryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissCallSummary = useCallback(() => {
    if (summaryTimerRef.current) clearTimeout(summaryTimerRef.current);
    summaryTimerRef.current = null;
    setCallSummary(null);
  }, []);
  const currentCallRef = useRef<CallSession | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const ringCheckRef = useRef<{ wallet: string; generation: number; recover: boolean } | null>(null);
  const joiningRef = useRef(false);
  const mediaRef = useRef<CallMedia | null>(null);
  const localVideoTrack = useRef<any>(null);
  const callMessageHandlerRef = useRef<((content: string) => void) | null>(null);
  const callTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const localVideoRef = useRef<HTMLDivElement>(null);
  const remoteVideoRef = useRef<HTMLDivElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const { walletAddress: userAddress } = useAuth();
  const callClient = useMemo(() => userAddress ? walletScopedClient(userAddress) : supabase, [userAddress]);

  const publishCall = useCallback((call: CallSession | null) => {
    currentCallRef.current = call;
    setCurrentCall(call);
  }, []);
  const setCallMessageHandler = useCallback((handler: ((content: string) => void) | null) => {
    callMessageHandlerRef.current = handler;
  }, []);
  const markEnded = useCallback(async (call: CallSession | null, answered = true) => {
    if (!call) return;
    const ringIds = groupRingIdsRef.current;
    groupRingIdsRef.current = [];
    try {
      // A group call nobody picked up stops every phone it set ringing. Once
      // somebody is in the room, leaving it is just leaving; the rest carry on.
      if (call.group_id && ringIds.length && !answered) {
        await callClient.from('call_sessions').update({ status: 'ended' }).in('id', ringIds).eq('status', 'ringing');
      }
      if (!isSessionId(call.id)) return;
      await callClient.from('call_sessions').update({ status: 'ended' }).eq('id', call.id);
    }
    catch (error) { console.warn('Call status update failed', error); }
  }, [callClient]);
  const clearTimers = useCallback(() => {
    if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    callTimeoutRef.current = null;
    pollingIntervalRef.current = null;
  }, []);
  const disposeMedia = useCallback(async (media: CallMedia | null) => {
    if (!media) return;
    if (!media.closed) {
      media.closed = true;
      // Release independently so a failed camera close cannot keep the mic alive.
      for (const track of [media.audio, media.video]) {
        try { track?.stop(); } catch {}
        try { track?.close(); } catch {}
      }
      for (const track of [media.remoteAudio, media.remoteVideo]) { try { track?.stop(); } catch {} }
      for (const remote of media.remotes.values()) {
        for (const track of [remote.audio, remote.video]) { try { track?.stop(); } catch {} }
      }
      media.remotes.clear();
      try { media.presence?.release(); } catch {}
      media.presence = null;
      try { media.client?.removeAllListeners(); } catch {}
    }
    // Retry leaving if a pending join completed after the first teardown.
    try { await media.client?.leave(); } catch {}
  }, []);
  const finishCall = useCallback(async (reason?: Exclude<CallOutcome, 'ended'>) => {
    const call = currentCallRef.current;
    const startedAt = startedAtRef.current;
    generationRef.current += 1;
    joiningRef.current = false;
    publishCall(null);
    startedAtRef.current = null;
    clearTimers();
    const media = mediaRef.current;
    mediaRef.current = null;
    localVideoTrack.current = null;
    setCallStartedAt(null);
    setIsCallActive(false); setIsIncoming(false); setIsConnecting(false);
    setIsMuted(false); setIsCameraOff(false); setIsMinimized(false);
    setGroupParticipants([]); setSelfSpeaking(false);
    rosterRef.current = new Map(); speakingRef.current = new Set();
    visualActivity.setCall(false, false);
    // The chat note handler belongs to whichever direct chat is open, so a
    // group call never writes into it.
    if (call && startedAt != null && !call.group_id) {
      callMessageHandlerRef.current?.(`📞 ${call.call_type === 'video' ? 'Video' : 'Voice'} call ended · ${formatCallDuration(startedAt)}`);
    }
    const outcome: CallOutcome | null = startedAt != null ? 'ended' : reason ?? null;
    if (call && outcome) {
      const mine = call.caller_address.toLowerCase() === userAddress?.toLowerCase();
      if (summaryTimerRef.current) clearTimeout(summaryTimerRef.current);
      setCallSummary({
        peerAddress: call.group_id ? call.caller_address : mine ? call.recipient_address : call.caller_address,
        callType: call.call_type, outcome,
        duration: startedAt != null ? formatCallDuration(startedAt) : null,
        groupName: call.group_id ? call.group_name || '' : null,
      });
      summaryTimerRef.current = setTimeout(() => { summaryTimerRef.current = null; setCallSummary(null); }, 6000);
    }
    await Promise.all([disposeMedia(media), markEnded(call, startedAt != null)]);
  }, [publishCall, clearTimers, disposeMedia, markEnded, userAddress]);
  const endCall = useCallback(() => finishCall(), [finishCall]);
  /** The far side closed the call. Before anyone answered, that is a decline (ours) or a missed call (theirs). */
  const remoteClosed = useCallback(() => {
    const call = currentCallRef.current;
    if (!call) return;
    if (call.group_id) {
      // One member hanging up is not the end of a group call. The only ping
      // that matters is the starter cancelling while this phone still rings.
      if (startedAtRef.current == null && !joiningRef.current && call.status === 'ringing'
        && call.recipient_address.toLowerCase() === userAddress?.toLowerCase()) void finishCall('missed');
      return;
    }
    if (startedAtRef.current != null || call.status !== 'ringing' || joiningRef.current) { void finishCall(); return; }
    if (call.caller_address.toLowerCase() === userAddress?.toLowerCase()) {
      callMessageHandlerRef.current?.(call.call_type === 'video' ? '📵 Video call declined' : '📵 Voice call declined');
      void finishCall('declined');
    } else void finishCall('missed');
  }, [finishCall, userAddress]);

  /** Push the room's remotes, names and talkers into render state. */
  const syncGroup = useCallback((media: CallMedia) => {
    if (media.closed) return;
    const roster = rosterRef.current;
    const speaking = speakingRef.current;
    setGroupParticipants([...media.remotes.entries()].map(([uid, remote]) => ({
      uid, wallet: roster.get(uid) ?? null, audio: !!remote.audio, video: !!remote.video, speaking: speaking.has(uid),
    })));
  }, []);

  const joinAgoraChannel = useCallback(async (call: CallSession, generation: number): Promise<boolean> => {
    const current = () => generationRef.current === generation && currentCallRef.current?.id === call.id;
    if (!current()) return false;
    const groupId = call.group_id || null;
    const channelName = groupId ? groupCallChannel(groupId) : `dm-call-${call.id}`;
    const ownUid = groupId && userAddress ? groupCallUid(userAddress.toLowerCase()) : 0;
    let media: CallMedia | null = null;
    try {
      const authToken = getAuthToken();
      const headers = authToken && userAddress
        ? { 'x-dehub-token': authToken, 'x-wallet-address': userAddress.toLowerCase() } : undefined;
      const { data, error } = await supabase.functions.invoke('agora-token', {
        body: { channelName, role: 'publisher', ...(groupId ? { uid: ownUid } : {}) }, ...(headers ? { headers } : {}),
      });
      if (!current()) return false;
      if (error || data?.error || !data?.appId || !data?.token) throw new Error('Could not get call credentials');
      const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
      if (!current()) return false;
      AgoraRTC.setLogLevel(3);
      const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      media = { client, audio: null, video: null, remoteVideo: null, remoteAudio: null, closed: false, remotes: new Map(), presence: null };
      const ownedMedia = media;
      mediaRef.current = media;
      /** Somebody is on the other end: the call is live and its clock starts. */
      const markLive = () => {
        publishCall({ ...currentCallRef.current!, status: 'connected' });
        setIsCallActive(true); setIsConnecting(false);
        if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
        callTimeoutRef.current = null;
        // Publishing audio, video or a replacement camera shares one clock.
        if (startedAtRef.current == null) {
          startedAtRef.current = Date.now();
          setCallStartedAt(startedAtRef.current);
        }
      };
      client.on('user-published', async (remoteUser: any, mediaType: 'audio' | 'video') => {
        if (!current() || ownedMedia.closed) return;
        try {
          await client.subscribe(remoteUser, mediaType);
          if (!current() || ownedMedia.closed) {
            remoteUser[mediaType === 'audio' ? 'audioTrack' : 'videoTrack']?.stop();
            return;
          }
          if (groupId) {
            const remote = ownedMedia.remotes.get(remoteUser.uid) ?? { audio: null, video: null };
            if (mediaType === 'audio') { remote.audio = remoteUser.audioTrack; remoteUser.audioTrack?.play(); }
            else remote.video = remoteUser.videoTrack;
            ownedMedia.remotes.set(remoteUser.uid, remote);
            syncGroup(ownedMedia);
            setMediaRevision(revision => revision + 1);
          } else if (mediaType === 'audio') {
            ownedMedia.remoteAudio = remoteUser.audioTrack;
            remoteUser.audioTrack?.play();
          } else {
            ownedMedia.remoteVideo = remoteUser.videoTrack;
            setMediaRevision(revision => revision + 1);
          }
          markLive();
        } catch (error) {
          if (current() && !groupId) { console.warn('Call subscription failed', error); void endCall(); }
          else if (current()) console.warn('Group call subscription failed', error);
        }
      });
      client.on('user-unpublished', (remoteUser: any, type: 'audio' | 'video') => {
        if (!current()) return;
        if (groupId) {
          const remote = ownedMedia.remotes.get(remoteUser.uid);
          if (!remote) return;
          try { remote[type]?.stop(); } catch {}
          remote[type] = null;
          syncGroup(ownedMedia);
          setMediaRevision(revision => revision + 1);
          return;
        }
        if (type === 'video') {
          ownedMedia.remoteVideo?.stop();
          ownedMedia.remoteVideo = null; setMediaRevision(revision => revision + 1);
        }
      });
      if (groupId) {
        // A member in the room counts as there before they unmute anything.
        client.on('user-joined', (remoteUser: any) => {
          if (!current() || ownedMedia.closed) return;
          if (!ownedMedia.remotes.has(remoteUser.uid)) ownedMedia.remotes.set(remoteUser.uid, { audio: null, video: null });
          syncGroup(ownedMedia);
          markLive();
        });
        client.on('user-left', (remoteUser: any) => {
          if (!current() || ownedMedia.closed) return;
          const remote = ownedMedia.remotes.get(remoteUser.uid);
          for (const track of [remote?.audio, remote?.video]) { try { track?.stop(); } catch {} }
          ownedMedia.remotes.delete(remoteUser.uid);
          speakingRef.current.delete(remoteUser.uid);
          syncGroup(ownedMedia);
          // Last one out: nobody left to talk to.
          if (!ownedMedia.remotes.size && startedAtRef.current != null) void endCall();
        });
        client.enableAudioVolumeIndicator();
        client.on('volume-indicator', (levels: Array<{ uid: number | string; level: number }>) => {
          if (!current() || ownedMedia.closed) return;
          const next = new Set<number>();
          let self = false;
          for (const { uid, level } of levels) {
            if (level < 6) continue;
            if (Number(uid) === ownUid || uid === 0) self = true;
            else next.add(Number(uid));
          }
          setSelfSpeaking(previous => (previous === self ? previous : self));
          const before = speakingRef.current;
          if (next.size === before.size && [...next].every(uid => before.has(uid))) return;
          speakingRef.current = next;
          syncGroup(ownedMedia);
        });
      } else {
        client.on('user-left', () => { if (current()) void endCall(); });
      }
      await client.join(data.appId, channelName, data.token, groupId ? ownUid : (data.uid ?? 0));
      if (!current() || media.closed) { await disposeMedia(media); return false; }
      if (groupId && userAddress) {
        const wallet = userAddress.toLowerCase();
        ownedMedia.presence = leaseChannel(groupCallPresenceTopic(groupId), {
          listen: [{
            type: 'presence',
            filter: { event: 'sync' },
            handler: (_payload, channel) => {
              if (ownedMedia.closed) return;
              rosterRef.current = new Map(presenceList(channel.presenceState() as Record<string, unknown[]>)
                .map((entry: GroupCallPresence) => [entry.uid, entry.wallet]));
              syncGroup(ownedMedia);
            },
          }],
          onJoin: channel => { if (!ownedMedia.closed) void channel.track({ uid: ownUid, wallet, type: call.call_type }); },
        });
      }
      const audio = await AgoraRTC.createMicrophoneAudioTrack();
      if (!current() || media.closed) { audio.close(); await disposeMedia(media); return false; }
      media.audio = audio;
      if (call.call_type === 'video') {
        const video = await AgoraRTC.createCameraVideoTrack();
        if (!current() || media.closed) { video.close(); await disposeMedia(media); return false; }
        media.video = video;
        localVideoTrack.current = video;
        setMediaRevision(revision => revision + 1);
      }
      await client.publish([media.audio, ...(media.video ? [media.video] : [])]);
      if (!current() || media.closed) { await disposeMedia(media); return false; }
      return true;
    } catch (error) {
      await disposeMedia(media);
      if (current()) {
        console.warn('Call connection failed', error);
        setCallFailureReason('technical_error');
        toast.error(_copy("copy.8786057edfc1", { defaultValue: "Could not connect to call" }));
      }
      return false;
    }
  }, [userAddress, disposeMedia, publishCall, endCall, _copy, syncGroup]);

  /** Nobody came: a group room you are alone in closes itself after the ring window. */
  const armGroupTimeout = useCallback((generation: number, outcome: 'no_answer' | 'missed') => {
    if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
    callTimeoutRef.current = setTimeout(() => {
      if (generationRef.current !== generation || startedAtRef.current != null) return;
      void finishCall(outcome);
    }, 45_000);
  }, [finishCall]);

  const openGroupRoom = useCallback(async (group: GroupCallTarget, callType: 'audio' | 'video', members: string[] | null) => {
    if (!userAddress || currentCallRef.current) return;
    dismissCallSummary();
    const me = userAddress.toLowerCase();
    const generation = ++generationRef.current;
    const call: CallSession = {
      id: `group:${group.id}:${Date.now()}`, caller_address: me, recipient_address: me,
      status: 'ringing', call_type: callType, created_at: new Date().toISOString(),
      group_id: group.id, group_name: group.name,
    };
    groupRingIdsRef.current = [];
    publishCall(call);
    setIsMinimized(false); setCallFailureReason(null); setIsUserOffline(false); setIsConnecting(true);
    visualActivity.setCall(true, true);
    try {
      if (members) {
        const others = [...new Set(members.map(member => member.toLowerCase()))].filter(member => member !== me).slice(0, GROUP_CALL_MAX_RING);
        if (others.length) {
          const { data, error } = await callClient.from('call_sessions').insert(others.map(recipient => ({
            caller_address: me, recipient_address: recipient, call_type: callType, status: 'ringing',
            group_id: group.id, group_name: group.name,
          }))).select('id');
          if (error) throw error;
          const ids = (data ?? []).map((row: { id: string }) => row.id);
          if (generationRef.current !== generation) {
            await callClient.from('call_sessions').update({ status: 'ended' }).in('id', ids);
            return;
          }
          groupRingIdsRef.current = ids;
          void ensureWalletSession(me).then(session => {
            if (!session) throw new Error('Signed call session unavailable');
            return Promise.allSettled(ids.map(sessionId =>
              apiCall('/api/push/call-ring', { method: 'POST', body: { sessionId, walletSession: session.token }, requiresAuth: true })));
          }).catch(error => console.warn('Group ring push failed', error));
        }
      }
      const joined = await joinAgoraChannel(call, generation);
      if (generationRef.current !== generation) return;
      if (!joined) { await endCall(); return; }
      if (startedAtRef.current == null) armGroupTimeout(generation, 'no_answer');
    } catch (error) {
      if (generationRef.current === generation) {
        console.warn('Group call start failed', error); setCallFailureReason('technical_error'); await endCall();
      }
    }
  }, [userAddress, callClient, publishCall, joinAgoraChannel, endCall, dismissCallSummary, armGroupTimeout]);
  const startGroupCall = useCallback((group: GroupCallTarget, members: string[], callType: 'audio' | 'video' = 'audio') =>
    openGroupRoom(group, callType, members), [openGroupRoom]);
  const joinGroupCall = useCallback((group: GroupCallTarget, callType: 'audio' | 'video' = 'audio') =>
    openGroupRoom(group, callType, null), [openGroupRoom]);

  const startCall = useCallback(async (recipientAddress: string, callType: 'audio' | 'video' = 'audio') => {
    if (!userAddress || currentCallRef.current) return;
    dismissCallSummary();
    const generation = ++generationRef.current;
    const pending: CallSession = {
      id: 'pending', caller_address: userAddress.toLowerCase(), recipient_address: recipientAddress.toLowerCase(),
      status: 'ringing', call_type: callType, created_at: new Date().toISOString(),
    };
    publishCall(pending);
    setIsMinimized(false); setCallFailureReason(null); setIsUserOffline(false); setIsConnecting(true);
    visualActivity.setCall(true, true);
    try {
      const { data, error } = await callClient.from('call_sessions').insert({
        caller_address: pending.caller_address, recipient_address: pending.recipient_address,
        call_type: callType, status: 'ringing',
      }).select().single();
      if (error || !data) throw error ?? new Error('Could not initiate call');
      const call = data as CallSession;
      if (generationRef.current !== generation) { await markEnded(call); return; }
      publishCall(call);
      void ensureWalletSession(call.caller_address).then(session => {
        if (!session) throw new Error('Signed call session unavailable');
        return apiCall('/api/push/call-ring', { method: 'POST', body: { sessionId: call.id, walletSession: session.token }, requiresAuth: true });
      })
        .catch(error => console.warn('Call ring push failed', error));
      callMessageHandlerRef.current?.(callType === 'video' ? '📹 Video call' : '📞 Voice call');
      const joined = await joinAgoraChannel(call, generation);
      if (generationRef.current !== generation) return;
      if (!joined) { await endCall(); return; }
      if (startedAtRef.current == null) {
        callTimeoutRef.current = setTimeout(() => {
          if (generationRef.current !== generation || startedAtRef.current != null) return;
          setCallFailureReason('user_offline'); setIsUserOffline(true);
          callMessageHandlerRef.current?.(callType === 'video' ? '📵 Missed video call' : '📵 Missed voice call');
          void finishCall('no_answer');
        }, 30_000);
      }
      let checking = false;
      pollingIntervalRef.current = setInterval(async () => {
        if (checking || generationRef.current !== generation) return;
        checking = true;
        try {
          const { data: status } = await callClient.from('call_sessions').select('status').eq('id', call.id).single();
          if (generationRef.current !== generation) return;
          if (status?.status === 'ended') remoteClosed();
          else if (status?.status === 'connected') {
            publishCall({ ...currentCallRef.current!, status: 'connected' });
            if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
        } catch (error) { console.warn('Call status check failed', error); }
        finally { checking = false; }
      }, 1500);
    } catch (error) {
      if (generationRef.current === generation) {
        console.warn('Call start failed', error); setCallFailureReason('technical_error'); await endCall();
      }
    }
  }, [userAddress, callClient, publishCall, markEnded, joinAgoraChannel, endCall, finishCall, remoteClosed, dismissCallSummary]);

  const acceptCall = useCallback(async () => {
    const call = currentCallRef.current;
    if (!call || joiningRef.current || call.status !== 'ringing') return;
    const generation = generationRef.current;
    joiningRef.current = true;
    setIsIncoming(false); setIsConnecting(true); clearTimers();
    try {
      const { error } = await callClient.from('call_sessions').update({ status: 'connected' }).eq('id', call.id);
      if (generationRef.current !== generation) { await markEnded(call); return; }
      if (error) throw error;
      publishCall({ ...call, status: 'connected' });
      const joined = await joinAgoraChannel(call, generation);
      if (generationRef.current === generation && !joined) await endCall();
      // Answered after everyone else had already gone: do not sit in an empty room.
      else if (joined && call.group_id && startedAtRef.current == null) armGroupTimeout(generation, 'missed');
    } catch (error) {
      if (generationRef.current === generation) { setCallFailureReason('technical_error'); await endCall(); }
    } finally { if (generationRef.current === generation) joiningRef.current = false; }
  }, [callClient, clearTimers, publishCall, joinAgoraChannel, endCall, markEnded, armGroupTimeout]);
  const checkForCalls = useCallback(async (recover = false): Promise<void> => {
    if (!userAddress || currentCallRef.current || !callChecksVisible()) return;
    const generation = generationRef.current;
    const pending = ringCheckRef.current;
    if (pending?.wallet === userAddress && pending.generation === generation) {
      // A ring may have been inserted after the running query took its snapshot.
      pending.recover ||= recover;
      return;
    }
    const request = { wallet: userAddress, generation, recover: false };
    ringCheckRef.current = request;
    try {
      const call = await simpleCallCheck(userAddress);
      if (!call || generationRef.current !== generation || currentCallRef.current || !callChecksVisible()) return;
      const age = Date.now() - new Date(call.created_at).getTime();
      if (!Number.isFinite(age) || age > 45_000) return;
      ++generationRef.current;
      publishCall(call as CallSession); setIsMinimized(false); setIsIncoming(true);
      visualActivity.setCall(true, true);
      const ringGeneration = generationRef.current;
      callTimeoutRef.current = setTimeout(() => {
        if (generationRef.current === ringGeneration && !joiningRef.current) void finishCall('missed');
      }, Math.max(0, 45_000 - age));
    } finally {
      if (ringCheckRef.current === request) {
        ringCheckRef.current = null;
        if (request.recover && generationRef.current === generation) void checkRef.current();
      }
    }
  }, [userAddress, callClient, publishCall, finishCall]);
  const checkRef = useRef(checkForCalls);
  checkRef.current = checkForCalls;
  const remoteClosedRef = useRef(remoteClosed);
  remoteClosedRef.current = remoteClosed;
  useEffect(() => {
    if (!userAddress) return;
    const channel = supabase.channel(`call:${userAddress.toLowerCase()}`, { config: { private: true } })
      .on('broadcast', { event: 'call' }, (message: { payload?: Pick<CallSession, 'id' | 'status'> }) => {
        const ping = message.payload;
        if (ping?.status === 'ringing') void checkRef.current(true);
        else if (ping?.status === 'ended' && currentCallRef.current?.id === ping.id) remoteClosedRef.current();
      }).subscribe(status => { if (status === 'SUBSCRIBED') void checkRef.current(); });
    const poll = () => { if (document.visibilityState !== 'hidden') void checkRef.current(); };
    const interval = setInterval(poll, 15_000);
    document.addEventListener('visibilitychange', poll);
    window.addEventListener('online', poll);
    poll();
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', poll);
      window.removeEventListener('online', poll);
      void supabase.removeChannel(channel);
    };
  }, [userAddress]);
  useEffect(() => {
    publishCall(null);
    dismissCallSummary();
    startedAtRef.current = null;
    joiningRef.current = false;
    setCallStartedAt(null); setIsCallActive(false); setIsIncoming(false); setIsConnecting(false);
    setIsMuted(false); setIsCameraOff(false); setIsMinimized(false);
    return () => {
    generationRef.current += 1;
    clearTimers();
    const call = currentCallRef.current;
    currentCallRef.current = null;
    const media = mediaRef.current;
    mediaRef.current = null;
    localVideoTrack.current = null;
    visualActivity.setCall(false, false);
    void disposeMedia(media); void markEnded(call);
    };
  }, [userAddress, clearTimers, disposeMedia, markEnded, publishCall, dismissCallSummary]);
  useEffect(() => {
    const media = mediaRef.current;
    if (!media || media.closed || isMinimized) return;
    try { if (media.video && localVideoRef.current) media.video.play(localVideoRef.current); } catch {}
    try { if (media.remoteVideo && remoteVideoRef.current) media.remoteVideo.play(remoteVideoRef.current); } catch {}
  }, [mediaRevision, isCallActive, isConnecting, isMinimized]);
  // Portal surfaces can mount after the publication effect has already run.
  const attachLocalVideo = useCallback((node: HTMLDivElement | null) => {
    (localVideoRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    const media = mediaRef.current;
    if (node && media && !media.closed) { try { media.video?.play(node); } catch {} }
  }, []);
  const groupVideoRefs = useRef<Map<number, (node: HTMLDivElement | null) => void>>(new Map());
  const groupVideoNodes = useRef<Map<number, HTMLDivElement>>(new Map());
  /** One stable ref callback per tile, so a re-render does not re-attach every camera. */
  const attachGroupVideo = useCallback((uid: number) => {
    let attach = groupVideoRefs.current.get(uid);
    if (!attach) {
      attach = (node: HTMLDivElement | null) => {
        if (!node) { groupVideoNodes.current.delete(uid); return; }
        groupVideoNodes.current.set(uid, node);
        const track = mediaRef.current?.remotes.get(uid)?.video;
        if (track && !mediaRef.current?.closed) { try { track.play(node); } catch {} }
      };
      groupVideoRefs.current.set(uid, attach);
    }
    return attach;
  }, []);
  // A camera that comes on after its tile mounted.
  useEffect(() => {
    const media = mediaRef.current;
    if (!media || media.closed || isMinimized) return;
    for (const [uid, remote] of media.remotes) {
      const node = groupVideoNodes.current.get(uid);
      if (node && remote.video && !remote.video.isPlaying) { try { remote.video.play(node); } catch {} }
    }
  }, [mediaRevision, groupParticipants, isMinimized]);
  const attachRemoteVideo = useCallback((node: HTMLDivElement | null) => {
    (remoteVideoRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    const media = mediaRef.current;
    if (node && media && !media.closed) { try { media.remoteVideo?.play(node); } catch {} }
  }, []);

  const toggleMute = useCallback(() => {
    const audio = mediaRef.current?.audio;
    if (audio) setIsMuted(previous => { void audio.setMuted(!previous); return !previous; });
  }, []);
  const toggleCamera = useCallback(() => {
    const video = mediaRef.current?.video;
    if (video) setIsCameraOff(previous => { void video.setMuted(!previous); return !previous; });
  }, []);
  const switchCamera = useCallback(async () => {
    const video = mediaRef.current?.video;
    if (!video) return;
    try {
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'videoinput');
      if (mediaRef.current?.video !== video || devices.length < 2) return;
      const label = video.getTrackLabel?.() ?? '';
      await video.setDevice((devices.find(device => device.label !== label) ?? devices[0]).deviceId);
    } catch (error) { console.warn('Camera switch failed', error); }
  }, []);
  const minimizeCall = useCallback(() => setIsMinimized(true), []);
  const maximizeCall = useCallback(() => setIsMinimized(false), []);
  const clearCallFailure = useCallback(() => { setCallFailureReason(null); setIsUserOffline(false); }, []);
  const debugCallState = useCallback(() => { console.log('Call state', currentCallRef.current); if (userAddress) void debugAllCalls(userAddress); }, [userAddress]);
  const peerAddress = currentCall
    ? currentCall.caller_address.toLowerCase() === userAddress?.toLowerCase()
      ? currentCall.recipient_address : currentCall.caller_address : '';
  const isRinging = !!currentCall && isConnecting && !isCallActive && currentCall.status === 'ringing'
    && currentCall.caller_address.toLowerCase() === userAddress?.toLowerCase();
  const isGroupCall = !!currentCall?.group_id;
  const captionRoom = !currentCall || !isCallActive
    ? null
    : currentCall.group_id ? groupCallChannel(currentCall.group_id) : isSessionId(currentCall.id) ? `dm-call-${currentCall.id}` : null;
  const captionSpeakers = useMemo(() => {
    if (!currentCall) return [];
    const wallets = currentCall.group_id
      ? [userAddress ?? '', ...groupParticipants.map(p => p.wallet ?? '')]
      : [currentCall.caller_address, currentCall.recipient_address];
    return [...new Set(wallets.map(w => w.toLowerCase()).filter(Boolean))];
  }, [currentCall, groupParticipants, userAddress]);
  const getMicStream = useCallback((): MediaStream | null => {
    const track = mediaRef.current?.audio?.getMediaStreamTrack?.();
    return track ? new MediaStream([track]) : null;
  }, []);
  const setCallVolume = useCallback((volume: number) => {
    const media = mediaRef.current;
    if (!media) return;
    for (const track of [media.remoteAudio, ...[...media.remotes.values()].map(r => r.audio)]) {
      try { track?.setVolume?.(volume); } catch { /* track already gone */ }
    }
  }, []);
  return useMemo(() => ({
    captionRoom, captionSpeakers, getMicStream, setCallVolume,
    isGroupCall, groupParticipants, selfSpeaking, attachGroupVideo, startGroupCall, joinGroupCall,
    isRinging, callSummary, dismissCallSummary,
    isCallActive, isIncoming, currentCall, isConnecting, isMuted, isCameraOff, isUserOffline, callFailureReason,
    clearCallFailure, isMinimized, minimizeCall, maximizeCall, callStartedAt, mediaRevision, peerAddress, localVideoRef, remoteVideoRef,
    attachLocalVideo, attachRemoteVideo, remoteAudioRef, startCall, endCall, acceptCall, rejectCall: endCall, toggleMute, toggleCamera, switchCamera,
    localVideoTrack, debugCallState, checkForCalls, setCallMessageHandler,
  }), [captionRoom, captionSpeakers, getMicStream, setCallVolume, isGroupCall, groupParticipants, selfSpeaking, attachGroupVideo, startGroupCall, joinGroupCall,
    isRinging, callSummary, dismissCallSummary, isCallActive, isIncoming, currentCall, isConnecting, isMuted, isCameraOff, isUserOffline, callFailureReason,
    clearCallFailure, isMinimized, minimizeCall, maximizeCall, callStartedAt, mediaRevision, peerAddress, startCall, endCall, acceptCall,
    attachLocalVideo, attachRemoteVideo, toggleMute, toggleCamera, switchCamera, debugCallState, checkForCalls, setCallMessageHandler]);
};

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
import type { RealtimeChannel } from '@supabase/supabase-js';
import { callBackgroundSettings, loadCallBackground, loadCallBackgroundPhoto, saveCallBackground, type CallBackgroundId } from '@/lib/calls/call-background';
import type { BackgroundStage } from '@/lib/studio/background';
import type { FaceFilterId, FaceFilterStage } from '@/lib/studio/face-filters';
import { loadCallFaceFilter, saveCallFaceFilter } from '@/lib/calls/call-background';
import { moderateCall, NO_CALL_MODERATION, readCallModeration, removedMinutesLeft, type CallModAction, type GroupCallModeration } from '@/lib/api/dehub/group-call-moderation';
import { groupCallChannel, groupCallPresenceTopic, groupCallUid, presenceList, groupCallLoad, readGroupCallRoster, GROUP_CALL_MAX_RING } from '@/lib/group-call';

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
  /** A moderator muted them: nobody in the call hears them until a moderator unmutes them. */
  modMuted?: boolean;
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
  /** Every camera slot in this group call is taken by someone else: yours stays off until one frees up. */
  groupCamerasFull: boolean;
  attachGroupVideo: (uid: number) => (node: HTMLDivElement | null) => void;
  /** Live voice levels (0..1) in a group call: each uid that is sending sound, and you as 0. Cheap enough to read every frame. */
  readGroupLevels: () => Map<number, number>;
  /**
   * Ring the group's members (notification + incoming screen) and open its
   * room. Refused with a toast when the room is full; a video call starts
   * with the camera off when the cameras are.
   */
  startGroupCall: (group: GroupCallTarget, members: string[], callType?: 'audio' | 'video') => Promise<void>;
  /** Step into a group's room without ringing anyone (Public Chat, or a call already going). Same limits. */
  joinGroupCall: (group: GroupCallTarget, callType?: 'audio' | 'video') => Promise<void>;
  /** Who the chat's moderators muted or removed in this group call, and whether you are one of them. */
  groupModeration: GroupCallModeration;
  /** A moderator muted you: the mic stays off until one unmutes you. */
  modMuted: boolean;
  moderateGroupMember: (wallet: string, action: CallModAction) => Promise<boolean>;
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
  playbackDevice: string;
  setPlaybackDevice: (deviceId: string) => Promise<boolean>;
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
  /** What is behind you on a video call: off, blur, a scene or your photo. Remembered between calls. */
  callBackground: CallBackgroundId;
  /** The effect is loading (the first time takes a second or two). */
  callBackgroundBusy: boolean;
  /** Pick a background. `photo` is a data URL, for 'photo'. */
  setCallBackground: (id: CallBackgroundId, photo?: string | null) => void;
  /** Shades, cat, crown or hearts that follow your face on a video call. Remembered between calls. */
  callFaceFilter: FaceFilterId;
  setCallFaceFilter: (id: FaceFilterId) => void;
}
type GroupRemote = { audio: any; video: any; silenced?: boolean };
type CallMedia = {
  client: any; audio: any; audioReady?: boolean; video: any; remoteVideo: any; remoteAudio: any; closed: boolean;
  remotes: Map<number, GroupRemote>; presence: ChannelLease | null;
  /** Your camera is being sent (on and unmuted). Group calls announce it so others can count cameras. */
  camOn?: boolean;
  /** Tell the group room your camera changed. */
  announce?: () => void;
  /** Re-reads who the moderators muted or removed (group calls). */
  modTimer?: ReturnType<typeof setInterval> | null;
  /**
   * The camera effects, while any is on: raw camera -> background -> face
   * filter. The last stage's canvas track is what the camera track sends
   * (replaceTrack); `raw` is the real camera, which keeps running underneath
   * and is ours to stop.
   */
  fx?: { raw: MediaStreamTrack; bg: BackgroundStage | null; face: FaceFilterStage | null } | null;
  /** Effect changes run one at a time. */
  fxQueue?: Promise<void>;
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
  const [isMuted, setMutedState] = useState(false);
  const mutedRef = useRef(false);
  const setIsMuted = useCallback((muted: boolean) => {
    mutedRef.current = muted;
    setMutedState(muted);
  }, []);
  const [playbackDevice, setPlaybackDeviceState] = useState('');
  const playbackDeviceRef = useRef('');
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isUserOffline, setIsUserOffline] = useState(false);
  const [callFailureReason, setCallFailureReason] = useState<'user_offline' | 'technical_error' | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [mediaRevision, setMediaRevision] = useState(0);
  const [callSummary, setCallSummary] = useState<CallSummary | null>(null);
  const [groupParticipants, setGroupParticipants] = useState<GroupParticipant[]>([]);
  const [selfSpeaking, setSelfSpeaking] = useState(false);
  const [groupCamerasFull, setGroupCamerasFull] = useState(false);
  const camerasFullRef = useRef(false);
  /** Set for a group video call joined while every camera slot was taken. */
  const startCameraOffRef = useRef(false);
  const [callBackground, setCallBackgroundState] = useState<CallBackgroundId>(() => loadCallBackground());
  const [callBackgroundBusy, setCallBackgroundBusy] = useState(false);
  const [callFaceFilter, setCallFaceFilterState] = useState<FaceFilterId>(() => loadCallFaceFilter());
  const callFaceFilterRef = useRef<FaceFilterId>(callFaceFilter);
  const callBackgroundRef = useRef<{ id: CallBackgroundId; photo: string | null } | null>(null);
  if (!callBackgroundRef.current) {
    const id = loadCallBackground();
    callBackgroundRef.current = { id, photo: id === 'photo' ? loadCallBackgroundPhoto() : null };
  }
  const rosterRef = useRef<Map<number, string>>(new Map());
  const [groupModeration, setGroupModeration] = useState<GroupCallModeration>(NO_CALL_MODERATION);
  const moderationRef = useRef<GroupCallModeration>(NO_CALL_MODERATION);
  /** A moderator muted you: the mic stays off until one unmutes you. */
  const [modMuted, setModMuted] = useState(false);
  const modMutedRef = useRef(false);
  /** The room volume last asked for (Agora's 0..100+ scale), to give back to someone a moderator unmutes. */
  const callVolumeRef = useRef(100);
  const speakingRef = useRef<Set<number>>(new Set());
  /** Ring rows a group call's starter wrote, so an unanswered start can stop the phones. */
  const groupRingIdsRef = useRef<string[]>([]);
  /** Reading a room before stepping in: a second tap waits for it. */
  const joiningGroupRef = useRef(false);
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
    if (!call) {
      setIsMuted(false);
      playbackDeviceRef.current = '';
      setPlaybackDeviceState('');
    }
    currentCallRef.current = call;
    setCurrentCall(call);
  }, [setIsMuted]);
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
      // The camera track was sending the effect's canvas, so closing it left the real camera on.
      const fx = media.fx;
      media.fx = null;
      if (fx) {
        try { fx.face?.stop(); } catch {}
        try { fx.bg?.stop(); } catch {}
        try { fx.raw.stop(); } catch {}
      }
      for (const track of [media.remoteAudio, media.remoteVideo]) { try { track?.stop(); } catch {} }
      for (const remote of media.remotes.values()) {
        for (const track of [remote.audio, remote.video]) { try { track?.stop(); } catch {} }
      }
      media.remotes.clear();
      if (media.modTimer) clearInterval(media.modTimer);
      media.modTimer = null;
      try { media.presence?.release(); } catch {}
      media.presence = null;
      try { media.client?.removeAllListeners(); } catch {}
    }
    // Retry leaving if a pending join completed after the first teardown.
    try { await media.client?.leave(); } catch {}
  }, []);
  const finishCall = useCallback(async (reason?: Exclude<CallOutcome, 'ended'>, notifyPeer = true) => {
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
    setIsCameraOff(false); setIsMinimized(false);
    setGroupParticipants([]); setSelfSpeaking(false); setGroupCamerasFull(false);
    camerasFullRef.current = false; startCameraOffRef.current = false;
    rosterRef.current = new Map(); speakingRef.current = new Set();
    moderationRef.current = NO_CALL_MODERATION; setGroupModeration(NO_CALL_MODERATION);
    modMutedRef.current = false; setModMuted(false);
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
    await Promise.all([disposeMedia(media), notifyPeer ? markEnded(call, startedAt != null) : undefined]);
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
    const { muted, removed } = moderationRef.current;
    const now = Date.now();
    const out = new Set(removed.filter(entry => new Date(entry.until).getTime() > now).map(entry => entry.wallet));
    const people: GroupParticipant[] = [];
    for (const [uid, remote] of media.remotes) {
      const wallet = roster.get(uid) ?? null;
      const silenced = !!wallet && (muted.includes(wallet) || out.has(wallet));
      // Muted or removed by a moderator: silent on every screen, not just theirs.
      if (silenced !== !!remote.silenced) {
        remote.silenced = silenced;
        try { remote.audio?.setVolume?.(silenced ? 0 : callVolumeRef.current); } catch { /* track gone */ }
      }
      if (wallet && out.has(wallet)) continue;
      people.push({
        uid, wallet, audio: !!remote.audio && !silenced, video: !!remote.video, speaking: speaking.has(uid) && !silenced,
        modMuted: !!wallet && muted.includes(wallet),
      });
    }
    setGroupParticipants(people);
  }, []);

  /**
   * Puts the chosen background and face filter on the camera that is being
   * sent, or takes them off. The last effect's canvas replaces the camera
   * track's picture in place (replaceTrack), so nothing is unpublished and
   * the other side sees no gap; the real camera keeps running underneath for
   * the effects to read. The background always reads the real camera, and
   * the face filter reads whatever is before it, so toggling the background
   * under a face filter moves the filter onto the new picture.
   */
  const applyEffects = useCallback((media: CallMedia) => {
    const restoreCamera = async (video: any) => {
      const fx = media.fx;
      if (!fx) return;
      media.fx = null;
      try { await video.replaceTrack(fx.raw, false); } catch (error) { console.warn('Camera restore failed', error); }
      fx.face?.stop();
      fx.bg?.stop();
      setMediaRevision(revision => revision + 1);
    };
    const run = async () => {
      const video = media.video;
      if (!video || media.closed) return;
      const { id, photo } = callBackgroundRef.current ?? { id: 'none' as const, photo: null };
      const face = callFaceFilterRef.current;
      const fx = media.fx ?? null;
      if (id === 'none' && face === 'none') { await restoreCamera(video); return; }
      const raw: MediaStreamTrack | undefined = fx?.raw ?? video.getMediaStreamTrack?.();
      if (!raw) return;
      setCallBackgroundBusy(true);
      const started: { stop: () => void }[] = [];
      const retired: { stop: () => void }[] = [];
      try {
        let bg = fx?.bg ?? null;
        if (id === 'none') {
          if (bg) retired.push(bg);
          bg = null;
        } else {
          const { mode, opts } = await callBackgroundSettings(id, photo);
          if (bg) bg.setMode(mode, opts);
          else {
            const { startBackgroundStage } = await import('@/lib/studio/background');
            bg = await startBackgroundStage(raw, mode, opts);
            started.push(bg);
          }
        }
        let faceStage = fx?.face ?? null;
        const faceSource = bg?.track ?? raw;
        if (face === 'none') {
          if (faceStage) retired.push(faceStage);
          faceStage = null;
        } else if (faceStage && faceStage.source === faceSource) {
          faceStage.setFilter(face);
        } else {
          if (faceStage) retired.push(faceStage);
          const { startFaceFilterStage } = await import('@/lib/studio/face-filters');
          faceStage = await startFaceFilterStage(faceSource, face);
          started.push(faceStage);
        }
        if (media.closed || media.video !== video) { started.forEach(stage => stage.stop()); return; }
        const out = faceStage?.track ?? bg?.track ?? raw;
        const sending = fx ? fx.face?.track ?? fx.bg?.track ?? fx.raw : raw;
        if (out !== sending) await video.replaceTrack(out, false);
        media.fx = { raw, bg, face: faceStage };
        retired.forEach(stage => stage.stop());
        if (out !== sending) setMediaRevision(revision => revision + 1);
      } catch (error) {
        started.forEach(stage => stage.stop());
        throw error;
      } finally {
        setCallBackgroundBusy(false);
      }
    };
    const next = (media.fxQueue ?? Promise.resolve()).then(run).catch(async error => {
      console.warn('Call effects failed', error);
      if (media.closed) return;
      callBackgroundRef.current = { id: 'none', photo: null };
      callFaceFilterRef.current = 'none';
      setCallBackgroundState('none');
      setCallFaceFilterState('none');
      if (media.video) await restoreCamera(media.video);
      toast.error(_copy('calls.backgroundFailed', { defaultValue: "Background effects can't run on this device." }));
    });
    media.fxQueue = next;
    return next;
  }, [_copy]);
  /**
   * What the chat's moderators decided for this call: a removed person leaves,
   * a muted one has their mic held off, and everyone else's screen silences
   * and hides them too.
   */
  const applyModeration = useCallback((media: CallMedia, next: GroupCallModeration) => {
    if (media.closed || mediaRef.current !== media) return;
    moderationRef.current = next;
    setGroupModeration(next);
    const me = userAddress?.toLowerCase() ?? '';
    if (me && removedMinutesLeft(next, me) > 0) {
      toast(_copy('calls.removedByMod', { defaultValue: 'A moderator removed you from this call' }));
      void finishCall();
      return;
    }
    const muted = !!me && next.muted.includes(me);
    if (muted !== modMutedRef.current) {
      modMutedRef.current = muted;
      setModMuted(muted);
      if (muted) {
        if (media.audio) { void media.audio.setMuted(true); setIsMuted(true); }
        toast(_copy('calls.mutedByMod', { defaultValue: 'A moderator muted you' }));
      } else {
        toast(_copy('calls.unmutedByMod', { defaultValue: 'A moderator unmuted you. Tap the mic to talk.' }));
      }
    }
    syncGroup(media);
  }, [userAddress, _copy, finishCall, syncGroup, setIsMuted]);
  const refreshModeration = useCallback((media: CallMedia, groupId: string) => {
    readCallModeration(groupId).then(next => applyModeration(media, next)).catch(error => console.warn('Call moderation read failed', error));
  }, [applyModeration]);

  const joinAgoraChannel = useCallback(async (call: CallSession, generation: number): Promise<boolean> => {
    const current = () => generationRef.current === generation && currentCallRef.current?.id === call.id;
    if (!current()) return false;
    const groupId = call.group_id || null;
    const channelName = groupId ? groupCallChannel(groupId) : `dm-call-${call.id}`;
    const ownUid = groupId && userAddress ? groupCallUid(userAddress.toLowerCase()) : 0;
    let media: CallMedia | null = null;
    try {
      if (groupId && userAddress) {
        // Removed by a moderator a moment ago: stay out until the time is up.
        const standing = await readCallModeration(groupId).catch(() => null);
        if (!current()) return false;
        const minutes = standing ? removedMinutesLeft(standing, userAddress) : 0;
        if (minutes > 0) {
          toast.error(_copy('calls.removedByMod', { defaultValue: 'A moderator removed you from this call' }), {
            description: _copy('calls.removedFor', { count: minutes, defaultValue: 'You can join again in {{count}} min.' }),
          });
          return false;
        }
        if (standing) { moderationRef.current = standing; setGroupModeration(standing); }
      }
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
      if (!groupId) {
        // A peer can join with their microphone muted and have nothing to publish.
        client.on('user-joined', () => {
          if (current() && !ownedMedia.closed) markLive();
        });
      }
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
            if (mediaType === 'audio') {
              remote.audio = remoteUser.audioTrack; remoteUser.audioTrack?.play();
              if (remote.silenced) { try { remote.audio?.setVolume?.(0); } catch { /* track gone */ } }
            }
            else remote.video = remoteUser.videoTrack;
            ownedMedia.remotes.set(remoteUser.uid, remote);
            syncGroup(ownedMedia);
            setMediaRevision(revision => revision + 1);
          } else if (mediaType === 'audio') {
            const track = remoteUser.audioTrack;
            ownedMedia.remoteAudio = track;
            track?.play();
            const deviceId = playbackDeviceRef.current;
            if (deviceId) {
              void track?.setPlaybackDevice(deviceId).catch(() => {
                if (!current() || ownedMedia.closed || playbackDeviceRef.current !== deviceId) return;
                playbackDeviceRef.current = '';
                setPlaybackDeviceState('');
              });
            }
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
      // Start direct-call self-view before joining Agora or waiting for microphone access.
      if (!groupId && call.call_type === 'video') {
        const video = await AgoraRTC.createCameraVideoTrack();
        if (!current() || media.closed) { video.close(); await disposeMedia(media); return false; }
        media.video = video;
        localVideoTrack.current = video;
        media.camOn = true;
        setMediaRevision(revision => revision + 1);
      }
      await client.join(data.appId, channelName, data.token, groupId ? ownUid : (data.uid ?? 0));
      if (!current() || media.closed) { await disposeMedia(media); return false; }
      if (groupId && userAddress) {
        const wallet = userAddress.toLowerCase();
        // Sent on every (re)join and whenever the camera goes on or off, so the room can count cameras.
        const announce = (channel: RealtimeChannel) => {
          if (!ownedMedia.closed) void channel.track({ uid: ownUid, wallet, type: call.call_type, cam: !!ownedMedia.camOn });
        };
        ownedMedia.presence = leaseChannel(groupCallPresenceTopic(groupId), {
          listen: [{
            type: 'presence',
            filter: { event: 'sync' },
            handler: (_payload, channel) => {
              if (ownedMedia.closed) return;
              const roster = presenceList(channel.presenceState() as Record<string, unknown[]>);
              rosterRef.current = new Map(roster.map(entry => [entry.uid, entry.wallet]));
              const { camerasFull } = groupCallLoad(roster.filter(entry => entry.uid !== ownUid), null);
              camerasFullRef.current = camerasFull;
              setGroupCamerasFull(camerasFull);
              syncGroup(ownedMedia);
            },
          }, {
            // A moderator acted: read the list again (the message itself is only a nudge).
            type: 'broadcast',
            filter: { event: 'mod' },
            handler: () => refreshModeration(ownedMedia, groupId),
          }],
          onJoin: announce,
        });
        refreshModeration(ownedMedia, groupId);
        ownedMedia.modTimer = setInterval(() => refreshModeration(ownedMedia, groupId), 20_000);
        ownedMedia.announce = () => { if (ownedMedia.presence) announce(ownedMedia.presence.channel); };
      }
      const audio = await AgoraRTC.createMicrophoneAudioTrack();
      if (!current() || media.closed) { audio.close(); await disposeMedia(media); return false; }
      media.audio = audio;
      if (groupId && userAddress && moderationRef.current.muted.includes(userAddress.toLowerCase())) {
        modMutedRef.current = true; setModMuted(true);
        setIsMuted(true);
      }
      if (groupId && call.call_type === 'video') {
        const video = await AgoraRTC.createCameraVideoTrack();
        if (!current() || media.closed) { video.close(); await disposeMedia(media); return false; }
        media.video = video;
        localVideoTrack.current = video;
        // Every camera slot is taken: you are in, heard and seeing everyone, with yours off.
        if (groupId && startCameraOffRef.current) {
          await video.setMuted(true);
          setIsCameraOff(true);
        }
        media.camOn = !(groupId && startCameraOffRef.current);
        media.announce?.();
        setMediaRevision(revision => revision + 1);
      }
      // Apply the latest selection before publishing, including changes during camera setup.
      let appliedMute = false;
      while (appliedMute !== mutedRef.current) {
        appliedMute = mutedRef.current;
        await audio.setMuted(appliedMute);
        if (!current() || media.closed) { await disposeMedia(media); return false; }
      }
      media.audioReady = true;
      await client.publish([media.audio, ...(media.video ? [media.video] : [])]);
      if (!current() || media.closed) { await disposeMedia(media); return false; }
      // The background picked on an earlier call comes back on its own.
      if (media.video && (callBackgroundRef.current?.id !== 'none' || callFaceFilterRef.current !== 'none')) void applyEffects(media);
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
  }, [userAddress, disposeMedia, publishCall, endCall, _copy, syncGroup, applyEffects, refreshModeration, setIsMuted]);

  /** Nobody answered the ring: a group room you are alone in closes after the ring window. */
  const armGroupTimeout = useCallback((generation: number, outcome: 'no_answer' | 'missed') => {
    if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
    callTimeoutRef.current = setTimeout(() => {
      if (generationRef.current !== generation || startedAtRef.current != null) return;
      void finishCall(outcome);
    }, 45_000);
  }, [finishCall]);

  const openGroupRoom = useCallback(async (group: GroupCallTarget, callType: 'audio' | 'video', members: string[] | null) => {
    if (!userAddress || currentCallRef.current || joiningGroupRef.current) return;
    const me = userAddress.toLowerCase();
    // Read the room first, so a full one says so before any call screen opens.
    joiningGroupRef.current = true;
    let load: ReturnType<typeof groupCallLoad>;
    try { load = groupCallLoad(await readGroupCallRoster(group.id), me); } finally { joiningGroupRef.current = false; }
    if (currentCallRef.current) return;
    if (load.full) {
      toast.error(_copy('calls.callFull', { defaultValue: 'This call is full' }), {
        description: _copy('calls.callFullHint', { defaultValue: "It already has the most people a call can take. You can join once someone leaves." }),
      });
      return;
    }
    const cameraOff = callType === 'video' && load.camerasFull;
    if (cameraOff) {
      toast(_copy('calls.camerasFull', { defaultValue: 'Cameras full' }), {
        description: _copy('calls.camerasFullJoin', { defaultValue: "You're in with your camera off. You can turn it on when someone turns theirs off." }),
      });
    }
    dismissCallSummary();
    const generation = ++generationRef.current;
    startCameraOffRef.current = cameraOff;
    camerasFullRef.current = load.camerasFull; setGroupCamerasFull(load.camerasFull);
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
      let rang = false;
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
          rang = true;
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
      // A rung group stops ringing after the ring window. An open room (Public
      // Chat, or joining a call already going) stays up while you wait.
      if (rang && startedAtRef.current == null) armGroupTimeout(generation, 'no_answer');
    } catch (error) {
      if (generationRef.current === generation) {
        console.warn('Group call start failed', error); setCallFailureReason('technical_error'); await endCall();
      }
    }
  }, [userAddress, callClient, publishCall, joinAgoraChannel, endCall, dismissCallSummary, armGroupTimeout, _copy]);
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
    if (!call.group_id) {
      callTimeoutRef.current = setTimeout(() => {
        if (generationRef.current === generation && startedAtRef.current == null) void endCall();
      }, 30_000);
    }
    try {
      const { data, error } = await callClient.from('call_sessions').update({ status: 'connected' })
        .eq('id', call.id).eq('status', 'ringing').select('id').maybeSingle();
      if (generationRef.current !== generation) return;
      if (error) throw error;
      if (!data) { await finishCall(undefined, false); return; }
      publishCall({ ...call, status: 'connected' });
      const joined = await joinAgoraChannel(call, generation);
      if (generationRef.current === generation && !joined) await endCall();
      // Answered after everyone else had already gone: do not sit in an empty room.
      else if (joined && call.group_id && startedAtRef.current == null) armGroupTimeout(generation, 'missed');
    } catch (error) {
      if (generationRef.current === generation) { setCallFailureReason('technical_error'); await endCall(); }
    } finally { if (generationRef.current === generation) joiningRef.current = false; }
  }, [callClient, clearTimers, publishCall, joinAgoraChannel, endCall, finishCall, armGroupTimeout]);
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
    setIsCameraOff(false); setIsMinimized(false);
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

  const setCallBackground = useCallback((id: CallBackgroundId, photo?: string | null) => {
    const nextPhoto = id === 'photo' ? photo ?? loadCallBackgroundPhoto() : null;
    callBackgroundRef.current = { id: id === 'photo' && !nextPhoto ? 'blur' : id, photo: nextPhoto };
    const saved = callBackgroundRef.current!.id;
    setCallBackgroundState(saved);
    saveCallBackground(saved);
    const media = mediaRef.current;
    if (media && !media.closed && media.video) void applyEffects(media);
  }, [applyEffects]);
  const setCallFaceFilter = useCallback((id: FaceFilterId) => {
    callFaceFilterRef.current = id;
    setCallFaceFilterState(id);
    saveCallFaceFilter(id);
    const media = mediaRef.current;
    if (media && !media.closed && media.video) void applyEffects(media);
  }, [applyEffects]);
  const toggleMute = useCallback(() => {
    const media = mediaRef.current;
    // Muted by a moderator: the mic stays off until one of them unmutes you.
    if (modMutedRef.current) {
      toast(_copy('calls.mutedByMod', { defaultValue: 'A moderator muted you' }), {
        description: _copy('calls.mutedByModHint', { defaultValue: 'You can talk again once a moderator unmutes you.' }),
      });
      return;
    }
    if (!currentCallRef.current) return;
    const muted = !mutedRef.current;
    setIsMuted(muted);
    if (media?.audioReady) {
      void media.audio.setMuted(muted).catch((error: unknown) => {
        if (mediaRef.current !== media || mutedRef.current !== muted || modMutedRef.current) return;
        setIsMuted(!muted);
        console.warn('Could not change call microphone state', error);
      });
    }
  }, [_copy, setIsMuted]);
  const setPlaybackDevice = useCallback(async (deviceId: string) => {
    const generation = generationRef.current;
    if (!currentCallRef.current || currentCallRef.current.group_id) return false;
    const track = mediaRef.current?.remoteAudio;
    try {
      if (track) await track.setPlaybackDevice(deviceId || 'default');
    } catch {
      return false;
    }
    if (generation !== generationRef.current) return false;
    playbackDeviceRef.current = deviceId;
    setPlaybackDeviceState(deviceId);
    return true;
  }, []);
  /** A moderator mutes, unmutes or removes someone in this group call. */
  const moderateGroupMember = useCallback(async (wallet: string, action: CallModAction) => {
    const media = mediaRef.current;
    const groupId = currentCallRef.current?.group_id;
    if (!media || !groupId) return false;
    try {
      await moderateCall(groupId, wallet.toLowerCase(), action);
    } catch (error) {
      toast.error((error instanceof Error && error.message) || _copy('calls.modFailed', { defaultValue: "Couldn't do that. Try again." }));
      return false;
    }
    // Tell everyone in the room to read the list again.
    try { void media.presence?.channel.send({ type: 'broadcast', event: 'mod', payload: { target: wallet.toLowerCase(), action } }); } catch { /* channel gone */ }
    refreshModeration(media, groupId);
    return true;
  }, [_copy, refreshModeration]);
  const toggleCamera = useCallback(() => {
    const media = mediaRef.current;
    const video = media?.video;
    if (!media || media.closed || !video) return;
    const on = !(media.camOn ?? true);
    // A group call with every camera slot taken: say why instead of doing nothing.
    if (on && media.announce && camerasFullRef.current) {
      toast(_copy('calls.camerasFull', { defaultValue: 'Cameras full' }), {
        description: _copy('calls.camerasFullHint', { defaultValue: 'You can turn yours on when someone turns theirs off.' }),
      });
      return;
    }
    media.camOn = on;
    setIsCameraOff(!on);
    void video.setMuted(!on);
    media.announce?.();
  }, [_copy]);
  const switchCamera = useCallback(async () => {
    const media = mediaRef.current;
    const video = media?.video;
    if (!media || !video) return;
    try {
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'videoinput');
      if (mediaRef.current?.video !== video || devices.length < 2) return;
      // With a background on, the track is sending the effect's canvas: hand
      // the camera back first, flip it, then put the effect on the new one.
      await media.fxQueue;
      const fx = media.fx;
      if (fx) {
        media.fx = null;
        try { await video.replaceTrack(fx.raw, false); } catch {}
        fx.face?.stop();
        fx.bg?.stop();
      }
      const label = fx?.raw.label ?? video.getTrackLabel?.() ?? '';
      await video.setDevice((devices.find(device => device.label !== label) ?? devices[0]).deviceId);
      if (fx && !media.closed) void applyEffects(media);
    } catch (error) { console.warn('Camera switch failed', error); }
  }, [applyEffects]);
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
  const readGroupLevels = useCallback((): Map<number, number> => {
    const levels = new Map<number, number>();
    const media = mediaRef.current;
    if (!media || media.closed) return levels;
    try { if (media.audio && !media.audio.muted && media.audio.enabled !== false) levels.set(0, Number(media.audio.getVolumeLevel?.()) || 0); } catch { /* track gone */ }
    for (const [uid, remote] of media.remotes) {
      try { if (remote.audio) levels.set(uid, Number(remote.audio.getVolumeLevel?.()) || 0); } catch { /* track gone */ }
    }
    return levels;
  }, []);
  const getMicStream = useCallback((): MediaStream | null => {
    const track = mediaRef.current?.audio?.getMediaStreamTrack?.();
    return track ? new MediaStream([track]) : null;
  }, []);
  const setCallVolume = useCallback((volume: number) => {
    const media = mediaRef.current;
    callVolumeRef.current = volume;
    if (!media) return;
    for (const track of [media.remoteAudio, ...[...media.remotes.values()].filter(r => !r.silenced).map(r => r.audio)]) {
      try { track?.setVolume?.(volume); } catch { /* track already gone */ }
    }
  }, []);
  return useMemo(() => ({
    captionRoom, captionSpeakers, getMicStream, setCallVolume,
    isGroupCall, groupParticipants, selfSpeaking, groupCamerasFull, attachGroupVideo, readGroupLevels, startGroupCall, joinGroupCall,
    groupModeration, modMuted, moderateGroupMember,
    isRinging, callSummary, dismissCallSummary,
    isCallActive, isIncoming, currentCall, isConnecting, isMuted, isCameraOff, isUserOffline, callFailureReason,
    clearCallFailure, isMinimized, minimizeCall, maximizeCall, callStartedAt, mediaRevision, peerAddress, localVideoRef, remoteVideoRef,
    attachLocalVideo, attachRemoteVideo, remoteAudioRef, playbackDevice, setPlaybackDevice, startCall, endCall, acceptCall, rejectCall: endCall, toggleMute, toggleCamera, switchCamera,
    localVideoTrack, debugCallState, checkForCalls, setCallMessageHandler,
    callBackground, callBackgroundBusy, setCallBackground, callFaceFilter, setCallFaceFilter,
  }), [callBackground, callBackgroundBusy, setCallBackground, callFaceFilter, setCallFaceFilter, captionRoom, captionSpeakers, getMicStream, setCallVolume, isGroupCall, groupParticipants, selfSpeaking, groupCamerasFull, attachGroupVideo, readGroupLevels, startGroupCall, joinGroupCall,
    groupModeration, modMuted, moderateGroupMember,
    isRinging, callSummary, dismissCallSummary, isCallActive, isIncoming, currentCall, isConnecting, isMuted, isCameraOff, isUserOffline, callFailureReason,
    clearCallFailure, isMinimized, minimizeCall, maximizeCall, callStartedAt, mediaRevision, peerAddress, startCall, endCall, acceptCall,
    attachLocalVideo, attachRemoteVideo, playbackDevice, setPlaybackDevice, toggleMute, toggleCamera, switchCamera, debugCallState, checkForCalls, setCallMessageHandler]);
};

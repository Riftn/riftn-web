import React from 'react';
import { useTranslation } from 'react-i18next';
import { Phone, PhoneOff, RotateCcw, User, Users } from 'lucide-react';
import MicOff from '@/components/ui/cut-icons/mic-off';
import Mic from '@/components/ui/cut-icons/mic';
import Video from '@/components/ui/cut-icons/video';
import VideoOff from '@/components/ui/cut-icons/video-off';
import { useCall } from '@/contexts/CallContext';
import { useAuth } from '@/contexts/AuthContext';
import type { GroupParticipant } from '@/hooks/use-call';
import { PUBLIC_CHAT_CALL_ID } from '@/lib/group-call';
import { CallDuration } from './CallDuration';
import {
  CallStage,
  CallIdentity,
  CallControl,
  CallDock,
  CallPill,
  peerInitial,
  usePeerIdentity,
} from './CallChrome';
import { CallCaptionsControl, CallCaptionsOverlay } from './CallCaptions';
import { CallBackgroundPanel, CallFxButton, useCallBackgroundAvailable } from './CallBackgroundPicker';

/**
 * A group call, voice or video, on the same stage as a direct call.
 *
 * Before anyone else is in the room it is the familiar ringing screen with the
 * group's name. Once somebody joins it becomes a grid: one tile per person,
 * their camera when it is on and their picture when it is not, outlined while
 * they talk. Leaving is the one solid control; the call carries on for
 * whoever is still in it.
 */
const GroupCallModal: React.FC = () => {
  const {
    isCallActive,
    isIncoming,
    isRinging,
    currentCall,
    peerAddress,
    isConnecting,
    isMuted,
    isCameraOff,
    selfSpeaking,
    groupParticipants,
    attachLocalVideo,
    attachGroupVideo,
    endCall,
    acceptCall,
    rejectCall,
    toggleMute,
    toggleCamera,
    switchCamera,
    isMinimized,
    minimizeCall,
    callBackground,
    callBackgroundBusy,
    setCallBackground,
    callFaceFilter,
    setCallFaceFilter,
  } = useCall();
  const fxAvailable = useCallBackgroundAvailable();
  const [fxOpen, setFxOpen] = React.useState(false);
  const { walletAddress } = useAuth();
  const { t } = useTranslation();
  const caller = usePeerIdentity(isIncoming ? peerAddress : '');
  const self = usePeerIdentity(walletAddress ?? '');

  if (!currentCall?.group_id || isMinimized || !(isCallActive || isIncoming || isConnecting)) return null;

  const isVideo = currentCall.call_type === 'video';
  const groupName = currentCall.group_name || t('calls.group', 'Group');
  const kindLabel = isVideo ? t('calls.groupVideoCall', 'Group video call') : t('calls.groupVoiceCall', 'Group voice call');
  const stagePeer = { name: groupName, avatarUrl: isIncoming ? caller.avatarUrl : self.avatarUrl };

  if (!isCallActive) {
    const status = isIncoming
      ? t('calls.isCalling', { name: caller.name, defaultValue: '{{name}} is calling' })
      : isRinging
        ? currentCall.group_id === PUBLIC_CHAT_CALL_ID
          ? t('calls.waitingForPeople', 'Waiting for people to join...')
          : t('calls.callingGroup', 'Ringing the group...')
        : t('calls.connecting');
    return (
      <CallStage peer={stagePeer} onMinimize={isIncoming ? undefined : minimizeCall} minimizeLabel={t('calls.minimize')}>
        <CallIdentity kindIcon={isVideo ? Video : Users} kindLabel={kindLabel} peer={stagePeer} status={status} ringing={isIncoming || isRinging} />
        <div className="call-stage__foot">
          {isIncoming ? (
            <div className="call-row">
              <CallPill icon={PhoneOff} label={t('calls.decline')} onClick={rejectCall} />
              <CallPill icon={isVideo ? Video : Phone} label={t('calls.accept')} onClick={acceptCall} solid />
            </div>
          ) : (
            <CallDock>
              <CallControl
                icon={isMuted ? MicOff : Mic}
                label={isMuted ? t('calls.unmute') : t('calls.mute')}
                onClick={toggleMute}
                active={isMuted}
              />
              <CallControl icon={PhoneOff} label={t('common.cancel', 'Cancel')} onClick={endCall} primary />
            </CallDock>
          )}
        </div>
      </CallStage>
    );
  }

  const count = groupParticipants.length + 1;
  return (
    <CallStage peer={stagePeer} video={isVideo} onMinimize={minimizeCall} minimizeLabel={t('calls.minimize')}>
      <div className="call-stage__top">
        <div className="call-stage__chip">
          <span>{groupName}</span>
          <span><CallDuration fallback={t('calls.connected')} /></span>
        </div>
      </div>
      {isVideo && fxAvailable ? (
        <CallFxButton open={fxOpen} onToggle={() => setFxOpen(open => !open)} active={callBackground !== 'none' || callFaceFilter !== 'none'} />
      ) : null}

      <div className="group-call-grid" data-count={Math.min(count, 9)} data-video={isVideo ? 'true' : 'false'}>
        <div className="group-call-tile" data-speaking={selfSpeaking && !isMuted ? 'true' : 'false'}>
          {isVideo && !isCameraOff ? <div ref={attachLocalVideo} className="group-call-tile__video group-call-tile__video--self" /> : (
            <TileFace name={self.name} avatarUrl={self.avatarUrl} />
          )}
          <span className="group-call-tile__name">
            {isMuted ? <MicOff className="h-3 w-3" /> : null}
            <span>{t('calls.you', 'You')}</span>
          </span>
        </div>
        {groupParticipants.map(participant => (
          <GroupTile key={participant.uid} participant={participant} attach={attachGroupVideo(participant.uid)} />
        ))}
      </div>

      <div className="call-stage__foot">
        <CallCaptionsOverlay />
        {isVideo && fxAvailable && fxOpen ? (
          <CallBackgroundPanel value={callBackground} busy={callBackgroundBusy} onPick={setCallBackground} onClose={() => setFxOpen(false)} faceFilter={callFaceFilter} onPickFace={setCallFaceFilter} />
        ) : null}
        <CallDock crowded={isVideo}>
          <CallControl
            icon={isMuted ? MicOff : Mic}
            label={isMuted ? t('calls.unmute') : t('calls.mute')}
            onClick={toggleMute}
            active={isMuted}
          />
          {isVideo ? (
            <>
              <CallControl icon={isCameraOff ? VideoOff : Video} label={t('calls.camera')} onClick={toggleCamera} active={isCameraOff} />
              <CallControl icon={RotateCcw} label={t('calls.flip')} onClick={switchCamera} />
            </>
          ) : null}
          <CallCaptionsControl />
          <CallControl icon={PhoneOff} label={t('calls.leave', 'Leave')} onClick={endCall} primary />
        </CallDock>
      </div>
    </CallStage>
  );
};

function TileFace({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  return (
    <div className="group-call-tile__face">
      {/* A bare wallet (no profile yet) gets a person, not the "0" of "0x". */}
      {avatarUrl ? <img src={avatarUrl} alt="" /> : <span>{name.startsWith('0x') ? <User className="h-1/2 w-1/2" /> : peerInitial(name)}</span>}
    </div>
  );
}

function GroupTile({ participant, attach }: { participant: GroupParticipant; attach: (node: HTMLDivElement | null) => void }) {
  const peer = usePeerIdentity(participant.wallet ?? '');
  return (
    <div className="group-call-tile" data-speaking={participant.speaking ? 'true' : 'false'}>
      {participant.video ? <div ref={attach} className="group-call-tile__video" /> : <TileFace name={peer.name} avatarUrl={peer.avatarUrl} />}
      <span className="group-call-tile__name">
        {!participant.audio ? <MicOff className="h-3 w-3" /> : null}
        <span>{participant.wallet ? peer.name : '…'}</span>
      </span>
    </div>
  );
}

export default GroupCallModal;

import React from 'react';
import { CallDuration } from './CallDuration';
import { PhoneOff, RotateCcw, MessageCircle } from 'lucide-react';
import MicOff from '@/components/ui/cut-icons/mic-off';
import Video from '@/components/ui/cut-icons/video';
import VideoOff from '@/components/ui/cut-icons/video-off';
import Mic from '@/components/ui/cut-icons/mic';
import { useTranslation } from 'react-i18next';
import { useCall } from '@/contexts/CallContext';
import { useAuth } from '@/contexts/AuthContext';
import { openDmDock } from '@/hooks/use-dm-dock';
import {
  CallStage,
  CallIdentity,
  CallControl,
  CallDock,
  CallPill,
  usePeerIdentity,
} from './CallChrome';

const VideoCallModal: React.FC = () => {
  const { walletAddress } = useAuth();
  const {
    isCallActive,
    isIncoming,
    isRinging,
    currentCall,
    peerAddress,
    isConnecting,
    isMuted,
    isCameraOff,
    attachLocalVideo,
    attachRemoteVideo,
    endCall,
    acceptCall,
    rejectCall,
    toggleMute,
    toggleCamera,
    switchCamera,
    isMinimized,
    minimizeCall,
  } = useCall();

  const { t } = useTranslation();

  const peer = usePeerIdentity(peerAddress);

  if (!walletAddress) return null;

  const isVisible = (isCallActive || isIncoming || isConnecting) && currentCall?.call_type === 'video';

  if (!isVisible || !currentCall || isMinimized) {
    return null;
  }

  const statusText = isIncoming
    ? t('calls.incoming')
    : isRinging
      ? t('calls.calling')
      : isConnecting
        ? t('calls.connecting')
        : <CallDuration fallback={t('calls.connected')} />;

  const messageInstead = () => {
    const username = peer.name.startsWith('@') ? peer.name.slice(1) : undefined;
    endCall();
    openDmDock({ address: peerAddress, username, avatarUrl: peer.avatarUrl ?? undefined });
  };

  return (
    <CallStage
      peer={peer}
      video
      live={isCallActive}
      remote={<div ref={attachRemoteVideo} />}
      onMinimize={isIncoming ? undefined : minimizeCall}
      minimizeLabel={t('calls.minimize')}
    >
      {isCallActive ? (
        // Name and length ride over the remote video once it is up.
        <div className="call-stage__top">
          <div className="call-stage__chip">
            <span>{peer.name}</span>
            <span>{statusText}</span>
          </div>
        </div>
      ) : (
        <CallIdentity
          kindIcon={Video}
          kindLabel={t('calls.videoCall')}
          peer={peer}
          status={statusText}
          ringing={isIncoming || isRinging}
        />
      )}

      {/* Your own camera. Hidden on an incoming call until you accept: there is no track yet. */}
      {!isIncoming && (
        <div className="call-stage__self">
          <div ref={attachLocalVideo} className={isCameraOff ? 'hidden' : undefined} />
          {isCameraOff && (
            <div className="call-stage__self-off">
              <VideoOff className="h-5 w-5" />
            </div>
          )}
        </div>
      )}

      <div className="call-stage__foot">
        {isIncoming ? (
          <div className="call-row">
            <CallPill icon={PhoneOff} label={t('calls.decline')} onClick={rejectCall} />
            <CallPill icon={Video} label={t('calls.accept')} onClick={acceptCall} solid />
          </div>
        ) : (
          <>
            {isRinging ? <CallPill icon={MessageCircle} label={t('messages.message')} onClick={messageInstead} quiet /> : null}
            <CallDock>
              <CallControl
                icon={isMuted ? MicOff : Mic}
                label={isMuted ? t('calls.unmute') : t('calls.mute')}
                onClick={toggleMute}
                active={isMuted}
              />
              <CallControl
                icon={isCameraOff ? VideoOff : Video}
                label={t('calls.camera')}
                onClick={toggleCamera}
                active={isCameraOff}
              />
              <CallControl icon={RotateCcw} label={t('calls.flip')} onClick={switchCamera} />
              <CallControl icon={PhoneOff} label={isCallActive ? t('calls.end') : t('common.cancel', 'Cancel')} onClick={endCall} primary />
            </CallDock>
          </>
        )}
      </div>
    </CallStage>
  );
};

export default VideoCallModal;

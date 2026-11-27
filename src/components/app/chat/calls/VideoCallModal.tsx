import React from 'react';
import { CallDuration } from './CallDuration';
import { PhoneOff, RotateCcw } from 'lucide-react';
import ChatIcon from '@/components/ui/cut-icons/chat';
import MicOff from '@/components/ui/cut-icons/mic-off';
import Video from '@/components/ui/cut-icons/video';
import VideoOff from '@/components/ui/cut-icons/video-off';
import Mic from '@/components/ui/cut-icons/mic';
import { useTranslation } from 'react-i18next';
import { useCall } from '@/contexts/CallContext';
import { useAuth } from '@/contexts/AuthContext';
import { useMessageCallPeer } from './useMessageCallPeer';
import {
  CallStage,
  CallIdentity,
  CallControl,
  CallDock,
  CallPill,
  usePeerIdentity,
} from './CallChrome';
import { CallPlaybackControl } from './CallPlaybackControl';
import { CallCaptionsControl, CallCaptionsOverlay } from './CallCaptions';
import { CallBackgroundPanel, CallFxButton, useCallBackgroundAvailable } from './CallBackgroundPicker';

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
    callBackground,
    callBackgroundBusy,
    setCallBackground,
    callFaceFilter,
    setCallFaceFilter,
  } = useCall();

  const { t } = useTranslation();
  const messageCallPeer = useMessageCallPeer();
  const fxAvailable = useCallBackgroundAvailable();
  const [fxOpen, setFxOpen] = React.useState(false);

  const peer = usePeerIdentity(isIncoming ? currentCall?.caller_address || peerAddress : peerAddress);

  if (!walletAddress) return null;

  const isVisible = (isCallActive || isIncoming || isConnecting) && currentCall?.call_type === 'video';

  if (!isVisible || !currentCall || isMinimized) {
    return null;
  }

  const statusText = isRinging
    ? t('calls.calling')
    : isConnecting
      ? t('calls.connecting')
      : <CallDuration fallback="00:00" />;

  const openMessages = () => {
    if (isRinging) endCall();
    else minimizeCall();
    messageCallPeer(peerAddress, peer);
  };

  const selfPreview = !isIncoming ? (
    <div className="call-stage__self">
      <div ref={attachLocalVideo} className={isCameraOff ? 'hidden' : undefined} />
      {isCameraOff ? <div className="call-stage__self-off"><VideoOff className="h-5 w-5" /></div> : null}
    </div>
  ) : null;

  return (
    <CallStage
      peer={peer}
      video
      direct
      onMessage={isCallActive ? openMessages : undefined}
      messageLabel={t('messages.message')}
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
          kindLabel={t(isIncoming ? 'calls.incoming' : 'calls.videoCall')}
          peer={peer}
          status={isIncoming ? undefined : statusText}
          ringing={isIncoming || isRinging}
          announceStatus={!isCallActive}
        />
      )}

      {!isIncoming && fxAvailable ? (
        <CallFxButton open={fxOpen} onToggle={() => setFxOpen(open => !open)} active={callBackground !== 'none' || callFaceFilter !== 'none'} />
      ) : null}

      {!isCallActive ? selfPreview : null}
      <div className="call-stage__foot">
        {isCallActive ? selfPreview : null}
        {isCallActive ? <CallCaptionsOverlay /> : null}
        {fxOpen && !isIncoming && fxAvailable ? (
          <CallBackgroundPanel value={callBackground} busy={callBackgroundBusy} onPick={setCallBackground} onClose={() => setFxOpen(false)} faceFilter={callFaceFilter} onPickFace={setCallFaceFilter} />
        ) : null}
        {isRinging ? <CallPill icon={ChatIcon} label={t('messages.message')} onClick={openMessages} quiet /> : null}
        <CallDock crowded={!isIncoming}>
          <CallPlaybackControl />
          <CallControl
            icon={isMuted ? MicOff : Mic}
            label={isMuted ? t('calls.unmute') : t('calls.mute')}
            onClick={toggleMute}
            active={isMuted}
          />
          {!isIncoming ? (
            <>
              <CallControl
                icon={isCameraOff ? VideoOff : Video}
                label={t('calls.camera')}
                onClick={toggleCamera}
                active={isCameraOff}
              />
              <CallControl icon={RotateCcw} label={t('calls.flip')} onClick={switchCamera} />
            </>
          ) : null}
          {isCallActive ? <CallCaptionsControl /> : null}
        </CallDock>
        {isIncoming ? (
          <div className="call-row call-row--ringing">
            <CallControl icon={PhoneOff} label={t('calls.decline')} onClick={rejectCall} />
            <CallControl icon={Video} label={t('calls.accept')} onClick={acceptCall} primary />
          </div>
        ) : (
          <CallControl icon={PhoneOff} label={isCallActive ? t('calls.end') : t('common.cancel', 'Cancel')} onClick={endCall} primary />
        )}
      </div>
    </CallStage>
  );
};

export default VideoCallModal;

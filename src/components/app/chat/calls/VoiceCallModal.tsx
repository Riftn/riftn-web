import React, { useState } from 'react';
import { CallDuration } from './CallDuration';
import { Phone, PhoneOff } from 'lucide-react';
import ChatIcon from '@/components/ui/cut-icons/chat';
import MicOff from '@/components/ui/cut-icons/mic-off';
import Volume2 from '@/components/ui/cut-icons/volume';
import Mic from '@/components/ui/cut-icons/mic';
import { useTranslation } from 'react-i18next';
import { useCall } from '@/contexts/CallContext';
import { useMessageCallPeer } from './useMessageCallPeer';
import {
  CallStage,
  CallIdentity,
  CallControl,
  CallDock,
  CallPill,
  CallWave,
  usePeerIdentity,
} from './CallChrome';
import { CallCaptionsControl, CallCaptionsOverlay } from './CallCaptions';

const VoiceCallModal: React.FC = () => {
  const {
    isCallActive,
    isIncoming,
    isRinging,
    currentCall,
    peerAddress,
    isConnecting,
    isMuted,
    remoteAudioRef,
    endCall,
    acceptCall,
    rejectCall,
    toggleMute,
    isMinimized,
    minimizeCall,
  } = useCall();

  const { t } = useTranslation();
  const messageCallPeer = useMessageCallPeer();
  const [audioNeedsInteraction, setAudioNeedsInteraction] = useState(false);

  const peer = usePeerIdentity(isIncoming ? currentCall?.caller_address || peerAddress : peerAddress);

  const handleUserInteraction = async () => {
    if (remoteAudioRef?.current && isCallActive) {
      try {
        await remoteAudioRef.current.play();
        setAudioNeedsInteraction(false);
      } catch {
        setAudioNeedsInteraction(true);
      }
    }
  };

  const isVisible = isCallActive || isIncoming || isConnecting;

  if (!isVisible || !currentCall || currentCall.call_type !== 'audio' || isMinimized) {
    return null;
  }

  const statusText = isIncoming
    ? t('calls.incoming')
    : isRinging
      ? t('calls.calling')
      : isConnecting
        ? t('calls.connecting')
        : <CallDuration fallback="00:00" />;

  const openMessages = () => {
    if (isRinging) endCall();
    else minimizeCall();
    messageCallPeer(peerAddress, peer);
  };

  return (
    <CallStage
      peer={peer}
      direct
      onMinimize={isIncoming ? undefined : minimizeCall}
      minimizeLabel={t('calls.minimize')}
      onMessage={isCallActive ? openMessages : undefined}
      messageLabel={t('messages.message')}
    >
      <audio
        ref={remoteAudioRef}
        autoPlay
        playsInline
        className="hidden"
        onPlay={() => setAudioNeedsInteraction(false)}
        onAbort={() => setAudioNeedsInteraction(true)}
      />

      <div onClick={handleUserInteraction}>
        <CallIdentity
          kindIcon={Phone}
          kindLabel={t('calls.voiceCall')}
          peer={peer}
          status={statusText}
          ringing={isIncoming || isRinging}
          announceStatus={!isCallActive}
        >
          {isCallActive ? <CallWave paused={isMuted} /> : null}
        </CallIdentity>
      </div>

      <div className="call-stage__foot">
        {isCallActive ? <CallCaptionsOverlay /> : null}
        {audioNeedsInteraction && (
          <button type="button" className="call-stage__hint" onClick={handleUserInteraction}>
            <Volume2 className="h-4 w-4" />
            <span>{t('calls.tapToEnableAudio')}</span>
          </button>
        )}
        {isIncoming ? (
          <div className="call-row call-row--ringing">
            <CallControl icon={PhoneOff} label={t('calls.decline')} onClick={rejectCall} />
            <CallControl
              icon={Phone}
              label={t('calls.accept')}
              onClick={() => {
                acceptCall();
                handleUserInteraction();
              }}
              primary
            />
          </div>
        ) : (
          <>
            {isRinging ? <CallPill icon={ChatIcon} label={t('messages.message')} onClick={openMessages} quiet /> : null}
            {isCallActive ? <CallDock>
              <CallControl
                icon={isMuted ? MicOff : Mic}
                label={isMuted ? t('calls.unmute') : t('calls.mute')}
                onClick={() => {
                  toggleMute();
                  handleUserInteraction();
                }}
                active={isMuted}
              />
              <CallCaptionsControl />
            </CallDock> : null}
            <CallControl icon={PhoneOff} label={isCallActive ? t('calls.end') : t('common.cancel', 'Cancel')} onClick={endCall} primary />
          </>
        )}
      </div>
    </CallStage>
  );
};

export default VoiceCallModal;

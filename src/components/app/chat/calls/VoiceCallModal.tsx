import React, { useState } from 'react';
import { CallDuration } from './CallDuration';
import { Phone, PhoneOff, MessageCircle } from 'lucide-react';
import MicOff from '@/components/ui/cut-icons/mic-off';
import Volume2 from '@/components/ui/cut-icons/volume';
import Mic from '@/components/ui/cut-icons/mic';
import { useTranslation } from 'react-i18next';
import { useCall } from '@/contexts/CallContext';
import { openDmDock } from '@/hooks/use-dm-dock';
import {
  CallStage,
  CallIdentity,
  CallControl,
  CallDock,
  CallPill,
  CallWave,
  usePeerIdentity,
} from './CallChrome';

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
  const [audioNeedsInteraction, setAudioNeedsInteraction] = useState(false);

  const peer = usePeerIdentity(peerAddress);

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
        : <CallDuration fallback={t('calls.connected')} />;

  const messageInstead = () => {
    const username = peer.name.startsWith('@') ? peer.name.slice(1) : undefined;
    endCall();
    openDmDock({ address: peerAddress, username, avatarUrl: peer.avatarUrl ?? undefined });
  };

  return (
    <CallStage peer={peer} onMinimize={isIncoming ? undefined : minimizeCall} minimizeLabel={t('calls.minimize')}>
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
        >
          {isCallActive ? <CallWave paused={isMuted} /> : null}
        </CallIdentity>
      </div>

      <div className="call-stage__foot">
        {audioNeedsInteraction && (
          <button type="button" className="call-stage__hint" onClick={handleUserInteraction}>
            <Volume2 className="h-4 w-4" />
            <span>{t('calls.tapToEnableAudio')}</span>
          </button>
        )}
        {isIncoming ? (
          <div className="call-row">
            <CallPill icon={PhoneOff} label={t('calls.decline')} onClick={rejectCall} />
            <CallPill
              icon={Phone}
              label={t('calls.accept')}
              onClick={() => {
                acceptCall();
                handleUserInteraction();
              }}
              solid
            />
          </div>
        ) : (
          <>
            {isRinging ? <CallPill icon={MessageCircle} label={t('messages.message')} onClick={messageInstead} quiet /> : null}
            <CallDock>
              <CallControl
                icon={isMuted ? MicOff : Mic}
                label={isMuted ? t('calls.unmute') : t('calls.mute')}
                onClick={() => {
                  toggleMute();
                  handleUserInteraction();
                }}
                active={isMuted}
                disabled={!isCallActive}
              />
              <CallControl icon={PhoneOff} label={isCallActive ? t('calls.end') : t('common.cancel', 'Cancel')} onClick={endCall} primary />
            </CallDock>
          </>
        )}
      </div>
    </CallStage>
  );
};

export default VoiceCallModal;

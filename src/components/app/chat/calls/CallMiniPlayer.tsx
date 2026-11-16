/**
 * CallMiniPlayer: the call folded down to a glass pill so the app stays usable.
 * It says who is on the line and for how long, and keeps mute and hang-up one
 * tap away. A video call adds the other person's camera above the row.
 */

import { PhoneOff } from 'lucide-react';
import MicOff from '@/components/ui/cut-icons/mic-off';
import Mic from '@/components/ui/cut-icons/mic';
import { motion, useDragControls } from 'framer-motion';
import { useCall } from '@/contexts/CallContext';
import { useTranslation } from 'react-i18next';
import { CallControl, CallWave, peerInitial, usePeerIdentity } from './CallChrome';
import { CallDuration } from './CallDuration';

export function CallMiniPlayer() {
  const {
    isCallActive,
    isConnecting,
    isRinging,
    peerAddress,
    mediaRevision,
    currentCall,
    isMuted,
    isMinimized,
    toggleMute,
    endCall,
    maximizeCall,
    attachRemoteVideo,
  } = useCall();

  const dragControls = useDragControls();
  const { t } = useTranslation();
  const peer = usePeerIdentity(peerAddress);

  const isVisible = isMinimized && (isCallActive || isConnecting) && currentCall;
  if (!isVisible) return null;

  const isVideo = currentCall.call_type === 'video';
  const statusText = isRinging
    ? t('calls.calling')
    : isConnecting
      ? t('calls.connecting')
      : <CallDuration fallback={t('calls.connected')} />;

  return (
    <motion.div
      drag
      dragControls={dragControls}
      dragListener={false}
      dragMomentum={false}
      dragElastic={0}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="call-mini"
    >
      <div className="call-mini__body">
        {isVideo && isCallActive ? (
          <div className="call-mini__video" onPointerDown={(event) => dragControls.start(event)} onDoubleClick={maximizeCall}>
            {/* Keyed on the media revision so a camera that comes back is attached again. */}
            <div key={mediaRevision} ref={attachRemoteVideo} />
          </div>
        ) : null}
        <div className="call-mini__row" onPointerDown={(event) => dragControls.start(event)}>
          <button type="button" className="call-mini__who" onClick={maximizeCall} aria-label={t('calls.expand')} title={t('calls.expand')}>
            {peer.avatarUrl ? <img src={peer.avatarUrl} alt="" /> : <span>{peerInitial(peer.name)}</span>}
            <span className="min-w-0">
              <span className="call-mini__name">{peer.name}</span>
              <span className="call-mini__time">{statusText}</span>
            </span>
          </button>
          {isCallActive ? <CallWave paused={isMuted} bars={6} /> : null}
          <CallControl
            icon={isMuted ? MicOff : Mic}
            label={isMuted ? t('calls.unmute') : t('calls.mute')}
            onClick={toggleMute}
            active={isMuted}
            disabled={!isCallActive}
            compact
          />
          <CallControl icon={PhoneOff} label={t('calls.end')} onClick={endCall} primary compact />
        </div>
      </div>
    </motion.div>
  );
}

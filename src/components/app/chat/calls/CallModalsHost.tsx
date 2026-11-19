import { lazy, Suspense, useEffect } from 'react';
import { useCall } from '@/contexts/CallContext';
import { startCallTone, stopCallTone } from '@/lib/call-tones';

const VoiceCallModal = lazy(() => import('./VoiceCallModal'));
const VideoCallModal = lazy(() => import('./VideoCallModal'));
const CallEndedScreen = lazy(() => import('./CallEndedScreen'));
const CallMiniPlayer = lazy(() => import('./CallMiniPlayer').then(m => ({ default: m.CallMiniPlayer })));

/** Keep incoming coordination mounted; download call surfaces only for a call. */
export function CallModalsHost() {
  const { currentCall, isMinimized, callSummary, isIncoming, isRinging } = useCall();
  // An incoming call rings until it is answered, declined or given up on; the
  // caller hears a soft ringback while the other side rings.
  const tone = isIncoming ? 'ring' : isRinging ? 'ringback' : null;
  useEffect(() => {
    if (!tone) return;
    startCallTone(tone);
    return stopCallTone;
  }, [tone]);
  if (!currentCall) return callSummary ? <Suspense fallback={null}><CallEndedScreen /></Suspense> : null;
  return <Suspense fallback={null}>
    {isMinimized ? <CallMiniPlayer /> : currentCall.call_type === 'video' ? <VideoCallModal /> : <VoiceCallModal />}
  </Suspense>;
}

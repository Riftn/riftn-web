import { lazy, Suspense, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useCall } from '@/contexts/CallContext';
import { startCallRingtone, stopCallRingtone } from '@/lib/call-ringtone';

const VoiceCallModal = lazy(() => import('./VoiceCallModal'));
const VideoCallModal = lazy(() => import('./VideoCallModal'));
const GroupCallModal = lazy(() => import('./GroupCallModal'));
const CallEndedScreen = lazy(() => import('./CallEndedScreen'));
const CallCaptionPublisher = lazy(() => import('./CallCaptions').then(m => ({ default: m.CallCaptionPublisher })));
const CallMiniPlayer = lazy(() => import('./CallMiniPlayer').then(m => ({ default: m.CallMiniPlayer })));

/** Keep incoming coordination mounted; download call surfaces only for a call. */
export function CallModalsHost() {
  const { currentCall, isMinimized, callSummary, isIncoming, captionRoom } = useCall();
  const { t } = useTranslation();
  const incomingLine = t('calls.incoming', 'Incoming call');
  // Ring for as long as a call is waiting; answering, declining or the caller
  // giving up all clear isIncoming, which stops it.
  useEffect(() => {
    if (!isIncoming) return;
    startCallRingtone(`📞 ${incomingLine}`);
    return stopCallRingtone;
  }, [isIncoming, incomingLine]);
  if (!currentCall) return callSummary ? <Suspense fallback={null}><CallEndedScreen /></Suspense> : null;
  return <Suspense fallback={null}>
    {/* Outside the screens so minimising the call keeps subtitles going. */}
    {captionRoom ? <CallCaptionPublisher /> : null}
    {isMinimized ? <CallMiniPlayer /> : currentCall.group_id ? <GroupCallModal /> : currentCall.call_type === 'video' ? <VideoCallModal /> : <VoiceCallModal />}
  </Suspense>;
}

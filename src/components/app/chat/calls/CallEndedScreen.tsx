import React from 'react';
import { Phone, MessageCircle, X } from 'lucide-react';
import Video from '@/components/ui/cut-icons/video';
import { useTranslation } from 'react-i18next';
import { useCall } from '@/contexts/CallContext';
import { openDmDock } from '@/hooks/use-dm-dock';
import { CallStage, CallIdentity, CallPill, usePeerIdentity } from './CallChrome';

/**
 * The last word on a call: how it finished and a way back. It closes on its
 * own after a few seconds (the hook owns the timer), so nobody has to dismiss
 * a call that is already over.
 */
const CallEndedScreen: React.FC = () => {
  const { callSummary, dismissCallSummary, startCall } = useCall();
  const { t } = useTranslation();
  const peer = usePeerIdentity(callSummary?.peerAddress ?? '');

  if (!callSummary) return null;
  const { peerAddress, callType, outcome, duration } = callSummary;
  const isVideo = callType === 'video';

  const status = outcome === 'ended'
    ? `${t('calls.ended', 'Call ended')}${duration ? ` · ${duration}` : ''}`
    : outcome === 'declined'
      ? t('calls.declined', 'Call declined')
      : outcome === 'no_answer'
        ? t('calls.noAnswer', 'No answer')
        : t('calls.missed', 'Missed call');

  const message = () => {
    const username = peer.name.startsWith('@') ? peer.name.slice(1) : undefined;
    dismissCallSummary();
    openDmDock({ address: peerAddress, username, avatarUrl: peer.avatarUrl ?? undefined });
  };

  return (
    <CallStage peer={peer}>
      <button type="button" className="call-stage__min" onClick={dismissCallSummary} aria-label={t('calls.close')} title={t('calls.close')}>
        <X className="h-5 w-5" />
      </button>
      <CallIdentity
        kindIcon={isVideo ? Video : Phone}
        kindLabel={isVideo ? t('calls.videoCall') : t('calls.voiceCall')}
        peer={peer}
        status={status}
      />
      <div className="call-stage__foot">
        <div className="call-row">
          <CallPill icon={MessageCircle} label={t('messages.message')} onClick={message} />
          <CallPill icon={isVideo ? Video : Phone} label={t('calls.callBack', 'Call back')} onClick={() => { void startCall(peerAddress, callType); }} solid />
        </div>
      </div>
    </CallStage>
  );
};

export default CallEndedScreen;

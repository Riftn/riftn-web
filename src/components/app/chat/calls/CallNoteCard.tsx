import React from 'react';
import { Phone, PhoneMissed, PhoneOff } from 'lucide-react';
import Video from '@/components/ui/cut-icons/video';
import { useTranslation } from 'react-i18next';
import { useCall } from '@/contexts/CallContext';
import { callTypeLabel, describeCallNote } from '@/lib/dm-call-notice';
import '@/styles/call-stage.css';

/**
 * A call in the thread: what happened, how long it ran, and a button that
 * calls the same person back the same way. The note that a call *started* is
 * only a quiet line, since the card for how it finished follows it.
 */
export function CallNoteCard({ content, time, isOwn, peerAddress }: {
  content: string;
  time: string;
  isOwn: boolean;
  /** The other person in a one-to-one chat; no button without it. */
  peerAddress?: string;
}) {
  const { t } = useTranslation();
  const { startCall, currentCall } = useCall();
  const note = describeCallNote(content);
  const kind = callTypeLabel(note, t);

  if (note.kind === 'started') {
    return (
      <div className="flex items-center justify-center gap-1.5 text-xs text-zinc-500">
        {note.video ? <Video className="h-3 w-3" /> : <Phone className="h-3 w-3" />}
        <span>{kind} · {time}</span>
      </div>
    );
  }

  const title = note.kind === 'ended'
    ? t('calls.ended', 'Call ended')
    : note.kind === 'declined'
      ? t('calls.declined', 'Call declined')
      : isOwn ? t('calls.noAnswer', 'No answer') : t('calls.missed', 'Missed call');
  const sub = note.kind === 'ended' ? [kind, note.duration, time].filter(Boolean).join(' · ') : `${kind} · ${time}`;
  const Icon = note.kind === 'ended' ? (note.video ? Video : Phone) : note.kind === 'declined' ? PhoneOff : PhoneMissed;

  return (
    <div className="call-card" data-quiet={note.kind === 'ended' || isOwn ? 'true' : 'false'}>
      <span className="call-card__icon"><Icon className="h-4 w-4" /></span>
      <span className="call-card__text">
        <span className="call-card__title">{title}</span>
        <span className="call-card__sub">{sub}</span>
      </span>
      {peerAddress ? (
        <button type="button" className="call-card__go" disabled={!!currentCall} onClick={() => { void startCall(peerAddress, note.video ? 'video' : 'audio'); }}>
          {t('calls.callBack', 'Call back')}
        </button>
      ) : null}
    </div>
  );
}

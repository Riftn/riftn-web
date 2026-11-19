/**
 * Live subtitles and dubbed voice in calls.
 *
 * Calls reuse the stage pipeline whole: each person's browser transcribes
 * their own microphone, translates each finished sentence into the languages
 * the others are reading, and (for anyone paying to hear it) speaks it in
 * their language. The room key is the call's Agora room, which the caption
 * functions accept in place of a stage id.
 */
import { forwardRef, useEffect, useReducer, type ComponentPropsWithoutRef } from 'react';
import { useTranslation } from 'react-i18next';
import { CaptionsOff } from 'lucide-react';
import Captions from '@/components/ui/cut-icons/captions';
import { useCall } from '@/contexts/CallContext';
import { useAuth } from '@/contexts/AuthContext';
import { useStageCaptionPublisher } from '@/hooks/use-stage-captions';
import { setPrivateCaptionTopic, useShowCaptions } from '@/lib/stage-captions';
import { supabase } from '@/integrations/supabase/client';
import { ensureFreshToken } from '@/lib/api/dehub/core';
import { StageCaptionsButton, StageCaptionsOverlay } from '@/components/app/spaces/StageCaptions';
import { usePeerIdentity } from './CallChrome';

// ─── The call's private caption channel ─────────────────────────────────────

const readyRooms = new Set<string>();
const pendingRooms = new Map<string, Promise<void>>();

async function fetchPrivateTopic(room: string, wallet: string): Promise<void> {
  const dehubToken = await ensureFreshToken();
  if (!dehubToken) return;
  const { data, error } = await supabase.functions.invoke('stage-caption-token', {
    body: { spaceId: room, topicOnly: true },
    headers: { 'x-dehub-token': dehubToken, 'x-wallet-address': wallet.toLowerCase() },
  });
  if (error || typeof data?.topic !== 'string' || !data.topic) return;
  setPrivateCaptionTopic(room, data.topic);
  readyRooms.add(room);
}

/**
 * The call's room, once its private caption channel is known; null until then.
 * Subtitles stay unavailable (rather than falling back to a guessable channel)
 * if the server cannot be reached.
 */
function useCallCaptionKey(): string | null {
  const { captionRoom } = useCall();
  const { walletAddress } = useAuth();
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!captionRoom || !walletAddress || readyRooms.has(captionRoom)) return;
    let alive = true;
    let pending = pendingRooms.get(captionRoom);
    if (!pending) {
      pending = fetchPrivateTopic(captionRoom, walletAddress)
        .catch(() => { /* subtitles just stay off for this call */ })
        .finally(() => pendingRooms.delete(captionRoom));
      pendingRooms.set(captionRoom, pending);
    }
    void pending.then(() => { if (alive) refresh(); });
    return () => { alive = false; };
  }, [captionRoom, walletAddress]);
  return captionRoom && readyRooms.has(captionRoom) ? captionRoom : null;
}

/** Transcribes this side of the call while someone else reads it. Renders nothing. */
export function CallCaptionPublisher() {
  const { isMuted, getMicStream } = useCall();
  const captionRoom = useCallCaptionKey();
  const { walletAddress } = useAuth();
  const self = usePeerIdentity(walletAddress ?? '');
  const reading = useShowCaptions('call');
  useStageCaptionPublisher({
    spaceId: captionRoom,
    isSpeaker: true,
    isMuted,
    onlyWhenWatched: true,
    selfWatching: reading,
    wallet: walletAddress ?? null,
    name: self.name.replace(/^@/, ''),
    getRawStream: getMicStream,
  });
  return null;
}

/** The subtitle lines, drawn above the call's controls. */
export function CallCaptionsOverlay({ className }: { className?: string }) {
  const { captionSpeakers } = useCall();
  const captionRoom = useCallCaptionKey();
  if (!captionRoom) return null;
  return <StageCaptionsOverlay scope="call" spaceId={captionRoom} speakers={captionSpeakers} className={className ?? 'call-captions'} />;
}

type TriggerProps = ComponentPropsWithoutRef<'button'> & { show: boolean; code: string | null; label: string };

/** A round call control that opens the subtitle menu. */
const CaptionTrigger = forwardRef<HTMLButtonElement, TriggerProps>(({ show, code, label, ...props }, ref) => (
  <div className="call-ctl">
    <button
      ref={ref}
      type="button"
      className="call-btn call-btn--captions"
      data-solid={show ? 'true' : 'false'}
      data-coded={code ? 'true' : undefined}
      aria-label={label}
      {...props}
    >
      {show ? <Captions className="h-6 w-6" /> : <CaptionsOff className="h-6 w-6" />}
      {code ? <span className="call-btn__badge">{code}</span> : null}
    </button>
    <span>{label}</span>
  </div>
));
CaptionTrigger.displayName = 'CaptionTrigger';

/** Subtitles on or off, the language to read, and "hear it in" (paid). */
export function CallCaptionsControl() {
  const { t } = useTranslation();
  const { setCallVolume } = useCall();
  const captionRoom = useCallCaptionKey();
  const { walletAddress } = useAuth();
  if (!captionRoom) return null;
  return (
    <StageCaptionsButton
      scope="call"
      layerClassName="z-[130]"
      isSpeaker
      spaceId={captionRoom}
      wallet={walletAddress ?? null}
      setRoomVolume={setCallVolume}
      renderTrigger={({ show, code }) => (
        <CaptionTrigger show={show} code={code} label={t('calls.subtitles', 'Subtitles')} />
      )}
    />
  );
}

/** For the call gallery only: treat this room's private channel as known. */
export function primeCallCaptionRoom(room: string) {
  setPrivateCaptionTopic(room, `gallery-${room}`);
  readyRooms.add(room);
}

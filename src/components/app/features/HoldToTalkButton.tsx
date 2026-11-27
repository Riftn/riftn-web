import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import Mic from '@/components/ui/cut-icons/mic';
import { useVoiceSampleRecorder } from '@/hooks/use-voice-sample-recorder';
import { invokeAi, readFunctionError } from '@/lib/ai-invoke';
import { ownKeyHeaders } from '@/lib/api/dehub/own-key-headers';
import { supabase } from '@/integrations/supabase/client';
import { keepsMeaning, tidyDictationLocally } from '@/lib/dictation-tidy';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** A press shorter than this is a tap: it keeps recording until the next tap. */
const TAP_MS = 350;
const MAX_SECONDS = 120;

type Props = {
  /** Gets the tidy text once the take is written up. */
  onText: (text: string) => void;
  disabled?: boolean;
  /** Runs instead of recording, e.g. to open sign-in. Return true to stop. */
  beforeStart?: () => boolean;
};

/**
 * Hold the mic, talk, let go: the take is written up as tidy text.
 *
 * A quick tap (or Enter / Space) keeps it recording until the next tap, so it
 * also works with a mouse, a keyboard, and while the browser asks for the mic.
 */
export function HoldToTalkButton({ onText, disabled, beforeStart }: Props) {
  const { t } = useTranslation();
  const [working, setWorking] = useState(false);
  const [locked, setLocked] = useState(false);
  const mounted = useRef(false);
  const pressedAt = useRef(0);
  const holding = useRef(false);
  const live = useRef(false);
  const latest = useRef(onText);
  latest.current = onText;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const recorder = useVoiceSampleRecorder(true, async (file, seconds) => {
    live.current = false;
    setLocked(false);
    if (seconds < 1 && file.size < 2000) return;
    setWorking(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('diarize', 'false');
      form.append('tagAudioEvents', 'false');
      const { data, error } = await invokeAi<{ text?: string }>('elevenlabs-transcribe', { body: form });
      if (error) throw new Error(await readFunctionError(error, data));
      const spoken = tidyDictationLocally(data?.text ?? '');
      if (!spoken) throw new Error(t('editor.captions.noSpeech', 'No speech found in this clip.'));
      let text = spoken;
      try {
        const { data: tidy } = await supabase.functions.invoke<{ enhancedText?: string }>('enhance-text', {
          body: { text: spoken, mode: 'grammar' }, headers: ownKeyHeaders(),
        });
        const better = tidy?.enhancedText?.trim();
        if (better && keepsMeaning(spoken, better)) text = better;
      } catch { /* The spoken words are already clean enough to keep. */ }
      if (mounted.current) latest.current(text);
    } catch (error) {
      if (mounted.current) toast.error(error instanceof Error ? error.message : t('copy.ccb684944295'));
    } finally {
      if (mounted.current) setWorking(false);
    }
  }, () => {
    live.current = false;
    setLocked(false);
    toast.error(t('editor.voiceClone.noMic', 'Could not use the microphone.'));
  }, MAX_SECONDS, () => { live.current = true; });

  const begin = () => {
    if (beforeStart?.()) return false;
    void recorder.startRecording();
    return true;
  };

  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || disabled || working) return;
    event.preventDefault();
    if (recorder.recording || locked) { recorder.stopRecording(); return; }
    if (!begin()) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pressedAt.current = Date.now();
    holding.current = true;
  };
  const onPointerUp = () => {
    if (!holding.current) return;
    holding.current = false;
    // Short press, or the mic is still being allowed: keep going until a tap.
    if (Date.now() - pressedAt.current < TAP_MS || !live.current) { setLocked(true); return; }
    recorder.stopRecording();
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (event.repeat || disabled || working) return;
    if (recorder.recording || locked) { recorder.stopRecording(); return; }
    if (begin()) setLocked(true);
  };

  const recording = recorder.recording;
  const time = `${Math.floor(recorder.seconds / 60)}:${String(recorder.seconds % 60).padStart(2, '0')}`;
  const label = working
    ? t('features.voiceWorking', 'Writing it up…')
    : recording
      ? (locked ? t('features.voiceTapDone', 'Tap when done') : t('features.voiceLetGo', 'Let go to add'))
      : t('features.voiceHold', 'Hold to talk');

  return (
    <Button type="button" variant="ghost" size="sm" data-hold-to-talk data-recording={recording || undefined}
      aria-label={label} aria-pressed={recording}
      disabled={(disabled && !recording) || working}
      onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown} onContextMenu={event => event.preventDefault()}
      className={cn(
        'px-2 select-none [touch-action:none] [-webkit-touch-callout:none]',
        recording && 'bg-red-500/15 text-red-500 ring-1 ring-red-500/40 hover:bg-red-500/20 hover:text-red-500',
      )}>
      {working
        ? <Loader2 className="size-4 animate-spin" />
        : recording
          ? <span className="relative flex size-4 items-center justify-center" aria-hidden>
              <span className="absolute inline-flex size-4 rounded-full bg-red-500/40 motion-safe:animate-ping" />
              <span className="relative inline-flex size-2.5 rounded-full bg-red-500" />
            </span>
          : <Mic className="size-4" />}
      {label}
      {recording && <span className="tabular-nums opacity-80">{time}</span>}
    </Button>
  );
}

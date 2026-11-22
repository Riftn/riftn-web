import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LoaderCircle, Square } from 'lucide-react';
import { toast } from 'sonner';
import Mic from '@/components/ui/cut-icons/mic';
import { useVoiceSampleRecorder } from '@/hooks/use-voice-sample-recorder';
import { invokeAi, readFunctionError } from '@/lib/ai-invoke';

type Props = {
  setText: React.Dispatch<React.SetStateAction<string>>;
  maxChars: number;
  atLimit: boolean;
};

export function PostDictationButton({ setText, maxChars, atLimit }: Props) {
  const { t } = useTranslation();
  const [transcribing, setTranscribing] = useState(false);
  const active = useRef(false);
  const latest = useRef({ setText, maxChars });
  latest.current = { setText, maxChars };
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  const recorder = useVoiceSampleRecorder(true, async file => {
    setTranscribing(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('diarize', 'false');
      form.append('tagAudioEvents', 'false');
      const { data, error } = await invokeAi<{ text?: string }>('elevenlabs-transcribe', { body: form });
      if (error) throw new Error(await readFunctionError(error, data));
      const words = data?.text?.trim();
      if (!words) throw new Error(t('editor.captions.noSpeech'));
      if (!active.current) return;
      const current = latest.current;
      current.setText(previous => {
        if (previous.length >= current.maxChars) return previous;
        const spacer = previous && !/\s$/.test(previous) ? ' ' : '';
        return (previous + spacer + words).slice(0, current.maxChars);
      });
    } catch (error) {
      if (active.current) toast.error(error instanceof Error ? error.message : t('copy.ccb684944295'));
    } finally {
      if (active.current) setTranscribing(false);
    }
  }, () => toast.error(t('editor.voiceClone.noMic')), 120);

  const label = transcribing ? t('copy.4e9a93669648') : recorder.recording ? t('editor.voiceClone.stop') : t('stages.dictateText');
  return (
    <button type="button" data-post-dictation className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-md bg-transparent px-2 text-sm text-white disabled:opacity-50 motion-safe:transition-transform [@media(hover:hover)]:motion-safe:enabled:hover:scale-105"
      disabled={transcribing || (atLimit && !recorder.recording)} onClick={recorder.recording ? recorder.stopRecording : recorder.startRecording}
      aria-label={label} title={label} aria-pressed={recorder.recording}>
      {transcribing ? <LoaderCircle className="size-4 animate-spin" /> : recorder.recording ? <Square className="size-4" /> : <Mic className="size-4" />}
      <span className="text-xs">{recorder.recording
        ? `${Math.floor(recorder.seconds / 60)}:${String(recorder.seconds % 60).padStart(2, '0')}`
        : label}</span>
    </button>
  );
}

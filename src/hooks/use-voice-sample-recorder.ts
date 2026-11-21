import { useEffect, useRef, useState } from 'react';
import { createVoiceRecorder, voiceRecordingBlob, voiceRecordingFile } from '@/lib/voice-recording';

type Capture = { stream?: MediaStream; recorder?: MediaRecorder; timer?: ReturnType<typeof setInterval> };

export function useVoiceSampleRecorder(
  open: boolean,
  onSample: (file: File, seconds: number) => void,
  onError: () => void,
  maxSeconds = Infinity,
  onStart?: () => void,
) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const capture = useRef<Capture | null>(null);

  useEffect(() => {
    setRecording(false);
    return () => {
      const current = capture.current;
      capture.current = null;
      if (!current) return;
      clearInterval(current.timer);
      if (current.recorder?.state === 'recording') current.recorder.stop();
      current.stream?.getTracks().forEach(track => track.stop());
    };
  }, [open]);

  function stopRecording() {
    const current = capture.current;
    if (current?.recorder?.state === 'recording') current.recorder.stop();
    clearInterval(current?.timer);
  }

  async function startRecording() {
    if (!open || capture.current) return;
    const current: Capture = {};
    capture.current = current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (capture.current !== current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      current.stream = stream;
      const recorder = createVoiceRecorder(stream);
      current.recorder = recorder;
      const chunks: Blob[] = [];
      const startedAt = Date.now();
      const elapsed = () => Math.floor((Date.now() - startedAt) / 1000);
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        if (capture.current !== current) return;
        capture.current = null;
        clearInterval(current.timer);
        setRecording(false);
        onSample(voiceRecordingFile(voiceRecordingBlob(chunks, recorder.mimeType)), elapsed());
      };
      recorder.start(1000);
      setRecording(true);
      setSeconds(0);
      onStart?.();
      current.timer = setInterval(() => {
        setSeconds(elapsed());
        if (elapsed() >= maxSeconds) stopRecording();
      }, 1000);
    } catch {
      current.stream?.getTracks().forEach(track => track.stop());
      if (capture.current === current) {
        capture.current = null;
        setRecording(false);
        onError();
      }
    }
  }

  return { recording, seconds, startRecording, stopRecording };
}

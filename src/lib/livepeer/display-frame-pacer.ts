import { displaySurfaceOf, tuneDisplayTrack } from './display-capture';

type FrameProcessor = new (options: { track: MediaStreamTrack; maxBufferSize: number }) => {
  readable: ReadableStream<VideoFrame>;
};
type FrameGenerator = new (options: { kind: 'video' }) => MediaStreamTrack & {
  writable: WritableStream<VideoFrame>;
};

export interface DisplayFramePacer {
  track: MediaStreamTrack;
  syncEnabled: () => void;
  stop: () => void;
}

/** Chromium's display capturer can go quiet when a tab shows static artwork. */
export function paceDisplayFrames(
  source: MediaStreamTrack,
  onFailure: () => void,
): DisplayFramePacer | undefined {
  if (source.readyState !== 'live' || displaySurfaceOf(source) === 'unknown') return;

  const { MediaStreamTrackProcessor: Processor, MediaStreamTrackGenerator: Generator } =
    globalThis as typeof globalThis & {
      MediaStreamTrackProcessor?: FrameProcessor;
      MediaStreamTrackGenerator?: FrameGenerator;
    };
  if (!Processor || !Generator || typeof Worker !== 'function') return;

  let track: InstanceType<FrameGenerator> | undefined;
  let worker: Worker | undefined;
  try {
    track = new Generator({ kind: 'video' });
    const { readable } = new Processor({ track: source, maxBufferSize: 1 });
    const { writable } = track;
    const enabled = source.enabled && !source.muted;
    track.enabled = enabled;
    tuneDisplayTrack(track);
    worker = new Worker(new URL('./display-frame-pacer.worker.ts', import.meta.url), { type: 'module' });
    worker.postMessage({ type: 'start', readable, writable, enabled }, [readable, writable]);
  } catch {
    worker?.terminate();
    track?.stop();
    return;
  }

  const output = track;
  const frameWorker = worker;
  const syncEnabled = () => {
    const enabled = source.enabled && !source.muted && source.readyState === 'live';
    if (output.enabled === enabled) return;
    output.enabled = enabled;
    frameWorker.postMessage({ type: 'enabled', enabled });
  };
  const stop = () => {
    source.removeEventListener('mute', syncEnabled);
    source.removeEventListener('unmute', syncEnabled);
    source.removeEventListener('ended', syncEnabled);
    frameWorker.terminate();
    output.stop();
  };
  frameWorker.onerror = onFailure;
  frameWorker.onmessage = onFailure;
  source.addEventListener('mute', syncEnabled);
  source.addEventListener('unmute', syncEnabled);
  source.addEventListener('ended', syncEnabled);
  return { track: output, stop, syncEnabled };
}

const FRAME_GAP_MS = 200;
// Leave room for delivery jitter so a repeat stays behind live capture.
const REPEAT_HEADROOM_MS = 50;

type FrameMessage =
  | {
      type: 'start';
      readable: ReadableStream<VideoFrame>;
      writable: WritableStream<VideoFrame>;
      enabled: boolean;
    }
  | { type: 'enabled'; enabled: boolean };

let enabled = false;
let lastFrame: VideoFrame | undefined;

function clearFrame() {
  lastFrame?.close();
  lastFrame = undefined;
}

async function forwardFrames(readable: ReadableStream<VideoFrame>, writable: WritableStream<VideoFrame>) {
  const reader = readable.getReader();
  const writer = writable.getWriter();
  let lastSentAt = 0;
  let lastTimestamp = -Infinity;
  let lastCaptureAt = 0;
  let lastCaptureTimestamp = 0;
  let writing = false;
  let failed = false;

  function send(frame: VideoFrame) {
    writing = true;
    lastSentAt = performance.now();
    lastTimestamp = frame.timestamp;
    void writer.write(frame).catch(() => {
      failed = true;
      void reader.cancel().catch(() => undefined);
    }).finally(() => {
      frame.close();
      writing = false;
    });
  }

  const repeat = setInterval(() => {
    const now = performance.now();
    if (!lastFrame || writing || failed || now - Math.max(lastSentAt, lastCaptureAt) < FRAME_GAP_MS) return;
    const timestamp = lastCaptureTimestamp + Math.round((now - lastCaptureAt - REPEAT_HEADROOM_MS) * 1000);
    if (timestamp > lastTimestamp) send(new VideoFrame(lastFrame, { timestamp }));
  }, FRAME_GAP_MS);

  try {
    while (true) {
      const { done, value: frame } = await reader.read();
      if (done) break;
      if (!enabled || writing) {
        frame.close();
        continue;
      }
      clearFrame();
      lastFrame = frame.clone();
      lastCaptureAt = performance.now();
      lastCaptureTimestamp = frame.timestamp;
      if (frame.timestamp <= lastTimestamp) {
        // A repeat can cover a late frame. Stop repeating while capture is
        // active again and let the next frames keep their original timing.
        frame.close();
        continue;
      }
      send(frame);
    }
  } finally {
    clearInterval(repeat);
    clearFrame();
    await writer.close().catch(() => undefined);
  }
}

self.onmessage = ({ data }: MessageEvent<FrameMessage>) => {
  enabled = data.enabled;
  if (data.type === 'start') {
    // Any exit means this worker can no longer supply video to the sender.
    const reportClosed = () => self.postMessage('closed');
    void forwardFrames(data.readable, data.writable).then(reportClosed, reportClosed);
  } else if (!enabled) {
    clearFrame();
  }
};

export {};

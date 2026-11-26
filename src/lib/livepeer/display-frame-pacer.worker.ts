const FRAME_GAP_MS = 200;

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
    if (!lastFrame || writing || failed || now - lastSentAt < FRAME_GAP_MS) return;
    send(new VideoFrame(lastFrame, { timestamp: lastTimestamp + Math.round((now - lastSentAt) * 1000) }));
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
      if (frame.timestamp > lastTimestamp) {
        send(frame);
      } else {
        // A frame from the resumed capture can predate the last repeat.
        const retimed = new VideoFrame(frame, { timestamp: lastTimestamp + 1 });
        frame.close();
        send(retimed);
      }
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

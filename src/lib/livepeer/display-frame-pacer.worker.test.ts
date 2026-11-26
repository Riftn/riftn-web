import { afterEach, expect, it, vi } from 'vitest';

class TestFrame {
  readonly label: string;
  readonly timestamp: number;

  constructor(frame: { label: string }, { timestamp }: { timestamp: number }) {
    this.label = frame.label;
    this.timestamp = timestamp;
  }

  clone() {
    return new TestFrame(this, this);
  }

  close() {}
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});

it('fills a quiet interval, clears the hold when muted, and resumes with fresh video', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  const worker = { onmessage: vi.fn(), postMessage: vi.fn() };
  vi.stubGlobal('self', worker);
  vi.stubGlobal('VideoFrame', TestFrame);
  await import('./display-frame-pacer.worker');

  let source!: ReadableStreamDefaultController<TestFrame>;
  const readable = new ReadableStream<TestFrame>({ start: (controller) => { source = controller; } });
  const sent: TestFrame[] = [];
  const writable = new WritableStream<TestFrame>({ write: (frame) => { sent.push(frame); } });
  worker.onmessage({ data: { type: 'start', readable, writable, enabled: true } });
  source.enqueue(new TestFrame({ label: 'first track' }, { timestamp: 1000 }));
  await vi.advanceTimersByTimeAsync(0);
  expect(sent).toHaveLength(1);

  await vi.advanceTimersByTimeAsync(800);
  expect(sent.length).toBeGreaterThanOrEqual(3);
  expect(sent.every((frame) => frame.label === 'first track')).toBe(true);
  expect(sent[1].timestamp).toBeGreaterThan(sent[0].timestamp);

  const beforeMute = sent.length;
  worker.onmessage({ data: { type: 'enabled', enabled: false } });
  source.enqueue(new TestFrame({ label: 'muted' }, { timestamp: 1000 }));
  await vi.advanceTimersByTimeAsync(800);
  expect(sent).toHaveLength(beforeMute);

  worker.onmessage({ data: { type: 'enabled', enabled: true } });
  await vi.advanceTimersByTimeAsync(800);
  expect(sent).toHaveLength(beforeMute);
  source.enqueue(new TestFrame({ label: 'next track' }, { timestamp: 1000 }));
  await vi.advanceTimersByTimeAsync(0);
  const resumed = sent[sent.length - 1];
  expect(resumed.label).toBe('next track');
  expect(resumed.timestamp).toBeGreaterThan(sent[beforeMute - 1].timestamp);

  source.close();
  await vi.advanceTimersByTimeAsync(0);
  expect(worker.postMessage).toHaveBeenCalledWith('closed');
});

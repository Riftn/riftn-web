import { expect, it, vi } from "vitest";
import { withDuration } from "./exporter";

class Chunk {
  type: string; timestamp: number; duration: number | null; data: Uint8Array;
  constructor(init: { type: string; timestamp: number; duration?: number | null; data: Uint8Array }) {
    this.type = init.type; this.timestamp = init.timestamp; this.duration = init.duration ?? null; this.data = init.data;
  }
  get byteLength() { return this.data.byteLength; }
  copyTo(target: Uint8Array) { target.set(this.data); }
}
vi.stubGlobal("EncodedVideoChunk", Chunk);

it("fills in a frame length when Chrome's encoder leaves it empty", () => {
  const chunk = new Chunk({ type: "key", timestamp: 33_333, data: new Uint8Array([1, 2, 3]) });
  const fixed = withDuration(chunk as unknown as EncodedVideoChunk, 33_333) as unknown as Chunk;
  expect(fixed.duration).toBe(33_333);
  expect(fixed.timestamp).toBe(33_333);
  expect(fixed.type).toBe("key");
  expect(Array.from(fixed.data)).toEqual([1, 2, 3]);
});

it("keeps chunks that already carry a length", () => {
  const chunk = new Chunk({ type: "delta", timestamp: 0, duration: 40_000, data: new Uint8Array([9]) });
  expect(withDuration(chunk as unknown as EncodedVideoChunk, 33_333)).toBe(chunk);
});

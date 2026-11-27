import { describe, expect, it } from 'vitest';
import type { BinaryMetalEngine } from '@/lib/binary-metal';
// The engine is a public file so the app's WebView can load the same copy.
import * as raw from '../../../public/binary-metal/engine.js';

const engine = raw as unknown as BinaryMetalEngine;

describe('binary metal engine', () => {
  it('turns each UTF-8 byte into one bar of 8 bits', () => {
    expect(engine.bytesOf('Ri')).toEqual([
      { ch: 'R', bits: '01010010' },
      { ch: 'i', bits: '01101001' },
    ]);
    // An accented letter is two bytes, an emoji four.
    expect(engine.bytesOf('é').length).toBe(2);
    expect(engine.bytesOf('🤘').length).toBe(4);
  });

  it('writes 0 as the open low string and 1 as the first fret', () => {
    const lines = engine.tabLines('R', { tuning: 'drop-d' });
    expect(lines.map((l) => l.name)).toEqual(['e', 'B', 'G', 'D', 'A', 'D']);
    expect(lines[5].bars[0]).toBe('0-1-0-1-0-0-1-0-');
    expect(lines[0].bars[0]).toBe('----------------');
  });

  it('adds the fifth and octave with power chords', () => {
    const standard = engine.tabLines('R', { tuning: 'e-standard', power: true });
    expect(standard[4].bars[0]).toBe('2-3-2-3-2-2-3-2-');
    const dropped = engine.tabLines('R', { tuning: 'drop-d', power: true });
    expect(dropped[4].bars[0]).toBe(dropped[5].bars[0]);
  });

  it('caps the text and the tempo', () => {
    expect(Array.from(engine.clip('x'.repeat(500))).length).toBe(engine.MAX_CHARS);
    const tl = engine.timeline('ab', { bpm: 9999 });
    expect(tl.step).toBeCloseTo(60 / engine.MAX_BPM / 2);
  });

  it('finds the playing byte and bit for the playhead', () => {
    const tl = engine.timeline('ab', { style: 'thrash' });
    expect(engine.positionAt('ab', { style: 'thrash' }, 0)).toBeNull();
    expect(engine.positionAt('ab', { style: 'thrash' }, tl.lead + tl.step * 9.5)).toEqual({ byte: 1, bit: 1 });
    expect(engine.positionAt('ab', { style: 'thrash' }, tl.end + 0.1)).toBeNull();
  });

  it('names files from the text', () => {
    expect(engine.fileName('Riftn rules!', { style: 'doom' }, 'mp3')).toBe('riftn-rules-doom.mp3');
    expect(engine.fileName('🤘', {}, 'wav')).toBe('riff-thrash.wav');
  });
});

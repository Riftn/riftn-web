/**
 * Binary Metal: typed loader for the riff engine.
 *
 * The engine itself is plain JavaScript in public/binary-metal/engine.js so
 * the Riftn app can run the very same file in a hidden WebView
 * (public/binary-metal/render.html). This page side loads it on demand.
 */

export type BinaryMetalStyle = 'thrash' | 'doom' | 'blast' | 'groove';
export type BinaryMetalTuning = 'e-standard' | 'drop-d' | 'drop-c' | 'b-standard';

export interface BinaryMetalOptions {
  style: BinaryMetalStyle;
  bpm: number;
  tuning: BinaryMetalTuning;
  power: boolean;
}

export interface BinaryMetalByte { ch: string; bits: string }
export interface BinaryMetalTimeline { step: number; lead: number; bytes: number; end: number; duration: number }
export interface BinaryMetalTabLine { name: string; bars: string[] }

export interface BinaryMetalEngine {
  MAX_CHARS: number;
  MIN_BPM: number;
  MAX_BPM: number;
  STYLES: Record<BinaryMetalStyle, { label: string; bpm: number; kick: 'ones' | 'first' | 'all'; snare: number[]; hat: boolean; crashEvery: number }>;
  TUNINGS: Record<BinaryMetalTuning, { label: string; strings: string[]; low: number }>;
  clip(text: string): string;
  bytesOf(text: string): BinaryMetalByte[];
  timeline(text: string, opts: Partial<BinaryMetalOptions>): BinaryMetalTimeline;
  positionAt(text: string, opts: Partial<BinaryMetalOptions>, t: number): { byte: number; bit: number } | null;
  tabLines(text: string, opts: Partial<BinaryMetalOptions>): BinaryMetalTabLine[];
  tabText(text: string, opts: Partial<BinaryMetalOptions>): string;
  render(text: string, opts: Partial<BinaryMetalOptions>): Promise<AudioBuffer>;
  toWav(buffer: AudioBuffer): Uint8Array;
  toMp3(buffer: AudioBuffer, onProgress?: (fraction: number) => void): Promise<Uint8Array>;
  fileName(text: string, opts: Partial<BinaryMetalOptions>, ext: string): string;
}

/** Bump with any change to public/binary-metal/engine.js so browsers fetch the new copy. */
export const BINARY_METAL_ENGINE_URL = '/binary-metal/engine.js?v=1';

let engine: Promise<BinaryMetalEngine> | null = null;

export function loadBinaryMetal(): Promise<BinaryMetalEngine> {
  if (!engine) {
    // A full URL, so the dev server hands over the public file as it is
    // (a bare path gets an ?import query added and is refused).
    const url = new URL(BINARY_METAL_ENGINE_URL, window.location.origin).href;
    engine = (import(/* @vite-ignore */ url) as Promise<BinaryMetalEngine>).catch((error) => {
      engine = null;
      throw error;
    });
  }
  return engine;
}

export const formatClock = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

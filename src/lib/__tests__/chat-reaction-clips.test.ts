import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { animatedChatEmojiMs, animatedChatEmojiSrc, readEmojiClip } from '../chat-reaction-motion';

const dir = join(process.cwd(), 'public/emoji/animated/chat');
const files = readdirSync(dir).filter((f) => f.endsWith('.webp'));
const bytes = (file: string) => {
  const b = readFileSync(join(dir, file));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

describe('animated chat emoji files', () => {
  it('every hosted file reads as an animation, and the length table matches the file', () => {
    expect(files.length).toBeGreaterThan(90);
    for (const file of files) {
      const clip = readEmojiClip(bytes(file));
      expect(clip, file).not.toBeNull();
      expect(animatedChatEmojiMs(`/emoji/animated/chat/${file}`), file).toBe(clip!.ms);
    }
  });

  it('makes a copy that plays once and is otherwise the same file', () => {
    const src = new Uint8Array(bytes('1f4af.webp'));
    const { once, ms } = readEmojiClip(bytes('1f4af.webp'))!;
    expect(ms).toBe(1360);
    expect(once.length).toBe(src.length);
    const changed: number[] = [];
    once.forEach((v, i) => { if (v !== src[i]) changed.push(i); });
    // Only the loop count (two bytes in the ANIM chunk, 0 = for ever) differs.
    expect(changed.length).toBe(1);
    const anim = Buffer.from(once).indexOf('ANIM');
    expect(changed[0]).toBe(anim + 12);
    expect(once[anim + 12] | (once[anim + 13] << 8)).toBe(1);
    expect(src[anim + 12] | (src[anim + 13] << 8)).toBe(0);
  });

  it('leaves a picture that is not an animation alone', () => {
    expect(readEmojiClip(new Uint8Array(64).buffer)).toBeNull();
  });

  it('finds the file for an emoji with or without its variation mark', () => {
    expect(animatedChatEmojiSrc('💯')).toBe('/emoji/animated/chat/1f4af.webp');
    expect(animatedChatEmojiSrc('❤️')).toBe('/emoji/animated/chat/2764_fe0f.webp');
    expect(animatedChatEmojiSrc('🧿')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { describeCallNote, isDmCallNotice } from '@/lib/dm-call-notice';

describe('DM call notice classification', () => {
  it.each([
    '📞 Voice call',
    '📹 Video call',
    '📵 Missed voice call',
  ])('recognises a real call notice: %s', (content) => {
    expect(isDmCallNotice(content)).toBe(true);
  });

  it.each([
    '😂😂',
    '😀 hello',
    '🔥',
    'ordinary message',
    '',
  ])('leaves an ordinary message in its normal bubble: %s', (content) => {
    expect(isDmCallNotice(content)).toBe(false);
  });
});

describe('reading a call note back', () => {
  it.each([
    ['📞 Voice call', { kind: 'started', video: false, duration: null }],
    ['📹 Video call', { kind: 'started', video: true, duration: null }],
    ['📞 Video call ended · 04:32', { kind: 'ended', video: true, duration: '04:32' }],
    ['📞 Voice call ended · 00:07', { kind: 'ended', video: false, duration: '00:07' }],
    ['📵 Missed video call', { kind: 'missed', video: true, duration: null }],
    ['📵 Voice call declined', { kind: 'declined', video: false, duration: null }],
  ])('%s', (content, expected) => {
    expect(describeCallNote(content)).toEqual(expected);
  });
});

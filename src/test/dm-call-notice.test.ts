import { describe, expect, it } from 'vitest';
import { createInstance } from 'i18next';
import en from '@/i18n/locales/en.json';
import es from '@/i18n/locales/es.json';
import { describeCallNote, isDmCallNotice, localizeDmCallPreview } from '@/lib/dm-call-notice';

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

describe('localized ended-call previews', () => {
  it('renders the same stored voice call in the current viewer language', async () => {
    const i18n = createInstance();
    await i18n.init({
      lng: 'es',
      resources: { en: { translation: { calls: en.calls } }, es: { translation: { calls: es.calls } } },
    });
    const notice = { content: '📞 Voice call ended · 00:07' };
    expect(localizeDmCallPreview(notice, i18n.t)).toBe('📞 Llamada terminada · 00:07');
    await i18n.changeLanguage('en');
    expect(localizeDmCallPreview(notice, i18n.t)).toBe('📞 Call ended · 00:07');
  });

  it('handles legacy notices without a call emoji or duration', async () => {
    const i18n = createInstance();
    await i18n.init({ lng: 'es', resources: { es: { translation: { calls: es.calls } } } });
    expect(isDmCallNotice('Voice call ended')).toBe(true);
    expect(describeCallNote('Voice call ended')).toEqual({ kind: 'ended', video: false, duration: null });
    expect(localizeDmCallPreview({ content: 'Voice call ended' }, i18n.t)).toBe('📞 Llamada terminada');
    expect(localizeDmCallPreview({ content: '📞 Video call ended · 1:02:03' }, i18n.t))
      .toBe('📹 Llamada terminada · 1:02:03');
  });

  it('leaves ordinary, non-text and unreadable messages to the caller', () => {
    const t = createInstance().t;
    expect(localizeDmCallPreview({ content: 'The voice call ended abruptly' }, t)).toBeUndefined();
    expect(localizeDmCallPreview({ content: '📞 See you soon' }, t)).toBeUndefined();
    expect(localizeDmCallPreview({ content: 'Voice call ended', msgType: 'media' }, t)).toBeUndefined();
    expect(localizeDmCallPreview({ content: 'Voice call ended', undecryptable: true }, t)).toBeUndefined();
  });
});

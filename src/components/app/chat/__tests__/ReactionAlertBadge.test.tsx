import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReactionAlertBadge, reactionAlertLine } from '../ReactionAlertBadge';
import type { ChatReactionSummary } from '@/lib/api/dehub/chat-prefs';

const t = (_k: string, o: Record<string, unknown>) =>
  String(o.defaultValue).replace(/\{\{(\w+)\}\}/g, (_m, k) => String(o[k]));
const one: ChatReactionSummary = {
  total: 1,
  emojis: [{ emoji: '❤️', count: 1 }],
  last: { emoji: '❤️', by: '0xa', name: 'Anna', messageId: 'm', at: '2026-11-19T08:00:00.000Z' },
};

describe('reaction alerts in the Chat list', () => {
  const emojis = () => Array.from(document.querySelectorAll('[data-reaction-alert-emoji]')).map((n) => n.getAttribute('data-reaction-alert-emoji'));

  it('shows the emoji itself for one reaction, no number, no pill', () => {
    render(<ReactionAlertBadge reactions={one} />);
    const badge = document.querySelector('[data-reaction-alert]')!;
    expect(emojis()).toEqual(['❤️']);
    expect(document.querySelector('[data-reaction-alert-total]')).toBeNull();
    expect(badge.className).not.toContain('bg-white');
    expect(badge.hasAttribute('data-count-badge')).toBe(false);
  });

  it('plays the animated emoji by default', () => {
    render(<ReactionAlertBadge reactions={one} />);
    expect(document.querySelector('[data-reaction-alert-emoji] img')?.getAttribute('src')).toBe('/emoji/animated/chat/2764_fe0f.webp');
  });

  it('shows still emojis when reaction motion is Off', () => {
    localStorage.setItem('riftn.chat.reactionStyle', 'off');
    try {
      render(<ReactionAlertBadge reactions={one} />);
      expect(document.querySelector('[data-reaction-alert-emoji] img')).toBeNull();
      expect(document.querySelector('[data-reaction-alert]')!.textContent).toBe('❤️');
    } finally {
      localStorage.removeItem('riftn.chat.reactionStyle');
    }
  });

  it('stacks up to three emojis, newest first, with the total for several', () => {
    render(<ReactionAlertBadge reactions={{ ...one, total: 7, last: { ...one.last, emoji: '😂' }, emojis: [
      { emoji: '❤️', count: 3 }, { emoji: '😂', count: 2 }, { emoji: '🔥', count: 1 }, { emoji: '👍', count: 1 },
    ] }} />);
    expect(emojis()).toEqual(['😂', '❤️', '🔥']);
    expect(document.querySelector('[data-reaction-alert-total]')!.textContent).toBe('7');
  });

  it('renders nothing when none are waiting', () => {
    render(<ReactionAlertBadge reactions={null} />);
    expect(screen.queryByLabelText(/new reactions/)).toBeNull();
  });

  it('words the preview line', () => {
    expect(reactionAlertLine(t, one, { named: false })).toBe('Reacted ❤️ to your message');
    expect(reactionAlertLine(t, one, { named: true })).toBe('Anna reacted ❤️ to your message');
    expect(reactionAlertLine(t, { ...one, total: 4 }, { named: true })).toBe('❤️ × 4 on your messages');
    expect(reactionAlertLine(t, { ...one, total: 4, emojis: [{ emoji: '❤️', count: 3 }, { emoji: '😂', count: 1 }] }, { named: true }))
      .toBe('4 reactions to your messages');
  });
});

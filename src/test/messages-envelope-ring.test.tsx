import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MessagesNavGlyph } from '@/components/app/navigation/MessagesNavGlyph';
import { UnreadCountChip } from '@/components/app/chat/UnreadCountChip';
import { MESSAGE_SLIP_MAX, messagesEnvelopeMotion } from '@/lib/messages-envelope-motion';

describe('messages envelope ring', () => {
  it('stays quiet with nothing unread', () => {
    const { container } = render(<MessagesNavGlyph unread={0} />);
    expect(container.querySelector('[data-unread="true"]')).toBeNull();
    expect(screen.queryAllByTestId('messages-slip')).toHaveLength(0);
  });

  it('throws one slip per unread message, up to the cap', () => {
    for (const count of [1, 2, 7, 20]) {
      const { unmount } = render(<MessagesNavGlyph unread={count} />);
      expect(screen.getAllByTestId('messages-slip')).toHaveLength(count);
      unmount();
    }
    render(<MessagesNavGlyph unread={57} />);
    expect(screen.getAllByTestId('messages-slip')).toHaveLength(MESSAGE_SLIP_MAX);
  });

  it('rings harder and faster as unread climbs, then holds at the cap', () => {
    const one = messagesEnvelopeMotion(1);
    const ten = messagesEnvelopeMotion(10);
    const twenty = messagesEnvelopeMotion(20);
    expect(ten.swing).toBeGreaterThan(one.swing);
    expect(twenty.swing).toBeGreaterThan(ten.swing);
    expect(twenty.cycleMs).toBeLessThan(one.cycleMs);
    expect(messagesEnvelopeMotion(400).swing).toBe(twenty.swing);
  });

  it('shows the unread number squared off, capped at 99+', () => {
    const { container, rerender } = render(<UnreadCountChip count={3} />);
    expect(container.querySelector('[data-count-badge]')).toHaveTextContent('3');
    expect(container.querySelector('[data-count-badge]')?.className).not.toContain('rounded-full');
    rerender(<UnreadCountChip count={140} />);
    expect(container.querySelector('[data-count-badge]')).toHaveTextContent('99+');
    rerender(<UnreadCountChip count={0} />);
    expect(container.querySelector('[data-count-badge]')).toBeNull();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getChatCards, setChatCards } from './chat-cards';

describe('chat cards preference', () => {
  beforeEach(() => localStorage.clear());

  it('is on until switched off', () => {
    expect(getChatCards()).toBe(true);
  });

  it('remembers off under the key the app uses, and clears it when back on', () => {
    setChatCards(false);
    expect(localStorage.getItem('riftn.chat.cards')).toBe('false');
    expect(getChatCards()).toBe(false);
    setChatCards(true);
    expect(localStorage.getItem('riftn.chat.cards')).toBeNull();
    expect(getChatCards()).toBe(true);
  });

  it('tells open pages when it changes', () => {
    const heard = vi.fn();
    window.addEventListener('riftn:chat-cards', heard);
    setChatCards(false);
    window.removeEventListener('riftn:chat-cards', heard);
    expect(heard).toHaveBeenCalledTimes(1);
  });
});

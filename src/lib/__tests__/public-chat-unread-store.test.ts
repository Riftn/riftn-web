import { describe, expect, it } from 'vitest';
import { createPublicChatUnreadStore } from '../public-chat-unread-store';

const BASE = Date.parse('2026-10-07T12:00:00Z');
const message = (id: string, offset = 1, sender = '0xother') => ({
  id, createdAt: new Date(BASE + offset).toISOString(), sender,
});

function fixture() {
  const saved = new Map<string, string>();
  const storage = {
    read: (key: string) => saved.get(key),
    write: (key: string, value: string) => { saved.set(key, value); },
  };
  return { saved, storage, store: createPublicChatUnreadStore(storage) };
}

describe('public chat unread counts', () => {
  it('deduplicates history and socket events and excludes own or automated messages', () => {
    const { store } = fixture();
    expect(store.record('0xME', message('one'))).toBe(true);
    expect(store.record('0xme', message('one'))).toBe(false);
    store.record('0xme', message('own', 2, '0xME'));
    store.record('0xme', { ...message('bot'), excluded: true });
    store.record('0xme', { ...message('invalid'), createdAt: 'invalid' });
    expect(store.count('0xme')).toBe(1);
  });

  it('clears on opening chat and ignores replayed history after a reload', () => {
    const { store, storage } = fixture();
    store.record('0xme', message('old'));
    store.markRead('0xme', BASE + 10);
    expect(store.count('0xme')).toBe(0);
    const restored = createPublicChatUnreadStore(storage);
    expect(restored.record('0xme', message('old'))).toBe(false);
    expect(restored.record('0xme', message('new', 11))).toBe(true);
    expect(restored.count('0xme')).toBe(1);
  });

  it('preserves outstanding messages per account without clearing another account', () => {
    const { store, storage } = fixture();
    store.record('0xme', message('one'));
    store.record('0xsecond', message('two'));
    const restored = createPublicChatUnreadStore(storage);
    expect(restored.count('0xME')).toBe(1);
    restored.markRead('0xsecond', BASE + 20);
    expect(restored.count('0xme')).toBe(1);
    expect(restored.count('0xsecond')).toBe(0);
    expect(restored.count('')).toBe(0);
  });

  it('keeps the 99+ count bounded and acknowledges server timestamps ahead of the device', () => {
    const { store } = fixture();
    for (let n = 1; n <= 150; n++) store.record('0xme', message(String(n), n));
    expect(store.count('0xme')).toBe(100);
    store.markRead('0xme', BASE);
    expect(store.record('0xme', message('150', 150))).toBe(false);
    expect(store.count('0xme')).toBe(0);
  });

  it('updates subscribers and keeps counting when persistence is unavailable', () => {
    const store = createPublicChatUnreadStore({
      read: () => { throw new Error('disabled'); },
      write: () => { throw new Error('disabled'); },
    });
    let updates = 0;
    const unsubscribe = store.subscribe(() => { updates++; });
    store.record('0xme', message('one'));
    expect(store.count('0xme')).toBe(1);
    store.markRead('0xme', BASE + 10);
    expect(updates).toBe(2);
    unsubscribe();
    store.record('0xme', message('two', 11));
    expect(updates).toBe(2);
  });

  it('drops lines already read on another device but keeps newer ones', () => {
    const { store } = fixture();
    for (let i = 1; i <= 5; i += 1) store.record('0xme', message(`m${i}`, i));
    store.catchUp('0xme', BASE + 3);
    expect(store.count('0xme')).toBe(2);
    expect(store.record('0xme', message('m2', 2))).toBe(false);
    store.catchUp('0xme', BASE + 1);
    expect(store.count('0xme')).toBe(2);
  });

  it('drops cold-start history once when the room has no saved position', () => {
    const { store, storage } = fixture();
    for (let i = 1; i < 100; i++) store.record('0xme', message(`old${i}`, i));

    const restarted = createPublicChatUnreadStore(storage);
    expect(restarted.hasSynced('0xme')).toBe(false);
    restarted.syncReadPosition('0xme', undefined, BASE + 100);
    restarted.record('0xme', message('live', 110));
    restarted.syncReadPosition('0xME', null, BASE + 100);

    expect(restarted.hasSynced('0xme')).toBe(true);
    expect(restarted.count('0xme')).toBe(1);
    restarted.syncReadPosition('0xme', null, BASE + 200);
    expect(restarted.count('0xme')).toBe(1);
  });
  it('keeps the startup count hidden through a failed bookmark lookup', () => {
    const { store } = fixture();
    store.record('me', message('pending', 2));
    store.syncReadPosition('me', undefined, BASE);
    expect(store.hasSynced('me')).toBe(false);
    let updates = 0;
    store.subscribe(() => { updates++; });
    store.syncReadPosition('me', BASE, BASE);
    expect(store.hasSynced('me')).toBe(true);
    expect(store.count('me')).toBe(1);
    expect(updates).toBe(1);
  });

});

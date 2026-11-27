import { waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { publicPreviewRows, showPublicChatPreview } from '../../public/chat-startup-preview.js';

const text = {
  roomId: 'global',
  messageType: 'text',
  sender: { displayName: 'Riftn reader' },
  content: 'A public line',
};

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/chat?chat=public');
  document.body.innerHTML = '<div id="root"><div class="bskel-chat"></div></div>';
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ enabled: false })));
});

afterEach(() => {
  window.dispatchEvent(new Event('popstate'));
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('public chat startup preview', () => {
  it('sets the mobile viewport before evaluating the preview breakpoint', () => {
    const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');
    const viewport = html.indexOf('<meta name="viewport"');
    const breakpoint = html.indexOf("window.matchMedia('(max-width: 767px)').matches");
    expect(viewport).toBeGreaterThanOrEqual(0);
    expect(breakpoint).toBeGreaterThan(viewport);
  });

  it('keeps only guest-readable text from the global room, in reading order', () => {
    expect(publicPreviewRows({ result: { messages: [
      { ...text, content: 'Newest' },
      { ...text, roomId: 'another-room' },
      { ...text, messageType: 'media' },
      { ...text, isDeleted: true },
      { ...text, content: 'Older' },
    ] } })).toEqual([
      { sender: 'Riftn reader', content: 'Older' },
      { sender: 'Riftn reader', content: 'Newest' },
    ]);
  });

  it('renders text literally and stays in place until the real chat is ready', async () => {
    const content = '<img src=x onerror=alert(1)>';
    await showPublicChatPreview(Promise.resolve({ messages: [{ ...text, content }] }));
    const preview = document.querySelector('.public-chat-preview');
    expect(preview?.querySelector('p')?.textContent).toBe(content);
    expect(preview?.querySelector('img')).toBeNull();
    const root = document.getElementById('root')!;
    root.innerHTML = '<div data-fullscreen-chat><div id="chat-area"></div></div>';
    await Promise.resolve();
    expect(preview?.isConnected).toBe(true);

    root.querySelector('#chat-area')!.setAttribute('data-public-chat-ready', '');
    await waitFor(() => expect(preview?.isConnected).toBe(false));
  });

  it('keeps the skeleton when Kids Mode is locked or the site is in maintenance', async () => {
    localStorage.setItem('dhb_kids_mode', '1');
    const history = Promise.resolve({ messages: [text] });
    await showPublicChatPreview(history);
    expect(document.querySelector('.public-chat-preview')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();

    localStorage.clear();
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ enabled: true }));
    await showPublicChatPreview(history);
    expect(document.querySelector('.public-chat-preview')).toBeNull();
  });
});

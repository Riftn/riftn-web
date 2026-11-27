import { describe, expect, it, vi } from 'vitest';
import worker from '../../CLOUDFLARE_WORKER_SEO.js';
import { chatEmbedRoute, handleChatEmbed } from '../../server/chat-embed.js';

const base = 'https://riftn.com/chat/embed';
const env = { ASSETS: { fetch: async () => new Response('not found', { status: 404 }) } };
const ctx = { waitUntil: () => {} };

describe('chat embeds', () => {
  it('serves an isolated iframe with an exact group chat link', async () => {
    const response = await worker.fetch(new Request(`${base}/board-games`), env, ctx);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Security-Policy')).toContain('frame-ancestors *');
    expect(response.headers.get('Content-Security-Policy')).toContain('sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox');
    expect(response.headers.get('Content-Security-Policy')).not.toContain('allow-same-origin');
    expect(response.headers.get('X-Frame-Options')).toBeNull();
    expect(await response.text()).toContain('https://riftn.com/app/communities/board-games?tab=chat');
    expect(chatEmbedRoute('/chat/embed/board-games/extra')).toBeNull();
  });

  it('returns only display text for recent public lines in reading order', async () => {
    const readPublic = vi.fn().mockResolvedValue([
      { sender: { displayName: 'Riftn', address: 'internal' }, content: '<img onerror=x>', messageType: 'text' },
      { sender: { username: 'reader' }, content: 'First' },
    ]);
    const response = await handleChatEmbed(new Request(`${base}?format=json`), { slug: null }, {
      lookup: vi.fn(), rpc: vi.fn(), readPublic,
    });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull();
    expect(await response.json()).toEqual({
      title: 'Riftn Chat',
      messages: [{ author: 'reader', text: 'First' }, { author: 'Riftn', text: '<img onerror=x>' }],
    });
  });

  it.each([
    { is_private: true },
    { entry_price: 5 },
    { holder_gate_token: 'token' },
  ])('never reads chat history for a restricted group (%j)', async (restriction) => {
    const rpc = vi.fn();
    const lookup = vi.fn().mockResolvedValue({ kind: 'group', is_private: false, ...restriction });
    const response = await handleChatEmbed(
      new Request(`${base}/friends?format=json`), { slug: 'friends' }, { lookup, rpc },
    );
    expect(await response.json()).toEqual({ state: 'restricted' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('loads a public group through the existing anonymous history function', async () => {
    const lookup = vi.fn().mockResolvedValue({ id: 'room', kind: 'group', is_private: false, name: 'Friends' });
    const rpc = vi.fn().mockResolvedValue({
      messages: [{ username: 'reader', message_type: 'msg', content: 'Hello' }],
      pinned_message: { content: 'Older than the preview' },
    });
    const response = await handleChatEmbed(
      new Request(`${base}/friends?format=json`), { slug: 'friends' }, { lookup, rpc },
    );
    expect(rpc).toHaveBeenCalledWith('community_chat_page_v1', { _community_id: 'room', _limit: 20 });
    expect(await response.json()).toEqual({ title: 'Friends', messages: [{ author: 'reader', text: 'Hello' }] });
  });
});

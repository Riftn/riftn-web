import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const complete = vi.hoisted(() => vi.fn());
vi.mock('../supabase/functions/_shared/ai-chat.ts', () => ({ aiChat: complete }));
vi.mock('../supabase/functions/_shared/ai-usage.ts', () => ({ meteredCompletionFetch: vi.fn() }));

let run: typeof import('../supabase/functions/_shared/assistant-agent.ts').runAgentLoop;
const options = {
  messages: [{ role: 'user', content: 'Can I turn off the card view?' }],
  systemPrompt: 'Answer the request using the board discussion.',
  surface: 'chat' as const, userToken: null, lovableApiKey: 'fixture', model: 'fixture',
};
function reply(text: string, reason: string | null) {
  return Response.json({ choices: [{ message: { content: text }, finish_reason: reason }] });
}

beforeAll(async () => {
  vi.stubGlobal('Deno', { env: { get: () => undefined } });
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ tools: [] })));
  ({ runAgentLoop: run } = await import('../supabase/functions/_shared/assistant-agent.ts'));
});
beforeEach(() => complete.mockReset());
afterAll(() => vi.unstubAllGlobals());

describe('public board answers', () => {
  it('requests a fresh concise answer after the provider cuts a reply short', async () => {
    complete.mockResolvedValueOnce(reply('Switching to', 'length')).mockResolvedValueOnce(reply('Choose Thin line in Settings.', 'stop'));
    const result = await run({ ...options, requireCompleteReply: true });
    expect(result.text).toBe('Choose Thin line in Settings.');
    expect(complete).toHaveBeenCalledTimes(2);
    const retry = complete.mock.calls[1][0];
    expect(retry.messages).toContainEqual(options.messages[0]);
    expect(retry.messages.at(-1).content).toContain('one complete sentence');
    expect(retry.tools).toBeUndefined();
  });

  it('never returns the second partial answer as a publishable reply', async () => {
    complete.mockImplementation(async () => reply('You can choose between', 'length'));
    await expect(run({ ...options, requireCompleteReply: true })).rejects.toThrow('truncated');
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it.each(['stop', null])('preserves an answer without trailing punctuation (reason %s)', async reason => {
    complete.mockResolvedValueOnce(reply('Settings → Appearance', reason));
    expect((await run({ ...options, requireCompleteReply: true })).text).toBe('Settings → Appearance');
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('keeps the existing behavior for other chat surfaces', async () => {
    complete.mockResolvedValueOnce(reply('A short first part', 'length'));
    expect((await run(options)).text).toBe('A short first part');
    expect(complete).toHaveBeenCalledTimes(1);
  });
});

// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const hooks = vi.hoisted(() => ({
  handler: undefined as undefined | ((request: Request) => Promise<Response>),
  cache: new Map<string, any>(),
}));
vi.mock('https://deno.land/std@0.168.0/http/server.ts', () => ({
  serve: (handler: (request: Request) => Promise<Response>) => { hooks.handler = handler; },
}));
vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({ createClient: () => ({
  from: () => {
    const filters: Record<string, string> = {};
    const query = {
      select: () => query,
      eq: (key: string, value: string) => { filters[key] = value; return query; },
      maybeSingle: async () => ({ data: hooks.cache.get(`${filters.text_hash}:${filters.target_lang}`) ?? null }),
      upsert: async (row: any) => { hooks.cache.set(`${row.text_hash}:${row.target_lang}`, row); },
    };
    return query;
  },
  rpc: async () => ({ data: true }),
}) }));
vi.mock('../../supabase/functions/_shared/auth.ts', () => ({ rateLimitByIp: async () => null }));

let env: Record<string, string>;
let requests: string[];
let batches: any[][];
let pending: Promise<unknown>[];
let provider: (url: string) => Response;
let reserve: () => Response;
let vaultKey: string | null;
const translated = 'Esta es una frase para nuestra comunidad.';
const source = 'This is a sentence for our community.';
const native = (text = translated, finishReason = 'STOP') => new Response(JSON.stringify({
  modelVersion: 'gemini-fixture-version', candidates: [{ finishReason, content: { parts: [{ text }] } }],
  usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 5, thoughtsTokenCount: 2, cachedContentTokenCount: 3 },
}));
const gateway = () => new Response(JSON.stringify({ model: 'google/gemini-2.5-flash-lite',
  choices: [{ message: { content: translated } }], usage: { prompt_tokens: 21, completion_tokens: 6 },
}));
const lunaUrl = 'https://api.openai.com/v1/chat/completions';
const luna = (content = translated, finishReason = 'stop') => Response.json({
  model: 'gpt-6-luna', choices: [{ finish_reason: finishReason, message: { content } }],
  usage: { prompt_tokens: 20, completion_tokens: 5, completion_tokens_details: { reasoning_tokens: 0 } },
});
const request = (text = source, options: { targetLang?: string; public?: boolean; sourceLang?: string; purpose?: 'chat' } = {}) => new Request('https://fixture.invalid/translate-text', {
  method: 'POST', body: JSON.stringify({ text, targetLang: 'es', public: false, ...options }),
});

beforeEach(() => {
  vi.resetModules(); hooks.handler = undefined; hooks.cache.clear(); requests = []; batches = []; pending = [];
  env = { SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-key',
    GEMINI_API_KEY: 'fixture-google-key', LOVABLE_API_KEY: 'fixture-gateway-key' };
  vi.stubGlobal('Deno', { env: { get: (name: string) => env[name] } });
  vi.stubGlobal('EdgeRuntime', { waitUntil: (work: Promise<unknown>) => pending.push(work) });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  provider = url => url.includes('googleapis') ? native() : gateway();
  reserve = () => Response.json(true);
  vaultKey = null;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith('/rpc/builder_openai_key')) return Response.json(vaultKey);
    if (url.endsWith('/rpc/claim_provider_attempt')) return Response.json({ allowed: true, probe: false });
    if (url.endsWith('/rpc/finish_provider_attempt') || url.endsWith('/rpc/release_translation_work')) return new Response(null, { status: 204 });
    if (url.endsWith('/rpc/claim_translation_work')) return Response.json(true);
    if (url.endsWith('/rpc/reserve_translation_attempt')) return reserve();
    if (url.endsWith('/rpc/record_ai_provider_usage')) {
      batches.push(JSON.parse(String(init.body)).p_rows); return new Response(null, { status: 204 });
    }
    requests.push(url);
    return provider(url);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('stops the paid fallback ladder when a later reservation is denied', async () => {
  env.FAL_KEY = 'fixture-fal-key';
  let remaining = 1;
  reserve = () => Response.json(remaining-- > 0);
  provider = () => new Response(null, { status: 503 });
  await import('../../supabase/functions/translate-text/index');
  const response = await hooks.handler!(request());
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ code: 'TRANSLATION_BUDGET_EXHAUSTED' });
  expect(requests.filter(url => !url.includes('mymemory'))).toHaveLength(1);
  expect(requests.some(url => url.includes('fal.run') || url.includes('lovable.dev'))).toBe(false);
});

it('never calls a model when the reservation database is unavailable', async () => {
  env.OPENAI_API_KEY = 'fixture-openai-key';
  reserve = () => new Response(null, { status: 503 });
  await import('../../supabase/functions/translate-text/index');
  const response = await hooks.handler!(request());
  expect(await response.json()).toMatchObject({ code: 'TRANSLATION_BUDGET_UNAVAILABLE' });
  expect(requests.filter(url => !url.includes('mymemory'))).toHaveLength(0);
});

it('reserves, meters and caches Luna as the first paid provider', async () => {
  env.OPENAI_API_KEY = 'fixture-openai-key';
  provider = url => url === lunaUrl ? luna() : native();
  await import('../../supabase/functions/translate-text/index');
  expect(await (await hooks.handler!(request())).json()).toMatchObject({ translatedText: translated });
  expect(await (await hooks.handler!(request())).json()).toMatchObject({ translatedText: translated, cached: true });
  await Promise.all(pending);

  expect(requests).toEqual([lunaUrl]);
  const calls = vi.mocked(fetch).mock.calls;
  expect(calls.some(([url]) => String(url).endsWith('/rpc/builder_openai_key'))).toBe(false);
  const reserveIndex = calls.findIndex(([url]) => String(url).endsWith('/rpc/reserve_translation_attempt'));
  const lunaIndex = calls.findIndex(([url]) => url === lunaUrl);
  expect(reserveIndex).toBeGreaterThanOrEqual(0);
  expect(reserveIndex).toBeLessThan(lunaIndex);
  const init = calls[lunaIndex][1];
  expect(JSON.parse(String(init?.body))).toMatchObject({
    model: 'gpt-6-luna', reasoning_effort: 'none', max_completion_tokens: 4000,
    messages: [{ role: 'system', content: expect.stringContaining('Spanish') }, { role: 'user', content: source }],
  });
  expect(batches[0]).toEqual([expect.objectContaining({ provider: 'openai', route: 'direct',
    served_model: 'gpt-6-luna', input_tokens: 20, output_tokens: 5, usage_reported: true, outcome: 'accepted' })]);
  expect(JSON.stringify(batches)).not.toMatch(/fixture-openai-key|This is|Esta es|choices/);
  expect([...hooks.cache.values()][0].provider).toBe('openai:gpt-6-luna');
});

it('uses the existing Vault key for Luna when the Edge secret is absent', async () => {
  vaultKey = 'fixture-vault-openai-key';
  provider = url => url === lunaUrl ? luna() : native();
  await import('../../supabase/functions/translate-text/index');
  expect((await hooks.handler!(request())).status).toBe(200);
  expect((await hooks.handler!(request('A separate message for our community.'))).status).toBe(200);
  await Promise.all(pending);

  const calls = vi.mocked(fetch).mock.calls;
  const vaultCalls = calls.filter(([url]) => String(url).endsWith('/rpc/builder_openai_key'));
  expect(vaultCalls).toHaveLength(1);
  expect(requests).toEqual([lunaUrl, lunaUrl]);
  for (const [, init] of calls.filter(([url]) => url === lunaUrl)) {
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer fixture-vault-openai-key');
  }
  expect(JSON.stringify(batches)).not.toContain(vaultKey);
});

it.each([
  { result: () => new Response(null, { status: 429 }), outcome: 'http_error', reason: 'openai_http_429' },
  { result: () => luna(`${translated} @Riftn`, 'length'), outcome: 'unusable_output', reason: 'openai_unusable_output' },
  { result: () => luna(`${translated} @Other`), outcome: 'unusable_output', reason: 'openai_unusable_output' },
])('falls back to Gemini when Luna reports $reason', async ({ result, outcome, reason }) => {
  env.OPENAI_API_KEY = 'fixture-openai-key';
  provider = url => url === lunaUrl ? result() : native(`${translated} @Riftn`);
  await import('../../supabase/functions/translate-text/index');
  expect(await (await hooks.handler!(request(`${source} @Riftn`))).json()).toMatchObject({ translatedText: `${translated} @Riftn` });
  await Promise.all(pending);
  expect(requests).toEqual([lunaUrl, expect.stringContaining('googleapis')]);
  expect(batches[0]).toEqual([
    expect.objectContaining({ provider: 'openai', outcome }),
    expect.objectContaining({ provider: 'google', outcome: 'accepted', fallback_reason: reason }),
  ]);
  expect([...hooks.cache.values()][0].provider).toBe('gemini');
});

it('meters native translation and serves repeat L1/L2 hits without another provider or aggregate write', async () => {
  await import('../../supabase/functions/translate-text/index');
  expect(await (await hooks.handler!(request())).json()).toMatchObject({ translatedText: translated });
  await Promise.all(pending);
  expect(batches).toHaveLength(1);
  expect(batches[0][0]).toMatchObject({ feature: 'translate-text', provider: 'google', route: 'direct',
    served_model: 'gemini-fixture-version', input_tokens: 20, output_tokens: 7, cached_tokens: 3,
    reasoning_tokens: 2, usage_reported: true, outcome: 'accepted' });
  const count = requests.length;
  expect(await (await hooks.handler!(request())).json()).toMatchObject({ translatedText: translated, cached: true });
  vi.resetModules(); await import('../../supabase/functions/translate-text/index');
  // The mocked persistent table survives the isolate reset.
  expect(await (await hooks.handler!(request())).json()).toMatchObject({ translatedText: translated, cached: true });
  expect(requests).toHaveLength(count);
  expect(batches).toHaveLength(1);
  expect(JSON.stringify(batches)).not.toMatch(/fixture-(?:service|google|gateway)-key|This is|Esta es|candidates|parts|choices/);
});

it('leaves partial and invalid native token reports missing', async () => {
  const { completionUsage } = await import('../../supabase/functions/_shared/ai-usage');
  expect(completionUsage({ usageMetadata: { promptTokenCount: -1, candidatesTokenCount: 3 } }))
    .toMatchObject({ input: null, output: 3 });
  expect(completionUsage({ usageMetadata: { promptTokenCount: 0 } }))
    .toMatchObject({ input: 0, output: null });
});

it('counts rejected direct output and fal failure in one batch before gateway success', async () => {
  env.FAL_KEY = 'fixture-fal-key';
  provider = url => url.includes('googleapis') ? native('I cannot translate this text')
    : url.includes('fal.run') ? new Response('private provider error', { status: 403 }) : gateway();
  await import('../../supabase/functions/translate-text/index');
  expect(await (await hooks.handler!(request())).json()).toMatchObject({ translatedText: translated });
  await Promise.all(pending);
  expect(batches).toHaveLength(1);
  expect(batches[0].map(row => row.outcome)).toEqual(['unusable_output', 'http_error', 'accepted']);
  expect(batches[0][0].output_tokens).toBe(7);
  expect(batches[0][2]).toMatchObject({ route: 'gateway', fallback_reason: 'fal_http_403', input_tokens: 21 });
  expect(JSON.stringify(batches)).not.toContain('private provider error');
});

it('records free translation attempts and keeps private content away from the training tier', async () => {
  env.OPENAI_API_KEY = 'fixture-openai-key';
  env.GROQ_API_KEY = 'fixture-free-key'; env.MISTRAL_API_KEY = 'fixture-training-key';
  provider = url => url.includes('groq.com') ? new Response(JSON.stringify({ model: 'fixture-free-model',
    choices: [{ message: { content: translated } }], usage: { prompt_tokens: 9, completion_tokens: 4 },
  })) : gateway();
  await import('../../supabase/functions/translate-text/index');
  expect(await (await hooks.handler!(request())).json()).toMatchObject({ translatedText: translated });
  await Promise.all(pending);
  expect(batches[0][0]).toMatchObject({ route: 'free', input_tokens: 9, output_tokens: 4 });
  expect(requests.some(url => url.includes('mistral'))).toBe(false);
  expect(requests).not.toContain(lunaUrl);
  expect(requests.some(url => url.includes('googleapis'))).toBe(false);
});

it('keeps fallback reasons local when requests overlap and marks absent fal usage as unknown', async () => {
  const { createTranslationUsage } = await import('../../supabase/functions/translate-text/usage');
  const first = createTranslationUsage(); const second = createTranslationUsage();
  first.start('google', 'fixture', 'direct')(429, 'http_error');
  second.skip('google', 'key_unset');
  first.start('fal', 'fixture', 'direct')(200, 'accepted', { output: 'private answer' });
  second.start('lovable', 'fixture', 'gateway')(200, 'accepted', { usage: { prompt_tokens: 1, completion_tokens: 2 } });
  first.flush(); second.flush(); await Promise.all(pending);
  expect(batches[0][1]).toMatchObject({ fallback_reason: 'google_http_429', usage_reported: false });
  expect(batches[1][0]).toMatchObject({ fallback_reason: 'google_key_unset', usage_reported: true });
  expect(JSON.stringify(batches)).not.toContain('private answer');
});


const knownSource = 'We are meeting at the community centre tomorrow morning to discuss plans for the next event.';

it('reserves the translation memory for known public standard language pairs', async () => {
  provider = url => url.includes('mymemory')
    ? Response.json({ responseStatus: 200, responseData: { translatedText: translated } })
    : native();
  await import('../../supabase/functions/translate-text/index');
  const publicRequest = request(knownSource, { public: true, sourceLang: 'en' });
  expect(await (await hooks.handler!(publicRequest)).json()).toMatchObject({ translatedText: translated });
  expect(requests).toHaveLength(1);
  expect(new URL(requests[0]).searchParams.get('langpair')).toBe('en|es');

  const privateRequest = request(knownSource, { sourceLang: 'en' });
  const result = await (await hooks.handler!(privateRequest)).json();
  expect(result).toMatchObject({ translatedText: translated });
  expect(result.cached).toBeUndefined();
  expect(requests).toHaveLength(2);
  expect(requests[1]).toContain('googleapis');
});

it('uses the whole chat message and isolates conversational cache entries by visibility', async () => {
  const text = 'Yeah, right. I am definitely not holding my breath until Friday. Ni de broma.\n@ana https://example.com/plan';
  const expected = 'Sí, claro. No pienso hacerme ilusiones hasta el viernes. Ni de broma.\n@ana https://example.com/plan';
  provider = url => url.includes('mymemory')
    ? Response.json({ responseStatus: 200, responseData: { translatedText: `Vieja traducción. @ana https://example.com/plan` } })
    : native(expected);
  await import('../../supabase/functions/translate-text/index');
  const standard = await (await hooks.handler!(request(text, { public: true, sourceLang: 'en' }))).json();
  expect(standard.translatedText).toBe('Vieja traducción. @ana https://example.com/plan');

  const publicChat = () => request(text, { public: true, sourceLang: 'es', purpose: 'chat' });
  expect(await (await hooks.handler!(publicChat())).json()).toMatchObject({ translatedText: expected });
  const modelCall = vi.mocked(fetch).mock.calls.find(([url]) => String(url).includes('googleapis'));
  const payload = JSON.parse(String(modelCall?.[1]?.body));
  expect(payload.contents[0].parts[0].text).toBe(text);
  expect(payload.systemInstruction.parts[0].text).toContain('Keep questions, uncertainty and negation intact');
  expect(await (await hooks.handler!(publicChat())).json()).toMatchObject({ translatedText: expected, cached: true });

  const privateChat = await (await hooks.handler!(request(text, { purpose: 'chat' }))).json();
  expect(privateChat).toMatchObject({ translatedText: expected });
  expect(privateChat.cached).toBeUndefined();
  expect(requests.filter(url => url.includes('mymemory'))).toHaveLength(1);
  expect(requests.filter(url => url.includes('googleapis'))).toHaveLength(2);
});

it.each([
  ['short text', 'gm, wagmi', { public: true, sourceLang: 'en' }],
  ['an Arabic dialect', knownSource, { public: true, sourceLang: 'en', targetLang: 'ary' }],
  ['a long post', `${knownSource} ${'This paragraph adds the context. '.repeat(30)}`, { public: true, sourceLang: 'en' }],
  ['Traditional Chinese', '这是一段用来验证语言选项的测试文字。'.repeat(6), { public: true, sourceLang: 'zh', targetLang: 'zh-TW' }],
])('uses a whole-text model for %s', async (_label, text, options) => {
  await import('../../supabase/functions/translate-text/index');
  expect((await hooks.handler!(request(text, options))).status).toBe(200);
  expect(requests).toHaveLength(1);
  expect(requests[0]).toContain('googleapis');
  const call = vi.mocked(fetch).mock.calls.find(([url]) => String(url).includes('googleapis'));
  const payload = JSON.parse(String(call?.[1]?.body));
  expect(payload.contents[0].parts[0].text).toBe(text);
  if ((options as { targetLang?: string }).targetLang === 'zh-TW') expect(payload.systemInstruction.parts[0].text).toContain('Traditional Chinese');
});

it('ignores old segmented cache rows and replaces them after regeneration', async () => {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`v3:${knownSource}`));
  const key = `${Buffer.from(hash).toString('hex')}:es`;
  hooks.cache.set(key, { translated_text: 'Vieja traducción.', provider: 'mymemory-segments' });
  await import('../../supabase/functions/translate-text/index');
  expect(await (await hooks.handler!(request(knownSource, { public: true }))).json()).toMatchObject({ translatedText: translated });
  expect(hooks.cache.get(key)).toMatchObject({ translated_text: translated, provider: 'gemini' });
});

it('rejects truncated text and altered handles before recording provider success', async () => {
  env.GROQ_API_KEY = 'fixture-free-key';
  const tagged = `${source} @Riftn @Riftn https://example.net/post`;
  const accepted = `${translated} @Riftn @Riftn https://example.net/post`;
  provider = url => url.includes('groq.com')
    ? Response.json({ choices: [{ finish_reason: 'stop', message: { content: `${translated} @Riftn https://example.net/post` } }] })
    : url.includes('googleapis') ? native(accepted, 'MAX_TOKENS')
    : Response.json({ choices: [{ finish_reason: 'stop', message: { content: accepted } }] });
  await import('../../supabase/functions/translate-text/index');
  expect(await (await hooks.handler!(request(tagged))).json()).toMatchObject({ translatedText: accepted });
  await Promise.all(pending);
  expect(batches[0].filter(row => row.route === 'free').length).toBeGreaterThan(0);
  expect(batches[0].slice(0, -1).every(row => row.outcome === 'unusable_output')).toBe(true);
  expect(batches[0]).toContainEqual(expect.objectContaining({ provider: 'google', outcome: 'unusable_output' }));
  expect(batches[0].at(-1)).toMatchObject({ route: 'gateway', outcome: 'accepted' });
  expect([...hooks.cache.values()]).toHaveLength(1);
  expect([...hooks.cache.values()][0].translated_text).toBe(accepted);
});

it('does not cache an unconfirmed echo as a same-language translation', async () => {
  provider = () => native(source);
  await import('../../supabase/functions/translate-text/index');
  const result = await (await hooks.handler!(request())).json();
  expect(result).toMatchObject({ translatedText: source });
  expect(result.sameLanguage).toBeUndefined();
  expect(hooks.cache.size).toBe(0);
});

it('falls back when the provider returns Han text for a Spanish target', async () => {
  env.OPENAI_API_KEY = 'fixture-openai-key';
  provider = url => url === lunaUrl ? luna('数据显示情况正好相反。') : native();
  await import('../../supabase/functions/translate-text/index');
  expect(await (await hooks.handler!(request())).json()).toMatchObject({ translatedText: translated });
  expect(await (await hooks.handler!(request())).json()).toMatchObject({ translatedText: translated, cached: true });
});

it.each(['zh', 'zh_tw', 'yue', 'ja'])('accepts Han text for the %s target', async targetLang => {
  const han = '数据显示情况正好相反。';
  env.OPENAI_API_KEY = 'fixture-openai-key';
  provider = () => luna(han);
  await import('../../supabase/functions/translate-text/index');
  expect(await (await hooks.handler!(request(source, { targetLang }))).json()).toMatchObject({ translatedText: han });
});

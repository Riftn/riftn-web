/**
 * Codes the translator should be asked for under another code. `sdr` (Sadri)
 * has no script hint in the deployed language table, so the model answered
 * mostly in Arabic script; Sadri is written in Devanagari, which is what `sck`
 * asks for.
 */
const PROMPT_AS = { sdr: 'sck' };

/** Stop the run on an outage or exhausted budget; never fan a failed batch out. */
export async function requestTranslationBatch(url, key, lines, targetLang) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
    body: JSON.stringify({ text: lines.join('\n'), targetLang: PROMPT_AS[targetLang] ?? targetLang, sourceLang: 'en', public: true, purpose: 'i18n' }),
    signal: AbortSignal.timeout(180000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const code = typeof body.code === 'string' ? body.code : `HTTP_${response.status}`;
    throw new Error(`Translation fill stopped: ${code}. Retry-After: ${response.headers.get('retry-after') ?? 'unspecified'}. Resume explicitly later.`);
  }
  return response.json();
}

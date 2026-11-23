// Use the shared translation memory only for standard language pairs. Dialect
// codes can silently resolve to a different language or script upstream.
const MEMORY_LANGUAGES = new Set([
  'ar', 'de', 'en', 'es', 'fr', 'hi', 'id', 'it', 'ja', 'ko', 'nl', 'pl',
  'pt', 'ru', 'th', 'tr', 'uk', 'vi', 'zh',
]);

export function comparableLanguage(code: string): string {
  const normalized = code.toLowerCase().replace(/_/g, '-');
  if (/^zh-(?:hant|tw|hk|mo)(?:-|$)/.test(normalized)) return 'zh-tw';
  return normalized.split('-')[0];
}

export function canUseMyMemory(isPublic: boolean, text: string, source: string, target: string): boolean {
  return isPublic && source !== target && MEMORY_LANGUAGES.has(source)
    && MEMORY_LANGUAGES.has(target.toLowerCase()) && new TextEncoder().encode(text).length <= 500;
}

const PROTECTED_TEXT = /(?:https?:\/\/|www\.)[^\s<>]+|[@#$][\p{L}\p{M}\p{N}_]+(?:[.-][\p{L}\p{M}\p{N}_]+)*/giu;

export function translationProse(text: string): string {
  return text.replace(PROTECTED_TEXT, ' ');
}

// Compare the multiset to allow natural reordering while preserving the
// exact spelling and number of occurrences of each clickable token.
export function preservesProtectedText(input: string, output: string): boolean {
  const tokens = (text: string) => Array.from(text.matchAll(PROTECTED_TEXT), ([token]) =>
    token.replace(/[.,!?;:)\]}»。，！？；：）]+$/u, '')).sort();
  const expected = tokens(input);
  const actual = tokens(output);
  return expected.length === actual.length && expected.every((token, index) => token === actual[index]);
}

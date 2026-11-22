/**
 * Tidy a spoken take before it lands in a text box.
 *
 * Speech comes back punctuated, but with the "umm"s, "uh"s and stutters
 * people say out loud. `tidyDictationLocally` drops those on the device so the
 * result is clean even when the grammar pass below is unavailable.
 */

// Sounds, not words: safe to drop in any language that writes them this way.
const FILLER = /(^|[\s,.;:!?(])(?:u+m+|u+h+m*|e+r+m+|e+h+|a+h+|h+m+|m+h*m+)(?=[\s,.;:!?)]|$),?/giu;

const STUTTER = /\b(i|the|a|an|to|and|it|we|that|is|in|of|my|you|this)(?:\s+\1\b)+/gi;

export function tidyDictationLocally(raw: string): string {
  let text = raw.replace(/\s+/g, ' ').trim();
  if (!text) return '';
  text = text.replace(FILLER, '$1');
  // "the the" and "I I" from a restart. Only small English words: other
  // languages double words on purpose ("yavaş yavaş").
  text = text.replace(STUTTER, '$1');
  text = text
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([,;:])(?=[,.;:!?])/g, '')
    .replace(/^[\s,.;:]+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  // Capitalise the start of each sentence, for scripts that have cases.
  text = text.replace(/(^|[.!?]\s+)(\p{Ll})/gu, (_, lead: string, letter: string) => lead + letter.toUpperCase());
  return text;
}

/**
 * Whether a rewritten take still says what the person said. A grammar pass
 * that answers the request, translates it or drops half of it is thrown away.
 */
export function keepsMeaning(before: string, after: string): boolean {
  const a = after.trim();
  if (!a) return false;
  const ratio = a.length / Math.max(1, before.length);
  if (ratio < 0.6 || ratio > 1.5) return false;
  const words = (value: string) => new Set(value.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []);
  const said = words(before);
  if (said.size < 4) return true;
  const kept = words(a);
  let shared = 0;
  said.forEach(word => { if (kept.has(word)) shared += 1; });
  return shared / said.size >= 0.5;
}

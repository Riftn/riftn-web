import { useContext, useEffect, useMemo, useRef } from 'react';
import { SharedTranslationContext, useTranslation } from '@/components/app/TranslatableText';

/**
 * A poll's question and options in the reader's language.
 *
 * The question and every option go to the translator as one request, one per
 * line, so short options ("Evet", "Hayır") are translated with the question
 * around them instead of being too short to auto-translate on their own, and a
 * poll costs one call, not one per option. If the lines do not come back one
 * for one, the poll stays as written rather than pairing an answer with the
 * wrong option.
 *
 * Follows the post's own Translate / Show original control when the poll sits
 * inside one. Off for private polls (direct messages): those are not ours to
 * send to a translator unasked.
 */
export function usePollTranslation(
  question: string | undefined,
  options: { index: number; text: string }[] | undefined,
  enabled: boolean,
) {
  const lines = useMemo(
    () => (question || options?.length ? [question ?? '', ...(options ?? []).map(o => o.text)] : []),
    [question, options],
  );
  const joined = enabled && lines.length > 1 ? lines.map(l => l.replace(/\s+/g, ' ').trim()).join('\n') : '';
  const { isTranslated, translatedText, handleTranslate, handleShowOriginal } = useTranslation(joined, enabled, undefined, true);

  // The post's Translate / Show original control drives the poll too.
  const shared = useContext(SharedTranslationContext);
  const seenTranslate = useRef(shared?.translateSignal ?? 0);
  const seenOriginal = useRef(shared?.originalSignal ?? 0);
  useEffect(() => {
    if (!shared || !joined) return;
    if (shared.translateSignal > seenTranslate.current) {
      seenTranslate.current = shared.translateSignal;
      if (!isTranslated) void handleTranslate();
    }
  }, [shared?.translateSignal, joined]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!shared) return;
    if (shared.originalSignal > seenOriginal.current) {
      seenOriginal.current = shared.originalSignal;
      if (isTranslated) handleShowOriginal();
    }
  }, [shared?.originalSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  return useMemo(() => {
    if (!isTranslated || !translatedText) return null;
    const out = translatedText.split('\n').map(l => l.trim()).filter(Boolean);
    const expected = lines.filter(l => l.trim()).length;
    if (out.length !== expected) return null;
    let i = 0;
    const q = question?.trim() ? out[i++] : question ?? '';
    const byIndex = new Map<number, string>();
    for (const o of options ?? []) byIndex.set(o.index, o.text.trim() ? out[i++] : o.text);
    return { question: q, option: (index: number, fallback: string) => byIndex.get(index) ?? fallback };
  }, [isTranslated, translatedText, lines, question, options]);
}

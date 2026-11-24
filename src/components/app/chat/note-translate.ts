/**
 * A note's words in the reader's language.
 *
 * A note that reads as another language (judged on the device, the same way a
 * Moment caption is) is translated as soon as it shows, through the same cached
 * translate path Moments and posts use, so every place the note appears (the
 * Status row, chat tags, the open note) reads in the reader's language and the
 * whole page costs one request per note at most. The open note offers "See
 * original" to flip back.
 *
 * Your own note is never translated, and nothing is sent when the reader has
 * turned auto-translate off: the open note then offers Translate instead.
 *
 * Kept in step with riftn-mobile/components/DM/note-translate.ts.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation as useTextTranslation } from '@/components/app/TranslatableText';
import { useUserLanguage } from '@/hooks/use-user-language';
import { autoTranslateEnabled, subscribeAutoTranslate } from '@/lib/auto-translate-setting';
import { momentTextLooksForeign } from '@/components/app/stories/story-translate';

export function useNoteWords(text: string | null | undefined, own = false) {
  const words = text ?? '';
  const { language } = useUserLanguage();
  const auto = useSyncExternalStore(subscribeAutoTranslate, autoTranslateEnabled, () => false);
  const foreign = useMemo(() => !own && !!words.trim() && momentTextLooksForeign(words, language), [own, words, language]);
  // Notes reach followers only, so the text stays away from providers that train.
  const { isTranslated, translatedText, isLoading, error, handleTranslate, handleShowOriginal } =
    useTextTranslation(words, false, undefined, false);
  const [asked, setAsked] = useState(false);

  const translate = useCallback(() => {
    setAsked(true);
    void handleTranslate();
  }, [handleTranslate]);

  // Once per note and language: a reader who chose the original keeps it.
  const autoDone = useRef<string | null>(null);
  useEffect(() => {
    const key = `${words}\n${language}`;
    if (!foreign || !auto || autoDone.current === key) return;
    autoDone.current = key;
    translate();
  }, [foreign, auto, words, language, translate]);

  // A failure leaves Translate ready to try again.
  useEffect(() => { if (error) setAsked(false); }, [error]);

  const showOriginal = useCallback(() => {
    setAsked(false);
    handleShowOriginal();
  }, [handleShowOriginal]);

  // Asked, answered, nothing changed: already in the reader's language.
  const same = asked && !isLoading && !isTranslated && !error;

  return {
    /** What to draw: the translation once there is one, else the note as written. */
    shown: isTranslated && translatedText ? translatedText : words,
    isTranslated,
    isLoading,
    /** Whether the open note should offer Translate / See original. */
    offer: foreign && !same,
    translate,
    showOriginal,
  };
}

/**
 * A Moment's caption, with a Translate chip when it reads as another language
 * than the viewer's. Tap to read it in your language, tap again to see the
 * original. Nothing is sent until the chip is tapped, and answers come from the
 * same cached translate path posts use.
 *
 * Mounted per Moment (keyed by id), so a translation never carries over to the
 * next one.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation as useCopy } from 'react-i18next';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import Languages from '@/components/ui/cut-icons/language';
import { useTranslation as useTextTranslation } from '@/components/app/TranslatableText';
import { useUserLanguage } from '@/hooks/use-user-language';
import { momentTextLooksForeign } from './story-translate';
import { BoldText } from '@/lib/bold-markup';

export function MomentCaption({ text, publicContent }: { text: string; publicContent: boolean }) {
  const { t } = useCopy();
  const { language } = useUserLanguage();
  const foreign = useMemo(() => momentTextLooksForeign(text, language), [text, language]);
  const { isTranslated, translatedText, isLoading, error, handleTranslate, handleShowOriginal } =
    useTextTranslation(text, false, undefined, publicContent);
  const [asked, setAsked] = useState(false);

  // A failure leaves the chip ready to try again once its message clears.
  useEffect(() => { if (error) setAsked(false); }, [error]);

  // Asked, answered, and nothing changed: the translator says it is already in
  // the viewer's language. Say so once and drop the chip.
  const same = asked && !isLoading && !isTranslated && !error;
  useEffect(() => {
    if (same) toast(t('stories.alreadyYourLanguage', { defaultValue: 'Already in your language' }));
  }, [same, t]);

  const onChip = () => {
    if (isTranslated) {
      setAsked(false);
      handleShowOriginal();
    } else {
      setAsked(true);
      void handleTranslate();
    }
  };

  const label = error
    ? error
    : isLoading
      ? t('stories.translating', { defaultValue: 'Translating…' })
      : isTranslated
        ? t('stories.seeOriginal', { defaultValue: 'See original' })
        : t('stories.translate', { defaultValue: 'Translate' });

  return (
    <>
      <div key={isTranslated ? 'translated' : 'original'} className="animate-in fade-in duration-150">
        <BoldText text={isTranslated ? translatedText : text} />
      </div>
      {foreign && !same && (
        <button
          type="button"
          data-sv-translate
          data-st-dark-glass
          onClick={onChip}
          disabled={isLoading}
        >
          {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Languages className="w-3.5 h-3.5" />}
          {label}
        </button>
      )}
    </>
  );
}

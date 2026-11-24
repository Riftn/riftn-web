import { useTranslation } from 'react-i18next';
import Languages from '@/components/ui/cut-icons/language';
import { LANGUAGE_NAMES } from '@/hooks/use-user-language';

/** Under the draft after AI menu > Translate: where it came from, and a way back. */
export function TranslatedDraftNote({ from, onUndo }: { from: string | null; onUndo: () => void }) {
  const { t: _copy } = useTranslation();
  const name = from ? LANGUAGE_NAMES[from] : undefined;
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-xs text-white/60" data-translated-draft>
      <Languages className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">
        {name
          ? _copy('copy.48bec8529d3f', { defaultValue: 'Translated from {{language}}', language: name })
          : _copy('dmTranslateOut.translated', { defaultValue: 'Translated' })}
      </span>
      <button
        type="button"
        onClick={onUndo}
        className="shrink-0 font-semibold text-white underline underline-offset-2 hover:text-white/80"
      >
        {_copy('copy.a8283ade3185', { defaultValue: 'Undo' })}
      </button>
    </span>
  );
}

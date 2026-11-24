import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Check from '@/components/ui/cut-icons/check';
import Search from '@/components/ui/cut-icons/search';
import { LANGUAGE_NAMES } from '@/hooks/use-user-language';
import { orderedTranslateLanguages, rememberedTranslateLang } from '../post-translate';

/** AI menu > Translate: pick the language the draft should be in. */
export function TranslateLanguageList({ onPick }: { onPick: (lang: string) => void }) {
  const { t: _copy, i18n } = useTranslation();
  const [query, setQuery] = useState('');
  const last = rememberedTranslateLang();
  const appLang = (i18n.language || 'en').split('-')[0];
  const codes = useMemo(
    () => orderedTranslateLanguages(LANGUAGE_NAMES, appLang, last),
    [appLang, last],
  );
  const q = query.trim().toLowerCase();
  const shown = q
    ? codes.filter((c) => LANGUAGE_NAMES[c].toLowerCase().includes(q) || c === q)
    : codes;

  return (
    <div className="flex flex-col min-h-0 pb-4">
      <label className="mx-4 mt-3 mb-2 flex h-10 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white/60">
        <Search className="h-4 w-4 shrink-0" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={_copy('copy.98cdcf4f2415', { defaultValue: 'Search languages' })}
          aria-label={_copy('copy.98cdcf4f2415', { defaultValue: 'Search languages' })}
          className="min-w-0 flex-1 bg-transparent text-white placeholder:text-white/50 outline-none"
        />
      </label>
      <div className="max-h-[45vh] overflow-y-auto" data-translate-languages>
        {shown.map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => onPick(code)}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-sm text-white hover:bg-white/10 transition-colors"
          >
            <span>{LANGUAGE_NAMES[code]}</span>
            {code === last && <Check className="h-4 w-4 text-white" />}
          </button>
        ))}
        {shown.length === 0 && (
          <p className="px-4 py-3 text-sm text-white/60">
            {_copy('copy.58d29fba0046', { defaultValue: 'No languages found' })}
          </p>
        )}
      </div>
    </div>
  );
}

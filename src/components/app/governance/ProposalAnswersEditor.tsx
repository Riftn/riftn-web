/**
 * Proposal Answers Editor
 * =======================
 * The answer type of a new governance proposal: a plain yes/no vote (the
 * default, and every proposal made before multiple choice), or a list of two
 * to six answers voters pick one of.
 */

import { useTranslation } from 'react-i18next';
import Check from '@/components/ui/cut-icons/check';
import X from '@/components/ui/cut-icons/close';
import Plus from '@/components/ui/cut-icons/add';
import { cn } from '@/lib/utils';

const MAX_PROPOSAL_OPTIONS = 6;
const MAX_OPTION_LENGTH = 80;

export function ProposalAnswersEditor({
  answerType,
  onAnswerTypeChange,
  options,
  onOptionsChange,
  error,
}: {
  answerType: 'yesno' | 'multiple';
  onAnswerTypeChange: (type: 'yesno' | 'multiple') => void;
  options: string[];
  onOptionsChange: (options: string[]) => void;
  error?: string;
}) {
  const { t } = useTranslation();
  const list = options.length >= 2 ? options : [...options, '', ''].slice(0, 2);
  const kinds: { id: 'yesno' | 'multiple'; label: string }[] = [
    { id: 'yesno', label: t('governance.answerYesNo', 'Yes or no') },
    { id: 'multiple', label: t('governance.answerMultiple', 'Multiple choice') },
  ];

  return (
    <div data-proposal-answers>
      <label className="text-zinc-400 text-xs font-medium mb-1.5 block">{t('governance.answersLabel', 'Answers')}</label>
      <div className="flex gap-1.5">
        {kinds.map((kind) => (
          <button
            key={kind.id}
            type="button"
            data-poll-duration
            aria-pressed={answerType === kind.id}
            onClick={() => onAnswerTypeChange(kind.id)}
            className={cn(
              'inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
              answerType === kind.id ? 'bg-white text-black' : 'bg-white/[0.06] text-white/60 hover:bg-white/10 hover:text-white/80',
            )}
          >
            {answerType === kind.id && <Check className="h-3 w-3" />}
            {kind.label}
          </button>
        ))}
      </div>

      {answerType === 'multiple' && (
        <div className="mt-2.5 flex flex-col gap-2">
          {list.map((option, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <div className="flex flex-1 items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2">
                <span className="w-4 shrink-0 text-xs font-medium text-zinc-500">{idx + 1}</span>
                <input
                  type="text"
                  value={option}
                  onChange={(e) => onOptionsChange(list.map((o, i) => (i === idx ? e.target.value : o)))}
                  placeholder={t('governance.optionPlaceholder', { n: idx + 1, defaultValue: 'Answer {{n}}' })}
                  maxLength={MAX_OPTION_LENGTH}
                  className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-zinc-600 outline-none"
                />
              </div>
              {list.length > 2 && (
                <button
                  type="button"
                  onClick={() => onOptionsChange(list.filter((_, i) => i !== idx))}
                  className="shrink-0 rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-white/10 hover:text-white"
                  aria-label={t('governance.removeOption', 'Remove answer')}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
          {list.length < MAX_PROPOSAL_OPTIONS && (
            <button
              type="button"
              onClick={() => onOptionsChange([...list, ''])}
              className="flex items-center gap-2 rounded-xl border border-dashed border-zinc-700 px-3 py-2 text-xs text-zinc-400 transition-colors hover:border-zinc-500 hover:text-white"
            >
              <Plus className="h-3.5 w-3.5" />
              {t('governance.addOption', 'Add answer')}
            </button>
          )}
          <p className="text-[11px] text-zinc-500">
            {t('governance.optionsHint', 'Voters pick one answer. Up to 6 answers.')}
          </p>
          {error && <span className="text-red-400 text-[11px]">{error}</span>}
        </div>
      )}
    </div>
  );
}

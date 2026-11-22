import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Trash2 } from 'lucide-react';
import X from '@/components/ui/cut-icons/close';
import Plus from '@/components/ui/cut-icons/add';
import { toast } from 'sonner';
import { draftQuiz, type QuizDraft } from '@/lib/api/dehub';
import { cn } from '@/lib/utils';

const POINT_STEPS = [5, 10, 25, 50];
const MAX_QUESTIONS = 10;

interface QuizEditorProps {
  quiz: QuizDraft;
  onChange: (quiz: QuizDraft) => void;
  onRemove: () => void;
}

/**
 * Create Post > Quiz. Describe it in a few words and the questions are written
 * for you; every question, answer and the right pick stays editable. Right
 * answers earn your channel points (never money).
 */
export function QuizEditor({ quiz, onChange, onRemove }: QuizEditorProps) {
  const { t } = useTranslation();
  const [writing, setWriting] = useState(false);

  const write = async () => {
    if (quiz.topic.trim().length < 3 || writing) return;
    setWriting(true);
    try {
      const { questions } = await draftQuiz(quiz.topic.trim(), 5);
      onChange({ ...quiz, questions });
    } catch (err: any) {
      toast.error(err?.message || t('quiz.writeFailed', 'Could not write questions, try other words'));
    } finally {
      setWriting(false);
    }
  };

  const setQuestion = (qi: number, patch: Partial<QuizDraft['questions'][number]>) =>
    onChange({ ...quiz, questions: quiz.questions.map((q, i) => (i === qi ? { ...q, ...patch } : q)) });

  return (
    <div data-quiz-editor className="mb-1 mt-3 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-white/70">{t('quiz.title', 'Quiz')}</span>
        <button type="button" onClick={onRemove} aria-label={t('quiz.remove', 'Remove quiz')} className="rounded-lg p-1 transition-colors hover:bg-white/10">
          <X className="h-3.5 w-3.5 text-white/50" />
        </button>
      </div>

      <div className="space-y-2 px-3 pt-3">
        <div className="flex gap-2">
          <input
            value={quiz.topic}
            onChange={(e) => onChange({ ...quiz, topic: e.target.value.slice(0, 200) })}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void write(); } }}
            placeholder={t('quiz.topicPlaceholder', 'Describe your quiz in a few words')}
            className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/40 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void write()}
            disabled={writing || quiz.topic.trim().length < 3}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-medium text-black transition-opacity disabled:opacity-40"
          >
            {writing && <Loader2 className="h-4 w-4 animate-spin" />}
            {quiz.questions.length ? t('quiz.rewrite', 'Write again') : t('quiz.write', 'Write questions')}
          </button>
        </div>
        <p className="text-xs text-white/50">{t('quiz.editorHint', 'Check every question before posting. Each person gets one go.')}</p>
        <p className="text-xs text-white/50">{t('quiz.dailyHint', 'One quiz a day. People who play your quizzes days in a row build a streak and earn bonus points.')}</p>
      </div>

      <ol className="space-y-3 p-3">
        {quiz.questions.map((question, qi) => (
          <li key={qi} className="space-y-1.5 rounded-xl border border-white/10 p-2.5">
            <div className="flex items-start gap-2">
              <span className="pt-2 text-xs text-white/50">{qi + 1}.</span>
              <textarea
                value={question.q}
                rows={2}
                onChange={(e) => setQuestion(qi, { q: e.target.value.slice(0, 300) })}
                placeholder={t('quiz.questionPlaceholder', 'Question')}
                className="min-h-10 min-w-0 flex-1 resize-none rounded-lg bg-white/5 px-2.5 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none"
              />
              <button
                type="button"
                aria-label={t('quiz.removeQuestion', 'Remove question')}
                onClick={() => onChange({ ...quiz, questions: quiz.questions.filter((_, i) => i !== qi) })}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white/60 hover:bg-white/10"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            {question.options.map((option, oi) => (
              <div key={oi} className="flex items-center gap-2 pl-5">
                <button
                  type="button"
                  role="radio"
                  aria-checked={question.answer === oi}
                  aria-label={t('quiz.markRight', 'Right answer')}
                  onClick={() => setQuestion(qi, { answer: oi })}
                  className={cn(
                    'grid h-6 w-6 shrink-0 place-items-center rounded-full border',
                    question.answer === oi ? 'border-white bg-white' : 'border-white/30',
                  )}
                >
                  {question.answer === oi && <span data-keep-dark className="h-2.5 w-2.5 rounded-full bg-black" />}
                </button>
                <input
                  value={option}
                  onChange={(e) => setQuestion(qi, { options: question.options.map((o, i) => (i === oi ? e.target.value.slice(0, 120) : o)) })}
                  placeholder={t('quiz.optionPlaceholder', { defaultValue: 'Answer {{n}}', n: oi + 1 })}
                  className="h-9 min-w-0 flex-1 rounded-lg bg-white/5 px-2.5 text-sm text-white placeholder:text-white/40 focus:outline-none"
                />
              </div>
            ))}
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center justify-between gap-2 px-3 pb-3">
        {quiz.questions.length < MAX_QUESTIONS ? (
          <button
            type="button"
            onClick={() => onChange({ ...quiz, questions: [...quiz.questions, { q: '', options: ['', '', '', ''], answer: 0 }] })}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-sm text-white/80 hover:bg-white/10"
          >
            <Plus className="h-4 w-4" />
            {t('quiz.addQuestion', 'Add question')}
          </button>
        ) : <span />}
        <label className="flex items-center gap-2 text-xs text-white/60">
          {t('quiz.pointsLabel', 'Points per right answer')}
          <select
            value={quiz.pointsPerQuestion}
            onChange={(e) => onChange({ ...quiz, pointsPerQuestion: Number(e.target.value) })}
            className="h-9 rounded-lg border border-white/10 bg-white/5 px-2 text-sm text-white"
          >
            {POINT_STEPS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
      </div>
    </div>
  );
}

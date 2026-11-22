import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, X, Loader2, GraduationCap, Flame } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { answerQuiz, getQuiz, type PostQuiz, type QuizQuestion } from '@/lib/api/dehub';
import { formatCount } from '@/lib/format-count';
import { cn } from '@/lib/utils';

export const quizQueryKey = (tokenId: number) => ['post-quiz', tokenId] as const;

/**
 * A post's quiz: one question at a time, one go per person, marked on the
 * server. Right answers earn the creator's channel points, boosted by the
 * reader's badge. Shown under the caption wherever the post's poll would be.
 */
export function QuizCard({ tokenId }: { tokenId: number }) {
  const { t } = useTranslation();
  const { isAuthenticated, openLoginModal } = useAuth();
  const queryClient = useQueryClient();
  const { data: quiz } = useQuery({
    queryKey: quizQueryKey(tokenId),
    queryFn: async () => (await getQuiz(tokenId)).quiz,
    staleTime: 60_000,
    retry: false,
  });
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<number[]>([]);
  const [sending, setSending] = useState(false);

  if (!quiz) return null;

  const done = quiz.isCreator || !!quiz.mine;
  const total = quiz.questions.length;

  const pick = async (index: number) => {
    if (!isAuthenticated) { openLoginModal(); return; }
    if (sending) return;
    const next = [...picked.slice(0, step), index];
    setPicked(next);
    if (step < total - 1) { setStep(step + 1); return; }
    setSending(true);
    try {
      const result = await answerQuiz(tokenId, next);
      queryClient.setQueryData<PostQuiz>(quizQueryKey(tokenId), (old) => old ? {
        ...old,
        attempts: old.attempts + 1,
        questions: result.questions,
        mine: { answers: result.answers, correct: result.correct, total: result.total, points: result.points, multiplier: result.multiplier },
        streak: result.streak ?? old.streak,
        bestStreak: result.bestStreak ?? old.bestStreak,
      } : old);
      toast.success(result.points > 0
        ? t('quiz.earnedToast', { defaultValue: '{{correct}} of {{total}} right, +{{points}} points', correct: result.correct, total: result.total, points: formatCount(result.points) })
        : t('quiz.noPointsToast', { defaultValue: '{{correct}} of {{total}} right', correct: result.correct, total: result.total }));
    } catch (err: any) {
      toast.error(err?.message || t('quiz.answerFailed', 'Could not send your answers'));
      setStep(0);
      setPicked([]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div data-quiz-card data-no-navigate onClick={(e) => e.stopPropagation()} className="mt-2 space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium leading-snug text-white">
          <GraduationCap className="h-4 w-4 shrink-0" />
          {quiz.topic || t('quiz.title', 'Quiz')}
        </p>
        <span className="shrink-0 text-right text-xs text-zinc-400">
          {t('quiz.taken', { defaultValue: '{{value}} took it', value: formatCount(quiz.attempts) })}
          {!quiz.isCreator && (quiz.streak ?? 0) > 0 && (
            <span className="ml-2 inline-flex items-center gap-1 text-white">
              <Flame className="h-3.5 w-3.5" />
              {t('quiz.streak', { defaultValue: '{{value}}-day streak', value: formatCount(quiz.streak ?? 0) })}
            </span>
          )}
        </span>
      </div>

      {done ? (
        <QuizReview quiz={quiz} />
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>{t('quiz.questionOf', { defaultValue: 'Question {{n}} of {{total}}', n: step + 1, total })}</span>
              <span>{t('quiz.pointsEach', { defaultValue: '{{points}} points each', points: formatCount(Math.round(quiz.pointsPerQuestion * (quiz.multiplier || 1) * (quiz.streakBonus || 1))) })}</span>
          </div>
          <p className="text-[15px] leading-snug text-white">{quiz.questions[step]?.q}</p>
          {quiz.questions[step]?.options.map((option, i) => (
            <button
              key={i}
              type="button"
              disabled={sending}
              onClick={() => void pick(i)}
              className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left text-sm text-zinc-200 transition-colors hover:bg-white/10 disabled:opacity-60"
            >
              {sending && step === total - 1 && picked[step] === i ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <span className="min-w-0 flex-1">{option}</span>
            </button>
          ))}
          {(quiz.streakBonus ?? 1) > 1 && (
            <p className="text-xs text-zinc-500">{t('quiz.streakBonus', { defaultValue: 'Streak bonus +{{pct}}%', pct: Math.round(((quiz.streakBonus ?? 1) - 1) * 100) })}</p>
          )}
          {quiz.multiplier > 1 && (
            <p className="text-xs text-zinc-500">{t('quiz.badgeBoost', { defaultValue: 'Your badge gives you {{x}}x points', x: quiz.multiplier })}</p>
          )}
        </div>
      )}
    </div>
  );
}

function QuizReview({ quiz }: { quiz: PostQuiz }) {
  const { t } = useTranslation();
  const mine = quiz.mine;
  return (
    <div className="space-y-3">
      {mine && (
        <p className="text-sm text-white">
          {mine.points > 0
            ? t('quiz.resultPoints', { defaultValue: '{{correct}} of {{total}} right, you earned {{points}} points', correct: mine.correct, total: mine.total, points: formatCount(mine.points) })
            : t('quiz.result', { defaultValue: '{{correct}} of {{total}} right', correct: mine.correct, total: mine.total })}
        </p>
      )}
      {quiz.isCreator && (
        <p className="text-xs text-zinc-400">{t('quiz.creatorNote', 'Your quiz. Right answers are marked; people earn your channel points.')}</p>
      )}
      <ol className="space-y-3">
        {quiz.questions.map((question: QuizQuestion, qi) => (
          <li key={qi} className="space-y-1.5">
            <p className="text-sm leading-snug text-white">{qi + 1}. {question.q}</p>
            {question.options.map((option, oi) => {
              const right = question.answer === oi;
              const chosen = mine?.answers[qi] === oi;
              return (
                <div
                  key={oi}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm',
                    right ? 'bg-white/15 text-white' : chosen ? 'bg-red-500/15 text-red-200' : 'text-zinc-400',
                  )}
                >
                  {right ? <Check className="h-3.5 w-3.5 shrink-0" /> : chosen ? <X className="h-3.5 w-3.5 shrink-0" /> : <span className="w-3.5 shrink-0" />}
                  <span className="min-w-0 flex-1">{option}</span>
                </div>
              );
            })}
          </li>
        ))}
      </ol>
    </div>
  );
}

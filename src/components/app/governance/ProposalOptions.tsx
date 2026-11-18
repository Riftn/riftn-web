/**
 * Proposal Options
 * ================
 * The answers of a multiple choice governance proposal: one row per answer,
 * filled to its share of the weighted vote, the viewer's pick ticked. Tapping
 * an answer votes for it, tapping your own pick again takes the vote back.
 * Results stay visible the whole time, as the yes/no bar does.
 *
 * Styled after the post poll card so a poll reads the same wherever it is.
 */

import { useTranslation } from 'react-i18next';
import Check from '@/components/ui/cut-icons/check';
import { cn } from '@/lib/utils';
import type { GovernanceProposal } from '@/hooks/use-governance';

export interface OptionTally {
  weight: number;
  voters: number;
}

/** True when a proposal is a multiple choice vote rather than yes/no. */
export function isMultipleChoice(proposal: Pick<GovernanceProposal, 'options'> | null | undefined): boolean {
  return Array.isArray(proposal?.options) && proposal!.options!.length >= 2;
}

/** Per-answer weight and voters, padded to the answer list. */
export function optionTallies(proposal: Pick<GovernanceProposal, 'options' | 'option_tallies'>): OptionTally[] {
  const options = proposal.options ?? [];
  const raw = Array.isArray(proposal.option_tallies) ? proposal.option_tallies : [];
  return options.map((_, i) => ({
    weight: Number(raw[i]?.weight) || 0,
    voters: Number(raw[i]?.voters) || 0,
  }));
}

/**
 * The index of the leading answer, or null on a tie at the top or no votes.
 * The cron resolver applies the same rule when the vote closes.
 */
export function leadingOption(tallies: OptionTally[]): number | null {
  let best = -1;
  let tie = false;
  tallies.forEach((t, i) => {
    if (best === -1 || t.weight > tallies[best].weight) { best = i; tie = false; }
    else if (t.weight === tallies[best].weight) tie = true;
  });
  if (best === -1 || tie || tallies[best].weight <= 0) return null;
  return best;
}

export function ProposalOptions({
  proposal,
  myOption,
  onVote,
  disabled,
  compact,
  className,
}: {
  proposal: GovernanceProposal;
  /** The answer the viewer voted for, if any. */
  myOption: number | null | undefined;
  onVote?: (optionIndex: number) => void;
  /** Closed vote, or a vote already on its way. */
  disabled?: boolean;
  /** Link-card size: smaller rows, no footer. */
  compact?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const options = proposal.options ?? [];
  const tallies = optionTallies(proposal);
  const totalWeight = tallies.reduce((sum, tally) => sum + tally.weight, 0);
  const totalVoters = tallies.reduce((sum, tally) => sum + tally.voters, 0);
  const decided = proposal.status !== 'open';
  const leader = leadingOption(tallies);
  const winner = decided && proposal.status === 'passed' ? leader : null;
  const pct = (i: number) => (totalWeight > 0 ? Math.round((tallies[i].weight / totalWeight) * 100) : 0);

  return (
    <div data-proposal-options className={cn('space-y-1.5', className)} onClick={onVote ? (e) => e.stopPropagation() : undefined}>
      {options.map((text, i) => {
        const mine = myOption === i;
        const won = winner === i;
        const canVote = !!onVote && !disabled;
        // Read-only (the link card is itself a button) renders plain rows,
        // since a button can't sit inside another.
        const Row = onVote ? 'button' : 'div';
        return (
          <Row
            key={i}
            {...(onVote ? { type: 'button' as const, disabled: !canVote, 'aria-pressed': mine, onClick: () => onVote(i) } : {})}
            data-proposal-option
            className={cn(
              'relative w-full overflow-hidden rounded-lg text-left transition-colors',
              canVote ? 'cursor-pointer hover:bg-white/5' : 'cursor-default',
            )}
          >
            <div className={cn('relative z-10 flex items-center justify-between', compact ? 'px-2.5 py-1.5' : 'px-3 py-2')}>
              <div className="flex min-w-0 items-center gap-2">
                {!decided && (
                  <span
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                      mine ? 'border-white bg-white' : 'border-white/30',
                    )}
                  >
                    {mine && <span data-keep-dark className="block h-2 w-2 rounded-full bg-black" />}
                  </span>
                )}
                <span className={cn(compact ? 'text-xs' : 'text-sm', 'truncate', mine || won ? 'font-medium text-white' : 'text-zinc-300')}>
                  {text}
                </span>
                {won && <Check className="h-3.5 w-3.5 shrink-0 text-white" aria-label={t('governance.winner', 'Winner')} />}
              </div>
              <span className={cn('ml-2 shrink-0 text-xs', mine || won ? 'font-medium text-white' : 'text-zinc-400')}>
                {pct(i)}%
              </span>
            </div>
            <div className="absolute inset-0 rounded-lg bg-white/10" />
            <div
              className={cn(
                'absolute inset-y-0 left-0 rounded-lg transition-all duration-500',
                mine || won ? 'bg-white/40' : 'bg-white/20',
              )}
              style={{ width: `${pct(i)}%` }}
            />
          </Row>
        );
      })}
      {!compact && (
        <p className="pt-0.5 text-[11px] text-zinc-500">
          {t('governance.optionVoters', { count: totalVoters, defaultValue: totalVoters === 1 ? '{{count}} voter' : '{{count}} voters' })}
          {' · '}
          {decided
            ? (winner !== null
              ? t('governance.optionWinner', { option: options[winner], defaultValue: 'Winner: {{option}}' })
              : t('governance.optionNoWinner', 'No clear winner'))
            : myOption !== null && myOption !== undefined
              ? t('governance.optionTapToUndo', 'Tap your answer again to take your vote back')
              : t('governance.optionPickOne', 'Pick one answer')}
        </p>
      )}
    </div>
  );
}

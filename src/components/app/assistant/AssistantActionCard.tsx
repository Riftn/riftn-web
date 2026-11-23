/**
 * Assistant action card
 * =====================
 * The assistant never acts on its own. When someone asks it to "react ❤️ to
 * every post by @jules", "follow @x" or to read their chats, it offers a card,
 * and this is that card: what will happen, a reaction picker where it matters,
 * and one tap to do it (signed in as the person, at /api/assistant-actions).
 * Big cards keep running after the tap, so the card follows their progress.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import CutCheck from '@/components/ui/cut-icons/check';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getMediaUrl } from '@/lib/api/dehub/core';
import {
  cancelAssistantAction,
  confirmAssistantAction,
  getAssistantAction,
  type AssistantAction,
  type AssistantActionPerson,
} from '@/lib/api/dehub/assistant-actions';
import { POST_REACTIONS, reactionMeta, type PostReaction } from '@/lib/reactions';
import { cn } from '@/lib/utils';
import { profilePath } from '@/lib/profile-path';

type Choice = PostReaction | 'fitting';

const REQUEST_CATEGORY_KEYS = {
  ui_ux: 'features.uiUx',
  performance: 'features.performance',
  new_feature: 'features.newFeature',
  bug_fix: 'features.bugFix',
  integration: 'features.integration',
  other: 'features.other',
} as const;

function Person({ person }: { person: AssistantActionPerson }) {
  const name = person.username ? `@${person.username}` : `${person.address.slice(0, 6)}…`;
  return (
    <Link to={person.username ? profilePath(person.username) : '#'} className="flex items-center gap-2 min-w-0">
      <Avatar className="h-7 w-7 shrink-0">
        {person.avatar && <AvatarImage src={getMediaUrl(person.avatar)} alt="" />}
        <AvatarFallback className="text-[10px] bg-transparent text-current ring-1 ring-current opacity-60">{(person.username || '?').slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <span className="truncate text-sm text-white/90">{name}</span>
    </Link>
  );
}

function ChoiceChip({ choice, selected, disabled, onPick }: { choice: Choice; selected: boolean; disabled?: boolean; onPick: () => void }) {
  const { t } = useTranslation();
  const label = choice === 'fitting' ? t('assistantCards.fitting', { defaultValue: 'Fitting' }) : reactionMeta(choice).label;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPick}
      aria-pressed={selected}
      aria-label={label}
      title={label}
      className={cn(
        'h-9 min-w-9 px-2 rounded-full text-base leading-none transition-colors border text-foreground',
        // The outline follows the text colour, so the pick shows on every theme.
        selected ? 'bg-white/20 border-white/40 outline outline-2 outline-current outline-offset-2' : 'bg-white/5 border-white/10 hover:bg-white/10',
        disabled && 'opacity-30 pointer-events-none',
      )}
    >
      {choice === 'fitting' ? <span className="text-xs font-medium text-white/90">{label}</span> : reactionMeta(choice).emoji}
    </button>
  );
}

export function AssistantActionCard({ actionId, initial }: { actionId: string; initial?: AssistantAction }) {
  const { t } = useTranslation();
  const [action, setAction] = useState<AssistantAction | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [choice, setChoice] = useState<Choice | null>(null);
  const poll = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await getAssistantAction(actionId);
      setAction(next);
      setError(null);
      if (next.status === 'running') poll.current = setTimeout(load, 1200);
    } catch {
      setError(t('assistantCards.loadFailed', { defaultValue: 'This card could not be loaded. Sign in, or ask again.' }));
    }
  }, [actionId, t]);

  useEffect(() => {
    // `initial` is a fixed card (the state gallery): nothing to fetch.
    if (!initial) load();
    return () => {
      if (poll.current) clearTimeout(poll.current);
    };
  }, [load, initial]);

  const picked: Choice = choice || ((action?.preview.choice as Choice) ?? 'like');
  const count = action?.preview.count ?? 0;

  const confirm = async () => {
    if (!action) return;
    setBusy(true);
    setError(null);
    try {
      const next = await confirmAssistantAction(
        action.id,
        action.kind === 'request_post' ? { requestPost: true } : action.kind === 'react' ? { reaction: picked } : {},
      );
      setAction(next);
      if (next.status === 'running') poll.current = setTimeout(load, 1200);
    } catch (e: any) {
      setError(e?.message || t('assistantCards.failed', { defaultValue: 'That did not work. Try again.' }));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!action) return;
    setBusy(true);
    try {
      setAction(await cancelAssistantAction(action.id));
    } finally {
      setBusy(false);
    }
  };

  if (error && !action) {
    return <div className="mt-2 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/60">{error}</div>;
  }
  if (!action) {
    return <div className="mt-2 h-24 rounded-xl border border-white/10 bg-white/5 animate-pulse" aria-busy="true" />;
  }

  const { kind, status, preview, result } = action;
  const draft = kind === 'request_post' ? preview.draft : undefined;
  const title =
    kind === 'react'
      ? count === 1
        ? t('assistantCards.reactOne', { defaultValue: 'React to 1 post' })
        : t('assistantCards.reactMany', { count, defaultValue: 'React to {{count}} posts' })
      : kind === 'follow'
        ? t('assistantCards.follow', { count, defaultValue: 'Follow {{count}}' })
        : kind === 'unfollow'
          ? t('assistantCards.unfollow', { count, defaultValue: 'Unfollow {{count}}' })
          : kind === 'request_post'
            ? t('assistantCards.requestDraft', { defaultValue: 'Public request draft' })
            : preview.allow
            ? t('assistantCards.allowChats', { defaultValue: 'Let the assistant read your chats?' })
            : t('assistantCards.stopChats', { defaultValue: 'Stop the assistant reading your chats?' });

  const confirmLabel =
    kind === 'react'
      ? t('assistantCards.confirmReact', { defaultValue: 'React' })
      : kind === 'follow'
        ? t('assistantCards.confirmFollow', { defaultValue: 'Follow' })
        : kind === 'unfollow'
          ? t('assistantCards.confirmUnfollow', { defaultValue: 'Unfollow' })
          : kind === 'request_post'
            ? t('assistantCards.postRequest', { defaultValue: 'Post to Build' })
            : preview.allow
            ? t('assistantCards.confirmAllow', { defaultValue: 'Allow' })
            : t('assistantCards.confirmStop', { defaultValue: 'Stop' });

  const total = result?.total ?? count;
  const done = result?.done ?? 0;

  return (
    <div className="mt-2 w-full max-w-sm rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-3 space-y-3" data-assistant-card={kind}>
      <div className="text-sm font-medium text-white">{title}</div>

      {draft && (
        <div className="space-y-2 break-words">
          <div className="text-xs text-white/60">{t(REQUEST_CATEGORY_KEYS[draft.category])}</div>
          <div className="text-sm font-semibold text-white">{draft.title}</div>
          <div className="whitespace-pre-wrap text-xs leading-relaxed text-white/80">{draft.description}</div>
          {!!preview.duplicates?.length && status === 'pending' && (
            <div className="space-y-1 text-xs">
              <div className="font-medium text-white/70">{t('assistantCards.possibleDuplicates', { defaultValue: 'Possible duplicates' })}</div>
              {preview.duplicates.map((request) => (
                <a key={request.id} className="block text-white underline" href={`/build?request=${encodeURIComponent(request.id)}`} target="_blank" rel="noopener">
                  {request.title}
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {kind === 'react' && preview.author && <Person person={preview.author} />}
      {kind === 'react' && !!preview.alreadyReacted && (
        <div className="text-xs text-white/50">
          {t('assistantCards.skipsAlready', { count: preview.alreadyReacted, defaultValue: 'Skips {{count}} you already reacted to' })}
        </div>
      )}
      {(kind === 'follow' || kind === 'unfollow') && (
        <div className="flex flex-col gap-2">
          {(preview.people || []).map((p) => (
            <Person key={p.address} person={p} />
          ))}
        </div>
      )}
      {kind === 'chat_access' && preview.allow && (
        <div className="text-xs text-white/60 leading-relaxed">
          {t('assistantCards.allowChatsWhy', {
            defaultValue:
              'Only you see what it reads. Direct chats only, and end-to-end encrypted ones stay private. Ask it to stop any time.',
          })}
        </div>
      )}

      {kind === 'react' && status === 'pending' && (
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('assistantCards.pickReaction', { defaultValue: 'Pick a reaction' })}>
          {[...POST_REACTIONS, 'fitting' as const].map((c) => (
            <ChoiceChip key={c} choice={c} selected={picked === c} disabled={c === 'dislike' && count > 1} onPick={() => setChoice(c)} />
          ))}
        </div>
      )}

      {status === 'running' && (
        <div className="space-y-1.5">
          <div className="relative h-1.5 w-full rounded-full overflow-hidden">
            {/* currentColor, so the bar reads on every theme's text colour. */}
            <div className="absolute inset-0 bg-current opacity-15" />
            <div className="relative h-full bg-current opacity-80 transition-[width] duration-500" style={{ width: `${total ? Math.round((done / total) * 100) : 10}%` }} />
          </div>
          <div className="text-xs text-white/60">
            {t('assistantCards.progress', { done, total, defaultValue: '{{done}} of {{total}}' })}
          </div>
        </div>
      )}

      {status === 'done' && kind === 'request_post' && result?.requestId && (
        <a className="inline-flex items-center gap-2 text-xs text-white underline" href={`/build?request=${encodeURIComponent(result.requestId)}`}>
          <CutCheck className="h-3.5 w-3.5 shrink-0" />
          {t('assistantCards.viewPostedRequest', { defaultValue: 'View posted request' })}
        </a>
      )}
      {status === 'done' && kind !== 'request_post' && (
        <div className="flex items-center gap-2 text-xs text-white/80">
          <CutCheck className="w-3.5 h-3.5 shrink-0" />
          <span>
            {kind === 'react'
              ? t('assistantCards.doneReact', { count: result?.added ?? 0, defaultValue: 'Reacted to {{count}} posts' })
              : kind === 'chat_access'
                ? result?.allowed
                  ? t('assistantCards.doneAllow', { defaultValue: 'Allowed. Ask your question again.' })
                  : t('assistantCards.doneStop', { defaultValue: 'Stopped. It can no longer read your chats.' })
                : t('assistantCards.doneFollow', { count: result?.ok ?? 0, defaultValue: 'Done for {{count}}' })}
            {kind === 'react' && result?.used && (
              <span className="ml-1">{Object.keys(result.used).map((r) => reactionMeta(r as PostReaction)?.emoji).join(' ')}</span>
            )}
          </span>
        </div>
      )}
      {status === 'expired' && (
        <div className="text-xs text-white/50">{t('assistantCards.expired', { defaultValue: 'This card expired. Ask again.' })}</div>
      )}
      {status === 'cancelled' && (
        <div className="text-xs text-white/50">{t('assistantCards.cancelled', { defaultValue: 'Cancelled' })}</div>
      )}
      {status === 'failed' && (
        <div className="text-xs text-white/60">{t('assistantCards.failed', { defaultValue: 'That did not work. Try again.' })}</div>
      )}
      {error && status === 'pending' && <div className="text-xs text-white/60">{error}</div>}

      {status === 'pending' && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            className="flex-1 h-9 rounded-full bg-white text-black text-sm font-medium disabled:opacity-60"
          >
            {confirmLabel}
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={busy}
            className="h-9 px-4 rounded-full border border-white/15 text-sm text-white/80 hover:bg-white/10 disabled:opacity-60"
          >
            {t('assistantCards.cancel', { defaultValue: 'Not now' })}
          </button>
        </div>
      )}
    </div>
  );
}

export default AssistantActionCard;

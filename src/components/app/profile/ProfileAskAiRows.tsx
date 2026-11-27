/**
 * "Ask AI" from somebody else's profile.
 *
 * The ⋮ menu row opens these rows in place (same swap as LendBadgeRows: an
 * overlay opened from the drawer would dismiss the drawer). Each row hands a
 * ready-made ask about this person to the Assistant, which opens in a fresh chat
 * and sends it straight away. The Assistant answers with its usual confirm cards
 * (follow, react to every post), so nothing happens until the person taps.
 */
import { useState } from 'react';
import { ChevronLeft, PenLine, Plus, Zap, ArrowUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import CutAssistant from '@/components/ui/cut-icons/assistant';
import type { ProfileData } from '@/hooks/use-dehub-profile';
import { cn } from '@/lib/utils';
import { formatCount } from '@/lib/format-count';

/** The link the Assistant reads: fresh chat, prompt sent on arrival. */
function askAiHref(prompt: string) {
  return `/app/assistant#preset=chat&send=1&prompt=${encodeURIComponent(prompt)}`;
}

const STAR_PATH =
  'M14.450 3.600L14.900 3.600Q17.550 3.600 17.550 6.250C17.550 11.000 21.000 14.450 28.400 14.450L28.400 14.900Q28.400 17.550 25.750 17.550C21.000 17.550 17.550 21.000 17.550 28.400L17.100 28.400Q14.450 28.400 14.450 25.750C14.450 21.000 11.000 17.550 3.600 17.550L3.600 17.100Q3.600 14.450 6.250 14.450C11.000 14.450 14.450 11.000 14.450 3.600Z M16.000 10.600C17.458 12.976 19.024 14.542 21.400 16.000C19.024 17.458 17.458 19.024 16.000 21.400C14.542 19.024 12.976 17.458 10.600 16.000C12.976 14.542 14.542 12.976 16.000 10.600Z';
const STAR_URL = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><path fill-rule='evenodd' d='${STAR_PATH}'/></svg>`)}")`;
const STAR_MASK = { WebkitMask: `${STAR_URL} center / contain no-repeat`, mask: `${STAR_URL} center / contain no-repeat` } as const;

/** Chrome edge, shared by the menu row and the main action. */
const ASK_AI_EDGE =
  "relative before:pointer-events-none before:absolute before:-inset-px before:rounded-[inherit] before:p-px before:content-[''] before:[background:conic-gradient(from_210deg,#fff,#6d6d6d,#e8e8e8,#3a3a3a,#fff)] before:[-webkit-mask:linear-gradient(#000_0_0)_content-box,linear-gradient(#000_0_0)] before:[-webkit-mask-composite:xor] before:[mask-composite:exclude]";

export function AskAiMenuRow({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      onClick={onClick}
      data-profile-ask-ai
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gradient-to-b from-white/[0.12] to-white/[0.04] backdrop-blur-md hover:from-white/[0.16] active:scale-[0.98] transition-[background-color,transform] text-left',
        ASK_AI_EDGE,
      )}
    >
      <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center shrink-0">
        {/* A mask, not an svg: themes re-ink every svg inside a glass button. */}
        <span aria-hidden className="w-4 h-4 bg-black" style={STAR_MASK} />
      </div>
      <div className="min-w-0">
        <span className="block text-white font-medium">{t('profileAskAi.row', { defaultValue: 'Ask AI' })}</span>
        <span className="block text-xs text-white/50 truncate">
          {t('profileAskAi.rowSub', { defaultValue: 'Follow, like everything, catch up' })}
        </span>
      </div>
      <ChevronLeft className="w-4 h-4 ml-auto rotate-180 text-white/40 shrink-0" />
    </button>
  );
}

interface ProfileAskAiRowsProps {
  profile: ProfileData;
  isFollowing: boolean;
  onBack: () => void;
  /** Closes the menu before the Assistant opens. */
  onClose: () => void;
}

export function ProfileAskAiRows({ profile, isFollowing, onBack, onClose }: ProfileAskAiRowsProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [question, setQuestion] = useState('');
  const handle = profile.handle?.startsWith('@') ? profile.handle : `@${profile.handle || ''}`;
  const posts = profile.postsCount > 0 ? profile.postsCount : null;

  const ask = (prompt: string) => {
    onClose();
    navigate(askAiHref(prompt));
  };

  const actions = [
    !isFollowing && {
      key: 'followLikeAll',
      icon: <Plus className="w-4 h-4" />,
      title: t('profileAskAi.followLikeAll', { defaultValue: 'Follow and like everything' }),
      sub: t('profileAskAi.followLikeAllSub', { handle, defaultValue: 'Follows {{handle}}, reacts to every post' }),
      prompt: t('profileAskAi.promptFollowLikeAll', { handle, defaultValue: 'Follow {{handle}} and react to all of their posts' }),
      count: posts,
    },
    {
      key: 'likeAll',
      icon: <span className="text-base leading-none">❤️</span>,
      title: t('profileAskAi.likeAll', { defaultValue: 'Like all their posts' }),
      sub: t('profileAskAi.likeAllSub', { defaultValue: 'Skips ones you already reacted to' }),
      prompt: t('profileAskAi.promptLikeAll', { handle, defaultValue: 'React to all of the posts by {{handle}}' }),
      count: posts,
    },
    {
      key: 'catchUp',
      icon: <Zap className="w-4 h-4" />,
      title: t('profileAskAi.catchUp', { defaultValue: 'Catch me up' }),
      sub: t('profileAskAi.catchUpSub', { handle, defaultValue: 'What {{handle}} posted lately, in short' }),
      prompt: t('profileAskAi.promptCatchUp', { handle, defaultValue: 'Catch me up on what {{handle}} has posted lately' }),
      count: null,
    },
    {
      key: 'message',
      icon: <PenLine className="w-4 h-4" />,
      title: t('profileAskAi.message', { defaultValue: 'Write them a message' }),
      sub: t('profileAskAi.messageSub', { defaultValue: 'Drafts a message, you send it' }),
      prompt: t('profileAskAi.promptMessage', { handle, defaultValue: 'Help me write a message to {{handle}}' }),
      count: null,
    },
  ].filter(Boolean) as { key: string; icon: JSX.Element; title: string; sub: string; prompt: string; count: number | null }[];

  const submit = () => {
    const q = question.trim();
    if (!q) return;
    ask(t('profileAskAi.promptAbout', { handle, question: q, defaultValue: 'About {{handle}}: {{question}}' }));
  };

  return (
    <div className="flex flex-col gap-1.5" data-profile-ask-ai-rows>
      <button
        onClick={onBack}
        data-swipe-back
        className="flex items-center gap-2 px-1 py-1.5 text-white/60 hover:text-white transition-colors self-start"
      >
        <ChevronLeft className="w-4 h-4" />
        <span className="text-sm font-medium">{t('profileAskAi.back', { defaultValue: 'Back' })}</span>
      </button>

      <div className="flex items-center gap-3 px-1 pb-2">
        <img
          src={profile.avatarUrl || '/placeholder.svg'}
          alt=""
          className="w-11 h-11 rounded-full object-cover shrink-0 bg-white/10"
        />
        <div className="min-w-0">
          <div className="text-white font-semibold truncate">
            {t('profileAskAi.title', { handle, defaultValue: 'Ask AI about {{handle}}' })}
          </div>
          <div className="text-xs text-white/50">
            {t('profileAskAi.sub', { defaultValue: 'The Assistant does it, you confirm' })}
          </div>
        </div>
        <CutAssistant className="w-7 h-7 ml-auto text-white shrink-0" />
      </div>

      {actions.map((a, i) => {
        const primary = i === 0;
        return (
          <button
            key={a.key}
            onClick={() => ask(a.prompt)}
            data-ask-ai-action={a.key}
            data-keep-white={primary || undefined}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-3 rounded-2xl border text-left active:scale-[0.98] transition-[background-color,transform]',
              primary
                ? 'bg-white border-white text-black hover:bg-white/90'
                : 'bg-white/5 border-white/10 text-white hover:bg-white/10 backdrop-blur-md',
            )}
          >
            <div
              className={cn(
                'w-8 h-8 rounded-xl flex items-center justify-center shrink-0',
                primary ? 'bg-black text-white' : 'bg-white/10 text-white',
              )}
            >
              {a.icon}
            </div>
            <div className="min-w-0">
              <span className="block font-semibold text-[15px] leading-5">{a.title}</span>
              <span className={cn('block text-xs truncate', primary ? 'text-black/55' : 'text-white/50')}>{a.sub}</span>
            </div>
            {a.count != null && (
              <span
                className={cn(
                  'ml-auto shrink-0 text-xs font-bold px-2 py-0.5 rounded-full tabular-nums',
                  primary ? 'bg-black text-white' : 'bg-white/10 text-white',
                )}
              >
                {formatCount(a.count)}
              </span>
            )}
          </button>
        );
      })}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="mt-1.5 flex items-center gap-2 pl-4 pr-1.5 py-1.5 rounded-full bg-white/[0.06] border border-white/15 focus-within:border-white/30"
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t('profileAskAi.placeholder', { handle, defaultValue: 'Ask anything about {{handle}}…' })}
          className="flex-1 min-w-0 bg-transparent text-sm text-white placeholder:text-white/40 outline-none py-1.5"
          enterKeyHint="send"
        />
        <button
          type="submit"
          data-keep-white
          disabled={!question.trim()}
          aria-label={t('profileAskAi.send', { defaultValue: 'Send' })}
          className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center shrink-0 disabled:opacity-40"
        >
          <ArrowUp className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}

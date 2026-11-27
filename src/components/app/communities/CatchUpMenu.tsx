/**
 * "Catch me up" in a group, channel or community chat: pick a window and a
 * private recap of the chat lands in your DMs from @assistant. Nothing is
 * posted in the group. Typing "catch me up" in the message box does the same
 * (CommunityChat.handleSend).
 */
import { useCallback } from 'react';
import type { TFunction } from 'i18next';
import type { NavigateFunction } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import History from '@/components/ui/cut-icons/history';
import Help from '@/components/ui/cut-icons/help';
import * as Drop from '@/components/ui/dropdown-menu';
import { CHAT_MENU_CONTENT } from '@/components/app/chat/ChatOptionsMenu';
import { requestCatchUp, type CatchUpPeriod } from '@/lib/community-recap';
import { formatCount } from '@/lib/format-count';

const ROW = 'flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-[14px] text-zinc-100 outline-none focus:bg-white/10 focus:text-white data-[highlighted]:bg-white/10 data-[highlighted]:text-white';

/** Ask for a recap and say how it went. Shared by the menu and the typed command. */
export async function runCatchUp(opts: {
  communityId: string;
  walletAddress: string;
  period?: CatchUpPeriod;
  text?: string;
  t: TFunction;
  lang?: string;
  navigate: NavigateFunction;
}): Promise<void> {
  const { t } = opts;
  const id = toast.loading(t('communities.catchUp.working', 'Catching you up…'));
  try {
    const result = await requestCatchUp(opts);
    if (!result.sent) {
      toast.info(t('communities.catchUp.nothing', 'Nothing new to catch up on'), { id });
      return;
    }
    toast.success(t('communities.catchUp.sent', 'Recap sent to your DMs'), {
      id,
      description: t('communities.catchUp.sentCount', {
        defaultValue: '{{window}} · {{formattedCount}} messages',
        window: result.window,
        count: result.count,
        formattedCount: formatCount(result.count),
      }),
      action: result.conversationId
        ? {
            label: t('communities.catchUp.open', 'Open'),
            onClick: () => opts.navigate(`/app/messages?conversation=${encodeURIComponent(result.conversationId!)}`),
          }
        : undefined,
    });
  } catch (err: any) {
    toast.error(
      err?.httpStatus === 429
        ? t('communities.catchUp.busy', 'Your recap is on its way. Try again in a bit.')
        : t('communities.catchUp.failed', "Couldn't make your recap. Try again."),
      { id },
    );
  }
}

type CatchUpMenuProps = { communityId: string; walletAddress: string };

function CatchUpPeriods({ communityId, walletAddress }: CatchUpMenuProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const pick = useCallback(
    (period: CatchUpPeriod) => {
      void runCatchUp({ communityId, walletAddress, period, t, lang: i18n.language, navigate });
    },
    [communityId, walletAddress, t, i18n.language, navigate],
  );

  return (
    <>
      <div className="px-2.5 pb-1.5 pt-1 text-[12px] leading-snug text-zinc-400">
        {t('communities.catchUp.menuHint', 'A private recap, sent to your DMs')}
      </div>
      <Drop.DropdownMenuItem className={ROW} onSelect={() => pick('24h')} data-catch-up="24h">
        {t('communities.catchUp.last24h', 'Last 24 hours')}
      </Drop.DropdownMenuItem>
      <Drop.DropdownMenuItem className={ROW} onSelect={() => pick('3d')} data-catch-up="3d">
        {t('communities.catchUp.last3d', 'Last 3 days')}
      </Drop.DropdownMenuItem>
      <Drop.DropdownMenuItem className={ROW} onSelect={() => pick('unread')} data-catch-up="unread">
        {t('communities.catchUp.sinceRead', 'Since I last read')}
      </Drop.DropdownMenuItem>
    </>
  );
}

export function CatchUpMenu({ iconOnly = false, ...props }: CatchUpMenuProps & { iconOnly?: boolean }) {
  const { t } = useTranslation();
  const label = t('communities.catchUp.button', 'Catch me up');
  return (
    <Drop.DropdownMenu>
      <Drop.DropdownMenuTrigger asChild>
        <button
          type="button"
          data-community-catch-up
          aria-label={iconOnly ? label : undefined}
          title={iconOnly ? label : undefined}
          className="ml-auto flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-zinc-500 hover:text-white hover:bg-white/[0.04] transition-colors"
        >
          {iconOnly ? <Help aria-hidden="true" /> : (
            <>
              <History className="w-3.5 h-3.5" />
              {label}
            </>
          )}
        </button>
      </Drop.DropdownMenuTrigger>
      <Drop.DropdownMenuContent align="end" data-chat-options-menu data-catch-up-menu className={CHAT_MENU_CONTENT}>
        <CatchUpPeriods {...props} />
      </Drop.DropdownMenuContent>
    </Drop.DropdownMenu>
  );
}

export function CatchUpSubmenu({ className, ...props }: CatchUpMenuProps & { className: string }) {
  const { t } = useTranslation();
  return (
    <Drop.DropdownMenuSub>
      <Drop.DropdownMenuSubTrigger className={className}>
        <Help aria-hidden="true" />{t('communities.catchUp.button', 'Catch me up')}
      </Drop.DropdownMenuSubTrigger>
      <Drop.DropdownMenuPortal>
        <Drop.DropdownMenuSubContent sideOffset={4} data-chat-options-menu data-catch-up-menu className={CHAT_MENU_CONTENT}>
          <CatchUpPeriods {...props} />
        </Drop.DropdownMenuSubContent>
      </Drop.DropdownMenuPortal>
    </Drop.DropdownMenuSub>
  );
}

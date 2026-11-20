/**
 * The creator's !commands as tap buttons above a stream's chat box, when
 * their chat bot is on. Tapping one sends it, so phone viewers never have to
 * type an exclamation mark.
 */
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { getStreamBot } from '@/lib/api/dehub/livechat';

export function StreamBotCommands({
  tokenId,
  overlay = false,
  disabled = false,
  onSend,
}: {
  tokenId: string;
  overlay?: boolean;
  disabled?: boolean;
  onSend: (command: string) => void;
}) {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ['stream-bot', tokenId],
    queryFn: () => getStreamBot(tokenId),
    enabled: !!tokenId,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
  if (!data?.commandButtons || !data.commands.length) return null;
  return (
    <div
      role="toolbar"
      aria-label={t('liveStudio.bot.commandsLabel')}
      className="-mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {data.commands.map((c) => (
        <button
          key={c.command}
          type="button"
          disabled={disabled}
          title={c.name || c.command}
          onClick={() => onSend(c.command)}
          className={cn(
            'shrink-0 rounded-full border px-3 py-1 text-xs font-medium text-white transition-colors disabled:opacity-40',
            overlay ? 'border-white/15 bg-black/40 backdrop-blur-md hover:bg-black/55' : 'border-white/10 bg-white/5 hover:bg-white/10',
          )}
        >
          {c.command}
        </button>
      ))}
    </div>
  );
}

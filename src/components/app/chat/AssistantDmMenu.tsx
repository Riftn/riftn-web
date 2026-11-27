/**
 * The assistant's own controls, in the @assistant DM.
 *
 * Same personality and chat model as the Assistant page (one saved setting,
 * see use-assistant-prefs), plus a way into the full page for skills,
 * support and voice.
 */
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import AssistantIcon from '@/components/ui/cut-icons/assistant';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AI_ASSISTANT_STYLE_OPTIONS } from '@/constants/ai-styles.constants';
import { CHAT_MODEL_OPTIONS } from '@/constants/chat-models.constants';
import { useAssistantPrefs } from '@/hooks/use-assistant-prefs';

const ITEM = 'text-zinc-300 focus:text-white focus:bg-zinc-700 cursor-pointer gap-2';

export function AssistantDmMenu({ className, compact }: { className?: string; compact?: boolean }) {
  const { t } = useTranslation();
  const { style, setStyle, model, setModel } = useAssistantPrefs();
  const currentStyle = AI_ASSISTANT_STYLE_OPTIONS.find((s) => s.id === style) ?? AI_ASSISTANT_STYLE_OPTIONS[0];
  const currentModel = CHAT_MODEL_OPTIONS.find((m) => m.id === model) ?? CHAT_MODEL_OPTIONS[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('assistant.aiSettings')}
          data-assistant-dm-menu
          className={className}
        >
          <AssistantIcon className={compact ? 'w-4 h-4' : 'w-5 h-5'} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-[150] min-w-[220px] bg-zinc-800 border-zinc-700">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className={ITEM}>
            <span className="w-4 text-center leading-none">{currentStyle.emoji}</span>
            {t('assistant.aiPersonality')}
            <span className="ml-auto pl-3 text-xs opacity-60">{t(`aiStyles.${currentStyle.id}`, { defaultValue: currentStyle.label })}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="z-[160] max-h-[60vh] overflow-y-auto bg-zinc-800 border-zinc-700">
            {AI_ASSISTANT_STYLE_OPTIONS.map((s) => (
              <DropdownMenuItem key={s.id} className={ITEM} onSelect={() => setStyle(s.id)}>
                <span className="w-4 text-center leading-none">{s.emoji}</span>
                {t(`aiStyles.${s.id}`, { defaultValue: s.label })}
                {s.id === style && <Check className="ml-auto w-4 h-4" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className={ITEM}>
            <span className="w-4 text-center leading-none">{currentModel.emoji}</span>
            {t('assistant.chatModel')}
            <span className="ml-auto pl-3 text-xs opacity-60">{currentModel.name}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="z-[160] bg-zinc-800 border-zinc-700">
            {CHAT_MODEL_OPTIONS.map((m) => (
              <DropdownMenuItem key={m.id} className={ITEM} onSelect={() => setModel(m.id)}>
                <span className="w-4 text-center leading-none">{m.emoji}</span>
                <span className="flex flex-col">
                  <span>{m.name}</span>
                  <span className="text-xs opacity-60">{m.description}</span>
                </span>
                {m.id === model && <Check className="ml-auto w-4 h-4" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator className="bg-zinc-700" />
        <DropdownMenuItem asChild className={ITEM}>
          <Link to="/assistant">
            <AssistantIcon className="w-4 h-4" />
            {t('assistant.title')}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

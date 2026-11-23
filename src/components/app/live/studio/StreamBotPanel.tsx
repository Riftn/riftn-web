/**
 * Live Studio's chat bot: a co-host for the creator's own stream chat. It
 * says hi to first-time chatters, answers questions from what the creator
 * writes here and the stream title, tells late joiners what they missed, and
 * asks chat something when it goes quiet. The creator's !commands (stream
 * rules) show as tap buttons above the chat box. Off until switched on.
 */
import { useEffect, useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { PageSection } from '@/components/app/page-kit/PageKit';
import { SETTINGS_LABEL_CLASS } from '@/components/app/settings/SettingsRow';
import { cn } from '@/lib/utils';
import {
  getMyStreamBot,
  saveMyStreamBot,
  STREAM_BOT_ABOUT_MAX,
  type StreamBotChattiness,
  type StreamBotPersonality,
  type StreamBotSettings,
} from '@/lib/api/dehub/livechat';

export const myStreamBotKey = ['my-stream-bot'] as const;

const PERSONALITIES: StreamBotPersonality[] = ['chill', 'hype', 'funny', 'formal'];
const CHATTINESS: StreamBotChattiness[] = ['quiet', 'normal', 'lots'];

function Toggle({ label, hint, checked, onChange, disabled }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <div className={cn('flex items-start justify-between gap-4', disabled && 'opacity-50')}>
      <div className="min-w-0">
        <label htmlFor={id} className="block text-sm font-medium text-white">
          {label}
        </label>
        {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

function Segments<T extends string>({ label, value, options, labelOf, onChange }: { label: string; value: T; options: T[]; labelOf: (v: T) => string; onChange: (v: T) => void }) {
  return (
    <div>
      <p className={SETTINGS_LABEL_CLASS}>{label}</p>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={value === o}
            onClick={() => onChange(o)}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-sm transition-colors',
              value === o ? 'border-white bg-white font-semibold text-black' : 'border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white',
            )}
          >
            {labelOf(o)}
          </button>
        ))}
      </div>
    </div>
  );
}

function Block({ children }: { children: ReactNode }) {
  return <div className="space-y-4 rounded-xl border border-zinc-800 p-4">{children}</div>;
}

export function StreamBotPanel() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const aboutId = useId();
  const { data, isLoading, isError } = useQuery({ queryKey: myStreamBotKey, queryFn: getMyStreamBot, staleTime: 15_000 });
  const [settings, setSettings] = useState<StreamBotSettings | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data && !dirty) setSettings(data);
  }, [data, dirty]);

  const save = useMutation({
    mutationFn: (next: StreamBotSettings) => saveMyStreamBot(next),
    onSuccess: (saved) => {
      queryClient.setQueryData(myStreamBotKey, saved);
      setSettings(saved);
      setDirty(false);
      toast.success(t('liveStudio.bot.saved'));
    },
    onError: () => toast.error(t('liveStudio.bot.saveFailed')),
  });

  const change = (patch: Partial<StreamBotSettings>) => {
    setSettings((s) => (s ? { ...s, ...patch } : s));
    setDirty(true);
  };

  if (isLoading) {
    return (
      <PageSection title={t('liveStudio.bot.title')}>
        <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
      </PageSection>
    );
  }
  if (isError || !settings) {
    return (
      <PageSection title={t('liveStudio.bot.title')}>
        <p className="text-sm text-zinc-400">{t('liveStudio.bot.loadFailed')}</p>
      </PageSection>
    );
  }

  const off = !settings.enabled;

  return (
    <PageSection title={t('liveStudio.bot.title')}>
      <p className="mb-4 text-xs text-zinc-500">{t('liveStudio.bot.intro')}</p>
      <div className="space-y-4">
        <Block>
          <Toggle
            label={t('liveStudio.bot.enabled')}
            hint={t('liveStudio.bot.enabledHint')}
            checked={settings.enabled}
            // Switching it on or off saves straight away: it is the one setting
            // people flip mid-stream.
            onChange={(v) => {
              const next = { ...settings, enabled: v };
              setSettings(next);
              save.mutate(next);
            }}
          />
        </Block>

        <div className={cn('grid gap-4 lg:grid-cols-2', off && 'opacity-60')}>
          <Block>
            <div>
              <label htmlFor={aboutId} className={SETTINGS_LABEL_CLASS}>
                {t('liveStudio.bot.about')}
              </label>
              <Textarea
                id={aboutId}
                rows={5}
                maxLength={STREAM_BOT_ABOUT_MAX}
                value={settings.about}
                placeholder={t('liveStudio.bot.aboutPlaceholder')}
                onChange={(e) => change({ about: e.target.value })}
                className="text-sm"
              />
              <p className="mt-1.5 text-xs text-zinc-500">
                {t('liveStudio.bot.aboutHint')} · {settings.about.length}/{STREAM_BOT_ABOUT_MAX}
              </p>
            </div>
            <Segments
              label={t('liveStudio.bot.personality')}
              value={settings.personality}
              options={PERSONALITIES}
              labelOf={(p) => t(`liveStudio.bot.personalities.${p}`)}
              onChange={(personality) => change({ personality })}
            />
            <Segments
              label={t('liveStudio.bot.chattiness')}
              value={settings.chattiness}
              options={CHATTINESS}
              labelOf={(c) => t(`liveStudio.bot.chattinessLevels.${c}`)}
              onChange={(chattiness) => change({ chattiness })}
            />
          </Block>

          <Block>
            <Toggle label={t('liveStudio.bot.greet')} hint={t('liveStudio.bot.greetHint')} checked={settings.greet} onChange={(greet) => change({ greet })} />
            <Toggle label={t('liveStudio.bot.answer')} hint={t('liveStudio.bot.answerHint')} checked={settings.answer} onChange={(answer) => change({ answer })} />
            <Toggle label={t('liveStudio.bot.catchUp')} hint={t('liveStudio.bot.catchUpHint')} checked={settings.catchUp} onChange={(catchUp) => change({ catchUp })} />
            <Toggle
              label={t('liveStudio.bot.wakeQuiet')}
              hint={t('liveStudio.bot.wakeQuietHint')}
              checked={settings.wakeQuiet && settings.chattiness !== 'quiet'}
              disabled={settings.chattiness === 'quiet'}
              onChange={(wakeQuiet) => change({ wakeQuiet })}
            />
            <Toggle
              label={t('liveStudio.bot.commandButtons')}
              hint={t('liveStudio.bot.commandButtonsHint')}
              checked={settings.commandButtons}
              onChange={(commandButtons) => change({ commandButtons })}
            />
          </Block>
        </div>

        <p className="text-xs text-zinc-500">{t('liveStudio.bot.safety')}</p>

        <div className="flex items-center justify-end gap-3">
          {dirty && <span className="text-xs text-zinc-400">{t('liveStudio.unsaved')}</span>}
          <Button size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate(settings)}>
            {save.isPending ? t('liveStudio.saving') : t('liveStudio.bot.save')}
          </Button>
        </div>
      </div>
    </PageSection>
  );
}

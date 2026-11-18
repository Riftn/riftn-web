/**
 * Auto-mod & bots tab
 * ===================
 * Owners and admins set the group's buy bot and auto-mod here. Everything is
 * enforced in the database (community_chat_automod trigger, buy bot tick), so
 * the same rules hold on web and in the app and cannot be skipped by a client.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot, Loader2, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useGroupBotSettings,
  useUpdateGroupBotSettings,
  type GroupBotSettingsPatch,
} from '@/hooks/use-community-admin';
import type { Community, CommunityMember } from '@/hooks/use-communities';

export interface AutoModTabProps {
  community: Community;
  membership: CommunityMember | null | undefined;
}

/** The buy bot never posts buys under $50; admins pick any size from there up. */
const MIN_USD_FLOOR = 50;
const MIN_USD_MAX = 1_000_000;
const FLOOD_MAX_OPTIONS = [3, 5, 8, 10, 15, 20];
const FLOOD_SECONDS_OPTIONS = [5, 10, 30, 60, 120, 300];

/** One word or phrase per line or comma. */
export function parseBannedWords(text: string): string[] {
  const seen = new Set<string>();
  for (const raw of text.split(/[\n,]+/)) {
    const word = raw.trim().toLowerCase().slice(0, 60);
    if (word) seen.add(word);
  }
  return [...seen].slice(0, 500);
}

export function AutoModTab({ community }: AutoModTabProps) {
  const { t } = useTranslation();
  const { data, isLoading, error } = useGroupBotSettings(community.id);
  const update = useUpdateGroupBotSettings();
  const [saving, setSaving] = useState<string | null>(null);
  const [wordsDraft, setWordsDraft] = useState('');
  const [minDraft, setMinDraft] = useState('');

  const serverWords = (data?.automod.banned_words ?? []).join('\n');
  useEffect(() => {
    setWordsDraft(serverWords);
  }, [serverWords]);

  const serverMin = data?.buy_bot.min_usd;
  useEffect(() => {
    if (serverMin != null) setMinDraft(String(Math.max(MIN_USD_FLOOR, serverMin)));
  }, [serverMin]);

  const save = (key: string, patch: GroupBotSettingsPatch, done?: string) => {
    setSaving(key);
    update.mutate(
      { communityId: community.id, patch },
      {
        onSuccess: () => toast.success(done ?? t('communities.automod.saved', { defaultValue: 'Saved' })),
        onSettled: () => setSaving(null),
      },
    );
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <p className="text-center text-zinc-500 text-sm py-8">
        {t('communities.automod.noAccess', { defaultValue: 'Only the owner and admins can change these settings.' })}
      </p>
    );
  }

  const { automod, buy_bot: buyBot, token } = data;
  const wordsChanged = parseBannedWords(wordsDraft).join('\n') !== serverWords;
  const spin = (key: string) =>
    saving === key ? <Loader2 className="w-3.5 h-3.5 text-zinc-400 animate-spin shrink-0" /> : null;

  return (
    <div className="space-y-3">
      {/* ── Buy bot ─────────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-white/10 bg-white/[0.04] p-3.5">
        <h3 className="text-white font-medium text-sm flex items-center gap-2">
          <Bot className="w-4 h-4 text-zinc-400" />
          {t('communities.buyBot.title', { defaultValue: 'Buy bot' })}
        </h3>

        {!token.address ? (
          <p className="text-zinc-500 text-xs mt-1.5">
            {t('communities.buyBot.noToken', {
              defaultValue: 'Link a token from the group header (edit, then Ticker) and every buy shows up in this chat.',
            })}
          </p>
        ) : !token.supported ? (
          <p className="text-zinc-500 text-xs mt-1.5">
            {t('communities.buyBot.unsupported', {
              defaultValue:
                '${{symbol}} is on a chain or pool type the buy bot does not watch yet. Supported: Base, Ethereum, BNB Chain, Arbitrum, Polygon, Optimism and Avalanche (Uniswap v2/v3-style pools).',
              symbol: token.symbol ?? '',
            })}
          </p>
        ) : (
          <>
            <p className="text-zinc-500 text-xs mt-1">
              {t('communities.buyBot.hint', {
                defaultValue: 'Posts every ${{symbol}} buy into this chat, about a minute after it happens.',
                symbol: token.symbol ?? '',
              })}
            </p>
            <label className="mt-2 flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/[0.06] transition-colors cursor-pointer">
              <span className="flex-1 text-white text-sm">
                {t('communities.buyBot.enabled', { defaultValue: 'Post buy alerts' })}
              </span>
              {spin('bb-enabled')}
              <Switch
                checked={buyBot.enabled}
                disabled={saving !== null}
                onCheckedChange={(next) => save('bb-enabled', { buy_bot: { enabled: next } })}
                aria-label={t('communities.buyBot.enabled', { defaultValue: 'Post buy alerts' })}
              />
            </label>
            <div className="flex items-center gap-3 p-2.5">
              <span className="flex-1 text-white text-sm">
                {t('communities.buyBot.minUsd', { defaultValue: 'Smallest buy to post' })}
              </span>
              {spin('bb-min')}
              <div className="relative w-28">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">$</span>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={MIN_USD_FLOOR}
                  step={1}
                  value={minDraft}
                  disabled={saving !== null || !buyBot.enabled}
                  aria-label={t('communities.buyBot.minUsd', { defaultValue: 'Smallest buy to post' })}
                  className="h-9 rounded-xl border-white/10 bg-white/[0.04] pl-6 text-white text-sm"
                  onChange={(e) => setMinDraft(e.target.value.replace(/[^\d]/g, ''))}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  onBlur={() => {
                    const n = Math.min(MIN_USD_MAX, Math.max(MIN_USD_FLOOR, Math.round(Number(minDraft) || 0)));
                    setMinDraft(String(n));
                    if (n !== buyBot.min_usd) save('bb-min', { buy_bot: { min_usd: n } });
                  }}
                />
              </div>
            </div>
          </>
        )}
      </section>

      {/* ── Auto-mod ────────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-white/10 bg-white/[0.04] p-3.5">
        <h3 className="text-white font-medium text-sm flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-zinc-400" />
          {t('communities.automod.title', { defaultValue: 'Auto-mod' })}
        </h3>
        <p className="text-zinc-500 text-xs mt-1">
          {t('communities.automod.hint', {
            defaultValue: 'Blocks a message before anyone sees it and tells the sender why. Owners and admins are never blocked.',
          })}
        </p>

        <label className="mt-2 flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/[0.06] transition-colors cursor-pointer">
          <span className="flex-1 text-white text-sm">
            {t('communities.automod.enabled', { defaultValue: 'Auto-mod on' })}
          </span>
          {spin('am-enabled')}
          <Switch
            checked={automod.enabled}
            disabled={saving !== null}
            onCheckedChange={(next) => save('am-enabled', { automod: { enabled: next } })}
            aria-label={t('communities.automod.enabled', { defaultValue: 'Auto-mod on' })}
          />
        </label>

        <div className={automod.enabled ? 'space-y-0.5' : 'space-y-0.5 opacity-50 pointer-events-none'}>
          <div className="p-2.5">
            <span className="block text-white text-sm">
              {t('communities.automod.bannedWords', { defaultValue: 'Banned words' })}
            </span>
            <span className="block text-zinc-500 text-xs">
              {t('communities.automod.bannedWordsHint', {
                defaultValue: 'One per line or comma. Whole words only, and spaced-out spellings like s.c.a.m are caught too.',
              })}
            </span>
            <Textarea
              value={wordsDraft}
              onChange={(e) => setWordsDraft(e.target.value)}
              rows={4}
              maxLength={20000}
              placeholder={t('communities.automod.bannedWordsPlaceholder', { defaultValue: 'scam\nrug pull' })}
              className="mt-2 rounded-xl border-white/10 bg-white/[0.04] text-white text-sm"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-zinc-500 text-xs">
                {t('communities.automod.wordCount', {
                  defaultValue: '{{count}} words',
                  count: parseBannedWords(wordsDraft).length,
                })}
              </span>
              <Button
                size="sm"
                disabled={!wordsChanged || saving !== null}
                onClick={() => save('am-words', { automod: { banned_words: parseBannedWords(wordsDraft) } })}
              >
                {saving === 'am-words' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t('communities.automod.saveWords', { defaultValue: 'Save words' })}
              </Button>
            </div>
          </div>

          <label className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/[0.06] transition-colors cursor-pointer">
            <span className="flex-1 min-w-0">
              <span className="block text-white text-sm">{t('communities.automod.blockLinks', { defaultValue: 'Block links' })}</span>
              <span className="block text-zinc-500 text-xs">
                {t('communities.automod.blockLinksHint', { defaultValue: 'Off-site links and Telegram/Discord invites. Riftn links still work.' })}
              </span>
            </span>
            {spin('am-links')}
            <Switch
              checked={automod.block_links}
              disabled={saving !== null}
              onCheckedChange={(next) => save('am-links', { automod: { block_links: next } })}
            />
          </label>

          <label className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/[0.06] transition-colors cursor-pointer">
            <span className="flex-1 min-w-0">
              <span className="block text-white text-sm">{t('communities.automod.repeats', { defaultValue: 'Block repeats' })}</span>
              <span className="block text-zinc-500 text-xs">
                {t('communities.automod.repeatsHint', { defaultValue: 'Stops someone sending the same line again within 10 minutes.' })}
              </span>
            </span>
            {spin('am-repeats')}
            <Switch
              checked={automod.block_repeats}
              disabled={saving !== null}
              onCheckedChange={(next) => save('am-repeats', { automod: { block_repeats: next } })}
            />
          </label>

          <label className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/[0.06] transition-colors cursor-pointer">
            <span className="flex-1 min-w-0">
              <span className="block text-white text-sm">{t('communities.automod.flood', { defaultValue: 'Anti-flood' })}</span>
              <span className="block text-zinc-500 text-xs">
                {t('communities.automod.floodHint', {
                  defaultValue: 'At most {{max}} messages every {{seconds}}s per person.',
                  max: automod.flood_max,
                  seconds: automod.flood_seconds,
                })}
              </span>
            </span>
            {spin('am-flood')}
            <Switch
              checked={automod.flood_enabled}
              disabled={saving !== null}
              onCheckedChange={(next) => save('am-flood', { automod: { flood_enabled: next } })}
            />
          </label>
          {automod.flood_enabled && (
            <div className="flex items-center gap-2 px-2.5 pb-1">
              <Select
                value={String(automod.flood_max)}
                disabled={saving !== null}
                onValueChange={(v) => save('am-flood', { automod: { flood_max: Number(v) } })}
              >
                <SelectTrigger className="h-9 w-32 rounded-xl border-white/10 bg-white/[0.04] text-white text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[...new Set([...FLOOD_MAX_OPTIONS, automod.flood_max])].sort((a, b) => a - b).map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {t('communities.automod.floodMax', { defaultValue: '{{count}} messages', count: n })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-zinc-500 text-xs">{t('communities.automod.every', { defaultValue: 'every' })}</span>
              <Select
                value={String(automod.flood_seconds)}
                disabled={saving !== null}
                onValueChange={(v) => save('am-flood', { automod: { flood_seconds: Number(v) } })}
              >
                <SelectTrigger className="h-9 w-28 rounded-xl border-white/10 bg-white/[0.04] text-white text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[...new Set([...FLOOD_SECONDS_OPTIONS, automod.flood_seconds])].sort((a, b) => a - b).map((s) => (
                    <SelectItem key={s} value={String(s)}>
                      {s >= 60 ? `${s / 60} min` : `${s}s`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

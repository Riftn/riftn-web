import { useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Briefcase, Star, User } from 'lucide-react';
import { AuthContext } from '@/contexts/AuthContext';
import { getAccountInfo, updateProfile } from '@/lib/api/dehub';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  BUSINESS_CATEGORIES,
  CREATOR_CATEGORIES,
  isValidContactEmail,
  readAccountCategory,
  readAccountType,
  readContactEmail,
  type AccountType,
} from '@/lib/account-type';
import { SETTINGS_FIELD_CLASS, SETTINGS_INLINE_ACTION_CLASS, SETTINGS_LABEL_CLASS } from './SettingsRow';

const TYPES: { id: AccountType; icon: typeof User }[] = [
  { id: 'personal', icon: User },
  { id: 'creator', icon: Star },
  { id: 'business', icon: Briefcase },
];

/**
 * Settings > Account type: Personal, Creator or Business, a category shown
 * under the name, and (Business) a public contact email. Saves on its own,
 * merged into the profile's existing `customs` so no other setting is lost.
 */
export function AccountTypeSetting() {
  const { t } = useTranslation();
  const auth = useContext(AuthContext);
  const address = auth?.user?.address;
  const queryClient = useQueryClient();
  const [customs, setCustoms] = useState<Record<string, unknown> | null>(null);
  const [type, setType] = useState<AccountType>('personal');
  const [category, setCategory] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    getAccountInfo(address)
      .then((info) => {
        if (cancelled) return;
        const loaded = (info?.customs as Record<string, unknown> | undefined) ?? {};
        setCustoms(loaded);
        setType(readAccountType(loaded));
        setCategory(readAccountCategory(loaded));
        setEmail(readContactEmail(loaded) ?? '');
      })
      .catch(() => { if (!cancelled) setCustoms({}); });
    return () => { cancelled = true; };
  }, [address]);

  if (!address || !customs) return null;

  const savedType = readAccountType(customs);
  const savedCategory = readAccountCategory(customs);
  const savedEmail = readContactEmail(customs) ?? '';
  const dirty = type !== savedType || category !== savedCategory || (type === 'business' && email.trim() !== savedEmail);
  const categories: readonly string[] = type === 'creator' ? CREATOR_CATEGORIES : type === 'business' ? BUSINESS_CATEGORIES : [];
  const emailOk = isValidContactEmail(email);

  const save = async () => {
    if (!emailOk) return;
    setSaving(true);
    // Merged onto what is stored: the server replaces the whole blob.
    const next: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(customs)) {
      if (['accountType', 'accountCategory', 'contactEmail'].includes(key)) continue;
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') next[key] = value;
    }
    if (type !== 'personal') next.accountType = type;
    if (type !== 'personal' && category) next.accountCategory = category;
    if (type === 'business' && email.trim()) next.contactEmail = email.trim();
    try {
      await updateProfile({ customs: next });
      setCustoms(next);
      auth?.patchUser?.({ customs: next } as never);
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast.success(t('accountType.saved', 'Account type saved'));
    } catch {
      toast.error(t('accountType.saveFailed', 'Could not save your account type'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div data-setting-anchor="account-type" className="space-y-3">
      <div>
        <span className={SETTINGS_LABEL_CLASS}>{t('accountType.title', 'Account type')}</span>
        <p className="text-sm text-zinc-400">
          {t('accountType.hint', 'Creator and Business accounts show a category under your name. Business adds a Contact button. Every feature stays open to every account.')}
        </p>
      </div>
      <div role="radiogroup" aria-label={t('accountType.title', 'Account type')} className="grid grid-cols-3 gap-2">
        {TYPES.map(({ id, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={type === id}
            onClick={() => { setType(id); if (id !== type) setCategory(null); }}
            className={cn(
              'flex min-h-[64px] flex-col items-center justify-center gap-1.5 rounded-xl border px-2 text-sm font-medium transition-colors',
              type === id
                ? 'border-white/40 bg-white/[0.12] text-white'
                : 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700',
            )}
          >
            <Icon className="h-5 w-5" />
            {t(`accountType.type.${id}`, id === 'personal' ? 'Personal' : id === 'creator' ? 'Creator' : 'Business')}
          </button>
        ))}
      </div>
      {categories.length > 0 && (
        <div>
          <span className={SETTINGS_LABEL_CLASS}>{t('accountType.category', 'Category')}</span>
          <div className="flex flex-wrap gap-2">
            {categories.map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={category === id}
                onClick={() => setCategory(category === id ? null : id)}
                className={cn(
                  'min-h-9 rounded-full border px-3 text-sm transition-colors',
                  category === id
                    ? 'border-white/40 bg-white/[0.12] text-white'
                    : 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700',
                )}
              >
                {t(`accountType.cat.${id}`)}
              </button>
            ))}
          </div>
        </div>
      )}
      {type === 'business' && (
        <div>
          <label htmlFor="settings-contact-email" className={SETTINGS_LABEL_CLASS}>
            {t('accountType.contactEmail', 'Public contact email')}
          </label>
          <Input
            id="settings-contact-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder={t('accountType.contactEmailPlaceholder', 'hello@yourbusiness.com')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={SETTINGS_FIELD_CLASS}
          />
          {!emailOk && <p className="mt-1 text-sm text-red-400">{t('accountType.badEmail', 'That email does not look right')}</p>}
        </div>
      )}
      {dirty && (
        <Button type="button" onClick={save} disabled={saving || !emailOk} className={SETTINGS_INLINE_ACTION_CLASS}>
          {saving ? t('accountType.saving', 'Saving…') : t('accountType.save', 'Save account type')}
        </Button>
      )}
    </div>
  );
}

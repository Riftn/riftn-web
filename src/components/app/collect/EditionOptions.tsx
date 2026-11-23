import { useContext, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Plus, X } from 'lucide-react';
import { AuthContext } from '@/contexts/AuthContext';
import { searchUsers } from '@/lib/api/dehub/users';
import { DEFAULT_EDITION_SUPPLY, MAX_ROYALTY_TOTAL_BPS, bpsLabel } from '@/lib/api/dehub/collect';
import type { EditionChoice } from '@/lib/api/dehub/content';
import { formatCount } from '@/lib/format-count';
import { cn } from '@/lib/utils';

const MAX_SUPPLY = 1_000_000_000;
const OWN_SHARES = [0, 250, 500, 1000];
const isAddress = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s);

interface Split {
  address: string;
  label: string;
  bps: number;
}

/** Whole number of copies typed by the creator, or null while it is not one. */
export function parseCopies(text: string): number | null {
  const n = Number(text.replace(/[\s,._]/g, ''));
  return Number.isInteger(n) && n >= 1 && n <= MAX_SUPPLY ? n : null;
}

interface EditionOptionsProps {
  value: EditionChoice;
  onChange: (next: EditionChoice, valid: boolean) => void;
  disabled?: boolean;
  /** Start opened (state gallery). */
  defaultOpen?: boolean;
}

/**
 * How many copies a post mints and who earns when they are sold again. The
 * creator types any number of copies; resale royalties are their own share
 * plus anyone they split with, 10% at most in total.
 */
export function EditionOptions({ value, onChange, disabled, defaultOpen }: EditionOptionsProps) {
  const { t } = useTranslation();
  const me = useContext(AuthContext)?.walletAddress?.toLowerCase() ?? null;
  const [open, setOpen] = useState(!!defaultOpen);
  const [copies, setCopies] = useState(String(value.supply ?? DEFAULT_EDITION_SUPPLY));
  const [ownBps, setOwnBps] = useState(() => value.royalties?.find((r) => r.address.toLowerCase() === me)?.bps ?? 500);
  const [splits, setSplits] = useState<Split[]>([]);
  const [query, setQuery] = useState('');

  const supply = parseCopies(copies);
  const total = ownBps + splits.reduce((sum, s) => sum + s.bps, 0);
  const valid = supply != null && total <= MAX_ROYALTY_TOTAL_BPS;

  useEffect(() => {
    const royalties = [
      ...(me && ownBps > 0 ? [{ address: me, bps: ownBps }] : []),
      ...splits.filter((s) => s.bps > 0).map((s) => ({ address: s.address, bps: s.bps })),
    ];
    onChange({ supply: supply ?? undefined, royalties }, valid);
    // onChange is the parent's setter; re-running on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supply, ownBps, splits, me, valid]);

  const search = useQuery({
    queryKey: ['edition-split-search', query.trim().toLowerCase()],
    queryFn: () => searchUsers({ q: query.trim(), limit: 5 }),
    enabled: open && query.trim().length >= 2 && !isAddress(query.trim()),
    staleTime: 30_000,
  });
  const matches = useMemo(() => {
    const typed = query.trim();
    if (isAddress(typed)) return [{ address: typed.toLowerCase(), label: `${typed.slice(0, 6)}…${typed.slice(-4)}` }];
    return (search.data?.data ?? [])
      .map((u) => ({ address: String(u.address ?? u.wallet_address ?? '').toLowerCase(), label: u.username ? `@${u.username}` : String(u.displayName ?? '') }))
      .filter((u) => isAddress(u.address) && u.address !== me && !splits.some((s) => s.address === u.address));
  }, [query, search.data, me, splits]);

  const addSplit = (address: string, label: string) => {
    if (splits.length >= 7) return;
    setSplits((list) => [...list, { address, label, bps: 100 }]);
    setQuery('');
  };

  const summary = t('collect.editionSummary', {
    defaultValue: '{{copies}} copies · {{royalty}} on resales',
    copies: supply ? formatCount(supply) : '-',
    royalty: bpsLabel(total),
  });

  return (
    <div className="rounded-xl border border-white/10 bg-white/5" data-edition-options>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span className="flex-1 min-w-0">
          <span className="block text-white text-sm font-medium">{t('collect.editionTitle', { defaultValue: 'Copies and royalties' })}</span>
          <span className={cn('block text-xs', valid ? 'text-white/50' : 'text-red-300')}>{summary}</span>
        </span>
        <ChevronDown className={cn('w-4 h-4 text-white/60 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-4">
          <label className="block">
            <span className="block text-white/70 text-xs mb-1.5">{t('collect.copiesLabel', { defaultValue: 'How many copies' })}</span>
            <input
              type="text"
              inputMode="numeric"
              disabled={disabled}
              value={copies}
              onChange={(e) => setCopies(e.target.value.replace(/[^\d]/g, ''))}
              className="w-full box-border rounded-lg bg-black/30 border border-white/15 px-3 py-2 text-white text-sm tabular-nums focus:outline-none focus:border-white/40"
              aria-invalid={supply == null}
            />
            <span className={cn('block text-xs mt-1', supply == null ? 'text-red-300' : 'text-white/40')}>
              {supply == null
                ? t('collect.copiesInvalid', { defaultValue: 'Type a whole number, 1 or more.' })
                : supply === 1
                  ? t('collect.copiesOne', { defaultValue: 'One of one. Only a single person can own it.' })
                  : t('collect.copiesHint', { defaultValue: 'Any number you like. Each copy can be bought and sold on its own.' })}
            </span>
          </label>

          <div>
            <span className="block text-white/70 text-xs mb-1.5">{t('collect.yourRoyalty', { defaultValue: 'You earn on every resale' })}</span>
            <div className="flex gap-2 flex-wrap">
              {OWN_SHARES.map((bps) => (
                <button
                  key={bps}
                  type="button"
                  disabled={disabled}
                  onClick={() => setOwnBps(bps)}
                  data-kit-chip
                  data-size="sm"
                  data-active={ownBps === bps ? 'true' : undefined}
                  aria-pressed={ownBps === bps}
                >
                  <span>{bps === 0 ? t('collect.noRoyalty', { defaultValue: 'Nothing' }) : bpsLabel(bps)}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="block text-white/70 text-xs mb-1.5">{t('collect.splitWith', { defaultValue: 'Split royalties with people' })}</span>
            {splits.map((s) => (
              <div key={s.address} className="flex items-center gap-2 mb-2">
                <span className="flex-1 min-w-0 truncate text-white text-sm">{s.label}</span>
                <input
                  type="number"
                  min={0}
                  max={10}
                  step={0.5}
                  disabled={disabled}
                  value={s.bps / 100}
                  onChange={(e) => {
                    const pct = Math.max(0, Math.min(10, Number(e.target.value) || 0));
                    setSplits((list) => list.map((x) => (x.address === s.address ? { ...x, bps: Math.round(pct * 100) } : x)));
                  }}
                  className="w-16 box-border rounded-lg bg-black/30 border border-white/15 px-2 py-1 text-white text-sm tabular-nums text-right"
                  aria-label={t('collect.shareFor', { defaultValue: 'Share for {{name}}', name: s.label })}
                />
                <span className="text-white/50 text-sm">%</span>
                <button
                  type="button"
                  onClick={() => setSplits((list) => list.filter((x) => x.address !== s.address))}
                  className="p-1 text-white/50 hover:text-white"
                  aria-label={t('collect.removeSplit', { defaultValue: 'Remove' })}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            {splits.length < 7 && (
              <div className="relative">
                <div className="flex items-center gap-2 rounded-lg bg-black/30 border border-white/15 px-3">
                  <Plus className="w-4 h-4 text-white/40 shrink-0" />
                  <input
                    type="text"
                    disabled={disabled}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t('collect.splitSearch', { defaultValue: 'Username or wallet' })}
                    className="flex-1 min-w-0 bg-transparent py-2 text-white text-sm placeholder:text-white/30 focus:outline-none"
                  />
                </div>
                {matches.length > 0 && (
                  <div className="mt-1 rounded-lg border border-white/10 bg-black/80 overflow-hidden">
                    {matches.map((m) => (
                      <button
                        key={m.address}
                        type="button"
                        onClick={() => addSplit(m.address, m.label || `${m.address.slice(0, 6)}…`)}
                        className="w-full px-3 py-2 text-left text-white text-sm hover:bg-white/10 truncate"
                      >
                        {m.label || m.address}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <span className={cn('block text-xs mt-1.5', total > MAX_ROYALTY_TOTAL_BPS ? 'text-red-300' : 'text-white/40')}>
              {total > MAX_ROYALTY_TOTAL_BPS
                ? t('collect.royaltyTooHigh', { defaultValue: 'All shares together can be 10% at most. Now {{total}}.', total: bpsLabel(total) })
                : t('collect.royaltyHint', { defaultValue: 'Paid automatically each time a copy sells on Riftn. 10% at most in total.' })}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

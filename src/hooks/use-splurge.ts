import { useRef, useState } from 'react';
import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { getSplurgeHistory, saveSplurgeEntry, type SplurgeEntry, type SplurgeHistory } from '@/lib/api/dehub/games';

export const SPLURGE_ITEM_LIMIT = 160;
export type SplurgeMode = 'modern' | 'crt';

function newBudget(previous?: number) {
  const amount = Math.floor(Math.random() * 32_000) + 1;
  return amount === previous ? amount % 32_000 + 1 : amount;
}

export function useSplurge(address: string | null, currency: string, newId: () => string) {
  const [mode, setMode] = useState<SplurgeMode>('modern');
  const [amount, setAmount] = useState(newBudget);
  const [item, setItem] = useState('');
  const [guestEntries, setGuestEntries] = useState<SplurgeEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const pending = useRef<SplurgeEntry | null>(null);
  const inFlight = useRef(false);
  const queryClient = useQueryClient();
  const queryKey = ['splurge', address] as const;
  const history = useInfiniteQuery({
    queryKey,
    enabled: !!address,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => address ? getSplurgeHistory(address, pageParam) : Promise.resolve({ entries: [], nextCursor: null }),
    getNextPageParam: page => page.nextCursor,
    retry: false,
  });
  const entries = address ? history.data?.pages.flatMap(page => page.entries) ?? [] : guestEntries;
  const canSubmit = item.trim().length > 0 && !saving && (!address || !!history.data);

  async function submit() {
    if (!canSubmit || inFlight.current) return false;
    inFlight.current = true;
    setSaving(true);
    setSaveError(false);
    try {
      const turn = pending.current ?? { turnId: newId(), item: item.trim(), amount, currency };
      if (address) {
        pending.current = turn;
        const { entry } = await saveSplurgeEntry(address, turn);
        await queryClient.cancelQueries({ queryKey });
        queryClient.setQueryData<InfiniteData<SplurgeHistory>>(queryKey, (data) => {
          if (!data || data.pages.some(page => page.entries.some(row => row.turnId === entry.turnId))) return data;
          const [first, ...rest] = data.pages;
          return { ...data, pages: [{ ...first, entries: [entry, ...first.entries] }, ...rest] };
        });
      } else {
        setGuestEntries(current => [turn, ...current]);
      }
      pending.current = null;
      setAmount(newBudget(amount));
      setItem('');
      return true;
    } catch {
      // Keep the same turn ID if the server saved it but the response was lost.
      setSaveError(true);
      return false;
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return { mode, setMode, amount, item, setItem, entries, canSubmit, saving, saveError, submit, history };
}

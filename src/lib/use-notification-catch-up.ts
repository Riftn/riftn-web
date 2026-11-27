import { useEffect, useRef, useState } from 'react';
import {
  catchUpItem, catchUpPayload, CATCH_UP_LIMIT, readCatchUpResult, replyTargetKey,
  type CatchUpItem, type CatchUpResult,
} from './notification-catch-up';

type Source = Parameters<typeof catchUpItem>[0];

type Actions<T extends Source> = {
  wallet: string;
  language: string;
  load: () => Promise<T[]>;
  analyze: (payload: string) => Promise<string>;
  markRead: (source: T) => Promise<void>;
  send: (target: NonNullable<CatchUpItem<T>['replyTarget']>, text: string) => Promise<void>;
  refresh: () => void;
};

export function useNotificationCatchUp<T extends Source>(actions: Actions<T>) {
  const [question, setQuestion] = useState('');
  const [items, setItems] = useState<CatchUpItem<T>[]>([]);
  const [result, setResult] = useState<CatchUpResult | null>(null);
  const [checked, setChecked] = useState<number[]>([]);
  const [drafts, setDrafts] = useState<CatchUpResult['drafts']>([]);
  const [status, setStatus] = useState<
    { key: 'empty' | 'askError' | 'undone' | 'writing' } |
    { key: 'cleared' | 'sent'; count: number; failed: number } | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(0);
  const [preview, setPreview] = useState(false);
  const running = useRef(false);
  const active = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sent = useRef(new Set<string>());

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
    };
  }, []);

  async function ask(value: string, showCleanup = false) {
    const query = value.trim();
    if (!query || running.current || timer.current !== null) return;
    running.current = true;
    setBusy(true);
    setStatus(null);
    try {
      const rows = await actions.load();
      if (!active.current) return;
      const next = rows.filter(row => !row.read).slice(0, CATCH_UP_LIMIT)
        .map(row => catchUpItem(row, actions.wallet));
      if (!next.length) {
        setItems([]);
        setResult(null);
        setDrafts([]);
        setPreview(false);
        setStatus({ key: 'empty' });
        setQuestion('');
        return;
      }
      const raw = await actions.analyze(catchUpPayload(next, query, actions.language));
      if (!active.current) return;
      const parsed = readCatchUpResult(raw, next);
      setItems(next);
      setResult(parsed);
      setPreview(showCleanup || parsed.showCleanup);
      setChecked(parsed.cleanup);
      setDrafts(parsed.drafts.filter(draft => {
        const target = next[draft.index].replyTarget;
        return target && !sent.current.has(replyTargetKey(target));
      }));
      setQuestion('');
    } catch {
      if (active.current) setStatus({ key: 'askError' });
    } finally {
      running.current = false;
      if (active.current) setBusy(false);
    }
  }

  function toggle(index: number) {
    setChecked(previous => previous.includes(index) ? previous.filter(value => value !== index) : [...previous, index]);
  }

  function clear() {
    if (!checked.length || running.current || timer.current !== null) return;
    const selection = [...checked];
    setPending(selection.length);
    setStatus(null);
    timer.current = setTimeout(async () => {
      timer.current = null;
      running.current = true;
      setBusy(true);
      setPending(0);
      setStatus({ key: 'writing' });
      const saved = new Set<number>();
      try {
        const fresh = new Map((await actions.load()).map(row => [row._id, row]));
        for (const index of selection) {
          if (!active.current) return;
          const source = items[index].source;
          const latest = fresh.get(source._id);
          if (!latest || latest.read || latest.updatedAt !== source.updatedAt) continue;
          try {
            await actions.markRead(latest);
            saved.add(index);
          } catch {
            // A failed item stays in the cleanup preview for retry.
          }
        }
        if (!active.current) return;
        setResult(previous => previous && { ...previous, cleanup: previous.cleanup.filter(index => !saved.has(index)) });
        setChecked(previous => previous.filter(index => !saved.has(index)));
        setStatus({ key: 'cleared', count: saved.size, failed: selection.length - saved.size });
        actions.refresh();
      } catch {
        if (active.current) setStatus({ key: 'cleared', count: saved.size, failed: selection.length - saved.size });
      } finally {
        running.current = false;
        if (active.current) setBusy(false);
      }
    }, 8000);
  }

  function undo() {
    if (timer.current === null) return;
    clearTimeout(timer.current);
    timer.current = null;
    setPending(0);
    setStatus({ key: 'undone' });
  }

  function editDraft(index: number, text: string) {
    setDrafts(previous => previous.map(draft => draft.index === index ? { index, text } : draft));
  }

  function removeDraft(index: number) {
    setDrafts(previous => previous.filter(draft => draft.index !== index));
  }

  async function sendDrafts() {
    if (running.current || timer.current !== null) return;
    const approved = drafts.filter(draft => draft.text.trim());
    if (!approved.length) return;
    running.current = true;
    setBusy(true);
    setStatus(null);
    const successful = new Set<number>();
    try {
      for (const draft of approved) {
        if (!active.current) return;
        const item = items[draft.index];
        const target = item.replyTarget;
        if (!target || sent.current.has(replyTargetKey(target))) continue;
        try {
          await actions.send(target, draft.text.trim());
          sent.current.add(replyTargetKey(target));
          successful.add(draft.index);
          try { if (active.current) await actions.markRead(item.source); } catch { /* The reply was already posted. */ }
        } catch {
          // Keep this draft editable and available for retry.
        }
      }
      if (!active.current) return;
      setDrafts(previous => previous.filter(draft => !successful.has(draft.index)));
      setStatus({ key: 'sent', count: successful.size, failed: approved.length - successful.size });
      actions.refresh();
    } finally {
      running.current = false;
      if (active.current) setBusy(false);
    }
  }

  return {
    question, setQuestion, items, result, checked, drafts, status, busy, pending, preview, setPreview,
    ask, toggle, clear, undo, editDraft, removeDraft, sendDrafts,
  };
}

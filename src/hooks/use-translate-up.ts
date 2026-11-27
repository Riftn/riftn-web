/**
 * "Translate" on one chat message translates every message above it too.
 *
 * Each bubble registers itself under a scope ('dm', 'room'). A tap translates
 * that bubble straight away, then asks every bubble of the same scope sent at
 * or before it, that can still be translated, to follow: nearest first, a few
 * at a time, so a long thread does not fire hundreds of requests at once.
 * Lines already in the reader's language come back from the translation cache
 * as no-ops, so tapping again costs nothing for them.
 */
import { useCallback, useEffect, useRef } from 'react';

export interface TranslateUpRequest {
  scope: string;
  /** Time of the tapped message; everything at or before it joins. */
  upTo: number;
  /** The tapped message, already translating on its own. */
  excludeId: string;
}

type Job = { at: number; run: () => Promise<unknown> | void };
type Listener = (request: TranslateUpRequest) => Job | null;

const listeners = new Set<Listener>();

export function onTranslateUp(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** At most this many translations in flight from one tap. */
export const TRANSLATE_UP_CONCURRENCY = 3;
let running = 0;
const waiting: Array<() => void> = [];

export function queueTranslation(task: () => Promise<unknown> | void): Promise<void> {
  return new Promise((resolve) => {
    const start = () => {
      running += 1;
      Promise.resolve()
        .then(task)
        .catch(() => {})
        .finally(() => {
          running -= 1;
          resolve();
          waiting.shift()?.();
        });
    };
    if (running < TRANSLATE_UP_CONCURRENCY) start();
    else waiting.push(start);
  });
}

/** Ask every earlier bubble in the scope that still needs it to translate. Returns how many joined. */
export function requestTranslateUp(request: TranslateUpRequest): number {
  const jobs: Job[] = [];
  for (const listener of listeners) {
    const job = listener(request);
    if (job) jobs.push(job);
  }
  jobs.sort((a, b) => b.at - a.at);
  for (const job of jobs) void queueTranslation(job.run);
  return jobs.length;
}

/** A message's time as epoch ms: ISO strings, Dates and numbers; 0 when unreadable. */
export function messageTime(value: unknown): number {
  if (value instanceof Date) return value.getTime() || 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') return Date.parse(value) || 0;
  return 0;
}

/**
 * Register one bubble and get its tap handler. `canJoin` is whether this
 * bubble would still change if translated (someone else's text, not already
 * translated, not mid-request).
 */
export function useTranslateUp(
  scope: string,
  id: string,
  at: unknown,
  canJoin: boolean,
  translate: () => Promise<unknown> | void,
  translateEarlier = translate,
): () => void {
  const translateRef = useRef(translate);
  translateRef.current = translate;
  const translateEarlierRef = useRef(translateEarlier);
  translateEarlierRef.current = translateEarlier;
  const joinRef = useRef(canJoin);
  joinRef.current = canJoin;
  const time = messageTime(at);

  useEffect(() => onTranslateUp((request) => {
    if (request.scope !== scope || request.excludeId === id || !joinRef.current || time > request.upTo) return null;
    return { at: time, run: () => translateEarlierRef.current() };
  }), [scope, id, time]);

  return useCallback(() => {
    void translateRef.current();
    requestTranslateUp({ scope, upTo: time, excludeId: id });
  }, [scope, id, time]);
}

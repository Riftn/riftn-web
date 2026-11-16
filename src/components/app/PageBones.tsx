/**
 * A page's loading placeholder, drawn from the page's own measured layout:
 * a grey bar where each line of text lands, a block for each picture and
 * control, a faint panel for each card. The shapes come from
 * src/data/page-bones.json, which scripts/page-bones.mjs writes by opening the
 * real pages, so a placeholder cannot drift into a shape its page never has.
 *
 * This file and its data are one lazy chunk (see PageBonesLoader).
 */
import { useContext, useMemo, useSyncExternalStore, type ComponentType, type CSSProperties } from 'react';
import { AuthContext } from '@/contexts/AuthContext';
import { PhonePillSkeleton } from './PageSkeletons';
import bones from '@/data/page-bones.json';
import '@/styles/skeleton.css';

type Size = 'phone' | 'tablet' | 'desktop' | 'wide';
/** [measured width, height, has phone pill, "x,y,w,h,radius,kind;…"] — x and w in tenths of a percent. */
type Entry = [number, number, number, string];
type BonesData = Record<string, Partial<Record<Size, Entry>>>;

const data = bones as unknown as BonesData;

const SIZE_QUERIES: [Size, string][] = [
  ['phone', '(max-width: 600px)'],
  ['tablet', '(max-width: 1023px)'],
  ['desktop', '(max-width: 1500px)'],
];
function currentSize(): Size {
  if (typeof window === 'undefined') return 'desktop';
  for (const [size, query] of SIZE_QUERIES) if (window.matchMedia(query).matches) return size;
  return 'wide';
}
function subscribeSize(cb: () => void) {
  const lists = SIZE_QUERIES.map(([, query]) => window.matchMedia(query));
  lists.forEach((l) => l.addEventListener('change', cb));
  return () => lists.forEach((l) => l.removeEventListener('change', cb));
}
/** The nearest measured width when a page has no entry for this one. */
const FALLBACKS: Record<Size, Size[]> = {
  phone: ['phone', 'tablet'],
  tablet: ['tablet', 'phone', 'desktop'],
  desktop: ['desktop', 'wide', 'tablet'],
  wide: ['wide', 'desktop'],
};

/** Length of one pass of the shine in skeleton.css. */
const SHINE_MS = 1300;
/** Every placeholder's shine runs on one clock, so a swap between two never restarts it. */
export function shinePhase(): string {
  if (typeof performance === 'undefined') return '0ms';
  return `${-Math.round(performance.now() % SHINE_MS)}ms`;
}

const parsed = new Map<string, (string | number)[][]>();
function shapes(raw: string) {
  let list = parsed.get(raw);
  if (!list) {
    list = raw.split(';').map((bone) => bone.split(',').map((v, i) => (i < 5 ? Number(v) : v)));
    parsed.set(raw, list);
  }
  return list;
}

/**
 * Pages measured signed out that are a different page once signed in (a
 * sign-in prompt against the account's own dashboard): their bones are only
 * right for a visitor.
 */
const VISITOR_ONLY = new Set(['agents', 'ads']);

export function PageBones({ page, fallback: Fallback }: { page: string; fallback: ComponentType }) {
  const size = useSyncExternalStore(subscribeSize, currentSize, () => 'desktop' as Size);
  const entry = useMemo(() => {
    const sizes = data[page];
    if (!sizes) return null;
    for (const s of FALLBACKS[size]) if (sizes[s]) return sizes[s]!;
    return null;
  }, [page, size]);
  const delay = useMemo(shinePhase, []);
  const signedIn = !!useContext(AuthContext)?.isAuthenticated;
  if (!entry || (signedIn && VISITOR_ONLY.has(page))) return <Fallback />;
  const [, height, pill, raw] = entry;
  return (
    <div data-page-bones={page} data-skeleton-shine aria-hidden="true" className="page-bones"
      style={{ height, '--shine-delay': delay } as CSSProperties}>
      {pill ? <PhonePillSkeleton /> : null}
      {shapes(raw).map(([x, y, w, h, r, kind], i) => (
        <i key={i} className={kind as string}
          style={{ left: `${(x as number) / 10}%`, top: y as number, width: `${(w as number) / 10}%`, height: h as number, borderRadius: r as number }} />
      ))}
    </div>
  );
}

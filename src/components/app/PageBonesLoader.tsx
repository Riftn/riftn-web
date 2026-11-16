/**
 * Boot-path side of the measured page placeholders: PageBones and its data
 * are one lazy chunk, fetched when the browser is first idle or by the first
 * placeholder that needs it. Until it lands the page's older placeholder shows.
 */
import { useSyncExternalStore, type ComponentType } from 'react';

type Bones = ComponentType<{ page: string; fallback: ComponentType }>;
let Impl: Bones | null = null;
let asked = false;
const waiting = new Set<() => void>();
function load() {
  if (asked) return;
  asked = true;
  void import('./PageBones')
    .then((m) => { Impl = m.PageBones; waiting.forEach((cb) => cb()); })
    .catch(() => { asked = false; });
}
if (typeof window !== 'undefined') {
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (idle) idle(load, { timeout: 4000 }); else window.setTimeout(load, 2500);
}
const subscribe = (cb: () => void) => { waiting.add(cb); return () => { waiting.delete(cb); }; };

/** A cached page's placeholder: its measured bones, or `fallback` until they exist. */
export function withPageBones(page: string, Fallback: ComponentType): ComponentType {
  function BonesSkeleton() {
    load();
    const Ready = useSyncExternalStore(subscribe, () => Impl, () => null);
    return Ready ? <Ready page={page} fallback={Fallback} /> : <Fallback />;
  }
  BonesSkeleton.displayName = `PageBones(${page})`;
  return BonesSkeleton;
}

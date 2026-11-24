/**
 * Boot-path side of the measured page placeholders: PageBones and its data
 * are one lazy chunk, fetched when the browser is first idle or by the first
 * placeholder that needs it. Until it lands the page's older placeholder shows.
 */
import { useState, type ComponentType } from 'react';

type Bones = ComponentType<{ page: string; fallback: ComponentType }>;
let Impl: Bones | null = null;
let asked = false;
function load() {
  if (asked) return;
  asked = true;
  void import('./PageBones')
    .then((m) => { Impl = m.PageBones; })
    .catch(() => { asked = false; });
}
if (typeof window !== 'undefined') {
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (idle) idle(load, { timeout: 4000 }); else window.setTimeout(load, 2500);
}
/** Pages whose placeholder was already drawn without the bones. */
const drawnWithout = new Set<string>();

/**
 * A cached page's placeholder: its measured bones once they have loaded,
 * else `fallback`. A page keeps whichever it was first drawn with, so a
 * placeholder never swaps for a differently shaped one while it is on screen
 * (the bones landing mid-load used to morph the cold-load placeholder).
 */
export function withPageBones(page: string, Fallback: ComponentType): ComponentType {
  function BonesSkeleton() {
    load();
    const [Ready] = useState(() => (drawnWithout.has(page) ? null : Impl));
    if (!Ready) drawnWithout.add(page);
    return Ready ? <Ready page={page} fallback={Fallback} /> : <Fallback />;
  }
  BonesSkeleton.displayName = `PageBones(${page})`;
  return BonesSkeleton;
}

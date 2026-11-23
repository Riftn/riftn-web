/**
 * Where every overlay portals to
 * ==============================
 * Radix and vaul portal to `document.body` by default, which makes each sheet,
 * menu and tooltip a sibling of `#root`. Tailwind's `space-x-*` / `space-y-*`
 * (and every `> * + *` rule of ours) end in a bare `~ :not([hidden])` or
 * `+ *`, and for a selector like that the browser cannot tell which siblings
 * an insert or a removal affects — so it restyles everything under the
 * parent. With `<body>` as that parent, "everything" is the whole app:
 * measured at ~500ms per insert or removal on the Stages page, paid once per
 * node. Closing one drawer removed two nodes and slid two copies out, which is
 * how a tap on the backdrop turned into two seconds of nothing.
 *
 * Portalling into this one container instead makes the container the parent
 * that gets restyled, and all it holds is the overlays themselves.
 *
 * It has no styles on purpose: no position, z-index, transform or opacity, so
 * it creates no stacking context and every overlay keeps competing with the
 * page on its own z-index exactly as it did under `<body>`.
 */
export const OVERLAY_ROOT_ID = 'overlay-root';

let root: HTMLElement | null = null;

export function overlayRoot(): HTMLElement | undefined {
  if (typeof document === 'undefined' || !document.body) return undefined;
  if (root?.isConnected) return root;
  root = document.getElementById(OVERLAY_ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = OVERLAY_ROOT_ID;
    document.body.appendChild(root);
  }
  return root;
}

import * as React from 'react';
import { ghostOverlayExit } from '@/lib/overlay-exit-ghost';

/**
 * The surfaces an overlay is showing right now. Content components register
 * their DOM node here; the root's OverlayExit reads it at the instant the
 * overlay closes.
 */
type Registry = { nodes: Set<HTMLElement> };
const OverlayExitRegistry = React.createContext<Registry | null>(null);

/**
 * Wraps an overlay root. When `present` flips to false (or the root goes away
 * while open), every registered surface is handed to ghostOverlayExit while it
 * is still on screen.
 *
 * A class because getSnapshotBeforeUpdate and componentWillUnmount are the two
 * lifecycles that run before React takes the DOM down. A function component's
 * layout-effect cleanup runs after its children's DOM is already gone.
 */
export class OverlayExit extends React.Component<{ present: boolean; children?: React.ReactNode }> {
  private registry: Registry = { nodes: new Set() };

  private ghostAll() {
    this.registry.nodes.forEach((node) => ghostOverlayExit(node));
  }

  getSnapshotBeforeUpdate(prev: { present: boolean }) {
    if (prev.present && !this.props.present) this.ghostAll();
    return null;
  }

  componentDidUpdate() {
    /* required alongside getSnapshotBeforeUpdate */
  }

  componentWillUnmount() {
    if (this.props.present) this.ghostAll();
  }

  render() {
    return <OverlayExitRegistry.Provider value={this.registry}>{this.props.children}</OverlayExitRegistry.Provider>;
  }
}

/** A ref for an overlay's surface (content element) that also registers it for the exit slide. */
export function useOverlayExitRef<T extends HTMLElement>(forwarded: React.ForwardedRef<T>) {
  const registry = React.useContext(OverlayExitRegistry);
  const current = React.useRef<T | null>(null);
  const forwardedRef = React.useRef(forwarded);
  forwardedRef.current = forwarded;
  return React.useCallback(
    (el: T | null) => {
      if (registry) {
        if (current.current && current.current !== el) registry.nodes.delete(current.current);
        if (el) registry.nodes.add(el);
      }
      current.current = el;
      const f = forwardedRef.current;
      if (typeof f === 'function') f(el);
      else if (f) f.current = el;
    },
    [registry],
  );
}

/**
 * LadderAvatar — a person's picture that never renders as a dead square
 * =====================================================================
 * The Cloudflare image transform on dehub.io is one hop that can fail on its
 * own (it answered 503 for a run of feed avatars while the files behind it
 * were fine at 200). A bare <img> pointed at the transform has nowhere to go
 * when that happens, so the avatar paints as an empty box — and the
 * document-level retry in `image-origin-fallback` is undone the moment React
 * re-renders the card and writes the transform URL back onto the element.
 *
 * So the fallback lives in component state instead: the resized picture, the
 * same file untouched (in case the resizer is what failed), the wallet's own
 * canonical picture on the CDN, and finally the initial. Something readable is
 * always on screen, and it survives re-renders.
 *
 * @module components/app/LadderAvatar
 */

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  buildAvatarCdnFallbackUrl,
  buildAvatarUrl,
  cdnImageSource,
  deviceWidth,
} from '@/lib/media-url';

/** Every URL worth trying for this person, best first, no repeats. */
export function avatarSources(
  address: string | null | undefined,
  stored: string | null | undefined,
  cssPx: number,
): string[] {
  const wallet = address || '';
  const sized = buildAvatarUrl(wallet, stored, deviceWidth(cssPx));
  const candidates = [
    sized,
    cdnImageSource(sized),
    wallet ? buildAvatarCdnFallbackUrl(wallet, stored) : undefined,
    // The stored path itself may be what went stale (a picture changed since
    // the row was written); the wallet's canonical file is still there.
    wallet && stored ? buildAvatarCdnFallbackUrl(wallet) : undefined,
  ];
  const out: string[] = [];
  for (const url of candidates) {
    if (!url || url.startsWith('blob:') || out.includes(url)) continue;
    out.push(url);
  }
  return out;
}

export function initialOf(name: string | null | undefined, address: string | null | undefined): string {
  const label = (name || address || '').trim().replace(/^@/, '');
  if (!label) return '?';
  if (/^0x[0-9a-f]{2}/i.test(label)) return label.slice(2, 4).toUpperCase();
  return label.charAt(0).toUpperCase();
}

export function LadderAvatar({
  address,
  avatar,
  name,
  size,
  className,
  fallbackClassName,
  ...rest
}: {
  address?: string | null;
  /** The picture as stored on the row (host_avatar, a seat's avatar, a suggestion). */
  avatar?: string | null;
  /** Username, for the initial. */
  name?: string | null;
  /** Rendered size in CSS px, so the resizer is asked for the right width. */
  size: number;
  /** Box size, rounding, ring and text size of the initial. */
  className?: string;
  /** Extra classes on the initial, for surfaces that style it separately. */
  fallbackClassName?: string;
} & Omit<React.HTMLAttributes<HTMLSpanElement>, 'className' | 'children'>) {
  const sources = useMemo(() => avatarSources(address, avatar, size), [address, avatar, size]);
  const key = sources.join('|');
  // Keyed on the sources and reset during render, so a recycled card showing a
  // different person starts again from the top instead of from where the last
  // person's ladder ran out.
  const [attempt, setAttempt] = useState({ key, index: 0, loaded: false });
  if (attempt.key !== key) setAttempt({ key, index: 0, loaded: false });
  const src = attempt.key === key ? sources[attempt.index] : sources[0];

  return (
    <span
      {...rest}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden bg-zinc-700 font-medium leading-none text-white',
        className,
        // The tile colour is only for the initial; a loaded picture sits on
        // nothing, exactly as the plain <img> it replaces did.
        attempt.loaded && 'bg-transparent',
      )}
    >
      {!attempt.loaded && (
        <span aria-hidden className={fallbackClassName}>
          {initialOf(name, address)}
        </span>
      )}
      {src && (
        <img
          key={src}
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          className={cn('absolute inset-0 h-full w-full object-cover', !attempt.loaded && 'opacity-0')}
          onLoad={() => setAttempt((s) => (s.key === key ? { ...s, loaded: true } : s))}
          onError={() => setAttempt((s) => (s.key === key ? { key, index: s.index + 1, loaded: false } : s))}
        />
      )}
    </span>
  );
}

export default LadderAvatar;

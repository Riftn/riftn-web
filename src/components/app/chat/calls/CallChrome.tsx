import React, { useEffect, useState } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { getAccountSummaries } from '@/lib/api/dehub/users';
import '@/styles/call-stage.css';

/**
 * The shared chrome for every call surface: ringing, connecting, in-call and
 * ended all happen on one stage.
 *
 * The stage is mounted beside the app shell, so it carries its own palette
 * (styles/call-stage.css) instead of the shell's colour tokens, and each theme
 * restyles it there, down to the pulse around the avatar while a call rings.
 * What stays ours on every theme: no green accept and no red hang-up. The one
 * strong control is the solid fill, and which action gets it depends on the
 * step: accept while ringing, end once the call is up.
 */

export function shortenAddress(address: string): string {
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '';
}

export interface PeerIdentity {
  name: string;
  avatarUrl: string | null;
}

/**
 * Resolves the other side of a call to a username and avatar. The shortened
 * address stays as the fallback while the request is in flight and if it fails.
 */
export function usePeerIdentity(peerAddress: string): PeerIdentity {
  const [identity, setIdentity] = useState<PeerIdentity>({
    name: shortenAddress(peerAddress),
    avatarUrl: null,
  });

  useEffect(() => {
    let cancelled = false;
    setIdentity({ name: shortenAddress(peerAddress), avatarUrl: null });
    if (!peerAddress) return;

    getAccountSummaries([peerAddress])
      .then(summaries => {
        if (cancelled) return;
        const summary = summaries[0];
        if (!summary) return;
        const name = summary.username
          ? `@${summary.username}`
          : summary.displayName || shortenAddress(peerAddress);
        setIdentity({ name, avatarUrl: summary.avatarImageUrl ?? null });
      })
      .catch(() => {
        /* the shortened address is a fine answer */
      });

    return () => {
      cancelled = true;
    };
  }, [peerAddress]);

  return identity;
}

export function peerInitial(name: string): string {
  return name.replace(/^@/, '').slice(0, 1).toUpperCase() || '?';
}

/**
 * The stage itself. On a phone it fills the screen; from tablet width up it is
 * a call window over the dimmed app. Behind the content sits the other
 * person's picture, blurred and tinted by the theme, or their camera once a
 * video call is live (`remote`).
 */
export function CallStage({
  peer,
  video = false,
  live = false,
  remote,
  onMinimize,
  minimizeLabel,
  children,
}: {
  peer: PeerIdentity;
  video?: boolean;
  /** Remote video is on screen: chrome switches to its over-video treatment. */
  live?: boolean;
  remote?: React.ReactNode;
  onMinimize?: () => void;
  minimizeLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="call-stage" data-video={video ? 'true' : 'false'} data-live={live ? 'true' : 'false'} role="dialog" aria-modal="true" aria-label={peer.name}>
      <div className="call-stage__scrim hidden md:block" />
      <div className="call-stage__win">
        {live && remote ? (
          <div className="call-stage__remote">{remote}</div>
        ) : (
          <>
            {peer.avatarUrl ? <div className="call-stage__backdrop" style={{ backgroundImage: `url("${peer.avatarUrl}")` }} /> : null}
            <div className="call-stage__tint" />
          </>
        )}
        {onMinimize ? (
          <button type="button" className="call-stage__min" onClick={onMinimize} aria-label={minimizeLabel} title={minimizeLabel}>
            <ChevronDown className="h-5 w-5" />
          </button>
        ) : null}
        {children}
      </div>
    </div>
  );
}

/** Who is on the other end, and where the call has got to. `ringing` turns on the theme's pulse. */
export function CallIdentity({
  kindIcon: KindIcon,
  kindLabel,
  peer,
  status,
  ringing = false,
  children,
}: {
  kindIcon: React.ComponentType<{ className?: string }>;
  kindLabel: string;
  peer: PeerIdentity;
  status: React.ReactNode;
  ringing?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="call-stage__id">
      <div className="call-stage__kind">
        <KindIcon className="h-3.5 w-3.5" />
        <span>{kindLabel}</span>
      </div>
      <p className="call-stage__name">{peer.name}</p>
      <p className="call-stage__status" aria-live="polite">{status}</p>
      <div className={`call-stage__avatar${ringing ? ' call-rings' : ''}`}>
        {peer.avatarUrl
          ? <img src={peer.avatarUrl} alt="" />
          : <span>{peerInitial(peer.name)}</span>}
      </div>
      {children}
    </div>
  );
}

/** Voice bars. They only say "the line is open"; they do not meter the audio. */
export function CallWave({ paused = false, bars = 12 }: { paused?: boolean; bars?: number }) {
  const heights = [8, 16, 11, 22, 9, 19, 13, 22, 10, 17, 8, 14];
  return (
    <span className="call-wave" data-paused={paused ? 'true' : 'false'} aria-hidden>
      {heights.slice(0, bars).map((height, index) => (
        <i key={index} style={{ height, animationDelay: `${-index * 0.13}s` }} />
      ))}
    </span>
  );
}

/**
 * One round control with its label underneath. `active` inverts it to the solid
 * fill, the same treatment the primary action gets, so a muted mic reads at a
 * glance without reaching for a colour we do not have.
 */
export function CallControl({
  icon: Icon,
  label,
  onClick,
  active,
  primary,
  disabled,
  dimmed,
  compact,
}: {
  icon: LucideIcon | React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  active?: boolean;
  primary?: boolean;
  disabled?: boolean;
  /** Can't be turned on right now, but still tappable so it can say why. */
  dimmed?: boolean;
  /** Icon only, for the minimised pill. */
  compact?: boolean;
}) {
  const button = (
    <button
      type="button"
      className="call-btn"
      data-solid={(primary || active) && !dimmed ? 'true' : 'false'}
      data-dimmed={dimmed ? 'true' : undefined}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={compact ? label : undefined}
      aria-pressed={active ? true : undefined}
    >
      <Icon className={compact ? 'h-4 w-4' : 'h-6 w-6'} />
    </button>
  );
  if (compact) return button;
  return (
    <div className="call-ctl" data-dimmed={dimmed ? 'true' : undefined}>
      {button}
      <span>{label}</span>
    </div>
  );
}

/** The glass dock the round controls sit in. */
export function CallDock({ children, crowded }: { children: React.ReactNode; /** Five controls: tighter on a phone. */ crowded?: boolean }) {
  return <div className="call-dock" data-crowded={crowded ? 'true' : undefined}>{children}</div>;
}

/** A wide labelled button: accept, decline, call back. `solid` marks the one to press. */
export function CallPill({
  icon: Icon,
  label,
  onClick,
  solid,
  quiet,
}: {
  icon?: LucideIcon | React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  solid?: boolean;
  quiet?: boolean;
}) {
  return (
    <button type="button" className="call-pill" data-solid={solid ? 'true' : 'false'} data-quiet={quiet ? 'true' : 'false'} onClick={onClick}>
      {Icon ? <Icon className={quiet ? 'h-4 w-4' : 'h-5 w-5'} /> : null}
      <span>{label}</span>
    </button>
  );
}

/**
 * The host's invite to come on screen, as the viewer sees it on the player.
 *
 * Two faces side by side (the host, live, and you sliding in next to them),
 * "<name> wants you on their live", one strong Join and a quiet Not now.
 * A thin line in Join runs down over 30 seconds; when it ends the card tucks
 * into a small "Invite from <name>" chip that opens it again. Tucking never
 * declines: the seat stays invited until the viewer answers.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Video } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import './costream-invite.css';

export const INVITE_TUCK_MS = 30_000;

export interface CoStreamInviteCardProps {
  /** Host name without the @, or a short wallet. */
  hostName: string;
  hostAvatar?: string | null;
  myName?: string | null;
  myAvatar?: string | null;
  busy?: boolean;
  onJoin: () => void;
  onDecline: () => void;
  /** Start tucked (the gallery uses it to show the chip). */
  initiallyTucked?: boolean;
}

function Face({ src, name, className }: { src?: string | null; name: string; className?: string }) {
  return (
    <Avatar className={className}>
      {src ? <AvatarImage src={src} alt={name} /> : null}
      <AvatarFallback className="bg-zinc-700 text-[13px] font-semibold text-white">
        {name.replace(/^@/, '')[0]?.toUpperCase() || '?'}
      </AvatarFallback>
    </Avatar>
  );
}

export function CoStreamInviteCard({
  hostName,
  hostAvatar,
  myName,
  myAvatar,
  busy = false,
  onJoin,
  onDecline,
  initiallyTucked = false,
}: CoStreamInviteCardProps) {
  const { t } = useTranslation();
  const [tucked, setTucked] = useState(initiallyTucked);
  // Bumped on every reopen so the countdown line restarts from full.
  const [round, setRound] = useState(0);
  const name = hostName.replace(/^@/, '');
  const me = myName?.replace(/^@/, '') || t('costream.you', { defaultValue: 'You' });

  useEffect(() => { if (busy) setTucked(false); }, [busy]);

  if (tucked) {
    return (
      <button
        type="button"
        data-costream-invite-chip
        className="costream-invite-chip"
        onClick={() => { setTucked(false); setRound((r) => r + 1); }}
      >
        <Face src={hostAvatar} name={name} className="h-6 w-6 rounded-md" />
        <span className="truncate">{t('costream.inviteFrom', { defaultValue: 'Invite from {{name}}', name })}</span>
        <Video className="h-3.5 w-3.5 shrink-0" aria-hidden />
      </button>
    );
  }

  return (
    <div
      key={round}
      role="dialog"
      aria-live="polite"
      aria-label={t('costream.wantsYouOn', { defaultValue: '{{name}} wants you on their live', name })}
      data-costream-invite
      className="costream-invite"
    >
      <div className="costream-invite__top">
        <div className="costream-invite__faces" aria-hidden>
          <span className="costream-invite__host">
            <Face src={hostAvatar} name={name} className="h-10 w-10 rounded-lg" />
          </span>
          <span className="costream-invite__you">
            <Face src={myAvatar} name={me} className="h-10 w-10 rounded-lg" />
            <span className="costream-invite__cam"><Video className="h-2.5 w-2.5" /></span>
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="costream-invite__title">
            {(() => {
              // One sentence for translators; the name is drawn in full ink.
              const line = t('costream.wantsYouOn', { defaultValue: '{{name}} wants you on their live', name });
              const at = line.indexOf(name);
              if (at < 0) return line;
              return (
                <>
                  {line.slice(0, at)}<strong>{name}</strong>{line.slice(at + name.length)}
                </>
              );
            })()}
          </p>
          <p className="costream-invite__sub">
            {t('costream.inviteSub', { defaultValue: 'Go on screen with your camera and mic.' })}
          </p>
        </div>
      </div>
      <div className="costream-invite__actions">
        <button type="button" className="costream-invite__join" disabled={busy} onClick={onJoin}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
          {t('costream.joinLive', { defaultValue: 'Join live' })}
          {!busy && (
            <span
              className="costream-invite__timer"
              style={{ animationDuration: `${INVITE_TUCK_MS}ms` }}
              onAnimationEnd={() => setTucked(true)}
              aria-hidden
            />
          )}
        </button>
        <button type="button" className="costream-invite__later" disabled={busy} onClick={onDecline}>
          {t('costream.notNow', { defaultValue: 'Not now' })}
        </button>
      </div>
    </div>
  );
}

export default CoStreamInviteCard;

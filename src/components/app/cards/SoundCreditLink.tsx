import { soundCredit, SOUND_SOURCE_NAMES } from '@/lib/sound-window';
import { cn } from '@/lib/utils';

interface Props {
  url?: string;
  creator?: string;
  /** full: "© Artist · licence". short: the library's name only. */
  variant?: 'full' | 'short';
  className?: string;
}

/**
 * The credit a free song from an outside library owes its artist: who made
 * it, the licence, and a link to the song. Nothing for Riftn's own sounds.
 */
export function SoundCreditLink({ url, creator, variant = 'full', className }: Props) {
  const credit = soundCredit(url);
  if (!credit) return null;
  const library = SOUND_SOURCE_NAMES[credit.source as 'audius' | 'commons'];
  const full = [creator ? `© ${creator}` : '', credit.license, library].filter(Boolean).join(' · ');
  const text = variant === 'short' ? library : full;
  const stop = (event: React.SyntheticEvent) => event.stopPropagation();
  if (!credit.page) return <span className={className} title={full}>{text}</span>;
  return (
    <a
      href={credit.page}
      target="_blank"
      rel="noopener noreferrer"
      data-no-navigate
      title={full}
      onClick={stop}
      onPointerDown={stop}
      className={cn('pointer-events-auto underline-offset-2 hover:underline', className)}
    >
      {text}
    </a>
  );
}

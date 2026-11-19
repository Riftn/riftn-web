import { soundCredit } from '@/lib/sound-window';
import { cn } from '@/lib/utils';

interface Props {
  url?: string;
  creator?: string;
  /** "© Artist · licence". The library the song came from is not named on posts. */
  className?: string;
}

/**
 * The credit a free song from an outside library owes its artist: who made
 * it, the licence, and a link to the song. Nothing for Riftn's own sounds.
 */
export function SoundCreditLink({ url, creator, className }: Props) {
  const credit = soundCredit(url);
  if (!credit) return null;
  const text = [creator ? `© ${creator}` : '', credit.license].filter(Boolean).join(' · ');
  const stop = (event: React.SyntheticEvent) => event.stopPropagation();
  if (!credit.page) return <span className={className} title={text}>{text}</span>;
  return (
    <a
      href={credit.page}
      target="_blank"
      rel="noopener noreferrer"
      data-no-navigate
      title={text}
      onClick={stop}
      onPointerDown={stop}
      className={cn('pointer-events-auto underline-offset-2 hover:underline', className)}
    >
      {text}
    </a>
  );
}

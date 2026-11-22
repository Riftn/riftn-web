import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TranslatableText } from '@/components/app/TranslatableText';
import { STATUS_LABELS, type FeatureStatus } from '@/hooks/use-feature-requests';
import { earlyAccessHoursLeft } from '@/lib/early-access';
import '@/styles/request-status.css';

// Statuses still on their way: they get the Asked > now > Shipped track.
const TRACKED: FeatureStatus[] = ['under_review', 'planned', 'in_progress'];

/**
 * Category, where the request is (Asked > In progress > Shipped) and the
 * owners' progress note under a request. One accent per theme, no status hues.
 * The track fills once when it scrolls into view, then the current step
 * breathes slowly while the work is going on.
 */
export function RequestStatusRow({
  status,
  note,
  categoryChip,
  earlyAccessUntil,
  isPoster = false,
}: {
  status: FeatureStatus;
  note: string;
  categoryChip: React.ReactNode;
  /** Shipped with a head start for its poster until this time. */
  earlyAccessUntil?: string | null;
  isPoster?: boolean;
}) {
  const { t } = useTranslation();
  const earlyHours = status === 'shipped' || status === 'completed' ? earlyAccessHoursLeft(earlyAccessUntil) : null;
  const tracked = TRACKED.includes(status);
  // Declined keeps its own "Why:" line below the row.
  const liveNote = status !== 'declined' ? note : '';

  return (
    <div className="rq">
      <div className="rq-row">
        {categoryChip}
        {status === 'declined' && (
          <span className="rq-flat-status">
            <i className="rq-dot" aria-hidden />
            {STATUS_LABELS.declined}
          </span>
        )}
      </div>
      {tracked && <Track status={status} t={t} />}
      {earlyHours !== null && (
        <p className="rq-note" data-early-access>
          {isPoster
            ? t('features.earlyAccess.mine', { defaultValue: 'You have this a day early. Everyone else gets it in {{hours}} h.', hours: earlyHours })
            : t('features.earlyAccess.others', { defaultValue: 'Its poster is trying this first. Out for everyone in {{hours}} h.', hours: earlyHours })}
        </p>
      )}
      {liveNote && (
        <p className="rq-note">
          <TranslatableText publicContent text={liveNote} as="span" hideControls />
        </p>
      )}
    </div>
  );
}

function nowLabel(status: FeatureStatus, t: ReturnType<typeof useTranslation>['t']): string {
  if (status === 'under_review') return t('features.track.underReview', 'Under review');
  if (status === 'planned') return t('features.track.planned', 'Planned');
  return t('features.track.inProgress', 'In progress');
}

function Track({ status, t }: { status: FeatureStatus; t: ReturnType<typeof useTranslation>['t'] }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [seen, setSeen] = useState(false);

  // Play the fill when the card reaches the screen, not while it is far below.
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); }
    }, { threshold: 0.6 });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);

  const now = nowLabel(status, t);
  return (
    <span
      ref={ref}
      className="rq-track"
      data-in={seen ? '' : undefined}
      role="img"
      aria-label={`${t('features.track.label', 'Progress')}: ${now}`}
    >
      <span className="rq-step rq-done">
        <i className="rq-step-dot" aria-hidden />
        {t('features.track.asked', 'Asked')}
      </span>
      <i className="rq-seg rq-seg-done" aria-hidden />
      <span className="rq-step rq-now">
        <i className="rq-step-dot" aria-hidden />
        {now}
      </span>
      <i className="rq-seg rq-seg-next" aria-hidden />
      <span className="rq-step">
        <i className="rq-step-dot" aria-hidden />
        {t('features.track.shipped', 'Shipped')}
      </span>
    </span>
  );
}

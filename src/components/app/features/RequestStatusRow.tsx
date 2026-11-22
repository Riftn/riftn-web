import { translateCopy as _translateCopy } from '@/i18n/copy';
import { TranslatableText } from '@/components/app/TranslatableText';
import { Loader2 as QueuedIcon } from 'lucide-react';
import { STATUS_LABELS, type FeatureStatus } from '@/hooks/use-feature-requests';
import '@/styles/request-status.css';

/**
 * Category, status and the owners' progress note under a request.
 *
 * Concept round: `?chips=a|b|c|d` (kept in localStorage `rq.chips`) picks the
 * look; anything else renders today's chips.
 */
export type ChipConcept = 'today' | 'a' | 'b' | 'c' | 'd';

export function chipConcept(): ChipConcept {
  try {
    const q = new URLSearchParams(window.location.search).get('chips');
    if (q) localStorage.setItem('rq.chips', q);
    const v = (q || localStorage.getItem('rq.chips') || '').toLowerCase();
    return v === 'a' || v === 'b' || v === 'c' || v === 'd' ? v : 'today';
  } catch {
    return 'today';
  }
}

const TODAY_STATUS: Partial<Record<FeatureStatus, string>> = {
  under_review: 'bg-amber-400/15 text-amber-300/90 border-amber-300/25',
  planned: 'bg-blue-400/15 text-blue-300/90 border-blue-300/25',
  in_progress: 'bg-violet-400/15 text-violet-300/90 border-violet-300/25',
  declined: 'bg-red-400/15 text-red-300/90 border-red-300/25',
};

// Only these say something on an open card; open/shipped add nothing.
const SHOWN: FeatureStatus[] = ['under_review', 'planned', 'in_progress', 'declined'];

function statusLabel(status: FeatureStatus): string {
  if (status === 'in_progress') return _translateCopy('copy.rq.inprogress', { defaultValue: 'In progress' });
  if (status === 'under_review') return _translateCopy('copy.rq.underreview', { defaultValue: 'Under review' });
  return STATUS_LABELS[status];
}

function Note({ text, label }: { text: string; label?: boolean }) {
  return (
    <p className="rq-note">
      {label && <span className="rq-note-label">{_translateCopy('copy.rq.update', { defaultValue: 'Update' })}</span>}
      <TranslatableText publicContent text={text} as="span" hideControls />
    </p>
  );
}

/** C: where the request is on its way from asked to shipped. */
function Track({ status }: { status: FeatureStatus }) {
  const steps = [
    _translateCopy('copy.rq.asked', { defaultValue: 'Asked' }),
    statusLabel(status === 'open' ? 'in_progress' : status),
    _translateCopy('copy.d332dadf1646', { defaultValue: 'Shipped' }),
  ];
  const at = status === 'open' ? 0 : 1;
  return (
    <span className="rq-track" aria-label={statusLabel(status)}>
      {steps.map((s, i) => (
        <span key={i} className="rq-track-part">
          {i > 0 && <i className={i <= at ? 'rq-seg rq-done' : 'rq-seg'} aria-hidden />}
          <span className={i < at ? 'rq-step rq-done' : i === at ? 'rq-step rq-now' : 'rq-step'}>
            <i className="rq-step-dot" aria-hidden />
            {s}
          </span>
        </span>
      ))}
    </span>
  );
}

export function RequestStatusRow({
  status,
  note,
  categoryChip,
  concept = chipConcept(),
}: {
  status: FeatureStatus;
  note: string;
  categoryChip: React.ReactNode;
  concept?: ChipConcept;
}) {
  const shown = SHOWN.includes(status);
  // Declined keeps its own "Why:" line below the row.
  const liveNote = status !== 'declined' ? note : '';

  if (concept === 'today') {
    const style = TODAY_STATUS[status];
    return (
      <div className="flex items-center gap-2 flex-wrap">
        {categoryChip}
        {style && (
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-lg border backdrop-blur-xl whitespace-nowrap ${style}`}>
            {STATUS_LABELS[status]}
          </span>
        )}
        {liveNote && (
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-lg border backdrop-blur-xl break-words bg-amber-400/15 text-amber-300/90 border-amber-300/25">
            <TranslatableText publicContent text={liveNote} as="span" hideControls />
          </span>
        )}
      </div>
    );
  }

  if (concept === 'a') {
    return (
      <div className="rq rq-a" data-rq-concept="a">
        <div className="rq-row">
          {categoryChip}
          {shown && (
            <span className="rq-a-status">
              <i className="rq-dot" aria-hidden />
              {statusLabel(status)}
            </span>
          )}
        </div>
        {liveNote && <Note text={liveNote} label />}
      </div>
    );
  }

  if (concept === 'b') {
    return (
      <div className="rq rq-b" data-rq-concept="b">
        <div className="rq-row">
          {categoryChip}
          {shown && <span className="rq-b-status">{statusLabel(status)}</span>}
        </div>
        {liveNote && (
          <div className="rq-b-quote">
            <Note text={liveNote} />
          </div>
        )}
      </div>
    );
  }

  if (concept === 'c') {
    const tracked = status === 'in_progress' || status === 'planned' || status === 'under_review';
    return (
      <div className="rq rq-c" data-rq-concept="c">
        <div className="rq-row">
          {categoryChip}
          {status === 'declined' && (
            <span className="rq-a-status">
              <i className="rq-dot" aria-hidden />
              {statusLabel(status)}
            </span>
          )}
        </div>
        {tracked && <Track status={status} />}
        {liveNote && <Note text={liveNote} />}
      </div>
    );
  }

  // D: the status heads a short note from the team.
  return (
    <div className="rq rq-d" data-rq-concept="d">
      <div className="rq-row">{categoryChip}</div>
      {shown && status !== 'declined' && (
        <div className={liveNote ? 'rq-d-box' : 'rq-d-box rq-d-bare'}>
          <div className="rq-d-head">
            <QueuedIcon className="rq-d-icon" />
            <span className="rq-d-status">{statusLabel(status)}</span>
            {liveNote && <span className="rq-d-by">· {_translateCopy('copy.rq.team', { defaultValue: 'Riftn team' })}</span>}
          </div>
          {liveNote && <Note text={liveNote} />}
        </div>
      )}
      {status === 'declined' && (
        <span className="rq-a-status">
          <i className="rq-dot" aria-hidden />
          {statusLabel(status)}
        </span>
      )}
    </div>
  );
}

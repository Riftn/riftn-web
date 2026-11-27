import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppTokenPreview } from '@/hooks/use-app-tokens';

const format = (value: string) => `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 6 })} RIFT`;

export function AppTokenPreview() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const contentId = useId();
  const { data, isError, isFetching, refetch } = useAppTokenPreview(open);

  return (
    <section className="rounded-xl border border-white/10 bg-white/5">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-3 rounded-xl p-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-current"
      >
        <span>
          <span className="block text-sm font-medium text-white">{t('appTokens.previewTitle', '$RIFT off-chain preview')}</span>
          <span className="block text-xs text-zinc-400">{t('appTokens.previewReadOnly', 'Read only')}</span>
        </span>
        <ChevronDown aria-hidden="true" className={`size-4 shrink-0 text-zinc-400 ${open ? 'rotate-180' : ''}`} />
      </button>
      <div id={contentId} hidden={!open}>
        {open && <div className="space-y-3 border-t border-white/10 p-3 text-sm">
          <p className="text-zinc-400">{t('appTokens.previewExplanation', 'Credit amounts show past activity and are already reflected in your in-app balance.')}</p>
          {isError && (
            <div role="status" className="flex items-center justify-between gap-2 text-zinc-300">
              <p>{t('appTokens.previewUnavailable', 'RIFT preview unavailable.')}</p>
              <Button variant="ghost" size="sm" disabled={isFetching} onClick={() => void refetch()}>{t('common.retry')}</Button>
            </div>
          )}
          {!data && !isError && <p role="status" className="text-zinc-400">{t('common.loading')}</p>}
          {data && !isError && <>
            <dl className="space-y-2 text-zinc-300">
              <div className="flex flex-wrap justify-between gap-x-3">
                <dt>{t('appTokens.previewBalance', 'Available in-app balance')}</dt>
                <dd className="font-medium tabular-nums text-white">{format(data.balance)}</dd>
              </div>
            </dl>
            <div className="border-t border-white/10 pt-3">
              <h3 className="font-medium text-white">{t('appTokens.previewCredits', 'Recent transfers received and account credits')}</h3>
              {data.credits.length ? <ul className="mt-1 divide-y divide-white/10">
                {data.credits.map((entry, index) => {
                  const sender = entry.counterparty;
                  const who = sender?.username ? `@${sender.username}` : sender?.address;
                  return (
                    <li key={`${entry.at}-${index}`} className="flex flex-wrap justify-between gap-x-3 py-2 text-zinc-300">
                      <span className="min-w-0 break-words">
                        {entry.kind === 'adjust' ? t('appTokens.previewAccountCredit', 'Account credit')
                          : who ? t('appTokens.previewReceivedFrom', { defaultValue: 'Received from {{name}}', name: who })
                            : t('appTokens.previewReceived', 'Transfer received')}
                        <time dateTime={entry.at} className="block text-xs text-zinc-400">{new Date(entry.at).toLocaleDateString()}</time>
                      </span>
                      <span className="tabular-nums">+{format(entry.amount)}</span>
                    </li>
                  );
                })}
              </ul> : <p className="mt-1 text-zinc-400">{t('appTokens.previewNoCredits', 'No recent transfers or account credits.')}</p>}
            </div>
          </>}
        </div>}
      </div>
    </section>
  );
}

import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { GlassFilterRow } from '@/components/app/feeds/GlassFilterRow';
import { ThemedIcon } from '@/components/app/war/WarHudIcon';
import { SEOHead } from '@/components/SEOHead';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { SPLURGE_ITEM_LIMIT, useSplurge, type SplurgeMode } from '@/hooks/use-splurge';
import { formatSplurgeAmount, splurgeCurrency } from '@/lib/splurge-currency';
import './arcade-splurge.css';

const PAGE_URL = 'https://riftn.com/arcade/splurge';

function Splurge({ address, signIn }: { address: string | null; signIn: () => void }) {
  const { t } = useTranslation();
  const locale = navigator.language;
  const currency = splurgeCurrency(locale);
  const game = useSplurge(address, currency, () => crypto.randomUUID());
  const field = useRef<HTMLInputElement>(null);
  const { history } = game;
  const crt = game.mode === 'crt';
  const money = (amount: number, code = currency) => formatSplurgeAmount(amount, code, locale);
  const historyLoading = !!address && history.isPending;
  const historyError = !!address && history.isError && !history.data;
  const modes: { key: SplurgeMode; label: string }[] = [
    { key: 'modern', label: t('games.splurge.modern') },
    { key: 'crt', label: t('games.splurge.crt') },
  ];

  return (
    <>
      <GlassFilterRow<SplurgeMode>
        items={modes}
        activeKey={game.mode}
        onSelect={game.setMode}
        borderRadius="12px"
        className="-mx-2 mb-5 w-fit"
        buttonClassName="min-h-11 min-w-20 rounded-xl text-sm focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2"
      />

      <div className="splurge-play" data-mode={game.mode} data-keep-dark={crt || undefined}>
        <section className="splurge-round" aria-labelledby="splurge-budget">
          <h2 id="splurge-budget" className="splurge-caption">{t('games.splurge.budget')}</h2>
          <p className="splurge-amount" aria-live="polite" aria-atomic="true">{money(game.amount)}</p>
          <form className="mt-7 space-y-2" onSubmit={async (event) => {
            event.preventDefault();
            if (await game.submit()) field.current?.focus();
          }}>
            <label htmlFor="splurge-item" className="block text-sm font-medium">{t('games.splurge.prompt')}</label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="splurge-item"
                className="splurge-field min-h-11 min-w-0 rounded-xl"
                ref={field}
                value={game.item}
                readOnly={game.saving || game.saveError}
                maxLength={SPLURGE_ITEM_LIMIT}
                enterKeyHint="go"
                autoComplete="off"
                placeholder={t('games.splurge.placeholder')}
                onChange={event => game.setItem(event.target.value)}
              />
              <Button
                size="lg"
                className="shrink-0 px-4 sm:min-w-28"
                type="submit"
                disabled={!game.canSubmit}
                loading={game.saving}
                data-keep-dark={crt || undefined}
              >
                {game.saveError ? t('games.splurge.retry') : t('games.splurge.spend')}
              </Button>
            </div>
            {game.saveError && <p role="alert" className="splurge-caption">{t('games.splurge.saveError')}</p>}
          </form>
        </section>

        <section className="splurge-history" aria-labelledby="splurge-log">
          <h2 id="splurge-log" className="text-sm font-semibold">{t('games.splurge.history')}</h2>
          {historyLoading && <p role="status" className="splurge-caption mt-3">{t('games.splurge.loading')}</p>}
          {historyError && (
            <div className="mt-3 space-y-3">
              <p role="alert" className="splurge-caption">{t('games.splurge.historyError')}</p>
              <Button variant="secondary" onClick={() => void history.refetch()}>{t('games.splurge.retry')}</Button>
            </div>
          )}
          {!historyLoading && !historyError && game.entries.length === 0 &&
            <p className="splurge-caption mt-3">{t('games.splurge.empty')}</p>}
          {game.entries.length > 0 && (
            <ul className="splurge-log mt-2">
              {game.entries.map(entry => (
                <li key={entry.turnId}>
                  <bdi dir="auto">{entry.item}</bdi>
                  <span dir="auto">{money(entry.amount, entry.currency)}</span>
                </li>
              ))}
            </ul>
          )}
          {history.isFetchNextPageError &&
            <p role="alert" className="splurge-caption mt-3">{t('games.splurge.historyError')}</p>}
          {history.hasNextPage &&
            <Button className="mt-3" variant="secondary" loading={history.isFetchingNextPage} onClick={() => void history.fetchNextPage()}>
              {history.isFetchNextPageError ? t('games.splurge.retry') : t('games.splurge.more')}
            </Button>}
        </section>
      </div>

      {!address && (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span>{t('games.splurge.guest')}</span>
          <Button variant="secondary" size="lg" onClick={signIn}>{t('games.signIn')}</Button>
        </div>
      )}
    </>
  );
}

export default function ArcadeSplurgePage() {
  const { t } = useTranslation();
  const { walletAddress, isAuthenticated, isLoading, connect } = useAuth();
  const address = isAuthenticated ? walletAddress?.toLowerCase() ?? null : null;
  const title = t('games.splurge.title');

  return (
    <main data-glass-page data-theme-page-surface className="min-h-screen bg-background text-foreground">
      <SEOHead title={`${title} | Riftn Arcade`} description={t('games.splurge.cardBlurb')} url={PAGE_URL} image="https://riftn.com/og/arcade-splurge.jpg" />
      <div className="mx-auto max-w-[960px] px-4 pb-24 pt-6 sm:px-8">
        <Button asChild variant="ghost" size="lg" className="-ms-4 px-4">
          <Link to="/arcade">
            <ThemedIcon icon="arcade" alt="" className="h-5 w-5 object-contain" />
            {t('games.splurge.arcade')}
          </Link>
        </Button>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mb-5 mt-1 text-sm text-muted-foreground">{t('games.splurge.intro')}</p>
        {isLoading ? (
          <p role="status" className="text-sm text-muted-foreground">{t('games.splurge.loading')}</p>
        ) : <Splurge key={address ?? 'guest'} address={address} signIn={() => void connect()} />}
      </div>
    </main>
  );
}

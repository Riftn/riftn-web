import React from 'react';
import { Link } from 'react-router-dom';
import { Shield, ArrowRight } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

const SECTIONS = [1, 2, 3, 4, 5, 6, 7] as const;
/** The section that quotes launch revenue links to the stats page so readers can check it. */
const STATS_SECTION = 6;

const Overview = () => {
  const { t } = useLanguage();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold text-foreground">
          {t('overview.title')}
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          {t('overview.subtitle')}
        </p>
      </div>

      {/* Main Content */}
      <div className="bg-card rounded-2xl border border-border p-8">
        <div className="max-w-none space-y-8">
          {SECTIONS.map((n) => (
            <section key={n}>
              <h2 className="text-xl font-bold text-foreground mb-2">
                {t(`overview.heading${n}`)}
              </h2>
              <p className="text-lg leading-relaxed text-foreground/80">
                {t(`overview.paragraph${n}`)}
              </p>
              {n === STATS_SECTION && (
                <Link
                  to="/stats"
                  className="inline-flex items-center gap-1 mt-3 text-sm font-semibold text-foreground underline underline-offset-4 hover:opacity-80"
                >
                  {t('overview.statsLink')}
                  <ArrowRight className="w-4 h-4" />
                </Link>
              )}
            </section>
          ))}
        </div>
      </div>

      {/* Disclaimer */}
      <div className="docs-glass rounded-xl p-6">
        <div className="flex items-start space-x-3">
          <Shield className="w-6 h-6 text-foreground mt-1 flex-shrink-0" />
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-foreground mb-3">
              {t('overview.disclaimerTitle')}
            </h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {t('overview.disclaimerText')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Overview;

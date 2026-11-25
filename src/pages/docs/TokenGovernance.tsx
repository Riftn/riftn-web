import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield } from "lucide-react";
import Vote from "@/components/ui/cut-icons/governance";
import Users from "@/components/ui/cut-icons/communities";

import { useLanguage } from '@/contexts/LanguageContext';

const TokenGovernance = () => {
  const { t } = useLanguage();

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-foreground mb-4">{t('tokenGovernance.title')}</h1>
        <p className="text-lg text-muted-foreground leading-relaxed">{t('tokenGovernance.subtitleCurrent')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl flex items-center space-x-2">
            <Vote className="w-5 h-5 text-foreground" />
            <span>{t('tokenGovernance.fairVoting')}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground leading-relaxed">{t('tokenGovernance.fairVotingDescCurrent')}</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center space-x-2">
              <Shield className="w-5 h-5 text-foreground" />
              <span>{t('tokenGovernance.preventingWhales')}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground leading-relaxed">{t('tokenGovernance.preventingWhalesDescCurrent')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center space-x-2">
              <Users className="w-5 h-5 text-foreground" />
              <span>{t('tokenGovernance.encouragingEngagement')}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground leading-relaxed">{t('tokenGovernance.encouragingEngagementDescCurrent')}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t('tokenGovernance.solvingTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground leading-relaxed mb-4">{t('tokenGovernance.solvingDescCurrent')}</p>
          <div className="p-4 docs-glass rounded-lg">
            <p className="text-foreground font-medium">{t('tokenGovernance.launchNoteCurrent')}</p>
            <p className="text-muted-foreground mt-2">{t('tokenGovernance.stayTunedCurrent')}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="docs-glass">
        <CardHeader>
          <CardTitle className="text-xl text-foreground">{t('tokenGovernance.disclaimer')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground leading-relaxed text-sm">{t('faq.a4LaunchCurrent')}</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default TokenGovernance;

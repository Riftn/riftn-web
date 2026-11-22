import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { NAV_ITEMS } from '@/constants/app.constants';
import { useAuth } from '@/contexts/AuthContext';
import { openStageModal } from '@/contexts/StageContext';
import { useKidsModeLock } from '@/hooks/use-kids-mode';
import { useHomeShortcuts } from '@/hooks/use-nav-order';
import { canManageAgents } from '@/lib/agent-access';
import { filterNavItems } from './nav-search';
import { navItemId } from './nav-item-id';
import { NAV_LABEL_KEYS } from './SidebarNavItem';

export function HomeShortcuts() {
  const { pins } = useHomeShortcuts();
  const { walletAddress } = useAuth();
  const { t } = useTranslation();
  useKidsModeLock();
  if (!pins.length) return null;
  const allowed = filterNavItems(NAV_ITEMS, '', t, canManageAgents(walletAddress));
  const items = pins.map(id => allowed.find(item => navItemId(item) === id)).filter(item => !!item);
  if (!items.length) return null;
  const chip = 'inline-flex shrink-0 items-center gap-2 rounded-full border border-border px-3 py-2 text-sm text-foreground';
  return (
    <nav aria-label={t('nav.home')} data-home-shortcuts className="flex gap-2 overflow-x-auto px-2 py-1">
      {items.map(item => {
        const Glyph = item.icon;
        const body = <><Glyph className="size-4" />{t(NAV_LABEL_KEYS[item.label] || item.label, item.label)}</>;
        if (item.external) return <a key={item.label} className={chip} href={item.path} target="_blank" rel="noopener noreferrer">{body}</a>;
        if (item.action) return <button key={item.label} className={chip} type="button" onClick={() => { if (item.action === 'open-stages') openStageModal(); }}>{body}</button>;
        return <Link key={item.label} className={chip} to={item.path}>{body}</Link>;
      })}
    </nav>
  );
}

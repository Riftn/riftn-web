import { AppState } from '@/components/app/AppState';
import { resolveThemeIconKey } from '@/components/app/war/WarHudIcon';

interface ProfileEmptyStateProps {
  iconSrc: string;
  iconAlt: string;
  title: string;
  subtitle: string;
  /** Extra opacity class for the icon (e.g. "opacity-90") */
  iconClassName?: string;
}

/**
 * Empty-state card for profile tabs.
 * Renders immediately — no loading gate.
 */
export function ProfileEmptyState({ iconSrc, iconAlt, title, subtitle, iconClassName }: ProfileEmptyStateProps) {
  const icon = resolveThemeIconKey(iconSrc) ?? 'profile';

  return (
    <AppState
      icon={icon}
      iconAlt={iconAlt}
      title={title}
      description={subtitle}
      size="section"
      iconClassName={iconClassName}
    />
  );
}

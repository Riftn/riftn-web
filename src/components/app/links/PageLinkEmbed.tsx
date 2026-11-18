/**
 * Page Link Embed
 * ===============
 * A riftn.com link to one of our pages (Leaderboard, Shorts, Requests, an
 * arcade game...) as a small card: the page's own menu icon and name, where it
 * goes, and a tap that opens it in the app.
 */
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from "lucide-react";
import { appPageLabel, appPageRow } from '@/components/app/navigation/app-page-rows';

interface PageLinkEmbedProps {
  pagePath: string;
  /** Where the link pointed, query and all. */
  path: string;
  fallback?: ReactNode;
}

export function PageLinkEmbed({ pagePath, path, fallback = null }: PageLinkEmbedProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const row = appPageRow(pagePath);
  if (!row) return <>{fallback}</>;
  const Icon = row.icon;
  const label = appPageLabel(row, (k, d) => t(k, d) as string);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        navigate(path);
      }}
      data-no-navigate
      data-glass-embed
      data-page-embed
      className="w-full flex items-center gap-3 px-3 py-2.5 mt-2 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.07] transition-colors text-left"
    >
      <div className="w-10 h-10 rounded-xl bg-white/[0.08] border border-white/[0.08] flex items-center justify-center flex-shrink-0">
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white truncate">{label}</p>
        <p className="text-xs text-zinc-500 truncate">riftn.com{path}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-zinc-500 flex-shrink-0" />
    </button>
  );
}

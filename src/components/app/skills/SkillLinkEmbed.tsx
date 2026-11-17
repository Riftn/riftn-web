import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Sparkles from '@/components/ui/cut-icons/assistant';
import { supabase } from '@/integrations/supabase/client';
import { SkillShareButton } from './SkillShareButton';

export function SkillLinkEmbed({ slug, path, fallback }: { slug: string; path: string; fallback: ReactNode }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { data: skill, isLoading } = useQuery({
    queryKey: ['skill-preview', slug],
    queryFn: async () => {
      const { data, error } = await supabase.from('user_skills')
        .select('name,slug,description,creator_username,kind,usage_count').eq('slug', slug).maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 30_000,
  });
  if (isLoading) return <div className="mt-2 h-28 rounded-xl theme-skeleton animate-pulse" />;
  if (!skill) return <>{fallback}</>;
  return (
    <div data-no-navigate onClick={e => e.stopPropagation()} className="mt-2 overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">
      <button type="button" onClick={() => navigate(path)} className="w-full text-left p-4 hover:bg-white/[0.04]">
        <div className="flex items-center gap-2 text-xs text-zinc-400 mb-2">
          <Sparkles className="w-4 h-4" /> {t('skills.skills')}
        </div>
        <p className="text-sm font-semibold text-white truncate">{skill.name}</p>
        <p className="mt-1 text-xs text-zinc-400 line-clamp-3">{skill.description}</p>
        {skill.creator_username && <p className="mt-2 text-xs text-zinc-500">@{skill.creator_username}</p>}
      </button>
      <div className="flex items-center justify-between px-2 border-t border-white/10">
        <button type="button" className="px-2 h-9 text-xs font-medium text-white" onClick={() => navigate(path)}>
          {t('skills.useInAssistant', { defaultValue: 'Use in Assistant' })}
        </button>
        <SkillShareButton slug={skill.slug} />
      </div>
    </div>
  );
}

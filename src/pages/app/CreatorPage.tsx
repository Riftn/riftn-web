import { useTranslation as _useCopy } from 'react-i18next';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { SEOHead } from '@/components/SEOHead';
import { PricingSection } from '@/components/pricing/PricingSection';
import { SubscriptionCreditsPill } from '@/components/app/credits/SubscriptionCreditsWidget';
import { CreatorStudio } from '@/components/app/creator/studio/CreatorStudio';
import { MarketingWorkspace } from '@/components/app/creator/MarketingWorkspace';
import { useMarketingHandoff } from '@/hooks/use-marketing-handoff';
import { ModelMarquee } from '@/components/app/creator/ModelMarquee';
import dehubIcon from '@/assets/dehub-logo-compact.png';
import { ArrowUpRight, Bot, ChevronDown, ChevronRight, Clapperboard, Compass, Film, ImageIcon, Mic2, PanelsTopLeft, PenTool, Smartphone, Tag, Wand2, Workflow } from "lucide-react";
import Blocks from "@/components/ui/cut-icons/apps";
import Megaphone from "@/components/ui/cut-icons/advertising";
import Music2 from "@/components/ui/cut-icons/music";
import Sparkles from "@/components/ui/cut-icons/assistant";

import { cn } from '@/lib/utils';
import { GenerationMosaic } from '@/components/app/creator/GenerationMosaic';
import { CreatorBento, CreatorHeroWall, MediumDoors } from '@/components/app/creator/CreatorStage';

const hot = '#ff2c91';
// Metallic liquid glass surface — replaces the old lime green accent for backgrounds
const metallicBg =
  'linear-gradient(135deg, rgba(255,255,255,0.92) 0%, rgba(228,228,231,0.85) 22%, rgba(161,161,170,0.75) 50%, rgba(212,212,216,0.85) 78%, rgba(255,255,255,0.92) 100%)';
const metallicStyle: React.CSSProperties = {
  backgroundImage: metallicBg,
  backgroundColor: 'rgba(228,228,231,0.6)',
  backdropFilter: 'blur(14px) saturate(160%)',
  WebkitBackdropFilter: 'blur(14px) saturate(160%)',
  boxShadow:
    'inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 0 rgba(0,0,0,0.12), 0 4px 18px rgba(0,0,0,0.35)',
};

type Preset = 'image' | 'edit' | 'video' | 'song' | 'poster' | 'skills' | 'chat' | 'voice';
type ToolAction = { kind: 'assistant'; preset: Preset } | { kind: 'navigate'; to: string };

interface Tool {
  id: string;
  nameKey: string;
  labelKey: string;
  descriptionKey: string;
  icon: React.ComponentType<{ className?: string }>;
  category: 'Image' | 'Video' | 'Audio' | 'Studio' | 'Agents';
  badge?: 'TRENDING' | 'NEW';
  action: ToolAction;
}

const navItems = ['Explore', 'Image', 'Video', 'Audio', 'Studio', 'Marketing', 'Agents', 'Apps'] as const;
/** One glyph per menu row, like a native app menu. */
const MENU_ICONS: Record<typeof navItems[number], React.ComponentType<{ className?: string }>> = {
  Explore: Compass, Image: ImageIcon, Video: Film, Audio: Music2, Studio: Clapperboard, Marketing: Megaphone, Agents: Bot, Apps: Blocks,
};
const categories = ['All', 'Image', 'Video', 'Audio', 'Studio', 'Agents'] as const;

/*
 * The nav and category values double as filter keys — `activeCategory === category`
 * decides which tools render — so they stay English and are translated only at
 * the point they are drawn.
 */
const NAV_KEYS: Record<string, string> = {
  Explore: 'creator.navExplore',
  Image: 'creator.navImage',
  Video: 'creator.navVideo',
  Audio: 'creator.navAudio',
  Studio: 'creator.navStudio',
  Marketing: 'creator.navMarketing',
  Agents: 'creator.navAgents',
  Apps: 'creator.navApps',
  All: 'creator.navAll',
};

const tools: Tool[] = [
  {
    id: 'remake', nameKey: 'creator.toolRemake', labelKey: 'creator.navVideo',
    descriptionKey: 'creator.toolMaboroshiDesc', icon: Clapperboard, category: 'Video', badge: 'NEW',
    action: { kind: 'navigate', to: '/creator/remake' },
  },
  {
    id: 'builder',
    nameKey: 'creator.toolBuilder',
    labelKey: 'creator.navApps',
    descriptionKey: 'creator.toolBuilderDesc',
    icon: PanelsTopLeft,
    category: 'Studio',
    action: { kind: 'navigate', to: '/builder' },
  },
  {
    id: 'poster',
    nameKey: 'creator.toolPoster',
    labelKey: 'creator.labelBrand',
    descriptionKey: 'creator.toolPosterDesc',
    icon: Megaphone,
    category: 'Studio',
    action: { kind: 'assistant', preset: 'poster' },
  },
  {
    id: 'image',
    nameKey: 'creator.toolImageGenerator',
    labelKey: 'creator.navImage',
    descriptionKey: 'creator.toolImageGeneratorDesc',
    icon: ImageIcon,
    category: 'Image',
    action: { kind: 'assistant', preset: 'image' },
  },
  {
    id: 'video',
    nameKey: 'creator.toolVideoGenerator',
    labelKey: 'creator.navVideo',
    descriptionKey: 'creator.toolVideoGeneratorDesc',
    icon: Film,
    category: 'Video',
    action: { kind: 'assistant', preset: 'video' },
  },
  {
    id: 'skills',
    nameKey: 'creator.toolSkills',
    labelKey: 'creator.navAgents',
    descriptionKey: 'creator.toolSkillsDesc',
    icon: Blocks,
    category: 'Agents',
    action: { kind: 'assistant', preset: 'skills' },
  },
  {
    id: 'edit',
    nameKey: 'creator.toolImageEdit',
    labelKey: 'creator.navImage',
    descriptionKey: 'creator.toolImageEditDesc',
    icon: Wand2,
    category: 'Image',
    action: { kind: 'assistant', preset: 'edit' },
  },
  {
    id: 'song',
    nameKey: 'creator.toolSongStudio',
    labelKey: 'creator.navAudio',
    descriptionKey: 'creator.toolSongStudioDesc',
    icon: Music2,
    category: 'Audio',
    action: { kind: 'assistant', preset: 'song' },
  },
  {
    id: 'voice',
    nameKey: 'creator.toolVoiceAssistant',
    labelKey: 'creator.navAudio',
    descriptionKey: 'creator.toolVoiceAssistantDesc',
    icon: Mic2,
    category: 'Audio',
    action: { kind: 'assistant', preset: 'voice' },
  },
  {
    id: 'chat',
    nameKey: 'creator.toolCreativeChat',
    labelKey: 'creator.navAgents',
    descriptionKey: 'creator.toolCreativeChatDesc',
    icon: Bot,
    category: 'Agents',
    action: { kind: 'assistant', preset: 'chat' },
  },
  {
    id: 'characters',
    nameKey: 'creator.toolCharacters',
    labelKey: 'creator.navStudio',
    descriptionKey: 'creator.toolCharactersDesc',
    icon: PenTool,
    category: 'Studio',
    action: { kind: 'navigate', to: '/app/settings?tab=characters' },
  },

  {
    id: 'editor',
    nameKey: 'creator.toolVideoEditor',
    labelKey: 'creator.navStudio',
    descriptionKey: 'creator.toolVideoEditorDesc',
    icon: Clapperboard,
    category: 'Video',
    action: { kind: 'navigate', to: '/editor' },
  },
  {
    id: 'automations',
    nameKey: 'creator.toolAgentFlows',
    labelKey: 'creator.navAgents',
    descriptionKey: 'creator.toolAgentFlowsDesc',
    icon: Sparkles,
    category: 'Agents',
    badge: 'TRENDING',
    action: { kind: 'navigate', to: '/app/agents' },
  },
  {
    id: 'flow',
    nameKey: 'creator.toolFlow',
    labelKey: 'creator.navStudio',
    descriptionKey: 'creator.toolFlowDesc',
    icon: Workflow,
    category: 'Studio',
    badge: 'NEW',
    action: { kind: 'navigate', to: '/creator/flow' },
  },
];

/**
 * The logo in the top-left corner opens every page link the header used to
 * line up, so the bar itself only carries the logo, the balance and Create.
 */
function CreatorLogoMenu({ active, onPick, onPricing, onEditor, onHome }: {
  active: typeof navItems[number];
  onPick: (item: typeof navItems[number]) => void;
  onPricing: () => void;
  onEditor: () => void;
  onHome: () => void;
}) {
  const { t } = useTranslation();
  const _copy = _useCopy().t;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  const row = 'flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left text-[14px] font-medium transition-colors';
  const pick = (fn: () => void) => () => { setOpen(false); fn(); };
  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={_copy('copy.b40b3713b43d', { defaultValue: 'Open menu' })}
        className="flex h-10 items-center gap-1.5 rounded-[14px] border border-white/10 bg-white/[0.07] px-2.5 hover:bg-white/[0.11]"
      >
        <span
          className="h-5 w-5"
          style={{
            backgroundColor: 'currentColor',
            maskImage: `url(${dehubIcon})`, WebkitMaskImage: `url(${dehubIcon})`,
            maskSize: 'contain', WebkitMaskSize: 'contain',
            maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat',
            maskPosition: 'center', WebkitMaskPosition: 'center',
          }}
        />
        <ChevronDown className={cn('h-3.5 w-3.5 text-white/60 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div role="menu" data-creator-logo-menu className="absolute left-0 top-full z-[80] mt-2 w-[272px] rounded-[20px] border border-white/10 bg-[#121316]/[0.98] p-1.5 text-white shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          {navItems.map((item, index) => {
            const Icon = MENU_ICONS[item];
            const on = active === item;
            return (
              <div key={item}>
                {index === 4 && <div className="mx-3 my-1.5 h-px bg-white/[0.08]" />}
                <button type="button" role="menuitem" aria-current={on ? 'page' : undefined} onClick={pick(() => onPick(item))} className={cn(row, on ? 'bg-white/[0.09] text-white' : 'text-white/85 hover:bg-white/[0.05]')}>
                  <span aria-hidden="true" className="flex shrink-0"><Icon className="h-[18px] w-[18px] opacity-90" /></span>
                  <span className="min-w-0 flex-1 truncate">{t(NAV_KEYS[item])}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 opacity-40" aria-hidden="true" />
                </button>
              </div>
            );
          })}
          <div className="mx-3 my-1.5 h-px bg-white/[0.08]" />
          <button type="button" role="menuitem" data-menu-hot onClick={pick(onPricing)} className={cn(row, 'text-white hover:brightness-110')} style={{ backgroundColor: `${hot}1f` }}>
            <Tag className="h-[18px] w-[18px] shrink-0" style={{ color: hot }} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{t('creator.pricing')}</span>
            <span className="shrink-0 rounded-full px-2 py-1 text-[10px] font-bold leading-none" style={{ backgroundColor: `${hot}33`, color: hot }}>{t('creator.thirtyOff')}</span>
            <ChevronRight className="h-4 w-4 shrink-0 opacity-40" aria-hidden="true" />
          </button>
          <button type="button" role="menuitem" onClick={pick(onEditor)} className={cn(row, 'text-white/85 hover:bg-white/[0.05]')}>
            <PenTool className="h-[18px] w-[18px] shrink-0 opacity-90" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{t('creator.editor')}</span>
            <ChevronRight className="h-4 w-4 shrink-0 opacity-40" aria-hidden="true" />
          </button>
          <button type="button" role="menuitem" onClick={pick(onHome)} className={cn(row, 'text-white/85 hover:bg-white/[0.05]')}>
            <Smartphone className="h-[18px] w-[18px] shrink-0 opacity-90" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{t('creator.openApp')}</span>
            <ArrowUpRight className="h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}

export default function CreatorPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAuthenticated, openLoginModal, walletAddress } = useAuth();
  const { active: activeMarketingDraft, prepare: prepareMarketingDraft, leave: leaveMarketingDraft } = useMarketingHandoff(walletAddress);
  const [activeCategory, setActiveCategory] = useState<typeof categories[number]>('All');
  const [activeNav, setActiveNav] = useState<typeof navItems[number]>('Explore');
  /**
   * The studio composer parks directly under this header once it scrolls past,
   * so it needs the header's live height, and a hard-coded offset would leave
   * a gap or a clipped bar.
   */
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(60);

  const openEditor = useCallback(() => navigate('/editor'), [navigate]);
  const [composerParked, setComposerParked] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const measure = () => setHeaderHeight(el.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const visibleTools = useMemo(
    () => activeCategory === 'All' ? tools : tools.filter(tool => tool.category === activeCategory),
    [activeCategory]
  );

  const runAction = (action: ToolAction) => {
    if (action.kind === 'navigate') {
      const url = action.to;
      if (url.startsWith('http://') || url.startsWith('https://')) {
        window.open(url, '_blank', 'noopener,noreferrer');
      } else {
        navigate(url);
      }
      return;
    }

    navigate(`/app/assistant#preset=${action.preset}`);
  };

  const pickNavigation = (item: typeof navItems[number]) => {
    setActiveNav(item);
    if (item === 'Image' || item === 'Video' || item === 'Audio') {
      setActiveCategory(item);
      window.dispatchEvent(new CustomEvent('creator:mode', { detail: item.toLowerCase() }));
    } else if (item === 'Explore') {
      setActiveCategory('All');
      document.querySelector('[data-creator-composer]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (item === 'Apps') navigate('/builder');
    else if (item === 'Agents') navigate('/app/agents');
    else if (item === 'Marketing') {
      document.querySelector('[data-creator-marketing]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    else {
      setActiveCategory('Studio');
      document.querySelector('[data-creator-tools]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const goPricing = () => document.querySelector('[data-creator-pricing]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const logoMenu = (
    <CreatorLogoMenu
      active={activeNav}
      onPick={pickNavigation}
      onPricing={goPricing}
      onEditor={() => navigate('/editor')}
      onHome={() => navigate('/app')}
    />
  );

  return (
    <>
      {/* Page metadata lives in CreatorEditorHost: /creator and /editor stay
          co-mounted, so a Helmet here would keep applying while this page is
          hidden and would overwrite the editor's title. */}
      {/* overflow-x-CLIP, not hidden. `hidden` on one axis computes the other
          from `visible` to `auto`, which quietly made this element a scroll
          container — one that never scrolls, because the page scrolls on
          `body`. Every `position: sticky` inside then had no scrollport to
          react to and simply rode the content off the top of the screen, the
          header included. `clip` contains the same horizontal overflow while
          leaving overflow-y `visible`, so sticky resolves against `body`. */}
      {/* relative z-[1]: the theme canvases (Hazy, Cosmic, ...) are fixed
          layers at z-0, so a static <main> painted UNDER them and every
          unpositioned heading and label vanished, leaving big empty gaps.
          data-glass-page lets the canvas through on those themes. */}
      <main data-creator-page data-glass-page className="relative z-[1] min-h-screen overflow-x-clip text-white" style={{ backgroundColor: '#090a0b' }}>
        <h1 className="sr-only">{t('creator.srHeading')}</h1>

        {/* Scrolled: the bar turns solid dark. Once the composer scrolls
            away it hides, and the composer floats as one dark island that
            carries this same logo menu. */}
        <div
          ref={headerRef}
          className={cn('sticky top-0 z-50 transition-[transform,opacity] duration-200', composerParked && 'pointer-events-none -translate-y-full opacity-0')}
          aria-hidden={composerParked || undefined}
        >
          <header
            data-clear-top-bar={scrolled ? undefined : ''}
            className={cn('px-3 py-3 sm:px-4 transition-colors duration-200', scrolled && 'border-b border-white/[0.08] shadow-[0_10px_30px_rgba(0,0,0,0.5)]')}
            style={{ backgroundColor: scrolled ? '#0b0c0d' : 'transparent' }}
          >
            <div className="flex items-center gap-3">
              {logoMenu}
              <div className="min-w-0 flex-1" />

              {isAuthenticated && (
                // Subscription tokens: the balance AI generation here is paid from.
                <SubscriptionCreditsPill />
              )}
              <div className="hidden items-center gap-2 sm:flex">
                {/* Signed-in people get here from the app, so no "My account" /
                    "Open app" buttons; the logo still goes back to /app. */}
                {!isAuthenticated && (
                  <>
                    <button
                      type="button"
                      onClick={() => openLoginModal()}
                      className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15"
                    >
                      {t('creator.login')}
                    </button>
                    <button
                      type="button"
                      onClick={() => openLoginModal()}
                      className="rounded-lg px-4 py-2 text-sm font-bold text-black hover:brightness-95"
                      style={metallicStyle}
                    >
                      {t('creator.signUp')}
                    </button>
                  </>
                )}
              </div>
            </div>
          </header>
        </div>

        {/* The hero's wall of community work sits behind the studio's headline and composer. */}
        <CreatorHeroWall />
        <CreatorStudio onOpenEditor={openEditor} stickyTop={headerHeight} onParkedChange={setComposerParked} compactLead={logoMenu} compactTrail={isAuthenticated ? <SubscriptionCreditsPill /> : null} generationDraft={activeMarketingDraft?.draft}
          snapshotScope={activeMarketingDraft ? `campaign:${activeMarketingDraft.id}` : 'main'} generationDraftId={activeMarketingDraft?.id} />
        {activeMarketingDraft && <button type="button" className="mx-4 mt-2 text-sm underline" onClick={leaveMarketingDraft}>{t('creator.marketing.return')}</button>}
        <Link to="/creator/learn" className="mx-4 mt-5 inline-block rounded-xl border border-current px-4 py-2 text-sm">{t('creator.learn.title')}</Link>
        <MarketingWorkspace onPrepare={(draft) => {
          prepareMarketingDraft(draft);
          document.querySelector('[data-creator-composer]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }} />
        <div>
        <MediumDoors />

        <div style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 520px' }}>
          <GenerationMosaic preview />
        </div>

        <CreatorBento />

        <section className="px-3 pb-4 sm:px-4">
          <ModelMarquee />
        </section>

        <div data-creator-tools className="scroll-mt-28">
        <section className="px-3 pb-6 sm:px-4">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <h2 className="font-exo text-[22px] font-black tracking-tight text-white sm:text-[28px]">{t('creator.moreTools')}</h2>
            <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {categories.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setActiveCategory(category)}
                  aria-pressed={activeCategory === category}
                  className={cn(
                    'shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors backdrop-blur-xl',
                    activeCategory === category ? 'border-white/70 bg-white/20 text-white' : 'border-white/12 bg-white/[0.06] text-white/60 hover:text-white'
                  )}
                >
                  {t(NAV_KEYS[category])}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">

            {visibleTools.map((tool) => {
              const Icon = tool.icon;
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => runAction(tool.action)}
                  className="group relative min-h-[128px] rounded-[22px] border border-white/12 bg-white/[0.06] p-5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-2xl backdrop-saturate-150 transition hover:-translate-y-0.5 hover:bg-white/[0.1]"
                >
                  {tool.badge && (
                    <span
                      className="absolute right-3 top-3 rounded px-1.5 py-0.5 text-[9px] font-black uppercase italic leading-none text-white"
                      style={{ backgroundColor: hot }}
                    >
                      {tool.badge}
                    </span>
                  )}
                  <div className="mb-6 flex items-center gap-3">
                    <Icon className="h-6 w-6 text-white/[0.85]" />
                    <span className="rounded-full bg-white/[0.08] px-2 py-1 text-xs text-white/60">{t(tool.labelKey)}</span>
                  </div>
                  <div className="pr-8">
                    <h3 className="text-lg font-black text-white">{t(tool.nameKey)}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-white/45">{t(tool.descriptionKey)}</p>
                  </div>
                  <ArrowUpRight className="absolute bottom-4 right-4 h-4 w-4 text-white/30 transition-colors group-hover:text-white" />
                </button>
              );
            })}
          </div>
        </section>
        </div>

        <div id="pricing" data-creator-pricing className="scroll-mt-28" style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 600px' }}>
          <PricingSection />
        </div>

        </div>
      </main>
    </>
  );
}

const PAGE_SIZE = 18;

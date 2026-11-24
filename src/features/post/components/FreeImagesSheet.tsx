import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import Search from '@/components/ui/cut-icons/search';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { downloadFreeAsset, searchFreeAssets, type FreeAsset } from '@/lib/editor/freeAssets';
import { cn } from '@/lib/utils';

interface FreeImagesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Starting search, usually the first words of the caption. */
  initialQuery?: string;
  /** The picked photo, ready to join the post, plus its credit line. */
  onPick: (file: File, credit: string | null) => void;
}

/**
 * Free photo search for the post composer: the same Openverse, Wikimedia,
 * Pexels and Pixabay library the blog editor uses, so a picture can sit next
 * to a post without being in the phone's gallery first.
 */
export function FreeImagesSheet({ open, onOpenChange, initialQuery, onPick }: FreeImagesSheetProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [items, setItems] = useState<FreeAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    const start = (initialQuery || '').replace(/https?:\/\/\S+/g, '').replace(/[#@]\S+/g, '').trim().split(/\s+/).slice(0, 4).join(' ');
    setQuery(start);
    setSubmitted(start || 'nature');
  }, [open, initialQuery]);

  useEffect(() => {
    if (!open || !submitted) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    searchFreeAssets({ kind: 'photo', query: submitted, signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setItems(result.items); })
      .catch(() => { if (!controller.signal.aborted) setItems([]); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, submitted]);

  const pick = async (asset: FreeAsset) => {
    if (picking) return;
    setPicking(asset.id);
    try {
      const file = await downloadFreeAsset(asset);
      const credit = asset.attributionRequired && asset.creator
        ? t('freeImages.credit', { defaultValue: 'Photo: {{creator}} ({{license}})', creator: asset.creator, license: asset.license })
        : null;
      onPick(file, credit);
      onOpenChange(false);
    } catch {
      toast.error(t('freeImages.failed', { defaultValue: "Couldn't add that photo. Try another one." }));
    } finally {
      setPicking(null);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent column glass className="border-t border-white/10 max-h-[85dvh]">
        <DrawerHeader className="border-b border-white/10">
          <DrawerTitle>{t('freeImages.title', { defaultValue: 'Free images' })}</DrawerTitle>
        </DrawerHeader>
        <form
          className="flex items-center gap-2 px-4 pt-3"
          onSubmit={(e) => { e.preventDefault(); if (query.trim()) setSubmitted(query.trim()); }}
        >
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3">
            <Search className="h-4 w-4 shrink-0 text-white/60" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('freeImages.search', { defaultValue: 'Search free photos' })}
              aria-label={t('freeImages.search', { defaultValue: 'Search free photos' })}
              enterKeyHint="search"
              className="h-10 w-full bg-transparent text-sm text-white placeholder:text-white/50 focus:outline-none"
            />
          </div>
        </form>
        <p className="px-4 pt-2 text-[11px] text-white/50">{t('freeImages.note', { defaultValue: 'Free to use photos. A credit is added when the owner asks for one.' })}</p>
        <div className="min-h-[12rem] overflow-y-auto p-4">
          {loading ? (
            <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-white/70" /></div>
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-sm text-white/60">{t('freeImages.empty', { defaultValue: 'No photos found. Try another word.' })}</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {items.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => pick(asset)}
                  disabled={!!picking}
                  aria-label={asset.title}
                  className={cn('relative aspect-square overflow-hidden rounded-xl bg-white/5', picking && picking !== asset.id && 'opacity-50')}
                >
                  <img src={asset.thumbnailUrl} alt={asset.title} loading="lazy" className="h-full w-full object-cover" />
                  {picking === asset.id && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/50"><Loader2 className="h-5 w-5 animate-spin text-white" /></span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export default FreeImagesSheet;

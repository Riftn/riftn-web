import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import Search from '@/components/ui/cut-icons/search';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { cn } from '@/lib/utils';
import { downloadFreeAsset, searchFreeAssets, type FreeAsset } from '@/lib/editor/freeAssets';
import { captionQuery, licenceLabel } from '@/lib/caption-query';

interface FreeImageSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The post's caption: the first search is for what it is about. */
  caption: string;
  onPick: (file: File, asset: FreeAsset) => void;
}

/**
 * Free pictures for a post, from the same open libraries the video editor
 * uses (Openverse, Wikimedia Commons and the stock providers behind the
 * free-stock-assets function), so everything here may be reposted.
 */
export default function FreeImageSheet({ open, onOpenChange, caption, onPick }: FreeImageSheetProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<FreeAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const run = (q: string) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    searchFreeAssets({ kind: 'photo', query: q, signal: ctrl.signal })
      .then((res) => {
        if (!ctrl.signal.aborted) setItems(res.items.filter((a) => a.thumbnailUrl));
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setItems([]);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
  };

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      return;
    }
    const q = captionQuery(caption);
    setQuery(q);
    setItems([]);
    run(q);
    // Opening is the trigger; the caption is read once at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pick = async (asset: FreeAsset) => {
    if (picking) return;
    setPicking(asset.id);
    try {
      const file = await downloadFreeAsset(asset);
      onPick(file, asset);
      onOpenChange(false);
    } catch {
      toast.error(t('freeImage.failed', { defaultValue: "That picture couldn't be added. Try another one." }));
    } finally {
      setPicking(null);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent column glass className="border-t border-white/10 max-h-[85dvh]">
        <DrawerHeader className="border-b border-white/10">
          <DrawerTitle>{t('freeImage.title', { defaultValue: 'Free image' })}</DrawerTitle>
          <form
            className="mt-3 flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3"
            onSubmit={(e) => {
              e.preventDefault();
              run(query.trim());
            }}
          >
            <Search className="h-4 w-4 shrink-0 text-white/60" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('freeImage.search', { defaultValue: 'Search free pictures' })}
              aria-label={t('freeImage.search', { defaultValue: 'Search free pictures' })}
              className="h-10 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/40"
              enterKeyHint="search"
            />
          </form>
          <p className="mt-2 text-left text-xs text-white/50">
            {t('freeImage.hint', { defaultValue: 'Pictures anyone may share, from Openverse and Wikimedia Commons.' })}
          </p>
        </DrawerHeader>
        <div className="overflow-y-auto p-3" data-free-image-results>
          {loading && items.length === 0 ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-white/70" /></div>
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-sm text-white/60">{t('freeImage.none', { defaultValue: 'No free pictures for that. Try other words.' })}</p>
          ) : (
            <div className={cn('grid grid-cols-3 gap-2 sm:grid-cols-4', loading && 'opacity-60')}>
              {items.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => void pick(asset)}
                  disabled={!!picking}
                  className="group relative aspect-square overflow-hidden rounded-xl bg-white/5"
                  aria-label={asset.title}
                >
                  <img src={asset.thumbnailUrl} alt="" loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                  <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-3 text-left text-[10px] text-white/80">
                    {licenceLabel(asset.license)}
                  </span>
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

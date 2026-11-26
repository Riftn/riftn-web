import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import Search from '@/components/ui/cut-icons/search';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
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
      <DrawerContent column glass className="max-h-[85dvh] border-border text-foreground">
        <DrawerHeader className="shrink-0 border-b border-border">
          <DrawerTitle className="text-start">{t('freeImages.title', { defaultValue: 'Free images' })}</DrawerTitle>
        </DrawerHeader>
        <form
          className="shrink-0 space-y-2 px-4 pt-3"
          onSubmit={(e) => { e.preventDefault(); if (query.trim()) setSubmitted(query.trim()); }}
        >
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('freeImages.search', { defaultValue: 'Search free photos' })}
              aria-label={t('freeImages.search', { defaultValue: 'Search free photos' })}
              enterKeyHint="search"
              className="h-11 rounded-xl border-0 pl-9 ring-1 ring-inset ring-input rtl:pl-3 rtl:pr-9 focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <DrawerDescription className="ps-9 text-[13px] leading-[18px]">
            {t('freeImages.note', { defaultValue: 'Free to use photos. A credit is added when the owner asks for one.' })}
          </DrawerDescription>
        </form>
        <div className="min-h-[12rem] overflow-y-auto p-4">
          {loading ? (
            <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t('freeImages.empty', { defaultValue: 'No photos found. Try another word.' })}</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {items.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => pick(asset)}
                  disabled={!!picking}
                  aria-label={asset.title}
                  className={cn('relative aspect-square overflow-hidden rounded-xl bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2', picking && picking !== asset.id && 'opacity-50')}
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

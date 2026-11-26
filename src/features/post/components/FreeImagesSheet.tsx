import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import Search from '@/components/ui/cut-icons/search';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { downloadFreeAsset, searchFreeAssets, searchFreeCoverPhotos, type FreeAsset } from '@/lib/editor/freeAssets';
import { cn } from '@/lib/utils';

interface FreeImagesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Starting search, usually the first words of the caption. */
  initialQuery?: string;
  /** Article covers and their link previews have no credit field. */
  forArticleCover?: boolean;
  /** The picked photo, ready to join the post, plus its credit line. */
  onPick: (file: File, credit: string | null) => void;
}

/**
 * Free photo search for the post composer: the same Openverse, Wikimedia,
 * Pexels and Pixabay library the blog editor uses, so a picture can sit next
 * to a post without being in the phone's gallery first.
 */
export function FreeImagesSheet({ open, onOpenChange, initialQuery, forArticleCover = false, onPick }: FreeImagesSheetProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [items, setItems] = useState<FreeAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const download = useRef<AbortController | null>(null);

  useEffect(() => () => download.current?.abort(), []);

  useEffect(() => {
    if (!open) return;
    const start = (initialQuery || '').replace(/https?:\/\/\S+/g, '').replace(/[#@]\S+/g, '').trim().split(/\s+/).slice(0, 4).join(' ');
    setQuery(start);
    setSubmitted(start || 'nature');
  }, [open, initialQuery]);

  useEffect(() => {
    if (!open || !submitted) return;
    const controller = new AbortController();
    setLoading(true);
    const results = forArticleCover
      ? searchFreeCoverPhotos(submitted, controller.signal)
      : searchFreeAssets({ kind: 'photo', query: submitted, signal: controller.signal }).then(result => result.items);
    results
      .then((photos) => { if (!controller.signal.aborted) setItems(photos); })
      .catch(() => { if (!controller.signal.aborted) setItems([]); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, submitted, forArticleCover]);

  const pick = async (asset: FreeAsset) => {
    if (download.current) return;
    const controller = new AbortController();
    download.current = controller;
    setPicking(asset.id);
    try {
      const file = await downloadFreeAsset(asset, controller.signal);
      if (controller.signal.aborted) return;
      if (forArticleCover && !/^image\/(?:jpeg|png|webp)$/.test(file.type)) throw new Error('Unsupported cover image type');
      const credit = asset.attributionRequired && asset.creator
        ? t('freeImages.credit', { defaultValue: 'Photo: {{creator}} ({{license}})', creator: asset.creator, license: asset.license })
        : null;
      onPick(file, credit);
      onOpenChange(false);
    } catch {
      if (!controller.signal.aborted) toast.error(t('freeImages.failed', { defaultValue: "Couldn't add that photo. Try another one." }));
    } finally {
      download.current = null;
      if (!controller.signal.aborted) setPicking(null);
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
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-muted px-3 focus-within:ring-2 focus-within:ring-ring">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('freeImages.search', { defaultValue: 'Search free photos' })}
              aria-label={t('freeImages.search', { defaultValue: 'Search free photos' })}
              enterKeyHint="search"
              className="h-11 w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>
        </form>
        {!forArticleCover && <p className="px-4 pt-2 text-xs text-muted-foreground">{t('freeImages.note', { defaultValue: 'Free to use photos. A credit is added when the owner asks for one.' })}</p>}
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
                  className={cn('relative aspect-square overflow-hidden rounded-xl bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background', picking && picking !== asset.id && 'opacity-50')}
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

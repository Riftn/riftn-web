import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, X, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { searchUsers, type PhotoTag } from '@/lib/api/dehub';
import { buildAvatarUrl } from '@/lib/media-url';
import { cn } from '@/lib/utils';

export const MAX_TAGS_PER_PHOTO = 20;

interface PhotoTaggerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Photo URLs in post order (blob previews in the composer, CDN URLs after). */
  images: string[];
  value: PhotoTag[];
  /** Called with the final list when the person taps Done. */
  onDone: (tags: PhotoTag[]) => void | Promise<void>;
}

/**
 * Tap a spot on a photo, pick a person, and their name sits there
 * (Instagram style). Used by the composer before posting and by the post's
 * own menu after.
 */
export function PhotoTagger({ open, onOpenChange, images, value, onDone }: PhotoTaggerProps) {
  const { t } = useTranslation();
  const [tags, setTags] = useState<PhotoTag[]>(value);
  const [index, setIndex] = useState(0);
  const [spot, setSpot] = useState<{ x: number; y: number } | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ username: string; displayName?: string; avatar?: string; address: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) { setTags(value); setIndex(0); setSpot(null); setQuery(''); } }, [open, value]);
  useEffect(() => { if (spot) searchRef.current?.focus(); }, [spot]);
  useEffect(() => {
    const q = query.trim().replace(/^@/, '');
    if (!q) { setResults([]); return; }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      searchUsers({ q, limit: 8 })
        .then((res) => {
          if (cancelled) return;
          setResults((res.data ?? []).filter((u) => u.username).map((u) => ({
            username: u.username!,
            displayName: u.displayName || undefined,
            address: u.address,
            avatar: buildAvatarUrl(u.address, u.avatarImageUrl),
          })));
        })
        .catch(() => { if (!cancelled) setResults([]); });
    }, 200);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query]);

  const onPhoto = tags.filter((tag) => tag.i === index);

  const place = (event: React.MouseEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    setSpot({
      x: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)),
      y: Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)),
    });
    setQuery('');
  };

  const choose = (username: string, address: string) => {
    if (!spot) return;
    setTags((prev) => [
      ...prev.filter((tag) => !(tag.i === index && tag.username.toLowerCase() === username.toLowerCase())),
      { username, address, i: index, x: Math.round(spot.x * 1000) / 1000, y: Math.round(spot.y * 1000) / 1000 },
    ]);
    setSpot(null);
    setQuery('');
  };

  const done = async () => {
    setSaving(true);
    try {
      await onDone(tags);
      onOpenChange(false);
    } catch {
      // The host said why; keep the tags on screen so nothing is lost.
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-photo-tagger className="max-w-lg gap-3 p-4">
        <DialogTitle>{t('photoTags.title', 'Tag people')}</DialogTitle>
        <p className="text-sm text-zinc-400">{t('photoTags.hint', 'Tap the photo where someone is, then pick their name.')}</p>
        <div className="relative select-none overflow-hidden rounded-xl bg-black">
          <div className="flex justify-center">
          <div className="relative inline-block cursor-crosshair" onClick={onPhoto.length >= MAX_TAGS_PER_PHOTO ? undefined : place}>
            <img src={images[index]} alt="" className="block max-h-[55dvh] max-w-full" draggable={false} />
            {onPhoto.map((tag) => (
              <span
                key={tag.username}
                style={{ left: `${tag.x * 100}%`, top: `${tag.y * 100}%` }}
                className="absolute -translate-x-1/2 translate-y-1 inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-black/75 px-2 py-1 text-xs font-medium text-white backdrop-blur"
                onClick={(e) => e.stopPropagation()}
              >
                @{tag.username}
                <button
                  type="button"
                  aria-label={t('photoTags.remove', 'Remove tag')}
                  className="-mr-1 grid h-6 w-6 place-items-center rounded-full hover:bg-white/15"
                  onClick={() => setTags((prev) => prev.filter((other) => other !== tag))}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {spot && (
              <span
                style={{ left: `${spot.x * 100}%`, top: `${spot.y * 100}%` }}
                className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-white/30"
              />
            )}
          </div>
          </div>
          {images.length > 1 && (
            <>
              <button type="button" aria-label={t('common.previous', 'Previous')} disabled={index === 0}
                onClick={() => { setIndex(index - 1); setSpot(null); }}
                className="absolute left-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white disabled:opacity-30">
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button type="button" aria-label={t('common.next', 'Next')} disabled={index === images.length - 1}
                onClick={() => { setIndex(index + 1); setSpot(null); }}
                className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white disabled:opacity-30">
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}
        </div>
        {spot && (
          <div className="space-y-2">
            <Input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('photoTags.search', 'Search people')}
              className="h-10 rounded-xl"
            />
            <div className="max-h-48 overflow-y-auto">
              {results.map((person) => (
                <button
                  key={person.address}
                  type="button"
                  onClick={() => choose(person.username, person.address)}
                  className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-left hover:bg-white/10"
                >
                  {person.avatar ? <img src={person.avatar} alt="" className="h-8 w-8 rounded-full object-cover" /> : <span className="h-8 w-8 rounded-full bg-white/10" />}
                  <span className="min-w-0 flex-1 truncate text-sm text-white">
                    {person.displayName || person.username}
                    <span className="ml-1.5 text-zinc-500">@{person.username}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <span className={cn('text-xs text-zinc-500', !tags.length && 'invisible')}>
            {t('photoTags.taggedCount', { defaultValue: '{{value}} tagged', value: String(tags.length) })}
          </span>
          <Button type="button" onClick={() => void done()} disabled={saving} className="min-h-10 rounded-xl px-5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t('photoTags.done', 'Done')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

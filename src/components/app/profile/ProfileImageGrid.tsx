import { useState, useRef, useMemo, memo, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Ticket } from "lucide-react";
import X from "@/components/ui/cut-icons/close";
import ThumbsUp from "@/components/ui/cut-icons/like";
import MessageSquare from "@/components/ui/cut-icons/messages";

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import type { ImagePost } from '@/types/feed.types';
import { ImageCard } from '@/components/app/cards/ImageCard';
import { ProfileFormatFeed } from '@/components/app/feeds/ProfileFormatFeed';
import { useProfileFeedContext } from '@/lib/profile-feed-origin';
import { hintedImageRatio } from '@/lib/image-size-hints';
import { profilePhotoRows } from '@/lib/profile-photo-rows';

import { formatCount } from '@/lib/format-count';
interface ProfileImageGridProps {
  images: ImagePost[];
}

export const ProfileImageGrid = memo(function ProfileImageGrid({ images }: ProfileImageGridProps) {
  const { t: _copy } = useTranslation();
  const [selectedImage, setSelectedImage] = useState<ImagePost | null>(null);
  const selectedTile = useRef<HTMLButtonElement | null>(null);
  const feedOrigin = useProfileFeedContext()?.current ?? null;
  const rows = useMemo(
    () => profilePhotoRows(images.map(post => hintedImageRatio(post.image)), true),
    [images],
  );

  return (
    <>
      <div data-profile-image-grid>
        {rows.map(({ start, count, tracks }) => (
          <div
            key={start}
            data-profile-photo-row
            style={{ gridTemplateColumns: tracks.map(ratio => `minmax(0, ${ratio}fr)`).join(' ') }}
          >
            {images.slice(start, start + count).map((post, column) => (
              <button
                key={post.id}
                type="button"
                data-profile-photo
                onClick={(event) => {
                  selectedTile.current = event.currentTarget;
                  setSelectedImage(post);
                }}
                aria-label={post.mediaDescriptions?.[0] || post.description || post.caption || _copy('profileImage.view', { defaultValue: 'View photo' })}
                className={cn(
                  'group relative block min-w-0 overflow-hidden bg-card p-0 text-card-foreground active:opacity-80',
                  'focus-visible:outline-none focus-visible:after:pointer-events-none focus-visible:after:absolute focus-visible:after:inset-0',
                  'focus-visible:after:rounded-[inherit] focus-visible:after:border-2 focus-visible:after:border-white focus-visible:after:shadow-[inset_0_0_0_2px_black]',
                )}
                style={{ '--profile-photo-aspect': tracks[column] } as CSSProperties}
              >
                <img
                  src={post.image}
                  alt=""
                  className={cn(
                    "absolute inset-0 h-full w-full object-contain",
                    post.isPPV && "blur-lg"
                  )}
                  loading="lazy"
                />
                {/* PPV overlay */}
                {post.isPPV && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <div className="w-10 h-10 rounded-xl bg-black/40 backdrop-blur-[24px] backdrop-saturate-[180%] flex items-center justify-center border border-white/10">
                      <Ticket className="h-5 w-5 text-white" />
                    </div>
                  </div>
                )}
                {/* Hover overlay with stats */}
                <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 motion-reduce:transition-none">
                  <div className="flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-xl bg-card px-2 py-1 text-card-foreground">
                    <div className="flex items-center gap-1 sm:gap-1.5">
                      <ThumbsUp className="w-4 h-4 sm:w-5 sm:h-5" />
                      <span className="font-semibold text-xs sm:text-sm">{formatCount(post.likes)}</span>
                    </div>
                    <div className="flex items-center gap-1 sm:gap-1.5">
                      <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5" />
                      <span className="font-semibold text-xs sm:text-sm">{formatCount(post.comments)}</span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Expanded view overlay */}
      <Dialog open={selectedImage !== null} onOpenChange={(open) => { if (!open) setSelectedImage(null); }}>
        {selectedImage && (
          <DialogContent
            hideCloseButton
            aria-describedby={undefined}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              selectedTile.current?.focus({ preventScroll: true });
            }}
            onEscapeKeyDown={(event) => {
              if (document.querySelector('[data-fullscreen-image-viewer]')) event.preventDefault();
            }}
            data-keep-dark
            data-profile-photo-dialog
            overlayClassName="bg-transparent backdrop-blur-none"
            className="inset-0 flex max-h-none flex-col gap-0 rounded-none border-0 bg-black/90 p-0 backdrop-blur-sm sm:inset-0 sm:max-w-none sm:translate-x-0 sm:translate-y-0 sm:rounded-none data-[state=open]:slide-in-from-bottom-0 sm:data-[state=open]:slide-in-from-left-0 sm:data-[state=open]:slide-in-from-top-0 motion-reduce:animate-none"
          >
            <DialogTitle className="sr-only">{_copy('copy.be7e2f201293', { defaultValue: 'Images' })}</DialogTitle>
            <div className="sticky top-0 z-10 flex justify-end p-3 pt-[max(.75rem,env(safe-area-inset-top))]">
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-11"
                  data-on-media
                  data-swipe-back
                  data-swipe-back-protect-sideways
                  aria-label={_copy('copy.3eddd92e8c28', { defaultValue: 'Close fullscreen' })}
                >
                  <X />
                </Button>
              </DialogClose>
            </div>
            <div className="flex-1 px-2 pb-6">
              <div className="rounded-xl border border-white/[0.12] bg-white/[0.03] p-3">
                <ImageCard post={selectedImage} />
              </div>
              {/* The rest of this creator's images, in the grid's order. */}
              {feedOrigin && <ProfileFormatFeed origin={feedOrigin} currentPostId={selectedImage.id} />}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
});

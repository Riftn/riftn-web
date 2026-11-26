/**
 * ProfileImageGrid
 * ================
 * Natural collage-style image grid for profile pages (matches public image feed).
 * Every 4th image spans 2×2 for visual flow. Tapping opens the full ImageCard.
 */

import { useState, useRef, memo } from 'react';
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

import { formatCount } from '@/lib/format-count';
interface ProfileImageGridProps {
  images: ImagePost[];
}

export const ProfileImageGrid = memo(function ProfileImageGrid({ images }: ProfileImageGridProps) {
  const { t: _copy } = useTranslation();
  const [selectedImage, setSelectedImage] = useState<ImagePost | null>(null);
  const selectedTile = useRef<HTMLButtonElement | null>(null);
  const feedOrigin = useProfileFeedContext()?.current ?? null;

  return (
    <>
      {/* Collage grid — matches public ImagesFeed CollageView */}
      <div
        data-profile-image-grid
        className="grid grid-cols-3 gap-0.5 sm:gap-1 overflow-hidden rounded-xl"
        style={{ gridAutoFlow: 'dense' }}
      >
        {images.map((post, index) => {
          const isLargeTile = index % 4 === 0;

          return (
            <button
              type="button"
              key={post.id}
              onClick={(event) => {
                selectedTile.current = event.currentTarget;
                setSelectedImage(post);
              }}
              aria-label={post.description || post.caption || _copy('copy.be7e2f201293', { defaultValue: 'Images' })}
              className={cn(
                'relative aspect-square bg-zinc-800 overflow-hidden group cursor-pointer focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                isLargeTile && 'col-span-2 row-span-2'
              )}
            >
              <img
                src={post.image}
                alt={post.description || post.caption || ''}
                className={cn(
                  "w-full h-full object-cover rounded-lg transition-transform duration-300 group-hover:scale-105",
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
              <div data-grid-hover className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 sm:gap-5">
                <div className="flex items-center gap-1 sm:gap-1.5 text-white">
                  <ThumbsUp className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span className="font-semibold text-xs sm:text-sm">{formatCount(post.likes)}</span>
                </div>
                <div className="flex items-center gap-1 sm:gap-1.5 text-white">
                  <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span className="font-semibold text-xs sm:text-sm">{post.comments}</span>
                </div>
              </div>
            </button>
          );
        })}
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
                  className="size-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
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

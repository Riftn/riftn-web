import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { ClipboardPaste, Copy, ImagePlus, Maximize2, Trash2 } from 'lucide-react';
import './profile-image-menu.css';
import { BannerCropDialog } from './BannerCropDialog';
import { toast } from 'sonner';
import { MessageMenu, type MessageMenuAction } from '@/components/app/chat/MessageMenu';
import { useMenuPoint } from '@/components/app/chat/message-menu-kit';
import {
  ClipboardReadError,
  PROFILE_IMAGE_MAX_BYTES,
  copyImageToClipboard,
  imageFromPasteEvent,
  isTypingTarget,
  prepareProfileImage,
  readClipboardImage,
  type ProfileImageKind,
} from '@/lib/profile-image-edit';

const HOLD_MS = 450;

export interface ProfileImageMenuOptions {
  kind: ProfileImageKind;
  /** The profile owner: Change, Paste and Delete. Everyone else gets Copy. */
  canEdit: boolean;
  /** The picture on screen, for Copy. Missing = nothing to copy. */
  imageUrl?: string | null;
  /** A real uploaded picture (not the default art): Delete shows only then. */
  hasImage: boolean;
  /** A new picture from Change, Paste (menu or Ctrl/Cmd+V) or a drop. */
  onFile: (file: File) => void | Promise<void>;
  onRemove?: () => void | Promise<void>;
  /** Shown first when a tap on the picture does something else (plays their Moment). */
  onView?: () => void;
}

/**
 * Right-click (computer) or hold (phone) on a profile picture or banner opens
 * a small glass menu: Change, Paste, Copy, Delete for the owner, Copy for
 * everyone else. Ctrl/Cmd+V while pointing at it, or with it focused, pastes
 * an image straight in, and an image file can be dropped on it.
 *
 * Spread `targetProps` on the picture's box and render `menu` anywhere.
 */
export function useProfileImageMenu({ kind, canEdit, imageUrl, hasImage, onFile, onRemove, onView }: ProfileImageMenuOptions) {
  const { t } = useTranslation();
  const { point, openAt, close } = useMenuPoint();
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLElement | null>(null);
  const hovered = useRef(false);
  const hold = useRef<{ timer: number; x: number; y: number; id: number; fired: boolean } | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const label = kind === 'avatar'
    ? t('profileImage.avatar', 'Profile picture')
    : t('profileImage.cover', 'Banner');

  const take = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error(t('profileImage.notImage', 'That is not an image'));
      return;
    }
    const ready = await prepareProfileImage(file, kind);
    if (ready.size > PROFILE_IMAGE_MAX_BYTES[kind]) {
      toast.error(kind === 'avatar' ? t('settings.imageTooLarge5') : t('settings.imageTooLarge10'));
      return;
    }
    if (kind === 'cover' && ready.type !== 'image/gif') setBannerFile(ready);
    else await onFile(ready);
  }, [kind, onFile, t]);

  // Ctrl/Cmd+V while the pointer is on the picture (or it has focus).
  useEffect(() => {
    if (!canEdit) return;
    const onPaste = (event: ClipboardEvent) => {
      const box = boxRef.current;
      if (!box) return;
      const focused = !!document.activeElement && box.contains(document.activeElement);
      if (!hovered.current && !focused) return;
      if (isTypingTarget(event.target) && !focused) return;
      const file = imageFromPasteEvent(event);
      event.preventDefault();
      if (!file) {
        toast.message(t('profileImage.noImage', 'Copy an image first, then paste it here'));
        return;
      }
      void take(file);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [canEdit, take, t]);

  const pasteFromMenu = useCallback(async () => {
    try {
      await take(await readClipboardImage());
    } catch (err) {
      const reason = err instanceof ClipboardReadError ? err.reason : 'denied';
      if (reason === 'empty') toast.message(t('profileImage.noImage', 'Copy an image first, then paste it here'));
      else toast.message(t('profileImage.pasteKeys', 'Point at it and press Ctrl+V (⌘V on Mac) to paste'));
    }
  }, [take, t]);

  const copy = useCallback(async () => {
    if (!imageUrl) return;
    try {
      const what = await copyImageToClipboard(imageUrl);
      toast.success(what === 'image'
        ? t('profileImage.copied', 'Image copied')
        : t('profileImage.linkCopied', 'Image link copied'));
    } catch {
      toast.error(t('profileImage.copyFailed', 'Could not copy that image'));
    }
  }, [imageUrl, t]);

  const actions: MessageMenuAction[] = [];
  if (onView) {
    actions.push({ key: 'view', label: t('profileImage.view', 'View photo'), icon: <Maximize2 />, onSelect: onView });
  }
  if (canEdit) {
    actions.push({ key: 'change', label: t('profileImage.change', 'Change'), icon: <ImagePlus />, onSelect: () => inputRef.current?.click() });
    actions.push({ key: 'paste', label: t('profileImage.paste', 'Paste'), icon: <ClipboardPaste />, onSelect: () => { void pasteFromMenu(); } });
  }
  if (imageUrl) {
    actions.push({ key: 'copy', label: t('profileImage.copy', 'Copy'), icon: <Copy />, onSelect: () => { void copy(); } });
  }
  if (canEdit && hasImage && onRemove) {
    actions.push({ key: 'delete', label: t('profileImage.delete', 'Delete'), icon: <Trash2 />, destructive: true, divided: true, onSelect: () => { void onRemove(); } });
  }
  const enabled = actions.length > 0;

  const stopHold = useCallback(() => {
    if (hold.current) window.clearTimeout(hold.current.timer);
    if (hold.current && !hold.current.fired) hold.current = null;
  }, []);

  useEffect(() => () => { if (hold.current) window.clearTimeout(hold.current.timer); }, []);

  const targetProps = enabled
    ? {
        ref: (el: HTMLElement | null) => { boxRef.current = el; },
        'data-profile-image-target': kind,
        'data-drag-over': dragOver ? '' : undefined,
        // The page-wide "drop to create post" steps aside over the picture.
        'data-drop-attach': canEdit ? '' : undefined,
        'aria-haspopup': 'menu' as const,
        title: canEdit
          ? t('profileImage.hint', 'Right-click for options, or paste an image to replace it')
          : undefined,
        style: { WebkitTouchCallout: 'none' } as CSSProperties,
        onPointerEnter: () => { hovered.current = true; },
        onPointerLeave: () => { hovered.current = false; stopHold(); },
        onContextMenu: (e: React.MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          stopHold();
          openAt({ x: e.clientX, y: e.clientY });
        },
        // Phones: hold to open. The header's own hold (post background)
        // skips anything inside data-profile-image-target.
        onPointerDown: (e: React.PointerEvent) => {
          if (e.pointerType === 'mouse') return;
          const id = e.pointerId;
          const x = e.clientX;
          const y = e.clientY;
          if (hold.current) window.clearTimeout(hold.current.timer);
          hold.current = {
            id, x, y, fired: false,
            timer: window.setTimeout(() => {
              if (!hold.current || hold.current.id !== id) return;
              hold.current.fired = true;
              try { navigator.vibrate?.(12); } catch { /* not supported */ }
              openAt({ x, y });
            }, HOLD_MS),
          };
        },
        onPointerMove: (e: React.PointerEvent) => {
          const h = hold.current;
          if (!h || h.fired || e.pointerId !== h.id) return;
          if (Math.hypot(e.clientX - h.x, e.clientY - h.y) > 10) stopHold();
        },
        onPointerUp: stopHold,
        onPointerCancel: stopHold,
        // The click that ends a hold must not also open the full-size view.
        onClickCapture: (e: React.MouseEvent) => {
          if (hold.current?.fired) {
            e.preventDefault();
            e.stopPropagation();
            hold.current = null;
          }
        },
        ...(canEdit
          ? {
              onDragOver: (e: React.DragEvent) => {
                if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return;
                e.preventDefault();
                e.stopPropagation();
                setDragOver(true);
              },
              onDragLeave: () => setDragOver(false),
              onDrop: (e: React.DragEvent) => {
                const file = Array.from(e.dataTransfer?.files || []).find((f) => f.type.startsWith('image/'));
                setDragOver(false);
                if (!file) return;
                e.preventDefault();
                e.stopPropagation();
                void take(file);
              },
            }
          : {}),
      }
    : {};

  const menu = (
    <>
      {canEdit && (
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void take(file);
          }}
        />
      )}
      {canEdit && bannerFile && (
        <BannerCropDialog file={bannerFile} onCancel={() => setBannerFile(null)}
          onApply={async cropped => { await onFile(cropped); setBannerFile(null); }} />
      )}
      {enabled && (
        <MessageMenu
          point={point}
          onClose={close}
          quickReactions={null}
          actions={actions}
          label={label}
        />
      )}
    </>
  );

  return { targetProps, menu, openPicker: () => inputRef.current?.click() };
}

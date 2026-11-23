import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

export function BannerCropDialog({ file, onCancel, onApply }: {
  file: File;
  onCancel: () => void;
  onApply: (file: File) => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const image = useRef<HTMLImageElement>(null);
  const [src, setSrc] = useState('');
  const [position, setPosition] = useState(50);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function apply() {
    const img = image.current;
    if (!loaded || !img || submitting.current) return;
    submitting.current = true;
    setSaving(true);
    try {
      const width = Math.min(img.naturalWidth, img.naturalHeight * 3);
      const height = width / 3;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.min(1500, Math.round(width)));
      canvas.height = Math.max(1, Math.round(canvas.width / 3));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');
      ctx.drawImage(img, (img.naturalWidth - width) * position / 100,
        (img.naturalHeight - height) * position / 100, width, height,
        0, 0, canvas.width, canvas.height);
      const png = file.type !== 'image/jpeg';
      const blob = await new Promise<Blob | null>(resolve =>
        canvas.toBlob(resolve, png ? 'image/png' : 'image/jpeg', 0.92));
      if (!blob) throw new Error('Could not encode banner');
      await onApply(new File([blob], png ? 'cover.png' : 'cover.jpg', { type: blob.type }));
    } catch {
      toast.error(t('settings.failedUpdateProfile'));
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={open => { if (!open && !submitting.current) onCancel(); }}>
      <DialogContent aria-describedby={undefined}>
        <DialogTitle>{t('profileImage.cover', 'Banner')}</DialogTitle>
        {src && <img ref={image} src={src} alt={t('profileImage.cover', 'Banner')}
          className="aspect-[3/1] w-full rounded-xl object-cover"
          style={{ objectPosition: position + '% ' + position + '%' }}
          onLoad={() => setLoaded(true)}
          onError={() => { toast.error(t('profileImage.notImage', 'That is not an image')); onCancel(); }} />}
        <label className="grid gap-2 text-sm">
          {t('editor.document.position', 'Position')}
          <input type="range" min={0} max={100} value={position} disabled={!loaded || saving}
            onChange={event => setPosition(Number(event.target.value))} />
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>{t('common.cancel')}</Button>
          <Button type="button" disabled={!loaded || saving} onClick={apply}>{t('common.save')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

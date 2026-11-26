import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import Play from '@/components/ui/cut-icons/play';
import { apiCall } from '@/lib/api/dehub/core';

export function PpvFreePreview({ tokenId }: { tokenId: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const label = t('ppvPreview.watch', { defaultValue: 'Watch free preview' });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-on-media
          data-keep-dark
          className="absolute bottom-3 left-3 z-10 min-h-11"
          onClick={event => event.stopPropagation()}
        >
          <Play aria-hidden="true" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent aria-describedby={undefined} onClick={event => event.stopPropagation()}>
        <DialogTitle className="pr-8 text-foreground">{label}</DialogTitle>
        {open && <PreviewPlayer tokenId={tokenId} />}
      </DialogContent>
    </Dialog>
  );
}

function PreviewPlayer({ tokenId }: { tokenId: string }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const endpoint = `/api/nfts/video/${encodeURIComponent(tokenId)}/preview`;
    apiCall<{ url: string }>(endpoint).then(
      result => { if (active) setUrl(result.url); },
      () => { if (active) setFailed(true); },
    );
    return () => { active = false; };
  }, [tokenId, attempt]);

  return (
    <div className="flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-[var(--control-fill,transparent)]">
      {failed ? (
        <div className="space-y-3 p-3 text-center">
          <p role="status" className="text-sm text-foreground">{t('ppvPreview.unavailable', { defaultValue: 'Preview unavailable' })}</p>
          <Button variant="glass" onClick={() => { setFailed(false); setUrl(''); setAttempt(value => value + 1); }}>
            {t('ppvPreview.retry', { defaultValue: 'Try again' })}
          </Button>
        </div>
      ) : url ? (
        <video
          className="h-full w-full bg-black object-contain"
          data-keep-dark
          src={url}
          autoPlay
          playsInline
          controls
          onError={() => setFailed(true)}
          aria-label={t('ppvPreview.title', { defaultValue: 'Free video preview' })}
        />
      ) : (
        <p role="status" className="text-sm text-foreground">{t('ppvPreview.loading', { defaultValue: 'Loading preview…' })}</p>
      )}
    </div>
  );
}

import React, { useRef } from 'react';
import { Droplets, ImagePlus, Loader2, Sparkles, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CALL_BACKGROUNDS, CALL_FACE_FILTERS, loadCallBackgroundPhoto, storeCallBackgroundPhoto, type CallBackgroundId } from '@/lib/calls/call-background';
import { faceFiltersSupported, type FaceFilterId } from '@/lib/studio/face-filters';
import { backgroundRemovalSupported } from '@/lib/studio/background';

/**
 * Background effects on a video call: the round button in the stage's top
 * right corner opens a row of choices above the controls. Off, blur, four
 * scenes and your own photo. The pick is remembered for the next call.
 */
export function useCallBackgroundAvailable(): boolean {
  // Cheap and side-effect free (WASM + canvas capture); the model only loads on the first pick.
  return React.useMemo(() => backgroundRemovalSupported(), []);
}

export function CallFxButton({ open, onToggle, active }: { open: boolean; onToggle: () => void; active: boolean }) {
  const { t } = useTranslation();
  const label = t('calls.effects', 'Effects');
  return (
    <button
      type="button"
      className="call-stage__fx"
      data-active={active || open ? 'true' : 'false'}
      onClick={onToggle}
      aria-label={label}
      aria-expanded={open}
      title={label}
    >
      {open ? <X className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
    </button>
  );
}

export function CallBackgroundPanel({
  value,
  busy,
  onPick,
  onClose,
  faceFilter,
  onPickFace,
}: {
  value: CallBackgroundId;
  busy: boolean;
  onPick: (id: CallBackgroundId, photo?: string | null) => void;
  onClose: () => void;
  faceFilter?: FaceFilterId;
  onPickFace?: (id: FaceFilterId) => void;
}) {
  const faceAvailable = React.useMemo(() => faceFiltersSupported(), []);
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const savedPhoto = loadCallBackgroundPhoto();

  const pickPhoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const photo = await storeCallBackgroundPhoto(file);
      onPick('photo', photo);
    } catch {
      toast.error(t('calls.backgroundPhotoFailed', "That picture couldn't be opened."));
    }
  };

  return (
    <div className="call-fx" role="group" aria-label={t('calls.effects', 'Effects')}>
      <div className="call-fx__head">
        <span>{t('calls.background', 'Background')}</span>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-label={t('calls.backgroundLoading', 'Starting effect…')} /> : null}
        <button type="button" className="call-fx__close" onClick={onClose} aria-label={t('common.close', 'Close')}>
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="call-fx__row">
        {CALL_BACKGROUNDS.map(choice => {
          const selected = value === choice.id;
          const isPhoto = choice.id === 'photo';
          const onClick = () => {
            if (isPhoto && (!savedPhoto || selected)) { fileRef.current?.click(); return; }
            onPick(choice.id, isPhoto ? savedPhoto : null);
          };
          const style: React.CSSProperties = choice.stops
            ? { backgroundImage: choice.swatch }
            : isPhoto && savedPhoto ? { backgroundImage: `url("${savedPhoto}")` } : {};
          return (
            <button
              key={choice.id}
              type="button"
              className="call-fx__opt"
              data-selected={selected ? 'true' : 'false'}
              aria-pressed={selected}
              onClick={onClick}
              disabled={busy}
            >
              <span className="call-fx__swatch" data-kind={choice.id} style={style}>
                {choice.id === 'none' ? <X className="h-5 w-5" /> : null}
                {choice.id === 'blur' ? <Droplets className="h-5 w-5" /> : null}
                {isPhoto && !savedPhoto ? <ImagePlus className="h-5 w-5" /> : null}
              </span>
              <span className="call-fx__label">{t(choice.labelKey, choice.label)}</span>
            </button>
          );
        })}
      </div>
      {faceAvailable && onPickFace ? (
        <>
          <div className="call-fx__head call-fx__head--sub"><span>{t('calls.faceFilters', 'Face filters')}</span></div>
          <div className="call-fx__row">
            {CALL_FACE_FILTERS.map(choice => {
              const selected = (faceFilter ?? 'none') === choice.id;
              return (
                <button
                  key={choice.id}
                  type="button"
                  className="call-fx__opt"
                  data-selected={selected ? 'true' : 'false'}
                  aria-pressed={selected}
                  onClick={() => onPickFace(choice.id)}
                  disabled={busy}
                >
                  <span className="call-fx__swatch" data-kind={`face-${choice.id}`}>
                    {choice.id === 'none' ? <X className="h-5 w-5" /> : <span className="call-fx__emoji" aria-hidden>{choice.emoji}</span>}
                  </span>
                  <span className="call-fx__label">{t(choice.labelKey, choice.label)}</span>
                </button>
              );
            })}
          </div>
        </>
      ) : null}
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickPhoto} />
    </div>
  );
}

import { useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Music2 } from 'lucide-react';
import { AuthContext } from '@/contexts/AuthContext';
import { getAccountInfo, updateProfile } from '@/lib/api/dehub';
import { Switch } from '@/components/ui/switch';
import { SoundPicker } from '@/features/post/components/SoundPicker';
import { ProfileSongRow } from '@/components/app/profile/ProfileSong';
import {
  profileSongFromSound,
  profileSongPartLabel,
  readProfileSong,
  withProfileSong,
  type ProfileSong,
} from '@/lib/profile-song';
import { SETTINGS_INLINE_ACTION_CLASS, SETTINGS_LABEL_CLASS } from './SettingsRow';

/**
 * Settings > Profile > Profile song: one song under your bio. Pick it with the
 * same song picker as posts (free songs and your uploads), choose the part,
 * and whether it plays by itself when people open your profile.
 *
 * Saves on its own, merged into a fresh copy of `customs` so no other setting
 * is lost (the server replaces the whole blob).
 */
export function ProfileSongSetting({ previewSong }: { /** State gallery: show this song, save nothing. */ previewSong?: ProfileSong | null } = {}) {
  const { t } = useTranslation();
  const auth = useContext(AuthContext);
  const address = auth?.user?.address;
  const queryClient = useQueryClient();
  const preview = previewSong !== undefined;
  const [song, setSong] = useState<ProfileSong | null | undefined>(preview ? previewSong : undefined);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (preview || !address) return;
    let cancelled = false;
    getAccountInfo(address)
      .then((info) => { if (!cancelled) setSong(readProfileSong(info?.customs as Record<string, unknown> | undefined)); })
      .catch(() => { if (!cancelled) setSong(null); });
    return () => { cancelled = true; };
  }, [address, preview]);

  if (!address && !preview) return null;

  const save = async (next: ProfileSong | null, done?: string) => {
    const before = song;
    setSong(next);
    if (preview || !address) return;
    setSaving(true);
    try {
      const info = await getAccountInfo(address);
      const merged = withProfileSong(info?.customs as Record<string, unknown> | undefined, next);
      await updateProfile({ customs: merged });
      auth?.patchUser?.({ customs: merged } as never);
      void queryClient.invalidateQueries({ queryKey: ['dehub-profile'] });
      if (done) toast.success(done);
    } catch {
      setSong(before);
      toast.error(t('profileSong.saveFailed', 'Could not save your profile song. Try again.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div data-setting-anchor="profile-song" data-profile-song-setting className="space-y-3">
      <div>
        <span className={SETTINGS_LABEL_CLASS}>{t('profileSong.title', 'Profile song')}</span>
        <p className="text-sm text-zinc-400">{t('profileSong.hint', 'A song under your bio. People tap it to listen.')}</p>
      </div>

      {song ? (
        <>
          <ProfileSongRow song={song} isOwn autoStart={false} />
          <p className="text-xs text-zinc-500">{t('profileSong.part', { defaultValue: 'Plays {{part}}', part: profileSongPartLabel(song) })}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={SETTINGS_INLINE_ACTION_CLASS} disabled={saving} onClick={() => setPickerOpen(true)}>
              {t('profileSong.change', 'Change song')}
            </button>
            <button
              type="button"
              className={SETTINGS_INLINE_ACTION_CLASS}
              disabled={saving}
              onClick={() => void save(null, t('profileSong.removed', 'Profile song removed'))}
            >
              {t('profileSong.remove', 'Remove')}
            </button>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <label htmlFor="settings-profile-song-autoplay" className="block text-sm text-white">
                {t('profileSong.autoplay', 'Play when people visit')}
              </label>
              <p className="mt-0.5 text-sm text-zinc-400">{t('profileSong.autoplayHint', 'Fades in softly when someone opens your profile. They can stop it with one tap.')}</p>
            </div>
            <Switch
              id="settings-profile-song-autoplay"
              checked={song.autoplay}
              disabled={saving}
              onCheckedChange={(on) => void save({ ...song, autoplay: on })}
            />
          </div>
        </>
      ) : (
        <button
          type="button"
          data-profile-song-add
          className={`${SETTINGS_INLINE_ACTION_CLASS} inline-flex items-center gap-2`}
          disabled={song === undefined || saving}
          onClick={() => setPickerOpen(true)}
        >
          <Music2 aria-hidden className="h-4 w-4" />
          {t('profileSong.add', 'Add a song')}
        </button>
      )}

      {pickerOpen && (
        <SoundPicker
          isOpen={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onSelect={(sound) => {
            setPickerOpen(false);
            const next = profileSongFromSound(sound, song ? song.autoplay : true);
            if (!next) {
              toast.error(t('profileSong.cantUse', "That song can't be used on a profile. Try another one."));
              return;
            }
            void save(next, t('profileSong.saved', 'Profile song saved'));
          }}
        />
      )}
    </div>
  );
}

import { useTranslation as _useCopy } from 'react-i18next';
import { Music, Video } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { SOUND_MIX_PRESETS, type SoundMix } from '@/lib/sound-window';

interface Props {
  mix: SoundMix;
  onChange: (mix: SoundMix) => void;
  className?: string;
}

const same = (a: SoundMix, b: SoundMix) =>
  Math.round(a.song * 100) === Math.round(b.song * 100) && Math.round(a.video * 100) === Math.round(b.video * 100);

/**
 * How loud the post's song and the video's own sound play: two sliders and
 * three quick picks. Shown under the attached song on a video post.
 */
export function SoundMixer({ mix, onChange, className }: Props) {
  const { t: _copy } = _useCopy();
  const rows = [
    { key: 'song' as const, icon: Music, label: _copy('copy.fea4b5ceffa8', { defaultValue: 'Song' }) },
    { key: 'video' as const, icon: Video, label: _copy('copy.4bf9a522a0de', { defaultValue: 'Video sound' }) },
  ];
  const picks = [
    { mix: SOUND_MIX_PRESETS.songOnly, label: _copy('copy.5405fb40dded', { defaultValue: 'Song only' }) },
    { mix: SOUND_MIX_PRESETS.mix, label: _copy('copy.dce6eb4447ef', { defaultValue: 'Mix' }) },
    { mix: SOUND_MIX_PRESETS.videoOnly, label: _copy('copy.0f8fed0dc99b', { defaultValue: 'Video only' }) },
  ];
  return (
    <div data-sound-mixer className={cn('space-y-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 backdrop-blur-md', className)}>
      {rows.map(({ key, icon: Icon, label }) => {
        const value = Math.round(mix[key] * 100);
        return (
          <div key={key} className="flex items-center gap-2.5">
            <Icon className="h-3.5 w-3.5 shrink-0 text-white/60" aria-hidden="true" />
            <span className="w-[76px] shrink-0 truncate text-xs text-white/80">{label}</span>
            <Slider
              value={[value]}
              min={0}
              max={100}
              step={1}
              onValueChange={([v]) => onChange({ ...mix, [key]: v / 100 })}
              aria-label={label}
              className="flex-1"
            />
            <span className="w-9 shrink-0 text-right text-xs tabular-nums text-white/70">{value}%</span>
          </div>
        );
      })}
      <div className="flex gap-1.5 pt-0.5">
        {picks.map((pick) => {
          const on = same(mix, pick.mix);
          return (
            <button
              key={pick.label}
              type="button"
              data-mix-pick
              aria-pressed={on}
              onClick={() => onChange({ ...pick.mix })}
              className={cn(
                'h-7 flex-1 rounded-full border text-[11px] font-semibold transition-colors',
                on ? 'border-white bg-white text-black' : 'border-white/15 bg-white/[0.06] text-white/80 hover:bg-white/[0.12]',
              )}
            >
              {pick.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

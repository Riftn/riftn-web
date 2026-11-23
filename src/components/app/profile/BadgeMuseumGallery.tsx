import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Milestone, Milestones } from '@/hooks/use-milestones';
import { BadgeMuseumPanel, BadgeMuseumSheet, MilestoneChips } from '@/components/app/profile/BadgeMuseum';
import { BadgeMuseumSetting } from '@/components/app/settings/BadgeMuseumSetting';

/** State gallery (`?museum=1`, `?museum=sheet`): the Badge Museum on fixed data. */
const STEPS: Array<[string, Milestone['kind'], number, number]> = [
  ['views_1k', 'views', 1_000, 30],
  ['views_10k', 'views', 10_000, 60],
  ['views_100k', 'views', 100_000, 88],
  ['views_1m', 'views', 1_000_000, 100],
  ['videos_10', 'videos', 10, 40],
  ['videos_50', 'videos', 50, 66],
  ['videos_200', 'videos', 200, 92],
  ['followers_100', 'followers', 100, 50],
  ['followers_1k', 'followers', 1_000, 80],
  ['followers_10k', 'followers', 10_000, 98],
  ['likes_1k', 'likes', 1_000, 72],
  ['first_live', 'lives', 1, 20],
  ['live_10h', 'liveHours', 10, 70],
];
const VALUES: Record<Milestone['kind'], number> = { views: 35_600, videos: 62, followers: 440, likes: 820, lives: 3, liveHours: 6.5 };

function sample(address: string, hidden: boolean): Milestones {
  const milestones = STEPS.map(([id, kind, goal, rarity]) => ({ id, kind, goal, rarity, value: VALUES[kind], earned: VALUES[kind] >= goal }));
  const earned = milestones.filter((m) => m.earned).sort((a, b) => b.rarity - a.rarity);
  return { address, milestones, top: earned.slice(0, 3).map((m) => m.id), earned: earned.length, total: milestones.length, hidden, updatedAt: new Date().toISOString() };
}

const ON = '0x7777777777777777777777777777777777777771';
const OFF = '0x7777777777777777777777777777777777777772';

export function BadgeMuseumGallery({ sheet }: { sheet: boolean }) {
  const qc = useQueryClient();
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(sheet);
  useEffect(() => {
    qc.setQueryData(['profile-milestones', ON], sample(ON, false));
    qc.setQueryData(['profile-milestones', OFF], sample(OFF, true));
    setReady(true);
  }, [qc]);
  if (!ready) return null;

  const profile = (address: string, label: string) => (
    <section data-page-bento data-museum-profile={label} className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
      <h2 className="mb-3 text-xs font-semibold text-zinc-500">{label}</h2>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xl font-bold text-white">Mira Sol</span>
        <MilestoneChips address={address} own />
      </div>
      <p className="text-sm text-zinc-400">@mirasol</p>
      <p className="mt-2 text-sm text-white/80">
        <b className="text-white">182</b> Following · <b className="text-white">440</b> Followers · <b className="text-white">35.6K</b> reach
      </p>
      <BadgeMuseumPanel address={address} />
    </section>
  );

  return (
    <div data-badge-museum-gallery className="mb-5 grid gap-4 md:grid-cols-2">
      <section data-page-bento data-museum-settings className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
        <h2 className="mb-3 text-xs font-semibold text-zinc-500">Settings › Profile</h2>
        <BadgeMuseumSetting previewAddress={OFF} />
      </section>
      <div className="grid gap-4">
        {profile(OFF, 'Profile, museum off (default)')}
        {profile(ON, 'Profile, museum switched on')}
      </div>
      <BadgeMuseumSheet address={OFF} open={open} onOpenChange={setOpen} />
    </div>
  );
}

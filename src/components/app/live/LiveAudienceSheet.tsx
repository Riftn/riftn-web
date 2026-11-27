/**
 * "Who's here": the live room's people, in one sheet.
 *
 * Opened from the faces pill under the live header. Four lists, best first:
 * the host and when they went live, top tippers (confirmed DHB, summed per
 * person), most active (chat lines since going live) and everyone watching,
 * newest first. Data comes from GET /live/:streamId/audience.
 *
 * Canvas themes draw each list as a glass bento; System has no boxes, only
 * hairlines (src/styles/live-audience.css). The app's LiveWhosHereSheet is the
 * twin of this.
 */
import { useCallback, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import { Crown } from "lucide-react";
import Eye from "@/components/ui/cut-icons/visibility";

import MessageCircle from "@/components/ui/cut-icons/messages";

import dehubCoin from '@/assets/dehub-coin.png';
import { useDrawerPullDismiss } from '@/hooks/use-drawer-pull-dismiss';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { BadgeIcon } from '@/components/app/BadgeIcon';
import { buildAvatarUrl } from '@/lib/media-url';
import type { LiveAudience, LiveAudienceAccount } from '@/lib/api/dehub/livestream';
import { profilePath } from '@/lib/profile-path';
import { LiveAudienceProfileContext } from './live-audience-profile';

const compact = (n: number) => {
  try {
    return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  } catch {
    return String(n);
  }
};

export const audienceName = (a: LiveAudienceAccount) =>
  a.displayName || a.username || (a.address ? `${a.address.slice(0, 6)}…${a.address.slice(-4)}` : '?');

export const audienceAvatar = (a: LiveAudienceAccount) => buildAvatarUrl(a.address, a.avatarImageUrl);

function audienceProfilePath(account: LiveAudienceAccount): string | null {
  const handle = account.username?.trim().replace(/^@+/, '');
  const address = account.address?.trim();
  if (handle) return profilePath(encodeURIComponent(handle));
  return address ? `/app/profile?id=${encodeURIComponent(address)}` : null;
}

const ago = (iso?: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? formatDistanceToNow(d, { addSuffix: true }) : null;
};

interface RowProps {
  account: LiveAudienceAccount;
  meta: React.ReactNode;
  right?: React.ReactNode;
  large?: boolean;
  onOpen: (path: string) => void;
}

function Row({ account, meta, right, large, onOpen }: RowProps) {
  const name = audienceName(account);
  const path = audienceProfilePath(account);
  return (
    <Button
      type="button"
      variant="ghost"
      data-live-audience-row
      disabled={!path}
      onClick={(event) => {
        event.stopPropagation();
        if (path) onOpen(path);
      }}
      className="flex h-auto min-h-11 w-full justify-start gap-2.5 px-0 py-1.5 text-left backdrop-blur-none focus-visible:ring-inset"
    >
      <Avatar className={large ? 'h-9 w-9' : 'h-8 w-8'}>
        <AvatarImage src={audienceAvatar(account)} alt={name} />
        <AvatarFallback className="bg-zinc-700 text-xs font-semibold text-white">{name[0]?.toUpperCase()}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-baseline gap-1 text-[14px] font-bold" data-live-audience-ink>
          <span className="truncate">{name}</span>
          {!account.hideBadgeAndBalance ? (
            <BadgeIcon badgeBalance={account.badgeBalance} username={account.username} className="h-[11px] w-[11px] shrink-0" />
          ) : null}
        </span>
        <span className="flex items-center gap-1 text-[12px]" data-live-audience-muted>{meta}</span>
      </span>
      {right}
    </Button>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  audience: LiveAudience | undefined;
  loading: boolean;
}

export function LiveAudienceSheet({ open, onOpenChange, audience, loading }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const openLiveAudienceProfile = useContext(LiveAudienceProfileContext);

  const openProfile = useCallback(
    (path: string) => {
      onOpenChange(false);
      if (openLiveAudienceProfile) openLiveAudienceProfile(path);
      else navigate(path);
    },
    [navigate, onOpenChange, openLiveAudienceProfile],
  );

  // The whole sheet drags shut; the list hands over once it is at the top.
  const pullRef = useDrawerPullDismiss<HTMLDivElement>(() => onOpenChange(false));

  const host = audience?.host;
  const tippers = audience?.topTippers ?? [];
  const active = audience?.mostActive ?? [];
  const here = audience?.here ?? [];

  const rank = (i: number) => (
    <span className="min-w-4 text-right text-[13px] font-extrabold" data-live-audience-muted>{i + 1}</span>
  );

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent column glass className="max-h-[82dvh] pb-[max(1rem,env(safe-area-inset-bottom))]" data-live-audience>
        <div ref={pullRef} data-vaul-no-drag className="flex min-h-0 flex-auto flex-col [touch-action:pan-y]">
          <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-white/25" />
          <div className="flex shrink-0 items-center justify-between px-4 pb-2.5 pt-2">
            <DrawerTitle className="text-base font-extrabold" data-live-audience-ink>{t('liveAudience.whosHere', "Who's here")}</DrawerTitle>
            <span className="flex items-center gap-1.5 text-[13px] font-semibold" data-live-audience-muted>
              <Eye className="h-3.5 w-3.5" />
              {t('liveAudience.watchingCount', { formatted: compact(audience?.watching ?? 0), defaultValue: '{{formatted}} watching' })}
            </span>
          </div>

          <div className="min-h-0 flex-auto overflow-y-auto overscroll-contain [touch-action:pan-y]" data-live-audience-list>
            {host ? (
              <section data-live-audience-section>
                <h4 data-live-audience-label>{t('liveAudience.host', 'Host')}</h4>
                <Row
                  account={host}
                  large
                  onOpen={openProfile}
                  meta={ago(host.startedAt) ? t('liveAudience.startedAgo', { time: ago(host.startedAt), defaultValue: 'Started {{time}}' }) : null}
                />
              </section>
            ) : null}

            {tippers.length ? (
              <section data-live-audience-section>
                <h4 data-live-audience-label>{t('liveAudience.topTippers', 'Top tippers')}</h4>
                {tippers.slice(0, 5).map((p, i) => (
                  <Row
                    key={p.address}
                    account={p}
                    onOpen={openProfile}
                    meta={<><img src={dehubCoin} alt="" className="h-[11px] w-[11px]" />{compact(p.total)}</>}
                    right={i === 0 ? <Crown className="h-4 w-4" data-live-audience-accent /> : rank(i)}
                  />
                ))}
              </section>
            ) : null}

            {active.length ? (
              <section data-live-audience-section>
                <h4 data-live-audience-label>{t('liveAudience.mostActive', 'Most active')}</h4>
                {active.slice(0, 5).map((p, i) => (
                  <Row
                    key={p.address}
                    account={p}
                    onOpen={openProfile}
                    meta={<><MessageCircle className="h-[11px] w-[11px]" />{compact(p.messages)}</>}
                    right={rank(i)}
                  />
                ))}
              </section>
            ) : null}

            <section data-live-audience-section>
              <h4 data-live-audience-label>{t('liveAudience.hereNow', 'Here now')}</h4>
              {here.length ? (
                here.slice(0, 30).map((p) => (
                  <Row
                    key={p.address}
                    account={p}
                    onOpen={openProfile}
                    meta={t('liveAudience.joinedAgo', { time: ago(p.joinedAt) ?? '', defaultValue: 'joined {{time}}' })}
                  />
                ))
              ) : (
                <p className="py-2 text-[13px]" data-live-audience-muted>{loading ? '…' : t('liveAudience.nobodyYet', 'No one yet')}</p>
              )}
            </section>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export default LiveAudienceSheet;

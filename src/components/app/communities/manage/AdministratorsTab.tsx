import { useSurfaceDraft, draftIdentity } from '@/hooks/use-surface-draft';
/**
 * Administrators Tab
 * ==================
 * Telegram's "Administrators" screen: who owns the community, who moderates it
 * and with which rights, plus a search box for promoting somebody new.
 *
 * Promote candidates are drawn like the feed draws people (avatar, name, badge,
 * @handle), from one batch account lookup over a bounded slice of the member
 * list. The same lookup lets the search match names and @handles.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Crown, Shield } from "lucide-react";
import ChevronRight from "@/components/ui/cut-icons/next";
import Search from "@/components/ui/cut-icons/search";
import User from "@/components/ui/cut-icons/profile";

import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useCommunityMembers, type Community, type CommunityMember } from '@/hooks/use-communities';
import { useCommunityAbilities, ADMIN_RIGHTS } from '@/hooks/use-community-admin';
import { useDeHubProfile } from '@/hooks/use-dehub-profile';
import { getAccountSummaries, type AccountSummary } from '@/lib/api/dehub';
import { buildAvatarUrl, deviceWidth } from '@/lib/media-url';
import { parseBadgeLock } from '@/lib/staking-badge-rules';
import type { BadgeLock } from '@/lib/staking-badges';
import { CardHeader } from '@/components/app/cards/CardHeader';
import { BadgedName } from '@/components/app/BadgedName';
import { AppState } from '@/components/app/AppState';
import { AdminRightsDialog } from './AdminRightsDialog';

export interface AdministratorsTabProps {
  community: Community;
  membership: CommunityMember | null | undefined;
}

/** How many plain members the promote search will look at (one profile call each). */
const SEARCH_POOL = 200;
/** How many promote candidates are ever painted at once. */
const MAX_RESULTS = 25;

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function Avatar({ url }: { url?: string }) {
  return (
    <div className="w-9 h-9 rounded-lg bg-white/[0.08] flex items-center justify-center overflow-hidden flex-shrink-0">
      {url ? (
        <img src={url} alt="" className="w-full h-full object-cover" />
      ) : (
        <User className="w-4 h-4 text-zinc-500" />
      )}
    </div>
  );
}

function OwnerRow({ member, identity }: { member: CommunityMember; identity?: CandidateIdentity }) {
  const { t } = useTranslation();
  const { data: fetched } = useDeHubProfile({ userId: identity ? undefined : member.wallet_address });
  const profile = identity
    ? { name: identity.name, handle: identity.username, avatarUrl: identity.avatarUrl, badgeBalance: identity.badgeBalance }
    : fetched;
  const displayName = profile?.name || shortAddress(member.wallet_address);

  return (
    <div className="flex items-center gap-3 p-2.5 rounded-xl">
      <Avatar url={profile?.avatarUrl} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <BadgedName
            badgeBalance={profile?.badgeBalance}
            username={profile?.handle}
            className="text-white font-medium text-sm"
          >
            {displayName}
          </BadgedName>
          <Crown className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
        </div>
        <span className="text-zinc-500 text-xs">
          {t('communities.manage.ownerBadge', { defaultValue: 'Owner' })}
        </span>
      </div>
    </div>
  );
}

function AdminRow({
  member,
  onManage,
  identity,
}: {
  member: CommunityMember;
  onManage: ((member: CommunityMember) => void) | null;
  identity?: CandidateIdentity;
}) {
  const { t } = useTranslation();
  const { data: fetched } = useDeHubProfile({ userId: identity ? undefined : member.wallet_address });
  const profile = identity
    ? { name: identity.name, handle: identity.username, avatarUrl: identity.avatarUrl, badgeBalance: identity.badgeBalance }
    : fetched;

  const displayName = profile?.name || shortAddress(member.wallet_address);
  const badge = member.custom_title?.trim() || t('communities.manage.adminBadge', { defaultValue: 'Admin' });
  const granted = ADMIN_RIGHTS.filter((right) => member.permissions?.[right.key] === true).length;

  const body = (
    <>
      <Avatar url={profile?.avatarUrl} />
      <div className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-1.5">
          <BadgedName
            badgeBalance={profile?.badgeBalance}
            username={profile?.handle}
            className="text-white font-medium text-sm"
          >
            {displayName}
          </BadgedName>
          <Shield className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
          <span className="text-zinc-500 text-xs truncate">{badge}</span>
        </div>
        <span className="text-zinc-500 text-xs">
          {t('communities.manage.rightsSummary', {
            defaultValue: '{{granted}} of {{total}} rights',
            granted,
            total: ADMIN_RIGHTS.length,
          })}
        </span>
      </div>
      {onManage && <ChevronRight className="w-4 h-4 text-zinc-500 flex-shrink-0" />}
    </>
  );

  if (!onManage) {
    return <div className="flex items-center gap-3 p-2.5 rounded-xl">{body}</div>;
  }

  return (
    <button
      type="button"
      onClick={() => onManage(member)}
      aria-label={t('communities.manage.editRightsFor', {
        defaultValue: 'Edit admin rights for {{name}}',
        name: displayName,
      })}
      className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/[0.06] transition-colors"
    >
      {body}
    </button>
  );
}

/** What the feed needs to draw one person, from the batch account lookup. */
interface CandidateIdentity {
  name: string;
  username?: string;
  avatarUrl?: string;
  badgeBalance?: number;
  badgeLock: BadgeLock | null;
}

function toIdentity(summary: AccountSummary): CandidateIdentity {
  const username = summary.username?.trim() || undefined;
  const avatarPath = summary.avatarImageUrl || undefined;
  return {
    name: summary.displayName?.trim() || username || shortAddress(summary.address),
    username,
    avatarUrl: avatarPath ? buildAvatarUrl(summary.address, avatarPath, deviceWidth(36)) : undefined,
    badgeBalance: summary.badgeBalance ?? undefined,
    badgeLock: parseBadgeLock(summary.badgeLock),
  };
}

/**
 * One member who can be promoted, drawn with the feed's own identity line
 * (avatar, name, badge, @handle) so the picker reads like the feed does.
 */
function CandidateRow({
  member,
  onPromote,
  identity,
}: {
  member: CommunityMember;
  onPromote: (member: CommunityMember) => void;
  identity?: CandidateIdentity;
}) {
  const { t } = useTranslation();
  const displayName = identity?.name || shortAddress(member.wallet_address);

  return (
    <div className="flex items-center gap-2 p-2.5 rounded-xl hover:bg-white/[0.06] transition-colors">
      <CardHeader
        className="pb-0 pr-1"
        username={displayName}
        handle={identity?.username}
        avatarSeed={identity?.avatarUrl || ''}
        contentType="post"
        creatorId={member.wallet_address}
        creatorUsername={identity?.username}
        badgeBalance={identity?.badgeBalance ?? 0}
        badgeLock={identity?.badgeLock}
      />
      <Button
        size="sm"
        variant="ghost"
        onClick={() => onPromote(member)}
        aria-label={t('communities.manage.promoteMember', {
          defaultValue: 'Promote {{name}}',
          name: displayName,
        })}
        className="rounded-xl h-9 px-3 text-emerald-400 hover:bg-emerald-500/15 border border-white/[0.08] flex-shrink-0"
      >
        {t('communities.manage.promote', { defaultValue: 'Promote' })}
      </Button>
    </div>
  );
}

export function AdministratorsTab({ community, membership }: AdministratorsTabProps) {
  const { t } = useTranslation();
  const abilities = useCommunityAbilities(community, membership);
  const { data: members = [], isLoading } = useCommunityMembers(community.id);

  const [search, setSearch] = useSurfaceDraft("components/app/communities/manage/AdministratorsTab.tsx:search", '', draftIdentity(community));
  const debouncedSearch = useDebouncedValue(search, 300);
  const [target, setTarget] = useState<CommunityMember | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const canAddAdmins = abilities.can('add_admins');

  const { owner, admins, plainMembers } = useMemo(() => {
    const sorted = [...members].sort((a, b) => a.joined_at.localeCompare(b.joined_at));
    return {
      owner: sorted.find((m) => m.role === 'owner') ?? null,
      admins: sorted.filter((m) => m.role === 'admin'),
      plainMembers: sorted.filter((m) => m.role === 'member'),
    };
  }, [members]);

  const pool = useMemo<CommunityMember[]>(
    () => (canAddAdmins ? plainMembers.slice(0, SEARCH_POOL) : []),
    [canAddAdmins, plainMembers],
  );
  // Owner and admins ride the same batch call, so their rows fill in with it.
  const lookup = useMemo<CommunityMember[]>(
    () => [...(owner ? [owner] : []), ...admins, ...pool],
    [owner, admins, pool],
  );

  const query = debouncedSearch.trim().toLowerCase();

  // Names, handles, pictures and badges for the whole pool in one batch call,
  // loaded as soon as the tab opens: the list shows people, never bare wallets,
  // and typing a name or @handle filters straight away.
  const { data: profileSummaries = [], isLoading: profilesLoading } = useQuery({
    queryKey: ['community-admin-candidate-profiles', community.id, lookup.map(member => member.wallet_address).join(',')],
    queryFn: () => getAccountSummaries(lookup.map(member => member.wallet_address)),
    enabled: lookup.length > 0,
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const profiles = useMemo(() => new Map(profileSummaries.map(summary => [
    summary.address.toLowerCase(),
    toIdentity(summary),
  ])), [profileSummaries]);
  const searching = query.length > 0 && profilesLoading;

  const candidates: CommunityMember[] = [];
  for (let i = 0; i < pool.length && candidates.length < MAX_RESULTS; i++) {
    const member = pool[i];
    if (query) {
      const profile = profiles.get(member.wallet_address.toLowerCase());
      const haystack = [member.wallet_address, profile?.name ?? '', profile?.username ?? '', profile?.username ? `@${profile.username}` : '']
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(query)) continue;
    }
    candidates.push(member);
  }

  const openFor = (member: CommunityMember) => {
    setTarget(member);
    setDialogOpen(true);
  };

  /** The owner manages anybody; an admin can promote, but not touch a peer. */
  const canManageAdmin = abilities.isOwner;

  return (
    <div className="space-y-4">
      <section>
        <h3 className="text-white font-medium text-sm mb-2 px-1">
          {t('communities.manage.ownerSection', { defaultValue: 'Owner' })}
        </h3>
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-1.5">
          {owner ? (
            <OwnerRow member={owner} identity={profiles.get(owner.wallet_address.toLowerCase())} />
          ) : (
            <p className="text-center text-zinc-500 text-sm py-4">
              {isLoading
                ? t('communities.manage.loading', { defaultValue: 'Loading…' })
                : t('communities.manage.noOwner', { defaultValue: 'No owner on record.' })}
            </p>
          )}
        </div>
      </section>

      <section>
        <h3 className="text-white font-medium text-sm mb-2 px-1">
          {t('communities.manage.administratorsSection', { defaultValue: 'Administrators' })}
        </h3>
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-1.5">
          {admins.length === 0 ? (
            isLoading ? (
              <p className="text-center text-zinc-500 text-sm py-4 px-3">
                {t('communities.manage.loading', { defaultValue: 'Loading…' })}
              </p>
            ) : (
              <AppState
                icon="accounts"
                title={t('communities.manage.noAdminsTitle', { defaultValue: 'No administrators yet' })}
                description={t('communities.manage.noAdmins', { defaultValue: 'Promote a member to help you moderate.' })}
                size="compact"
              />
            )
          ) : (
            admins.map((admin) => (
              <AdminRow
                key={admin.id}
                member={admin}
                identity={profiles.get(admin.wallet_address.toLowerCase())}
                onManage={canManageAdmin ? openFor : null}
              />
            ))
          )}
        </div>
      </section>

      {canAddAdmins && (
        <section>
          <h3 className="text-white font-medium text-sm mb-2 px-1">
            {t('communities.manage.addAdministrator', { defaultValue: 'Add administrator' })}
          </h3>
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-1.5 space-y-1">
            <div className="relative mx-1 mb-1">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('communities.manage.searchMembers', {
                  defaultValue: 'Search members',
                })}
                aria-label={t('communities.manage.searchMembers', {
                  defaultValue: 'Search members',
                })}
                className="h-9 rounded-xl bg-white/[0.04] border-white/10 text-white placeholder:text-zinc-600 text-sm pl-9"
              />
            </div>
            {candidates.length === 0 ? (
              searching ? (
                <p className="text-center text-zinc-500 text-sm py-4 px-3">
                  {t('communities.manage.searching', { defaultValue: 'Searching…' })}
                </p>
              ) : (
                <AppState
                  icon={query ? 'search' : 'accounts'}
                  title={query
                    ? t('communities.manage.noMemberMatches', { defaultValue: 'No members match that search.' })
                    : t('communities.manage.noMembersToPromote', { defaultValue: 'Everyone here is already an admin.' })}
                  kind={query ? 'search-empty' : 'empty'}
                  size="compact"
                />
              )
            ) : (
              candidates.map((member) => (
                <CandidateRow
                  key={member.id}
                  member={member}
                  identity={profiles.get(member.wallet_address.toLowerCase())}
                  onPromote={openFor}
                />
              ))
            )}
          </div>
        </section>
      )}

      <AdminRightsDialog
        community={community}
        membership={membership}
        target={target}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}

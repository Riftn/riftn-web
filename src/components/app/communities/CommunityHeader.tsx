import { useSurfaceDraft, draftIdentity } from '@/hooks/use-surface-draft';
import { holderGateOf } from '@/hooks/use-holder-gate';
import { HolderGateChip } from './HolderGateChip';
import { CommunityKindChip } from './CommunityKindChip';
import { communityKindOf, entryPriceOf } from '@/lib/community-kinds';
import dehubCoin from '@/assets/dehub-coin.png';
import { useRef, useState, useCallback } from 'react';
import { LogIn, Crown, Pin, PinOff, TrendingUp, FileText, Clock, MessageSquarePlus } from "lucide-react";
import Users from "@/components/ui/cut-icons/communities";
import LogOut from "@/components/ui/cut-icons/sign-out";
import Camera from "@/components/ui/cut-icons/camera";
import Pencil from "@/components/ui/cut-icons/edit";
import Check from "@/components/ui/cut-icons/check";
import Link2 from "@/components/ui/cut-icons/link";
import LinkIcon from "@/components/ui/cut-icons/link";

import X from "@/components/ui/cut-icons/close";
import Share2 from "@/components/ui/cut-icons/feedshare";
import Send from "@/components/ui/cut-icons/send";
import Settings2 from "@/components/ui/cut-icons/settings";

import { NewConversationModal } from '@/components/app/chat/NewConversationModal';
import { InviteFollowers } from './InviteFollowers';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CommunityTickerSearch } from './CommunityTickerSearch';
import type { DexPair } from '@/hooks/use-dexscreener';
import { uploadCommunityMedia, useUpdateCommunity, usePinnedCommunities, usePinCommunity, useUnpinCommunity } from '@/hooks/use-communities';
import type { Community } from '@/hooks/use-communities';
import { useAuth } from '@/contexts/AuthContext';
import { useGlobalDropZone } from '@/hooks/use-global-drop-zone';
import { dehubLinkFor } from '@/lib/dehub-links';
import { toast } from 'sonner';
import { useChatPrefs } from '@/hooks/use-chat-prefs';
import { roomChatId } from '@/lib/api/dehub/chat-prefs';
import { useTranslation } from 'react-i18next';
import { DescriptionWithLinks } from './DescriptionWithLinks';
import { storageImage, deviceWidth, isMdUp } from '@/lib/media-url';
import { viewerShareUrl } from '@/lib/share-url';
import { trackShare } from '@/lib/analytics';

interface CommunityHeaderProps {
  community: Community;
  isMember: boolean;
  isPendingMember: boolean;
  /** Founder, or whoever ownership was transferred to. Only drives the join button. */
  isOwner: boolean;
  /** Holds change_info — inline name/description/avatar/banner/ticker editing. */
  canEdit: boolean;
  /** Holds any moderation right — shows the Manage entry point. */
  canManage: boolean;
  /**
   * Holds add_members, the member right to share the community with somebody.
   * Only members are subject to it: a visitor has no row to restrict, and the
   * link is public either way, so this hides the send-it-to-someone path only.
   */
  canInvite: boolean;
  onManage: () => void;
  isPending: boolean;
  onJoinLeave: () => void;
  /** Open the invite picker on arrival (a group or channel that was just made). */
  autoInvite?: boolean;
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 1) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}m`;
  const years = Math.floor(diffDays / 365);
  return `${years}y`;
}

export function CommunityHeader({ community, isMember, isPendingMember, isOwner, canEdit, canManage, canInvite, onManage, isPending, onJoinLeave, autoInvite }: CommunityHeaderProps) {
  const { walletAddress } = useAuth();
  const { openPostModal } = useGlobalDropZone();
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const updateMutation = useUpdateCommunity();
  const holderGate = holderGateOf(community);
  const [uploading, setUploading] = useState<'avatar' | 'banner' | null>(null);
  const [showTickerInput, setShowTickerInput] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [nameInput, setNameInput] = useSurfaceDraft("src/components/app/communities/CommunityHeader.tsx:nameInput", community.name, community.id);
  const [descInput, setDescInput] = useSurfaceDraft("src/components/app/communities/CommunityHeader.tsx:descInput", community.description || '', community.id);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [followersOpen, setFollowersOpen] = useState(!!autoInvite);
  const entryPrice = isOwner ? 0 : entryPriceOf(community);
  const navigate = useNavigate();
  const { t } = useTranslation();

  const { data: pinned = [] } = usePinnedCommunities(walletAddress);
  const pinMutation = usePinCommunity();
  const unpinMutation = useUnpinCommunity();
  const isPinned = pinned.some(p => p.community_id === community.id);

  const handleMediaChange = useCallback(async (file: File, type: 'avatar' | 'banner') => {
    setUploading(type);
    try {
      const url = await uploadCommunityMedia(file, community.slug, type);
      await updateMutation.mutateAsync({
        id: community.id,
        [type === 'avatar' ? 'avatar_url' : 'banner_url']: url,
      });
    } catch {
      toast.error(t('communities.failedUpload', { type }));
    } finally {
      setUploading(null);
    }
  }, [community.id, community.slug, updateMutation, t]);

  const handlePinToggle = () => {
    if (isPinned) {
      unpinMutation.mutate(community.id);
    } else if (pinned.length < 3) {
      pinMutation.mutate({ communityId: community.id, displayOrder: pinned.length });
    } else {
      toast.error(t('communities.maxPins'));
    }
  };

  const avatarSrc = storageImage(community.avatar_url, deviceWidth(104));
  const hasBanner = !!community.banner_url;
  const buttonBase = 'rounded-xl gap-1.5 h-9 px-3 bg-white/10 border border-white/20 text-white hover:bg-white/15';
  const joinPrimary = !isOwner && !isMember && !isPendingMember;
  // Optional: a member can put this community's chat in their Messages list.
  // Groups and channels are always there, so they get no button.
  const { byId: chatPrefs, update: updateChatPref } = useChatPrefs();
  const canAddToMessages = !!walletAddress && (isMember || isOwner) && communityKindOf(community) === 'community';
  const inMessages = !!chatPrefs.get(roomChatId(community.id))?.listedAt;

  return (
    <div className="px-3 pt-3 pb-4 relative">
      {/* Hero: the banner when there is one. Without one, a soft glow made from
          the community photo itself, so every page gets colour, not a grey box. */}
      {hasBanner ? (
        <div
          data-community-banner
          className="h-36 sm:h-44 rounded-2xl bg-white/[0.04] overflow-hidden relative group"
          onClick={canEdit ? () => bannerInputRef.current?.click() : undefined}
          style={canEdit ? { cursor: 'pointer' } : undefined}
        >
          <img src={storageImage(community.banner_url, deviceWidth(isMdUp() ? 900 : 430))} alt="" className="w-full h-full object-cover" fetchPriority="high" />
          {canEdit && (
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Camera className="w-6 h-6 text-white" />
            </div>
          )}
          {uploading === 'banner' && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
      ) : (
        <div data-community-aura className="h-24 sm:h-28 relative">
          <div aria-hidden className="pointer-events-none absolute -inset-x-3 -top-3 h-72 overflow-hidden [mask-image:radial-gradient(ellipse_60%_55%_at_50%_35%,black_40%,transparent_100%)]">
            {avatarSrc ? (
              <img src={avatarSrc} alt="" className="absolute left-1/2 top-6 w-72 h-72 -translate-x-1/2 object-cover rounded-full blur-3xl opacity-60 scale-150 saturate-150" />
            ) : (
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,rgba(255,255,255,0.10),transparent_65%)]" />
            )}
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() => bannerInputRef.current?.click()}
              className="absolute right-0 top-0 inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs text-zinc-300 bg-black/40 border border-white/15 hover:text-white hover:bg-black/60 transition-colors"
            >
              {uploading === 'banner'
                ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Camera className="w-3.5 h-3.5" />}
              {t('communities.addBanner', { defaultValue: 'Add banner' })}
            </button>
          )}
        </div>
      )}
      {canEdit && (
        <input
          ref={bannerInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) handleMediaChange(f, 'banner');
            e.target.value = '';
          }}
        />
      )}

      {/* Centered identity: photo, name, chips, description, members, actions */}
      <div className={`relative z-10 flex flex-col items-center text-center ${hasBanner ? '-mt-[52px]' : '-mt-16'}`}>
        <div
          className="w-[104px] h-[104px] rounded-[28px] bg-black border-4 border-black shadow-[0_10px_30px_rgba(0,0,0,0.6)] flex items-center justify-center overflow-hidden flex-shrink-0 relative group"
          onClick={canEdit ? () => avatarInputRef.current?.click() : undefined}
          style={canEdit ? { cursor: 'pointer' } : undefined}
        >
          {avatarSrc ? (
            <img src={avatarSrc} alt={community.name} className="w-full h-full object-cover rounded-[24px]" />
          ) : (
            <Users className="w-9 h-9 text-zinc-500" />
          )}
          {canEdit && (
            <>
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Camera className="w-5 h-5 text-white" />
              </div>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) handleMediaChange(f, 'avatar');
                  e.target.value = '';
                }}
              />
            </>
          )}
          {uploading === 'avatar' && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Name */}
        <div className="mt-3 max-w-full px-2">
          {canEdit && editingName ? (
            <div className="flex items-center gap-1.5">
              <input
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                className="flex-1 bg-white/[0.06] border border-white/[0.1] rounded-lg px-2 py-1 text-xl font-bold text-white text-center outline-none focus:border-white/20"
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter' && nameInput.trim()) {
                    updateMutation.mutate({ id: community.id, name: nameInput.trim() } as any, { onSuccess: () => { setNameInput.complete(nameInput, nameInput); setEditingName(false); } });
                  }
                  if (e.key === 'Escape') { setNameInput(community.name); setEditingName(false); }
                }}
              />
              <button onClick={() => {
                if (nameInput.trim()) updateMutation.mutate({ id: community.id, name: nameInput.trim() } as any, { onSuccess: () => { setNameInput.complete(nameInput, nameInput); setEditingName(false); } });
              }} className="text-white hover:text-green-400"><Check className="w-4 h-4" /></button>
              <button onClick={() => { setNameInput(community.name); setEditingName(false); }} className="text-zinc-500 hover:text-white"><X className="w-3.5 h-3.5" /></button>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-1.5 group/name">
              <h1 className="text-2xl font-bold tracking-tight text-white truncate">{community.name}</h1>
              {canEdit && (
                <button onClick={() => setEditingName(true)} className="opacity-0 group-hover/name:opacity-100 text-zinc-500 hover:text-white transition-all">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

          <div className="flex flex-wrap items-center justify-center gap-x-1.5 [&>p]:mr-0">
            {holderGate && <HolderGateChip gate={holderGate} />}
            <CommunityKindChip community={community} />
            {community.ticker_symbol && !canEdit && (
              <p className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-white/[0.1] bg-white/[0.05] px-2.5 py-1 text-xs text-zinc-300">
                <TrendingUp className="w-3 h-3" />${community.ticker_symbol}
              </p>
            )}
          </div>

        {/* Description */}
        {canEdit && editingDesc ? (
          <div className="mt-3 w-full max-w-lg flex items-start gap-1.5 text-left">
            <textarea
              value={descInput}
              onChange={e => setDescInput(e.target.value)}
              rows={2}
              className="flex-1 bg-white/[0.06] border border-white/[0.1] rounded-lg px-2.5 py-1.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-white/20 resize-none"
              placeholder={t('communities.communityDescription')}
              autoFocus
            />
            <button onClick={() => {
              updateMutation.mutate({ id: community.id, description: descInput.trim() || null } as any, { onSuccess: () => { setDescInput.complete(descInput, descInput); setEditingDesc(false); } });
            }} className="text-white hover:text-green-400 mt-1"><Check className="w-4 h-4" /></button>
            <button onClick={() => { setDescInput(community.description || ''); setEditingDesc(false); }} className="text-zinc-500 hover:text-white mt-1"><X className="w-3.5 h-3.5" /></button>
          </div>
        ) : (community.description || canEdit) ? (
          <div className="mt-3 max-w-lg px-2 group/desc flex items-start justify-center gap-1.5">
            {community.description ? (
              <DescriptionWithLinks text={community.description} />
            ) : (
              <p className="text-zinc-600 text-sm italic">{t('communities.addDescription')}</p>
            )}
            {canEdit && (
              <button onClick={() => setEditingDesc(true)} className="opacity-0 group-hover/desc:opacity-100 text-zinc-500 hover:text-white transition-all flex-shrink-0 mt-0.5">
                <Pencil className="w-3 h-3" />
              </button>
            )}
          </div>
        ) : null}

        <p className="mt-3 text-sm text-zinc-400">
          <span className="font-bold text-white tabular-nums">{community.member_count.toLocaleString()}</span> {t('communities.members')}
        </p>

        {/* Actions */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Button
            size="sm"
            disabled={isPending || isOwner}
            onClick={onJoinLeave}
            className={`rounded-xl gap-1.5 h-9 ${
              joinPrimary
                ? 'px-6 bg-white text-black font-bold border border-white hover:bg-white/90'
                : isMember
                ? 'px-3 bg-white/10 border border-white/20 text-white hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30'
                : isPendingMember
                ? 'px-3 bg-amber-500/20 border border-amber-500/30 text-amber-400 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30'
                : 'px-3 bg-white/10 border border-white/20 text-white hover:bg-white/15'
            }`}
          >
            {isOwner ? (
              <><Crown className="w-3.5 h-3.5" /> {t('communities.owner')}</>
            ) : isMember ? (
              <><LogOut className="w-3.5 h-3.5" /> {t('communities.leave')}</>
            ) : isPendingMember ? (
              <><X className="w-3.5 h-3.5" /> {t('communities.requested')}</>
            ) : (
              <><LogIn className="w-3.5 h-3.5" /> {t('communities.join')}{entryPrice > 0 && <span className="inline-flex items-center gap-1 tabular-nums">· <img src={dehubCoin} alt="" className="w-3.5 h-3.5" />{entryPrice.toLocaleString()}</span>}</>
            )}
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className={buttonBase}
              >
                <Share2 className="w-3.5 h-3.5" />
                {t('communities.share')}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-48 p-1.5">
              {isMember && canInvite && walletAddress && <button onClick={()=>setFollowersOpen(true)} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-white hover:bg-white/10"><Users className="w-4 h-4 text-zinc-400"/>{t('communities.followerInvites.title')}</button>}
              <button
                onClick={() => {
                  openPostModal(dehubLinkFor.community(community.slug), community.slug.toLowerCase());
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-white hover:bg-white/10 transition-colors"
              >
                <FileText className="w-4 h-4 text-zinc-400" />
                {t('communities.post')}
              </button>
              {canInvite && (
                <button
                  onClick={() => setInviteOpen(true)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-white hover:bg-white/10 transition-colors"
                >
                  <Send className="w-4 h-4 text-zinc-400" />
                  {t('communities.sendInMessage', { defaultValue: 'Send Invite' })}
                </button>
              )}
              <button
                onClick={() => {
                  navigator.clipboard.writeText(viewerShareUrl(dehubLinkFor.community(community.slug)));
                  trackShare('copy_link', { kind: 'community' });
                  toast.success(t('communities.linkCopied'));
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-white hover:bg-white/10 transition-colors"
              >
                <Link2 className="w-4 h-4 text-zinc-400" />
                {t('communities.copyLink')}
              </button>
              {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
                <button
                  onClick={() => {
                    const url = viewerShareUrl(dehubLinkFor.community(community.slug));
                    navigator.share({ title: community.name, url }).then(() => trackShare('native', { kind: 'community' })).catch(() => {});
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-white hover:bg-white/10 transition-colors"
                >
                  <Share2 className="w-4 h-4 text-zinc-400" />
                  {t('communities.shareLink')}
                </button>
              )}
            </PopoverContent>
          </Popover>
          {isMember && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handlePinToggle}
              disabled={pinMutation.isPending || unpinMutation.isPending}
              className={buttonBase}
            >
              {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
              {isPinned ? t('communities.unpin') : t('communities.pin')}
            </Button>
          )}
          {canAddToMessages && (
            <Button
              size="sm"
              variant="ghost"
              data-show-in-chats={inMessages ? 'on' : 'off'}
              aria-pressed={inMessages}
              onClick={() => updateChatPref(roomChatId(community.id), inMessages ? { listed: false, pinned: false } : { listed: true })}
              className={buttonBase}
              title={inMessages
                ? t('communities.inMessagesHint', { defaultValue: "This community's chat is in your Messages. Tap to take it out." })
                : t('communities.addToMessagesHint', { defaultValue: "Show this community's chat in your Messages, next to your DMs and groups" })}
            >
              {inMessages ? <Check className="w-3.5 h-3.5" /> : <MessageSquarePlus className="w-3.5 h-3.5" />}
              {inMessages
                ? t('communities.inMessages', { defaultValue: 'In Messages' })
                : t('communities.addToMessages', { defaultValue: 'Add to Messages' })}
            </Button>
          )}
          {canManage && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onManage}
              className={buttonBase}
              title={t('communities.manageButton', { defaultValue: 'Manage' })}
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('communities.manageButton', { defaultValue: 'Manage' })}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Ticker */}
      {canEdit && (
        <div className="relative z-10 mt-3 flex justify-center">
          {community.ticker_symbol ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-400 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                {t('communities.ticker')}: <span className="text-white font-medium">${community.ticker_symbol}</span>
              </span>
              <button
                onClick={() => updateMutation.mutate({
                  id: community.id,
                  ticker_symbol: null,
                  ticker_contract_address: null,
                  ticker_chain_id: null,
                  ticker_pair_address: null,
                } as any)}
                className="text-zinc-600 hover:text-red-400 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : showTickerInput ? (
            <CommunityTickerSearch
              onSelect={(pair: DexPair) => {
                updateMutation.mutate({
                  id: community.id,
                  ticker_symbol: pair.baseToken.symbol,
                  ticker_contract_address: pair.baseToken.address,
                  ticker_chain_id: pair.chainId,
                  ticker_pair_address: pair.pairAddress,
                } as any, {
                  onSuccess: () => {
                    setShowTickerInput(false);
                  }
                });
              }}
              onCancel={() => setShowTickerInput(false)}
            />
          ) : (
            <button
              onClick={() => setShowTickerInput(true)}
              className="text-xs text-zinc-500 hover:text-white flex items-center gap-1 transition-colors"
            >
              <TrendingUp className="w-3 h-3" />
              {t('communities.assignTicker')}
            </button>
          )}
        </div>
      )}

      <NewConversationModal
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        title={t('communities.inviteToCommunity', { defaultValue: 'Invite to community' })}
        initialMessage={dehubLinkFor.community(community.slug)}
        onConversationCreated={() => {
          setInviteOpen(false);
          toast.success(t('communities.inviteSent', { defaultValue: 'Invite sent' }));
        }}
      />
      {isMember && canInvite && walletAddress && <InviteFollowers open={followersOpen} onOpenChange={setFollowersOpen} communityId={community.id} slug={community.slug} wallet={walletAddress}/>}
    </div>
  );
}

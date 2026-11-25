import { useTranslation } from 'react-i18next';
import { EyeOff, Play } from 'lucide-react';
import { toast } from 'sonner';
import { MessageMenu, type MessageMenuAction } from '@/components/app/chat/MessageMenu';
import Blocked from '@/components/ui/cut-icons/blocked';
import Mute from '@/components/ui/cut-icons/mute';
import Mic from '@/components/ui/cut-icons/mic';
import { useAuth } from '@/contexts/AuthContext';
import { useBlockAuthor } from '@/hooks/use-block-author';
import { useMuteAuthor } from '@/hooks/use-mute-author';
import { setActivityBarHidden, setActivityItemsHidden } from '@/lib/activity-shelf-preferences';

export type ActivityTarget = {
  kind: 'story' | 'stage' | 'stream';
  ids: string[];
  open: () => void;
  creator?: { address: string; name?: string | null };
};

export type ActivityMenuRequest = {
  point: { x: number; y: number };
  target?: ActivityTarget;
};

export function ActivityShelfMenu({ request, onClose }: { request: ActivityMenuRequest | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { isAuthenticated, walletAddress, openLoginModal } = useAuth();
  const { blockAuthor } = useBlockAuthor();
  const { muteAuthor } = useMuteAuthor();
  const target = request?.target;
  const creator = target?.creator;
  const actions: MessageMenuAction[] = [{
    key: 'hide-bar',
    label: t('stories.activity.hideBar', 'Hide activity bar'),
    icon: <EyeOff />,
    onSelect: () => setActivityBarHidden(true),
  }];

  if (target) {
    const story = target.kind === 'story';
    const stage = target.kind === 'stage';
    actions.push({
      key: 'hide-item',
      label: story ? t('stories.activity.hideStory', 'Hide story') : t('stories.activity.hideLive', 'Hide live'),
      icon: <EyeOff />,
      onSelect: () => {
        setActivityItemsHidden(target.ids, true);
        toast.success(story ? t('stories.activity.storyHidden', 'Story hidden') : t('stories.activity.liveHidden', 'Live hidden'), {
          action: { label: t('common.undo', 'Undo'), onClick: () => setActivityItemsHidden(target.ids, false) },
        });
      },
    }, {
      key: 'open',
      label: stage ? t('stories.activity.join', 'Join') : t('stories.activity.watch', 'Watch'),
      icon: stage ? <Mic /> : <Play />,
      onSelect: target.open,
      divided: true,
    });
  }

  if (creator?.address && creator.address.toLowerCase() !== walletAddress?.toLowerCase()) {
    const moderate = (action: typeof muteAuthor) => {
      if (!isAuthenticated) { openLoginModal(); return; }
      void action(creator.address, creator.name ?? undefined);
    };
    actions.push({
      key: 'mute', label: t('postOptions.muteCreator', 'Mute creator'), icon: <Mute />,
      divided: true, onSelect: () => moderate(muteAuthor),
    }, {
      key: 'block', label: t('postOptions.blockCreator', 'Block creator'), icon: <Blocked />,
      destructive: true, onSelect: () => moderate(blockAuthor),
    });
  }

  return <MessageMenu point={request?.point ?? null} onClose={onClose} quickReactions={null} actions={actions}
    label={t('stories.activity.options', 'Activity options')} />;
}

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AtSign, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { bioTagsUser, removeBioTag } from '@/lib/api/dehub/bio-tags';

/**
 * "Remove me from their bio": shown in a profile's menu only to someone that
 * profile's bio @tags. Their name stays in the bio as plain text.
 */
export function BioTagRemoveRow({ ownerAddress, bio, onDone }: { ownerAddress?: string; bio?: string; onDone?: () => void }) {
  const { t } = useTranslation();
  const { isAuthenticated, user, walletAddress } = useAuth();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState(false);
  if (!isAuthenticated || gone || !ownerAddress) return null;
  if (walletAddress && walletAddress.toLowerCase() === ownerAddress.toLowerCase()) return null;
  if (!bioTagsUser(bio, user?.username)) return null;
  const run = async () => {
    setBusy(true);
    try {
      await removeBioTag(ownerAddress);
      setGone(true);
      toast.success(t('profileOptions.bioTagRemoved', "You're no longer tagged in this bio"));
      for (const group of ['dehub-profile', 'profile', 'account-info']) void client.invalidateQueries({ queryKey: [group] });
      onDone?.();
    } catch {
      toast.error(t('common.tryAgain'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 active:scale-[0.98] transition-[background-color,transform] text-left disabled:opacity-50"
    >
      <div className="w-8 h-8 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <AtSign className="w-4 h-4 text-white" />}
      </div>
      <span className="text-white font-medium">{t('profileOptions.removeBioTag', 'Remove me from their bio')}</span>
    </button>
  );
}

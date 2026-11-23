/**
 * On a post someone asked you to co-author: the ask, with yes and no, above
 * the post. The notification lands here, so this is where it is answered.
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import AddAccount from '@/components/ui/cut-icons/add-account';
import { Button } from '@/components/ui/button';
import { answerCoAuthorInvite } from '@/lib/api/dehub/co-authors';
import { useCoAuthors } from '@/lib/co-author-store';

export function CoAuthorInviteBanner({ tokenId, creatorName }: { tokenId?: string | number | null; creatorName?: string }) {
  const { t } = useTranslation();
  const { invited } = useCoAuthors(tokenId);
  const [busy, setBusy] = useState(false);
  if (!tokenId || !invited) return null;
  const answer = async (accept: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      await answerCoAuthorInvite(tokenId, accept);
      if (accept) toast.success(t('coAuthors.accepted', "You're now a co-author"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('coAuthors.failed', "Couldn't do that. Try again."));
    } finally {
      setBusy(false);
    }
  };
  return createPortal(
    // Floats over the post rather than pushing it down: the post page has
    // several layouts (immersive photo, video stage, text), and this sits the
    // same way over all of them, above the bottom bar.
    <div
      className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-50 mx-auto flex max-w-md flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-zinc-900/90 px-3 py-3 shadow-lg backdrop-blur-md lg:bottom-6"
      data-co-author-invite
      role="region"
      aria-label={t('coAuthors.answerInvite', 'Co-author invite')}
    >
      <AddAccount className="w-5 h-5 text-white shrink-0" />
      <p className="text-white text-sm flex-1 min-w-[12rem]">
        {creatorName
          ? t('coAuthors.bannerNamed', { name: creatorName, defaultValue: '{{name}} invited you to co-author this post.' })
          : t('coAuthors.banner', 'You were invited to co-author this post.')}
      </p>
      <div className="flex gap-2 shrink-0">
        <Button size="sm" disabled={busy} onClick={() => answer(true)}>{t('coAuthors.accept', 'Accept')}</Button>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => answer(false)}>{t('coAuthors.decline', 'Decline')}</Button>
      </div>
    </div>,
    document.body,
  );
}

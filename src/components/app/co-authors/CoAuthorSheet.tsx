/**
 * Co-authors of one post.
 *
 * The creator searches for someone and invites them, and sees who said yes
 * and who has not answered (either can be taken off). The invited person says
 * yes or no here; a co-author can step off. Opened from the post's menu
 * through the host mounted once in App.
 */
import { useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AuthContext } from '@/contexts/AuthContext';
import { searchUsers } from '@/lib/api/dehub/users';
import { answerCoAuthorInvite, getCoAuthors, inviteCoAuthor, removeCoAuthor } from '@/lib/api/dehub/co-authors';
import { coAuthorName, useCoAuthors, type CoAuthorUser } from '@/lib/co-author-store';
import { CoAuthorFace } from '@/components/app/cards/CoAuthorByline';

const MAX = 3;

function PersonRow({ user, note, action }: { user: CoAuthorUser; note?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 min-w-0">
      <CoAuthorFace user={user} className="w-9 h-9 shrink-0" />
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-white font-semibold truncate">{coAuthorName(user)}</span>
        <span className="text-zinc-500 text-sm truncate">
          {user.username ? `@${user.username}` : user.address}
          {note ? ` · ${note}` : ''}
        </span>
      </div>
      {action}
    </div>
  );
}

export default function CoAuthorSheet({ tokenId, onClose }: { tokenId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const me = useContext(AuthContext)?.walletAddress?.toLowerCase() ?? '';
  const state = useCoAuthors(tokenId);
  const [loaded, setLoaded] = useState(false);
  const [isCreator, setIsCreator] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CoAuthorUser[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getCoAuthors(tokenId)
      .then(data => { if (live) { setIsCreator(!!data.pendingCoAuthorUsers); setLoaded(true); } })
      .catch(() => { if (live) setLoaded(true); });
    return () => { live = false; };
  }, [tokenId]);

  useEffect(() => {
    const q = query.trim().replace(/^@/, '');
    if (!isCreator || q.length < 2) { setResults([]); return; }
    let live = true;
    const timer = window.setTimeout(() => {
      searchUsers({ q, limit: 8 })
        .then(res => {
          if (!live) return;
          setResults(
            (res.data || [])
              .map(u => ({
                address: String(u.address || u.wallet_address || '').toLowerCase(),
                username: u.username || undefined,
                displayName: (u as { displayName?: string }).displayName || undefined,
                avatarImageUrl: (u as { avatarImageUrl?: string }).avatarImageUrl || undefined,
              }))
              .filter(u => u.address && u.address !== me),
          );
        })
        .catch(() => { if (live) setResults([]); });
    }, 250);
    return () => { live = false; window.clearTimeout(timer); };
  }, [query, isCreator, me]);

  const onPost = useMemo(() => new Set([...state.users, ...(state.pending || [])].map(u => u.address)), [state]);
  const seatsLeft = MAX - onPost.size;
  const isCoAuthor = state.users.some(u => u.address === me);

  const run = async (key: string, work: () => Promise<unknown>, done?: string): Promise<boolean> => {
    if (busy) return false;
    setBusy(key);
    try {
      await work();
      if (done) toast.success(done);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('coAuthors.failed', "Couldn't do that. Try again."));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const invite = (user: CoAuthorUser) => run(`invite:${user.address}`, async () => {
    await inviteCoAuthor(tokenId, user.username || user.address);
    setQuery('');
  }, t('coAuthors.invited', { name: coAuthorName(user), defaultValue: 'Invite sent to {{name}}' }));

  const title = !isCreator && state.invited ? t('coAuthors.answerInvite', 'Co-author invite') : t('coAuthors.manage', 'Co-authors');
  const hint = isCreator
    ? t('coAuthors.creatorHint', 'Make this post together. Once they say yes, it shows on their profile too, with both names.')
    : state.invited
      ? t('coAuthors.inviteHint', "You've been asked to co-author this post. Say yes and it shows on your profile too, with both names.")
      : isCoAuthor
        ? t('coAuthors.coAuthorHint', "You're a co-author on this post. It shows on your profile with both names.")
        : '';

  return (
    <Drawer open onOpenChange={open => { if (!open) onClose(); }}>
      <DrawerContent scrollable column glass className="px-4 pb-6" data-co-author-sheet>
        <DrawerHeader className="pb-2 text-left">
          <DrawerTitle className="text-white text-lg">{title}</DrawerTitle>
          <DrawerDescription className={hint ? 'text-zinc-400 text-sm' : 'sr-only'}>{hint || title}</DrawerDescription>
        </DrawerHeader>

        {!loaded && <div className="h-24" aria-busy />}

        {loaded && !isCreator && state.invited && (
          <div className="flex gap-2 px-1 pt-2">
            <Button
              className="flex-1"
              disabled={!!busy}
              onClick={async () => { if (await run('accept', () => answerCoAuthorInvite(tokenId, true), t('coAuthors.accepted', "You're now a co-author"))) onClose(); }}
            >
              {t('coAuthors.accept', 'Accept')}
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              disabled={!!busy}
              onClick={async () => { if (await run('decline', () => answerCoAuthorInvite(tokenId, false))) onClose(); }}
            >
              {t('coAuthors.decline', 'Decline')}
            </Button>
          </div>
        )}

        {loaded && isCreator && (
          <div className="flex flex-col gap-2 pt-1">
            {seatsLeft > 0 ? (
              <Input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={t('coAuthors.searchPlaceholder', 'Search people to invite')}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                aria-label={t('coAuthors.searchPlaceholder', 'Search people to invite')}
                className="h-11 rounded-xl border-zinc-500/30 bg-zinc-500/10 text-white placeholder:text-zinc-500 focus-visible:ring-zinc-400/40"
              />
            ) : (
              <p className="text-zinc-500 text-sm px-1">{t('coAuthors.full', { count: MAX, defaultValue: 'A post can have up to {{count}} co-authors.' })}</p>
            )}
            {results.length > 0 && (
              <div className="flex flex-col">
                {results.map(user => (
                  <PersonRow
                    key={user.address}
                    user={user}
                    action={onPost.has(user.address)
                      ? <span className="text-zinc-500 text-sm shrink-0">{t('coAuthors.alreadyOn', 'On this post')}</span>
                      : (
                        <Button size="sm" disabled={!!busy} onClick={() => invite(user)}>
                          {t('coAuthors.inviteButton', 'Invite')}
                        </Button>
                      )}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {loaded && (state.users.length > 0 || (isCreator && (state.pending?.length ?? 0) > 0)) && (
          <div className="flex flex-col pt-3">
            <span className="text-zinc-500 text-xs font-medium uppercase tracking-wide px-3 pb-1">{t('coAuthors.alreadyOn', 'On this post')}</span>
            {state.users.map(user => (
              <PersonRow
                key={user.address}
                user={user}
                action={(isCreator || user.address === me) ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!!busy}
                    onClick={async () => {
                      const ok = await run(`remove:${user.address}`, () => removeCoAuthor(tokenId, user.address));
                      if (ok && user.address === me) onClose();
                    }}
                  >
                    {user.address === me ? t('coAuthors.leave', 'Remove me') : t('coAuthors.remove', 'Remove')}
                  </Button>
                ) : undefined}
              />
            ))}
            {isCreator && (state.pending || []).map(user => (
              <PersonRow
                key={user.address}
                user={user}
                note={t('coAuthors.waiting', 'Invited')}
                action={(
                  <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => run(`cancel:${user.address}`, () => removeCoAuthor(tokenId, user.address))}>
                    {t('coAuthors.cancelInvite', 'Cancel')}
                  </Button>
                )}
              />
            ))}
          </div>
        )}

        {loaded && !isCreator && !state.invited && !isCoAuthor && (
          <p className="text-zinc-500 text-sm px-1 pt-2">{t('coAuthors.nothing', 'Nothing to do here.')}</p>
        )}
      </DrawerContent>
    </Drawer>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import Close from '@/components/ui/cut-icons/close';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { buildAvatarUrl, buildAvatarCdnFallbackUrl } from '@/lib/media-url';
import { formatCount } from '@/lib/format-count';
import { addStoryComment, deleteStoryComment, getStoryComments, type StoryComment, type StoryItem } from '@/lib/api/dehub/stories';
import { localAge } from './story-utils';
import { MomentComment } from './moment-icons';

/** Public comments under a moment: everyone who can see it can read them. */
export function StoryComments({ item, signedIn, onOpen, onClose, onSignIn, onCount }: {
  item: StoryItem;
  signedIn: boolean;
  onOpen: (address: string) => void;
  onClose: () => void;
  onSignIn: () => void;
  onCount: (n: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState<StoryComment[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [count, setCount] = useState(item.commentCount ?? 0);
  const [allow, setAllow] = useState(item.allowReplies);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  // The comment a reply goes under, while the person is answering one.
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    getStoryComments(item.id, undefined, signedIn, true).then(r => {
      if (!alive) return;
      setRows(r.comments);
      setNext(r.next);
      setCount(r.commentCount);
      setAllow(r.allowComments);
    }).catch(() => alive && setRows([]));
    return () => { alive = false; };
  }, [item.id, signedIn]);

  const more = async () => {
    if (!next) return;
    const r = await getStoryComments(item.id, next, signedIn, true).catch(() => null);
    if (!r) return;
    setRows(list => [...(list ?? []), ...r.comments]);
    setNext(r.next);
  };

  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const row = await addStoryComment(item.id, body, replyTo?.id);
      if (row.parentId) {
        setRows(list => (list ?? []).map(r => (r.id === row.parentId ? { ...r, replies: [...(r.replies ?? []), row] } : r)));
      } else {
        setRows(list => [{ ...row, replies: row.replies ?? [] }, ...(list ?? [])]);
      }
      setText('');
      setReplyTo(null);
      setCount(c => { onCount(c + 1); return c + 1; });
    } catch (e) {
      toast.error((e as Error)?.message || t('stories.commentFailed', { defaultValue: "Your comment didn't go up. Try again." }));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (c: StoryComment) => {
    // A top comment takes its replies with it.
    const gone = 1 + (c.parentId ? 0 : c.replies?.length ?? 0);
    setRows(list => (list ?? [])
      .filter(r => r.id !== c.id)
      .map(r => (c.parentId && r.id === c.parentId ? { ...r, replies: (r.replies ?? []).filter(x => x.id !== c.id) } : r)));
    if (replyTo && (replyTo.id === c.id)) setReplyTo(null);
    setCount(n => { const v = Math.max(0, n - gone); onCount(v); return v; });
    await deleteStoryComment(item.id, c.id).catch(() => {});
  };

  const answer = (c: StoryComment, name: string) => {
    if (!signedIn) { onSignIn(); return; }
    setReplyTo({ id: c.parentId || c.id, name });
    setTimeout(() => input.current?.focus(), 0);
  };

  const line = (c: StoryComment, reply: boolean) => {
    const a = c.author;
    const face = a.avatarImageUrl ? buildAvatarUrl(a.address, a.avatarImageUrl) : buildAvatarCdnFallbackUrl(a.address, undefined);
    const name = a.displayName || a.username || a.address.slice(0, 8);
    return (
      <div key={c.id} className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 py-2 ${reply ? 'pl-11' : ''}`} data-sv-comment-reply={reply ? '' : undefined}>
        <button type="button" onClick={() => onOpen(a.address)} aria-label={name}>
          <Avatar className={reply ? 'size-6' : 'size-8'}>
            {face && <AvatarImage src={face} alt="" className="object-cover" />}
            <AvatarFallback className="bg-white/15 text-[12px] text-white">{name.slice(0, 1).toUpperCase()}</AvatarFallback>
          </Avatar>
        </button>
        <div className="min-w-0">
          <button type="button" className="text-[13px] font-semibold truncate max-w-full" onClick={() => onOpen(a.address)}>
            {name}
            {c.isCreator && <span className="ml-1.5 rounded-full bg-white/15 px-1.5 py-px text-[11px] font-semibold align-middle">{t('postInfo.creator', { defaultValue: 'Creator' })}</span>}
            {' '}<span className="font-normal opacity-50">{localAge(c.createdAt, i18n.language)}</span>
          </button>
          <p className="text-[14px] break-words whitespace-pre-wrap">{c.text}</p>
          {allow && (
            <button type="button" className="mt-0.5 min-h-[28px] text-[12px] font-semibold opacity-60 hover:opacity-100" onClick={() => answer(c, name)}>
              {t('messages.reply', { defaultValue: 'Reply' })}
            </button>
          )}
        </div>
        {c.canDelete && (
          <button type="button" className="grid size-9 place-items-center rounded-full opacity-60 hover:opacity-100" onClick={() => remove(c)} aria-label={t('common.delete', { defaultValue: 'Delete' })}>
            <Trash2 className="size-4" />
          </button>
        )}
      </div>
    );
  };

  return (
    <div data-sv-comments>
      <div className="flex items-center gap-2 text-[14px] font-semibold">
        <MomentComment className="w-4 h-4" />
        {t('stories.comments', { defaultValue: 'Comments' })}
        {count > 0 && <span className="opacity-60">{formatCount(count)}</span>}
        <button type="button" className="ml-auto grid size-11 place-items-center rounded-full hover:bg-white/10" onClick={onClose} aria-label={t('common.close', { defaultValue: 'Close' })}>
          <Close className="size-[18px]" />
        </button>
      </div>
      <div className="max-h-[45vh] overflow-y-auto overscroll-contain">
        {rows === null ? (
          <div className="py-6 grid place-items-center"><Loader2 className="w-5 h-5 animate-spin opacity-70" /></div>
        ) : rows.length === 0 ? (
          <p className="py-4 text-[14px] opacity-70">{t('stories.noCommentsYet', { defaultValue: 'No comments yet. Say something everyone can see.' })}</p>
        ) : (
          <div className="flex flex-col">
            {rows.map(c => (
              <div key={c.id}>
                {line(c, false)}
                {(c.replies ?? []).map(r => line(r, true))}
              </div>
            ))}
            {next && <button type="button" className="py-3 text-[14px] font-semibold" onClick={more}>{t('common.showMore', { defaultValue: 'Show more' })}</button>}
          </div>
        )}
      </div>
      {!signedIn ? (
        <button type="button" data-st-dark-glass className="mt-2 h-11 w-full rounded-full px-4 text-[14px] text-left text-white/80" onClick={onSignIn}>
          {t('stories.signInToComment', { defaultValue: 'Sign in to comment' })}
        </button>
      ) : allow ? (
        <>
        {replyTo && (
          <div className="mt-2 flex items-center gap-2 px-1 text-[12px] opacity-80">
            <span className="truncate">{t('governance.discussion.replyingTo', { name: replyTo.name, defaultValue: 'Replying to {{name}}' })}</span>
            <button type="button" className="ml-auto min-h-[28px] font-semibold" onClick={() => setReplyTo(null)}>
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </button>
          </div>
        )}
        <div className="mt-2 flex items-center gap-2">
          <input
            ref={input}
            data-st-dark-glass
            className="h-11 flex-1 min-w-0 rounded-full px-4 text-[14px] bg-transparent outline-none"
            value={text}
            maxLength={300}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void send(); if (e.key === 'Escape' && replyTo) { e.stopPropagation(); setReplyTo(null); } }}
            placeholder={t('stories.addComment', { defaultValue: 'Add a comment for everyone' })}
          />
          {text.trim() && (
            <button type="button" data-sv-round data-st-dark-glass onClick={() => void send()} disabled={busy} aria-label={t('common.send', { defaultValue: 'Send' })}>
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <span className="text-[13px] font-semibold">{t('stories.post', { defaultValue: 'Post' })}</span>}
            </button>
          )}
        </div>
        </>
      ) : (
        <p className="mt-2 text-[13px] opacity-60">{t('stories.commentsOff', { defaultValue: 'Comments are off for this moment' })}</p>
      )}
    </div>
  );
}

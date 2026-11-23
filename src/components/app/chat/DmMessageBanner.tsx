/**
 * New message banner (phones)
 * ===========================
 * A DM that arrives while you are somewhere else in the site slides in at the
 * top: tap it to open the chat, flick it up to put it away, or pull it down
 * (or press Reply) to answer right there. Same card as the app's in-app banner.
 *
 * Phones only. Desktop keeps its chat dock and browser notifications, and does
 * not change. Groups and paid chats just open the chat.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from 'framer-motion';
import { Check, Loader2, MessageCircle, Reply, Send } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { isConversationOpen, messagesKeys } from '@/hooks/use-messages';
import { emitSendMessage, onDmSendMessage } from '@/lib/api/dehub/dm-socket';
import { decryptFromPeer, prepareOutgoing } from '@/lib/dm-e2ee/keys';
import { buildAvatarUrl } from '@/lib/media-url';
import type { DeHubConversation } from '@/lib/api/dehub';
import { toast } from 'sonner';

const SHOW_MS = 5000;
const PULL_OPEN = 36;

interface Banner {
  id: string;
  conversationId: string;
  name: string;
  address: string;
  avatar?: string | null;
  body: string;
  group: boolean;
  canReply: boolean;
}

const lower = (v: unknown) => (typeof v === 'string' ? v.toLowerCase() : '');

interface IncomingDm {
  _id?: string;
  author?: string;
  content?: string;
  msgType?: string;
  dmId?: string;
  conversationId?: string;
  conversation?: string | { _id?: string; conversationType?: string };
  sender?: { address?: string; username?: string; displayName?: string; avatarImageUrl?: string | null; avatar?: string | null };
}

function conversationIdOf(msg: IncomingDm): string {
  const raw = msg?.conversation;
  return typeof raw === 'string' ? raw : raw?._id || msg?.dmId || msg?.conversationId || '';
}

export default function DmMessageBanner() {
  const { t } = useTranslation();
  const { walletAddress } = useAuth();
  const isPhone = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();

  const [banner, setBanner] = useState<Banner | null>(null);
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState('');
  const [sendState, setSendState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replyingRef = useRef(false);
  replyingRef.current = replying;
  const bannerRef = useRef<Banner | null>(null);
  bannerRef.current = banner;
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const hide = useCallback(() => {
    clearTimer();
    setBanner(null);
    setReplying(false);
    setText('');
    setSendState('idle');
  }, []);
  const arm = useCallback((ms = SHOW_MS) => {
    clearTimer();
    timer.current = setTimeout(() => {
      if (!replyingRef.current) hide();
    }, ms);
  }, [hide]);

  const onMessagesPage = location.pathname.startsWith('/app/messages');
  const onMessagesRef = useRef(onMessagesPage);
  onMessagesRef.current = onMessagesPage;

  useEffect(() => {
    if (!isPhone || !walletAddress) return;
    const me = lower(walletAddress);
    return onDmSendMessage((incoming) => {
      const msg = incoming as unknown as IncomingDm;
      const sender: NonNullable<IncomingDm['sender']> = msg?.sender || {};
      const from = lower(sender.address);
      if (!from || from === me || msg?.author === 'me') return;
      const conversationId = conversationIdOf(msg);
      if (!conversationId || onMessagesRef.current || isConversationOpen(conversationId)) return;
      const current = bannerRef.current;
      if (current && replyingRef.current && current.conversationId !== conversationId) return;

      const cached = (queryClient.getQueryData(messagesKeys.conversations()) as DeHubConversation[] | undefined)
        ?.find((c) => c.id === conversationId || (c as { _id?: string })._id === conversationId);
      const isGroup = !!cached?.isGroup || (typeof msg.conversation === 'object' && msg.conversation?.conversationType === 'group');
      const paid = !!cached?.dmFee?.required && !cached?.dmFee?.hasFreeAccess;
      const name = isGroup
        ? cached?.groupInfo?.name || sender.displayName || sender.username || ''
        : sender.displayName || sender.username || `${from.slice(0, 6)}…`;
      const raw = typeof msg?.content === 'string' ? msg.content : '';
      const kind = msg?.msgType && msg.msgType !== 'msg' ? t('quickReply.sentAttachment', { defaultValue: 'Sent an attachment' }) : '';

      void (async () => {
        let body = kind || raw;
        if (!kind && raw) {
          const opened = await decryptFromPeer(from, raw).catch(() => null);
          body = opened ?? t('quickReply.encrypted', { defaultValue: 'Encrypted message' });
        }
        const next: Banner = {
          id: String(msg?._id || `${conversationId}:${Date.now()}`),
          conversationId,
          name: isGroup && sender.username ? `${name} · ${sender.displayName || sender.username}` : name,
          address: from,
          avatar: sender.avatarImageUrl ?? sender.avatar ?? null,
          body,
          group: isGroup,
          canReply: !isGroup && !paid,
        };
        if (replyingRef.current && bannerRef.current?.conversationId === conversationId) {
          setBanner(next);
          return;
        }
        setBanner(next);
        setReplying(false);
        setText('');
        setSendState('idle');
        arm();
      })();
    });
  }, [isPhone, walletAddress, queryClient, t, arm]);

  // Leaving phone width or going into Messages puts the card away.
  useEffect(() => {
    if ((!isPhone || onMessagesPage) && bannerRef.current) hide();
  }, [isPhone, onMessagesPage, hide]);

  useEffect(() => () => clearTimer(), []);

  useEffect(() => {
    if (replying) requestAnimationFrame(() => inputRef.current?.focus());
  }, [replying]);

  const openChat = useCallback(() => {
    const current = bannerRef.current;
    if (!current) return;
    hide();
    navigate(`/app/messages?conversation=${encodeURIComponent(current.conversationId)}`);
  }, [hide, navigate]);

  const startReply = useCallback(() => {
    if (!bannerRef.current?.canReply) return;
    clearTimer();
    setReplying(true);
  }, []);

  const send = useCallback(async () => {
    const current = bannerRef.current;
    const words = text.trim();
    if (!current || !words || sendState === 'sending') return;
    setSendState('sending');
    try {
      const wire = await prepareOutgoing(current.address, words);
      await emitSendMessage({ dmId: current.conversationId, content: wire.content, type: 'msg' });
      void queryClient.invalidateQueries({ queryKey: messagesKeys.conversations() });
      setSendState('sent');
      setText('');
      setReplying(false);
      (document.activeElement as HTMLElement | null)?.blur?.();
      arm(1200);
    } catch (error) {
      setSendState('idle');
      toast.error((error as Error)?.message || t('quickReply.failedTitle', { defaultValue: "Your reply wasn't sent" }), {
        action: { label: t('quickReply.open', { defaultValue: 'Open chat' }), onClick: openChat },
      });
    }
  }, [text, sendState, queryClient, arm, openChat, t]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y < -30 || info.velocity.y < -400) {
      hide();
      return;
    }
    if (info.offset.y > PULL_OPEN && !replyingRef.current) startReply();
    else if (!replyingRef.current) arm();
  };

  if (!isPhone || typeof document === 'undefined') return null;

  const avatar = banner && !banner.group ? buildAvatarUrl(banner.address, banner.avatar) : null;

  return createPortal(
    <AnimatePresence>
      {banner ? (
        <motion.div
          key="dm-banner"
          role="status"
          aria-live="polite"
          data-dm-banner
          className="fixed inset-x-2 z-[90] md:hidden"
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 8px)' }}
          initial={reduceMotion ? { opacity: 0 } : { y: -140, opacity: 0 }}
          animate={reduceMotion ? { opacity: 1 } : { y: 0, opacity: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { y: -140, opacity: 0, transition: { duration: 0.2, ease: [0.45, 0, 0.1, 1] } }}
          transition={{ duration: 0.28, ease: [0.25, 0.8, 0.25, 1] }}
          drag="y"
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0.9, bottom: 0.3 }}
          onDragStart={clearTimer}
          onDragEnd={onDragEnd}
        >
          <div
            data-glass-menu
            className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/95 text-white shadow-xl backdrop-blur-xl"
          >
            <div className="flex items-center gap-3 px-3 pt-3">
              <button
                type="button"
                onClick={openChat}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
                aria-label={t('quickReply.open', { defaultValue: 'Open chat' })}
              >
                {avatar ? (
                  <img src={avatar} alt="" className="h-10 w-10 flex-none rounded-lg object-cover" />
                ) : (
                  <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-white/[0.06]">
                    <MessageCircle className="h-[18px] w-[18px]" />
                  </span>
                )}
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-bold leading-[18px]">{banner.name}</span>
                  {sendState === 'sent' ? (
                    <span className="flex items-center gap-1.5 text-[13px] leading-[18px] text-white/70">
                      <Check className="h-3.5 w-3.5 flex-none text-white" />
                      {t('quickReply.sent', { defaultValue: 'Reply sent' })}
                    </span>
                  ) : banner.body ? (
                    <span className={`text-[13px] leading-[18px] text-white/70 ${replying ? 'line-clamp-3' : 'line-clamp-2'}`}>
                      {banner.body}
                    </span>
                  ) : null}
                </span>
              </button>
              {banner.canReply && !replying && sendState !== 'sent' ? (
                <button
                  type="button"
                  onClick={startReply}
                  className="flex h-8 flex-none items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.06] px-2.5 text-[13px] font-semibold active:opacity-85"
                >
                  <Reply className="h-3.5 w-3.5" />
                  {t('quickReply.reply', { defaultValue: 'Reply' })}
                </button>
              ) : null}
            </div>

            {replying ? (
              <form
                className="flex items-end gap-2 p-3"
                onSubmit={(e) => { e.preventDefault(); void send(); }}
              >
                <textarea
                  ref={inputRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  rows={1}
                  maxLength={5000}
                  disabled={sendState === 'sending'}
                  placeholder={t('quickReply.placeholder', { defaultValue: 'Write a reply…' })}
                  className="max-h-28 min-h-10 flex-1 resize-none rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-base leading-5 text-white outline-none placeholder:text-white/50"
                />
                <button
                  type="submit"
                  disabled={!text.trim() || sendState === 'sending'}
                  aria-label={t('quickReply.send', { defaultValue: 'Send' })}
                  className="flex h-10 w-10 flex-none items-center justify-center rounded-[10px] border border-white/10 bg-white/[0.06] disabled:opacity-45"
                >
                  {sendState === 'sending' ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <Send className="h-[18px] w-[18px]" />}
                </button>
              </form>
            ) : banner.canReply && sendState !== 'sent' ? (
              <div className="flex justify-center pb-1.5 pt-2" aria-hidden>
                <span data-dm-grabber className="h-1 w-9 rounded-full bg-white/30" />
              </div>
            ) : (
              <div className="h-2.5" />
            )}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

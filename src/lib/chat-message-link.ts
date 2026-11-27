/**
 * "Copy link" on a chat message, like Slack's.
 *
 * Every link is an ordinary riftn.com page with `msg=<id>` added, so it opens
 * the chat it came from on the web and in the app (which claims riftn.com/app
 * and /communities links), and unfurls with that page's card:
 *
 *   Public chat   /app/messages?chat=public&room=<roomId>&msg=<id>
 *   Stream chat   /app/post/<tokenId>?msg=<id>
 *   Community     /communities/<slug>?tab=chat&msg=<id>
 *   DM or group   /app/messages?conversation=<id>&msg=<id>
 *
 * Opening one: `ChatLinkCatcher` notes the target as soon as the URL lands,
 * because the pages rewrite their query as they open a chat (Messages swaps in
 * `?chat=1`), and the chat itself takes it with `useLinkedMessage` once its
 * history is in, loads the window around the line when it is older than what
 * is held, scrolls to it and highlights it.
 *
 * A DM link opens only for people in that chat: everyone else never has the
 * conversation, so it cannot open, and they are told so.
 */
import { useEffect, useReducer, useRef } from 'react';
import { toast } from 'sonner';
import { LIVE_ORIGIN } from '@/lib/dehub-links';
import { translateCopy } from '@/i18n/copy';
import { MESSAGE_LINK_PARAM, ID_RE, chatLinkListeners as listeners, clearPendingChatLink, peekPendingChatLink, type ChatLinkTarget } from '@/lib/chat-message-link-core';

export * from '@/lib/chat-message-link-core';


/** A message id that can go in a link: a line still sending has none yet. */
export function canLinkMessage(id: string | null | undefined): id is string {
  return !!id && ID_RE.test(id) && !id.startsWith('temp-') && !id.startsWith('local-') && !id.startsWith('pending-');
}

export function chatMessageLink(target: ChatLinkTarget, messageId: string): string {
  const msg = `${MESSAGE_LINK_PARAM}=${encodeURIComponent(messageId)}`;
  switch (target.kind) {
    case 'public':
      return `${LIVE_ORIGIN}/app/messages?chat=public${target.roomId ? `&room=${encodeURIComponent(target.roomId)}` : ''}&${msg}`;
    case 'stream':
      return `${LIVE_ORIGIN}/app/post/${encodeURIComponent(String(target.tokenId))}?${msg}`;
    case 'community':
      return `${LIVE_ORIGIN}/communities/${encodeURIComponent(target.slug)}?tab=chat&${msg}`;
    case 'dm':
      return `${LIVE_ORIGIN}/app/messages?conversation=${encodeURIComponent(target.conversationId)}&${msg}`;
  }
}

/** Puts the link on the clipboard and says so. */
export function copyChatMessageLink(target: ChatLinkTarget, messageId: string) {
  const url = chatMessageLink(target, messageId);
  const done = () => toast.success(translateCopy('copy.d12860c21e78', { defaultValue: 'Link copied' }));
  const failed = () => toast.error(translateCopy('chatHold.copyFailed', { defaultValue: "Couldn't copy" }));
  if (navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(url).then(done, failed);
    return;
  }
  failed();
}

export const copyLinkLabel = () => translateCopy('copy.dbf362d4f210', { defaultValue: 'Copy link' });

/** "That message was deleted, or it's too far back to open." */
export function toastLinkedMessageGone() {
  toast.message(translateCopy('chatLink.gone', { defaultValue: "That message was deleted, or it's too far back to open." }));
}

/** "That link is to a private chat you're not in." */
export function toastNotInLinkedChat() {
  toast.message(translateCopy('chatLink.notInChat', { defaultValue: "That link is to a private chat you're not in." }));
}

const HIGHLIGHT_CLASS = 'chat-link-highlight';
const HIGHLIGHT_MS = 4200;

/** The list a chat row scrolls in: scrolling only that keeps the page itself still. */
function scrollerOf(el: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight + 1) return node;
  }
  return null;
}

function centre(el: HTMLElement) {
  const box = scrollerOf(el);
  if (!box) {
    el.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
    return;
  }
  const row = el.getBoundingClientRect();
  const view = box.getBoundingClientRect();
  box.scrollTop += (row.top + row.height / 2) - (view.top + view.height / 2);
}

/** Centres a line and lights it up for a few seconds, the way Slack shows a linked message. */
export function highlightChatRow(el: HTMLElement) {
  centre(el);
  el.classList.remove(HIGHLIGHT_CLASS);
  void el.offsetWidth;
  el.classList.add(HIGHLIGHT_CLASS);
  window.setTimeout(() => el.classList.remove(HIGHLIGHT_CLASS), HIGHLIGHT_MS);
  // Pictures and link cards around it can still be growing, and a chat may
  // still be settling its own opening scroll: put it back in the middle a few
  // times, unless the reader has started scrolling.
  let moved = false;
  const stop = () => { moved = true; };
  const opts = { capture: true, passive: true } as const;
  window.addEventListener('wheel', stop, opts);
  window.addEventListener('touchstart', stop, opts);
  window.addEventListener('keydown', stop, true);
  for (const ms of [120, 400, 900, 1600]) {
    window.setTimeout(() => { if (!moved && el.isConnected) centre(el); }, ms);
  }
  window.setTimeout(() => {
    window.removeEventListener('wheel', stop, opts);
    window.removeEventListener('touchstart', stop, opts);
    window.removeEventListener('keydown', stop, true);
  }, 1700);
}

/**
 * Opens the line a copied link names, once this chat is ready.
 *
 * `open` makes sure the line is on the page (loading the history around it
 * when needed) and says whether it exists; `find` returns its row.
 */
export function useLinkedMessage(
  key: string | null,
  ready: boolean,
  /** true: the line is there; false: it is gone (says so); null: the chat has said why itself. */
  open: (messageId: string) => Promise<boolean | null> | boolean | null,
  find: (messageId: string) => HTMLElement | null,
) {
  const openRef = useRef(open);
  const findRef = useRef(find);
  openRef.current = open;
  findRef.current = find;
  const busy = useRef(false);
  const [, force] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    const fn = () => force();
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, [force]);

  const waiting = key ? peekPendingChatLink(key) : null;
  const waitingNonce = waiting?.nonce;
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  useEffect(() => {
    if (!key || !ready || busy.current) return;
    const link = peekPendingChatLink(key);
    if (!link) return;
    clearPendingChatLink(link.nonce);
    busy.current = true;
    const finish = (found: boolean) => {
      busy.current = false;
      if (!found && alive.current) toastLinkedMessageGone();
    };
    void Promise.resolve(openRef.current(link.messageId)).then((found) => {
      if (!alive.current) return;
      if (found === null) { busy.current = false; return; }
      if (!found) { finish(false); return; }
      const started = Date.now();
      const timer = window.setInterval(() => {
        const el = alive.current ? findRef.current(link.messageId) : null;
        if (el) {
          window.clearInterval(timer);
          finish(true);
          highlightChatRow(el);
        } else if (!alive.current || Date.now() - started > 6000) {
          window.clearInterval(timer);
          finish(!alive.current);
        }
      }, 100);
    }, () => finish(false));
  }, [key, ready, waitingNonce]);
}

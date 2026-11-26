/**
 * "Send in their language" (one-to-one chats, off unless turned on in the
 * chat's menu). Your line is translated here, before it is sent, into the
 * language the other person reads Riftn in. They get it in their language
 * everywhere (chat, pushes, the Messages list); you keep seeing what you
 * typed, and either of you can flip to the other version on the bubble.
 *
 * The setting is your own, saved with your other chat settings so it follows
 * you between devices. Encrypted chats are left alone: the typed version
 * would have to sit next to the ciphertext in the clear.
 */
import { supabase } from '@/integrations/supabase/client';
import { apiCall } from '@/lib/api/dehub/core';
import type { ChatPref } from '@/lib/api/dehub/chat-prefs';
import { isChatEncrypted } from '@/lib/dm-e2ee/encrypt-choice';

let chats = new Set<string>();

/** Fed from the chat settings query whenever it changes. */
export function setTranslateOutChats(prefs: ChatPref[] | undefined | null): void {
  chats = new Set((prefs ?? []).filter((p) => !!p.translateOutAt).map((p) => p.conversationId));
}

export function isTranslateOutOn(conversationId: string | null | undefined): boolean {
  return !!conversationId && chats.has(conversationId);
}

const languages = new Map<string, Promise<string | null>>();

/** The language the other person reads Riftn in, or null when they never picked one. */
export function peerLanguage(conversationId: string): Promise<string | null> {
  let hit = languages.get(conversationId);
  if (!hit) {
    hit = apiCall<{ result?: { language?: string | null } }>(
      `/api/dm/peer-language/${encodeURIComponent(conversationId)}`,
      { requiresAuth: true },
    )
      .then((res) => {
        const lang = res?.result?.language;
        return typeof lang === 'string' && /^[a-z]{2,3}$/.test(lang) ? lang : null;
      })
      .catch(() => {
        // A failed lookup is not an answer: ask again next time.
        languages.delete(conversationId);
        return null;
      });
    languages.set(conversationId, hit);
  }
  return hit;
}

/** "English", "Türkçe"... in the reader's own language. Falls back to the code. */
export function languageName(code: string, inLang?: string): string {
  try {
    const names = new Intl.DisplayNames([inLang || 'en'], { type: 'language' });
    const name = names.of(code);
    if (name && name !== code) return name.charAt(0).toLocaleUpperCase(inLang) + name.slice(1);
  } catch { /* old browser */ }
  return code.toUpperCase();
}

const HAS_LETTERS = /\p{L}/u;
const TIMEOUT_MS = 6000;

export interface TranslatedLine {
  /** What goes out: the line in their language. */
  content: string;
  /** What you typed. */
  original: string;
  /** Their language. */
  lang: string;
}

/**
 * Your line in their language, or null to send it as typed: the setting is
 * off, the chat is encrypted, they have no language, it already reads in
 * their language, or the translator did not answer in time. Sending never
 * waits more than a few seconds on this and never fails because of it.
 */
export async function translateOutgoing(conversationId: string, text: string): Promise<TranslatedLine | null> {
  const typed = text.trim();
  if (!isTranslateOutOn(conversationId) || isChatEncrypted(conversationId)) return null;
  if (!typed || !HAS_LETTERS.test(typed)) return null;
  try {
    const lang = await peerLanguage(conversationId);
    if (!lang) return null;
    const call = supabase.functions.invoke('translate-text', { body: { text: typed, targetLang: lang, purpose: 'chat' } });
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS));
    const res = await Promise.race([call, timeout]);
    if (!res || res.error) return null;
    const data = (res.data ?? {}) as { translatedText?: string; sameLanguage?: boolean };
    const out = typeof data.translatedText === 'string' ? data.translatedText.trim() : '';
    if (!out || data.sameLanguage === true || out === typed) return null;
    // Same letters, different spacing or case: nothing was translated.
    if (out.replace(/\s+/g, ' ').toLowerCase() === typed.replace(/\s+/g, ' ').toLowerCase()) return null;
    return { content: out, original: typed, lang };
  } catch {
    return null;
  }
}

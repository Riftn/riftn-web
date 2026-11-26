import { useCallback, useEffect, useRef, useState } from 'react';
import { emitDmTyping, onDmTyping } from '@/lib/api/dehub/dm-socket';

const HEARTBEAT_MS = 2000;
const IDLE_MS = 5000;
const EXPIRES_MS = 7000;

export function useDmTyping(dmId: string | null, userId?: string) {
  const [typingChat, setTypingChat] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastSent = useRef<number | null>(null);

  const stopTyping = useCallback(() => {
    clearTimeout(timer.current);
    if (lastSent.current === null) return;
    lastSent.current = null;
    if (dmId) emitDmTyping(dmId, false);
  }, [dmId]);

  const onTypingActivity = useCallback((hasText: boolean) => {
    if (!dmId) return;
    if (!hasText) {
      stopTyping();
      return;
    }
    const now = Date.now();
    if (lastSent.current === null || now - lastSent.current >= HEARTBEAT_MS) {
      lastSent.current = now;
      emitDmTyping(dmId, true);
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(stopTyping, IDLE_MS);
  }, [dmId, stopTyping]);

  useEffect(() => {
    if (!dmId) return;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    const clear = () => {
      clearTimeout(expiry);
      setTypingChat(null);
    };
    const off = onDmTyping((data, typing) => {
      if (data?.dmId !== dmId || !data.userId || data.userId === userId) return;
      clearTimeout(expiry);
      setTypingChat(typing ? dmId : null);
      if (typing) expiry = setTimeout(clear, EXPIRES_MS);
    });
    window.addEventListener('blur', stopTyping);
    return () => {
      off();
      window.removeEventListener('blur', stopTyping);
      clear();
      stopTyping();
    };
  }, [dmId, stopTyping, userId]);

  return { onTypingActivity, remoteTyping: !!dmId && typingChat === dmId };
}

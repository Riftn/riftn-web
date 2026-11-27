/**
 * The assistant's personality and chat model, as one setting everywhere.
 *
 * Picked on the Assistant page or in the @assistant DM, saved to the account
 * so the DM (answered by the server) replies the same way the page does. A
 * local copy makes the pick show at once and covers signed-out use.
 */
import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { getAssistantPrefs, saveAssistantPrefs, type AssistantPrefs } from '@/lib/api/dehub/assistant-actions';
import { currentChatModel, DEFAULT_CHAT_MODEL } from '@/constants/chat-models.constants';
import { AI_ASSISTANT_STYLE_OPTIONS } from '@/constants/ai-styles.constants';

const LOCAL_KEY = 'riftn.assistant.prefs';
const QUERY_KEY = ['assistant-prefs'];

const DEFAULTS: AssistantPrefs = { style: 'normal', model: DEFAULT_CHAT_MODEL };

function clean(p: Partial<AssistantPrefs> | null | undefined): AssistantPrefs {
  const style = AI_ASSISTANT_STYLE_OPTIONS.some((s) => s.id === p?.style) ? p!.style! : DEFAULTS.style;
  return { style, model: currentChatModel(p?.model) };
}

function readLocal(): AssistantPrefs {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? clean(JSON.parse(raw)) : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

function writeLocal(p: AssistantPrefs) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(p)); } catch { /* private mode */ }
}

export function useAssistantPrefs() {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [prefs, setPrefs] = useState<AssistantPrefs>(readLocal);

  const { data } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: getAssistantPrefs,
    enabled: isAuthenticated,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (!data) return;
    const next = clean(data);
    setPrefs(next);
    writeLocal(next);
  }, [data]);

  const update = useCallback((patch: Partial<AssistantPrefs>) => {
    setPrefs((prev) => {
      const next = clean({ ...prev, ...patch });
      writeLocal(next);
      queryClient.setQueryData(QUERY_KEY, next);
      return next;
    });
    if (isAuthenticated) void saveAssistantPrefs(patch).catch(() => undefined);
  }, [isAuthenticated, queryClient]);

  return {
    style: prefs.style,
    model: prefs.model,
    setStyle: useCallback((style: string) => update({ style }), [update]),
    setModel: useCallback((model: string) => update({ model }), [update]),
  };
}

import { apiCall } from './core';

export type AssistantActionKind = 'react' | 'follow' | 'unfollow' | 'chat_access' | 'request_post' | 'schedule_posts' | 'post_spacing';
export type AssistantActionStatus = 'pending' | 'running' | 'done' | 'cancelled' | 'failed' | 'expired';

export interface AssistantActionPerson {
  address: string;
  username: string | null;
  displayName: string | null;
  avatar: string | null;
}

export interface AssistantAction {
  id: string;
  kind: AssistantActionKind;
  status: AssistantActionStatus;
  preview: {
    choice?: string;
    count?: number;
    alreadyReacted?: number;
    totalPosts?: number;
    author?: AssistantActionPerson | null;
    sample?: { tokenId: number; title: string }[];
    people?: AssistantActionPerson[];
    allow?: boolean;
    draft?: {
      title: string;
      description: string;
      category: 'ui_ux' | 'performance' | 'new_feature' | 'bug_fix' | 'integration' | 'other';
    };
    duplicates?: { id: string; title: string }[];
    /** schedule_posts: each planned post (photo is a stored key; at null = straight away). */
    items?: { text: string; photo: string | null; at: string | null }[];
    /** schedule_posts: minutes between posts; post_spacing: the new gap (0 = off). */
    gapMinutes?: number | null;
    /** post_spacing: the gap before this card. */
    before?: number;
  };
  result: {
    done?: number;
    total?: number;
    added?: number;
    skipped?: number;
    failed?: number;
    ok?: number;
    allowed?: boolean;
    tokenIds?: number[];
    gapMinutes?: number;
    requestId?: string;
    used?: Record<string, number>;
    error?: string;
  } | null;
  confirmBy: string;
}

const path = (id: string) => `/api/assistant-actions/${encodeURIComponent(id)}`;

export function getAssistantAction(id: string): Promise<AssistantAction> {
  return apiCall<AssistantAction>(path(id), { requiresAuth: true });
}

export function confirmAssistantAction(id: string, options: { reaction?: string; requestPost?: true } = {}): Promise<AssistantAction> {
  return apiCall<AssistantAction>(`${path(id)}/confirm`, {
    method: 'POST',
    body: options,
    requiresAuth: true,
    timeoutMs: 30_000,
  });
}

export function cancelAssistantAction(id: string): Promise<AssistantAction> {
  return apiCall<AssistantAction>(`${path(id)}/cancel`, { method: 'POST', body: {}, requiresAuth: true });
}

/** Personality + chat model, shared by the Assistant page and the @assistant DM. */
export interface AssistantPrefs {
  style: string;
  model: string;
}

export function getAssistantPrefs(): Promise<AssistantPrefs> {
  return apiCall<AssistantPrefs>('/api/assistant-actions/prefs', { requiresAuth: true });
}

export function saveAssistantPrefs(prefs: Partial<AssistantPrefs>): Promise<AssistantPrefs> {
  return apiCall<AssistantPrefs>('/api/assistant-actions/prefs', { method: 'POST', body: prefs, requiresAuth: true });
}

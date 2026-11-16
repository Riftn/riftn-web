import { apiCall } from './core';

/** A direct message written now and sent later (GET /api/dm/scheduled). */
export interface ScheduledDm {
  _id: string;
  dmId: string;
  /** Plain text, or the sealed envelope when the chat is encrypted. */
  content: string;
  replyTo: string | null;
  /** UTC instant, ISO. Shown in the viewer's own zone. */
  sendAt: string;
  /** Zone of the device that picked the time. */
  timeZone: string | null;
  status: 'scheduled' | 'failed';
  failureCode: string | null;
  failureReason: string | null;
  createdAt: string | null;
}

const deviceZone = (): string | undefined => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
};

export async function listScheduledDms(dmId: string): Promise<ScheduledDm[]> {
  const res = await apiCall<{ result: ScheduledDm[] }>(`/api/dm/scheduled?dmId=${encodeURIComponent(dmId)}`, { requiresAuth: true });
  return res?.result || [];
}

export async function scheduleDm(input: { dmId: string; content: string; sendAt: Date; replyTo?: string | null }): Promise<ScheduledDm> {
  const res = await apiCall<{ result: ScheduledDm }>('/api/dm/scheduled', {
    method: 'POST',
    body: {
      dmId: input.dmId,
      content: input.content,
      sendAt: input.sendAt.toISOString(),
      timeZone: deviceZone(),
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    },
    requiresAuth: true,
  });
  return res.result;
}

/** Change the words, the time ('now' sends it straight away), or both. */
export async function updateScheduledDm(id: string, patch: { content?: string; sendAt?: Date | 'now' }): Promise<ScheduledDm> {
  const res = await apiCall<{ result: ScheduledDm }>(`/api/dm/scheduled/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: {
      ...(patch.content !== undefined ? { content: patch.content } : {}),
      ...(patch.sendAt !== undefined
        ? { sendAt: patch.sendAt === 'now' ? 'now' : patch.sendAt.toISOString(), timeZone: deviceZone() }
        : {}),
    },
    requiresAuth: true,
  });
  return res.result;
}

export async function cancelScheduledDm(id: string): Promise<void> {
  await apiCall(`/api/dm/scheduled/${encodeURIComponent(id)}`, { method: 'DELETE', requiresAuth: true });
}

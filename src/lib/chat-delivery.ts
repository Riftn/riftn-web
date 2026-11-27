import type { Socket } from 'socket.io-client';

/** A connected socket is not proof that the server accepted a message. */
export function confirmChatDelivery(options: {
  listen: (event: string, handler: (value: any) => void) => () => void;
  emit: () => void;
  messageEvent: string;
  errorEvent: string;
  matches: (message: any) => boolean;
  timeoutMs?: number;
  recover?: (sentAt: number) => Promise<boolean>;
}): Promise<boolean> {
  return new Promise(resolve => {
    let done = false;
    const off: Array<() => void> = [];
    const finish = (result: boolean | Promise<boolean>) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      off.forEach(remove => remove());
      resolve(result);
    };
    let sentAt: number | undefined;
    const recover = () => {
      if (done) return;
      const read = options.recover;
      const startedAt = sentAt;
      finish(read && startedAt != null
        ? Promise.resolve().then(() => read(startedAt)).catch(() => false)
        : false);
    };
    const timer = setTimeout(recover, options.timeoutMs ?? 15_000);
    try {
      off.push(options.listen(options.messageEvent, message => { if (options.matches(message)) finish(true); }));
      off.push(options.listen(options.errorEvent, () => finish(false)));
      off.push(options.listen('disconnect', recover));
      sentAt = Date.now();
      options.emit();
    } catch { finish(false); }
  });
}

export function roomMessageMatches(message: any, expected: {
  account: string; content: string; room?: string; attachment?: string; messageId?: string;
}): boolean {
  const value = message?.message ?? message;
  const sender = value?.senderAddress ?? value?.sender_address ?? value?.sender?.address ?? value?.user?.address;
  const room = value?.roomId ?? value?.room_id;
  if (!value?._id && !value?.id) return false;
  if (String(sender ?? '').toLowerCase() !== expected.account.toLowerCase()) return false;
  if (expected.room && room && String(room) !== expected.room) return false;
  if (expected.messageId && String(value._id ?? value.id) !== expected.messageId) return false;
  if ((value.content ?? '') !== expected.content) return false;
  if (expected.attachment && value.audioUrl !== expected.attachment && value.gif?.url !== expected.attachment &&
      !value.media?.some((item: { url?: string }) => item.url === expected.attachment)) return false;
  return true;
}

const confirmedBySocket = new WeakMap<Socket, Set<string>>();

/** Use a server row only once, even if two identical sends are in flight. */
export function liveTextConfirmation(socket: Socket, expected: {
  account: string; content: string; room: string; replyTo?: string;
}) {
  let claimed = confirmedBySocket.get(socket);
  if (!claimed) {
    claimed = new Set();
    confirmedBySocket.set(socket, claimed);
  }
  const confirmed = claimed;
  return (raw: any, sentAt?: number): boolean => {
    const message = raw?.message ?? raw;
    if (!roomMessageMatches(message, expected)) return false;
    if (sentAt != null) {
      const replyTo = message.replyTo?.id ?? message.replyTo?._id ?? message.replyTo ?? undefined;
      if ((message.roomId ?? message.room_id) !== expected.room || message.messageType !== 'text' ||
          replyTo !== expected.replyTo || !(Date.parse(message.createdAt) >= sentAt)) return false;
    }
    const id = String(message._id ?? message.id);
    if (confirmed.has(id)) return false;
    confirmed.add(id);
    if (confirmed.size > 100) {
      const first = confirmed.values().next().value;
      if (first !== undefined) confirmed.delete(first);
    }
    return true;
  };
}

/** Wait for the room to be usable before allowing an outgoing message. */
export function waitForChatRoom(
  socket: Socket,
  isReady: () => boolean,
  joinEvents: string[],
  rejoin: () => void,
): Promise<boolean> {
  if (socket.connected && isReady()) return Promise.resolve(true);
  return new Promise(resolve => {
    const ready = () => { if (socket.connected && isReady()) finish(true); };
    const rejected = () => { if (!socket.active) finish(false); };
    const finish = (joined: boolean) => {
      clearTimeout(timeout);
      socket.off('connect_error', rejected);
      for (const event of joinEvents) socket.off(event, ready);
      resolve(joined);
    };
    const timeout = setTimeout(() => finish(false), 12_000);
    socket.on('connect_error', rejected);
    for (const event of joinEvents) socket.on(event, ready);
    if (socket.connected) rejoin();
    // Namespace refusals stop the automatic reconnect loop.
    else if (!socket.active) socket.connect();
  });
}

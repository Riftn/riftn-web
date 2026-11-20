import { getAccountInfo } from '@/lib/api/dehub';
import { emitCreateAndStart, emitSendMessage } from '@/lib/api/dehub/dm-socket';
import { prepareOutgoing } from '@/lib/dm-e2ee/keys';
import { checkStoryReply, type StoryItem } from '@/lib/api/dehub/stories';

export type ReplyOutcome = 'sent' | 'paid-chat';

/**
 * A reply to a moment is an ordinary direct message to its owner, sent the
 * way every chat message is (encrypted when that chat is), with a link back
 * to the moment so they know what it answers.
 */
export async function sendStoryReply(item: StoryItem, text: string, label: string): Promise<ReplyOutcome> {
  const { to } = await checkStoryReply(item.id);
  let userId: string = to;
  try {
    const info = await getAccountInfo(to);
    userId = (info as { _id?: string } | null)?._id || to;
  } catch {
    /* the address works as an id too */
  }
  const conv = await emitCreateAndStart(userId);
  if (!conv?._id) throw new Error('Could not open the conversation');
  if (conv.dmFee?.required && !conv.dmFee.hasFreeAccess && conv.dmFee.fee > 0) return 'paid-chat';
  const link = `${window.location.origin}/app/moment/${item.id}`;
  const wire = await prepareOutgoing(to, `${label}: ${text}\n${link}`);
  await emitSendMessage({ dmId: conv._id, content: wire.content, type: 'msg' });
  return 'sent';
}

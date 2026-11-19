/**
 * Live reactions landing in chat, drawn with the real chat lines (live chat,
 * a DM, a group) and a scripted stream of reactions: someone adds to a chip,
 * you react, a new emoji shows up, two people pile on. It loops, so each
 * motion style can be watched and filmed in every theme:
 * /app/state-gallery?theme=hazy&reactions=burst (pop | fly | burst)
 */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DmMessageBubble } from '@/components/app/chat/DirectMessageChat';
import { ChatMessage as LiveChatLine, type Message as LiveChatLineMessage } from '@/components/app/chat/ChatMessage';
import type { DmMessage } from '@/lib/api/dehub';
import type { ReactionMotionStyle } from '@/lib/chat-reaction-motion';

const ME = '0x0000000000000000000000000000000000000001';
const P = ['0x7777777777777777777777777777777777777771', '0x7777777777777777777777777777777777777772', '0x7777777777777777777777777777777777777773', '0x7777777777777777777777777777777777777774', '0x7777777777777777777777777777777777777775'];

type R = Record<string, string[]>;
type Board = Record<string, R>;

/** [ms into the loop, line, emoji, who]. Panels run the same beat, a little apart. */
const BEATS: Array<[number, number, string, string]> = [
  [900, 0, '🔥', P[2]],
  [2500, 2, '❤️', ME],
  [4300, 1, '🚀', P[3]],
  [5600, 0, '😂', P[1]],
  [5950, 0, '😂', P[4]],
  [6300, 0, '😂', P[0]],
];
const LOOP_MS = 8600;
const START: R[] = [{ '🔥': [P[0], P[1]] }, { '👍': [P[2]] }, {}];

function useBoard(prefix: string, offset: number) {
  const [cycle, setCycle] = useState(0);
  const [board, setBoard] = useState<Board>({});
  useEffect(() => {
    const ids = [0, 1, 2].map((i) => `${prefix}-${cycle}-${i}`);
    setBoard(Object.fromEntries(ids.map((id, i) => [id, { ...START[i] }])));
    const timers = BEATS.map(([at, line, emoji, who]) => window.setTimeout(() => {
      setBoard((b) => {
        const id = ids[line];
        const cur = b[id] ?? {};
        return { ...b, [id]: { ...cur, [emoji]: [...(cur[emoji] ?? []), who] } };
      });
    }, at + offset));
    timers.push(window.setTimeout(() => setCycle((c) => c + 1), LOOP_MS));
    return () => timers.forEach(clearTimeout);
  }, [cycle, prefix, offset]);
  const ids = [0, 1, 2].map((i) => `${prefix}-${cycle}-${i}`);
  return { ids, board };
}

const people = [
  { _id: 'ella', address: P[0], username: 'ellaverse', displayName: 'Ella Verse' },
  { _id: 'luna', address: P[1], username: 'xluna', displayName: 'Luna' },
  { _id: 'deep', address: P[2], username: 'deepwater', displayName: 'Deep Water' },
];
const me = { _id: 'me', address: ME, username: 'me' };

function dm(id: string, sender: typeof me, content: string, minsAgo: number, reactions: R): DmMessage {
  return {
    _id: id, conversation: 'gallery', sender, author: sender === me ? 'me' : 'other', content,
    msgType: 'msg', mediaUrls: [], voiceDuration: null, isRead: true, isEdited: false, editedAt: null, isForwarded: false,
    replyTo: null, paymentStatus: null, paymentTxHash: null, tipAmount: null, tipSymbol: null,
    createdAt: new Date(Date.now() - minsAgo * 60_000).toISOString(), reactions,
  } as unknown as DmMessage;
}

const noop = () => {};

function Panel({ label, tag, children }: { label: string; tag: string; children: React.ReactNode }) {
  return (
    <div data-reaction-film={tag} className="flex h-[27rem] min-w-0 flex-col overflow-hidden rounded-2xl border border-white/10 md:h-[30rem]">
      <div className="border-b border-white/10 px-4 py-2 text-xs font-semibold text-zinc-400">{label}</div>
      <div data-chat-wallpaper className="chat-text-zone flex min-h-0 flex-1 flex-col justify-end overflow-hidden px-3 pb-4 pt-3">{children}</div>
    </div>
  );
}

function PublicPanel() {
  const { ids, board } = useBoard('rx-live', 0);
  const lines: Array<[string, string, string]> = [
    [P[1], 'Luna', 'gm chat, who is watching the stream tonight?'],
    [ME, 'me', 'count me in, 8pm UTC'],
    [P[2], 'Deep Water', 'that last clip was unreal'],
  ];
  return (
    <Panel label="Public chat" tag="public">
      {lines.map(([who, name, text], i) => {
        const msg: LiveChatLineMessage = {
          id: ids[i], userId: who, userName: name, userHandle: name.toLowerCase().replace(' ', ''), content: text,
          timestamp: new Date(Date.now() - (6 - i) * 60_000), type: 'text', reactions: board[ids[i]] ?? {},
        };
        return <LiveChatLine key={ids[i]} message={msg} currentUserAddress={ME} onReact={noop} onRemoveReaction={noop} onReply={noop} />;
      })}
    </Panel>
  );
}

function DmPanel({ group }: { group?: boolean }) {
  const { ids, board } = useBoard(group ? 'rx-group' : 'rx-dm', group ? 450 : 220);
  const thread: Array<[typeof me, string]> = group
    ? [[people[0], 'drop your fave track from the set'], [me, 'the second one, no contest'], [people[1], 'deep water on the decks next week?']]
    : [[people[0], 'the new intro is unreal, who made the music?'], [me, 'a friend of mine, sending the full track tonight'], [people[0], 'deal, can not wait']];
  return (
    <Panel label={group ? 'Group chat' : 'Direct message'} tag={group ? 'group' : 'dm'}>
      {thread.map(([sender, text], i) => (
        <DmMessageBubble
          key={ids[i]}
          message={dm(ids[i], sender, text, 20 - i * 4, board[ids[i]] ?? {})}
          isOwnMessage={sender === me}
          cozy={{ first: true, last: true }}
          currentUserAddress={ME}
          onReact={noop}
          onRemoveReaction={noop}
        />
      ))}
    </Panel>
  );
}

const STYLES: ReactionMotionStyle[] = ['pop', 'fly', 'burst'];
const STYLE_NAMES: Record<ReactionMotionStyle, string> = { pop: 'A · Pop', fly: 'B · Fly in', burst: 'C · Burst' };

export function ChatReactionArrivalGallery() {
  const [params] = useSearchParams();
  const asked = params.get('reactions') as ReactionMotionStyle | null;
  const [style, setStyle] = useState<ReactionMotionStyle>(() => {
    if (asked && STYLES.includes(asked)) return asked;
    try { return (localStorage.getItem('dehub.reactConcept') as ReactionMotionStyle) || 'burst'; } catch { return 'burst'; }
  });
  useEffect(() => {
    try { localStorage.setItem('dehub.reactConcept', style); } catch { /* storage blocked */ }
  }, [style]);
  return (
    <section data-page-bento data-reaction-arrival-gallery className="mb-5 space-y-3 rounded-3xl border border-white/10 bg-white/[0.04] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-sm font-semibold">Reactions landing live</h2>
        {STYLES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStyle(s)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${style === s ? 'bg-white text-black' : 'bg-white/10 text-white'}`}
          >
            {STYLE_NAMES[s]}
          </button>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <PublicPanel />
        <DmPanel />
        <DmPanel group />
      </div>
    </section>
  );
}

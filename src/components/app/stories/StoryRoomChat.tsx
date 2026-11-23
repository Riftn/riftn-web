/**
 * Comments on a moment, floating over the picture the way live chat floats
 * over a stream: the newest few, oldest at the top fading out, each new one
 * rising in from the bottom. A tap anywhere on them opens the full list.
 *
 * The same rows fill the side panel on wide screens (`docked`), where there
 * is room for the whole conversation and the box to add to it.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { buildAvatarUrl, buildAvatarCdnFallbackUrl } from '@/lib/media-url';
import { getStoryComments, type StoryComment } from '@/lib/api/dehub/stories';
import { ageLabel } from './story-utils';

const FLOATING = 4;

export function useMomentComments(itemId: string | undefined, signedIn: boolean, enabled: boolean) {
  return useQuery({
    queryKey: ['moment-room-comments', itemId, signedIn],
    queryFn: () => getStoryComments(itemId!, undefined, signedIn),
    enabled: !!itemId && enabled,
    staleTime: 10_000,
    refetchInterval: 15_000,
    retry: false,
  });
}

function faceOf(c: StoryComment) {
  const a = c.author;
  return a.avatarImageUrl ? buildAvatarUrl(a.address, a.avatarImageUrl) : buildAvatarCdnFallbackUrl(a.address, undefined);
}
function nameOfComment(c: StoryComment) {
  const a = c.author;
  return a.displayName || a.username || a.address.slice(0, 8);
}

/** A face, or its first letter while the picture is missing or broken. */
function Face({ c }: { c: StoryComment }) {
  const [broken, setBroken] = useState(false);
  const src = faceOf(c);
  return (
    <i aria-hidden="true">
      {src && !broken ? <img src={src} alt="" onError={() => setBroken(true)} /> : nameOfComment(c).slice(0, 1).toUpperCase()}
    </i>
  );
}

/** The newest few over the picture. Empty draws nothing. */
export function StoryRoomChat({ comments, onOpen }: { comments: StoryComment[]; onOpen: () => void }) {
  const { t } = useTranslation();
  // The server sends newest first; the room reads top to bottom like live chat.
  const rows = useMemo(() => comments.slice(0, FLOATING).reverse(), [comments]);
  // Rows already there when the list first arrives sit still; later ones rise in.
  // Decided once per row, so a refetch mid-rise never cuts the motion short.
  const rise = useRef<Map<string, boolean> | null>(null);
  const firstPaint = rise.current === null;
  if (!rise.current) rise.current = new Map();
  for (const r of rows) if (!rise.current.has(r.id)) rise.current.set(r.id, !firstPaint);
  if (!rows.length) return null;
  return (
    <button
      type="button"
      data-sv-room
      onClick={onOpen}
      aria-label={t('stories.comments', { defaultValue: 'Comments' })}
    >
      {rows.map(c => (
        <span key={c.id} data-sv-room-row data-enter={rise.current?.get(c.id) ? 'true' : undefined}>
          <Face c={c} />
          <span>
            <b>{nameOfComment(c)}</b>
            {c.text}
          </span>
        </span>
      ))}
    </button>
  );
}

/** Rows for the side panel: the whole list, newest at the bottom, with times. */
export function StoryRoomRows({ comments, onOpenProfile, emptyLabel }: { comments: StoryComment[]; onOpenProfile: (address: string) => void; emptyLabel: string }) {
  const rows = useMemo(() => [...comments].reverse(), [comments]);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [rows.length]);
  if (!rows.length) return <p data-sv-panel-empty>{emptyLabel}</p>;
  return (
    <div data-sv-panel-rows>
      {rows.map(c => (
        <div key={c.id} data-sv-panel-row>
          <button type="button" onClick={() => onOpenProfile(c.author.address)} aria-label={nameOfComment(c)}>
            <Face c={c} />
          </button>
          <div>
            <b>{nameOfComment(c)}</b>
            <p>{c.text}</p>
            <small>{ageLabel(c.createdAt)}</small>
          </div>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}

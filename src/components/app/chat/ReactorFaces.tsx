import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { buildAvatarUrl, extractAvatarPath } from '@/lib/media-url';
import { useChatReactors, type ReactorsSource } from './ChatReactorsList';

/** The first few people who reacted, as overlapping faces. Shares its fetch with the full list. */
export function ReactorFaces({ source, size = 20, max = 3 }: { source: ReactorsSource; size?: number; max?: number }) {
  const { rows } = useChatReactors(source, null);
  const faces = rows.slice(0, max);
  if (!faces.length) return null;
  return (
    <span className="flex shrink-0 items-center" data-reactor-faces>
      {faces.map((person, i) => {
        const name = person.displayName || person.username || person.address || '?';
        const src = buildAvatarUrl(person.address, extractAvatarPath(person));
        return (
          <Avatar
            key={person.address}
            className="rounded-full ring-2"
            data-reactor-face
            style={{ width: size, height: size, marginLeft: i ? -size * 0.3 : 0, zIndex: max - i }}
          >
            {src ? <AvatarImage src={src} alt="" /> : null}
            <AvatarFallback className="bg-zinc-700 text-[9px] font-semibold text-white">{name.replace(/^0x/, '')[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
        );
      })}
    </span>
  );
}

import { isOkeyTile, tileFace } from '@/lib/api/dehub/games';

/** Number colours on a cream tile: red, yellow, blue, black. */
export const OKEY_COLORS = ['#d42e2e', '#d99a00', '#1d63c9', '#1c1c1e'];

export function OkeyTile({
  tile,
  indicator,
  size = 'md',
  selected,
  dim,
  onClick,
  label,
}: {
  tile: number | null;
  indicator?: number;
  size?: 'xs' | 'sm' | 'md';
  selected?: boolean;
  dim?: boolean;
  onClick?: () => void;
  label?: string;
}) {
  const dims = size === 'xs' ? 'h-8 w-6 text-xs' : size === 'sm' ? 'h-11 w-8 text-base' : 'h-14 w-10 text-xl sm:h-16 sm:w-11 sm:text-2xl';
  if (tile === null) {
    return <span className={`${dims} inline-block rounded-md bg-emerald-900/60 ring-1 ring-white/10`} />;
  }
  const face = tileFace(tile);
  const wild = indicator !== undefined && isOkeyTile(tile, indicator);
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-label={label ?? (face.falseJoker ? 'False joker' : `${['Red', 'Yellow', 'Blue', 'Black'][face.c]} ${face.n}`)}
      aria-pressed={onClick ? !!selected : undefined}
      className={`${dims} relative inline-flex shrink-0 flex-col items-center justify-start rounded-md pt-0.5 font-bold leading-none shadow-[0_2px_0_#b9ae95,0_3px_6px_rgba(0,0,0,0.35)] transition-transform ${
        selected ? '-translate-y-2 ring-2 ring-amber-400' : ''
      } ${dim ? 'opacity-50' : ''}`}
      style={{ background: 'linear-gradient(#fffaf0, #efe6d2)' }}
    >
      {face.falseJoker ? (
        <span className="mt-1 text-[0.8em]" style={{ color: '#1c1c1e' }}>★</span>
      ) : (
        <>
          <span style={{ color: OKEY_COLORS[face.c] }}>{face.n}</span>
          <span className="mt-0.5 h-[0.35em] w-[0.35em] rounded-full" style={{ background: OKEY_COLORS[face.c] }} />
        </>
      )}
      {wild ? <span className="absolute -right-1 -top-1 rounded-full bg-amber-400 px-1 text-[9px] font-black text-black">OK</span> : null}
    </Tag>
  );
}

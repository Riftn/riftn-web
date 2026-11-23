import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fenBoard } from '@/lib/api/dehub/games';

/**
 * A plain 2D chess board for correspondence games. The server sends the legal
 * moves for the player on move, so this draws dots where a tapped piece can go
 * and hands the chosen move back. No chess rules live here.
 */

// U+FE0E keeps the text glyph: without it phones draw the pawn as a colour emoji.
const GLYPH: Record<string, string> = { k: '♚\uFE0E', q: '♛\uFE0E', r: '♜\uFE0E', b: '♝\uFE0E', n: '♞\uFE0E', p: '♟\uFE0E' };
const LIGHT = '#eed9b6';
const DARK = '#b58863';

export interface BoardMove { from: string; to: string; promotion?: string }

export function ChessBoard2D({
  fen,
  flipped,
  legal,
  lastMove,
  checkSquare,
  disabled,
  onMove,
}: {
  fen: string;
  flipped: boolean;
  legal?: BoardMove[];
  lastMove?: { from: string; to: string } | null;
  checkSquare?: string | null;
  disabled?: boolean;
  onMove: (move: BoardMove) => void;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string | null>(null);
  const [promo, setPromo] = useState<{ from: string; to: string } | null>(null);
  const squares = useMemo(() => {
    const all = fenBoard(fen);
    return flipped ? [...all].reverse() : all;
  }, [fen, flipped]);
  const targets = useMemo(
    () => new Set((legal ?? []).filter((m) => m.from === selected).map((m) => m.to)),
    [legal, selected],
  );
  const movable = useMemo(() => new Set((legal ?? []).map((m) => m.from)), [legal]);

  const tap = (square: string) => {
    if (disabled) return;
    if (selected && targets.has(square)) {
      const options = (legal ?? []).filter((m) => m.from === selected && m.to === square);
      if (options.some((m) => m.promotion)) setPromo({ from: selected, to: square });
      else onMove({ from: selected, to: square });
      setSelected(null);
      return;
    }
    setSelected(movable.has(square) && selected !== square ? square : null);
  };

  const whiteToMove = fen.split(' ')[1] === 'w';
  return (
    <div className="relative w-full select-none" style={{ maxWidth: 'min(100%, 560px)' }}>
      <div
        className="grid aspect-square w-full grid-cols-8 overflow-hidden rounded-xl shadow-lg ring-1 ring-black/40"
        role="grid"
        aria-label={t('games.chess.boardLabel', { defaultValue: 'Chess board' })}
      >
        {squares.map(({ square, piece }) => {
          const file = square.charCodeAt(0) - 97;
          const rank = Number(square[1]);
          const dark = (file + rank) % 2 === 0;
          const isLast = lastMove && (lastMove.from === square || lastMove.to === square);
          const isSel = selected === square;
          const isTarget = targets.has(square);
          const white = piece ? piece === piece.toUpperCase() : false;
          const showFile = flipped ? rank === 8 : rank === 1;
          const showRank = flipped ? file === 7 : file === 0;
          return (
            <button
              key={square}
              type="button"
              onClick={() => tap(square)}
              aria-label={`${square}${piece ? ` ${piece}` : ''}`}
              className="relative flex items-center justify-center p-0"
              style={{
                background: isSel ? '#f6f669' : isLast ? (dark ? '#aaa23a' : '#cdd26a') : dark ? DARK : LIGHT,
                boxShadow: checkSquare === square ? 'inset 0 0 18px 4px rgba(220,38,38,0.9)' : undefined,
              }}
            >
              {piece ? (
                <span
                  className="leading-none"
                  style={{
                    fontSize: 'min(9.5vw, 54px)',
                    color: white ? '#fbfbf8' : '#1c1917',
                    textShadow: white
                      ? '0 0 1px #111, 0 0 1px #111, 0 1px 2px rgba(0,0,0,0.6)'
                      : '0 0 1px #000, 0 1px 1px rgba(255,255,255,0.25)',
                  }}
                >
                  {GLYPH[piece.toLowerCase()]}
                </span>
              ) : null}
              {isTarget ? (
                <span
                  className={piece ? 'absolute inset-1 rounded-full ring-4 ring-black/25' : 'h-[28%] w-[28%] rounded-full bg-black/25'}
                />
              ) : null}
              {showFile ? (
                <span className="absolute bottom-0.5 right-1 text-[9px] font-semibold" style={{ color: dark ? LIGHT : DARK }}>
                  {square[0]}
                </span>
              ) : null}
              {showRank ? (
                <span className="absolute left-1 top-0.5 text-[9px] font-semibold" style={{ color: dark ? LIGHT : DARK }}>
                  {rank}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {promo ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-black/60">
          <div className="flex gap-2 rounded-xl bg-zinc-900 p-3 ring-1 ring-white/10">
            {['q', 'r', 'b', 'n'].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  onMove({ ...promo, promotion: p });
                  setPromo(null);
                }}
                className="flex h-14 w-14 items-center justify-center rounded-lg bg-zinc-800 text-4xl hover:bg-zinc-700"
                style={{ color: whiteToMove ? '#fbfbf8' : '#a8a29e' }}
              >
                {GLYPH[p]}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

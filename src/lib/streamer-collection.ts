/** Servers with twenty badges return the original eight for unknown collections. */
export async function loadStreamerCollection<T extends { cards?: readonly unknown[] } | null>(
  load: (collection: '21' | '20') => Promise<T>,
): Promise<T> {
  const current = await load('21');
  if (current?.cards?.length !== 8) return current;
  const previous = await load('20').catch(() => null);
  return previous?.cards?.length === 20 ? previous : current;
}

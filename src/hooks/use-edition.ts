import { useQuery } from '@tanstack/react-query';
import { fetchEditions, type EditionInfo } from '@/lib/api/dehub/collect';

/** Copies, royalties and owner-only extras of one post. Null before it loads. */
export function useEdition(tokenId: string | number | null | undefined) {
  const id = tokenId == null ? '' : String(tokenId);
  return useQuery<EditionInfo | null>({
    queryKey: ['edition', id],
    queryFn: async () => (await fetchEditions([id])).items?.[id] ?? null,
    enabled: !!id,
    staleTime: 60_000,
  });
}

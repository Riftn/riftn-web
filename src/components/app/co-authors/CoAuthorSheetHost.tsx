import { lazy, Suspense } from 'react';
import { closeCoAuthorSheet, useCoAuthorSheetRequest } from '@/lib/co-author-store';

const CoAuthorSheet = lazy(() => import('./CoAuthorSheet'));

/** One co-author sheet for the whole app, so a menu that closes can still open it. */
export function CoAuthorSheetHost() {
  const tokenId = useCoAuthorSheetRequest();
  if (!tokenId) return null;
  return (
    <Suspense fallback={null}>
      <CoAuthorSheet key={tokenId} tokenId={tokenId} onClose={closeCoAuthorSheet} />
    </Suspense>
  );
}

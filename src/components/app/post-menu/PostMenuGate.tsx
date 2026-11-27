import { lazy, Suspense, useEffect, useState } from 'react';
import { usePostMenuState } from '@/lib/post-menu';

const PostMenuHost = lazy(() => import('./PostMenuHost'));

/**
 * Loads the post right-click menu on the first right-click and keeps it
 * mounted after, so the sheets it opens outlive the menu.
 */
export function PostMenuGate() {
  const open = usePostMenuState();
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { if (open) setLoaded(true); }, [open]);
  if (!loaded && !open) return null;
  return (
    <Suspense fallback={null}>
      <PostMenuHost />
    </Suspense>
  );
}

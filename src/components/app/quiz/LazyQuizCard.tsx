import { Suspense } from 'react';
import { lazyWithRetry } from '@/lib/lazy-with-retry';

const QuizCard = lazyWithRetry(async () => ({ default: (await import('./QuizCard')).QuizCard }));

export function LazyQuizCard({ tokenId }: { tokenId: number }) {
  return <Suspense fallback={null}><QuizCard tokenId={tokenId} /></Suspense>;
}

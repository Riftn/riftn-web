import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('@/i18n/copy', () => ({ translateCopy: () => '' }));
vi.mock('@/components/TranslationText', () => ({ TranslationText: () => null }));
vi.mock('lucide-react', () => ({ AlertTriangle: () => null }));
vi.mock('@/components/ui/cut-icons/refresh', () => ({ default: () => null }));
vi.mock('@/components/ui/cut-icons/home', () => ({ default: () => null }));
vi.mock('@/components/ui/button', () => ({ Button: () => null }));
vi.mock('@/lib/assistant', () => ({ ASSISTANT_AVATAR: '' }));
const recovery = vi.hoisted(() => ({ result: 'reloading' as 'reloading' | 'exhausted' }));
vi.mock('@/lib/lazy-with-retry', () => ({
  isChunkLoadError: () => true,
  recoverFromChunkError: () => recovery.result,
}));

import { ErrorBoundary } from './ErrorBoundary';

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); recovery.result = 'reloading'; });

it('keeps a recovery action visible if a chunk reload never navigates', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  function BrokenPage(): React.ReactNode {
    throw new Error('Failed to fetch dynamically imported module');
  }
  render(
    <ErrorBoundary fallback={<button>Reload page</button>}>
      <BrokenPage />
    </ErrorBoundary>,
  );
  expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument();
});

function StaleChunkPage(): React.ReactNode {
  throw new Error('Failed to fetch dynamically imported module');
}

it('shows a loading state, not the crash screen, while a stale tab reloads onto the new version', () => {
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const { container } = render(
    <ErrorBoundary>
      <StaleChunkPage />
    </ErrorBoundary>,
  );
  expect(container.querySelector('[data-chunk-recovering]')).not.toBeNull();
  expect(container.querySelector('h1')).toBeNull();
  // The reload never happened: the crash screen and its buttons take over.
  act(() => { vi.advanceTimersByTime(10_000); });
  expect(container.querySelector('[data-chunk-recovering]')).toBeNull();
  expect(container.querySelector('h1')).not.toBeNull();
});

it('goes straight to the crash screen once both reloads already failed', () => {
  recovery.result = 'exhausted';
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const { container } = render(
    <ErrorBoundary>
      <StaleChunkPage />
    </ErrorBoundary>,
  );
  expect(container.querySelector('[data-chunk-recovering]')).toBeNull();
  expect(container.querySelector('h1')).not.toBeNull();
});

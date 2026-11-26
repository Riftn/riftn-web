import { cn } from '@/lib/utils';

export function LiveDot({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" data-live-dot data-keep-dark className={cn('size-1.5 shrink-0 rounded-full bg-red-500', className)} />
  );
}

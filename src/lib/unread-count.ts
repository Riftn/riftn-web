import { formatCount } from '@/lib/format-count';

/**
 * How a chat's unread / "below you" count renders: the same short style as
 * every other counter (999, 1.2K, 3.4M), never capped and never "1,200".
 */
export const formatUnreadCount = (count: number): string => formatCount(Math.max(0, Math.round(count)));

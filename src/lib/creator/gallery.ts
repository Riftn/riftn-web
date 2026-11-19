import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import type { CommentReactionRow, ThreadCommentRow } from '@/lib/comment-threads';
import type { PostReaction } from '@/lib/reactions';

export interface PublicGeneration {
  id: string; image_url: string; video_url: string | null; created_at: string;
  owner_wallet: string | null; title: string; width: number | null; height: number | null;
  likes: number; dislikes: number; comments: number; my_reaction: PostReaction | null; saved: boolean;
}
export interface GenerationDiscussion { comments: ThreadCommentRow[]; reactions: CommentReactionRow[] }
export const generationPath = (id: string, comment?: string | null) => `/creator/gallery/${encodeURIComponent(id)}${comment ? `?comment=${encodeURIComponent(comment)}` : ''}`;

// Keep this narrow contract separate from the generated schema until its next export.
type GalleryRpc = (name: 'creator_gallery_read' | 'creator_gallery_discussion' | 'creator_gallery_write', args: Record<string, Json>) => PromiseLike<{ data: Json | null; error: { message: string } | null }> & { setHeader(name: string, value: string): ReturnType<GalleryRpc> };
const rpc = supabase.rpc.bind(supabase) as unknown as GalleryRpc;
export async function readGenerations(offset = 0, id?: string, wallet?: string | null): Promise<PublicGeneration[]> {
  const query = rpc('creator_gallery_read', { p_offset: offset, p_limit: 40, p_id: id ?? null });
  const { data, error } = await (wallet ? query.setHeader('x-wallet-address', wallet.toLowerCase()) : query);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as PublicGeneration[];
}
export async function readGenerationDiscussion(id: string): Promise<GenerationDiscussion> {
  const { data, error } = await rpc('creator_gallery_discussion', { p_id: id });
  if (error) throw new Error(error.message);
  return data as unknown as GenerationDiscussion;
}
export async function writeGeneration(id: string, action: string, data: Record<string, Json> = {}, wallet?: string | null) {
  if (!wallet) throw new Error('Sign in to continue');
  const result = await rpc('creator_gallery_write', { p_id: id, p_action: action, p_data: data }).setHeader('x-wallet-address', wallet.toLowerCase());
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

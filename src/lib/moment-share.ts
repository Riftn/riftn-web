/**
 * Whether a post can be shared to a Moment from its menu: public, free to see.
 * The server makes the final call; this only hides the row where it would fail.
 */
export function canShareToMoment(post: {
  isPPV?: boolean | null;
  isLocked?: boolean | null;
  isW2E?: boolean | null;
  subscriberPlans?: unknown[] | null;
  visibility?: string | null;
}): boolean {
  return !post.isPPV && !post.isLocked && !post.isW2E
    && !(Array.isArray(post.subscriberPlans) && post.subscriberPlans.length > 0)
    && (!post.visibility || post.visibility === 'public');
}

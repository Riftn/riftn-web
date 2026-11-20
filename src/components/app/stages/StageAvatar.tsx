/**
 * StageAvatar — a person's picture on a stage surface, never a dead square
 * =======================================================================
 * The stage cards, the /stages/:n page and the room's own lists drew the
 * host's picture as a bare <img>: one URL, no error path. A host whose stored
 * picture had moved, or who never had one and got the CDN guess, showed an
 * empty grey tile (iPhone Safari draws nothing at all for a broken image).
 *
 * The ladder it walks now lives in `components/app/LadderAvatar`, shared with
 * the feed's follow-card rail, which had the same hole. This file keeps the
 * stage-shaped names so call sites and tests are unchanged.
 */

import { LadderAvatar, avatarSources } from '@/components/app/LadderAvatar';

/** Every URL worth trying for this person, best first, no repeats. */
export const stageAvatarSources = avatarSources;

export const StageAvatar = LadderAvatar;

export default StageAvatar;

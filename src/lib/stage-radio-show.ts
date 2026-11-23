/**
 * Radio shows: a stage that is music first.
 *
 * A radio show is an ordinary stage (same room, same mic, same schedule and
 * same music deck) whose host said it is a radio show when they opened it.
 * The mark is the channel name's prefix, which is minted once when the stage
 * is created and never changes, so no table change is needed and every
 * client can tell a show from a talk without another lookup. The Agora token
 * function looks channels up by exact name, so the prefix changes nothing
 * about who may speak.
 */
export const RADIO_CHANNEL_PREFIX = 'radio_';

export function newStageChannelName(radio = false): string {
  return `${radio ? RADIO_CHANNEL_PREFIX : 'stage_'}${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

export function isRadioShow(space?: { channel_name?: string | null } | null): boolean {
  return !!space?.channel_name && space.channel_name.startsWith(RADIO_CHANNEL_PREFIX);
}

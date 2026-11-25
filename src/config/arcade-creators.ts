export type ArcadeCreator = 'riftn' | { username: string };

export const COCHRANIZ3R = { username: 'c0chraniz3r' } as const;

type GameAttribution = {
  creator?: ArcadeCreator;
  credit?: { author?: string; url?: string };
};

type CreatorGroup = {
  id: string;
  name?: string;
  username?: string;
  profileUrl?: string;
  avatarUrl?: string;
};

function creatorGroup(game: GameAttribution): CreatorGroup {
  if (game.creator === 'riftn') return { id: 'riftn' };
  if (game.creator) {
    const username = game.creator.username.toLowerCase();
    return { id: `riftn:${username}`, name: `@${username}`, username };
  }

  const github = game.credit?.url?.match(/^https:\/\/github\.com\/([a-z\d-]+)\//i)?.[1];
  const author = game.credit?.author;
  if (github) {
    return {
      id: `github:${github.toLowerCase()}`,
      name: author ?? github,
      profileUrl: `https://github.com/${github}`,
      avatarUrl: `https://github.com/${github}.png?size=64`,
    };
  }
  if (author) return { id: `author:${author.toLowerCase()}`, name: author };
  return { id: 'other' };
}

export function groupArcadeGames<T extends GameAttribution>(games: readonly T[]) {
  const groups = new Map<string, CreatorGroup & { games: T[] }>();
  for (const game of games) {
    const creator = creatorGroup(game);
    const group = groups.get(creator.id);
    if (group) group.games.push(game);
    else groups.set(creator.id, { ...creator, games: [game] });
  }

  const originals = groups.get('riftn');
  const other = groups.get('other');
  groups.delete('riftn');
  groups.delete('other');
  return [...(originals ? [originals] : []), ...groups.values(), ...(other ? [other] : [])];
}

/**
 * People for the @ list, answered from the device first.
 *
 * The list used to stay empty until a search request came back, on every
 * letter. Three things here make it open with names already in it:
 *
 *  - every answer the server gave is kept, so a letter typed again (after a
 *    backspace, or the same tag in the next message) costs nothing;
 *  - a new letter is answered at once by narrowing what is already known:
 *    the answer to the letters before it, the people picked recently, and the
 *    viewer's own short list (people they tagged before or follow);
 *  - that short list and the recent picks are stored, so they are there on
 *    the first @ of the next visit too.
 *
 * The server still gets asked and its answer replaces the guess, so ranking,
 * bans and blocks stay the server's call. The guess only fills the wait.
 */

import { apiCall } from '@/lib/api/dehub/core';
import { buildAvatarUrl } from '@/lib/media-url';
import { ASSISTANT_AVATAR, isAssistantAddress } from '@/lib/assistant';
import type { MentionUser } from '@/components/app/mentions';

/** An exact answer is reused without asking again for this long. */
const ANSWER_FRESH_MS = 60_000;
/** After that it still feeds the instant guess, until it is this old. */
const ANSWER_KEEP_MS = 10 * 60_000;
const MAX_ANSWERS = 80;
/** The viewer's own list is refreshed in the background this often. */
const SEED_FRESH_MS = 30 * 60_000;
/** A stored list older than this is not shown at all. */
const SEED_KEEP_MS = 14 * 24 * 60 * 60_000;
const RECENT_MAX = 24;
const LIST_MAX = 10;
const STORE_PREFIX = 'riftn.mention.people.v1:';

type Answer<T> = { at: number; rows: T[] };

/**
 * Answers to a typeahead, by the text that was typed.
 *
 * `fresh` is an answer still good enough to show as final; `fromPrefix` is the
 * rows of the longest earlier text the new one extends, for narrowing while
 * the real answer is on its way.
 */
export class AnswerCache<T> {
  private answers = new Map<string, Answer<T>>();

  constructor(
    private freshMs = ANSWER_FRESH_MS,
    private keepMs = ANSWER_KEEP_MS,
    private max = MAX_ANSWERS,
  ) {}

  fresh(q: string, now = Date.now()): T[] | null {
    const hit = this.answers.get(q);
    return hit && now - hit.at < this.freshMs ? hit.rows : null;
  }

  set(q: string, rows: T[], now = Date.now()): void {
    this.answers.delete(q);
    this.answers.set(q, { at: now, rows });
    if (this.answers.size > this.max) {
      const oldest = this.answers.keys().next().value;
      if (oldest !== undefined) this.answers.delete(oldest);
    }
  }

  fromPrefix(q: string, now = Date.now()): T[] {
    for (let length = q.length; length >= 1; length--) {
      const hit = this.answers.get(q.slice(0, length));
      if (hit && now - hit.at < this.keepMs) return hit.rows;
    }
    return [];
  }

  /** Every row still kept, newest answer first. */
  all(now = Date.now()): T[] {
    const rows: T[] = [];
    for (const hit of Array.from(this.answers.values()).reverse()) {
      if (now - hit.at < this.keepMs) rows.push(...hit.rows);
    }
    return rows;
  }

  clear(): void {
    this.answers.clear();
  }
}

/** A row of users_search or mention_seed. */
export interface PeopleApiRow {
  username?: string;
  displayName?: string;
  avatarImageUrl?: string;
  address?: string;
  isFollowing?: boolean;
  followsYou?: boolean;
  isVerified?: boolean;
  isAssistant?: boolean;
  badgeBalance?: number;
  badgeLock?: { tier: string; requirement: number } | null;
  hideBadgeAndBalance?: boolean;
  followers?: number;
  followings?: number;
  followerCount?: number;
  followingCount?: number;
}

export function toMentionUser(u: PeopleApiRow): MentionUser {
  const assistant = isAssistantAddress(u.address);
  return {
    id: u.address || u.username || '',
    username: u.username || '',
    displayName: u.displayName ?? null,
    avatarUrl: assistant ? ASSISTANT_AVATAR : buildAvatarUrl(u.address || '', u.avatarImageUrl) || null,
    isVerified: u.isVerified ?? false,
    badgeBalance: u.hideBadgeAndBalance ? 0 : u.badgeBalance,
    badgeLock: u.hideBadgeAndBalance ? null : u.badgeLock,
    followerCount: typeof u.followerCount === 'number' ? u.followerCount : (typeof u.followers === 'number' ? u.followers : undefined),
    followingCount: typeof u.followingCount === 'number' ? u.followingCount : (typeof u.followings === 'number' ? u.followings : undefined),
    isFollowing: u.isFollowing,
    followsYou: u.followsYou,
    isAssistant: assistant,
  };
}

/** What is typed after the @, the way the server reads it. */
export function normalizeMentionQuery(raw: string): string {
  return raw.trim().replace(/^@+/, '').toLowerCase();
}

/** 0 the handle itself, 1 handle starts with it, 2 a word of the name does, 3 anywhere, -1 no match. */
export function mentionMatchRank(user: Pick<MentionUser, 'username' | 'displayName'>, q: string): number {
  const name = (user.username || '').toLowerCase();
  const display = (user.displayName || '').toLowerCase();
  if (name === q) return 0;
  if (name.startsWith(q)) return 1;
  if (display.startsWith(q) || display.split(/[\s_.-]+/).some((word) => word.startsWith(q))) return 2;
  if (name.includes(q) || display.includes(q)) return 3;
  return -1;
}

// ── Per-viewer state ────────────────────────────────────────────────────────
// Follows, blocks and the short list all belong to one account, so everything
// here is dropped when the signed-in account changes.

let scope: string | null = null;
const answers = new AnswerCache<MentionUser>();
const inflight = new Map<string, Promise<MentionUser[]>>();
let seed: MentionUser[] = [];
let seedAt = 0;
let seedLoading: Promise<void> | null = null;
let recent: MentionUser[] = [];
const listeners = new Set<() => void>();

function currentScope(): string {
  try {
    return (localStorage.getItem('dehub_wallet') || 'anon').toLowerCase();
  } catch {
    return 'anon';
  }
}

function enterScope(): void {
  const next = currentScope();
  if (next === scope) return;
  scope = next;
  answers.clear();
  inflight.clear();
  seed = [];
  seedAt = 0;
  seedLoading = null;
  recent = [];
  try {
    const stored = JSON.parse(localStorage.getItem(STORE_PREFIX + scope) || 'null') as
      | { seedAt?: number; seed?: MentionUser[]; recent?: MentionUser[] }
      | null;
    if (stored && Array.isArray(stored.recent)) recent = stored.recent.filter((u) => u?.username).slice(0, RECENT_MAX);
    if (stored && Array.isArray(stored.seed) && Date.now() - (stored.seedAt || 0) < SEED_KEEP_MS) {
      seed = stored.seed.filter((u) => u?.username);
      seedAt = stored.seedAt || 0;
    }
  } catch {
    /* a private window or a full store: the list just starts empty */
  }
}

function store(): void {
  if (scope === null) return;
  try {
    localStorage.setItem(STORE_PREFIX + scope, JSON.stringify({ seedAt, seed, recent }));
  } catch {
    /* nothing to do: the lists still work for this visit */
  }
}

/** Told when the short list arrives, so an open list can fill in from it. */
export function onMentionPeopleChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Get the viewer's short list ready. Cheap to call on every keystroke: it does
 * something only on the first call and once the stored copy has gone stale.
 */
export function warmMentionPeople(): void {
  enterScope();
  if (scope === 'anon' || seedLoading || Date.now() - seedAt < SEED_FRESH_MS) return;
  const forScope = scope;
  seedLoading = apiCall<{ result?: PeopleApiRow[] }>('/api/users/mention_seed', { timeoutMs: 8000 })
    .then((response) => {
      if (forScope !== scope) return;
      seed = (response?.result || []).filter((u) => u?.username).map(toMentionUser);
      seedAt = Date.now();
      store();
      listeners.forEach((listener) => listener());
    })
    .catch(() => {
      // Tried; do not ask again on every key. The search still answers.
      if (forScope === scope) seedAt = Date.now() - SEED_FRESH_MS + 60_000;
    })
    .finally(() => {
      if (forScope === scope) seedLoading = null;
    });
}

/** A person was tagged: offer them first next time. */
export function rememberMentionPick(user: MentionUser): void {
  if ((user.kind ?? 'user') !== 'user' || !user.username) return;
  enterScope();
  recent = [user, ...recent.filter((u) => u.id !== user.id)].slice(0, RECENT_MAX);
  store();
}

/** The server's answer for these letters, if it was asked a moment ago. */
export function settledPeople(q: string): MentionUser[] | null {
  enterScope();
  return answers.fresh(q);
}

/**
 * The best list the device can give right now, without asking anyone: recent
 * picks, then the viewer's own people, then anyone an earlier answer named,
 * each narrowed to the letters typed.
 */
export function guessPeople(q: string): MentionUser[] {
  enterScope();
  if (!q) return [];
  const seen = new Set<string>();
  const scored: Array<{ user: MentionUser; source: number; rank: number; order: number }> = [];
  const add = (users: MentionUser[], source: number) => {
    for (const user of users) {
      const key = user.id || user.username;
      if (!key || seen.has(key)) continue;
      const rank = mentionMatchRank(user, q);
      if (rank < 0) continue;
      seen.add(key);
      scored.push({ user, source, rank, order: scored.length });
    }
  };
  add(recent, 0);
  add(seed, 1);
  add(answers.fromPrefix(q), 2);
  add(answers.all(), 3);
  // The assistant leads its own matches, then the handle typed in full, then
  // the viewer's own people before strangers, a closer spelling first.
  const lead = (row: { user: MentionUser; rank: number }) => (row.user.isAssistant ? 0 : row.rank === 0 ? 1 : 2);
  scored.sort((a, b) => lead(a) - lead(b) || Math.min(a.source, 2) - Math.min(b.source, 2) || a.rank - b.rank || a.order - b.order);
  return scored.slice(0, LIST_MAX).map((row) => row.user);
}

/** Ask the server. One request per text however many lists want it. */
export function fetchPeople(q: string): Promise<MentionUser[]> {
  enterScope();
  const cached = answers.fresh(q);
  if (cached) return Promise.resolve(cached);
  const running = inflight.get(q);
  if (running) return running;
  const forScope = scope;
  const request = apiCall<{ result?: PeopleApiRow[] }>('/api/users_search', {
    // `searchParam`, not `q`: the API reads that name and silently treats a
    // missing one as an empty search.
    params: { searchParam: q, page: 1, limit: LIST_MAX },
  })
    .then((response) => {
      const people = (response?.result || []).slice(0, LIST_MAX).map(toMentionUser);
      // Tagging the assistant is how you ask the AI a question in a thread,
      // so it leads its own matches rather than ranking among them.
      people.sort((a, b) => Number(b.isAssistant ?? false) - Number(a.isAssistant ?? false));
      if (forScope === scope) answers.set(q, people);
      return people;
    })
    .finally(() => {
      if (inflight.get(q) === request) inflight.delete(q);
    });
  inflight.set(q, request);
  return request;
}

/** For tests: forget everything, as a fresh page load would. */
export function resetMentionPeople(): void {
  scope = null;
  answers.clear();
  inflight.clear();
  seed = [];
  seedAt = 0;
  seedLoading = null;
  recent = [];
}

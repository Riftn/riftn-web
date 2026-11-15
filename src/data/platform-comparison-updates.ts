/**
 * Changes since the 2026-10-28 review, checked on 2026-11-15.
 * - RIFTN: features shipped since then, and features that are paused right now.
 * - PEERS: competitor launches the earlier review missed or that went live since.
 * - NEW_ROWS: features that were not on the chart at all.
 * These win over every earlier source for the same feature and platform.
 */
import type { ComparisonEntry, PlatformId, Status } from './platform-comparison';

export const UPDATES_REVIEWED_ON = '2026-11-15';

export const UPDATE_SOURCES: Record<string, { title: string; url: string }> = {
  riftnNew: { title: 'Riftn guide: new in November', url: 'https://riftn.com/docs/dapps#whats-new' },
  riftnToken: { title: 'Riftn token: coming soon', url: 'https://riftn.com/dex' },
  riftnDevelopers: { title: 'Riftn developer docs', url: 'https://riftn.com/docs/developers' },
  ytPronouns: { title: 'Add pronouns to your YouTube channel', url: 'https://support.google.com/youtube/answer/13871472' },
  ytGoals: { title: 'YouTube live goals', url: 'https://support.google.com/youtube/answer/15685577' },
  ytComments: { title: 'Post and interact with YouTube comments', url: 'https://support.google.com/youtube/answer/6000964' },
  xDisappearing: { title: 'X Chat disappearing messages', url: 'https://docs.x.com/x-api/chat/turn-on-disappearing-messages-in-a-chat-conversation' },
  tiktokBulletin: { title: 'TikTok bulletin boards', url: 'https://newsroom.tiktok.com/introducing-bulletin-board' },
  kickAds: { title: 'Kick ads during live streams', url: 'https://www.tubefilter.com/2026/08/11/kick-launches-mid-roll-ads-creator-monetization/' },
  igCommentEdit: { title: 'Instagram comment editing', url: 'https://en.roya.tv/articles/20066' },
};

const e = (source: string, note: string, status: Status = 'documented'): ComparisonEntry => ({ source, note, status });

/** Riftn's own column. */
export const RIFTN_UPDATES: Record<string, ComparisonEntry> = {
  casting: e('riftnNew', 'Cast videos and Shorts to a TV from the video menu.'),
  'ambient-mode': e('riftnNew', 'A soft glow from the picture fills the space around wide-screen videos and photos on large screens.'),
  'typical-performance': e('riftnNew', 'Your own posts show how their views compare with your usual post.'),
  'pin-chats': e('riftnNew', 'Pin chats to the top of Messages.'),
  unsend: e('riftnNew', 'Delete a sent message and it is removed for everyone in the chat.'),
  'broadcast-channels': e('riftnNew', 'Start a channel from the + in Messages, free or with a paid entry.'),
  'sensitive-blur': e('riftnNew', 'Posts with a content warning or a mature notice stay blurred until you tap to view.'),
  'developer-portal': e('riftnDevelopers', 'Developer docs with the API, sign-in, webhooks and examples.'),
  'login-with': e('riftnDevelopers', '"Sign in with Riftn" keys for ordinary websites.'),
  'desktop-app': e('riftnNew', 'Installs from the browser as its own app window on Chrome, Edge and Safari.', 'ecosystem'),
  soundtracks: e('riftnNew', 'Add free songs from Audius and Wikimedia Commons to photo, video and Shorts posts.'),
  dex: e('riftnToken', 'The exchange opens when the $RIFT token launches. Trading is paused until then.', 'announced'),
  'card-topup': e('riftnToken', 'Card purchases of tokens are paused until the $RIFT token launches.', 'announced'),
};

/** Competitor columns. */
export const PEER_UPDATES: Record<string, Partial<Record<PlatformId, ComparisonEntry>>> = {
  pronouns: { youtube: e('ytPronouns', 'Pronouns on the channel page.') },
  'live-goals': { youtube: e('ytGoals', 'Super Chat goals during live streams.') },
  'disappearing-messages': { x: e('xDisappearing', 'Disappearing messages in X Chat.') },
  'broadcast-channels': { tiktok: e('tiktokBulletin', 'Bulletin boards for creators aged 18+ with at least 50,000 followers.', 'limited') },
  'live-ads': { kick: e('kickAds', 'Ads run during live streams.') },
};

type Marks = Partial<Record<PlatformId, ComparisonEntry>>;
/** [id, category, name, Riftn note, competitor entries]. Competitors left out stay unverified, never a cross. */
export const NEW_ROWS: Array<[string, string, string, string, Marks]> = [
  ['comment-edit', 'Posts and discovery', 'Edit a comment after posting', 'Edit your comment in place; changes save as you type.', {
    youtube: e('ytComments', 'Edit your own comments.'),
    instagram: e('igCommentEdit', 'Edit a comment for up to 15 minutes after posting.', 'limited'),
  }],
  ['spotify-play', 'Posts and discovery', 'Spotify songs that play inside posts and chats', 'Spotify links play in posts, comments, chats and the profile grid, with a corner player.', {}],
  ['comics', 'Studio and creation', 'Turn a photo carousel into a comic', 'Turn a photo carousel into a comic from the post menu and pick a border.', {}],
  ['own-ai-keys', 'Studio and creation', 'Use your own AI provider keys', 'Run voice, captions, chat, writing and the app builder on your own AI provider keys.', {}],
  ['wallet-follows', 'Open web and automation', 'Your own keys own who you follow', 'Follows are signed by your wallet and can be added to the Ethereum Follow Protocol.', {
    farcaster: e('farcaster', 'Follows are messages signed by keys the account owns.'),
    bluesky: e('bskyNetwork', 'Follows are records in your own signed data repository.'),
  }],
  ['likes-privacy', 'Accounts, privacy and preferences', 'Hide which posts you liked', 'Separate switches to hide your followers, following and likes.', {}],
];

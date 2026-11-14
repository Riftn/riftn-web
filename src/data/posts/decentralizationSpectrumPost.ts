import { BlogPost } from '@/types/blog';

export const decentralizationSpectrumPost: BlogPost = {
  id: 'decentralization-spectrum-social-media',
  slug: 'decentralization-spectrum-social-media',
  title: 'The Decentralization Spectrum: How Decentralized Can Social Media Really Get?',
  excerpt: 'Putting data on a blockchain does not make a social network decentralized. We ranked 30 crypto and decentralized social platforms by who really controls them: rules, moderation, ownership, revenue and code. Here is the spectrum, and why Riftn sits at the top.',
  content: `Every decentralized social app has a slightly awkward secret: it runs on the same internet as everything else. And the internet is a lot more centralized than most "Web3" marketing would like you to believe.

There is a second secret too. **Putting data on a blockchain does not make a platform decentralized.** If one founder or one company still sets the rules, moderates the feed, decides what gets built and keeps the money, the platform is centralized, however many hashes it writes on chain.

So this guide ranks 30 crypto and decentralized social platforms on what actually matters: **who controls the platform**. Who sets the rules, who moderates, who owns it, who gets paid, who builds it, and only then where the data lives.

![The decentralization spectrum: 30 social platforms ranked by who really controls them, from founder-run apps to fully user-owned networks](/media/fig-decentralization-spectrum-control-riftn.jpg)

## First, a reality check: the internet is already centralized

Before anyone gets too proud of their node count, here is what almost every decentralized app quietly depends on.

- **Names.** Every web address relies on the DNS root, which is coordinated by one non-profit, ICANN, and served by 13 root server identities run by 12 organizations. Your ".com" is rented from a registrar that can suspend it.
- **Cloud.** Amazon, Microsoft and Google together run roughly two thirds of the world's cloud infrastructure. When one AWS region stumbled on 20 October 2025, apps from Signal to Snapchat went down with it.
- **The front door.** A Cloudflare outage on 18 November 2025 took X and ChatGPT offline for hours. A big slice of the web sits behind a single company's network.
- **App stores.** Two companies decide what can be installed on almost every phone on earth. In January 2021 Apple and Google pulled Parler from their stores, and Amazon stopped hosting it, all within days.
- **Your internet provider.** Whoever runs your connection can block, throttle or log what you reach.
- **Blockchains too.** Most wallets and apps read the chain through a few big node providers instead of running their own node, and a large share of nodes live in the same handful of clouds. Riftn is no exception: we use Alchemy to watch the chain.

None of this means decentralization is pointless. It means the pipes will always be shared. The real fight is over **who is in charge of the platform on top of them**.

## On-chain is not the same as decentralized

Two stories make the point.

- **Steemit** stored every post on its own blockchain. In 2020, after Justin Sun bought Steemit Inc., exchanges used their customers' deposits to vote in new validators and took control of the chain. Everything was on chain, and it still changed hands overnight. The community only escaped by copying the code and the data and leaving to start Hive.
- **Friend.tech** put its keys on Base. When the team walked away in 2024, the contracts stayed on chain and the app went quiet. On-chain data with nobody empowered to carry on is a museum, not a network.

The lesson: **having things on chain means nothing if a founder dictates the platform.** What matters is whether the people who use a network also govern it, moderate it, build it, own it and share in what it earns.

## The six questions that place an app on the spectrum

1. **Who sets the rules?** A founder, a company board, server admins, or the users through open proposals and votes?
2. **Who moderates?** One trust and safety team, each server's admin, or the community, with a team only for the law?
3. **Who builds it?** A roadmap decided behind closed doors, or features anyone can ask for and get shipped?
4. **Who owns it, and who gets paid?** Shareholders and a founder, or the users and holders themselves?
5. **Where does the data live?** One company's database, many servers, or a chain you can read without anyone's permission?
6. **Can anyone read the code?** If the code is public, people can check it, and leave with it.

## The spectrum, rung by rung

Here is the ladder from founder-run to fully user-owned, with 30 platforms placed by those six questions. Placements are our read of how each one works today. For user numbers and developer activity, see our [Top 50 Decentralized Social Apps 2026](/guides/top-50-decentralized-social-apps-2026) index.

### Rung 0: Founder or company run

One company owns the accounts, the data, the servers, the rules, the roadmap and the revenue.

- **X, Instagram, TikTok, YouTube, Facebook**: the baseline. Your account is a row in their database and can disappear with one decision.

### Rung 1: Crypto features, central control

Tokens, wallets or on-chain trading, but one team still runs the app, sets the rules and keeps the business.

- **Phaver, Arena, UXLINK, Cheelee**: crypto rewards and wallets, with the app, data and rules run centrally.
- **Zora**: every post is a coin on Base, but the app, the media and the roadmap are Zora's.
- **Base App**: Coinbase's wallet and social app. Its social side rides on Farcaster and Zora, while Coinbase runs the app.
- **Friend.tech**: everything on Base, nobody left in charge.
- **Odysee**: started on the LBRY blockchain. After LBRY Inc. lost its case with the SEC in 2023, Odysee carried on as a mostly ordinary video platform.
- **Minds**: open source code under the AGPL, but one company runs the network.
- **Steemit**: every post on its own chain, yet one buyer took control in 2020.
- **DSCVR**: a crypto community portal on the Internet Computer, run by its own team.

### Rung 2: Open protocol, company-run app

Anyone can build on the protocol, and some data is portable or on chain, but one company runs the main app, most of the infrastructure and the business.

- **Bluesky**: your posts live in a personal data server you can move, and you can add other people's moderation labelers. Most accounts still live on Bluesky's servers, and Bluesky runs the main relay, the app and the company.
- **Farcaster**: your account ID is registered on Optimism and posts are spread across Farcaster's own nodes. The main app and the protocol's direction are still set by its core team.
- **Lens**: profiles and the social graph live on Lens Chain, while content is stored off chain and the protocol is stewarded by one team.
- **DeSo** (Focus, Diamond): a blockchain built for social that stores posts on chain, with its founding team still steering it.
- **Audius**: music on content nodes run by independent operators, with token governance, but a core company driving the product.
- **Blacksky and Skylight**: community and video apps on Bluesky's AT Protocol.

### Rung 3: Federated

Thousands of independent servers that talk to each other. Power is spread out, but each server is its own small kingdom: its admin moderates, sets the rules and can shut it down.

- **Mastodon**: microblogging on ActivityPub, fully open source. Your identity belongs to your server, so if it closes, you move.
- **Pixelfed, PeerTube, Misskey, Lemmy, Friendica**: the same idea for photos, video, Japanese-style microblogging, link sharing and Facebook-style profiles.
- **Matrix and Element**: federated, encrypted chat that any organization can host.

### Rung 4: Nobody in charge

No company, no chain, no servers you have to trust. Just a key you hold and many relays that pass messages around. Nobody can take it from you, but nobody governs it, funds it or keeps it safe either.

- **Nostr** (Damus, Primal, Amethyst, Iris, Coracle): your identity is a key pair and anyone can run a relay. There is no central moderation, no shared revenue and no shared roadmap. Each app and relay decides for itself.

### Rung 5: Community-governed chains

The chain and its treasury are governed by token holders, not one company.

- **Hive** (PeakD, Ecency): every post is on chain, block producers are voted in by stakeholders, and a community fund pays for proposals. Born from the Steemit takeover.
- **OpenChat, Taggr**: apps that run as smart contracts on the Internet Computer, with control handed to token-holder DAOs.

### Rung 6: Fully user owned

The users govern it, moderate it, build it, own it and share in all of its profit, and the parts worth keeping forever go on chain.

- **Riftn**: the only platform here that ticks all six questions. Here is why.

## Why Riftn sits at the top

Here is how Riftn answers the six questions.

- **Rules: set by the community.** Badge holders submit proposals for free on the governance board, and holders vote on them. There is no single owner deciding the rules on a whim.
- **Moderation: done by the community first.** Reports are weighted by standing, and posts the crowd turns on drop out of public feeds. A small team handles only what the law requires. Details below.
- **Building: done by the users.** The [requests page](https://riftn.com/features) works like a prompt for the whole platform. Anyone can ask for a feature or a fix, and it gets built in public. In our October 2026 index, Riftn shipped more public code in 90 days than any other decentralized social app.
- **Ownership and revenue: shared.** Riftn is user owned, and 100% of platform profit is shared with $RIFT stakers. Even the money is decentralized. There is no set APY and no guaranteed return; stakers share in whatever the platform earns.
- **Data: on chain where it counts.** Identity is your wallet. Any post can be minted so its full text, with a keccak256 fingerprint of the original, is written into the blockchain itself. You can also keep a copy of who you follow on the Ethereum Follow Protocol on Base, in a list your wallet owns. Media stays off chain, for good reasons explained below.
- **Code: in the open.** Our web and mobile apps are public on GitHub, and you can read every change as it lands. Your profile can even be followed from Mastodon and the wider fediverse at @yourname@riftn.com.

Other platforms put more bytes on chain. None of them hand the rules, the moderation, the roadmap and the profits to their users at the same time. That is what puts Riftn on rung 6.

## Why only words go on chain

Putting words on chain and keeping media off it is not just about cost. It is also the line that keeps a censorship-resistant network legally sane.

The worst content on the internet is overwhelmingly media: child sexual abuse material, non-consensual intimate images, pirated films. If that kind of file were written to a blockchain, nobody could ever remove it, and every node operator would be holding it. By keeping every image, video and sound file off chain, Riftn can take that material down completely and report it, the same day.

Words are different. Writing words is not a crime in itself: no string of characters is illegal to type. What the law cares about is intent and action, like threatening someone, defrauding them or harassing them. Those are already crimes, covered by laws that apply to the person who did them, wherever they did it. So nobody needs to censor a blockchain to keep it legal.

If anything, words on chain help. A minted post is permanent, timestamped and tied to a wallet. If someone uses words to threaten or to scam, the chain is not their accomplice. It is the evidence. **The chain stays uncensored, and the law deals with intent, the way it always has.** What Riftn's apps choose to show and pay for is a separate question, and that is what the moderation layer below is for.

## Decentralized and centralized moderation, together

Riftn runs both kinds of moderation at once, on purpose.

**The community layer (decentralized):**

- **Reports are weighted by standing.** Anyone can report a post for one of 11 reasons, from spam to child abuse. A badgeless account needs 5 reports to raise a community alert, while higher badges need fewer, down to 1 for Giant Tortoise and above. Long-standing members count for more, and new or throwaway accounts count for less.
- **The crowd can bury a post.** When dislikes outweigh likes and at least 2 separate accounts disliked it, the post leaves public feeds like Home and Explore. Nobody can bury anyone on their own, at any badge level. A buried post still stays on its author's profile, in the Following feed and on its own page.

**The personal layer (yours):**

- **Mute, block and keyword filters** decide what you see, and a **kids mode** tightens everything up.

**The central layer (us, for compliance):**

- **Moderators** review community alerts and reports, and can remove posts and media that break the rules or the law.
- **Curator accounts.** A short list of accounts set by the team can take a post out of public discovery with a dislike. Nothing is deleted, and the post stays on the author's profile.
- **Appeals.** If your post is removed or your account is warned, you can appeal and get a reference number, and the answer comes back to you.

The chain is the part nobody can take from you. The moderation layer is the part that keeps the app safe and legal to run. You need both.

## Why fully open source beats "fully decentralized"

If we had to choose between a perfectly decentralized network with closed code and a centralized one with fully open code, we would pick open code every time. Here is why.

- **You can check it.** Open code lets anyone verify what an app really does with your data, your money and your posts. Decentralization claims you cannot inspect are just marketing.
- **You can leave with it.** The Steemit story above is the proof. When the company was captured, the community copied the code and the data and walked out. That is the real safety net, and it only works when the code is public.
- **It is realistic.** As the reality check showed, nobody escapes DNS, clouds, app stores and internet providers completely. Publishing your code is something any team can do today.
- **Trust comes from openness.** Signal runs central servers, yet privacy experts trust it, because its code is public and its claims can be tested. Mastodon became the backbone of the fediverse because anyone could run it.
- **Decentralization without openness can still be a trap.** A network can be spread across thousands of nodes and still be controlled by whoever writes the only client nobody else can read.

That is the standard we hold ourselves to as well. Riftn's web and mobile apps are public, built in the open with [thousands of public commits](/guides/top-50-decentralized-social-apps-2026), and shaped by community requests on [riftn.com/features](https://riftn.com/features).

## The bottom line

- **Total decentralization of the pipes is a myth.** Every app on this list still leans on DNS, clouds, app stores and internet providers somewhere.
- **On-chain is not the same as decentralized.** If a founder dictates the platform, the chain does not save you.
- **The real test is control**: who sets the rules, who moderates, who builds, who owns it and who gets paid.
- **Riftn hands all of that to its users**: community governance and moderation, a roadmap anyone can prompt, and 100% of profit shared with stakers.
- **Words and follows on chain, media off chain** gives you a permanent, censorship-resistant record without turning the network into a home for the worst files on the internet.

Want to see the top of the spectrum from the inside? Open [riftn.com](https://riftn.com), mint a post, file a request on [the features page](https://riftn.com/features), and read your words back from the chain yourself. New here? Start with [What is Riftn?](/guides/what-is-dehub)`,
  bannerImage: '/media/decentralization-spectrum-banner-r2.jpg',
  bannerImageAlt: 'The decentralization spectrum: how decentralized can social media really get?',
  author: { name: 'Riftn Team' },
  publishedAt: '2026-11-13T22:00:00.000Z',
  tags: ['Decentralization', 'Decentralized Social Media', 'Open Source', 'Moderation', 'Blockchain', 'Riftn'],
  readingTime: 12,
  featured: false,
  status: 'published',
  seoTitle: 'The Decentralization Spectrum: How Decentralized Can Social Media Get?',
  seoDescription: '30 decentralized and crypto social apps ranked by who really controls them, from Bluesky and Farcaster to Nostr and Hive. Why on-chain is not the same as decentralized.',
};

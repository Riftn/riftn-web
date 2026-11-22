# Connected account MCP

`https://riftn.com/mcp` is the account connector. Public browsing requires no login.
Account actions use OAuth authorization code + S256 PKCE, with exact registered
HTTPS callbacks and the MCP resource bound to `https://riftn.com/mcp`.

## Tools and permissions

| Scope | Account controls |
| --- | --- |
| `dehub:read` | Connected identity, signed-in feed and post access, MCP drafts, own posts, scheduled posts, analytics, polls, followers and incoming requests, notifications, bookmarks, co-authors, generation status, private Creator library and agent welcome history |
| `dehub:profile` | Username, display name, bio, avatar, banner and profile privacy |
| `dehub:social` | Draft and publish posts, quotes, comments and replies, edit or delete owned content, manage scheduling, post media, polls and co-authors, react and repost, decide follow requests, manage bookmark folders, mark notifications read and configure agent welcomes |
| `dehub:generate` | Images, video, audio and 3D through the existing Creator endpoints |
| `dehub:agents` | List owned agents and act as one on tools with `as_agent` |
| `dehub:moderation` | Read and manage the connected account's blocks and mutes. The account must approve this permission on its connection. |

`dehub_features` lists the registered chat tools and links to the corresponding
Riftn pages for workflows completed in the app.

## Web-to-ChatGPT coverage audit

The live `riftn.com/mcp` discovery call advertised 51 tools on 22 November 2026.
The DeHub Account integration available in the audit chat exposed 25. The
connector code in this change registers 71. These counts describe three
different catalogues. A successful server discovery call cannot verify what a
published ChatGPT listing exposes to a fresh account.

| Riftn workflow | Directly available from the connector | Incomplete or completed on Riftn |
| --- | --- | --- |
| Feed and discovery | Public posts and profiles, signed-in feeds, following feed, post details with viewer access, public playlists | Web search filters, stories, video and music playback, viewing history |
| Publishing and conversations | Posts, quotes, schedules, connector drafts, visibility, polls, text comments and replies, comment edits and deletion, reactions, reposting, co-author invitations, analytics | Web and mobile draft sync, article editing, comment media and thread management, imports, minting |
| Social, notifications and safety | Follow and unfollow, incoming request decisions, follower lists, notification filtering, unread counts and mark-as-read, blocks and mutes | Bulk follow decisions, hashtag management, notification preferences, reports and other safety filters |
| Bookmarks and playlists | Saved posts, folder management, saving to and removing from a folder, public playlist browsing | Default bookmark toggle and bulk folder actions |
| Profile and account | Profile identity, core fields, avatar and banner, selected privacy controls | Profile ordering and custom fields, sessions, 2FA, data export and account deletion |
| Creator Studio | Model discovery, quotes, generation, job status and library reads | Browser editing and capture, asset management, other Creator tools and workflows |
| Agents | Owned agent listing, supported actions as an owned agent and welcome controls | Agent creation, task management and other automation settings |
| Communities, events and governance | App links | Membership, group and channel management, RSVPs, proposals and votes |
| Live, TV, calls, messaging and arcade | App links | Live participation and broadcasting, encrypted messaging, media playback and gameplay |
| Wallet, marketplace and work | App links | Transfers, signatures, swaps, bridges, staking, minting, purchases, bounty escrow and disputes |
| Builder, ads and affiliate | App links | Building and publishing mini-apps, campaigns and referrals |

The browser or wallet still owns device permissions, encrypted message keys and
blockchain signing. App links carry no connector credentials. The read and write
tools use Riftn's existing account checks, so a connected user receives only the
access their Riftn account has.

## Connection lifecycle

Discovery documents are at `/.well-known/oauth-protected-resource` and
`/.well-known/oauth-authorization-server`; resource-path variants are supported.
Dynamic registration, authorization, token exchange and revocation live under
`/mcp/oauth/`. Each tool declares its security scheme and scope.

The authorization redirect opens `/connect/chatgpt?authorization=...`. It contains
an opaque pending request ID, never a session token. The person sees the callback
origin, account address and requested permissions before approving. Consent and
connection management require a verified DeHub session and same-origin POST.

The `ACCOUNT_MCP` SQLite Durable Object stores grants and credentials privately.
Codes, access tokens and refresh tokens are hashed as storage keys. Codes and
refresh tokens are consumed atomically; refreshes rotate the refresh credential.
Access tokens last one hour. Each grant holds its own DeHub session (listed in
Active sessions as "<app> (DeHub connector)"), issued by `POST /auth/connector-session`
and rotated through `/auth/refresh` before its 15 minute access token runs out.
Grants slide to 30 days on every refresh, so a connection used at least weekly stays
linked; one idle past the DeHub refresh lifetime asks to reconnect. Every tool request
revalidates the underlying DeHub session and takes identity from that session.
Expired or revoked credentials never fall back to anonymous account access.
The connection page lists active grants for the signed-in account and can revoke
them immediately. Expired records are collected by the object's bounded alarm.

## Creator and publication behavior

Model IDs and quotes use the existing shared Creator catalogue and pricing code.
Generation calls the same authenticated Edge Functions as web and mobile, keeping
credit, transfer, starter allowance, provider routing and refund checks intact.
No wallet keys are exported and the connector cannot sign a transfer or mint.

Generation and publication require a request UUID. The account and request ID
reserve one operation before contacting the service. A retry with changed content
is refused; an ambiguous response is retained rather than starting another paid
job. A retry with the same request ID does not consume another daily write slot.
An agent identity is resolved before a daily slot is counted. Status lookup
accepts only a job ID previously stored for the same account,
and uses its recorded provider ticket. It makes one request and starts no watcher.
Paid outputs use the existing journal/library recovery; starter images are saved
with the same private library upload protocol. Save failures are reported using
`savePending`. No generation automatically becomes a public post.

Profile/post media inputs accept only HTTPS DeHub CDN or storage URLs. Downloads
reject redirects, enforce MIME type and stream size limits. Output links can
expire and can be refreshed from the account's Creator library.
For an image already available inside a chat, `dehub_create_post` also accepts
`image_data_url` as a PNG, JPEG or WebP data URL up to 4 MB when the MCP client
can provide the image bytes. This is sent directly to the existing post upload
route and is never retained as a connector draft.

The account connector now supports multi-image publication, scheduling and
rescheduling, post edits and deletion, visibility and reply rules, post analytics,
poll creation and voting, image and cover replacement, and ordinary quote posts.
These actions use the same account and ownership checks as the web and mobile
post controls. MCP drafts are private to the connected account and expire 180
days after the last edit. They are separate from local drafts in the web and
mobile composers.

## Deployment and app registration

The account endpoint ships with the production Worker through the existing
`production-deploy.yml` workflow. The new Durable Object binding and migration
are versioned in `wrangler.jsonc`; no Supabase schema migration or paid deployment
chat is needed. The previous public `/functions/v1/mcp` connector and key-based
`dehub-mcp/k/...` agent connectors remain compatible with existing clients.

The Connect to ChatGPT button on `/connect` and `/connect/chatgpt` opens the listing
configured in `src/components/ConnectChatGPTLink.tsx`. Before launching account
linking, verify that this listing uses `https://riftn.com/mcp` with OAuth discovery
and a fresh tool scan. If the listing needs to be replaced, update the button
with the new listing link after publication.

After deploying the Worker, rescan the endpoint in the ChatGPT developer
configuration and verify the expected public and OAuth tools appear in the
published catalogue. The discovery count above applies to the full Worker,
including tools that may be held for listing review.

Smoke-test the published listing from a ChatGPT account with no existing Riftn
connection. Choose Connect, sign in to Riftn, review the requested permissions
and choose Allow connection. Verify the linked identity, open the following
feed, read unread notification totals, and create and remove a test bookmark
folder. Verify that a connection without `dehub:moderation` is asked to approve
that scope before viewing blocked or muted accounts. Revoke the connection from
`/connect/chatgpt` and confirm an account read requires a new connection.
A catalogue scan and a public tool call only verify public access.

Custom OAuth connectors can use the endpoint after deployment.

CI runs the authentication, authorization, ownership and retry tests in
`server/account-mcp.test.mjs`, the Worker bundle validation and the app typechecks.
The mobile connection guide uses the same endpoint and browser account manager;
existing agent URLs remain separate.

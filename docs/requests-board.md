# Requests board (riftn.com/app/features)

How open requests are handled.

## Status meanings
- **Open**: new, not looked at yet.
- **Queued** (`in_progress`): accepted, but needs a store build or outside work. Leave it alone in sweeps.
- **Shipped**: live on web and in the app (or the platform it was about).
- **Declined**: will not be built.

## Rules
- No request should stay Open past the day after it was posted. Fix it, ship it and mark it Shipped, or reply on it.
- When a request needs more detail from the person who posted it, reply as **@assistant**:
  - a comment on the request, and
  - a direct message from @assistant (admin hub, Users, chat icon, "Send as @assistant").
- Do the same when it can't be checked here (for example an iPhone-only or Brave-only report): say what was tried, and ask for the exact device, app version, steps and a screenshot or recording.
- Never leave a request silent. Every request gets either a shipped change or a reply.
- When a request ships, reply as @assistant saying where to find it.

# Acro Arena · Reddit v0.2.1 preview

## New post architecture
- A moderator uses the subreddit ... menu **Create/Open Acro Arena Host Post** to create/open one headquarters post. It contains instructions, leaderboard, host management, and challenge publishing.
- The moderator pins/stickies HQ manually using Reddit's moderator post controls.
- Every challenge gets a **new Reddit custom post**: title, letters, theme, answer/vote/discussion/results and the winner's Player's Choice.
- The winner selecting the next theme publishes **the next post**, rather than adding a card to the old one.
- A challenge ends after 24 hours (5-minute scheduler) or host finish; no next post is made until the host or winner chooses. At most one live challenge at once.
- Shared points, users, hosts, and sequenced challenge numbers live in Redis per app installation. Scoring rules remain unchanged.
- Previous v0.1.x game posts are **not deleted or migrated**. They remain as legacy previews and will show a redirect instruction with the new code. Existing preview history remains in its v1 Redis key.
- Live Reddit playtest not yet verified for v0.2.0. Concurrent whole-game Redis writes still require hardening before public deployment.

## Local update
From the existing `acro-arena-reddit` checkout: `git pull`, copy `src` and `devvit.json`, `package.json` to your initialized `acro-arena` folder, then `npm install`, `npm run build`, `npm run dev`. Keep your existing Reddit app registration. Discord and BERATNAS untouched.

## Note
HQ pinning is a manual Reddit moderator action, not an automatic app operation.

## Reddit post creation limitation
Reddit's native top-right Create Post cannot be replaced by a Devvit action. The supported action appears in the subreddit's overflow (⋯) menu, and creates or opens the sole Headquarters custom post. The moderator can sticky this HQ post using Reddit's post moderation controls. Inside HQ, the Host Controls publish each new challenge as a separate Reddit custom post. Each challenge has only one Headquarters navigation button.

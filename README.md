# Acro Arena · Reddit v0.2.4 preview

## New post architecture
- A moderator uses the subreddit ... menu **Create/Open Acro Arena Host Post** to create/open one headquarters post. It contains a compact navigation and control panel, without an embedded challenge card.
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
Reddit's native top-right Create Post cannot be replaced by a Devvit action. The supported action appears in the subreddit's overflow (⋯) menu, and creates or opens the sole Headquarters custom post. The moderator can sticky this HQ post using Reddit's post moderation controls. Inside HQ, Create Challenge / Host publishes each new challenge as a separate Reddit custom post. Each challenge has only one Headquarters navigation button.

## HQ controls in v0.2.2
Headquarters opens with a compact top button bar only (no challenge panel beneath it). **New** and **Hot** follow Reddit's native subreddit feeds. **Best** ranks challenge posts by in-game ranked-vote totals; **On Theme** ranks them by in-game endorsements, without changing scores. The **Leaderboard** is shared, and **Create Challenge / Host** is visible only to authorized game hosts. Each new challenge remains an independent Reddit post.

## Removed-post recovery (v0.2.3)
Using the subreddit app action **Create/Open Acro Arena Host Post** now checks whether the stored HQ post was removed. If removed, it publishes a new HQ and updates its link **without resetting the game or scores**. On game load, challenge actions, and scheduler ticks, removed active challenge posts are marked dismissed, freeing the one active slot for a fresh challenge; answer history remains saved. Reddit lookup failures not confirmed as missing/removed raise an error rather than forcing deletion. The Create Challenge form explicitly explains an occupied slot. The old removed posts stay removed (the app does not approve or restore moderation decisions). Publishing validates the theme before creating the Reddit post.

## Integrated vote layout (0.2.4)
Each player answer is displayed alongside **1st**, **2nd**, and **On Theme** controls. One Save Vote action records the ranking; On Theme is an independent endorsement. Own answers cannot be voted on. A two-player contest can only choose first place; the second-place control appears when at least three distinct entries exist. Existing vote scores are preserved. The app keeps a compact standalone answer-editing form below the list.

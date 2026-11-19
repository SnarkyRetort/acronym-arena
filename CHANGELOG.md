# Reddit Acro Arena changelog

## 0.3.1 — Scoped acronym-header background

- Add a localized purple-nebula background behind the challenge letters and theme only.
- Keep letters, labels, and controls as real interactive UI instead of raster text.
- Do not change game state, hosting, scoring, or NSFW behavior.



## 0.3.0 — Player hosting, Winner's Choice, Reddit NSFW

- Every authenticated Reddit user may create one regular challenge (per-user limits rather than one globally).
- A win grants one non-stacking bonus Winner's Choice challenge slot, managed from Headquarters.
- Host/author ownership and 18+ NSFW status saved per challenge; native Reddit NSFW marker on post creation.
- New Headquarters dashboard with active challenges, player hosting slots, and participation status.
- Moderators retain oversight; hosts can finish or dismiss their own rounds.
- Keep the previous voting/point rules; unlock more regular slots through engagement is reserved for a later decision.



## 0.2.9 — Layered background and player status panels

- Add live text over layered dark-purple banner artwork and smoke-style CSS gradients.
- Display dynamic time-to-close, entries, and ballots in one responsive strip.
- Arrange Entry and Ballot as matching gold-edged panels, with explicit saved/editable status.
- Add a compact Edit Answer toggle; keep voting integrated beside entries.
- Responsive mobile stacking, no scoring or server persistence changes.



## 0.2.8 — Separate Devvit client/server TypeScript conditions

- Fix browser-only condition leaking into `@devvit/web/server` exports.
- Split client, server, and test TypeScript checks, each with appropriate types.
- Preserve v0.2.5 artwork, Reddit posts, and existing scoring.



## 0.2.7 — Fix Devvit client TypeScript configuration

- Resolve `@devvit/web/client` with browser conditional exports so `navigateTo` is typed.
- Add Vite client declarations for CSS imports.
- Allow `.ts` extensions in the Node test file with noEmit.
- No scoring, gameplay, or artwork changes.



## 0.2.6 — Windows/Devvit build recovery

- Correct `reddit.getPostById` TypeScript post-ID type.
- Fix `npm test` glob that silently executed zero tests on Windows.
- Document removing stale scaffold files and reinstalling exact package dependencies.
- Preserve v0.2.5 Discord artwork and unchanged scores.



## 0.2.5 — Original Acro Arena artwork and Discord-inspired styling

- Bundle the original gold/purple microphone/crown/laurel/dice banner with the Devvit client.
- Rebuild challenge presentation around ornate gold borders, prominent letters, themed divider and compact status bar.
- Number answer cards while retaining interactive First, Second and On Theme controls.
- Give Headquarters a matching, smaller visual identity; keep game and scores unchanged.



## 0.2.4 — Vote on the answer itself

- Present entries as compact cards with adjacent First, Second, and On Theme controls.
- Replace disconnected voting dropdowns with a single Save/Update Vote action.
- Display existing ballot selections when returning to a challenge.
- Move answer entry/editing below the voting list to reduce scrolling.
- Keep underlying scoring and vote rules unchanged.



## 0.2.3 — Recover removed Headquarters / challenge posts

- Create/Open Host Post detects removed HQ posts and replaces the public post without resetting scores or hosts.
- Detect removed active challenge posts, dismiss the stale active record and reopen challenge creation.
- Explain the disabled Publish button when the one active slot is occupied.
- Validate theme before posting to avoid orphan Reddit posts.
- Preserve Discord and prior Reddit records; no scoring changes.



## 0.2.2 — Compact HQ control panel

- Remove the in-HQ current-challenge panel entirely; keep only navigation controls on the HQ home view.
- Add native Reddit New and Hot browse buttons, plus in-game Best/On Theme rankings.
- Keep shared Leaderboard and host-only Create Challenge controls.
- Retain one new Reddit post per challenge and unchanged scoring.



## 0.2.1 — Host-post creation clarity

- Rename subreddit app action Create/Open Acro Arena Host Post; reuse the existing HQ.
- Remove duplicate Headquarters button from challenge panels.
- Preserve separate challenge posts, scoring, and existing data.



## 0.2.0 — Headquarters and separate challenge posts

- New dedicated HQ post for rules, leaderboard, and controls.
- Every challenge is created as an individual Reddit post, navigable from HQ.
- Player’s Choice publishes a new post, not a dashboard slot.
- Global game/score state shared across all challenge posts in Devvit Redis.
- Retain old 0.1.x data separately; no automatic deletion or score migration.
- Keep one active challenge at a time; scoring unchanged.


## 0.1.1 — One live challenge at a time

- Limit a Reddit game post to a single active challenge; update dashboard and host controls.
- Preserve sequential challenge IDs and existing scoring.
- On first load, archive excess live challenges from the five-board preview without deleting their historical data.
- Add regression tests for the single-challenge limit and migration.


## 0.1.0 — Devvit port preview

Initial independent Devvit Web + React + Redis port of the Discord 3.5.4 gameplay. 8/8 logic tests passed. Unverified in the live Reddit environment; see README for migration and parity gaps. Discord project remains unchanged.
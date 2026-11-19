# Reddit Acro Arena changelog

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
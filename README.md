# Acro Arena — Reddit Devvit port (0.1.0 preview)

This is an **independent Reddit port** of the Discord Acro Arena 3.5.4 rules. Discord is untouched. The port is on the `reddit-devvit` branch of `SnarkyRetort/acronym-arena` (not master).

## Implemented (preview)

- One Reddit app post containing up to **five simultaneous challenges** with permanent sequence numbers and reusable slots.
- 24-hour challenges, deadline scheduler (five-minute tick) and automatic closing.
- Reddit-identity-bound private entry and editing, with strict initial-letter validation.
- Ranking votes: first +3, second +1; no self-voting; edits until closing; vote opens with two contributors.
- On Theme endorsement toggle, each worth +5 to the author.
- Shared in-app discussion per challenge, automatically read-only when challenge finishes/dismisses.
- Winner +25 and one-hour Player's Choice of next theme and independent AI rule.
- **🤖 AI OK** vs **🧠 AI FREE · HONOR SYSTEM**, selectable by hosts and winners.
- Host-only create challenge, finish, dismiss, add host; owner of Reddit game post initially owns Host capability.
- Leaderboard, Reddit usernames, persistent Redis storage; scoring held at the existing provisional formula.
- Purple/gold compact responsive challenge cards; no Discord dependency.

## Not yet equivalent / known differences

- **Not yet deployed or confirmed in live Devvit playtest.** Eight pure-game-logic tests pass. Build/dependency installation couldn't be verified in the authoring runtime.
- Dashboard currently uses responsive HTML cards rather than the exact dynamically rendered Discord artwork. The original Discord banner and PNG generator are not transferred to the Reddit runtime yet.
- Discussion is inside the app post; it does not create separate Reddit comment threads.
- The Discord bot's special themed-board mix and Rapid Fire extension need follow-up; this preview offers host-selected theme for every board.
- No score migration from Discord's local SQLite database. Scoring is intentionally frozen for later redesign. Current points are held in Devvit Redis **per subreddit installation**.
- There are no atomic transactions around concurrent whole-game Redis updates yet; simultaneous players could overwrite progress. This must be hardened before a public launch.
- Reddit-specific moderator verification/permissions need final audit; game-host privileges are granted by the moderator who creates the post. Post creators should remain trusted.
- No public app distribution or release promised.

## Run on Windows

Clone the `reddit-devvit` branch in a separate directory; don't overwrite `F:\Acronym` or `beratnas-rpg`.

```powershell
git clone --branch reddit-devvit https://github.com/SnarkyRetort/acronym-arena.git acroarena-reddit
cd acroarena-reddit
npm install
npm test
npm run test:types
npm run dev
```

**Before playtest:** Devvit app names are unique. `devvit.json` currently specifies `acro-arena-reddit`; if already claimed, replace it with an available name. Change `dev.subreddit` to the intended test subreddit before running. Keep the BERATNAS app separate.

For packaging, `npm run build`, then `devvit upload` once tested. Running `npm run dev` requires Reddit CLI login.

## Version and scope

Reddit port 0.1.0 preview. Existing Discord Acro Arena 3.5.4 is unaffected.
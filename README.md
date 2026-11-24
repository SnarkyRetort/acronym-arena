# Acro Arena

**Acro Arena** is a multiplayer acronym-writing and voting game for Reddit communities, built with Reddit's Devvit platform. Each challenge gives players a series of letters and, optionally, a theme. Players write a phrase whose words begin with those letters, then vote for the funniest or most creative entries. Challenges appear as individual interactive Reddit posts; the Headquarters post links to current rounds, player rankings, and completed-game highlights.

Acro Arena is an independent community game, not an official Reddit product. It is designed for Reddit users and moderators who enjoy quick wordplay, competition, and community challenges.

## Current development status — November 24, 2026

**Stage: working Reddit Devvit playtest; preparing to request public review.** The app has **not been confirmed submitted or approved** for Reddit's public App Directory. The latest confirmed successful Reddit playtest startup was **Devvit v0.0.1.158**, using the `acro-arena` playtest app on `r/acro_arena_dev`. The package identifies itself as **4.0.0-alpha.3**; these are different version identifiers.

- **Repository:** `SnarkyRetort/acronym-arena` (private); active branch `reddit-v4-alpha`. The older `reddit-devvit` branch is separate.
- **Local Windows checkout:** `C:\Users\Steven Shaffer\acro-arena-v4`.
- **Playtest URL:** https://www.reddit.com/r/acro_arena_dev/?playtest=acro-arena
- **Verified locally, twice on November 24:** `npm run test:types` succeeded; `npm test` reported **44 passing, 0 failing**; `npm run build` succeeded. These checks were run after the countdown/leaderboard fixes through commit `d7db336`.
- **Previously exercised:** a local Redis 1,500-player simulation completed 4,500 actions with no reported failures or conflicts. This is load-test evidence, **not** a production Reddit concurrency guarantee.
- **Playtest startup confirmed:** `npm run dev` ran `devvit playtest`, reported a successful update and **Playtest ready** at `v0.0.1.158`. It also logged `EADDRINUSE` for local port 5678, but continued successfully.
- **Current UI changes:** a remaining-round clock is displayed in challenge feed posts, expanded challenges, and Headquarters live listings; expanded game has its own larger countdown. Leaderboard views now receive server-authoritative scoring details rather than recalculating from spoiler-filtered game snapshots. A final visual confirmation across mobile, desktop, and all game states is not documented.
- **Real two-account playtesting:** multiple acronym challenges were entered and voted on. An authorized early finish and winner award were performed on Challenge #43. The earlier discrepancy between **136 leaderboard points and 154 Hall of Fame points** prompted the subsequent scoring-data fix; the user indicated the playtest seemed fine, but matching totals have not been independently documented after the fix.
- **Submission status:** README preparation is complete. A command to publish for public review was supplied, but **no successful `devvit publish --public` terminal output, review receipt, or approval is recorded**.

### Immediate next action

From a **new PowerShell window** (the playtest terminal can remain running):

```powershell
cd "C:\Users\Steven Shaffer\acro-arena-v4"
git pull origin reddit-v4-alpha
npm run test:types
npm test
npm run build
npx devvit publish --public
```

The `publish --public` command **requests review**; it does not mean approval or public installation is immediate. Follow the Devvit CLI prompts and retain its output. If the CLI reports a missing upload, changed requirements, or missing app details, follow those prompts instead of treating submission as complete. Verify the current published app state in the [Reddit Developer Portal](https://developers.reddit.com/apps).

### Known verification limits

- Tests and Vite builds passed; they do not prove the deployed Reddit environment has no runtime, moderation, or accessibility issues.
- The 1,500-player stress result was simulated against local Redis, not Reddit's hosted Devvit environment.
- Screen-by-screen visual confirmation of timers and identical scoreboard totals is still useful before wider rollout.
- Current README and app configuration should be kept synchronized with any subsequent changes to scoring, moderation, or review requirements.

## How to play

1. Open an Acro Arena challenge post from your feed or the Headquarters.
2. For a timed-entry challenge, choose **Play** to reveal the letters and begin your personal answer clock, or **Just Vote** to skip entering and vote instead. The choice is final.
3. Write one word for each letter, in order, and submit before your answer timer expires. Some standard challenges allow answer editing; timed-entry and Blitz entries lock when submitted.
4. Once at least two different players have entered, eligible players may cast one vote for another person's answer. You cannot vote for yourself. You may change your vote while voting remains open.
5. Where available, use **On Theme** to recognize an answer that fits the topic. This is a separate endorsement/achievement, not another ordinary vote.
6. Check the visible round countdown, results, and leaderboards. At the end of a round, the highest eligible vote-getter wins; tied first places do not receive an outright winner bonus.
7. A winner receives one non-stacking **Winner's Choice** opportunity to host a bonus challenge and choose its theme.

The game includes regular rounds, timed personal-entry rounds, and Blitz challenges with separate answer and voting phases. Rounds may be configured for 1, 4, 8, or 24 hours. A challenge can also be finished or dismissed early by an authorized host/moderator.

## Scoring and rankings

The game tracks participation (hosting, submitting, voting, endorsing, and limited discussion activity), votes earned, theme endorsements, podium placements, and an outright winner bonus of 25 points. The Theme Leader achievement is separate from the ordinary vote winner. The Headquarters includes a shared Leaderboard and Hall of Fame; Hall of Fame answer highlights feature completed challenges only.

All vote/entry scores in this game are **in-app points**, not Reddit karma or Reddit post upvotes. Each player can vote once per challenge, and self-voting is blocked.

## For moderators and hosts

- Install and configure Acro Arena in a subreddit through Reddit's Developer Platform. The app uses Reddit and Redis permissions to create challenge posts and store game state.
- From the subreddit's **⋯** menu, select **Create/Open Acro Arena Host Post**. Pin that Headquarters post manually with Reddit's moderator tools.
- From Headquarters, players may create a regular challenge, subject to their available host slot. A regular player has one active regular slot; moderators may have up to ten.
- A completed challenge may grant its winner a temporary, non-stacking bonus hosting opportunity. The winner can select a theme and AI-assistance mode for the follow-up challenge.
- Moderator controls include finishing/dismissing rounds and configuring **Auto Arena**, which maintains a target number of active challenges (off by default). Auto Arena's default target is 10 live challenges and uses a weighted distribution of 3-, 4-, and 5-letter acronyms.
- Challenges can be tagged NSFW when created. Moderators remain responsible for enforcing subreddit and Reddit content rules, including removing inappropriate posts or entries.
- The app posts separate custom challenge posts; it does not automatically sticky Headquarters or replace Reddit's native Create Post action.

## Data and moderation notes

Acro Arena uses Reddit usernames and gameplay actions to maintain entries, ballots, discussions, rankings, and results in the installation's Devvit Redis storage. Game answers and results are visible to other players according to the round's reveal rules. Timed entries hide letters and other players' answers until a player has entered, chosen Just Vote, or their attempt has ended. Headquarters hides active-round answers. No purchases are required. User-generated answers and discussions are subject to Reddit and community moderation.

## Setup, testing, and publishing

This source project uses Node.js 22 or newer, Devvit 0.15.3, React, TypeScript, and Vite.

```powershell
npm install
npm run test:types
npm test
npm run build
npm run dev
```

For the local playtest, Devvit uses the development subreddit configured in `devvit.json` (`r/acro_arena_dev`). The confirmed test URL is https://www.reddit.com/r/acro_arena_dev/?playtest=acro-arena. The app's moderator menu can create the Headquarters post; sample rounds can then be hosted and played by separate Reddit accounts. Verify the compact feed view, expanded game, countdowns, voting, scores, moderation, and mobile layout before release.

After reviewing Reddit's current Devvit Rules and confirming that the test version behaves correctly, submit for public App Directory review with:

```powershell
npx devvit publish --public
```

Public publishing **requests Reddit's review**. It does not make the app instantly available in other communities. The Devvit CLI and Reddit Developer Portal show submission status.

## Support and feedback

Report gameplay bugs, abusive content, or other concerns to the moderators of the community hosting the game, or contact the developer through Reddit. App source: [SnarkyRetort/acronym-arena](https://github.com/SnarkyRetort/acronym-arena) (private development repository).

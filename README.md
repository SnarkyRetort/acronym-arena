# Acro Arena

**Acro Arena** is a multiplayer acronym-writing and voting game for Reddit communities, built with Reddit's Devvit platform. Each challenge gives players a series of letters and, optionally, a theme. Players write a phrase whose words begin with those letters, then vote for the funniest or most creative entries. Challenges appear as individual interactive Reddit posts; the Headquarters post links to current rounds, player rankings, and completed-game highlights.

Acro Arena is an independent community game, not an official Reddit product. It is designed for Reddit users and moderators who enjoy quick wordplay, competition, and community challenges.

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

For the local playtest, Devvit uses the development subreddit configured in `devvit.json` (`r/acro_arena_dev`). The app's moderator menu can create the Headquarters post; sample rounds can then be hosted and played by separate Reddit accounts. Verify the compact feed view, expanded game, countdowns, voting, scores, moderation, and mobile layout before release.

After reviewing Reddit's current Devvit Rules and confirming that the test version behaves correctly, submit for public App Directory review with:

```powershell
npx devvit publish --public
```

Public publishing **requests Reddit's review**. It does not make the app instantly available in other communities. The Devvit CLI and Reddit Developer Portal show submission status.

## Support and feedback

Report gameplay bugs, abusive content, or other concerns to the moderators of the community hosting the game, or contact the developer through Reddit. App source: [SnarkyRetort/acronym-arena](https://github.com/SnarkyRetort/acronym-arena) (private development repository).

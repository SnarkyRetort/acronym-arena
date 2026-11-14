# Acro Arena 3.2 — Daily Game Update

This package is a **complete replacement for the bot code** from 3.1. It retains `/acronym` slash commands, existing Discord bot credentials, server hosts, old records, and historical scores. It is not a Vortex mod. **Rapid Fire is deliberately postponed** until this daily update is tested in Discord.

## Install on Windows (`F:\Acronym`)

**1. Stop the running 3.1 bot** in PowerShell with `Ctrl+C`. Ensure only one copy of the bot is running.

**2. Make a backup of BOTH the program and the live SQLite database before upgrading:**

```powershell
cd F:\Acronym
Copy-Item .\bot.py .\bot-v3.1-backup.py
if (Test-Path .\acronym_game.sqlite3) {
    Copy-Item .\acronym_game.sqlite3 .\acronym_game.pre-3.2.sqlite3
}
```

Your previously downloaded 3.1 ZIP is also useful as a program rollback copy. **It does not contain your current scores.** Keep `.env` and `acronym_game.pre-3.2.sqlite3` private and safe.

**3. Unzip this package, then copy `bot.py` and `themes.py` to `F:\Acronym`**. Also replace `requirements.txt` if desired. Leave your existing `.env` and `acronym_game.sqlite3` untouched.

**4. Start:**

```powershell
cd F:\Acronym
py -m pip install -r requirements.txt
py bot.py
```

You should see `Commands synced to server ...` if `GUILD_ID` is configured in `.env`. As with 3.1, leave PowerShell/the Python process running while the bot is hosted on your computer.

**5. Discord:** In the game channel run `/acronym start`. It reuses the five boards and refreshes the pinned dashboard. Use `/acronym help` for commands and rules.

## Daily Arena 3.2 rules

- Five independent 24-hour boards. **Boards 1 and 2 are themed**, Boards 3–5 are unrestricted. Existing 3.1 boards with entries remain unrestricted until they are replaced, to avoid changing their prompts mid-round.
- Random 3–7 letters, with weighted selection. A host can set **Easy, Standard, Chaos** *for the next replacement* in a slot using `/acronym difficulty`.
- **Submissions and voting overlap.** Voting unlocks as soon as **two distinct entrants** submit. New entries and edited answers remain allowed until that board’s 24-hour deadline.
- Vote for one other person's anonymous answer, **Pass**, or change your vote before the deadline. Players cannot vote for themselves. A third person can vote without entering.
- On themed boards, **On Theme** is a *separate endorsement*, independent of Vote/Pass. A person can mark multiple other entries as on-theme, but not their own. One or more endorsements earns the author a **single +5 theme bonus** when the board closes. Endorsements may be toggled until the deadline.
- **Scoring:** +1 on first submission; +5 once per on-theme entry; **+25 for a sole winner** of the Daily board. Ties or zero votes receive no winner bonus. Old scores remain unchanged.
- Each board closes independently at the deadline. A host can close early with `/acronym solve board:1` or `/acronym finish board:1` as long as 2 players entered. Other boards continue unaffected.
- At the end of a **themed** board with a winner, the board enters **Champion's Choice** for **one hour**. The winner runs `/acronym champion` and picks from three privately displayed themes. After one hour, a random option is chosen. The new board then gets a full 24 hours. Unthemed board replacements (and themed boards without winners) happen immediately.
- The theme bank starts with **100 curated themes** across 10 categories. Players can suggest new ones; Arena Hosts approve or reject.
- Hall of Fame archives winning entries; player profiles display on-theme awards and achievement titles. The original Help Center, dashboards, host permissions, scoring records and leaderboard remain available.
- Optional private reminders: `/acronym notifications enabled:true` (or `false`). Discord DMs must be open to receive them.

## Commands

| Who | Command | When to use it |
| --- | --- | --- |
| Everyone | `/acronym help` | Open interactive rules/help |
| Everyone | `/acronym boards`, `/acronym status`, `/acronym progress` | Browse boards/status/private progress |
| Everyone | `/acronym leaderboard`, `/acronym profile` | See points and achievements |
| Everyone | `/acronym classics` | Hall of Fame |
| Everyone | `/acronym suggest_theme`, `/acronym my_suggestions` | Propose/check new themes |
| Everyone | `/acronym notifications` | Toggle voluntary private reminders |
| Champion | `/acronym champion board:1` | Pick the next theme on a waiting themed board |
| Host | `/acronym start` | Start/recover the five boards |
| Host | `/acronym solve board:1` | Finish an eligible board early (reveals results) |
| Host | `/acronym vote board:1`, `/acronym finish board:1` | Legacy manual-finish aliases; no separate voting phase |
| Host | `/acronym pause board:1`, `/acronym resume board:1` | Freeze/resume one timer |
| Host | `/acronym difficulty board:1 level:Standard` | Set difficulty for the **next** letters |
| Host | `/acronym theme_queue`, `/acronym theme_approve`, `/acronym theme_reject` | Approve community themes |
| Owner/admin | `/acronym host_add`, `/acronym host_remove` | Grant/revoke host access |

All existing commands remain under `/acronym`. Dashboard buttons also open private boards, entries, voting, Pass, and on-theme endorsement controls.

## Migration and rollback

On the first 3.2 start, existing tables/points are preserved and new tables are added. Active old 3.1 boards that were in the **separate voting phase** move to the new **combined entry/voting phase** with a new 24-hour deadline; existing votes and submissions are retained. An old active board with existing entries will not be retroactively assigned a theme.

To roll back: stop 3.2, restore the 3.1 `bot.py` from your saved ZIP, and **also restore the matching `acronym_game.pre-3.2.sqlite3` as `acronym_game.sqlite3`**. That database rollback discards 3.2 activity, so make a copy of the newer database first if you might want to recover those newer points. Simply replacing the Python file after 3.2 has introduced a pending Champion's Choice board can leave that board stuck in the older bot.

## Tests

Run `py test_v32.py` to exercise fresh and legacy database migrations, 2-entry voting, participation deduplication, Pass, on-theme scoring, sole winner bonus, Champion's Choice, replacement boards, and preservation of old scores. Python syntax checks also pass. **The actual Discord UI and 24-hour scheduled execution have not been live-tested against your server**, so begin by testing one board with your friends.

Keep your Discord token in `.env`, never in screenshots or uploaded ZIPs. No token is included in this archive.

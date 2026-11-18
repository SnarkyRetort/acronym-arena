# Acro Arena v3.5.0 — Unified Challenge Cards

A Discord acronym game with up to five concurrent 24-hour challenges. The five *slots* are still used internally by host `/acronym finish` and `/acronym champion`, but player-facing challenge numbers are permanent database round IDs.

**Every active challenge is one persistent Discord message.** That message contains a dynamically rendered PNG with the purple/gold banner at the top, challenge number, large letters and theme, all player submissions, and live score counts. Real Discord buttons below the artwork open input, ranked voting, on-theme marking, comments and Player's Choice. Voting and comments update that one message without publishing additional answer cards.

The public legacy dashboard is removed on startup, because `/acronym boards` already provides an ephemeral overview. Legacy individual answer posts are removed *after all active unified posts update successfully*. Previous entry, vote, score, comment and thread metadata are preserved in SQLite. Finished challenge posts are deleted from the active channel; a result announcement remains, and the points and history remain in SQLite. Winner's choice is available on the card until the next challenge is created.

## Setup

Run with Python 3.14, discord.py >= 2.7.1, python-dotenv, and Pillow. Existing `.env` and `acronym_game.sqlite3` in `F:\Acronym` stay in place. Launch with `py bot.py` from `F:\Acronym`.

## Release scope

No modifications to `arena_core.py` gameplay, timing, vote or scoring rules. Keep only one running process. The startup log prints the number of active challenge posts successfully refreshed. Discord API calls and migration still require live verification.
# Acro Arena changelog

## v3.5.0 — Unified Challenge Cards (2026-11-18)

- One persistent bot message per active challenge, rather than one question card plus separate answer cards.
- Dynamic purple/gold artwork with banner across the top; enlarged letters and themed prompt; all player answers, first/second votes, comments and on-theme counts.
- Real Discord buttons for entering/editing, voting through private menus, discussions, leaderboard, and winner's Player's Choice.
- Permanent challenge numbers based on existing SQLite round IDs, while retaining internal five-slot concurrency.
- Every successful entry/vote/mark/comment redraws the same card.
- Finished challenge messages are deleted from the active channel after results, while preserving game data and winner's choice flow.
- Removes legacy public dashboard; retired separate answer messages are deleted only after successful card migration.
- Adds Pillow renderer and offline 0/3/25-player artwork tests.
- Existing database, `.env`, points, voting rules, and previous history preserved.
- Offline test suites pass. Live Discord migration and button interactions require validation after installation.

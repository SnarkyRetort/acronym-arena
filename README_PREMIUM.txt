ACRO ARENA 3.4 — PREMIUM VISUAL UPDATE

Uses the existing working 3.4 codebase; doesn't reset rounds, scores, threads, or credentials.

Changes
- Cinematic purple/gold Acro Arena banner on the persistent single post.
- Cleaner hierarchy in public single and answer cards; dynamic counts, game phase, and Discord timestamps.
- Existing public single message IDs and answer-card IDs are preserved.
- On the first edit, the bot attaches the banner to an existing persistent single post.
- Pinned player buttons, voting, thread comments, and timers remain functional.
- Repairs a known Theme Auto Select bug (old code incorrectly read the button as a theme menu).

Discord limitation: Discord renders the embedded banner image below embed text fields, not above them.
This version prioritizes preserving real buttons and database history over an untested Components V2 migration.

Run the installer after stopping the existing bot with Ctrl+C.
Installer first tests staging code, backs up the existing bot and live SQLite database,
installs new program files, and launches py bot.py.

If cards fail to post due to Discord channel access, this update does not modify server permissions.
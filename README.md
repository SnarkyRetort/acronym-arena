# Acro Arena v3.5.1

## One challenge, one public post

Acro Arena is a Discord acronym game with up to five simultaneous 24-hour challenges. Each challenge has a permanent numeric ID, a branded purple/gold card, its acronym and theme, a list of player answers, and live scores. There are no new public answer cards for every entry.

Players use the buttons on the public card; no slash command is needed. **Open Challenge** shows a private, dismissible personal status panel, where they can enter or edit an answer, vote, check standings or jump to the public discussion. **Quick Vote** opens the ranked voting menu directly. **Discussion** opens a single thread for the entire challenge. **Player's Choice** appears for the winner after scoring.

Arena Hosts can use the private **Host: Manage** panel to **Finish & Score** or **Dismiss Challenge**. Dismissing asks for confirmation and saves the historical data without awarding a winner. The slash commands `/acronym start`, `/acronym finish`, and `/acronym dismiss` remain for hosts. The **Arena Host** Discord role is recognized alongside the existing stored host list and server administrators.

The existing SQLite `acronym_game.sqlite3` and `.env` in `F:\Acronym` are preserved. The installer checks the release before copying anything, backs up the current bot code and SQLite, and starts the new version. The application requires Python, `discord.py>=2.7.1,<3`, `python-dotenv`, and `Pillow>=10,<13`.

## Test boundaries

Five offline tests cover previous gameplay and card migrations plus new challenge status, shared-thread persistence, dismissal and restart. The Discord API interaction remains to be tested live. Use the printed startup refresh count to confirm that each active challenge post successfully updated.

## Release information

Version: **3.5.1**. See `CHANGELOG.md` for the complete list of changes and known limits. No new passwords, tokens, or live database files belong in GitHub.
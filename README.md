# Acro Arena

Discord bot for independent 24-hour acronym singles, ranked voting, conversation threads, and a premium purple-and-gold presentation.

**Current source version: 3.4.2** (recovered from the Premium installation package used on November 18, 2026).

Run from the install directory: `py bot.py`. Set `DISCORD_TOKEN` and `GUILD_ID` in a local `.env` file. Never commit `.env` or live databases.

Run offline regression tests: `py test_v33.py`, `py test_v34.py`, `py test_single_posts.py`, `py test_premium_visual.py`.

See [CHANGELOG.md](CHANGELOG.md) and [VERSION](VERSION). Every deployed change gets a new version and its own Git commit.

Note: GitHub source at 3.4.2 does not automatically replace the already-running Windows bot. The source version shown in startup changes after deployment of this commit.
# Acro Arena v3.5.3

Discord acronym game with one persistent challenge card and one shared Discussion thread per challenge.

Players open the challenge card for a private dismissible menu, enter answers, vote, and discuss. Arena Hosts start/finish/dismiss challenges; the winner's Player's Choice menu selects the next theme and **AI ON/OFF** independently. Every challenge shows its AI rule as **HONOR SYSTEM**.

The bot archives old per-answer discussions on startup and archives a challenge's unified thread when it finishes or is dismissed. Archived conversations are retained. No database reset is required.

## Run

With Python packages from `requirements.txt`, run `py bot.py` from `F:\Acronym`. Use the versioned installer for updates; preserve your `.env` and `acronym_game.sqlite3`.

## Release checks

`py test_v33.py`, `py test_v34.py`, `py test_single_posts.py`, `py test_v35.py`, `py test_v351.py`, `py test_v352.py`.
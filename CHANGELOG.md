# Acro Arena release notes

## v3.5.1 — One-Card Challenge Controls (2026-11-18)

Based on committed v3.5.0. This is a single, versioned deployment containing all agreed interface refinements:

- Retains one persistent purple-and-gold public card per active challenge. It displays the challenge number, enlarged letters and theme, every player's answer, and score counts.
- Public actions: **Open Challenge**, **Quick Vote**, **Discussion**, and **Player's Choice**. No separate public answer cards.
- **Open Challenge** presents a dismissible, private interaction panel with the player's entered/voted status and Enter/Edit, Vote, Discussion and Standings actions.
- **Discussion** opens/links exactly one shared Discord thread for the challenge. Its thread ID is saved for reuse across restarts.
- **Arena Host** controls are available privately: Finish & Score and Dismiss Challenge, with a confirmation before dismissing. Host-only `/acronym dismiss` is also available.
- Dismissal cancels an open challenge without awarding a winner, removes it from active games, releases its internal slot, and preserves existing records and scores.
- Players can play with buttons; slash commands are not required. Existing host/utility commands remain available.
- Restored recognition of the human **Arena Host** Discord role.
- Uses sequential database round IDs for permanent challenge numbers. The five simultaneous slots are internal.
- Refreshes existing posts in place and prints count of update successes/failures at startup.

### Validation and limits

- Passed `test_v33.py`, `test_v34.py`, `test_single_posts.py`, `test_v35.py`, and `test_v351.py` offline.
- Live Discord callbacks, thread permissions, and attachment updates still need verification on the user's server. The test environment does not have the Discord library, so these are not claimed as live-tested.
- Discussion is a normal Discord thread: messages there are public. Existing per-entry comment award rules remain in the database, but thread messages are not automatically awarded points by this update.
- This release does not add an archive browser or custom full-screen application UI.
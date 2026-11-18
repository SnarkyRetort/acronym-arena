# Acro Arena changelog

## v3.5.2 — AI rules & discussion hygiene (2026-11-18)

- Preserves the approved purple-and-gold challenge artwork and unified card.
- Shows **AI ON/OFF · HONOR SYSTEM** prominently at the bottom of every live challenge image and in the shared post status.
- Shows the same rule in each player's private challenge panel and the answer-entry form.
- Challenge starters (Arena Hosts) select AI when starting and can change it in the theme menu before launch.
- Player's Choice winners can now independently toggle AI ON/OFF in their next-theme menu, including Custom Theme and Auto Select.
- The AI choice is fixed in the database for the lifetime of each newly created challenge.
- Automatically archives the unified Discussion thread when the challenge fully ends or is dismissed. Winner-choice challenges remain active until the next challenge starts or the choice expires.
- Archives legacy per-answer discussion threads from earlier versions at startup; all messages remain in Discord history.
- New regression test checks toggle and archive hooks and persisted AI choice; no scoring or voting rule changes.

### Validation

- Offline source/database/renderer tests only. Verify Discord's archive permissions and private menu callbacks live after installing.
- Source of truth: GitHub `master`, with `VERSION` set to `3.5.2`.
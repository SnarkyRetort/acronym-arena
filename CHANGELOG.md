# Acro Arena changelog

## 3.4.2 — Top banner, versioned cards and themed submission (2026-11-18)

- Main single posts use Discord Components V2: illustrated banner at top, live game text below, buttons inside the same card.
- Existing single posts are converted in place, preserving their message IDs and round mapping.
- Entry submission modal displays the round theme in its title and correct letters in its input label; removed mismatched example.
- Entry cards display the actual release version in their footer; main posts display version in their small-print line.
- Upgrade retains live database, prior entries, votes, threads and configured credentials.
- Bot startup reports how many active single posts were successfully updated versus failed.
- Runtime requires discord.py >= 2.7.1.
- Offline static and gameplay tests pass. Live Discord migration has not yet been verified.

# Acro Arena changelog

## 3.4.1 — Premium visual update (2026-11-18)

- Added a purple-and-gold banner to persistent single-game posts.
- Improved the hierarchy of single and answer cards while retaining live scores and native Discord controls.
- Preserved existing round, entry, message, and thread mappings on edits.
- Repaired the theme Auto Select callback.
- Updated displayed bot version to 3.4.1.
- No changes to the scoring model, voting rules, or database records.

### Known issues / validation

- Static/offline suites pass; an on-server verification is still required.
- Permissions previously prevented edits to an existing single; this must be retested on Discord.
- Submission form does not yet show the theme; that improvement is NOT part of 3.4.1.

## Historical development

- 3.4.0: persistent single posts and entry cards (recovered from installation packages).
- 3.3.x: independent singles and round control (recovered from installation packages).
- 3.2: original GitHub baseline.

History before 3.4.1 is reconstructed from available packages, not falsely claimed as previously tagged GitHub releases.
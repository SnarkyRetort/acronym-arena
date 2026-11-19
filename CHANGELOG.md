# Reddit Acro Arena changelog

## 0.1.1 — One live challenge at a time

- Limit a Reddit game post to a single active challenge; update dashboard and host controls.
- Preserve sequential challenge IDs and existing scoring.
- On first load, archive excess live challenges from the five-board preview without deleting their historical data.
- Add regression tests for the single-challenge limit and migration.


## 0.1.0 — Devvit port preview

Initial independent Devvit Web + React + Redis port of the Discord 3.5.4 gameplay. 8/8 logic tests passed. Unverified in the live Reddit environment; see README for migration and parity gaps. Discord project remains unchanged.
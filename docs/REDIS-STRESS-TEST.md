# Acro Arena real-Redis transaction stress test

This is an **offline, disposable** test. It does not create Reddit users or send requests to a live Reddit/Devvit app. It does use a real local Redis server and concurrent independent TCP clients executing Redis WATCH/MULTI/EXEC against the same game key.

## Requirements
- Node.js >=22 and `npm install`
- Docker Desktop running, OR another **local-only** Redis server bound to 127.0.0.1:6380
- The default is `redis://127.0.0.1:6380`; remote Redis URLs are rejected.

## Start disposable Redis (PowerShell)
```powershell
docker run -d --rm --name acro-redis-stress -p 127.0.0.1:6380:6379 redis:7-alpine
```
If an identically named container already exists, use `docker start acro-redis-stress` instead.

## Run
```powershell
npm install
npm run test:types
npm run test:redis -- --players=25 --concurrency=5
npm run test:redis -- --players=250 --concurrency=25
npm run test:redis -- --players=1500 --concurrency=50
```
For a collision stress, raise `--concurrency` to 100. The retry limit defaults to production's eight attempts. To compare alternate retry budgets, use `--attempts=16` (test-only, does not change production).

## Read the report
- `conflicts`: failed WATCH/EXEC commits that required a fresh read/retry
- `failed`: requests that could not complete within the retry budget
- `latencyMs.p95`: 95th-percentile per-user action time
- `storedEntries`, `storedVotes`: actual persisted result read back from Redis
- `assertions`: persisted-data validation (no duplicate users, no lost successful votes, score accuracy)
- `PASS` requires **all users' actions** to succeed *and* a consistent stored result.

The runner isolates keys with a random per-run namespace and deletes those keys at the end. It uses locally created in-memory usernames and no Reddit logins. Each worker maintains a separate Redis client (WATCH is connection-scoped). Failed entry requests are filled into the vote-phase fixture so that voting remains independently testable; those fixture fills are **not counted** as successful submissions.

## Stop local Redis
```powershell
docker stop acro-redis-stress
```

## Limits
The stress harness uses the same shared optimistic retry helper as the actual Acro Arena server, and it mirrors the server's watched key, merged-vote and whole-game write flow. It is not a live Devvit HTTP/Reddit test. It cannot determine platform quotas, production Redis latency, or Reddit scheduling capacity.

A high conflict count / busy errors suggests reducing write contention by splitting entries or tally updates out of the whole-game key, rather than merely increasing retry attempts.

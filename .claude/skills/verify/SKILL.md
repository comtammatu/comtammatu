---
name: verify
description: Run full verification pipeline (typecheck + build). Use after making code changes or before committing.
whenToUse: After code changes, before committing, when user says "verify", "check", or "does it build"
allowed-tools: Bash(pnpm *)
---

Run full verification:

1. `pnpm typecheck` — all 5 packages must pass
2. `pnpm build` — production build (needs env placeholders)

!`echo "Packages:" && ls packages/`

## On failure

- Read the error output carefully
- Diagnose root cause — don't guess
- Fix and re-run
- If stuck after 2 attempts, report to user

## On success

Report: "✅ typecheck (5/5) + build pass"

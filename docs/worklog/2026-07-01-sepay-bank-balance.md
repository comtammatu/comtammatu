# SePay Bank Balance - 2026-07-01

Reconciled-through 18d060cb

Skill plan: repo rules = engineering + skills + database + ui + workflow + team; external skills = supabase + supabase-postgres-best-practices; runtime tools = CodeGraph + shell; skipped = new DB table/migration because `webhook_events` already stores signed, idempotent SePay payloads.

PM: Scope is `/finance` bank-account balance and its drilldown. Done means the bank card uses SePay webhook movement for both money in and money out, and opens a SePay transaction list.

BA: Signed SePay webhook rows are bank-ledger evidence even when order matching fails. `transferType='in'` increases bank balance, `transferType='out'` decreases it, from the owner-set opening date.

Senior Dev: Reuse `webhook_events(provider='sepay')`; keep payment settlement RPC unchanged. Add a small parser/helper and read-only route under `/finance/bank-transactions`.

QA/QC: Add a runnable parser test for plus/minus movement and a static check that finance realtime listens to SePay webhook events. Run targeted web tests, then typecheck/lint/build if the dirty tree allows it.

Verification: targeted finance/SePay tests pass; `corepack pnpm typecheck`, `corepack pnpm lint`, and `corepack pnpm build` pass. Full `corepack pnpm test` remains blocked by pre-existing Employee/HR static-contract failures outside this finance scope.

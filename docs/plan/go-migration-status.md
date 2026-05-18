# Go + Postgres Migration — Status Tracker

**Goal:** complete migration to Golang + Postgres, off Node.js + Supabase.
**Started:** 2026-05-14. **Status:** in progress — Phase A core done, B/C in flight.

This is a multi-phase program of work (estimated multi-week/multi-month). It is
NOT completable in a single session. This file tracks the arc so progress
survives across sessions.

---

## Phase A — Identity unification (`public.users` canonical)

Make `public.users` the single identity table so the Go backend's order/payment/
void RPC paths work end-to-end for Go-native users (previously blocked: `*_by`
FKs pointed at Supabase `profiles`, which Go users were not in).

| Step | Status | Evidence |
|------|--------|----------|
| A1 — inventory: 29 FKs → `profiles`, 91 RPC files, 182 `auth.uid()` files | DONE | this session |
| A2 — extend `public.users` to a column-superset of `profiles` | DONE | commit `d9f6bd73` |
| A3 — repoint 29 FKs → `public.users(uuid)`; `profiles` becomes a VIEW; 4 writer fns bridged with INSTEAD OF triggers | DONE | commit `47b2ffe8` |
| A4 — audit Go RPC call-sites use `db.WithAuthContext` (not just the payment paths) | DONE | all 5 `SELECT public.<rpc>` handler call-sites wrap in WithAuthContext (`orders/handler.go:189`, `orders/handler.go:390`, `orders/payment_momo.go:124`, `orders/shifts.go:47`, `payments/handler.go:130`). Webhook `complete_payment_and_consume_stock` takes explicit `p_actor_id UUID` — no `auth.uid()` use. Notifications handler inlines tenant-scoped SQL with explicit `claims.UserUUID`. |
| A5 — verify order/payment/void work end-to-end for a Go-native user locally | IN PROGRESS | agent `ac0bea0b` |

**Prod-apply-time owner review (flagged by A3):** backfill `user_role` derivation
(currently placeholder `'waiter'`), and `password_hash` source (`auth.users.
encrypted_password` not exposed in the local stub).

## Phase B — Port 7 unmigrated modules to Go (~21k LOC)

Inventory (~10.5k), Finance/GL (~3.1k), HR/Payroll (~1.45k), Employee
self-service (~650), Feedback/CRM (~700 + crons), Print-agent (~3.4k daemon),
HĐĐT e-invoice (~400). All currently zero Go code.

| Step | Status |
|------|--------|
| Execution plan (`docs/plan/go-migration-phase-B-module-ports.md`) | DONE — commit `8fa1a6f3` (3 waves, ~24d; print-agent stays Node) |
| Wave 1 — Employee + HR/Payroll + Feedback/CRM (parallelizable) | DONE — Employee (`b5159be2`, 8 routes), HR (`cb31ecf1`, 26 active + 3 deferred routes), Feedback (`7f781634`, 17 routes) ported. Go-native cron scheduler scaffold landed (`ff2e30b7`, `internal/cron/`, robfig/cron/v3 with pg_advisory_lock guard; 4 stub jobs registered). Three follow-ups: (1) port `packages/shared/src/payroll/calculate.ts` to Go (unblocks the 3 deferred 501 payroll-compute endpoints in `/hr/payroll`), (2) R2 storage client (unblocks /r/{token}/photos), (3) wire TELEGRAM_BOT_TOKEN through config (unblocks Telegram test endpoint). |
| Wave 2 — Finance/GL + HĐĐT | DONE — Finance (~1500 LOC, 37 routes across handler/finance/{handler,util,revenue,reports,chart_of_accounts,journals,periods,posting_rules,summary_invoices}.go; ~19 auth.uid() RPCs wrapped in WithAuthContext) + HDDT (3 admin routes + real cron body backed by `backend/internal/hddt/RunDailySummaryForBranch`). MISA/Viettel provider HTTP call remains deferred (credentials blocked — tracked in tasks/todo.md). Single commit covering both because main.go mount file is shared; smoke-test.sh extended in a follow-up commit. |
| Wave 3 — Inventory (104 endpoints, split 3 ways) + print-agent's 5 Go endpoints | NOT STARTED — XL effort (10-14 dev-days). Plan splits across 3 parallel agents (procurement / stocktake / remaining). Phase B plan §"Inventory" lists 13 sub-files. Recommended dedicated session. |

## Phase C — Go-native realtime

Replace Supabase Realtime: `LISTEN/NOTIFY` triggers on the 11 realtime tables →
Go LISTEN loop → existing in-process Hub (`backend/internal/realtime/hub.go`) →
WebSocket endpoint. Wire into `main.go`.

| Step | Status |
|------|--------|
| Triggers migration + LISTEN loop + WS endpoint + main.go wiring | IN PROGRESS (agent) |

## Phase D — Frontend rewire off Supabase

Replace ~64 remaining `supabase.rpc()` / `.from()` / `.channel()` call-sites
in `apps/web` (down from ~74 baseline after Wave 1+2 rewired some) with Go API
calls (`goFetch`) + the new WS realtime client. Includes the deferred US-508
POS `payment-actions.ts` rewire.

| Step | Status |
|------|--------|
| All sub-steps | NOT STARTED — needs dedicated session. ~5-7 dev-days. Inventory (~25 sites), Finance dashboard (~15), HR pages (~10), Feedback admin (~8), remaining surface (~6). Mechanical port once Wave 3 is done. |

## Phase E — DB cutover, drop Supabase platform

Auth issuance, storage → Cloudflare R2, pg_cron jobs, drop PostgREST +
Supabase containers. Final cutover.

| Step | Status |
|------|--------|
| Auth issuance decision | DECIDED — **Go-native HS256 JWT** (vs self-hosted GoTrue). Reuses existing `public.users.password_hash` (bcrypt) + `cfg.JWTSecret`. No extra container. Path: replace Supabase `signInWithPassword` + `getSession` in `apps/web` with a thin Go BE `/auth/login` + cookie session. The Go BE already issues JWTs (see `backend/internal/handler/auth/login.go`); FE just needs to consume them in place of Supabase tokens. |
| Storage (R2) | NOT STARTED — needs S3-compatible client in `backend/internal/storage/`. Unblocks `/r/{token}/photos` + inventory attachments + GRN evidence. ~2 dev-days. |
| pg_cron → Go cron bodies | PARTIAL — scheduler scaffold + 4 stubs registered (`ff2e30b7`); 1 body filled (HDDTDailySummary, Wave 2). 3 stubs remaining: feedback_daily_report, feedback_retention, telegram_flush. ~2 dev-days. |
| Drop PostgREST + Supabase containers | NOT STARTED — gated on all above + Phase D. |

---

## Reference artifacts (this migration)

- `docs/runbooks/db-migration/migration-completeness-debate-2026-05-14.md` — the
  audit verdict + the critical-escalation analysis that scoped this work.
- `docs/runbooks/db-migration/supabase-coupling-audit-2026-05-14.md` — 74
  Supabase coupling points (the Phase D backlog).
- `docs/runbooks/db-migration/00-inventory.md` — repo-source DB inventory.
- `docs/plan/db-migration-supabase-to-postgres.md` — the original master plan.
- `tasks/todo.md` — "Go BE migration audit — deferrals" section.

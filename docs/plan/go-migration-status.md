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
| A4 — audit Go RPC call-sites use `db.WithAuthContext` (not just the payment paths) | TODO | gated on Phase C build settling |
| A5 — verify order/payment/void work end-to-end for a Go-native user locally | TODO | gated on A4 |

**Prod-apply-time owner review (flagged by A3):** backfill `user_role` derivation
(currently placeholder `'waiter'`), and `password_hash` source (`auth.users.
encrypted_password` not exposed in the local stub).

## Phase B — Port 7 unmigrated modules to Go (~21k LOC)

Inventory (~10.5k), Finance/GL (~3.1k), HR/Payroll (~1.45k), Employee
self-service (~650), Feedback/CRM (~700 + crons), Print-agent (~3.4k daemon),
HĐĐT e-invoice (~400). All currently zero Go code.

| Step | Status |
|------|--------|
| Execution plan (`docs/plan/go-migration-phase-B-module-ports.md`) | IN PROGRESS (planner agent) |
| Module ports | NOT STARTED — gated on the plan + Phase A complete |

## Phase C — Go-native realtime

Replace Supabase Realtime: `LISTEN/NOTIFY` triggers on the 11 realtime tables →
Go LISTEN loop → existing in-process Hub (`backend/internal/realtime/hub.go`) →
WebSocket endpoint. Wire into `main.go`.

| Step | Status |
|------|--------|
| Triggers migration + LISTEN loop + WS endpoint + main.go wiring | IN PROGRESS (agent) |

## Phase D — Frontend rewire off Supabase

Replace ~74 `supabase.rpc()` / `.from()` / `.channel()` call-sites in `apps/web`
with Go API calls (`goFetch`) + the new WS realtime client. Includes the
deferred US-508 POS `payment-actions.ts` rewire.

| Step | Status |
|------|--------|
| All sub-steps | NOT STARTED — gated on Phases A, B, C |

## Phase E — DB cutover, drop Supabase platform

Auth issuance (GoTrue self-hosted or Go-native), storage → Cloudflare R2,
pg_cron jobs, drop PostgREST + Supabase containers. Final cutover.

| Step | Status |
|------|--------|
| All sub-steps | NOT STARTED — gated on Phases A–D |

---

## Reference artifacts (this migration)

- `docs/runbooks/db-migration/migration-completeness-debate-2026-05-14.md` — the
  audit verdict + the critical-escalation analysis that scoped this work.
- `docs/runbooks/db-migration/supabase-coupling-audit-2026-05-14.md` — 74
  Supabase coupling points (the Phase D backlog).
- `docs/runbooks/db-migration/00-inventory.md` — repo-source DB inventory.
- `docs/plan/db-migration-supabase-to-postgres.md` — the original master plan.
- `tasks/todo.md` — "Go BE migration audit — deferrals" section.

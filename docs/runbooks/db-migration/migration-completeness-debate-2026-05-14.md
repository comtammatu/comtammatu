# Migration-Completeness Debate — Verdict (US-Q03)

**Question:** Is 100% of the old Next.js/Supabase backend's functional AND non-functional behaviour migrated to the new Go backend?

**Date:** 2026-05-14
**Method:** Two agents argued opposing cases from the two verified context docs + source
(`.omc/debate-A-prosecution.md`, `.omc/debate-B-defense.md`). The orchestrator then
**adjudicated every disputed claim against actual source code** — neither side's
rhetoric was accepted on trust (the prior `.omc/handoff-2026-05-13-night.md` explicitly
warned that an earlier gap report carried unverified claims).

---

## 1. Final Verdict

| Scope | Migrated | Verdict |
|-------|----------|---------|
| **Whole app** (old Node BE = ~85 server-action files + 10 API routes + print-agent daemon) | **~35–40%** | NOT migrated |
| **Intended POS-core scope** (auth, orders, payments, menu, staff, settings, kds, notifications, webhooks) | **structurally ~90%, but with real functional + security + runtime gaps** | NOT 100% |
| **DB on Postgres without Supabase** | local Go stack runs on plain Postgres (US-Q02 proved it), but **131 SECURITY DEFINER RPCs depend on `auth.uid()`** and break on pgxpool — see BUG-02 | NOT severed |

**Bottom line: the migration is NOT 100% — not for the whole app, and not even for the
POS-core slice.** The prosecution overstated (its single "strongest argument" was factually
wrong — see D1 below). The defense was too generous (it certified all 9 modules "faithful"
without catching the void-order, ACL, branch-scope, and runtime-payment gaps). The truth,
verified against source, is in between and is documented below.

---

## 2. Adjudicated Findings — Disputed Claims

| # | Claim (prosecution) | Defense position | Source ruling | Evidence |
|---|---------------------|------------------|---------------|----------|
| D1 | Go `create_order` is a bare INSERT — never calls `route_order_to_kds`; KDS screens stay blank ("CRITICAL", "single strongest argument") | "Orders FAITHFUL" | **FALSE.** `createOrder` calls `SELECT public.create_order($1..$9)` — the *same* RPC the old BE calls. The RPC does order+items+status-history+KDS routing atomically. | `backend/internal/handler/orders/handler.go:174-192` |
| D2 | `create_order` drops `order_status_history` + modifiers/sides | — | **FALSE for create.** Items go in as JSONB to the RPC; the RPC owns history. | `handler.go:167-187` |
| D3 | `voidOrder` is a bare UPDATE, no status-history write | (not addressed) | **TRUE.** `voidOrder` does `UPDATE public.orders SET status='cancelled'` directly — not via RPC. No `order_status_history` INSERT; no trigger writes it (`20260405070000_create_orders.sql` triggers are only `updated_at`). Old BE voids via a server-side RPC. | `handler.go:211-213`; `order-actions.ts:803` |
| D4 | `PUT /br/{branchId}/orders/{id}` listed as migrated but route doesn't exist | — | **TRUE but low-value.** No `r.Put("/{id}")` in `Routes()`. But the *prior gap report* invented this route; real mutation paths (`POST /{id}/items`, `PATCH .../serve`, `DELETE /{id}`) exist. Reclassify as "gap-report inaccuracy", not a missing feature. | `handler.go:29-39` |
| D5 | Cash payment path skips `complete_payment_and_consume_stock` → inventory desync | "FAITHFUL" | **MOOT / superseded.** `confirmCashPayment` calls `create_payment` RPC; the schema has a `20260426030000_auto_complete_paid_order` trigger that auto-completes paid orders. But it doesn't matter — BUG-02 means the cash path 500s before any of this runs. | `handler.go:372-383`; QA BUG-02 |
| D6 | Module ACL (`RequireModule`) defined but "not currently enforced" | "ACL FAITHFUL — role constants mirrored" | **TRUE.** `grep` shows `RequireModule` has **zero call-sites** anywhere. `RequirePermission` IS used — but only in `menu`, `staff`, `settings` handlers. `orders`, `payments`, `kds`, `notifications`, `webhooks` have **no permission gate at all** (constructed `New(pool)` with no evaluator). | `middleware/auth.go:48`; `cmd/server/main.go:80-103`; grep |
| D7 | No branch-scope check — cashier with JWT `branch_id=1` can call `/br/2/...` | (not addressed) | **TRUE.** No middleware compares JWT `branch_id` to URL `branchId`. Handlers filter `WHERE branch_id = $urlBranchID AND tenant_id = $jwtTenantID` — same-tenant cross-branch reads are possible. Old BE blocked this in `proxy.ts:230-264`. | `middleware/auth.go`; `handler.go:45-47,60-67` |
| D8 | Realtime Hub is dead code — `hub.go` exists, not mounted | "Phase 0.5 scaffolding — tracked, not a regression" | **TRUE — both are right.** `main.go` imports nothing from `internal/realtime`; no WS endpoint, no LISTEN loop. It IS tracked Phase-0.5 work. Classify: real gap, legitimately deferred. | `cmd/server/main.go`; `hub.go` |
| D9 | ~13 whole modules unmigrated (~19,000+ LOC) | "explicitly deferred, never in scope" | **TRUE — both are right.** Inventory/finance/HR/employee/feedback/print/hddt/cron have zero Go code. They WERE deferred by prior owner instruction. But the question asked is "100%", so they count as gaps — just *known, intentional* ones. | `apps/web/app/{inventory,finance,hr,employee}/*`; `apps/print-agent/` |
| D10 | Prior "90%+ migrated" claim is a sampling error | — | **TRUE.** The prior report audited 11 API routes + 1 action file, ignoring ~75 server-action files. "90%+" was 90% of the *sampled* surface, not the real surface. | `.omc/migration-gap-report.md:3-8` |

---

## 3. Confirmed Functional Gaps (within the 9 "migrated" modules)

| ID | Gap | Severity | Fixable this cycle? |
|----|-----|----------|---------------------|
| G-F1 | `voidOrder` bypasses `order_status_history` audit trail (D3) | HIGH | YES — route through an RPC or add history INSERT |
| G-F2 | No fine-grained permission gate on `orders`, `payments`, `kds`, `notifications`, `webhooks` (D6) | HIGH | YES — add `RequirePermission` per route |
| G-F3 | KDS station-settings, printer-settings, network-config, attendance-settings have no Go handler | MEDIUM | DEFER — those are settings sub-modules, multi-handler work |
| G-F4 | Menu: combo "available sides" management not in Go | MEDIUM | DEFER |

## 4. Confirmed Non-Functional Gaps

| ID | Gap | Severity | Fixable this cycle? |
|----|-----|----------|---------------------|
| G-N1 | **Module ACL (`RequireModule`) has zero call-sites** — coarse role gate unenforced (D6) | HIGH | YES — wire `RequireModule` in `main.go` per route group |
| G-N2 | **No branch-scope guard** — same-tenant cross-branch access possible (D7) | HIGH | YES — add branch-scope middleware |
| G-N3 | Realtime Hub unmounted — no WS endpoint, no LISTEN loop (D8) | HIGH | DEFER — Phase 0.5 continuation, multi-day |
| G-N4 | No rate limiting in Go middleware stack | MEDIUM | DEFER — needs infra decision (no Upstash in Go) |
| G-N5 | ABAC 5-min cache TTL → revoked permissions stay live up to 5 min | MEDIUM | DEFER — design tradeoff, needs owner call |
| G-N6 | `/auth/login` issues a non-Supabase JWT, "for testing only" per the Go doc | MEDIUM | DEFER — tied to the GoTrue/auth decision in DB-exit plan §3.A |

## 5. Confirmed Runtime Bugs (from live QA, US-Q05, health 72/100)

| ID | Bug | Severity | Fixable this cycle? |
|----|-----|----------|---------------------|
| BUG-01 | `signToken` (`login.go`) never sets JWT `sub` → `UserUUID=""` → `::uuid` cast throws → `GET /notifications/unread-count` + `read-all` return 500 | CRITICAL | YES |
| BUG-02 | `create_payment` / `confirm_vietqr_payment` RPCs call `auth.uid()` internally → NULL on pgxpool → `RAISE 'not_authenticated' SQLSTATE 28000` → **every POS payment flow 500s at runtime** | CRITICAL | YES — set JWT-claims session var per RPC txn so `auth.uid()` resolves |
| BUG-03 | KDS handler reads `branchId` from `?branchId=` query param instead of the URL path param → `GET /br/2/kds/tickets` 400s | HIGH | YES |

## 6. Unmigrated Modules (intentional deferrals — but still "not 100%")

Inventory (~10,500 LOC), Finance/GL (~3,100), HR/Payroll (~1,450), Employee self-service
(~650), Feedback/CRM (~700 + 4 cron), Print-agent daemon (~3,400), HĐĐT e-invoice (~400),
POS discounts/refunds/service-charge (~1,300). **All have zero Go code.** All were deferred
by prior owner instruction — they are *known* gaps, not surprises. Migrating them is a
multi-month effort, out of scope for this audit cycle. Tracked in `tasks/todo.md`.

---

## 7. What This Cycle Fixes vs Defers

**Fix now (US-Q04 + US-Q06):** BUG-01, BUG-02, BUG-03, G-F1 (void status history),
G-F2 (permission gates on ungated handlers), G-N1 (wire module ACL), G-N2 (branch-scope guard).

**Defer (with reasons, → `tasks/todo.md`):** all unmigrated ERP modules; realtime Hub
wiring (Phase 0.5 continuation); rate limiting (infra decision); ABAC TTL (owner call);
`/auth/login` production-readiness (DB-exit §3.A); KDS/printer/network settings sub-modules;
menu combo sides; the whole FE rewire (still calls `supabase.rpc()` — see
`.omc/supabase-coupling-audit.md`).

**Verdict restated:** The Go backend is a *faithful structural port of the POS-core slice*
that delegates to the same Postgres RPCs as the old BE — but it is **not 100% migrated**,
it has **2 critical runtime bugs that break payments and notifications**, and it has
**real security gaps** (unenforced module ACL, no branch-scope guard). "100% migrated to
Golang with all DB on Postgres without Supabase" is **months away**, gated on: the ERP
module ports, the realtime rebuild, the FE rewire, and severing the 131 `auth.uid()`-bound RPCs.

---

## 8. Fix-Cycle Outcome (US-Q04 + US-Q06) + CRITICAL escalation

### 8.1 Fixed and committed this cycle

| ID | Fix | Commit |
|----|-----|--------|
| BUG-03 | KDS reads `branchId` from URL path, not query param | `c6117eac` |
| BUG-01 | `public.users.uuid` column + login sets JWT `sub` claim | `b4f54aff` |
| BUG-02 | `WithAuthContext` sets JWT-claims session var so `auth.uid()` resolves on pgxpool; `28000`→401 mapping | `a4ce4d1b` |
| G-N1 + G-N2 | `RequireModule` wired into every route group; new `RequireBranchScope` middleware blocks cross-branch access | `d64339a1` |
| G-F2 | Fine-grained `RequirePermission` gates on orders/payments/kds/notifications handlers | _(in progress)_ |

### 8.2 CRITICAL escalation — Go-native identity vs Supabase `profiles` is unreconciled

**Discovered while attempting G-F1 (route `voidOrder` through the `cancel_order` RPC).**
Verified against the seeded DB:

- `orders.created_by`, `payments.created_by`, `order_status_history.changed_by` **all FK to `public.profiles`**.
- The seeded `profiles` table has **0 rows**.
- The Go owner user's uuid (`a6464521-…`, from `public.users`) **is not in `profiles`** (`in_profiles = f`).
- `cancel_order(p_order_id, p_reason)` resolves the actor's tenant/branch/role by
  `SELECT … FROM public.profiles WHERE id = auth.uid()`.

**Consequence:** BUG-02's session-var fix is *code-correct* (it makes `auth.uid()` return
the JWT `sub`), but the RPC paths still cannot work end-to-end for a **Go-native** user:
`create_order` / `create_payment` will hit a **FK violation** on `created_by` (uuid not in
`profiles`), and `cancel_order` finds **no profile row** and raises. The Go BE's
order/payment/void flows only function for users that already exist in `profiles`
(i.e. Supabase-authed users) — not for users created via the Go `public.users` table.

**This is an owner-level architectural decision, not a bug fix.** It is DB-exit plan
§3.A territory. The options:
- **A — `profiles` stays the identity table:** Go login must authenticate against
  `profiles` (+ a credentials table), not `public.users`. Contradicts the
  `20260511000000_go_backend_users.sql` comment "Go backend owns authentication."
- **B — `public.users` becomes the identity table:** repoint **every** `*_by` FK from
  `profiles` to `public.users` and rewrite the ~131 `profiles`-resolving RPCs. Massive.
- **C — bridge:** seed `profiles` rows mirroring `public.users` (uuid as `id`) during the
  migration window and keep them in sync. A cutover-window hack.

**G-F1 is therefore DEFERRED:** routing `voidOrder` through `cancel_order` would call a
function that is broken for Go-native users. The current bare `UPDATE` — though it skips
the audit trail — is *less* broken than calling a failing RPC. G-F1 cannot be safely
resolved until the identity-model decision (A/B/C) is made.

### 8.3 Deferred (with reasons) — tracked in `tasks/todo.md`

Identity-model decision (§8.2); G-F1 (blocked on §8.2); realtime Hub wiring (Phase 0.5
continuation, multi-day); rate limiting (infra decision — no Upstash in Go); ABAC 5-min
TTL (design tradeoff, owner call); `/auth/login` production-readiness (tied to §8.2/§3.A);
KDS-station/printer/network/attendance settings sub-modules; menu combo "available sides";
all 7 unmigrated ERP modules (inventory, finance, HR, employee, feedback, print, hddt,
cron — ~21,000 LOC); the whole FE rewire (still calls `supabase.rpc()` — 74 blocking
call-sites per `.omc/supabase-coupling-audit.md`).

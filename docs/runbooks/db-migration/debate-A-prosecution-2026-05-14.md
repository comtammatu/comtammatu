# Debate Round 1 — PROSECUTION: Migration Is NOT 100% Complete

**Task:** US-Q03 — "Is 100% of the old Next.js/Supabase backend's functional AND non-functional behaviour migrated to the new Go backend?"

**Position:** NO. The migration is materially incomplete. The evidence below establishes ~35–40% of old-BE surface area is in Go; the "90%+" prior claim covers only 11 API routes while ignoring ~75 server-action files and 8 entire business modules.

---

## 1. Executive Summary

### Estimated Migration Percentage: ~35–40%

**Basis for the estimate:**

The prior gap report (`migration-gap-report.md`) audited 11 API routes and 1 server-action file, then claimed "90%+". That is a sampling error. The actual old BE surface area is:

- **Server-action files:** ~75 files across inventory (17 files), finance (8 files), HR (6 files), employee self-service (4 files), menu (2 files), feedback (5 files), orders (7 files within POS), print (1 file), settings (9 files), staff (2 files) — most only partially addressed.
- **API route files:** 10 files (`apps/web/app/api/**/route.ts`).
- The Go backend has **9 handler packages** covering a subset of functionality.

By file count and LOC:
- Inventory alone: 10,504 LOC across 17 action files — **0 lines in Go**.
- Finance/GL: 3,110 LOC across 8 action files — **0 lines in Go**.
- HR/payroll: 1,448 LOC across 6 action files — **0 lines in Go**.
- Employee self-service: 652 LOC across 4 action files — **0 lines in Go**.
- Feedback/CRM: ~386 LOC public-facing + 4 cron routes — **0 lines in Go**.
- Print agent daemon: 3,408+ LOC (separate `apps/print-agent/`) — **0 lines in Go**.
- POS-side actions not yet rewired (payment-actions.ts 1,597 LOC; order-actions.ts 1,972 LOC; discount, service-charge, session, print, menu-limits): **still calling Supabase RPCs directly**.

The Go backend covers auth, CRUD for menu/staff/settings/orders/KDS/notifications/payments — the structural skeleton — but none of the operational modules (inventory, finance, HR, employee, feedback, print) that represent the majority of LOC and business complexity.

---

## 2. Unmigrated Modules Table

All modules below have **zero Go counterpart** in `backend/internal/handler/` or anywhere in the Go codebase.

| Module | Old BE Files | LOC (approx) | Go Handler? | Prior Report Label |
|--------|-------------|-------------|-------------|-------------------|
| **Inventory** (stock, GRN, procurement, transfers, stocktake, waste, variance, production, suppliers, supplier returns, purchase orders, issues, trust) | `apps/web/app/inventory/actions.ts`, `grn-actions.ts`, `procurement-actions.ts`, `purchase-order-actions.ts`, `supplier-actions.ts`, `supplier-return-actions.ts`, `transfer-actions.ts`, `stocktake-actions.ts`, `waste-actions.ts`, `variance-actions.ts`, `production-actions.ts`, `issue-actions.ts`, `dashboard-actions.ts`, `report-actions.ts`, `inventory-value-actions.ts`, `document-correction-actions.ts`, `trust-actions.ts`, `settings/thresholds/actions.ts` + migrations `20260406310000_stock.sql` + 6 more migration files + `supabase/migrations/*inventory*` | **10,504** | **NONE** | "Out of scope" |
| **Finance / General Ledger** (chart of accounts, journal entries, period closure, posting rules, reconciliation, financial statements, HĐĐT summary invoices) | `apps/web/app/finance/actions.ts`, `accounting-actions.ts`, `chart-of-accounts-actions.ts`, `journal-actions.ts`, `period-actions.ts`, `posting-rules-actions.ts`, `reconciliation-actions.ts`, `statement-actions.ts`, `summary-invoice-actions.ts` + migrations `20260406330000_finance.sql` + 5 more | **3,110** | **NONE** | "Out of scope" |
| **HR / Payroll** (contracts, payroll calculation, payroll reports, shift assignments, shift requests) | `apps/web/app/hr/actions.ts`, `contract-actions.ts`, `payroll-actions.ts`, `payroll-report-actions.ts`, `shift-assignment-actions.ts`, `shift-request-actions.ts` + migration `20260406320000_hr.sql` | **1,448** | **NONE** | "Out of scope" |
| **Employee Self-Service** (clock in/out, profile, schedule, shift register) | `apps/web/app/employee/clock/actions.ts` (381 LOC), `profile/actions.ts` (47), `schedule/actions.ts` (90), `shift-register/actions.ts` (134) | **652** | **NONE** | Not mentioned in prior report |
| **Feedback / CRM** (customer QR, AI enrichment, daily reports, retention cleanup, Telegram) | `apps/web/app/r/[token]/actions.ts` (163), `actions-photos.ts` (169), `apps/web/app/admin/feedback/actions.ts`, `qr/actions.ts`, `reports/actions.ts`, `settings/actions.ts` + 4 API cron routes | **~700+** | **NONE** | "Out of scope / cron" |
| **Print Agent Daemon** (ESC/POS receipts, kitchen tickets, shift-close reports, printer management, branch-presence heartbeat) | `apps/print-agent/src/index.ts` + `escpos.ts` + `escpos-bitmap.ts` + `lan.ts` + `vietqr.ts` + `apps/web/app/api/branch-presence/route.ts` + `apps/web/app/admin/settings/printers/actions.ts` + `jobs/actions.ts` (316 LOC) | **3,408+** | **NONE** | "Out of scope" |
| **HĐĐT / E-Invoice** (daily summary worker, Misa/Viettel provider integration) | `apps/web/app/api/cron/hddt-daily-summary/route.ts` + `finance/summary-invoice-actions.ts` (191 LOC) | **~400** | **NONE** | "Out of scope / cron" |
| **Orders Refunds** | `apps/web/app/orders/refund-actions.ts` (377 LOC) | **377** | **NONE** | Not mentioned in prior report |
| **POS Discounts** | `apps/web/app/br/[branchId]/pos/discount-actions.ts` (693 LOC) | **693** | **NONE** | Not mentioned |
| **POS Service Charge** | `apps/web/app/br/[branchId]/pos/service-charge-actions.ts` (206 LOC) | **206** | **NONE** | Not mentioned |
| **Admin Dashboard** | `apps/web/app/admin/dashboard/actions.ts` | **~100** | **NONE** | Not mentioned |
| **Vercel Cron Infrastructure** (4 jobs: feedback-daily-report, feedback-retention, telegram-flush, hddt-daily-summary) | `apps/web/app/api/cron/*/route.ts` (4 files) | **~600** | **NONE** | "Out of scope" |
| **Realtime / WebSocket** (KDS live updates, daily-limit live quota, kitchen_send_batches subscriptions) | `supabase/migrations/20260407110000_kds_tickets.sql:78`, `20260517000000_branch_menu_daily_limits_realtime.sql`, `20260513001000_kitchen_send_batches_realtime.sql` | N/A | **Hub exists but NOT mounted** | Not mentioned |

**Total unmigrated modules: 13** (counting Realtime as a cross-cutting gap).

Evidence that the prior report missed all of these: `migration-gap-report.md:3` states "**11 API routes audited** (all in `apps/web/app/api/**`) + **1 server action file**". It systematically excluded the 75 server-action files and standalone `apps/print-agent/`.

---

## 3. Faithfulness Gaps Within the 9 "Migrated" Modules

Even within the 9 modules the Go backend does cover, specific behaviours from the old BE are dropped or diverge.

| # | Module | Old BE Reference | Go Reference | Divergence | Severity |
|---|--------|-----------------|-------------|-----------|----------|
| F1 | **Orders — create_order** | `order-actions.ts:125,174` calls `public.create_order()` RPC which atomically: creates order + routes items to KDS via `route_order_to_kds()` + enqueues print job + writes `order_status_history` row | `backend/internal/handler/orders/handler.go:174-193` — raw INSERT into `orders`, then batch INSERT into `order_items`. No call to `route_order_to_kds`. No `order_status_history` write. No print job enqueue. | **Go create_order bypasses KDS routing RPC, status history, and print job. Kitchen sees no tickets. Receipts never print.** | **CRITICAL** |
| F2 | **Orders — order_status_history** | `supabase/migrations/20260405070000_create_orders.sql:164-204` — append-only audit table. Old BE writes a history row on every status transition via RPC. | `backend/internal/handler/orders/handler.go:211-213` — bare UPDATE on orders.status with no history write. | Go drops the entire audit trail. | HIGH |
| F3 | **Orders — update order** | `migration-gap-report.md:29` lists `PUT /br/{branchId}/orders/{id}` as migrated. `handler.go:29-37` — Routes() shows only `r.Get`, `r.Post`, `r.Delete`, `r.Post("/{id}/items")`, `r.Patch("/{id}/items/{itemId}/serve")`, `r.Post("/{id}/payment")`. No `r.Put("/{id}")`. | `backend/internal/handler/orders/handler.go:29-37` | PUT route listed in gap report as "MIGRATED" does not exist in the router. | HIGH |
| F4 | **Orders — cancel_pending_payment** | `payment-actions.ts:1299` — `supabase.rpc("cancel_pending_payment", ...)` called when cashier cancels a pending MoMo/VietQR payment to revert order to unpaid state. | No handler in Go. No route in `main.go`. | Cashier cannot cancel a pending digital payment via Go API. Order stays locked in pending state. | HIGH |
| F5 | **Orders — consume_stock** | `business-logic-be-cu-nodejs.md:227-229` — `complete_payment_and_consume_stock` called on cash payment to decrement stock. Old BE: cash path → stock consumed atomically at payment time. | `backend/internal/handler/orders/handler.go:372-384` (cash path) calls `create_payment` RPC only. No `complete_payment_and_consume_stock`. Note: MoMo webhook path DOES call it (`webhooks/momo.go:184`). Cash payment path silently skips stock consumption. | Inventory goes out of sync on every cash transaction. | HIGH |
| F6 | **KDS — KDS station routing** | `business-logic-be-cu-nodejs.md:288` — `route_order_to_kds(p_order_id)` routes items to stations based on menu_category → kds_station_categories mapping. Called by `create_order`. | `backend/internal/handler/kds/handler.go` — only list/ready/recall. `create_order` in Go does NOT call `route_order_to_kds`. | New orders placed via Go never appear on KDS. | CRITICAL |
| F7 | **KDS — kitchen_send_batches** | `supabase/migrations/20260513000000_pos_kitchen_ticket_sequence_v2.sql`, `20260513001000_kitchen_send_batches_realtime.sql` — batches group tickets for sequence visibility. | No reference in Go backend. No table touched. | Batching and order-sequence visibility on KDS board missing. | MEDIUM |
| F8 | **KDS — bump_kds_ticket** | `business-logic-be-cu-nodejs.md:290` — `bump_kds_ticket(p_ticket_id)` updates bumped_at/bumped_by. | `backend/internal/handler/kds/handler.go` Routes: only `tickets`, `/{id}/ready`, `/{id}/recall`. No bump endpoint. | Chef cannot bump a ticket. | MEDIUM |
| F9 | **Menu — daily limits enforcement** | `business-logic-be-cu-nodejs.md:348-350` — `enforce_daily_limit_quota` called at order time to decrement quota. Status machine: active→soft_exceeded→hard_blocked→skip_quota. | `backend/internal/handler/menu/handler.go` — GET/PUT `/daily-limit` only (read+write config). No enforcement at order-create time. | Daily quota enforcement is missing from order flow. Items can be over-sold. | HIGH |
| F10 | **Menu — available sides** | `business-logic-be-cu-nodejs.md:342-344` — `menu_item_available_sides` junction table, used for combo items. Old `menu/actions.ts` (1,454 LOC) manages sides. | `business-logic-be-moi-golang.md:514-516` — Go menu handler has no sides endpoints. | Combo item management not migrated. | MEDIUM |
| F11 | **Settings — KDS station settings** | `apps/web/app/admin/settings/kds/actions.ts` — KDS station CRUD, station-category mapping. | No Go handler. `settings/handler.go` covers branches/areas/tables/POS config/payments only. | KDS station config (add/remove station, map categories) has no Go endpoint. | MEDIUM |
| F12 | **Settings — Printer settings** | `apps/web/app/admin/settings/printers/actions.ts` (316 LOC), `jobs/actions.ts` — printer CRUD, print job management. | No Go handler. | Printer management not migrated. | MEDIUM |
| F13 | **Settings — Network config** | `apps/web/app/admin/settings/branches/network-config-actions.ts` — branch network configuration. | No Go handler. | Not migrated. | LOW |
| F14 | **Settings — Attendance settings** | `apps/web/app/admin/settings/branches/attendance-actions.ts` | No Go handler. | Not migrated. | LOW |
| F15 | **Auth — Module ACL not enforced** | `apps/web/proxy.ts:198-228` — every route resolves to a `ModuleKey`; user role checked against `MODULE_ACL.allowedRoles`. 96 permission keys, role gate at route level. `inventory_procurement` has extra RPC gate via `has_permission_any`. | `backend/internal/auth/acl.go:29-119` — `moduleACLMap` defined but **`business-logic-be-moi-golang.md:311` explicitly states "Not currently enforced in the Go backend"**. | Module ACL is the first security gate in old BE (proxy.ts). Go drops it entirely, relying only on ABAC. An `owner` can invoke any route; module-level role restrictions are gone. | HIGH |
| F16 | **Auth — Network gate (POS/KDS perimeter)** | `apps/web/proxy.ts:285-315` — POS/KDS requests must originate from NAT IP registered by print-agent heartbeat. Gate enforced unless `POS_NETWORK_GATE=off`. | No equivalent in Go backend. No IP-based gate anywhere in middleware stack. | Go API has no network-level POS/KDS perimeter. Any authenticated token can hit KDS/order endpoints from any IP. | HIGH |
| F17 | **Auth — Branch scope enforcement** | `apps/web/proxy.ts:230-264` — URL `branchId` must match JWT `branch_id` for branch-scoped roles (cashier/waiter/chef). Admin roles (owner/super_manager/area_manager) may traverse any branch. | `backend/internal/handler/orders/handler.go:45-47` — `parseBranchID` parses branchId from URL. Handlers filter `WHERE branch_id = $branchId AND tenant_id = $tenantID`. But there is **no check that the caller's JWT branch_id matches the URL branchId for branch-scoped roles**. | A cashier with `branch_id=1` in JWT can call `/br/2/orders` and, if they know the tenant_id, could read another branch's orders. Old BE proxy blocked this at middleware. | HIGH |
| F18 | **Orders — POS session validation** | `order-actions.ts:115-125` — validates `pos_session_id` exists and is OPEN before creating order. Idempotency key checked on order creation. | `backend/internal/handler/orders/handler.go:156-165` — `pos_session_id` accepted but only passed to DB. No pre-validation that session is open. | Orders can be created against closed POS sessions. | MEDIUM |
| F19 | **Orders — order_items modifiers/sides snapshots** | `business-logic-be-cu-nodejs.md:182-183` — `order_item.modifiers` and `sides` stored as JSONB snapshots at order time (immutable historical record). | `backend/internal/handler/orders/handler.go` and `types.go` — `AppendItemsRequest` items struct. No `modifiers` or `sides` fields visible in handler. | Modifier and side-dish line-item data lost at order creation time. Order history is incomplete. | HIGH |
| F20 | **Payments — VietQR is static QR via EMVCo encoder** | `packages/shared/src/providers/impl/vietqr.ts` — VietQR uses EMVCo static QR encoding client-side. Old BE: payment-actions.ts (line 43-56) creates payment row + returns static QR payload from EMVCo encoder. | `backend/internal/handler/payments/handler.go` — `GET /vietqr-config` returns bank details. Separate confirm endpoint. No EMVCo encoder in Go. The FE must still call `payment-actions.ts` which calls Supabase RPC `create_payment` for VietQR. | VietQR payment creation path (create_payment RPC) is NOT migrated to Go. The handoff explicitly deferred payment-actions.ts rewire (`handoff-2026-05-13-night.md:11`). | HIGH |

**Total faithfulness gaps: 20**, of which 2 are CRITICAL, 9 are HIGH.

---

## 4. Non-Functional Gaps Table

| # | Category | Old BE Behaviour | Go BE Behaviour | Gap | Severity |
|---|----------|-----------------|----------------|-----|----------|
| NF1 | **Realtime / WebSocket** | Supabase Realtime subscriptions on `kds_tickets` (`20260407110000:78`), `branch_menu_item_daily_limits` (`20260517000000`), `kitchen_send_batches` (`20260513001000`). KDS board and POS daily-limit UI subscribe for live updates. | `backend/internal/realtime/hub.go` exists with Go-native fan-out (pg_notify → Hub → WebSocket). **But**: `cmd/server/main.go` imports **zero** from `internal/realtime`. Hub is completely unmounted. | Go realtime is dead code. KDS board and POS quotas fall back to Supabase Realtime — which requires Supabase connection, not the Go backend. No WebSocket endpoint registered. | CRITICAL |
| NF2 | **Rate Limiting** | `apps/web/proxy.ts` — no Upstash rate limiting found in this codebase (proxy.ts has no ratelimit import). However, Vercel edge functions get platform-level rate protection. | No rate limiting in Go middleware stack (`middleware/` directory has auth.go, abac.go, cors.go, logger.go only). | No rate limiting. Auth endpoint brute-force, order-creation spam, MoMo webhook replay beyond idempotency anchor all unprotected. | MEDIUM |
| NF3 | **Module ACL enforcement** | `apps/web/proxy.ts:198-228` — role-to-module gate runs on EVERY request before handler. | `backend/internal/auth/acl.go:29-119` — `moduleACLMap` defined. `business-logic-be-moi-golang.md:311`: "Not currently enforced". | Module ACL is security dead code in Go. | HIGH |
| NF4 | **Network perimeter gate (POS/KDS)** | `apps/web/proxy.ts:285-315` — IP-based gate for POS/KDS routes using print-agent heartbeat. `apps/web/app/api/branch-presence/route.ts` — IP registration. | No IP gate. No branch-presence endpoint in Go. | POS/KDS accessible from any IP with valid JWT. | HIGH |
| NF5 | **Audit Logging** | `order_status_history` table captures every FSM transition with actor UUID and timestamp. `staff_roles` changes visible in Supabase audit. | Go handlers: bare UPDATEs with no history writes. No structured audit table writes. `middleware/logger.go` does HTTP-level logging but no business-event audit log. | Full audit trail lost for all Go-handled operations. | HIGH |
| NF6 | **Graceful Shutdown** | Vercel serverless — no persistent state, no shutdown concern. | `cmd/server/main.go:121-132` — 10s graceful shutdown on SIGINT/SIGTERM. | This is BETTER in Go, not a gap. (Noted for balance.) | — |
| NF7 | **Observability / Structured Logging** | Vercel structured logs (platform-managed). | `middleware/logger.go` — structured slog JSON output per request. | Comparable. Not a gap at parity level. But no distributed trace propagation (no W3C `traceparent` header injection, no OpenTelemetry). | LOW |
| NF8 | **VN timezone handling for daily limits** | `business-logic-be-cu-nodejs.md:370` — daily limits keyed to VN calendar date (UTC+7). Cron jobs configured for ICT offset. | No daily-limit enforcement in Go order flow (Gap F9). Even if added, there is no VN-timezone date helper in Go backend. | ICT offset bug waiting to happen when daily limits are wired up. | MEDIUM |
| NF9 | **ABAC cache invalidation on permission revoke** | Old BE: RLS is live (PostgREST reads `has_permission` per request — always current). | `backend/internal/abac/evaluator.go:68-71` — 5-minute cache TTL. `business-logic-be-moi-golang.md:1229`: "Permission grants/revokes take up to 5 minutes to take effect." | Revoked permissions stay active up to 5 min. Old BE: immediate. This is a security regression. | MEDIUM |
| NF10 | **JWT issued by Go `/auth/login` is not a Supabase JWT** | Old BE: Supabase Auth issues JWTs; all RPCs, RLS, `auth.uid()` work. | `business-logic-be-moi-golang.md:476`: "The JWT issued here does not match Supabase's token (different issuer, different custom claims). This handler is for testing only; production uses Supabase Auth." | The Go login endpoint is not production-ready. Prod depends on Supabase Auth still. | MEDIUM |
| NF11 | **`auth.uid()` RPCs return NULL on pgxpool** | Old BE: PostgREST injects JWT into every query; `auth.uid()`, `auth_tenant_id()`, `has_permission()` all work. | `business-logic-be-moi-golang.md:187-199` — explicitly documented: auth RPCs return NULL on pgxpool. Workaround: bind UUIDs explicitly. | Any future migration of RLS-heavy operations risks silent NULL returns. Existing handlers that call `create_payment` RPC (which uses `SECURITY DEFINER` + `auth.uid()` internally) may be silently broken. | HIGH |

---

## 5. Reconciliation of Prior Gap Report

The prior report (`migration-gap-report.md`, generated 2026-05-13, "Confidence: High") made the following claims. Each is evaluated below:

### Claim A: "MIGRATED: 6 endpoints / 90%+ of customer-facing BE in Go"

**VERDICT: FALSE (sampling error, not a lie)**

The report audited `apps/web/app/api/**/route.ts` (10 routes) and `apps/web/app/_actions/notifications.ts` (1 file). It did not audit:
- 75 server-action files in `apps/web/app/**/` — these ARE the old BE for all operational modules.
- `apps/print-agent/` — 3,408+ LOC standalone Node daemon.
- The proxy (`apps/web/proxy.ts`) as a security layer.

The handoff itself flagged this: `handoff-2026-05-13-night.md:105`: "⚠ One caveat on the audit: the agent claimed some endpoints already use the Go backend that I'm not 100% sure about... Skim the report critically before acting on it."

### Claim B: "Orders — MIGRATED ✓ — All order operations in Go"

**VERDICT: PARTIALLY FALSE**

- `PUT /br/{branchId}/orders/{id}` listed as migrated but does NOT exist in `handler.go:29-37`.
- `cancel_pending_payment` listed nowhere but is called in `payment-actions.ts:1299` — no Go counterpart.
- `order_status_history` writes: silently dropped.
- KDS routing (`route_order_to_kds`): not called on order create in Go.
- Modifiers/sides JSONB snapshots: absent from Go handler types.
- POS session open-status validation: missing.
- Stock consumption on cash payment: missing.

### Claim C: "Payments — MIGRATED ✓"

**VERDICT: PARTIALLY FALSE**

The handoff explicitly states (`handoff-2026-05-13-night.md:11`): "US-508 FE rewire (`payment-actions.ts`) — 1594 LOC of mixed cash/momo/vietqr/refund/HĐĐT logic. Rewiring needs live cashier QA." This means `payment-actions.ts` still calls Supabase RPCs directly. VietQR `create_payment` path is not Go. Cash payment stock-consumption is not Go.

### Claim D: "Menu — MIGRATED ✓"

**VERDICT: PARTIALLY FALSE**

- Daily limit enforcement at order time (F9): not in Go.
- Available sides (F10): not in Go.
- `menu/actions.ts` (1,454 LOC) and `pos/menu-actions.ts` (246 LOC): still call Supabase directly for many operations.

### Claim E: "Urgent Gaps: None"

**VERDICT: FALSE**

Gaps F1 (KDS routing on order create) and F6 (KDS tickets never created) are CRITICAL: every order placed via the Go API results in a kitchen that receives no tickets. This is a production-breaking gap if Go API is live.

### Claim F: "Inventory / HR / Finance / Print Agent — Out of scope"

**VERDICT: Accurate label but the question is "100% migration?" not "scope agreement"**

Labelling these "out of scope" is a product decision, not a migration completeness fact. For the purpose of this debate (whether 100% of old BE behaviour is in Go), these represent ~15,000+ LOC of active business logic with zero Go coverage. They are gaps by definition.

---

## 6. Single Strongest Argument

**Every order placed through the Go backend silently fails to create KDS tickets.**

Old BE: `order-actions.ts:174` calls `public.create_order()` — a `SECURITY INVOKER` RPC that atomically creates the order AND calls `route_order_to_kds()` to create one `kds_tickets` row per order item at the appropriate kitchen station. This is how the kitchen knows what to cook.

Go BE: `handler.go:174-193` performs a bare `INSERT INTO public.orders` followed by batch-insert of `order_items`. It never calls `route_order_to_kds`. There is no Go equivalent of this routing logic anywhere in `backend/`.

Consequence: In any restaurant running the Go backend, placing an order through the POS creates a database order row but the KDS screens remain blank. Chefs never see the order. Food never gets cooked.

This is not a subtle edge case. It is the primary operational loop of the entire product. The fact that it is missing from the "migrated" orders module — while the gap report declared Orders "MIGRATED ✓" — is the clearest proof that the migration is nowhere near 100%.

---

## Appendix: Evidence Index

| Evidence | Location |
|----------|----------|
| `create_order` RPC call in old BE | `apps/web/app/br/[branchId]/pos/order-actions.ts:174` |
| Go order create — no RPC call | `backend/internal/handler/orders/handler.go:174-193` |
| Go router routes — no PUT | `backend/internal/handler/orders/handler.go:29-37` |
| `cancel_pending_payment` in old BE | `apps/web/app/br/[branchId]/pos/payment-actions.ts:1299` |
| Cash path — no stock consumption | `backend/internal/handler/orders/handler.go:372-384` |
| Module ACL "not currently enforced" | `backend/internal/auth/acl.go` + `business-logic-be-moi-golang.md:311` |
| Realtime hub — unmounted | `backend/cmd/server/main.go` (no realtime import) |
| Branch-scope enforcement in old BE | `apps/web/proxy.ts:230-264` |
| Network gate in old BE | `apps/web/proxy.ts:285-315` |
| ABAC 5-min cache TTL | `backend/internal/abac/evaluator.go:68-71` |
| Inventory action files LOC | `apps/web/app/inventory/*.ts` — 10,504 LOC total |
| Finance action files LOC | `apps/web/app/finance/*.ts` — 3,110 LOC total |
| HR action files LOC | `apps/web/app/hr/*.ts` — 1,448 LOC total |
| Employee self-service LOC | `apps/web/app/employee/*/actions.ts` — 652 LOC total |
| Prior report caveat | `.omc/handoff-2026-05-13-night.md:105` |
| Handoff deferred payment-actions.ts | `.omc/handoff-2026-05-13-night.md:11` |

---

*Prepared by: Prosecution agent — Debate Round 1 — US-Q03*  
*Date: 2026-05-14*

# Phase B Execution Plan — 7 Module Ports to Go

**Owner:** comtammatu
**Drafted:** 2026-05-14
**Status:** Plan — no code written. Read-only analysis of existing codebase.
**Prerequisite:** Phase A (9 POS-core modules) shipped. Identity-model decision (tasks/todo.md) still open but does NOT block Phase B modules (none depend on `profiles` FK).

---

## Summary Sequencing Table

| Wave | Module | Go package | ~Endpoints | ~LOC (TS) | Effort | Parallelizable? |
|------|--------|------------|-----------|-----------|--------|-----------------|
| 1 | Employee self-service | `handler/employee` | 6 | 650 | S (1d) | Yes — standalone |
| 1 | HR/Payroll | `handler/hr` | 6 | 1,450 | S (2d) | Yes — standalone |
| 1 | Feedback/CRM | `handler/feedback` | 15 + 4 cron | 700 + cron | M (3d) | Yes — standalone |
| 2 | Finance/GL | `handler/finance` | 32 | 3,100 | M (3-4d) | Yes — after wave 1 validated |
| 2 | HDDT e-invoice | `handler/hddt` | 3 + 1 cron | 400 | S (1d) | Depends on Finance |
| 3 | Inventory | `handler/inventory` | ~104 | 10,500 | XL (10-14d) | Split into sub-packages |
| 3 | Print-agent | Keep as-is (Node) | N/A | 3,400 | S (1d) rewire only | After Inventory |

**Total estimated effort:** ~21-25 developer-days across 3 waves.

---

## Wave 1 — Low-risk, validates the pattern (parallel)

### 1. Employee Self-Service

**Source files (4):**
| File | Functions | RPCs called |
|------|-----------|-------------|
| `employee/clock/actions.ts` | 4 | (direct `.from()` queries) |
| `employee/profile/actions.ts` | 1 | `update_my_dependents_count` |
| `employee/schedule/actions.ts` | 1 | (direct `.from()` queries) |
| `employee/shift-register/actions.ts` | 0 (re-exports) | `cancel_shift_request` |

**Go package:** `backend/internal/handler/employee`

**Routes (mount at `/employee`):**
```
GET  /clock/status          — current clock-in state
POST /clock/in              — clock in
POST /clock/out             — clock out
GET  /clock/history         — clock history
GET  /profile               — my profile
PUT  /profile/dependents    — update_my_dependents_count RPC
GET  /schedule              — my schedule
POST /shift-requests        — create shift request (cancel_shift_request RPC for DELETE)
DELETE /shift-requests/{id} — cancel_shift_request RPC
```

**ABAC keys:** None — employee routes are self-scoped (JWT `user_id` = the employee). No `has_permission` checks in source; ACL module `employee` allows all authenticated roles.

**RPCs to reuse via `db.WithAuthContext`:** `update_my_dependents_count`, `cancel_shift_request`.

**Cron jobs:** None.

**Inter-module deps:** None. Reads from `staff_members`, `shifts`, `attendance_records` — tables already exist.

**Effort:** S (1 day). 6 endpoints, 2 RPCs, no cron. Good first candidate for a parallel agent.

---

### 2. HR/Payroll

**Source files (6):**
| File | Functions | RPCs called |
|------|-----------|-------------|
| `hr/actions.ts` | 1 | (direct queries) |
| `hr/contract-actions.ts` | 0 (types/re-exports) | — |
| `hr/payroll-actions.ts` | 1 | (direct queries) |
| `hr/payroll-report-actions.ts` | 0 (types) | — |
| `hr/shift-assignment-actions.ts` | 0 (types) | — |
| `hr/shift-request-actions.ts` | 4 (approve/reject) | `reject_shift_request` |

**Go package:** `backend/internal/handler/hr`

**Routes (mount at `/hr`):**
```
GET    /employees                — list employees with HR view
GET    /employees/{id}           — employee detail
POST   /contracts                — create contract
PUT    /contracts/{id}           — update contract
POST   /contracts/{id}/sign      — sign contract
POST   /contracts/{id}/terminate — terminate
GET    /payroll                  — payroll summary
POST   /payroll/calculate        — calculate payroll
GET    /payroll/reports          — payroll reports
GET    /shift-assignments        — list shift assignments
POST   /shift-assignments        — create shift assignment
GET    /shift-requests           — list pending requests
POST   /shift-requests/{id}/approve — approve (approve_shift_request or direct UPDATE)
POST   /shift-requests/{id}/reject  — reject_shift_request RPC
```

**ABAC keys:** `hr:view_employee`, `hr:manage_employee`, `hr:contract_create`, `hr:contract_sign`, `hr:terminate`, `hr:dependent_manage`, `hr:register_shift`, `hr:approve_shift_request`.

**RPCs to reuse:** `reject_shift_request`. Most operations are direct CRUD.

**Cron jobs:** None.

**Inter-module deps:** Reads `staff_members` (shared with Staff module). Payroll calculation may read `attendance_records` and `shifts`.

**Effort:** S (2 days). Many files are type/re-export stubs with 0 functions. Real logic is ~6 endpoints.

---

### 3. Feedback/CRM

**Source files (6 action files + 4 cron/API routes):**
| File | Functions | RPCs called |
|------|-----------|-------------|
| `admin/feedback/actions.ts` | 1 | (direct queries) |
| `admin/feedback/qr/actions.ts` | 4 | (direct queries) |
| `admin/feedback/reports/actions.ts` | 1 | (direct queries) |
| `admin/feedback/settings/actions.ts` | 6 | (direct queries) |
| `r/[token]/actions.ts` | 1 | `submit_feedback` |
| `r/[token]/actions-photos.ts` | 2 | (storage upload) |

**Cron routes (Vercel Cron → Go cron):**
| Route | Schedule | Purpose |
|-------|----------|---------|
| `api/cron/feedback-daily-report` | Daily | Aggregate + email/Telegram daily digest |
| `api/cron/feedback-retention` | Daily | Delete expired feedback (GDPR/retention) |
| `api/cron/telegram-flush` | Every few min | Flush queued Telegram notifications |
| `api/ai/enrich-feedback` | On-demand | AI sentiment enrichment |

**Go packages:**
- `backend/internal/handler/feedback` — admin CRUD + public submission
- `backend/internal/cron/` — new package for Go-native cron (see Cron Strategy below)

**Routes:**
```
# Public (no auth — token-gated)
POST /r/{token}/submit          — submit_feedback RPC
POST /r/{token}/photos          — photo upload (needs storage decision — see risk)

# Admin (mount at /admin/feedback)
GET    /                        — list feedback
GET    /reports                 — feedback reports
GET    /qr                     — list QR codes
POST   /qr                     — create QR
PUT    /qr/{id}                — update QR
DELETE /qr/{id}                — delete QR
GET    /settings               — get feedback settings
PUT    /settings               — update settings
PUT    /settings/telegram      — configure Telegram bot
PUT    /settings/retention     — set retention policy
PUT    /settings/auto-response — set auto-response
PUT    /settings/categories    — set feedback categories
```

**ABAC keys:** `feedback:view`, `feedback:view_phone`, `feedback:view_report`, `feedback:manage_qr`, `feedback:manage_telegram`, `feedback:manage_settings`, `feedback:moderate`.

**RPCs to reuse:** `submit_feedback`.

**Storage dependency:** Photo upload currently uses Supabase Storage. Per DB-exit plan §3.C, storage moves to Cloudflare R2. The Go handler should use an S3-compatible client from day one. Two buckets: `feedback-photos`, potentially `feedback-attachments`.

**Cron strategy (applies to ALL modules):** Create `backend/internal/cron/scheduler.go` using a lightweight Go cron library (e.g. `robfig/cron/v3`). Each job is a func registered at startup. This replaces ALL Vercel Cron routes. Jobs run inside the Go process — acceptable at single-tenant scale. If multi-instance, use `pg_advisory_lock` to prevent double-execution.

**Inter-module deps:** Feedback is standalone. The AI enrichment endpoint calls an external LLM API — keep as a Go HTTP call.

**Effort:** M (3 days). 15 endpoints + 4 cron jobs + storage integration.

---

## Wave 2 — Financial domain (after Wave 1 validates cron + pattern)

### 4. Finance/GL

**Source files (9):**
| File | Functions | RPCs called |
|------|-----------|-------------|
| `finance/actions.ts` | 17 | `get_daily_revenue`, `get_revenue_kpis`, `get_revenue_rollup`, `get_revenue_by_hour`, `get_revenue_by_cashier`, `get_top_items`, `get_food_cost`, `get_orders_for_day`, `get_cash_variance_summary`, `find_payment_order_desync`, `refresh_finance_views` |
| `finance/accounting-actions.ts` | 4 | — |
| `finance/chart-of-accounts-actions.ts` | 2 | `seed_chart_of_accounts` |
| `finance/journal-actions.ts` | 1 | — |
| `finance/period-actions.ts` | 4 | `fn_reconcile_period`, `fn_reconcile_drilldown`, `fn_reconcile_sales_by_day` |
| `finance/posting-rules-actions.ts` | 2 | — |
| `finance/reconciliation-actions.ts` | 0 (types) | — |
| `finance/statement-actions.ts` | 0 (types) | — |
| `finance/summary-invoice-actions.ts` | 2 | `transition_tax_invoice_state` |

**Go package:** `backend/internal/handler/finance`

**Routes (mount at `/finance`):**
```
# Revenue dashboard
GET  /revenue/daily           — get_daily_revenue RPC
GET  /revenue/kpis            — get_revenue_kpis RPC
GET  /revenue/rollup          — get_revenue_rollup RPC
GET  /revenue/by-hour         — get_revenue_by_hour RPC
GET  /revenue/by-cashier      — get_revenue_by_cashier RPC
GET  /revenue/top-items       — get_top_items RPC
GET  /revenue/food-cost       — get_food_cost RPC
GET  /revenue/orders-for-day  — get_orders_for_day RPC
GET  /revenue/cash-variance   — get_cash_variance_summary RPC
GET  /revenue/desync          — find_payment_order_desync RPC
POST /revenue/refresh         — refresh_finance_views RPC

# B01/B02/B03 tax reports
GET  /reports/b01             — fn_generate_b01_dn RPC
GET  /reports/b02             — fn_generate_b02_dn RPC
GET  /reports/b03             — fn_generate_b03_dn RPC

# Chart of Accounts
GET    /chart-of-accounts     — list accounts
POST   /chart-of-accounts     — create account
POST   /chart-of-accounts/seed — seed_chart_of_accounts RPC

# Journals
GET    /journals              — list journal entries
POST   /journals              — create journal entry

# Periods
GET    /periods               — list periods
POST   /periods               — create period
POST   /periods/{id}/close    — close period
POST   /periods/{id}/reopen   — reopen period
POST   /periods/{id}/reconcile — fn_reconcile_period RPC
GET    /periods/{id}/reconcile/drilldown — fn_reconcile_drilldown RPC
GET    /periods/{id}/reconcile/sales-by-day — fn_reconcile_sales_by_day RPC

# Posting rules
GET    /posting-rules         — list rules
PUT    /posting-rules         — update rules

# Summary invoices (shared with HDDT)
GET    /summary-invoices      — list
POST   /summary-invoices/{id}/transition — transition_tax_invoice_state RPC
```

**ABAC keys:** `finance:view`, `finance:expense_create`, `finance:expense_approve`, `finance:payroll_calculate`, `finance:payroll_approve`, `finance:ap_pay`, `accounting:period_reopen`, `reports:view_branch`, `reports:view_tenant`.

**RPCs to reuse:** 19 RPCs — this module is heavily RPC-driven. The Go handlers are thin wrappers calling existing Postgres functions via `db.WithAuthContext`.

**Cron jobs:** None (finance views refreshed on-demand).

**Inter-module deps:** Reads from `orders`, `payments` tables. No write coupling. Summary invoices shared with HDDT module.

**Effort:** M (3-4 days). 32 endpoints but most are thin RPC wrappers — mechanical port. Financial correctness is in the RPCs, not the handlers.

---

### 5. HDDT E-Invoice

**Source files (2 + 1 cron):**
| File | Functions | Purpose |
|------|-----------|---------|
| `finance/summary-invoice-actions.ts` | 2 | List + transition invoice state |
| `api/cron/hddt-daily-summary/route.ts` | 1 | Daily B2C summary generation |
| `lib/hddt-daily-summary.ts` | shared helper | `executeSummaryRun` — per-branch batch |

**Go package:** `backend/internal/handler/hddt`

**Routes (mount at `/admin/hddt`):**
```
GET    /summary-runs          — list summary runs
POST   /summary-runs          — manual trigger (same logic as cron)
POST   /summary-runs/{id}/transition — transition_tax_invoice_state RPC
```

**Cron:** `hddt-daily-summary` → Go cron job in `backend/internal/cron/`. Runs at 02:00 ICT. Iterates branches, calls `executeSummaryRun` logic per branch with skip-and-continue isolation.

**ABAC keys:** `finance:view` (reuses finance permissions — summary invoices are a finance sub-feature).

**RPCs to reuse:** `transition_tax_invoice_state`. The summary run logic calls MISA/Viettel provider APIs — these are external HTTP integrations that need a Go HTTP client wrapper.

**External integration:** MISA and/or Viettel e-invoice API. Currently in `@comtammatu/shared/providers`. Must be re-implemented as a Go HTTP client in `backend/internal/provider/einvoice/`. This is the main effort — the handler itself is trivial.

**Inter-module deps:** Depends on Finance (summary invoices table). Port AFTER Finance.

**Effort:** S (1 day for handler + cron, +1 day if MISA/Viettel Go client needed). If provider APIs are still "blocked on credentials" (per todo.md), the Go client can be a stub.

---

## Wave 3 — The big one

### 6. Inventory

**Source files (19 action files):**
| File | Functions | Key RPCs |
|------|-----------|----------|
| `actions.ts` | 14 | `toggle_ingredient_active`, `upsert_recipe_lines`, `is_feature_enabled`, `inventory_shift_key` |
| `grn-actions.ts` | 16 | `create_grn_from_po`, `confirm_goods_receipt_note`, `amend_grn_line`, `grn_is_auto_approvable`, `get_grn_price_baseline`, `override_grn_hardblock`, `extend_express_window` |
| `stocktake-actions.ts` | 12 | `create_stocktake_session`, `start_stocktake`, `submit_count_round`, `get_stocktake_lines_blind`, `close_recount_round`, `resolve_stocktake_conflict`, `escalate_round_4`, `complete_stocktake`, `finalize_stocktake` |
| `transfer-actions.ts` | 9 | `create_stock_transfer_draft`, `commit_intra_branch_transfer`, `stock_transfer_confirm_ship`, `stock_transfer_mark_in_transit`, `stock_transfer_confirm_receive`, `stock_transfer_receive`, `stock_transfer_list_branches` |
| `production-actions.ts` | 9 | (direct queries + production RPCs) |
| `purchase-order-actions.ts` | 5 | (direct queries) |
| `report-actions.ts` | 6 | (direct queries — report views) |
| `dashboard-actions.ts` | 6 | `get_inventory_dashboard`, `get_inventory_alerts`, `refresh_inventory_dashboard` |
| `waste-actions.ts` | 4 | `create_waste_entry`, `approve_waste` |
| `variance-actions.ts` | 5 | (direct queries) |
| `issue-actions.ts` | 4 | `confirm_stock_issue` |
| `supplier-actions.ts` | 3 | (direct queries) |
| `supplier-return-actions.ts` | 3 | `confirm_supplier_return` |
| `inventory-value-actions.ts` | 3 | (direct queries) |
| `trust-actions.ts` | 1 | `compute_user_trust_score` |
| `notifications-actions.ts` | 2 | (direct queries) |
| `document-correction-actions.ts` | 0 | — |
| `procurement-actions.ts` | 0 | (re-exports) |
| `settings/thresholds/actions.ts` | 0 | — |

**Total:** ~104 exported functions, ~45 distinct RPCs.

**Go sub-packages (recommended split):**
```
backend/internal/handler/inventory/
  ├── handler.go          — main Routes(), ingredient CRUD, recipes
  ├── grn.go              — GRN (goods receipt notes)
  ├── stocktake.go        — stocktake sessions + rounds
  ├── transfer.go         — inter-branch transfers
  ├── production.go       — production orders
  ├── purchase_order.go   — purchase orders
  ├── waste.go            — waste entries
  ├── supplier.go         — supplier CRUD
  ├── supplier_return.go  — supplier returns
  ├── issue.go            — stock issues
  ├── report.go           — inventory reports + dashboard
  ├── variance.go         — variance analysis
  └── settings.go         — thresholds, trust scores
```

All share one `Handler` struct with `pool` + `checker`, split across files for readability.

**Routes (mount at `/inventory`):**
Too many to list individually (~104). Follow the pattern: each sub-file registers its routes in a helper method called from `Routes()`.

**ABAC keys (22):** `inventory:read`, `inventory:write`, `inventory:stocktake_create`, `inventory:stocktake_complete`, `inventory:stocktake_recount`, `inventory:stocktake_unblind`, `inventory:transfer_create`, `inventory:transfer_ship`, `inventory:transfer_receive`, `inventory:writeoff`, `inventory:production_create`, `inventory:production_confirm`, `inventory:waste_approve`, `inventory:waste_bypass_photo`, `inventory:adjust_approve`, `inventory:grn_express_configure`, `inventory:grn_express_extend`, `inventory:grn_hardblock_override`, `inventory:catalog_review_policy_set`, `inventory:item_review_override_set`, `procurement:*` (10 keys), `supplier_return:*` (3 keys).

**RPCs to reuse:** ~45 RPCs. Nearly all business logic lives in Postgres functions. Go handlers are thin HTTP→RPC bridges.

**Zone locking:** `acquire_zone_lock`, `heartbeat_zone_lock`, `release_zone_lock` — these are Postgres advisory locks exposed as RPCs. The Go handler must maintain heartbeat (goroutine per active lock, or client-side polling).

**Realtime:** Inventory has 11 realtime-subscribed tables (per coupling audit). These are NOT in scope for Phase B — they depend on the Realtime Hub (Phase 0.5 continuation). Phase B handlers are REST-only; realtime push is a separate workstream.

**Storage:** Two buckets — `inventory-attachments`, `grn-evidence`. Same as Feedback: use S3-compatible client targeting R2.

**Cron jobs:** None identified in the inventory action files. Dashboard refresh is on-demand.

**Inter-module deps:** Reads `menu_items` (ingredients are menu items). Reads `suppliers`. Self-contained write path.

**Effort:** XL (10-14 days). Recommend splitting across 2-3 parallel agents:
- Agent A: `grn.go` + `purchase_order.go` + `supplier.go` + `supplier_return.go` (procurement sub-domain, ~27 endpoints)
- Agent B: `stocktake.go` + `variance.go` + `transfer.go` (stock accuracy sub-domain, ~26 endpoints)
- Agent C: `handler.go` + `production.go` + `waste.go` + `issue.go` + `report.go` + `settings.go` (remaining, ~51 endpoints)

---

### 7. Print-Agent

**Recommendation: KEEP AS NODE DAEMON. Do NOT rewrite in Go.**

**Rationale:**
1. **Hardware-coupled.** The daemon speaks ESC/POS over TCP to thermal printers. Node's `net.Socket` + the existing `escpos.ts` + `render-bitmap.ts` (canvas-based receipt rendering) work. Rewriting in Go gains nothing — there's no Go ESC/POS bitmap rendering library of comparable maturity.
2. **Isolated process.** The print-agent runs on-premise at each branch, not on the server. It's a local daemon, not a cloud service.
3. **Small Supabase surface.** Only 3 RPC calls (`claim_print_job`, `complete_print_job`, `expire_stuck_print_jobs`) + 1 `printer_agents` upsert + Supabase Realtime subscription for new print jobs.
4. **DB-exit path.** Replace `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` with Go BE HTTP calls. The print-agent becomes a Go BE API client instead of a direct Supabase client.

**Phase B work (minimal):**
1. Add 3 endpoints to Go BE: `POST /print-jobs/claim`, `POST /print-jobs/{id}/complete`, `POST /print-jobs/expire-stuck`.
2. Add printer management endpoints: `PUT /admin/settings/printers` (`upsert_printer_with_routes` RPC), `POST /print-jobs/{id}/retry` (`retry_print_job` RPC), `POST /branch-presence` (heartbeat).
3. Rewire print-agent to call Go BE instead of Supabase directly.
4. Realtime: print-agent currently subscribes to `print_jobs` table changes via Supabase Realtime. This must move to Go WebSocket (Realtime Hub) — but that's the Phase 0.5 continuation, not Phase B.

**Go package for server-side:** `backend/internal/handler/printing` (3 endpoints + 2 admin settings endpoints).

**ABAC keys:** `settings:branch` (printer management is a branch setting).

**Effort:** S (1 day for the 5 Go endpoints). The print-agent Node code stays untouched until the Realtime Hub is ready.

---

## Cron Strategy (Cross-cutting)

All 4 Vercel Cron routes become Go cron jobs:

| Current Vercel Cron | Go cron job | Schedule |
|---------------------|-------------|----------|
| `feedback-daily-report` | `cron.FeedbackDailyReport` | `0 19 * * *` UTC (02:00 ICT) |
| `feedback-retention` | `cron.FeedbackRetention` | `0 20 * * *` UTC (03:00 ICT) |
| `telegram-flush` | `cron.TelegramFlush` | `*/5 * * * *` (every 5 min) |
| `hddt-daily-summary` | `cron.HDDTDailySummary` | `0 19 * * *` UTC (02:00 ICT) |

**Implementation:** `backend/internal/cron/scheduler.go` using `robfig/cron/v3`. Single-instance guard via `pg_advisory_lock` per job. Each job receives `*pgxpool.Pool` + config. Registered in `cmd/server/main.go` at startup.

---

## Risk Register

| # | Risk | Impact | Mitigation |
|---|------|--------|------------|
| R1 | **Identity model unresolved** (tasks/todo.md CRITICAL) — `profiles` vs `users` FK. Phase B modules don't directly depend on `profiles`, but any RPC using `auth.uid()` may hit the same issue as Phase A. | HIGH | Audit each Phase B RPC for `profiles` FK dependency before porting. Inventory RPCs are the most likely to have it (they record `created_by`). |
| R2 | **Inventory RPCs are complex** — 45 RPCs, zone locking, multi-step stocktake flows. A thin Go wrapper won't catch if an RPC silently fails (RLS blocked = `null, null`). | HIGH | Add explicit `if data == nil && err == nil` checks in every RPC-calling handler (the "will bite you" pattern from CLAUDE.md). Table-driven integration tests per RPC. |
| R3 | **Storage buckets not in Go yet** — feedback-photos, inventory-attachments, grn-evidence need S3-compatible upload. | MEDIUM | Implement `backend/internal/storage/r2.go` client once, reuse across Feedback + Inventory. Can use `aws-sdk-go-v2/s3` since R2 is S3-compatible. |
| R4 | **MISA/Viettel e-invoice API credentials blocked** — todo.md says "blocked on credentials". | LOW | Implement Go HTTP client with interface; use mock/stub until credentials arrive. |
| R5 | **Realtime not available for Phase B** — Inventory has 11 realtime tables, print-agent needs job notifications. Phase 0.5 Hub is unfinished. | MEDIUM | Phase B is REST-only. Realtime is a separate workstream. Document which tables need realtime and hand off to Phase 0.5 continuation. |

**Single biggest risk:** R1 (identity model). If Phase B RPCs reference `profiles` and the Go `users` table has different UUIDs, RPCs will silently return null. This must be audited per-RPC before each module port begins.

---

## Checklist Before Each Module Port

1. [ ] Grep all RPCs for `profiles` / `auth.uid()` FK dependency — flag any that need the identity-model decision
2. [ ] Verify RPCs exist in `supabase/migrations/` and are callable via `db.WithAuthContext`
3. [ ] Add ABAC permission keys to `backend/internal/auth/acl.go` `moduleACLMap` if not already present
4. [ ] Register new handler in `cmd/server/main.go` with `RequireModule` middleware
5. [ ] Write at least one integration test per RPC-calling endpoint (the `null, null` trap)
6. [ ] Run `pnpm typecheck && pnpm lint && pnpm build` — Go changes must not break the FE build

---

## References

- DB migration plan: `docs/plan/db-migration-supabase-to-postgres.md`
- Migration debate verdict: `.omc/migration-debate-2026-05-14.md`
- Supabase coupling audit: `.omc/supabase-coupling-audit.md`
- Deferred gaps: `tasks/todo.md` § "Go BE migration audit — deferrals"
- Existing Go handler conventions: `backend/internal/handler/{orders,menu,staff}/handler.go`
- Permission catalog: `packages/shared/src/auth/permissions.ts`
- ACL map: `backend/internal/auth/acl.go`

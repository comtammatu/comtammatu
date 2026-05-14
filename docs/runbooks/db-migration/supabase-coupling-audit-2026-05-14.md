# Supabase Coupling Audit — US-Q08

**Audited:** 2026-05-14  
**Branch:** main  
**Auditor:** automated grep + manual review  
**Feeds:** `docs/plan/db-migration-supabase-to-postgres.md`

---

## Summary Table

| Category | FE (apps/web + packages) | Go backend | print-agent | Total |
|---|---|---|---|---|
| `blocks-full-exit` | 68 | 2 | 4 | **74** |
| `bridge-acceptable-short-term` | 6 | 1 | 0 | **7** |
| `already-clean` | 0 | 11 | 0 | **11** |

**Frontend Supabase call-sites (unique file locations):** ~120 `.rpc()` call-sites across 40+ files; ~12 `.from()` write sites; ~10 `.storage` sites; ~14 realtime `useRealtimeChannel`/`postgres_changes` subscriptions; ~30+ `auth.getSession()/getUser()` calls.

**Go backend Supabase-isms:** 3 items — `SUPABASE_JWT_SECRET` env var name (bridge), explicit `auth.uid()` avoidance pattern already implemented (already-clean), `UserUUID` FK comment referencing `auth.users` (cosmetic).

**Top-level blocker count: 74 items block full Supabase exit.**

---

## Part 1 — Frontend (apps/web, packages/)

### 1.A — Auth calls (`supabase.auth.*`, `createClient`)

All auth calls go through `@comtammatu/database/supabase/server` or `client`, which wraps `@supabase/ssr`. Every Server Action that needs the current user calls `supabase.auth.getSession()` or `supabase.auth.getUser()`.

| File:line | What it does | Go endpoint / gap | Classification |
|---|---|---|---|
| `packages/database/src/supabase/server.ts:18` | `createServerClient` — wraps GoTrue JWT cookie exchange for every SSR request | GoTrue self-hosted (§3.A) keeps this alive; PostgREST wrapper goes away only when all reads move to Go BE | `bridge-acceptable-short-term` |
| `packages/database/src/supabase/client.ts:15` | `createBrowserClient` — browser-side Supabase JS client (auth + realtime + storage) | Must be replaced with a thin JWT-cookie client + Go BE WS client once realtime (§3.B) and storage (§3.C) are done | `blocks-full-exit` |
| `packages/database/src/supabase/middleware.ts:30` | `createServerClient` in Next.js middleware — refreshes JWT cookie on every request | Stays alive as long as GoTrue self-hosted issues cookies | `bridge-acceptable-short-term` |
| `apps/web/app/_lib/auth.ts:36-37` | `supabase.auth.getUser()` + `supabase.auth.getSession()` — extracts claims for Server Actions | No Go endpoint needed; stays until auth moves fully to Go-issued JWTs | `bridge-acceptable-short-term` |
| `apps/web/app/(auth)/login/actions.ts:98` | `supabase.auth.signInWithPassword(...)` — GoTrue login | GoTrue self-hosted keeps this; no Go endpoint owns login today | `bridge-acceptable-short-term` |
| `apps/web/app/api/auth/signout/route.ts:21` | `supabase.auth.signOut()` — GoTrue logout | Same — GoTrue self-hosted | `bridge-acceptable-short-term` |
| `apps/web/app/admin/settings/payments/actions.ts:77` | `supabase.auth.getSession()` — reads session for branch token | No Go endpoint yet — gap | `blocks-full-exit` |
| `apps/web/app/admin/settings/branches/actions.ts:59,94,123` | `supabase.auth.getSession()` × 3 — extracts JWT for branch operations | No Go endpoint yet — gap | `blocks-full-exit` |
| `apps/web/app/inventory/production-data.ts:119` | `supabase.auth.getSession()` | No Go endpoint yet | `blocks-full-exit` |
| `apps/web/app/menu/actions.ts:164,199,229,265,308,340,369,409` | `supabase.auth.getSession()` × 8 — passes JWT to Go BE via `goFetch` | Already feeds Go BE (menu handler) — session read is bridge only | `bridge-acceptable-short-term` |
| Multiple inventory pages (`transfers/[id]/page.tsx`, `stocktake/new/page.tsx`, etc.) | `supabase.auth.getSession()` × 10+ — used to gate page renders | No Go read endpoints for inventory pages yet — gap | `blocks-full-exit` |

### 1.B — PostgREST `.from()` reads

| File:line | Table / query | Go endpoint | Classification |
|---|---|---|---|
| `apps/web/app/admin/staff/[id]/permissions/page.tsx:78` | `.from("branches").select(...)` | No Go GET /branches endpoint | `blocks-full-exit` |
| `apps/web/app/admin/staff/[id]/permissions/page.tsx:95` | `.from("profiles").select(...)` | No Go endpoint | `blocks-full-exit` |
| `apps/web/app/admin/staff/audit/page.tsx:65` | `.from("branches").select(...)` | No Go endpoint | `blocks-full-exit` |
| `apps/web/app/api/ai/enrich-feedback/route.ts:96` | `.from("branches").select(...)` | No Go endpoint | `blocks-full-exit` |
| `apps/web/app/finance/reconciliation/page.tsx:22` | `.from("branches").select(...)` | No Go endpoint | `blocks-full-exit` |
| `apps/web/app/br/[branchId]/kds/hooks/use-kds-realtime.ts:~100` | `.from("orders").select(...)`, `.from("order_items").select(...)`, `.from("kitchen_send_batches").select(...)`, `.from("kds_tickets").select(...)` — full board snapshot refetch via PostgREST | No Go read endpoint for KDS snapshot — reads must move to Go before Supabase severed | `blocks-full-exit` |

### 1.C — PostgREST `.from()` writes (insert/update/delete/upsert)

| File:line | Table | Operation | Go endpoint | Classification |
|---|---|---|---|---|
| `apps/web/app/admin/settings/areas/actions.ts:130` | `area_branches` | insert | No Go endpoint | `blocks-full-exit` |
| `apps/web/app/admin/settings/tables/actions.ts:121` | `branch_zones` | insert | No Go endpoint | `blocks-full-exit` |
| `apps/web/app/admin/settings/tables/actions.ts:242` | `tables` | insert | No Go endpoint | `blocks-full-exit` |
| `apps/web/app/inventory/actions.ts:340` | `stock_movements` | insert | No Go endpoint | `blocks-full-exit` |
| `apps/web/app/inventory/issue-actions.ts:202` | `stock_issue_items` | upsert | No Go endpoint | `blocks-full-exit` |
| `apps/web/app/inventory/notifications-actions.ts:71` | `inventory_qc_settings` | upsert | No Go endpoint | `blocks-full-exit` |
| `apps/web/app/inventory/production-actions.ts:1153` | `production_recipes` | upsert | No Go endpoint | `blocks-full-exit` |
| `apps/web/app/inventory/transfer-actions.ts:541` | `stock_transfer_items` | upsert | No Go endpoint | `blocks-full-exit` |

### 1.D — `.rpc()` calls (PostgREST RPC — SECURITY DEFINER functions)

These all call Postgres SECURITY DEFINER RPCs via PostgREST. Many depend on `auth.uid()` / `auth.role()` internally. When PostgREST is removed, each must either move to Go BE (plain SQL with explicit tenant/user params) or be retired.

**POS / order flow (critical path):**

| File:line | RPC name | auth.uid()-dependent? | Go endpoint | Classification |
|---|---|---|---|---|
| `apps/web/app/br/[branchId]/pos/order-actions.ts:187` | `create_order` | likely yes (audit log) | No Go endpoint yet | `blocks-full-exit` |
| `apps/web/app/br/[branchId]/pos/order-actions.ts:899` | `append_order_items` | likely yes | No Go endpoint yet | `blocks-full-exit` |
| `apps/web/app/br/[branchId]/pos/order-actions.ts:1032` | `void_order_item` | likely yes | No Go endpoint yet | `blocks-full-exit` |
| `apps/web/app/br/[branchId]/pos/order-actions.ts:1162` | `reduce_order_item_quantity` | likely yes | No Go endpoint yet | `blocks-full-exit` |
| `apps/web/app/br/[branchId]/pos/order-actions.ts:1364` | `(unnamed rpc)` | unknown | No Go endpoint yet | `blocks-full-exit` |
| `apps/web/app/br/[branchId]/pos/order-actions.ts:1495` | `cancel_order` | likely yes | No Go endpoint yet | `blocks-full-exit` |
| `apps/web/app/br/[branchId]/pos/order-actions.ts:1582` | `transfer_order_table` | likely yes | No Go endpoint yet | `blocks-full-exit` |
| `apps/web/app/br/[branchId]/pos/order-actions.ts:1642` | `update_pos_order_status` | likely yes | No Go endpoint yet | `blocks-full-exit` |
| `apps/web/app/br/[branchId]/pos/order-actions.ts:1701` | `mark_order_item_served` | likely yes | No Go endpoint yet | `blocks-full-exit` |
| `apps/web/app/br/[branchId]/pos/payment-actions.ts:145` | `consume_stock_for_order` | likely yes | No Go endpoint yet | `blocks-full-exit` |
| `apps/web/app/br/[branchId]/pos/payment-actions.ts:604` | `create_payment` | likely yes | No Go endpoint yet | `blocks-full-exit` |
| `apps/web/app/br/[branchId]/pos/payment-actions.ts:865` | `confirm_payment_and_post` | likely yes | No Go endpoint yet | `blocks-full-exit` |
| `apps/web/app/br/[branchId]/pos/payment-actions.ts:1098` | `confirm_cash_payment` | likely yes | No Go endpoint yet | `blocks-full-exit` |
| `apps/web/app/br/[branchId]/pos/payment-actions.ts:1299` | `cancel_pending_payment` | likely yes | No Go endpoint yet | `blocks-full-exit` |
| `apps/web/app/br/[branchId]/pos/session-actions.ts:469` | `close_pos_session` | likely yes | No Go endpoint yet | `blocks-full-exit` |
| `apps/web/app/br/[branchId]/pos/print-actions.ts:58,109,226,293` | `enqueue_kitchen_print`, `enqueue_receipt_print`, `enqueue_provisional_bill`, `retry_print_job` × 4 | likely yes (audit) | No Go endpoint yet | `blocks-full-exit` |
| `apps/web/app/br/[branchId]/pos/discount-actions.ts:214,309,436,556` | `apply_order_discount`, `clear_order_discount`, `split_order`, `merge_orders` | likely yes | No Go endpoint yet | `blocks-full-exit` |
| `apps/web/app/br/[branchId]/pos/service-charge-actions.ts:134` | `set_order_service_charge` | likely yes | No Go endpoint yet | `blocks-full-exit` |
| `apps/web/app/br/[branchId]/kds/hooks/use-kds-mutations.ts:67,101` | `bump_kds_ticket`, `recall_kds_ticket` | likely yes | No Go endpoint yet | `blocks-full-exit` |

**Notifications (partially migrated):**

| File:line | RPC name | Note | Classification |
|---|---|---|---|
| `apps/web/app/_actions/notifications.ts:117` | `count_unread_notifications` | Go BE already has `GET /notifications/unread-count` — this FE call is the **stale PostgREST path** that should already be removed | `blocks-full-exit` |

**Permissions / ACL (PostgREST RPCs):**

| File:line | RPC name | Classification |
|---|---|---|
| `apps/web/app/_lib/permissions.ts:71,77,95` | `has_permission_any`, `has_permission` × 3 | `blocks-full-exit` |
| `apps/web/app/_lib/auth.ts:69,75` | `has_permission_any`, `has_permission` | `blocks-full-exit` |
| `apps/web/proxy.ts:217` | `can_read_procurement` (ACL check in proxy) | `blocks-full-exit` |
| `apps/web/app/admin/staff/[id]/permissions/actions.ts:44,69,92` | `grant_permission`, `revoke_permission`, `apply_template_to_user` | `blocks-full-exit` |
| `apps/web/app/admin/settings/kds/actions.ts:270` | `save_station_categories` | `blocks-full-exit` |
| `apps/web/app/admin/settings/printers/actions.ts:64` | `upsert_printer_with_routes` | `blocks-full-exit` |
| `apps/web/app/admin/settings/printers/jobs/actions.ts:29` | `retry_print_job` | `blocks-full-exit` |
| `apps/web/app/admin/staff/actions.ts:249,281` | `admin_update_profile`, `toggle_profile_active` | `blocks-full-exit` |
| `apps/web/app/admin/_lib/audit.ts:27` | `log_audit` | `blocks-full-exit` |
| `apps/web/app/admin/feedback/actions.ts:40` | `get_feedback_inbox` RPC | `blocks-full-exit` |

**Inventory (large surface — no Go endpoints yet):**

| File:line | RPC name | Classification |
|---|---|---|
| `apps/web/app/inventory/actions.ts:243,316,463,705` | `toggle_ingredient_active`, `has_permission`, `create_stocktake_session`, `complete_stocktake` | `blocks-full-exit` |
| `apps/web/app/inventory/grn-actions.ts:563,627,748,859,914,1023,1516` | `confirm_goods_receipt_note`, `amend_grn_line`, `create_grn_from_po`, RPC×2, `upsert_recipe_lines`×2 | `blocks-full-exit` |
| `apps/web/app/inventory/stocktake-actions.ts:67,127,191,284,315,337,380,434,482,618` | `start_stocktake`, `get_stocktake_lines_blind`, `submit_count_round`, `acquire_zone_lock`, `heartbeat_zone_lock`, `release_zone_lock`, `close_recount_round`, `escalate_round_4`, `finalize_stocktake`, `resolve_stocktake_conflict` | `blocks-full-exit` |
| `apps/web/app/inventory/transfer-actions.ts:150,428,462,530,572,596,617,656,674` | `has_permission`, `commit_intra_branch_transfer`, `create_stock_transfer_draft`, `has_permission`, `stock_transfer_confirm_ship`, `stock_transfer_mark_in_transit`, `stock_transfer_confirm_receive`, `stock_transfer_receive`, `stock_transfer_list_branches` | `blocks-full-exit` |
| `apps/web/app/inventory/supplier-return-actions.ts:108,156,197,224` | RPC×4 | `blocks-full-exit` |
| `apps/web/app/inventory/waste-actions.ts:88,156,208` | `create_waste_entry`, `approve_waste`, `inventory_shift_key` | `blocks-full-exit` |
| `apps/web/app/inventory/variance-actions.ts:43,122,192,250,300` | `get_grn_price_baseline`, `grn_is_auto_approvable`, `verify_branch_override_code`, `override_grn_hardblock`, `extend_express_window` | `blocks-full-exit` |
| `apps/web/app/inventory/production-actions.ts:833,1068,1200,1339,1457` | `upsert_production_recipe_lines`×2, `create_production_order`, `confirm_production_order`, `cancel_production_order` | `blocks-full-exit` |
| `apps/web/app/inventory/dashboard-actions.ts:79,178,227,261` | `get_inventory_dashboard`, `get_inventory_alerts`, `refresh_inventory_dashboard`, RPC | `blocks-full-exit` |
| `apps/web/app/inventory/report-actions.ts:87` | `get_food_cost` | `blocks-full-exit` |
| `apps/web/app/inventory/trust-actions.ts:58` | `compute_user_trust_score` | `blocks-full-exit` |
| `apps/web/app/inventory/issue-actions.ts:268` | `confirm_stock_issue` | `blocks-full-exit` |
| `apps/web/app/inventory/settings/thresholds/actions.ts:69` | RPC | `blocks-full-exit` |
| `apps/web/app/inventory/purchase-order-actions.ts:84` | RPC (PO sequence) | `blocks-full-exit` |
| `apps/web/app/inventory/document-correction-actions.ts:54` | `has_permission` | `blocks-full-exit` |
| `apps/web/app/inventory/_lib/feature-flags.ts:29` | `is_feature_enabled` | `blocks-full-exit` |
| `apps/web/app/inventory/transfers/[id]/receive/page.tsx:69` | `has_permission` | `blocks-full-exit` |

**Finance (large surface — no Go endpoints):**

| File:line | RPC name | Classification |
|---|---|---|
| `apps/web/app/finance/actions.ts:396,555,615,659,710,748,790,833,877,918,1043,1067` | `transition_tax_invoice_state`, `get_daily_revenue`, `get_revenue_rollup`, `get_revenue_kpis`, RPC, `get_orders_for_day`, `fn_reconcile_sales_by_day`, `get_cash_variance_summary`, `get_revenue_by_hour`, `get_revenue_by_cashier`, `get_top_items`, `refresh_finance_views` | `blocks-full-exit` |
| `apps/web/app/finance/accounting-actions.ts:207,252` | RPC, `get_food_cost` | `blocks-full-exit` |
| `apps/web/app/finance/statement-actions.ts:334,374,428,496` | `fn_generate_b01_dn`, `fn_generate_b02_dn`, `fn_generate_b03_dn`, RPC | `blocks-full-exit` |
| `apps/web/app/finance/period-actions.ts:131,179` | `close_fiscal_period`, `gl_reconciliation` | `blocks-full-exit` |
| `apps/web/app/finance/chart-of-accounts-actions.ts:24` | `seed_chart_of_accounts` | `blocks-full-exit` |
| `apps/web/app/finance/journal-actions.ts:202,234,261` | RPC×3 | `blocks-full-exit` |
| `apps/web/app/finance/reconciliation-actions.ts:74,99` | `fn_reconcile_period`, `fn_reconcile_drilldown` | `blocks-full-exit` |
| `apps/web/app/finance/reconciliation/page.tsx:21` | `find_payment_order_desync` | `blocks-full-exit` |

**HR / Employee:**

| File:line | RPC name | Classification |
|---|---|---|
| `apps/web/app/hr/shift-request-actions.ts:67,106` | RPC, `reject_shift_request` | `blocks-full-exit` |
| `apps/web/app/employee/profile/actions.ts:25` | `update_my_dependents_count` | `blocks-full-exit` |
| `apps/web/app/employee/shift-register/actions.ts:23,82` | RPC, `cancel_shift_request` | `blocks-full-exit` |
| `apps/web/app/employee/clock/actions.ts` | `auth.getSession()` used for clock-in | `blocks-full-exit` |

**Feedback / other:**

| File:line | RPC name | Classification |
|---|---|---|
| `apps/web/app/r/[token]/actions.ts:98` | `submit_feedback` | `blocks-full-exit` |
| `apps/web/app/api/webhooks/momo/route.ts:295` | RPC (MoMo payment confirm) | `blocks-full-exit` |
| `apps/web/app/api/cron/feedback-retention/route.ts:53` | RPC (retention) | `blocks-full-exit` |
| `apps/web/app/api/debug/claims/route.ts:47` | `has_permission` | `blocks-full-exit` |
| `apps/web/app/br/[branchId]/settings/pos-sessions/report-actions.ts:144` | `get_pos_session_report` | `blocks-full-exit` |
| `apps/web/app/br/[branchId]/menu-limits/actions.ts:54,115,187` | daily-limit RPCs ×3 | `blocks-full-exit` |
| `apps/web/app/br/[branchId]/pos/menu-actions.ts:127,236` | `get_branch_menu_daily_limits_for_pos`, RPC | `blocks-full-exit` |
| `apps/web/app/menu/actions.ts:447,1212,1292,1382` | `save_item_sides`×2, `save_item_variants`, `save_item_modifiers` | `blocks-full-exit` |
| `apps/web/lib/hddt-daily-summary.ts:91,121,175` | `aggregate_hddt`, `sign_hddt`, `finalize_hddt` RPC×3 | `blocks-full-exit` |

### 1.E — Storage calls (`supabase.storage.*`)

| File:line | Bucket | Operation | Go endpoint / plan | Classification |
|---|---|---|---|---|
| `apps/web/app/r/[token]/actions-photos.ts:90` | `feedback-photos` | upload | §3.C R2 — Go BE presigned URL handler not yet built | `blocks-full-exit` |
| `apps/web/app/r/[token]/actions-photos.ts:160` | `feedback-photos` | getPublicUrl | §3.C — same | `blocks-full-exit` |
| `apps/web/app/inventory/_components/photo-upload-input.tsx:73,84` | (bucket param) | upload + getPublicUrl | §3.C | `blocks-full-exit` |
| `apps/web/app/menu/menu-image-input.tsx:89,101` | `menu-item-images` | upload + getPublicUrl | §3.C | `blocks-full-exit` |
| `apps/web/app/menu/item-detail-dialog.tsx:83` | (menu image) | client-side storage op | §3.C | `blocks-full-exit` |
| `apps/web/app/api/cron/feedback-retention/route.ts:67,74,82,96` | `feedback-photos` | list + remove (retention cron) | §3.C — R2 lifecycle policy or Go cron | `blocks-full-exit` |

### 1.F — Realtime subscriptions (`supabase.channel` / `postgres_changes`)

All subscriptions go through `useRealtimeChannel` (`apps/web/app/_hooks/use-realtime-channel.ts`) which wraps `supabase.channel(...).on('postgres_changes', ...).subscribe()`. Every one must be ported to the Go BE WebSocket (`GET /realtime`, §3.B).

| File:line | Channel / table | Tables subscribed | Go WS topic | Classification |
|---|---|---|---|---|
| `apps/web/app/br/[branchId]/kds/hooks/use-kds-realtime.ts` | `kds-tickets-{branchId}` | `kds_tickets`, `orders` | `kds_tickets` LISTEN/NOTIFY — §3.B **in progress** (Phase 0.5) | `blocks-full-exit` |
| `apps/web/app/br/[branchId]/pos/hooks/use-order-sync.ts:290,404` | `pos-branch-{branchId}` | `orders`, `tables` | No Go WS topic yet | `blocks-full-exit` |
| `apps/web/app/br/[branchId]/pos/hooks/use-daily-limit-sync.ts:128` | daily-limits channel | `branch_menu_item_daily_limits` | §3.B listed — not yet built | `blocks-full-exit` |
| `apps/web/app/br/[branchId]/pos/pos-desktop-shell.tsx:256` | pos_sessions channel | `pos_sessions` | §3.B listed — not yet built | `blocks-full-exit` |
| `apps/web/app/br/[branchId]/pos/order-detail-sheet.tsx:462,506` | order detail channels | `orders`, `order_items` | No Go WS topic yet | `blocks-full-exit` |
| `apps/web/app/br/[branchId]/pos/printer-status-badge.tsx:107,112` | print_jobs channel | `print_jobs` | No Go WS topic yet | `blocks-full-exit` |
| `apps/web/app/br/[branchId]/pos/_components/bill/bill-receipt-sheet.tsx:598,604,616` | bill channels | `orders`, `payments` | No Go WS topic yet | `blocks-full-exit` |
| `apps/web/app/_hooks/use-notifications.ts:101,106` | notifications channel | `notifications` | No Go WS topic yet — **plan gap** (notifications realtime not mentioned in §3.B) | `blocks-full-exit` |
| `apps/web/app/orders/order-detail-sheet.tsx:199,205` | order-detail channel | `orders` | No Go WS topic yet | `blocks-full-exit` |
| `apps/web/app/finance/use-finance-realtime-refresh.ts:33,47` | finance channel | financial tables | No Go WS topic yet | `blocks-full-exit` |
| `apps/web/e2e/daily-limit-realtime.spec.ts` | E2E test — direct `createClient` from `@supabase/supabase-js` | N/A (test harness) | Must be rewritten against Go WS when §3.B lands | `blocks-full-exit` |

### 1.G — Package infrastructure

| File:line | Note | Classification |
|---|---|---|
| `packages/database/src/supabase/_env.ts` | Exports `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | `blocks-full-exit` — entire package goes away after full exit |
| `packages/database/src/supabase/service.ts` | Service-role client (`SUPABASE_SERVICE_ROLE_KEY`) | `blocks-full-exit` |
| `packages/database/src/index.ts:3` | Re-exports `createClient` from supabase/server | `blocks-full-exit` |
| `packages/database/src/types/database.types.ts` | `PostgrestVersion` type hint tying DB types to PostgREST wire format | Will become plain Postgres types after exit — `bridge-acceptable-short-term` |

---

## Part 2 — Go backend (`backend/`)

### 2.A — `SUPABASE_JWT_SECRET` env var

| File:line | Note | Classification |
|---|---|---|
| `backend/config/config.go:27` | `JWTSecret: os.Getenv("SUPABASE_JWT_SECRET")` | Env var **name** is Supabase-branded. The JWT validation logic itself is plain HMAC-HS256 and will work unchanged with GoTrue self-hosted (§3.A). Rename to `JWT_SECRET` before full exit. | `blocks-full-exit` |
| `backend/config/config.go:37` | Validation: `missing = append(missing, "SUPABASE_JWT_SECRET")` | Same rename needed | `blocks-full-exit` |
| `backend/internal/auth/jwt.go:6,33` | Comment "Supabase signs tokens with HS256 using SUPABASE_JWT_SECRET" | Cosmetic — not a blocker, but misleading post-exit | `already-clean` (comment only) |

### 2.B — `auth.uid()` avoidance (known trap — already handled)

| File:line | Note | Classification |
|---|---|---|
| `backend/internal/handler/notifications/handler.go:47-48` | Comment explicitly documents that `auth.uid()` returns NULL on pgxpool; code binds UUID explicitly as `$N::uuid` | **Already clean** — trap is documented and mitigated | `already-clean` |
| `backend/internal/handler/notifications/handler.go:134` | Comment: "count_unread_notifications() RPC uses auth.uid() which returns NULL — Direct query instead" | **Already clean** | `already-clean` |
| `backend/internal/handler/notifications/handler.go:195` | Comment: "mark_all_notifications_read() RPC uses auth.uid() — Direct INSERT instead" | **Already clean** | `already-clean` |
| `backend/internal/handler/menu/handler.go:1010` | Comment: "Bypass SECURITY DEFINER RPC — auth.* helpers NULL on pgxpool" | **Already clean** | `already-clean` |

### 2.C — `auth.users` FK references

| File:line | Note | Classification |
|---|---|---|
| `backend/internal/handler/staff/types.go:5` | `ID string // uuid from auth.users` | Comment only — UUID FK pattern is plain Postgres; stays valid with GoTrue self-hosted | `already-clean` |
| `backend/internal/auth/claims.go:38` | `UserUUID string // JWT sub — Supabase auth.users UUID, used for FK to profiles.id` | Comment only | `already-clean` |
| `backend/internal/handler/orders/handler.go:180` | `claims.UserUUID // profiles.id is UUID = auth.users.id = JWT sub` | Comment only | `already-clean` |

### 2.D — Realtime hub

| File:line | Note | Classification |
|---|---|---|
| `backend/internal/realtime/hub.go` | Go-native LISTEN/NOTIFY fan-out hub — **already built** (Phase 0.5). No Supabase realtime container dependency. | `already-clean` |

### 2.E — No PostgREST, storage, or `anon`/`service_role` role usage in Go code

Grepped — confirmed zero references. All Go DB access is via `pgxpool` with plain SQL. **Already clean.**

---

## Part 3 — print-agent (`apps/print-agent/`)

The print agent is a separate Node.js process that polls for print jobs using the Supabase service-role client directly.

| File:line | What it does | Classification |
|---|---|---|
| `apps/print-agent/src/index.ts:55-56` | `supabaseUrl: requireEnv("SUPABASE_URL")`, `serviceKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY")` — creates service-role Supabase client | `blocks-full-exit` |
| `apps/print-agent/src/index.ts:101` | `supabase.from("printer_agents").upsert(...)` — heartbeat write | `blocks-full-exit` — must be replaced with Go BE endpoint or direct pgxpool |
| `apps/print-agent/src/index.ts:166` | `supabase.rpc("claim_print_job", ...)` | `blocks-full-exit` |
| `apps/print-agent/src/index.ts:183` | `supabase.rpc("complete_print_job", ...)` | `blocks-full-exit` |
| `apps/print-agent/src/index.ts:273` | `supabase.rpc("expire_stuck_print_jobs", ...)` | `blocks-full-exit` |
| `apps/print-agent/.env.example` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` env vars | `blocks-full-exit` |

The print agent uses the Supabase Realtime to watch `print_jobs` via polling (not WebSocket subscription), but it calls PostgREST RPCs for job lifecycle. Replacement: expose Go BE endpoints for `claim_print_job`, `complete_print_job`, `expire_stuck_print_jobs`, or rewrite agent to use plain Postgres connection.

---

## Part 4 — Cross-reference with `docs/plan/db-migration-supabase-to-postgres.md`

### Items covered by the plan

| Blocker category | Plan section | Status |
|---|---|---|
| GoTrue auth (`supabase.auth.*`) | §3.A | Covered — GoTrue self-hosted bridges all `auth.*` calls |
| Realtime subscriptions (`supabase.channel` / `postgres_changes`) | §3.B | Covered — Go-native LISTEN/NOTIFY hub (Phase 0.5). Hub is built; FE rewire not yet done |
| Storage (`supabase.storage.*`) | §3.C | Covered — Cloudflare R2 + Go BE presigned URL handler |
| `SUPABASE_JWT_SECRET` rename | §3.A (implied) | Partially covered — §3.A says JWT validation unchanged; the env var rename is not explicitly called out |
| PostgREST `.rpc()` / `.from()` calls | §1 table row "PostgREST" | Covered by intent — "every `supabase.from(...)` call must move to the Go BE" — but no Go endpoints exist yet for the 60+ RPC call-sites |

### Plan gaps revealed by this audit

1. **Notifications realtime** (`use-notifications.ts:101` subscribes to `notifications` table) — §3.B lists only 4 realtime tables (`kds_tickets`, `kitchen_send_batches`, `branch_menu_item_daily_limits`, `pos_sessions`). `notifications` is missing from the §3.B table list. **Plan gap — add `notifications` to §3.B scope.**

2. **`orders`, `order_items`, `tables`, `payments`, `print_jobs` realtime** — `use-order-sync.ts`, `order-detail-sheet.tsx`, `bill-receipt-sheet.tsx`, `printer-status-badge.tsx`, and `pos-desktop-shell.tsx` all subscribe to tables not listed in §3.B. The plan only calls out 4 tables explicitly. In practice 9+ tables need LISTEN/NOTIFY triggers + Go WS topics. **Plan gap — expand §3.B subscriptions list.**

3. **print-agent replacement** — the print agent (`apps/print-agent/`) is not mentioned anywhere in the migration plan. It uses service-role PostgREST RPCs (`claim_print_job`, `complete_print_job`, `expire_stuck_print_jobs`) and writes directly to `printer_agents`. It must be rewritten or replaced before Supabase is severed. **Plan gap — add print-agent as an explicit workstream.**

4. **E2E test harness** — `apps/web/e2e/` has 8+ test files that import `@supabase/supabase-js` directly and use `supabase.auth.admin.listUsers()` (service-role Admin API). These are not production code but they block CI after cutover if not updated. **Plan gap — add E2E test harness migration to §4 Phase 5 prerequisites.**

5. **`SUPABASE_JWT_SECRET` rename** — the Go backend config (`backend/config/config.go:27`) requires an env var named `SUPABASE_JWT_SECRET`. After GoTrue self-hosted is running under a generic name, this should be renamed `JWT_SECRET` to remove the Supabase brand dependency. The plan does not call this out. **Plan gap — add env var rename to Phase 1 checklist.**

6. **`pg_notify` trigger deployment** — §3.B requires AFTER INSERT/UPDATE/DELETE triggers on realtime tables. The plan describes this but does not assign it as a migration file deliverable. Triggers must be in `supabase/migrations/` (a new migration file) to land on the new Postgres. **Plan gap — add migration file for §3.B triggers to Phase 0.5 deliverables.**

7. **Feature-flag RPC (`is_feature_enabled`)** used in `apps/web/app/inventory/_lib/feature-flags.ts:29` — no Go endpoint exists and this gates feature availability across inventory. Not mentioned in the plan. **Plan gap.**

---

## Appendix — Env vars that must be replaced at cutover

| Current var | Replacement | Used in |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `NEXT_PUBLIC_API_URL` (Go BE) + GoTrue URL | FE, e2e |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | removed (Go BE uses Bearer JWT) | FE |
| `SUPABASE_SERVICE_ROLE_KEY` | removed or replaced with internal service token | print-agent, e2e fixtures, service.ts |
| `SUPABASE_URL` (print-agent) | Go BE base URL or direct pgconn | print-agent |
| `SUPABASE_JWT_SECRET` (Go BE) | `JWT_SECRET` | backend/config |

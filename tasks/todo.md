# Current Tasks

> Active work tracker for the in-place `comtammatu` production track. v1.0.0 is operating on real branches; ongoing work is hardening + feature follow-ups. **Shipped history is condensed into one-line summaries** (durable detail lives in git, `tasks/regressions.md`, `tasks/lessons.md`); this file tracks ACTIVE + deferred work.

## Module status (snapshot)

M0–M7 + Auth v2 + POS PWA + Realtime hardening + Shadcn primitive migration M1–M9 — **all SHIPPED**. External integrations VietQR + Momo are wired with production credentials and active in real branches. HĐĐT is active through Viettel S-invoice only.

## Shipped (condensed — see git / `regressions.md` for detail)

- **Pilot hardening 2026-05-24** (`docs/worklog/pilot-hardening-readiness-2026-05-24.md`): snapshot-doc refresh, schema-spec source-ladder, App-Router route-group migration reconciled (`typecheck/lint/build` green), network-gate hardening, prod payment migrations confirmed.
- **Interface closure IF-001..012** (2026-05-24): retired `matu-*`/Be-Vietnam-Pro pilot layer; static UI guards (`lint:ui-contract`, `check-client-storage`); heading/icon/button/radius scale fixes; server-side GRN draft state; Finance-Basic landing (4 owner metrics).
- **Feedback /qa ISSUE-001..016** (2026-05-07/28): all shipped EXCEPT **ISSUE-004** (open below). CSP + security headers, photo-IDOR one-shot SHA-256 token, retention cascade, `feedback:view` defense-in-depth, inbox `(tenant,created_at)` index, unambiguous order-snapshot.
- **Pre-deploy + M4 Payments + M6 Finance P0** (2026-04-27..05-24, T3): employee FK casts, POS network gate D9, refund RPCs (`reverse_payment_and_post`/`create_refund`), webhook idempotency + MoMo tenant-binding + fail-hard stock + server-recompute total, audit-log RPC-only + PII strip, HĐĐT cancel-reason ≥20, Finance-Basic scope contract. Open follow-ups below.
- **Network gate D9 + Payment/HĐĐT integrations**: per-agent presence tokens + rate-limit + `has_permission()` RLS; VietQR + Momo live (prod creds, atomic webhook RPC); HĐĐT via Viettel S-invoice.
- **Sprint 6 Inventory UX**: F-017 PO display ID (`next_po_display_id`); Fix #3 server-side GRN drafts (Stage A/B/C — removed `localStorage`, drafts page, Sonner toasts).
- **2026-05-30 session** (git `ac95f841..43a3ec4b`): HĐĐT B2B double-issue guard; payroll-draft + attendance-bypass + `stock_transfer_items` + RLS-policy-dedup fixes; `requireBranchScope` ×22; clock-in graceful shift-window; baseline-first migration consolidation + managed-surfaces companion (see Architecture section below).

## Active hardening — agent-doable (not blocked)

- [x] **Attendance: employees can DELETE their own records** — FIXED 2026-05-30 (migration `20260602011000`): revoked DELETE on `attendance_records` from `authenticated`+`anon` (verified — only service_role keeps DELETE; UPDATE/SELECT stay RLS-gated for clock-out/read). No app code deletes attendance. It is now INSERT+DELETE service-role-only. Rule ATTENDANCE-INSERT-SERVICE-ROLE-ONLY extended.
- [~] **Broad `anon`/`authenticated` table privileges — AUDITED 2026-05-30** (DELETE surface): swept every public table with a DELETE-permitting policy for authenticated/anon. Conclusion: **well-controlled** — each is permission-gated (`has_permission`/`can_access_*`/`auth_role`/`_auth_v2_is_owner`), rpc-only/no-client-write, self-delete-own (benign), or branch-scoped app delete. **No tenant-only DELETE holes beyond the two already fixed** (attendance, `stock_transfer_items`). RESIDUAL (low priority, NOT exploitable via PostgREST): `anon`/`authenticated` still hold TRUNCATE/REFERENCES/TRIGGER on most tables — cosmetic over-grant from bootstrap `GRANT ALL`; tidy schema-wide if/when convenient. (Minor: `bmidl_write` still uses legacy `auth_role()` → folds into α4c.)
- [x] Drop legacy `employees_manage`/`shifts_manage` — verified ABSENT 2026-05-30: 0 references in app code, the active baseline, and matu-dev's policies/functions/data (Auth-v2/m4c3 already removed them). Nothing to drop.
- [ ] No audit on `insurance_base_salary`/`gross_salary` changes — BHXH compliance. (Low value while payroll is Excel-managed.)
- [ ] **`payroll-client.tsx` stale vs actions/types** (found 2026-05-30 attempting to remove its blanket `@ts-nocheck`): (1) `createPayrollPeriod({ periodMonth: <"YYYY-MM" string> })` but `createPeriodSchema` wants `{ month, year }` numbers → **creating a payroll period from the UI fails zod validation** (real runtime bug, latent while payroll is Excel-managed); (2) `formatMonth(period_month:number)` but `formatMonth` expects a `"YYYY-MM"` string; (3) the list reads `total_gross/total_si/total_pit/total_net`, absent from `PayrollPeriodRow` + the page query → always-empty columns. Fix path: decide wire per-period totals vs drop the 4 columns, fix the create-period args + formatMonth, then drop the `@ts-nocheck`. Deprioritized (HKD pilot runs payroll in Excel for <5 employees).
- [x] **ISSUE-004 — feedback photo branch-tight storage RLS** — DONE 2026-05-30: `feedback_photos_authenticated_select` now requires tenant-path match + the feedback row's `has_permission(branch, 'feedback:view')` (path `<tenant>/<feedback_id>/<file>`), not just tenant. Applied to matu-dev (verified branch-tight) + folded into `supabase/managed-surfaces.install.sql` for fresh envs. Source: archived migration `20260602004000`. Prod apply owner-gated (storage policy — now unblocked since MCP/owner can create `storage.objects` policies).

## Shell helpers refactor — 2026-05-27 (owner-decision: architecture-audit plan was DRAFT → approve or revert)

**Report:** `docs/worklog/shell-helpers-refactor-plan-2026-05-27.md`

> Verified state 2026-05-31 (todo had drifted from code — re-audited via `Skip withAction` counts + LoC).

> **Zero active `// Skip withAction` annotations remain (verified 2026-05-31).** The boilerplate-bypass goal of WS-1b/2 is closed. **Goal of the remaining work = reduce per-file pile-up of functions/features by splitting along concern boundaries — NOT a line count.** The plan's "≤800 / ≤400 / ≥30%" numbers are rough proxies only; success = each file owns one clear responsibility. The big action files still cram many actions into one module → decompose under WS-3.

- [x] **WS-0** — DONE: `apps/web/app/_lib/with-action.ts` carries `withActionPositional` + `customAuth` + `afterSuccess` + `argsToInput`; `_lib/rpc-error-map.ts` exists (`mapRpcError`/`includesAny`). Extended 2026-05-31 with additive `forbiddenError?` (custom denial copy; defaults to `FORBIDDEN_ERROR`, backward-compat for the ~20 existing callers; 3 regression tests added → `tests/with-action.test.ts` 21/21 pass).
- [x] **WS-1a** — DONE: `voidOrderItem` migrated (it is the documented `withActionPositional` example in `with-action.ts`).
- [x] **WS-1b** — DONE 2026-05-31 (skip-removal): all POS `Skip withAction` migrated with exact behavior parity — `fetchActiveOrders` + `fetchOrderDetail` (`customAuth: posUseAuth`; fetchOrderDetail keeps the in-handler `probePermission` UI hint), `closePosSession` (standard `roles+permission`), `openPosSession` (standard path + new `forbiddenError: "Không có quyền mở ca"` + `permissionBranchId` cashbox hint). `payment-actions.ts` was already 0-skip. **Pile-up NOT yet resolved** — `order-actions.ts` still holds ~12 actions + reads in one module; the concern-split is WS-3 (not a line-count fix). Gates: typecheck 6/6, lint 0-err, build 2/2. Live POS smoke still owner-gated.
- [x] **WS-2** — DONE 2026-05-31 (skip-removal): all inventory `Skip withAction` migrated — `updatePurchaseOrderStatus` (positional, exact), `fetchPoSuggestions` (object-input `withAction`; `poSuggestionsSchema` got per-level `"Dữ liệu không hợp lệ"` so the generic validation message survives the helper's `issues[0]` surfacing), `updateSupplier` (id-first merged `z.object({ id, ...supplierSchema.shape })` preserves the `"ID không hợp lệ"`-first ordering). grn/production/actions were already 0-skip. **Pile-up NOT yet resolved** — `grn-actions`/`production-actions`/`actions` each still cram many actions per file; concern-split is WS-3. Optional follow-up: route `lib/messages/inventory.ts` through `rpc-error-map.ts`.
- [~] **WS-3 — decomposition (IN PROGRESS).** Goal: each file owns ONE clear concern, **measured by cohesion, not a line count** (see memory `feedback-refactor-goal-separation-not-loc`). Pattern (proven on order-actions): split along responsibility lines into flat `*-actions.ts` siblings + a plain re-export barrel (NO `"use server"` on the barrel — it just re-exports the leaf `"use server"` actions; **build-verified** in Next 16) so caller import paths don't change. Bodies moved byte-exact (`sed`), only headers + barrel hand-written → `git diff -w` shows pure relocation.
  - [x] **`order-actions.ts`** — DONE 2026-05-31: 1619 → 37-line barrel; split into `order-reads.ts` (6 query actions, 800), `order-lifecycle.ts` (submit/append/updateStatus/markServed, 339), `order-void-actions.ts` (void/reduce/edit/cancel, `posVoidAuth`, 393), `order-adjust-actions.ts` (priority×2 + transfer, 120). typecheck 6/6 + lint 0-err + build 2/2 + web tests 117/117. (reads is 800 LoC but ONE concern = queries; fine per the cohesion goal — split further only if a sub-concern emerges.)
  - [~] **`grn-actions.ts`** (was 1572, a 4-concern pile-up) — IN PROGRESS: extracted the misplaced **Recipes** domain (central-kitchen WAC + menu-item recipes, 7 fns + CSV import/export) into `recipe-actions.ts` (684); grn-actions now 908. Sole direct importer `procurement-actions.ts` re-points to `./recipe-actions` (UI callers go through that aggregator, unchanged). typecheck 6/6 + lint 0-err + build 2/2 + tests 117/117. REMAINING in grn-actions: GRN-core + Supplier-Invoices (3 fns) + cross-domain `fetchRecentActivity` → optional further split (`supplier-invoice-actions.ts`).
  - [ ] **`production-actions.ts`** (1470, recipes vs orders — 2 concerns BUT ~20 shared helpers/types at top → needs a small shared module, more entangled than order-actions) and **`actions.ts`** (1433: ingredient/stock/stocktake/alert — note stocktake overlaps existing `stocktake-actions.ts`, resolve relationship first).
  - [ ] **Client shells** → `_hooks/` (state / realtime / actions) + `views/`: `pos-desktop-shell` (~1.7k), `grn-detail-client` (~1.5k), `order-detail-sheet` (~1.5k). Higher risk (realtime subscribe/unsubscribe) — needs running-app verify.
  - One PR per file. (Parallel `pos/hooks/` already retired under WS-4.)
- [x] **WS-4** — DONE 2026-05-31: `S12_DASHBOARD_V2` deleted + `S13A_STOCKTAKE_V2`→`INVENTORY_STOCKTAKE_REDESIGNED` (`inv_stocktake_redesigned`) enum + DB key (archived migration `20260602007000`) landed earlier; this slice finished the tail — URL token `stocktake_v2_not_enabled`→`stocktake_redesigned_not_enabled` (4 files) + merged `pos/hooks/`→`pos/_hooks/` (2 files, sole importer `pos-desktop-provider.tsx`). Exit grep clean; POS hook folder count==1; typecheck 6/6 + lint 0-err + build 2/2. Residual (out of scope): `messages.inventory.stocktake.v2` dict key; `kds/hooks/` uses a no-underscore convention (no drift — just differs from POS `_hooks/`).

## Owner-gated / pre-go-live (NOT via agent; NOT to matu-prod)

- [ ] Run real POS → payment → KDS/print → HĐĐT smoke in approved dev/test or staging with live provider credentials. [2026-05-28] `stock` leg dropped per owner policy "không trừ kho" (memory `project_pos_action_helper_refactor.md`; commit `e4eb93bc`); action-layer enforcement landed (`9ba83205`); **webhook stock-leg disable migration still pending owner authorize**.
- [ ] **Dead RPCs (13 candidates, greenfield P5)** — OWNER-GATED T3, NOT dropped: all on money/auth/order paths and the monorepo grep cannot see the Flutter/external clients, so "no caller" is not conclusive. Each needs per-RPC owner sign-off + external-client confirmation.
- [ ] Apply the 3 Phase-1 RLS fixes (now under `supabase/migrations/_archive/`: `20260602008000` payroll, `009000` attendance, `010000` dedup) to the live prod IF it still serves — OWNER-gated, NOT via agent, **NOT to matu-prod**. matu-dev + the baseline already include them.
- [ ] Uptime monitor on `/api/health` (UptimeRobot — ops, not code).

## Architecture / Schema / Migration (matu-dev) — 2026-05-30

> Owner approved rebuilding matu-dev ("không cần giữ nguyên"). matu-dev only; never matu-prod. Runbook: `docs/runbooks/matu-dev-migration-squash-2026-05-30.md`.

- ✅ **DONE (Phase 1 + 2):** RLS policy dedup (`20260602010000`, closed `stock_transfer_items` any-tenant read+write bypass) + schema-health verified clean; baseline-first consolidation — `supabase/migrations/00000000000000_baseline.sql` (validated: rebuilt matu-dev exactly, replays from empty, `db:types`/typecheck match), 379 files → `_archive/`, option X (prod keeps history); managed-surfaces companion `supabase/managed-surfaces.install.sql` (extensions/buckets/14 storage policies/realtime/cron); Docker-free libpq extract engine (default) + `db:types` matu-dev default. (git `60c81ffd`/`f92cc4d4`/`8f73885f`/`43a3ec4b`.)
- [x] **Phase 3** — DONE 2026-05-30: synced `docs/spec/database-schema.md` (snapshot → 118 tables/2 active migrations + baseline-first migration-layout section + live manifest) and `docs/CODEBASE_MAP.md` (counts 118 + baseline-first note) to the consolidated baseline.
- [ ] Unused indexes (~231 flagged on prod) — deferred: prod `stats_reset=NULL` + 77% `idx_scan=0` implausible (recent reset), not representative. Re-assess only after ≥1 business cycle incl. month-end.
- [ ] (cosmetic) Repair matu-dev `schema_migrations` history to baseline-first (schema already rebuilt from baseline).

## Deferred post-pilot

- [ ] **POS calls provider before DB lock** — RPC fail = orphan gateway order. **DEFER-WITH-MITIGATION** per m4 plan.
- [ ] **HĐĐT post-pilot (P0/P1/P2)**: reconcile cron for orphan `signing` (admin retry covers pilot); replace flow TT 78 (pilot cancel + manual portal); provider config via `system_settings` encrypted (env-only OK for single-tenant); PDF/XML persist + download UI (portal link OK); **3-way matching UI for `supplier_invoices`** (columns exist, no PO↔GRN↔Invoice workflow → 01/GTGT export blocked).
- [ ] **Branch Kitchen site split Phase 2**: dual-write + cutover; seed 1 `inventory_locations` kitchen/warehouse per branch; reduce `Kho CN → Bếp CN` state machine (`draft → confirmed`); intra-branch `Cấp bếp` atomic RPC.
- [~] OBSOLETE per owner policy 2026-05-28 "không trừ kho": the "RPC must resolve `default_consumption` or fail hard" item no longer applies (stock deduction disabled at payment flow). RPC `consume_stock_for_order` + action-layer callsites (`createPayment`/`confirmPayment`) can be removed in a separate slice when owner authorizes.
- [ ] **#3 optional post-deploy cleanup**: legacy-import shim for in-flight browser GRN drafts? stale-draft cleanup job (14d)?
- [ ] **F-018: Supplier "Khác"** — BLOCKED-PRODUCT. Need product input: (a) require formal NCC, (b) "Mua ngoài" + inline note, or (c) accept generic "Khác".
- [ ] **F-009: Stock master-detail as drawer** — invasive refactor; current side-panel acceptable.
- [ ] P3: Login rate limit fail-open when Upstash unreachable — documented design decision, needs observability.
- [ ] Legacy `auth_role()` RPC cleanup α4c — finish `can_access_branch` removal via a dedicated RLS-policy batch (α4b shipped: `20260601810000` rewrote `admin_update_profile`/`toggle_profile_active`/`set_branch_kind`).
- [ ] Inventory smoke regression runbook (`docs/runbooks/inventory/pre-release-qa.md`) — run periodically post-launch.
- [ ] Ops reconciliation query for Momo payment/order desync in `/admin/finance` (post-launch tooling).
- [ ] Automated E2E POS→payment→stock (before scale 3+ branches).
- [ ] Staging env / Vercel Preview (before external users).
- [ ] M7 BHXH/PIT calc wiring (Excel for pilot <5 employees).
- [ ] M6 VAS journal entries complete (CSV for accountant in pilot).
- [ ] Refunds table + flow (storage shipped; correctness gaps tracked under M4).
- [ ] M5-Ext S8 — yield factor + AP aging + consumption variance (not needed at 30–50 SKU).
- [ ] **H3: `area_manager` tenant-wide access scoping** — no area-scoping table exists. Either (a) `areas` + `staff_areas` join + migration, or (b) confirm tenant-wide is intended + rename role. Independent of the refund-flow `area_manager` TS-layer scope hole.
- [ ] **H3b: `has_permission()` dual-source flip** — defer until 2nd silent-demote incident (`tenants.owner_user_id` data foundation shipped `20260601500000`). Per ADR 0005.
- [ ] **transfer_ownership(p_new_user_id) RPC + UI** — blocked on business design (instant vs 2-phase, representative sync, audit shape, permission gate). Manual SQL UPDATE OK for pilot. ADR 0005.
- [ ] **L6: Finance migration chain ADR** — document the 5-migration finance chain ordering + rollback deps (non-blocking).
- [ ] **Dead RPC drop wave 2** (post-pilot) — needs `pg_stat_user_functions` telemetry from real pilot traffic. Tiers B/C/D per rule RPC-DROP-MUST-SCAN-6-CHANNELS.

## N/A while Má Tư is a Hộ Kinh Doanh (no formal BCTC)

- [ ] `voidJournalEntry` closed-period void still mutates signed BCTC — current-period reversal guard EXISTS (`20260527000000`); REMAINING: voiding a *posted* entry whose ORIGINAL `entry_date` is in a CLOSED period flips it → `voided` and statements (`statement-actions.ts:67,179`) filter `status='posted'` + `entry_date`, so the signed period changes retroactively. T3 decision: (A) reject void when original period closed [recommended], (B) keep original posted + only post reversal, (C) reports count reversed entries in original period. **DEFERRED 2026-05-30**: Hộ Kinh Doanh files no BCTC (TT 88/2021) → moot. Revisit only on conversion to a company form.

## Doc maintenance reminders

- When Inventory behavior changes → update `docs/ref/inventory.md` + `inventory-sop.md` + `docs/modules/web-app.md` + `docs/worklog/inventory/adoption-matrix.md` in the same PR.
- When the real stock-split phase ships → update active Inventory docs in the same slice.

## Post-v1.0 (Tier 2)

- [ ] Local-First Branch (mini PC + SQLite, offline POS/KDS)
- [ ] QR Self-Order tại bàn
- [ ] Loyalty / Vouchers
- [ ] CMS / CRM Foundation
- [ ] Advanced Analytics
- [ ] VNPay integration
- [ ] Employee portal full features
- [ ] **Native POS migration (PWA → Flutter Android)** — evaluate when pilot triggers: BT/USB printer fail >5%, cash-drawer auto-pop, e-wallet native SDK > deeplink, scale ≥20 branches. Stepping stone: Capacitor wrap before Flutter rewrite.

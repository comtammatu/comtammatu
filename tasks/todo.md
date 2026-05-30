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
- [ ] Drop legacy `employees_manage`/`shifts_manage` if any still active (m4c3 cleanup audit).
- [ ] No audit on `insurance_base_salary`/`gross_salary` changes — BHXH compliance. (Low value while payroll is Excel-managed.)
- [ ] **`payroll-client.tsx` stale vs actions/types** (found 2026-05-30 attempting to remove its blanket `@ts-nocheck`): (1) `createPayrollPeriod({ periodMonth: <"YYYY-MM" string> })` but `createPeriodSchema` wants `{ month, year }` numbers → **creating a payroll period from the UI fails zod validation** (real runtime bug, latent while payroll is Excel-managed); (2) `formatMonth(period_month:number)` but `formatMonth` expects a `"YYYY-MM"` string; (3) the list reads `total_gross/total_si/total_pit/total_net`, absent from `PayrollPeriodRow` + the page query → always-empty columns. Fix path: decide wire per-period totals vs drop the 4 columns, fix the create-period args + formatMonth, then drop the `@ts-nocheck`. Deprioritized (HKD pilot runs payroll in Excel for <5 employees).
- [ ] **ISSUE-004 — feedback photo branch-tight storage RLS** — gate photo access by branch (encode branch_id in path, or JOIN to `feedbacks` for a `has_permission` check). Local migration/regression added 2026-05-28. **UNBLOCKED 2026-05-30**: the earlier premise ("dev apply blocked — MCP/linked role not owner of `storage.objects`") no longer holds — the management/MCP role CAN create `storage.objects` policies (verified while restoring the 14 storage policies this session). So this can be implemented + applied. (A *plain* migration role may still need `supabase_storage_admin`; the managed-surfaces companion documents that.)

## Shell helpers refactor — 2026-05-27 (owner-decision: architecture-audit plan was DRAFT → approve or revert)

**Report:** `docs/worklog/shell-helpers-refactor-plan-2026-05-27.md`

- [ ] **WS-0** — Extend `apps/web/app/_lib/with-action.ts` with `withActionPositional` + `customAuth` + `afterSuccess`; add `_lib/rpc-error-map.ts`. Zero callers migrated.
- [ ] **WS-1a** — Migrate `voidOrderItem` only (proving slice; exercises 4/4 new helper features).
- [ ] **WS-1b** — Migrate remaining POS actions (`order-actions.ts` + `payment-actions.ts`). In progress 17/23 (2026-05-28). Remaining: confirmPayment + confirmVietQrPayment + confirmVietQrPaymentWithInvoice (last 3 callers of local `mapPaymentRpcError`) + confirmCashPaymentWithInvoice + 2 order-actions.ts reads with `probePermission` composite auth.
- [ ] **WS-2** — Migrate inventory actions (`grn-actions.ts`, `production-actions.ts`, `actions.ts`). Wire `lib/messages/inventory.ts` through `rpc-error-map.ts`.
- [ ] **WS-3** — Decompose client shells (pos-desktop-shell, grn-detail-client, order-detail-sheet) one PR each. Retire parallel `pos/hooks/` folder.
- [ ] **WS-4** — Version-naming cleanup: delete dead `S12_DASHBOARD_V2`, rename `S13A_STOCKTAKE_V2` → `INVENTORY_STOCKTAKE_REDESIGNED` (+ DB migration of `branch_feature_flags.flag_key`), fix orphan `waste_v2_not_enabled` URL token.

## Owner-gated / pre-go-live (NOT via agent; NOT to matu-prod)

- [ ] Run real POS → payment → KDS/print → HĐĐT smoke in approved dev/test or staging with live provider credentials. [2026-05-28] `stock` leg dropped per owner policy "không trừ kho" (memory `project_pos_action_helper_refactor.md`; commit `e4eb93bc`); action-layer enforcement landed (`9ba83205`); **webhook stock-leg disable migration still pending owner authorize**.
- [ ] **Dead RPCs (13 candidates, greenfield P5)** — OWNER-GATED T3, NOT dropped: all on money/auth/order paths and the monorepo grep cannot see the Flutter/external clients, so "no caller" is not conclusive. Each needs per-RPC owner sign-off + external-client confirmation.
- [ ] Apply the 3 Phase-1 RLS fixes (now under `supabase/migrations/_archive/`: `20260602008000` payroll, `009000` attendance, `010000` dedup) to the live prod IF it still serves — OWNER-gated, NOT via agent, **NOT to matu-prod**. matu-dev + the baseline already include them.
- [ ] Uptime monitor on `/api/health` (UptimeRobot — ops, not code).

## Architecture / Schema / Migration (matu-dev) — 2026-05-30

> Owner approved rebuilding matu-dev ("không cần giữ nguyên"). matu-dev only; never matu-prod. Runbook: `docs/runbooks/matu-dev-migration-squash-2026-05-30.md`.

- ✅ **DONE (Phase 1 + 2):** RLS policy dedup (`20260602010000`, closed `stock_transfer_items` any-tenant read+write bypass) + schema-health verified clean; baseline-first consolidation — `supabase/migrations/00000000000000_baseline.sql` (validated: rebuilt matu-dev exactly, replays from empty, `db:types`/typecheck match), 379 files → `_archive/`, option X (prod keeps history); managed-surfaces companion `supabase/managed-surfaces.install.sql` (extensions/buckets/14 storage policies/realtime/cron); Docker-free libpq extract engine (default) + `db:types` matu-dev default. (git `60c81ffd`/`f92cc4d4`/`8f73885f`/`43a3ec4b`.)
- [ ] **Phase 3** — sync `docs/spec/database-schema.md` + `docs/CODEBASE_MAP.md` to the consolidated baseline.
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

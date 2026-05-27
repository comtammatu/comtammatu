# Current Tasks

> Active tracker for the in-place `comtammatu` pilot/hardening path.
> Completed implementation detail belongs in worklogs, module docs, or archive plans; this file should stay focused on decisions and work still open.
> Updated: 2026-05-27.

## Current Snapshot

- M0-M7 + Auth v2 + POS PWA + Realtime hardening + Shadcn primitive migration M1-M9 are shipped. Historical roadmap: `docs/archive/plan/roadmap.md`.
- Active production path remains PWA-first. Native POS migration is post-v1.0 and evidence-driven.
- New-project upgrade prep is packaging only. Baseline source: `docs/plan/new-project-upgrade-baseline.md`.
- Greenfield rebuild/cutover material under `docs/archive/plan/system-rebuild/` is suspended historical reference unless the owner explicitly reactivates it.

## P0 - Pilot / Go-Live Gates

- [ ] Confirm prod apply status for payment/hardening migrations before live go-live: `webhook_events`, `complete_payment_and_consume_stock`, `confirm_cash_payment`, `confirm_vietqr_payment`, branch network-gate RLS, and print-agent presence-token migrations.
- [ ] Run real POS -> payment -> stock -> KDS/print -> HĐĐT smoke in an approved dev/test or staging environment with live provider credentials.
- [ ] Wire/verify VietQR real bank API credentials.
- [ ] Wire/verify MoMo real API credentials and merchant capability for native QR (`qrCodeUrl` only; do not encode `payUrl` or deeplink as QR).
- [ ] Smoke MoMo webhook callback through atomic payment completion and stock consumption after prod/staging migration status is proven.
- [ ] Provision one raw print-agent presence token per branch agent through `pnpm --filter @comtammatu/print-agent presence:provision -- create ...` before network-gated live smoke.
- [ ] Run payment/order/HĐĐT reconciliation query before live MoMo/VietQR go-live.
- [ ] Run Inventory smoke pre-pilot using `docs/runbooks/inventory/pre-release-qa.md`.
- [ ] Set up uptime monitoring for `/api/health` (ops task, not code).

## New-Project Baseline Prep

- [x] Produce read-only managed Supabase surface manifest for `auth`, `storage`, `cron`, `realtime`, `extensions`, auth hook/config, and Data API grant caveats: `docs/plan/supabase-managed-surfaces-baseline.md`.
- [x] Convert the managed Supabase surface manifest into install SQL/config: `docs/plan/supabase-managed-surfaces-install-bundle.sql`.
- [x] Apply pre-public managed surfaces to greenfield target `staging` / `jmasiwuqiyedqvyfzhuq`: required extensions and storage bucket config.
- [x] Restore a clean live-schema-first public schema candidate into greenfield target `staging` / `jmasiwuqiyedqvyfzhuq`.
- [x] Run post-public managed-surface install section on `staging`: storage policies, realtime publication, DB cron jobs, and auth hook grant verification.
- [x] Regenerate DB types from the restored greenfield schema.
- [x] Run the full repo gate after greenfield restore documentation updates.
- [x] Audit restored greenfield schema for legacy/dead-code carryover: `docs/plan/greenfield-schema-legacy-audit.md`.
- [x] Apply greenfield schema hardening for non-role-bridge findings: RPC grant allowlist, `printer_agent_status` security-invoker fix, direct MV API revoke, storage listing tighten, service-only table grant cleanup, internal deny policies, and function `search_path` pinning.
- [x] Remove active app/E2E direct reads of `positions.legacy_role_code`; staff admin now reads canonical position code/label and baseline hygiene guards the bridge column outside generated DB types.
- [ ] Triage remaining Supabase advisors on greenfield `staging` before any cutover: app-called SECURITY DEFINER RPC exposure, unindexed FKs, and multiple permissive policies.
- [ ] Decide/refactor the strict-greenfield role bridge: `positions.legacy_role_code`, JWT `user_role`, route ACL, and remaining `auth_role()` RLS/RPC usage.
- [ ] Run live data audit before any greenfield data cutover: row counts, table sizes, last writes, FK graph, storage object counts/checksums, provider identifier manifest, prod apply proof, and queue-state decisions.
- [ ] Resolve POS payment/stock mutation contract: current `comtammatu` consumes stock on payment completion; `matu-platform` treats POS/KDS events as report estimates unless a transfer/ledger contract says otherwise.
- [x] Owner chose same-stack green baseline target `staging` / `jmasiwuqiyedqvyfzhuq` for restore rehearsal.

## Security / Compliance Backlog

### Feedback Module

- [ ] **ISSUE-002** - Photo upload IDOR: mint per-submission upload token in `submit_feedback` RPC and consume it in `uploadFeedbackPhotos`.
- [ ] **ISSUE-004** - Tighten photo storage RLS to gate by branch.
- [ ] **ISSUE-005** - Cascade photo storage objects in `feedback_retention_cleanup()` to prevent forever-orphans.
- [ ] **ISSUE-006** - Defense-in-depth: re-check `feedback:view` permission in `getFeedbackPhotoUrls`.
- [ ] **ISSUE-010** - Add `(tenant_id, created_at DESC)` index for tenant-wide inbox queries.
- [ ] **ISSUE-011** - Fix order snapshot heuristic for shared tables.

### Payments / Finance

- [ ] **POS calls provider before DB lock** - RPC fail can create an orphan gateway order. Current stance: defer with mitigation per `docs/archive/plan/m4-payments-fix.md`.
- [ ] `voidJournalEntry` post-close period guard - invalidates signed BCTC if missing.
- [ ] Refund action follow-up: after owner applies refund RPC migrations, swap direct refund writes to `reverse_payment_and_post` / `create_refund` and close the area-manager scope hole.

### HĐĐT

- [ ] **P0 post-pilot** - HĐĐT reconcile cron for orphan `signing` rows.
- [ ] **P0 post-pilot** - HĐĐT replace flow (TT 78).
- [ ] **P1 post-pilot** - HĐĐT provider config through encrypted `system_settings`.
- [ ] **P1 post-pilot** - HĐĐT PDF/XML persist + download UI.
- [ ] **P2** - 3-way matching UI for `supplier_invoices` (PO -> GRN -> supplier invoice).

### Payroll / Auth

- [ ] `payroll_entries_select` RLS - add paid-period guard for self branch.
- [ ] Guard `branch_manager` with null `branch_id` from tenant-wide writes at action level.
- [ ] Replace all-day reusable HMAC clock-in code with per-shift TOTP or active `shift_assignments` check.
- [ ] Add audit for `insurance_base_salary` / `gross_salary` changes.
- [ ] Drop legacy `employees_manage` / `shifts_manage` if still active.
- [ ] Finish remaining `can_access_branch` migration away from `auth_role()` via a separate RLS-policy batch.
- [ ] Login rate limit fail-open when Upstash is unreachable - accepted design decision, still needs observability.

## Inventory / Branch Operations Backlog

### Branch Kitchen Site Split

- [ ] Phase 2 dual-write + cutover for `inventory_locations`.
- [ ] Seed one kitchen/warehouse `inventory_locations` pair per branch with `is_default_consumption`.
- [ ] Simplify Kho CN -> Bếp CN state machine to `draft -> confirmed`.
- [ ] Implement one-step intra-branch transfer RPC for `Kho CN -> Bếp CN` (`Cấp bếp`).
- [ ] Make `consume_stock_for_order` resolve `default_consumption`; if missing, fail hard with setup gate, no silent fallback.

### Inventory UX Follow-Up

- [ ] Decide whether to add a one-time legacy-import shim for in-flight browser GRN drafts.
- [ ] Decide whether to add a stale GRN draft cleanup job (14d retention).
- [ ] **F-018: Supplier "Khác"** - blocked on product decision: formal supplier only, "Mua ngoài" + note, or generic catch-all.
- [ ] **F-009: Stock master-detail as drawer** - invasive refactor; current side panel is acceptable.

### Documentation Reminder

- When Inventory behavior changes, update `docs/ref/inventory.md`, `docs/ref/inventory-sop.md`, `docs/modules/web-app.md`, and `docs/worklog/inventory/adoption-matrix.md` in the same PR.
- When real location split ships, update active Inventory docs and keep `docs/archive/plan/inventory-location-ledger.md` as historical context only.

## Deferred To Post-Pilot

- [ ] Automated E2E POS -> payment -> stock (P2, before scaling to 3+ branches).
- [ ] Staging env / Vercel Preview (P2, before external users).
- [ ] M7 BHXH/PIT calculation wiring (Excel is acceptable for pilot under 5 employees).
- [ ] M6 VAS journal entries complete enough for accounting export (CSV is acceptable for pilot).
- [ ] Refunds table + full user-facing flow.
- [ ] M5-Ext S8 - yield factor + AP aging + consumption variance.
- [ ] H3b `has_permission()` dual-source flip - defer until the second silent-demote incident.
- [ ] `transfer_ownership(p_new_user_id UUID)` RPC + UI - blocked on business design.
- [ ] ADR 0006 for finance migration-chain ordering and rollback dependencies.
- [ ] Dead RPC drop wave 2 - requires `pg_stat_user_functions` telemetry from real pilot traffic.

## Post-v1.0 / Tier 2

- [ ] Local-First Branch (mini PC + SQLite, offline POS/KDS).
- [ ] QR Self-Order at table.
- [ ] Loyalty / vouchers.
- [ ] CMS / CRM foundation (`docs/archive/plan/sprint-8.md`).
- [ ] Advanced analytics.
- [ ] VNPay integration.
- [ ] Employee portal full features.
- [ ] Native POS migration (PWA -> Flutter Android) - evaluate only when pilot evidence shows PWA is insufficient: BT/USB printer fail >5%, cash drawer auto-pop required, e-wallet native SDK beats deeplink, or scale reaches 20+ branches. Stepping stone: Capacitor wrap before Flutter rewrite.

## Historical References

- Pilot hardening readiness: `docs/worklog/pilot-hardening-readiness-2026-05-24.md`.
- New-project upgrade cleanup: `docs/worklog/new-project-upgrade-cleanup-2026-05-26.md`.
- Interface closure audit: `docs/worklog/interface-issue-closure-2026-05-24.md`.
- UI design-system SSOT audit: `docs/worklog/ui-design-system-ssot-audit-2026-05-24.md`.
- Historical platform fork prep: `docs/archive/plan/platform-fork-2026.md`; owner abandoned the fork strategy on 2026-05-06.
- Origin branches `d011-v2` and `d011-spike` are historical S-invoice/MISA references only; Viettel S-invoice is the active provider contract.

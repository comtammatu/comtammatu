# Current Tasks

> Active work only. Shipped/history context → `docs/plan/system-rebuild/` and `docs/archive/plan/roadmap.md`. Updated: 2026-05-09.

## Module status (snapshot)

M0–M7 + Auth v2 + POS PWA + Realtime hardening + Shadcn primitive migration M1–M9 — **all SHIPPED**. External integrations (VietQR/Momo/Viettel S-invoice HĐĐT real APIs) blocked on credentials. Historical roadmap context lives under `docs/plan/system-rebuild/` and `docs/archive/plan/`.

## Strategic fork prep

- [x] Draft fork-based platform preparation plan: `docs/plan/platform-fork-2026.md`.
- [x] Create local preparation folder: `/Users/luongthebinh/Downloads/matu-pros`.
- [x] Draft Cloudflare-first minimal stack decisions: `/Users/luongthebinh/Downloads/matu-pros/STACK_DECISIONS.md`.
- [x] Draft stack research matrix: `/Users/luongthebinh/Downloads/matu-pros/STACK_RESEARCH.md`.
- [x] Add Vercel reuse analysis and reject Neon/Vercel-managed Postgres.
- [x] Clarify Flutter scope as Android and iOS mobile app only; admin web is a separate decision.
- [x] Lock mobile target: build Android and iOS together from the first Flutter scaffold.
- [x] Confirm admin web fallback: Next.js on Vercel is acceptable if approved separately.
- [x] Add canonical stack lock: `/Users/luongthebinh/Downloads/matu-pros/STACK_LOCK.md`.
- [x] Debate Redis/Bun: no Redis in bootstrap; Node LTS + pnpm is default tooling; Bun is out of bootstrap.
- [x] Owner decision: fork preparation workspace name/location is `/Users/luongthebinh/Downloads/matu-pros`.
- [x] **Fork strategy abandoned (2026-05-06)** — owner decision: tiếp tục phát triển trên source code cũ (`comtammatu`). Fork init, greenfield/migrated-data pilot decision, và 4-perspective debate trong fork đều dropped.

## Known issues

### Feedback module — from /qa pass 2026-05-07 (production read-only)
**Report:** `.gstack/qa-reports/qa-report-feedback-module-2026-05-07.md` (health score 63.5/100, 14 findings)

**HIGH (do these first):**
- [ ] **ISSUE-001** — Verify `ALLOWED_ORIGINS_FEEDBACK` env in production. Code now fails closed if empty (`packages/shared/src/feedback/env.ts`, `apps/web/app/r/[token]/actions.ts`); owner still needs production env verification.
- [x] **ISSUE-012** — Add 5 missing security headers via `next.config.ts headers()`: CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy. Set `poweredByHeader: false` for ISSUE-014. Fixed 2026-05-09.

**MEDIUM:**
- [ ] **ISSUE-002** — Photo upload IDOR: mint per-submission upload token in `submit_feedback` RPC, consume in `uploadFeedbackPhotos` (`apps/web/app/r/[token]/actions-photos.ts`)
- [ ] **ISSUE-003** — Replace fire-and-forget `fetch()` for telegram-flush + AI enrichment with `after()` from `next/server` (Next.js 15+). Or move to existing crons.
- [ ] **ISSUE-004** — Tighten photo storage RLS to gate by branch (encode branch_id in path or JOIN to feedbacks for has_permission check)
- [ ] **ISSUE-013** — `/r/[token]/thank-you` should `notFound()` for invalid/unknown tokens (phishing vector — bogus thank-you renders branded "Cảm ơn bạn đã góp ý!")

**LOW / INFO (nice to have):**
- [ ] **ISSUE-005** — Cascade photo storage objects in `feedback_retention_cleanup()` to prevent forever-orphans
- [ ] **ISSUE-006** — Defense-in-depth: re-check `feedback:view` permission in `getFeedbackPhotoUrls`
- [ ] **ISSUE-007** — Log honeypot hits at INFO level + `bot_attempts` counter
- [ ] **ISSUE-008** — Sanitize-then-length-check on client OR server returns specific error when sanitization-driven
- [ ] **ISSUE-009** — Add `?only_suspect=true` URL param for spam triage workflow
- [ ] **ISSUE-010** — Add `(tenant_id, created_at DESC)` index for tenant-wide inbox queries
- [ ] **ISSUE-011** — Order snapshot heuristic broken for shared tables (data quality)
- [x] **ISSUE-014** — Disable `X-Powered-By: Next.js` header (one-line: `poweredByHeader: false`). Fixed 2026-05-09.
- [ ] **ISSUE-015** — Document layered CSRF defense in `actions.ts` + add startup assertion that `ALLOWED_ORIGINS_FEEDBACK` is set in production (architect-flagged)
- [ ] **ISSUE-016** — Replace `actions-photos.ts:119` `update photo_paths = X` with conditional `UPDATE ... WHERE photo_paths = '{}' RETURNING id` to close TOCTOU race (architect-flagged)

**Fix strategy:** all on a feature branch `fix/qa-feedback-2026-05-07` + PR for owner review. Each commit is atomic with regression test in `packages/shared/src/feedback/__tests__/` or `apps/web/__tests__/`.

### Other
- [ ] P3: Login rate limit fail-open khi Upstash unreachable — documented design decision, cần observability
- [ ] Legacy `auth_role()` RPC cleanup — batch α4b migration drafted in `supabase/migrations/20260601800000_auth_v2_legacy_rpc_live_role_cutover.sql`: live-role cutover for `admin_update_profile`, `toggle_profile_active`, `can_access_branch`; branch-scoped permission cutover for `bump_kds_ticket` / `recall_kds_ticket`. After owner applies to dev/test, run DB audit to confirm remaining active functions vs historical migration references.

## Active branches (in flight, on origin)

- `m4-payments-fix` (75e8250, 2026-04-29) — foundation slice of m4-payments-fix.md: 2 migrations + with-action.ts requireBranchScope + redactCredentials utility + 7 new regression rules. AWAITING `supabase db push` + `pnpm db:types`. Next slice wires reverse_payment_and_post RPC, recompute_total, and TS callers.
- `d011-v2` (f051e8e, 2026-04-29) — D011 v2 no-wait pieces: provider resolver + LocalMisaProvider + ADR + runbook. Sequenced AFTER m4 lands. Spike branch `d011-spike` preserved as v1 reference (never to merge).

## Pre-deploy fixes

- [x] **Employee page FK casts** (2026-04-27): `pnpm db:types` regen + treat M:1 FK joins as object (`r.shifts?.name`, not `?.[0]?.name`) in `app/employee/{attendance,payslip,schedule}/page.tsx`. See lesson #10 — supabase-js typegen quirk: `isOneToOne: false` infers array but PostgREST runtime returns single object for M:1.
- [x] **POS network gate D9** (2026-04-27): `branch_trusted_egress_ips` + `/api/branch-presence` Bearer endpoint + admin dialog wired into branch table. Proxy bypass for presence endpoint (without it, agent POSTs were redirected to /login).
- [x] **Stale shift_assignments_select RLS** (2026-04-27): tightened to self + permission; tenant-wide leak closed.
- [x] **refunds table** (2026-04-27): table now exists; `@ts-nocheck` removed from `app/orders/refund-actions.ts`. STORAGE ONLY — see P0 list below for correctness gaps.
- [x] **m4 P1-A webhook_events idempotency table** (2026-04-29, branch m4-payments-fix): UNIQUE(provider, request_id), RLS for finance:view, GRANTs. AWAITING APPLY.
- [x] **m4 P1-E with-action.ts requireBranchScope option** (2026-04-29, branch m4-payments-fix): branch_manager/cashier with null branch_id rejected before widening to tenant. Opt-in; callers wire in next slice.
- [ ] Inventory smoke pre-pilot theo `docs/runbooks/inventory/pre-release-qa.md`
- [ ] Uptime monitor on `/api/health` (UptimeRobot — ops, không phải code)
- [ ] Ops reconciliation query trước Momo go-live — payment/order desync surfacing trong /admin/finance
- [ ] Momo webhook atomic `complete_payment_and_consume_stock` RPC (khi M4 wired)

## P0 from security review 2026-04-27 (block pilot — need 4-perspective debate)

> Full findings under each agent in session log. Quick wins applied above; these need design.

### M4 Payments — see `docs/plan/m4-payments-fix.md` (drafted 2026-04-28); foundation slice on `m4-payments-fix` branch (2026-04-29)
- [x] **`approveRefund` doesn't actually refund** — RPC `reverse_payment_and_post` shipped 2026-04-30 (`20260510020000_m4_reverse_payment_and_post_rpc.sql`). Atomic: GL reversal + stock restore + payment+order status flip + audit. Hardcoded VAS accounts (5111/1111/1121) for pilot; post-pilot move to posting_rules-driven if needed. **WAITING:** owner apply + TS edit to refund-actions.ts to call the RPC.
- [x] **Refund `payment.status='completed'` precondition** — RPC `create_refund` shipped 2026-04-30 (`20260510030000_m4_create_refund_rpc.sql`). Rejects anything but completed; enforces cumulative refund cap. **WAITING:** owner apply + TS edit to refund-actions.ts to swap direct INSERT for the RPC. **Refund auth `area_manager` scope hole** still applies at the action layer (RPC delegates role/area scope to TS wrapper) — fix in TS edit slice.
- [ ] **MoMo webhook tenant binding hole** — `provider_ref=orderId AND method='momo'` with no `tenant_id`. Leaked secret + collision = cross-tenant payment forgery. Need partnerCode + tenant verify before RPC. **WAITING:** TS edit to momo webhook after types regenerate.
- [ ] **Stock consumption fail-soft on hot-path** — webhook doesn't check `result.stock_consumed` from `complete_payment_and_consume_stock`; money paid + zero stock deducted silently. **STAGED:** `payments.stock_consumed_status` column added on m4-payments-fix branch. **WAITING:** RPC body rewrite + caller integration.
- [ ] **Server-recompute `total_amount`** missing in `confirm_cash_payment`/`complete_payment_and_consume_stock` — discount_amount tampering vector. **WAITING:** payment_recompute_total migration in next slice.
- [x] **Webhook idempotency table** (2026-04-29, m4-payments-fix branch): `webhook_events(provider, request_id, ...)` with UNIQUE constraint shipped. AWAITING APPLY.
- [ ] **POS calls provider before DB lock** — RPC fail = orphan gateway order. **DEFER-WITH-MITIGATION** per m4 plan.

### M6 Finance
- [x] **Audit log INSERT REVOKE + `log_audit()` SECURITY DEFINER RPC** (2026-04-28). Migration `20260505020000_audit_logs_rpc_only_insert.sql`; helper at `apps/web/app/admin/_lib/audit.ts` wraps the RPC; 7 callers in finance/HR drop `tenantId`/`userId` (forced server-side). See regression rule AUDIT-LOG-INSERT-RPC-ONLY.
- [x] **HĐĐT `cancel reason` min 20 chars** (2026-04-28). Schema dropped `.optional()`, UI collects via Textarea with counter, removed `"Hủy theo yêu cầu"` 15-char placeholder fallback. NĐ70/2025 compliant. See regression rule HDDT-CANCEL-REASON-MIN-20.
- [x] **`fetchAuditLogs` PII strip** (2026-04-28). Replaced `.select("*")` with explicit `id, action, entity_type, entity_id, user_id, created_at`. Drops `ip_address` + `old_data`/`new_data` blobs. See regression rule AUDIT-LOG-SELECT-EXPLICIT-COLUMNS.
- [ ] `voidJournalEntry` post-close period guard — invalidates signed BCTC.

### M6 Finance — HĐĐT compliance (audit 2026-04-28)

> Compliance audit `docs/ref/einvoice-tax.md` ↔ implementation. Pilot OK với cashier issue path; các gap dưới chặn scale + production-grade NĐ70/2025.

> **2026-05-08 update:** Owner approved Hybrid HĐĐT plan via 4-perspective debate (D1-D7). Most M6 HĐĐT gaps now subsumed by `docs/plan/hddt-hybrid-sinvoice.md` (7-PR migration). Items below reflect post-plan state.
>
> **2026-05-09 provider correction:** Cơm Tấm Má Tư uses **Viettel S-invoice / Sinvoice** for HĐĐT. MISA meInvoice is legacy/optional only and must not be treated as the production provider.

- [ ] **PLAN ACTIVE: HĐĐT Hybrid Viettel S-invoice (B2B realtime + B2C daily batch)** — see `docs/plan/hddt-hybrid-sinvoice.md`. 7 PRs queued: schema → RPCs → B2B refactor → cron → admin UI → cutover → regression rules. **Owner action: D7 register HĐ tổng hợp template với CQT qua Viettel S-invoice portal / Viettel BU (3-7 day leadtime, parallel với coding).**
- [ ] **P0: Pin Viettel S-invoice WebService contract before prod** — get latest BU doc/version and confirm auth header, base URL, IP whitelist, create/status/cancel/file endpoints, timeout/rate-limit. Public docs point to `createInvoice/{supplierTaxCode}`, `searchInvoiceByTransactionUuid`, `getInvoiceFilePortal`, `createExchangeInvoiceFile`, `cancelTransactionInvoice`; current provider has gaps noted in `docs/ref/sinvoice-webservices.md`.
- [ ] **P0: HĐĐT reconcile cron (orphan `signing`)** — DEFERRED to post-pilot per Hybrid S-invoice plan. Manual recovery via admin retry button covers pilot volume.
- [ ] **P0: HĐĐT replace flow (TT 78)** — DEFERRED post-pilot per plan. Pilot cancel + manual Viettel S-invoice portal đủ.
- [ ] **P1: HĐĐT provider config qua `system_settings` (encrypted)** — DEFERRED post-pilot. Env-only acceptable cho single-tenant CTCP.
- [ ] **P1: HĐĐT PDF/XML persist + download UI** — DEFERRED post-pilot. Link Viettel S-invoice portal đủ.
- [ ] **P2: 3-way matching UI cho `supplier_invoices`** — bảng + columns (`matching_status`, `is_vat_deductible`, `declared_period`) đã có nhưng không có UI workflow PO ↔ GRN ↔ Supplier Invoice. Kế toán phải đối chiếu tay → không export được Tờ khai 01/GTGT đúng. Independent of Hybrid S-invoice plan.

### M7 Payroll
- [ ] **`payroll_entries_select` RLS** — add `EXISTS(payroll_periods WHERE status='paid')` to self branch.
- [ ] `branch_manager` with null `branch_id` widens to tenant-wide writes — guard at action level.
- [ ] Daily HMAC clock-in code reused all-day → leaked = whole shift remote clock-in. Need per-shift TOTP or active `shift_assignments` check.
- [ ] No audit on `insurance_base_salary`/`gross_salary` changes — BHXH compliance.
- [ ] Drop legacy `employees_manage`/`shifts_manage` if any still active (m4c3 cleanup audit).

### Network gate (D9)
- [ ] **Per-agent presence token** — currently single global `PRINT_AGENT_PRESENCE_TOKEN`; leak = ANY tenant POS access via cross-tenant body forge.
- [ ] **Rate-limit on `/api/branch-presence`** — token-bucket per agent_id (1 req/30s) + actually implement the "skip if last_seen_at < 60s old" pre-check the comment promises.
- [ ] **`settings:branch_network` permission key** declared but not enforced — `network-config-actions.ts` only role-checks. Add permission to `withAction` opts.
- [ ] **RLS uses `auth_role()` not `has_permission()`** — suspended owners retain network-trust writes.
- [ ] **Soft-revoke race** — agent's next heartbeat `revoked_at: null` undoes admin revoke.

## Pilot-critical (blocked on external credentials)

- [ ] P0: Wire VietQR real bank API (merchant credentials)
- [ ] P0: Wire Momo real API (merchant credentials)
- [ ] P0: Wire Viettel S-invoice HĐĐT real API call (Sinvoice credentials — pháp lý NĐ70/2025)
- [ ] P1: Momo webhook atomic RPC

## Branch Kitchen site split (Phase 2)

> Decision 2026-04-23 — tách tồn Kho CN / Bếp CN qua `inventory_locations`. See `docs/plan/inventory-location-ledger-phase2.md`.

- [x] Migration `20260417040000_inventory_locations_phase1.sql` + compat columns APPLIED
- [ ] Phase 2 dual-write + cutover
- [ ] Seed 1 `inventory_locations` kitchen/warehouse per branch (`is_default_consumption`)
- [ ] Rút gọn state machine Kho CN → Bếp CN: `draft → confirmed` (cùng roof, không in_transit)
- [ ] Implement intra-branch transfer một bước cho `Kho CN -> Bếp CN` (`Cấp bếp`) bằng RPC atomic riêng
- [ ] `consume_stock_for_order` phải resolve `default_consumption`; nếu thiếu thì fail hard/setup gate, không fallback silent
- [x] Retire `stock_issue(issue_type='kitchen_use')` — runtime CHECK đã chặn; docs active phải trỏ sang intra-branch transfer

## Sprint 6 — Inventory UX follow-up

> Sprint 5 shipped #1 dead-code, #2 atomic `create_grn_from_po` RPC, #4 `formatVND` shadow consolidation. Sprint 6 shipped F-017 PO display ID + Fix #3 stage A foundation.

### ✅ Shipped in Sprint 6

- **F-017 PO display ID** (commit `b0888c96`): `next_po_display_id(tenant_id)` RPC + `display_id` column + backfill `PO-LEGACY-XXXXXX` + display layer. Year scoped to `Asia/Ho_Chi_Minh`. New PO writes get `PO-YYYY-####` zero-padded.
- **Fix #3 Stage A** (commit `3658b15c`): partial UNIQUE index `uq_grn_active_draft_per_user_supplier` + `loadActiveGrnDraft` + `discardGrnDraft` server actions + `createGrnDraft` UNIQUE_VIOLATION fallback. Foundation for server-side draft lifecycle.

### 🚧 Sprint 6 Stage B + C (next session — client refactor)

- [ ] **#3 Stage B: Client refactor `grn-create-client.tsx`**:
  - Remove `loadDraft`/`saveDraft`/`removeDraft` calls + direct `window.localStorage.{getItem,setItem,removeItem}` calls (lines 84-108, 124-128, 176-188, 198-234)
  - RSC pre-fetch via `loadActiveGrnDraft({ supplierId })` in `/grn/new/[supplierId]/page.tsx`; pass `existingDraft` prop
  - Lazy-create server draft on first `saveLine`; route subsequent `saveLine` calls to `upsertGrnLine` directly (debounce 600ms, 1 retry)
  - On `discardDraft`: call new `discardGrnDraft({ grnId })`
  - Submit becomes navigation only (no bulk upload — lines already on server)
- [ ] **#3 Stage C: Drafts page + cleanup**:
  - Rewrite `drafts/page.tsx` (RSC) + `page-client.tsx` to consume `goods_received_notes status='draft'` query (filtered by `tenant_id` + `created_by = auth.uid()`)
  - Delete `apps/web/app/inventory/_lib/mobile-draft.ts` (or keep type-only if shared)
  - Fix `startGrnFromPo` URL-flash redirect → toast pattern (regression rule `UI-TOAST-VIA-SONNER-NEVER-URL-FLASH`)
  - Optional: legacy-import shim for in-flight localStorage drafts on first load post-deploy; `pg_cron` cleanup job for stale drafts (14d retention)

### ⏸️ Blocked / deferred

- [ ] **F-018: Supplier "Khác"** — BLOCKED-PRODUCT. 0 occurrences in code (data-level only). Need product input on (a) require formal NCC, (b) "Mua ngoài" + inline note, or (c) accept generic "Khác" as catch-all.
- [ ] **F-009: Stock master-detail as drawer** — invasive refactor; current side-panel acceptable.

## Doc maintenance reminders

- Khi Inventory behavior thay đổi → update `docs/ref/inventory.md` + `inventory-sop.md` + `docs/modules/web-app.md` + `docs/worklog/inventory/adoption-matrix.md` cùng PR
- Khi triển khai phase tách tồn thật → update `docs/plan/inventory-location-ledger.md`

## Deferred to post-pilot

- [ ] Automated E2E POS→payment→stock (P2, trước scale 3+ chi nhánh)
- [ ] Staging env / Vercel Preview (P2, trước external users)
- [ ] M7 BHXH/PIT calc wiring (Excel cho pilot <5 nhân viên)
- [ ] M6 VAS journal entries hoàn chỉnh (CSV → MISA AMIS cho pilot)
- [ ] Refunds table + flow
- [ ] M5-Ext S8 — yield factor + AP aging + consumption variance (chưa cần ở 30-50 SKU)
- [ ] Finish 10 RPCs khỏi `auth_role()` (batches α4b/α4c)
- [ ] **H3b function update — has_permission() dual-source flip** (defer until 2nd silent-demote incident). H3a NOT NULL invariant đủ ngăn position_id NULL. Column `tenants.owner_user_id` đã ship via `20260601500000` làm data foundation; function update chỉ flip nếu real incident occurs. Per ADR 0005 minimum-regret synthesis.
- [ ] **transfer_ownership(p_new_user_id UUID) RPC + UI** — blocked on business design. Need decisions: instant transfer vs 2-phase (proposed→accepted), `representative` legal-name sync semantics, audit-log shape, RPC permission gate (only current owner? + ops escape hatch?). Manual SQL UPDATE acceptable cho pilot. Reference ADR 0005.
- [ ] **L6: docs/plan/adr/0006-finance-phase-migration-chain.md** — 5 finance migrations form implicit chain (`20260506000000` cashflow + COA, `20260507000000` journal_entry period guard, `20260508000000` B03_DN cashflow indirect, `20260509000000` VAT per-line, `20260510000000` M4 refund foundation). Add ADR documenting prerequisite ordering + rollback dependencies. Audit found in 2026-05-07 wave; non-blocking but valuable cho new engineers.
- [ ] **Dead RPC drop wave 2** (post-pilot) — Tier A pilot (`20260601700000`) dropped 3 RPCs (backfill_permissions_from_role, _auth_v2_is_tenant_wide_role, seed_posting_rules). Next wave needs `pg_stat_user_functions` telemetry from real pilot traffic. Tier B (reporting/cron-style), Tier C (lifecycle helpers), Tier D (NEVER drop — ops/auth) — see regression rule RPC-DROP-MUST-SCAN-6-CHANNELS for methodology.

## Post-v1.0 (Tier 2)

- [ ] Local-First Branch (mini PC + SQLite, offline POS/KDS)
- [ ] QR Self-Order tại bàn
- [ ] Loyalty / Vouchers
- [ ] CMS / CRM Foundation — `docs/archive/plan/sprint-8.md`
- [ ] Advanced Analytics
- [ ] VNPay integration
- [ ] Employee portal full features
- [ ] **Native POS migration (PWA → Flutter Android)** — đánh giá khi pilot phát sinh: BT/USB printer fail >5%, cash drawer auto-pop, e-wallet native SDK > deeplink, scale ≥20 chi nhánh. Stepping stone: Capacitor wrap (~1-2 tuần) trước Flutter rewrite (3-6 tháng + 2× maintenance)

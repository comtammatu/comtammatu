# Current Tasks

> Active work only. Shipped history → `docs/plan/roadmap.md`. Updated: 2026-04-26.

## Module status (snapshot)

M0–M7 + Auth v2 + POS PWA + Realtime hardening + Shadcn primitive migration M1–M9 — **all SHIPPED**. External integrations (VietQR/Momo/MISA HĐĐT real APIs) blocked on credentials. Detail trong `docs/plan/roadmap.md`.

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
- [ ] Owner decision: base clean commit vs include current dirty local UI edits in the fork baseline.
- [x] Owner decision: fork preparation workspace name/location is `/Users/luongthebinh/Downloads/matu-pros`.
- [ ] Owner decision: when to initialize `matu-pros` as an actual git fork/repository.
- [ ] Owner decision: greenfield v2 pilot vs migrated-data v2 pilot.
- [ ] Run required 4-agent debate before the first implementation slice in the fork.

## Known issues

- [ ] P3: Login rate limit fail-open khi Upstash unreachable — documented design decision, cần observability
- [ ] 10 SECURITY DEFINER RPCs còn gọi `auth_role()` (legacy compat, không chặn ship — migrate dần qua batches α4b/α4c): `admin_update_profile`, `bump_kds_ticket`, `can_access_branch`, `close_fiscal_period`, `create_supplier_payment`, `gl_reconciliation`, `post_payroll_journal`, `recall_kds_ticket`, `set_branch_kind`, `toggle_profile_active`

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

## P0 from security review 2026-04-27 (block pilot — need 4-agent debate)

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

- [ ] **P0: HĐĐT reconcile cron (orphan `signing`)** — `tax_invoices.signing_started_at` đã set bởi `transition_tax_invoice_state`; cần job poll `provider.getStatus()` cho invoices `status='signing' AND signing_started_at < now()-10min`, resolve về `issued`/`draft`. MISA timeout mid-publish hiện để HĐ kẹt mãi, không biết CQT đã cấp mã chưa. Cần owner D về cron infra (Vercel cron / Supabase pg_cron / Edge Function).
- [ ] **P0: HĐĐT replace flow (TT 78)** — schema (`replaced_by_id`) + RPC matrix (`issued → replaced`) sẵn sàng, nhưng không có UI/action `replaceTaxInvoice(oldId, newPayload, biên_bản)`. Issued HĐ sai thông tin khách → owner hiện chỉ cancel được (mất doanh thu trên báo cáo) — non-compliant TT 78.
- [ ] **P1: HĐĐT provider config qua `system_settings` (encrypted)** — `apps/web/lib/invoice-provider-init.ts` đọc `process.env.MISA_API_KEY`/`COMPANY_TAX_CODE`; spec yêu cầu encrypted DB row + thêm `einvoice_template_code` + `einvoice_series`. MISA hiện auto-pick series → mismatch risk khi đăng ký >1 mẫu HĐ. Block trước khi owner đổi provider hoặc đăng ký multi-template.
- [ ] **P1: HĐĐT PDF/XML persist + download UI** — cột `tax_invoices.pdf_url`/`xml_url` rỗng; `MisaProvider.createInvoice` không return URL sau `publish`; `invoice-list.tsx` không có nút tải. Khách yêu cầu HĐ qua email/in lại không phục vụ được. Cần extend `MisaProvider` + UI button.
- [ ] **P2: 3-way matching UI cho `supplier_invoices`** — bảng + columns (`matching_status`, `is_vat_deductible`, `declared_period`) đã có nhưng không có UI workflow PO ↔ GRN ↔ Supplier Invoice. Kế toán phải đối chiếu tay → không export được Tờ khai 01/GTGT đúng.

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
- [ ] P0: Wire MISA HĐĐT real API call (MISA credentials — pháp lý NĐ70/2025)
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

## Post-v1.0 (Tier 2)

- [ ] Local-First Branch (mini PC + SQLite, offline POS/KDS)
- [ ] QR Self-Order tại bàn
- [ ] Loyalty / Vouchers
- [ ] CMS / CRM Foundation — `docs/archive/plan/sprint-8.md`
- [ ] Advanced Analytics
- [ ] VNPay integration
- [ ] Employee portal full features
- [ ] **Native POS migration (PWA → Flutter Android)** — đánh giá khi pilot phát sinh: BT/USB printer fail >5%, cash drawer auto-pop, e-wallet native SDK > deeplink, scale ≥20 chi nhánh. Stepping stone: Capacitor wrap (~1-2 tuần) trước Flutter rewrite (3-6 tháng + 2× maintenance)

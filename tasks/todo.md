# Current Tasks

> Active work only. Shipped history → `docs/plan/roadmap.md`. Updated: 2026-04-26.

## Module status (snapshot)

M0–M7 + Auth v2 + POS PWA + Realtime hardening + Shadcn primitive migration M1–M9 — **all SHIPPED**. External integrations (VietQR/Momo/MISA HĐĐT real APIs) blocked on credentials. Detail trong `docs/plan/roadmap.md`.

## Known issues

- [ ] P3: Login rate limit fail-open khi Upstash unreachable — documented design decision, cần observability
- [ ] 10 SECURITY DEFINER RPCs còn gọi `auth_role()` (legacy compat, không chặn ship — migrate dần qua batches α4b/α4c): `admin_update_profile`, `bump_kds_ticket`, `can_access_branch`, `close_fiscal_period`, `create_supplier_payment`, `gl_reconciliation`, `post_payroll_journal`, `recall_kds_ticket`, `set_branch_kind`, `toggle_profile_active`

## Pre-deploy fixes

- [x] **Employee page FK casts** (2026-04-27): `pnpm db:types` regen + treat M:1 FK joins as object (`r.shifts?.name`, not `?.[0]?.name`) in `app/employee/{attendance,payslip,schedule}/page.tsx`. See lesson #10 — supabase-js typegen quirk: `isOneToOne: false` infers array but PostgREST runtime returns single object for M:1.
- [x] **POS network gate D9** (2026-04-27): `branch_trusted_egress_ips` + `/api/branch-presence` Bearer endpoint + admin dialog wired into branch table. Proxy bypass for presence endpoint (without it, agent POSTs were redirected to /login).
- [x] **Stale shift_assignments_select RLS** (2026-04-27): tightened to self + permission; tenant-wide leak closed.
- [x] **refunds table** (2026-04-27): table now exists; `@ts-nocheck` removed from `app/orders/refund-actions.ts`. STORAGE ONLY — see P0 list below for correctness gaps.
- [ ] Inventory smoke pre-pilot theo `docs/runbooks/inventory/pre-release-qa.md`
- [ ] Uptime monitor on `/api/health` (UptimeRobot — ops, không phải code)
- [ ] Ops reconciliation query trước Momo go-live — payment/order desync surfacing trong /admin/finance
- [ ] Momo webhook atomic `complete_payment_and_consume_stock` RPC (khi M4 wired)

## P0 from security review 2026-04-27 (block pilot — need 4-agent debate)

> Full findings under each agent in session log. Quick wins applied above; these need design.

### M4 Payments — see `docs/plan/m4-payments-fix.md` (drafted 2026-04-28)
- [ ] **`approveRefund` doesn't actually refund** — flips `payments.status='refunded'` but no GL reversal, no stock restore, no cash drawer reversal. Need `reverse_payment_and_post(p_refund_id)` RPC running atomic.
- [ ] **Refund auth `area_manager` scope hole** — `area_manager` in CREATE_ROLES with no branch check; can refund any branch. Same for `payment.status='completed'` precondition (today: refund could target `pending`/`failed` payment).
- [ ] **MoMo webhook tenant binding hole** — `provider_ref=orderId AND method='momo'` with no `tenant_id`. Leaked secret + collision = cross-tenant payment forgery. Need partnerCode + tenant verify before RPC.
- [ ] **Stock consumption fail-soft on hot-path** — webhook doesn't check `result.stock_consumed` from `complete_payment_and_consume_stock`; money paid + zero stock deducted silently.
- [ ] **Server-recompute `total_amount`** missing in `confirm_cash_payment`/`complete_payment_and_consume_stock` — discount_amount tampering vector.
- [ ] **Webhook idempotency table** missing — replay overwrites `provider_data`.
- [ ] **POS calls provider before DB lock** — RPC fail = orphan gateway order.

### M6 Finance
- [x] **Audit log INSERT REVOKE + `log_audit()` SECURITY DEFINER RPC** (2026-04-28). Migration `20260505020000_audit_logs_rpc_only_insert.sql`; helper at `apps/web/app/admin/_lib/audit.ts` wraps the RPC; 7 callers in finance/HR drop `tenantId`/`userId` (forced server-side). See regression rule AUDIT-LOG-INSERT-RPC-ONLY.
- [ ] HĐĐT `cancel reason` min 20 chars (NĐ70/2023) — currently `.optional()`.
- [ ] `voidJournalEntry` post-close period guard — invalidates signed BCTC.
- [ ] `fetchAuditLogs` returns `*` (PII via `old_data`/`ip_address`).

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

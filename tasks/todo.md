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
- [x] Owner decision: fork preparation workspace name/location is `/Users/luongthebinh/Downloads/matu-pros`.
- [x] **Fork strategy abandoned (2026-05-06)** — owner decision: tiếp tục phát triển trên source code cũ (`comtammatu`). Fork init, greenfield/migrated-data pilot decision, và 4-agent debate trong fork đều dropped.

## Known issues

### Feedback module — from /qa pass 2026-05-07 (production read-only)
**Report:** `.gstack/qa-reports/qa-report-feedback-module-2026-05-07.md` (health score 63.5/100, 14 findings)

**HIGH (do these first):**
- [x] **ISSUE-001** — `apps/web/app/r/[token]/actions.ts` fail-closed in production when ALLOWED_ORIGINS_FEEDBACK is empty. Shipped 2026-05-09 (8e713af8).
- [x] **ISSUE-012** — `apps/web/next.config.ts` `headers()` returns CSP + X-Frame-Options=DENY + X-Content-Type-Options=nosniff + Referrer-Policy + Permissions-Policy. Shipped 2026-05-09 (610123c8).

**MEDIUM:**
- [ ] **ISSUE-002** — Photo upload IDOR: mint per-submission upload token in `submit_feedback` RPC, consume in `uploadFeedbackPhotos` (`apps/web/app/r/[token]/actions-photos.ts`)
- [x] **ISSUE-003** — Replaced with `after()` from `next/server` in submitFeedback (durable post-response). Shipped 2026-05-09 (79a30bb7).
- [ ] **ISSUE-004** — Tighten photo storage RLS to gate by branch (encode branch_id in path or JOIN to feedbacks for has_permission check)
- [x] **ISSUE-013** — `/r/[token]/thank-you` now calls `notFound()` for invalid/unknown tokens. Shipped 2026-05-09 (939be3d9).

**LOW / INFO (nice to have):**
- [ ] **ISSUE-005** — Cascade photo storage objects in `feedback_retention_cleanup()` to prevent forever-orphans
- [ ] **ISSUE-006** — Defense-in-depth: re-check `feedback:view` permission in `getFeedbackPhotoUrls`
- [x] **ISSUE-007** — `console.info()` on honeypot trip with first 8 chars of token. Shipped 2026-05-09 (79a30bb7).
- [x] **ISSUE-008** — Server schema raw `.min/.max` before sanitize, distinct refine message after. Shipped 2026-05-09 (fec49ecd).
- [x] **ISSUE-009** — `?only_suspect=true` URL param on admin feedback inbox. Shipped 2026-05-09 (ee71d005).
- [ ] **ISSUE-010** — Add `(tenant_id, created_at DESC)` index for tenant-wide inbox queries
- [ ] **ISSUE-011** — Order snapshot heuristic broken for shared tables (data quality)
- [x] **ISSUE-014** — `poweredByHeader: false` set in `apps/web/next.config.ts`. Shipped 2026-05-09 (610123c8).
- [x] **ISSUE-015** — 3-layer CSRF defense doc inline in `actions.ts`; warn-once log when ALLOWED_ORIGINS_FEEDBACK is unset in production. Shipped 2026-05-09 (79a30bb7).
- [x] **ISSUE-016** — Conditional `UPDATE ... WHERE photo_paths IS NULL OR '{}'` + `.select()` to detect race losers. Shipped 2026-05-09 (003224c0).

**Fix strategy:** all on a feature branch `fix/qa-feedback-2026-05-07` + PR for owner review. Each commit is atomic with regression test in `packages/shared/src/feedback/__tests__/` or `apps/web/__tests__/`.

### Other
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

> **2026-05-08 update:** Owner approved Hybrid MISA plan via 4-agent debate (D1-D7). Most M6 HĐĐT gaps now subsumed by `docs/plan/hddt-hybrid-misa.md` (7-PR migration). Items below reflect post-plan state.

- [ ] **PLAN ACTIVE: HĐĐT Hybrid MISA (B2B realtime + B2C daily batch)** — see `docs/plan/hddt-hybrid-misa.md`. 7 PRs queued: schema → RPCs → B2B refactor → cron → admin UI → cutover → regression rules. **Owner action: D7 register HĐ tổng hợp template với CQT qua MISA portal (3-7 day leadtime, parallel với coding).**
- [ ] **P0: HĐĐT reconcile cron (orphan `signing`)** — DEFERRED to post-pilot per Hybrid MISA plan. Manual recovery via admin retry button covers pilot volume.
- [ ] **P0: HĐĐT replace flow (TT 78)** — DEFERRED post-pilot per plan. Pilot cancel + manual MISA portal đủ.
- [ ] **P1: HĐĐT provider config qua `system_settings` (encrypted)** — DEFERRED post-pilot. Env-only acceptable cho single-tenant CTCP.
- [ ] **P1: HĐĐT PDF/XML persist + download UI** — DEFERRED post-pilot. Link MISA portal đủ.
- [ ] **P2: 3-way matching UI cho `supplier_invoices`** — bảng + columns (`matching_status`, `is_vat_deductible`, `declared_period`) đã có nhưng không có UI workflow PO ↔ GRN ↔ Supplier Invoice. Kế toán phải đối chiếu tay → không export được Tờ khai 01/GTGT đúng. Independent of Hybrid MISA plan.

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

## Go BE migration backlog (US-5xx)

> Multi-session migration of Next.js Server Actions → Go BE via `goFetch`. Pattern locked by US-508/509 (payments) and US-510 (menu CRUD). Each slice = one action-file group + 4-agent debate + smoke-test additions. Full reference: `docs/spec/business-logic-be-{cu-nodejs,moi-golang}.md`.
>
> **Sibling effort (DB infra):** `docs/plan/db-migration-supabase-to-postgres.md` — phased Supabase → self-hosted Postgres cutover (Auth/Realtime/Storage decisions, 7-day burn-in). Decoupled from this backlog by default (GoTrue stays self-hosted).

**Shipped:**
- [x] **US-508 / US-509** — payment-settings + VietQR cashier-confirm rewired to Go BE.
- [x] **US-510** — menu admin CRUD (createCategory, updateCategory, toggleCategoryActive, createItem, updateItem, toggleItemActive). Go BE additions: `type` field on `menu_categories`, `category_id` on update-item, atomic `PATCH .../toggle-active` endpoints, 23505 → 409 `duplicate_name`. Smoke-test extended.

**Next slices (FE already has a Go BE handler — pure rewire):**
- [ ] **US-511 — admin/staff CRUD** — NOT a pure rewire. Gap audit 2026-05-14:
  - FE uses **UUID** staff IDs (`z.string().uuid()`); Go BE handler routes use **BIGINT** `users.id`. Need UUID-keyed routes or a UUID↔BIGINT lookup helper.
  - FE `createStaff` calls **`serviceClient.auth.admin.createUser`** (Supabase Auth admin API) — Go BE only INSERTs into `public.users` with empty `password_hash`. Either keep auth user creation on supabase-js (split FE write path) or build a Go-side Supabase Auth admin client.
  - FE `updateStaff` calls **`admin_update_profile` RPC** which enforces: hierarchy ceiling, `cannot modify owner/super_manager` peer guard, `cannot reassign to other branch` branch_manager guard, operational-role → `branch_kind != central_warehouse` check. Go BE only has elevated-role gate. Port the rest before rewire.
  - FE `toggleStaffActive` calls **`toggle_profile_active` RPC** with its own guards; Go BE deactivate is unconditional soft-delete.
  - FE permissions action file uses **`apply_template_to_user` RPC** (template-based bulk grant); Go BE has no equivalent endpoint.
- [x] **US-512 branches sub-slice** (2026-05-14) — `createBranch`, `updateBranch`, `toggleBranchActive` rewired to Go BE. Go BE additions: `BranchKind` field on Branch/Create/UpdateBranchRequest, allowlist validation (`branch | central_kitchen | central_warehouse` → 400 `invalid_branch_kind`), 23505 → 409 `duplicate_name`, atomic `PATCH /branches/{id}/toggle-active` replacing the legacy select-then-update TOCTOU. Smoke-test extended.
- [ ] **US-512 areas + tables sub-slices** — still gap-blocked. Gap audit 2026-05-14:
  - **`areas`:** Go BE `/areas` actually queries `public.branch_zones` (zones inside a branch). FE `areas/actions.ts` operates on `public.areas` + `public.area_branches` (tenant-level M:N grouping). Two different tables. Need to **build new `/areas` and `/areas/{id}/branches` endpoints** for the M:N model, and either rename the existing Go BE handler to `/zones` or absorb its responsibility into the tables slice.
  - **`tables`:** Go BE `tables.go` is a **placeholder** — writes to `public.branch_zones` and returns Capacity=0 (`// TODO: use public.branch_tables when available`). Real FE table CRUD writes to `public.tables` with `(branch_id, zone_id, number, capacity, status)`. Need full rewrite of `tables.go` against the real `tables` schema before any FE rewire.
  - **`tables` zones:** FE creates/updates/deletes rows in `public.branch_zones` via `createZone`/`updateZone`/`deleteZone` actions. No Go BE endpoint exists for that surface today (the existing `/areas` Go BE endpoint partially matches but lacks branch scope + sort_order + delete).
- [ ] **US-513 — admin/settings/kds + printers + jobs** (~ 4 action files). `kds_stations` admin CRUD has no Go BE handler yet — needs new endpoints. Printers + print jobs untouched (depends on Print Agent migration decision).
- [x] **US-514 — notifications writes** (2026-05-14) — `markNotificationRead` and `markAllNotificationsRead` in `apps/web/app/_actions/notifications.ts` now goFetch PATCH `/notifications/{id}/read` and `/notifications/read-all`. 404 surfaced as "Thông báo không tồn tại". Reads (`listNotifications`, `getUnreadCount`) stay on Supabase per go-api.ts:5-8 read-path convention.
- [ ] **US-514 reads (deferred)** — `listNotifications` + `getUnreadCount`. Gap: Go BE list response is missing `target_branch_id`/`target_roles`/`meta`/`expires_at`/`read_at`-timestamp, and uses integer `cursor` instead of FE's ISO `before`+`unreadOnly` params. Out-of-scope until reads need to leave Supabase.
- [ ] **US-515 — POS order-actions** (`br/[branchId]/pos/order-actions.ts` 1972 LOC). HIGH risk — financial state. Likely 2-3 sub-slices (create / append items / serve / void). Needs careful 4-agent debate per sub-slice. Go BE has the endpoints but FE composes them across many flows.

**Go BE gaps that block specific FE actions (need new endpoints first):**
- [ ] **Bulk variant/modifier/sides replace** — Go BE only has single-create. Build atomic `PUT /menu/items/{id}/{variants,modifiers,sides}` that delete-missing + upsert-present. Blocker for `saveVariants`/`saveModifiers`/`saveSides` rewire.
- [ ] **Discount + service-charge endpoints** for POS order flow.
- [ ] **Shift open / report endpoints** (Go BE has `POST /shifts/close`; need `open` + report fetch).
- [ ] **POS menu cache / structure reads** — POS uses `unstable_cache` over Supabase; Go BE port would need GET `/br/{branchId}/pos/menu-structure` aggregate endpoint or stay on Supabase (read paths convention per `go-api.ts:8`).

**Whole modules with NO Go BE handler yet (multi-week each):**
- [ ] **Inventory** — 15 action files (stocktake, GRN, transfers, suppliers, waste, variance, production, thresholds, dashboards). Schema in `supabase/migrations/20260406310000_stock.sql`. Critical RPC: `consume_stock_for_order` (atomic stock decrement on payment).
- [ ] **Finance / GL** — 5 action files (accounting, chart-of-accounts, journal, statement, reconciliation). Posting rules, period guards, double-entry validation. Touches money — needs careful debate.
- [ ] **HĐĐT (e-invoice)** — `hddt-daily-summary` cron + MISA/Viettel provider clients. Per `docs/plan/hddt-hybrid-misa.md`, hybrid B2B realtime + B2C daily batch. Out-of-scope until Hybrid MISA plan lands.
- [ ] **HR / Payroll** — employee + payroll actions, attendance, shift bidding, PIT calculation. Low priority per current roadmap.
- [ ] **Feedback (customer QR)** — anonymous `submit_feedback` RPC + retention/daily-report crons + Telegram outbox. Public surface, GDPR-sensitive.
- [ ] **Print Agent** — separate Node daemon. Migration is operational (re-deploy), not just code. May stay on Node indefinitely.
- [ ] **Cron jobs** — `hddt-daily-summary`, `feedback-daily-report`, `feedback-retention`, `telegram-flush`. Need a Go-side scheduler decision (in-process vs external trigger).
- [ ] **Reports / Dashboard aggregates** — materialised views in Supabase; Go would query the same MVs. Likely pure read-path port.

**Cross-cutting gaps before /qa parity:**
- [ ] **Go BE handler tests** — currently zero tests on menu/staff/settings/orders/kds/notifications/payments handlers (only ABAC + middleware + momo provider covered). Each rewire should add at least one round-trip test per endpoint.
- [ ] **Realtime substitution** — Supabase Realtime subscriptions (kds_tickets, kitchen_send_batches, daily_limits, pos_sessions) currently bypass Go BE. Decision needed: keep on Supabase or build a Go-side fan-out.
- [ ] **Storage / file uploads** — feedback photos, menu item images. No Go BE storage handler. Either keep on Supabase Storage or port to S3 via Go.
- [ ] **POS network gate (D9)** — proxy-layer IP allowlist is in Next.js Edge runtime. If Go BE serves POS writes directly, the IP gate must move (or the proxy stays as a gatekeeper in front of Go).
- [ ] **CSP / security headers** — currently set in `next.config.ts`. Stays Next.js-side regardless of BE migration.

**Risk principles for the next slices:**
- One slice = one action-file group. No multi-file diffs.
- 4-agent debate (PM/BA/Architect/Critic) before code on anything touching money, RLS, or auth.
- Smoke-test additions for every new Go BE endpoint exercised by /qa.
- Vietnamese UX strings stay FE-side; Go BE returns locale-neutral error keys (pattern set by US-510 `mapGoError`).

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

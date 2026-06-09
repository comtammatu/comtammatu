# Current Tasks

> Active tracker for the **Greenfield lean rebuild** (`codex/greenfield-ts`): comtammatu
> CTCP → Hộ Kinh Doanh lean, single app, flat-branch, 4 roles, no stock-deduction.
> The old in-place production track is FROZEN (`supabase/_legacy/`; prod runs until the
> Option-B cutover). Shipped CTCP history + all retired items live in git +
> `tasks/regressions.md` + `tasks/lessons.md` — not duplicated here.

## Program status (2026-06-08)

- **DB:** lean baseline = 58 tables (`supabase/migrations/00000000000000_baseline.sql`),
  replay-from-empty verified. ⚠️ **Cutover is HALF-APPLIED** — table drops done, but
  RPC/GRANT/cron/realtime rewrites + the data-migration are still pending (see roadmap).
- **App:** still the full CTCP app (~724 files), unaligned with the lean DB (~55 files
  query dropped tables; typecheck only green because `database.types.ts` is stale).
  Lean-in-place rebuild not yet started.
- **Audit:** Ultracode multi-agent audit `wf_bd69fcd4-47a` complete — 10 dimensions,
  100 verified findings, 12-priority roadmap.
- **Plan:** `~/.claude/plans/temporal-imagining-lampson.md` (revised P2–P6, lean-in-place).

## Greenfield roadmap (P2–P6)

> Plan: `~/.claude/plans/breezy-churning-knuth.md` (approved 2026-06-08). Lead + Multi-Agent (Dynamic Workflows).
> 1 PR/slice; gates typecheck/lint/build/test; money/auth/schema = T3. Dev DB = **uozwee** (MCP); prod SELECT-only.

**P2.0 — Gỡ HOÀN TOÀN Feedback + Telegram + AI + CRM** ✅ DONE 2026-06-08 (workflow `wf_206b66d5`, review CLEAN; gates typecheck 6/6·lint 0-err·build 2/2·web 117/117; UNCOMMITTED)
- [x] V0a relocate `getCronSecret` → `packages/shared/src/cron/env.ts` (fail-closed) + repoint 4 cron KEEP + move security-headers test
- [x] V0b xoá Feedback (app `/r` + admin/feedback + api/ai + `shared/{feedback,ai}` + `@anthropic-ai/sdk` + bucket feedback-photos + vercel crons) — 58 file deleted, 0 code ref còn lại
- [x] V0c xoá Telegram (`api/cron/telegram-flush` + `shared/telegram` + `getTelegramBotToken` + strip telegram leg → notifications alertChannel = generic/discord/slack)
- [ ] **V0d (follow-up): xoá dead feedback-HOST routing** (`isFeedbackPublicPath`/`resolveHostSurface`/`HostSurface 'feedback'` trong `auth/{index,route-resolution}.ts` + `proxy.ts` + `robots.ts` + `NEXT_PUBLIC_FEEDBACK_HOST` + scope.test host cases) — giờ guard 0 trang, dead → gỡ cho sạch hẳn (đụng proxy/auth, blast nhỏ)
- [ ] **Known issue (pre-existing, không do P2.0): 13 shared test FAIL** — 7 migration-static test (inventory-rpc/network-gate/security-definer/payment-hardening/3 kds-print) đọc `supabase/migrations/*.sql` riêng lẻ đã bị squash vào baseline → repoint đọc baseline.sql hoặc bỏ (gắn V19 drift-linter + V22 CI test)
- [x] (V9) dead `feedbackTokenRateLimit`/`feedbackIpRateLimit` removed + security→shared merge ✅

**P2 — Cổng boot được (uozwee)**
> Workbench LIVE 2026-06-08: baseline apply SẠCH lên uozwee qua Node `pg` (no docker) → **58 tables / 258 funcs / 147 policies**. Cơ chế apply = `/tmp/pgapply` (pg client, host `aws-1-ap-southeast-1.pooler.supabase.com`, user `postgres.uozweehdeyflukijrynf`, pw=`SUPABASE_PASSWORD`). Audit CONFIRMED 100% trên DB thật + 3 surprise (xem V3/V11). Loop P2 = sửa baseline.sql/seed/companion → reset uozwee → re-apply (pg) → verify.
- [x] V1 secrets fail-closed (✅ committed 34525349; owner rotate Telegram+CRON)
- [x] V2 auth hook bỏ `profiles.area_id` (+ admin_update_profile/sync_*/toggle_profile_active) ✅ `03903c7a`
- [x] V3 GRANTs — full Supabase public block + `supabase_auth_admin` USAGE(public+private)+EXECUTE hook ✅ `03903c7a` (verified: authenticated/service_role grant=true, hook callable, anon vẫn bị RLS chặn)
- [x] V4 lean seed (1 tenant·2 branch·4 positions·49 permission_keys·7 system_settings·owner profile) ✅ `03903c7a`
- [x] V5 permission-grant path bỏ `permission_audit_log` (grant/revoke/apply_template) ✅ `03903c7a`
> **Carryover → V8/cleanup** (out-of-scope V2–V5, đã flag): drop dead `_auth_v2_check_area_scope()` (ref NEW.area_id, không attach trigger); `sync_missing_permissions_from_template`+`apply_template_to_user` còn ref dropped `role_templates` (drop/rewrite — HKD seed quyền trực tiếp); seed positions hiện resolve về bucket cũ (branch_manager/cashier) → cập nhật khi V8 thu role 10→4.
- [x] V6 `cash_entries` RLS policy (select=finance:view, insert=finance:expense_create, tenant+branch scoped) + amount(15,2) ✅ adversarial CLEAN
- [x] V7 `route_order_to_kds` + `enqueue_kitchen_completion_print_internal` + `complete_kds_tickets` bỏ 3 bảng printer (kitchen seq từ `kitchen_send_batches` MAX+1 + advisory-lock, KHÔNG dùng order_daily_counters; exception un-swallow) ✅ smoke order→1 kds_ticket+2 print_job, 42P01 re-raise
> **Follow-up (out of V6/V7, đã flag):** (a) `kitchen_send_batches` thiếu INSERT policy (deny-all; che bởi SECURITY DEFINER create_order) → thêm policy `pos:use`; (b) 6 hàm dormant còn ref 3 bảng printer (`enqueue_kitchen_print_internal`, `enqueue_cancel_ticket_print`, `enqueue_edit_pending_order_item_quantity_print`, `enqueue_partial_cancel_ticket_print`, `resolve_branch_printer_for_type`, `upsert_printer_with_routes`) — POS void/edit reprint + printer config; gắn V7-tail/V17.
- [x] V8 (DB) roles 10→4 + flat-branch ✅ adversarial CLEAN — `staff_role_from_position_code`→{owner,manager,staff,chef}; **blast-radius 9 policies + 47 functions** stale-role collapsed; `branch_kind` chỉ 'branch'; dropped dead `_auth_v2_check_area_scope`; neutralized `apply_template_to_user`/`sync_missing_permissions_from_template` (role_templates). Carryover V2–V5 đã xử hết.
  - ⚠️ **Deliberate access change (owner-aware):** super/area/branch_manager → đều `manager`; admin_update_profile/toggle hierarchy = owner|manager (ex-branch_manager có cross-branch staff-mgmt, chặn bởi perm-key `staff:manage`); manager branch-optional, staff/chef branch-required. Hợp HKD flat-branch.
  - [ ] **V8-app → P3:** STAFF_ROLES type/module-acl/JwtClaims/proxy/~137 file (với regen-types); dead `central_warehouse/kitchen` logic trong `stock_transfer_*` + ~40 inventory fn bodies (unreachable, role-gate đã collapse) → P3/V17.
- [ ] V9 packages 4→3 (security→shared)

> ✅ **P2 DB-bootability HOÀN TẤT (V1–V8):** baseline lean apply sạch lên Supabase thật + boot end-to-end (login→grant→POS→KDS→print→cash) + 4-vai phẳng. Đảo ngược audit "không boot được". Tiếp: P2.5 (companion realtime/cron + cắt DB 58→44–46) · V9 packages.

**P2.5 — Baseline tự-chứa + cắt 58→44–46**
- [x] V10 realtime membership → baseline (idempotent, 10 tables, bỏ kitchen_send_batches over-grant + REPLICA IDENTITY default) ✅
- [x] V11 drop 8 dead fn (6 cron hỏng + close_fiscal_period/reopen_period) + fix companion cron (4 sạch + unschedule 6); start_stocktake bỏ get_ingredient_abc_class ✅
- [x] V13 FK `tax_invoices.order_id`+`payments.order_id` CASCADE→RESTRICT ✅
- [x] V14 storage: companion C đúng (4 bucket KEEP); **bonus: cả 5 section companion apply sạch qua postgres trên uozwee, idempotent** ✅
  - [ ] **→ V17 (zombie RPC cleanup):** vẫn còn fn dead ref bảng-drop: `close_period_hard/soft`, `period_status_at`, `get_ingredient_abc_class`, `get_food_cost`, `approve_waste`, `confirm_stock_issue`, `create_waste_entry`, `stock_issue_items_*` (GL-period/ABC/food-cost/waste-issue CUT features). HEAD nhiều hơn; P2.5 đã giảm. Drop ở V17/V12/finance-cut.
  - [ ] **→ P3 (app/DB drift):** `finance/actions.ts`/`period-actions.ts`/`inventory/dashboard-actions.ts` còn rpc() fn đã drop (`refresh_finance_views`/`close_fiscal_period`/`reopen_period`) — finance module bị CẮT ở P3.
- [x] V12 DB-cut ✅ adversarial CLEAN — **landed 57 bảng** (drop `inventory_locations` → tồn cấp chi nhánh: rewrite 7 live fn + drop 9 dead fn + 2 helper + matview rebuild + collapse keys). **KEEP `stock_levels`/`stock_movements`** (stocktake-variance chống-thất-thoát verify: system50→count42→variance−8→adjust ✓) + branch_feature_flags. Owner-decision: chốt 57 (KHÔNG 44–46) vì mọi candidate còn lại đều load-bearing cho KEEP-feature (kds_station_categories→KDS, order_daily_counters→order#, ...) — fold = vỡ feature. "Function > number" thắng.
  - [x] **V17 GRN/zombie cleanup ✅ adversarial CLEAN** — live scan 70 dangling obj; **drop 69 zombie fn (pg_proc 248→179) + 4 GRN dangling trigger** (gỡ cái cấm branch='branch') + 17 orphan comment; **rewrite 8 KEEP fn** (giữ `can_access_supplier_invoice_source` back 4 supplier_invoices RLS + `resolve_branch_printer_for_type`); thêm `kitchen_send_batches` INSERT policy. **GATE: 0 fn/trigger/view ref bảng vắng mặt; GRN smoke chạy KHÔNG disable trigger** ✓.
  - note: `stock_movements.movement_subtype` vestigial; receipt-print emits graceful warning (printer_print_types missing) → V17.

> ✅ **P2.5 (DB) HOÀN TẤT (V10–V14 + V12):** lean baseline = **57 bảng**, replay-faithful (realtime+companion), boot end-to-end. Tiếp: **V17 GRN/zombie-trigger cleanup (HIGH — GRN vỡ)** · V9 packages 4→3 · P3 app (regen types + xoá GL/production/payroll + V8-app role collapse).
> 📌 `Bình/` = content cá nhân TikTok ở repo-root (untracked, owner tạo 2026-06-08) — owner quyết gitignore/move.
- [ ] V9 packages 4→3 (security→shared) — app/packages, không cần DB

> ✅ **DB PHASE COMPLETE (P2 + P2.5 + V17):** lean baseline **57 bảng / 179 fn**, fully self-consistent (0 fn ref bảng vắng mặt), apply sạch + replay-faithful + boot end-to-end (login→grant→POS→KDS→print→cash→GRN→stocktake-variance). 8 commit. Tiếp = P3 (app).

**P3 — Xoá CUT + repoint app + types** (V17 DB-side DONE ở trên)
- [x] V15 regen types worklist captured ✅ — **817 lỗi / 66 file, 100% apps/web** (packages sạch); KEEP-RPC còn nguyên (verified); chỉ 8 RPC thiếu. (types regen tạm revert về stale để DB-commit xanh; V16 regen lại + align app.)
- [x] **V15.5 re-add KEEP-feature DB ✅ adversarial CLEAN (59 bảng):** item-discount (cols+RPC, fold Codex mig 20260608090000 + FIX role-regression khiến lean cashier bị cấm discount) · lean shift_assignments/shift_requests + submit/cancel/approve/reject RPC + RLS · amend_grn_line lean · notifications.read_at + count/mark-unread (bỏ notification_reads). leave_requests bỏ (clock không dùng). seed +`procurement:grn_amend`.
  - [ ] **→ V16 follow-up:** `_actions/notifications.ts` còn ref `notification_reads` junction (listNotifications/markNotificationRead) → refactor sang `read_at`; stale test `kds/__tests__/edit-pending-quantity-print.test.ts` → update/remove.
- [x] **V16 app alignment ✅ adversarial-verified + gates XANH** — regen lean types (59 bảng, MCP project-routed); **apps/web 764→0 lỗi**; **xoá ~136 file CUT** (finance GL · inventory transfers/issues/waste/production/recipes/PO/document-correction/qc/abc/trust/variance/report/supplier-returns/value-by-area · hr contract · admin accounting/areas/audit/network-config · api/branch-presence · admin-reports) + **repoint ~50** (notifications→read_at, momo bỏ stock_consumed_status, proxy bỏ trusted-egress, printers bỏ routing, permissions bỏ role-template/audit-log, inventory-scope/finance bỏ area, stocktake bỏ zone-lock/draft/conflict, finance/inventory page lean rebuild, module-acl/nav bỏ 'accounting') + Lead-fix `branch-scope.ts` (runtime `area_branches` ref adversarial bắt được) + reword baseline comment (lint:db-boundary). Gates: typecheck 6/6 · lint 0-err · build 2/2 · test 2/2 (178+117). KEEP intact (POS+item-discount, KDS, payments/HĐĐT, inventory-lean, scheduling, staff, cash, menu, notifications).
- [ ] V18 employee-scheduling repoint (decision: lean shift table vs manual) — clock files của Codex
- [x] **V19 drift-linter ✅** — `scripts/check-db-drift.mjs` (app→dropped table/RPC, đọc `database.types.ts`) + `scripts/check-roles.mjs` (chỉ 4 vai) wired vào `pnpm lint`; pass on app + proven bắt synthetic drift (table+rpc). RPC_ALLOWLIST = 2 SECURITY-DEFINER jsonb RPC type-gen bỏ sót (có evidence). Follow-up (chip spawned): `e2e/inventory/*` còn `.from()` bảng đã drop (linter loại trừ e2e — test DB riêng).
- [x] **V8-app role collapse ✅ adversarial CLEAN + gates XANH** — `StaffRole` 10→4 {owner,manager,staff,chef}; bỏ `area_id`/`area_manager`; collapse role-literal trong 57 file theo mapping khóa (office/cashier/waiter→staff, super/area/branch_manager→manager); **access-intent giữ** (branch-bound vs tenant-wide manager phân biệt qua `branch_id`; no-widen — office KHÔNG lên manager). Gates typecheck 6/6·lint 0-err·build 2/2·test 294/294. (Owner-decision: commit kèm 3 file clock WIP của Codex — V8-app buộc đổi 1 dòng role trong clock/actions.ts có sẵn ở HEAD.)
  - note: `module-acl` office→staff dùng-chung bucket warehouse → office có inventory-read (forced by mapping); manager giờ admin-level (super/area/branch→manager + ADMIN_ROLES). Inherent, đã no-widen tối đa.
- [x] **V9 packages 4→3 ✅** — `@comtammatu/security`→`packages/shared/src/security/`; còn `database/shared/ui`; 0 `@comtammatu/security` ref source/config (docs còn ref → reframe P5).

> ✅ **P3 (APP) HOÀN TẤT (V15/V15.5/V16/V8-app/V19/V9):** app khớp lean DB · typecheck/lint/build/test XANH · 4-vai phẳng · drift-linter chống tái-drift · 3 packages. **Rebuild core (DB+App) XONG.** Tiếp **P4** back-office (cash-book UI · HĐĐT config-guard + bỏ 'CTCP' · money integration tests + CI · scorecard điện-thoại) · P5 docs reframe · P6 ETL (owner-gated).

**P4 — Back-office + money**
- [x] **V22 ✅** money integration suite (12 test trên uozwee, rolled-back, **assert SALE→0 stock_movements**) + wire `pnpm test` vào CI (đóng gap "CI không chạy test"); +11 unit test (rate-limit 5, config-guard 6) → 305 unit.
- [x] **V24 ✅** rate-limiter login **fail-CLOSED** trên prod khi Upstash chưa cấu hình + unit test. (perf: dead MV/refresh đã sạch từ V11/V13.)
- [x] **V21 ✅** HĐĐT config-guard (`/api/health` 503 + createTaxInvoice draft-fallback signal/notification) + seller-name từ `system_settings` (3 site CTCP fixed) + VAT từ settings. reconcile đã gỡ ở V16 (dead).
- [x] **V20 cash-book UI ✅** (commit `8e13ee7d`) — `/finance/cash-book` thu/chi + tổng kỳ, append-only trên `cash_entries` (RLS sẵn có, đã có integration test INSERT/SELECT). Gates xanh.
- [x] **e2e cleanup ✅** (chip V19, commit `95de3066`): dropped cut-feature inventory e2e (transfer-direction/issue-label) + de-referenced dropped tables in grn-procurement/helpers.
- [~] **V23 scorecard prep ✅ (agent done)** — pre-validate tĩnh 5 luồng (workflow `wf_be075699`): ✅ HĐĐT-khách-không-lấy (0 tap) · ✅ doanh-thu (≤1 tap); ⚠️ order (BORDERLINE 4–8 tap, AlertDialog +1); ❌ chốt ca · ❌ chấm-công (2 tap nếu QR auto-submit, 3–4 nếu nhập tay). **QĐ chủ 2026-06-09:** chốt-ca **GIỮ 9 ô mệnh giá** (đối-soát chính xác = chống thất thoát) → **nới target ≤5 → ~10 tap**; không sửa close-session. Còn lại = đo điện thoại thật (chủ).
- [x] **V23 UX beat-Excel (phần solo) ✅** —
  - supplier-invoice **số HĐ để trống được ✅** (`a69e183d`): DB `invoice_number` DROP NOT NULL (uozwee+baseline) · types · action optional+null · client label/display; verify rolled-back 2 NULL OK + dup blocked.
  - adjust kho **toggle Thêm/Bớt/Đặt ✅** (`3992c54b`): "Đặt" = đếm thực → delta vs tồn hiện tại (count_adjustment), preview tồn-sau, no-op bị chặn.
  - **SKU import xlsx ✅ ĐÃ CÓ SẴN** (verified, không cần làm): `importIngredients` action + `parseSpreadsheetFile` (exceljs) + `IngredientImportExportMenu` đã render trong `ingredients-client.tsx` (template/export/import, dedup theo tên, báo lỗi từng dòng). Plan note stale.
  - **ingredient-form `.min(1)` ✅ KHÔNG phải bug** (verified): `purchase_to_measure_factor` đã `.min(1)` (required) + `.refine(>0)` đúng.
  - Còn (cần chủ): GRN lump-sum/paste-Zalo (cần mẫu tin Zalo) · supplier "Khác" (BLOCKED-PRODUCT).

**P5 — Docs** · [x] **✅ DONE (commit `b257e482`)** — reframe ~31 docs CTCP→HKD lean (4 roles · flat-branch · no-deduct · cash-book · HĐĐT · lean inventory); CTCP/VAS/payroll banner-fenced as historical only; `database-schema.md`→59 tables; `CODEBASE_MAP`→1-app lean; `setup.md` seed→4 roles; promote durable rules (`use server` no-reexport · separation-not-LoC · docs-lean · SSoT) → `docs/agent/rules/` + AGENTS.md mirror; sync `database.md` refs (greenfield dev=uozwee). Excludes owner's `binh-ma-tu-tiktok`.

**P6 — Cutover (OWNER-GATED)** · [ ] V25 ETL `migrate-data.sql` + runbook + reconcile fail-loud

## Surviving deferred items (still relevant under greenfield, NOT in the audit roadmap)

### Pre-launch / infra
- [ ] Stand up a dev/staging Supabase carrying the **lean 58-table baseline** to test
  app-on-lean (P2 prereq); Vercel Preview before external users.

### KEEP-module follow-ups
- [ ] **POS calls provider before DB lock** — RPC fail = orphan gateway order
  (DEFER-WITH-MITIGATION per m4 plan). Payments are KEEP.
- [ ] **HĐĐT post-pilot**: reconcile cron for orphan `signing` (admin retry covers pilot);
  replace-flow TT78 (pilot = cancel + manual portal); PDF/XML persist + download UI.
  (3-way PO↔GRN↔Invoice matching DROPPED — formal-PO is cut.)
- [ ] **F-018 Supplier "Khác"** — BLOCKED-PRODUCT: (a) require formal NCC, (b) "Mua ngoài"
  + inline note, or (c) accept generic "Khác". Owner product input needed.
- [ ] **transfer_ownership(p_new_user_id) RPC + UI** — blocked on business design
  (instant vs 2-phase, audit shape, permission gate); manual SQL UPDATE OK for pilot (ADR 0005).

### Post-launch ops (after go-live)
- [ ] Uptime monitor on `/api/health` (UptimeRobot — ops, not code).
- [ ] Ops reconciliation query for MoMo payment/order desync in `/admin/finance`.
- [ ] Inventory smoke regression runbook (`docs/runbooks/inventory/pre-release-qa.md`) — periodic.

## Doc maintenance

- When a module's behavior changes, update its canonical doc (`docs/modules/*`,
  `docs/ref/*`, `docs/spec/*`) in the same PR; honor `docs/worklog/README.md` retention;
  reframe CTCP→HKD on touch (greenfield P5).

## Post-v1.0 (Tier 2 — future, post-launch)

- [ ] QR Self-Order tại bàn
- [ ] Loyalty / Vouchers
- [ ] Advanced Analytics
- [ ] VNPay integration
- [ ] Employee portal full features

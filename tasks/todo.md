# Current Tasks

> Active work tracker for the in-place `comtammatu` production track. This file
> contains only active, blocked, or explicitly owner-gated work. Durable failure
> rules live in `tasks/regressions.md`; decisions live in
> `docs/plan/decisions.md`; shipped history lives in git.
>
> Sắp theo **trạng thái thật**. Không dùng file này cho wishlist, ý tưởng sản
> phẩm chưa duyệt, hay tính năng mở rộng scope khi chưa có `D0xx` phê duyệt.

## Current System Snapshot

Production is running in-place on this repo. External payment/invoice surfaces
currently in scope: VietQR, MoMo, and Viettel S-invoice. Ongoing work is
hardening, HRM/payroll completion, print-agent rollout, DB guard cleanup, and
verification infrastructure.

Verify the live checkout with `git status` before acting on any in-flight notes;
do not reopen plan rows that are already represented by code in the current
checkout.

## Now — IA Unification Program (D058)

> Direction locked 2026-07-03: "Hai plane — Một chrome — Một cửa mỗi việc".
> Contract: `docs/worklog/t3-ia-direction-debate-2026-07-02.md`. One PR per
> wave slice, separate worktree, fresh full gate. 3-viewport QA (phone/tablet/
> desktop) on every changed surface.

- [x] **W0 — route-table guards** (T3, merged PR #176): consistency test
  (ROUTE_FAMILY_CONTRACTS ↔ resolveModuleFromPath), fix operator-shift/profile
  drift toward enforcement, re-key `/br/*/shift/checkout-approvals` →
  `employee_checkout_approvals` (D058 §5), 7-role ACL matrix test.
- [x] **W0b — generated `role-route-matrix.md`** (merged PR #185): generator
  `scripts/gen-role-route-matrix.mjs` + `lint:route-matrix` drift check in the
  lint pipeline; fixed stale non-owner homes + office `/finance` grant.
- [x] **W1 — branch relief** (merged PR #177): "Văn phòng" bridge tile group (≤6, D058 §6),
  delete dead `[]` special-case in `employee/profile/page.tsx`, pass `hrHref`
  on branch dashboard, `branch_kind × role` tiles (D058 §7), quick-win wrappers:
  `/br/[id]/stock/grn` (GRNListPageContent), consumption
  (`IssuesPageContent scope="consumption"`), PO + production tiles.
- [x] **W2 — chrome primitives** (merged PR #180): `AppHeader` primitive (2 true
  duplicates consolidated; sidebar brand + POS station lockups intentionally
  distinct, frozen by new `header-lockup-registry` gate), one `PwaToolbar`,
  `/notifications` + `/br` classified in design-system.md § A.
- [x] **W3 — one door per job**: canonical URLs + redirects (reports→/finance
  D058 §4, approvals D058 §5), prune migrated floor items from inventory-nav,
  dedup `fetchFoodCost` + `defaultRedirect`/`getDefaultRedirect`, delete dead
  `INVENTORY_ROUTE_PREFIXES` shadow entries + spread, delete orphan
  `/inventory/receiving`, add `/inventory/drafts` +
  `/inventory/supplier-returns` nav entries. Scope-read (`?branchId=`)
  unification stays deferred (D058 §12/W3 scope note).
- [x] **W5 — page archetype standard** (merged PR #182 + hotfix #183):
  `docs/spec/page-archetypes.md` (11 archetypes, 135-page census), component
  registry in `docs/modules/ui.md`, `page-archetype` gate (map data in
  `scripts/page-archetypes.mjs`), turbo test-cache input fix for `scripts/**`.
- [ ] **W3b — scope-read unification**: retire the `?branchId=` vs URL-segment
  duality inside shared inventory PageContents; one `resolveBranchContext`
  engine, `?branchId=` = display filter only (D050 §4, D058 contract).
- [ ] **W6 — Claude Design mirror push** (W5 landed; one-way repo→design, §11):
  bundle recipes (11 archetype cards) + adapter-layer cards, push via
  DesignSync to project `Má Tư Design System`.
- [x] **Perf lane slice 1** (merged PR #184): `radix-ui` optimizePackageImports,
  KDS fetch parallelized, POS sheets code-split + idle prefetch (POS gzip
  −29.4%: 579.6→409.1 kB), bounded PO/hr-staff fetches. `use cache` expansion
  deferred as slice 2.

## Now — Workflow Reset

- [x] **Agent workflow frame cleanup** — Goal: one entrypoint, one active board,
  runtime adapters allowed, no worklog/doc drift. Scope this lane to
  `AGENTS.md`, `docs/agent/rules/{skills,workflow,references,team,orchestration}.md`,
  `docs/worklog/README.md`, `docs/plan/decisions.md`, and this file. Done:
  rule loading no longer forces `team.md`/`orchestration.md` for simple work;
  `.claude/`, `.codex/`, `.cursor/`, and `.agents/` are explicit adapters, not
  competing rule stores; every worklog file is linked, promoted, or deleted;
  focused guards pass (`rules-mirror`, `doc-staleness`, `guard-sync`,
  `review-tier`). T2 doc/process lane.
- [x] **Agent framework rebuild (2026-07-02)** — landed to `main` 2026-07-02
  (owner-approved merge; D054 follow-through, T2). Fixed the
  database.md MCP-posture self-contradiction and stale engineering.md JWT
  shape; collapsed ~200 duplicated rule lines to single owners; replaced dead
  skill names in `skills.md`; corrected strict-CI claims (`REVIEW_TIER_STRICT`
  / `DOC_STALENESS_STRICT` are ON); added `.claude/agents/t3-lens.md` +
  `.claude/commands/{t3-debate,verify-gate}.md` + codegraph allows; made the
  review-tier definer scan file-aware (.md prose no longer floors T3). Full
  lint + typecheck green in the worktree pre-merge; full gate proven by CI on landing.
- [x] **Split current dirty WIP before feature landing** — Landing boundary is
  now explicit in `docs/plan/branch-operator-hub-full-cutover-2026-07-01.md`:
  Branch Operator Hub, Branch stock floor, POS/KDS print routing, Finance/SePay,
  and Shared UI/rules must land separately. Do not land POS/KDS print migrations
  (`20260701010100_pos_drink_bill_only_no_kds.sql`,
  `20260701065350_pos_kitchen_print_route_policy.sql`) with Branch Operator Hub.
- [x] **Branch Operator Hub first landable slice** — LANDED and pushed
  (origin/main `9536e615`, 2026-07-02): shell ownership, bottom-nav contract,
  Hub/Shift first viewport, stock guards, device-aware post-login entry,
  pre-clock-in disabled tiles, combined approvals + overview smart cards,
  station hub links, branch-scoped waste approvals, central-site operator
  access (D055 §1). Spec status header tracks what remains (central-role
  parity polish + Phase 6 `/employee` retirement, blocked on `office` role).
  Owner smoke on real devices still pending.

## Agent-Doable Now

- [x] **Per-employee inventory count slips (Task 1 of owner's 3-feature request)** — contract in `docs/worklog/2026-06-28-per-employee-count-slips.md` (T3). **COMPLETE, full gate green** (typecheck+lint+build+test, web 245/0): migration `20260627201823_inventory_per_employee_count_slips.sql` (3 tables + 5 SECURITY DEFINER RPCs + RLS + perm seed) **APPLIED TO PROD** (owner-delegated; verified 3 tables/5 RPCs/3 keys/3 policies; advisors clean) + `pnpm db:types` regenerated. `permissions.ts` (+3 keys, count 91), notifications (`notifications.md`+`kindLabel`+icon), status SSOT (`COUNT_SLIP_STATUS_LABELS_VI` + `status-badge.tsx` `count-slip` domain). 3 UI surfaces via `withAction`: `/inventory/count-assignments` (manager) + `/inventory/count-slips` (manager review) gated by count_assign/approve in `INVENTORY_ROUTE_PREFIXES`+inventory-nav; `/employee/count` (blind) surfaced as a conditional home-page card (bottom-nav stays 4 items). **REMAINING (owner):** grant `inventory:count_*` to staff via `/admin/staff/[id]/permissions` (role_templates only seed future users; owner auto-bypasses); commit/PR/merge to deploy the UI (migration already on prod, additive → safe). **Optional:** regression guard mirroring STOCKTAKE-BLIND-STRIP-SERVER-SIDE.
- [~] **Task 2 — POS sell-limit by recipe định mức** (hard-block + per-branch toggle + "còn N phần") — contract in `docs/worklog/2026-06-28-pos-ingredient-stock-limit.md` (T3). **CODE-COMPLETE, full gate green** (typecheck+lint+build+test, web 245/0). Migration `20260628045057_pos_ingredient_stock_block.sql` written (ADDITIVE: availability helper + `trg_enforce_ingredient_stock` gated trigger + caps display RPC; does NOT touch create_order) — **APPLIED TO PROD** (verified, types regen, guard restored). TS: caps merge in `fetchMenuForPos` (cast, no type regen), `ingredient-cap-draft.ts` composing with daily-limit, VN non-retryable error, `<Switch>` toggle on `/br/[branchId]/settings/pos` upserting `branch_feature_flags pos_ingredient_stock_block` (default OFF). Approach (B) pending-demand-subtraction (no holds → no stale-hold leak); explosion copies `consume_stock_for_order` exactly (main-only, matches what consume actually draws). **REMAINING (owner):** apply migration to prod (additive + flag-OFF → zero impact until toggled), enable flag on 1 branch, run QA gates (toggle-OFF bypass, last-portion concurrency, shared-ingredient coupling, formula parity). Flagged pre-existing bug: `consume_stock_for_order` ignores side-item recipes (separate task).
- [ ] **POS/KDS inventory truth by final order outcome** — D053 + plan `docs/plan/pos-kds-inventory-truth-plan-2026-06-30.md`. **G8 local browser route smoke passed, full gate green before smoke docs**: POS/KDS management UI removed; manager labels now `Tồn | Sẵn bán | Còn`; G1 migration `20260630062650_pos_kds_inventory_truth_g1_access.sql` tightens management RPCs/table writes to owner+branch_manager; G2 migration `20260630071000_pos_kds_inventory_truth_g2_availability.sql` rebuilds availability with `stock_capacity_live`, manual cap, pending unfinalized demand, active holds, and `available_to_sell`; G3/G4 migration `20260630082000_pos_kds_inventory_truth_g3_outcomes.sql` adds immutable `kds_tickets.first_ready_at`, sale consumption subtype `sale_consumption`, ready-cancel waste subtype `cancelled_after_kds_ready`, idempotency index, private outcome helpers, tenant-explicit `inv_to_base_for_tenant`, and hooks payment/KDS-ready/cancel paths behind default-OFF `pos_stock_outcome_posting`. Verification passed targeted web/shared suites, paid refund no-double-post static guard, `codegraph index .`, `typecheck`, `lint`, `build`, `db:baseline:local-check`, Supabase Local scratch replay, local SQL smoke proving payment completion posts one sale movement, ready-cancel posts one waste movement, paid void adds no restore movement, default warehouse selection works, and availability returns `stock_capacity_live=7`, `pending=2`, `hold=1`, `available_to_sell=4`, plus local direct grants/RLS smoke proving cashier cannot direct-write/call management RPCs while branch_manager can set/list/clear and outcome helpers remain service-role-only. Browser route smoke proved Branch Manager sell-control UI, cashier POS menu entry, and chef KDS board load; custom-port local CSP blocked realtime/REST, so full functional browser smoke remains open. Next: full functional POS/KDS outcome browser smoke on CSP-compatible local env, non-POS tenant-aware conversion consolidation, then owner-applied prod migration + `db:types`.
- [x] **Task 3 — Employee + Branch management IA consolidation** — `docs/plan/decisions.md` D048; plan `docs/plan/task3-mgmt-ia-consolidation.md`. **ALL SLICES S0–S4 DONE, full monorepo gate green** (typecheck 7/7, lint 5/5, build 2/2, test: web 245/0 + shared 290/0 + print 19/0). S1 chrome dedup (`management-chrome.tsx`, shells NOT merged); S2 people `/admin/staff/* → /hr/staff/*` (rebrand "Nhân sự", `staff` ACL key kept, legacy redirects); S3 branch list `→ /branches` (new owner-only `branches` module key); S4 `menu-limits → /br/[branchId]/settings/menu-limits` (in hub, roles tightened to owner/branch_manager; cashier/chef keep KDS 86). Route-restructure fix cycle (caught only by FULL gate, not agent self-checks): stale `.next` clear, 2 broken relative imports (`hr/staff/actions.ts`, `settings/menu-limits/actions.ts`), ui-contract raw-padding allowlist repath, security-definer REVOKE PUBLIC,anon,authenticated on the 2 Task-2 helper fns (file-only; prod already browser-safe via FROM PUBLIC), module-acl-matrix owner snapshot +`branches`, comprehensive i18n-baseline repath (356→342). **REMAINING (owner):** none for S0–S4 beyond commit/merge.

- [ ] **Reconcile remaining e2e specs (now that the harness exists, #110)** — these run under `scripts/supabase-e2e-bringup.mjs` but each drifted (never run before). Verify each against current code/behavior, fix, then add to the gate (`apps/web/package.json` `test:e2e:smoke`). One spec per PR.
  - **Bring-up FK drift fixed (✅ #172; main run 28574373543 all-green):** seed `permission_keys` catalog synced with prod; `lint:seed-permissions` now fails catalog/grant drift in PR lint (rule `SEED-PERMISSION-CATALOG-SYNC`); bring-up retries `supabase start` once after teardown for Docker Hub rate limits. Remaining owner call: add a Docker Hub login secret to CI for a durable rate-limit fix.
  - **CI multi-spec instability (BLOCKS widening the gate):** `payment-vietqr` + `edit-pending-pricing` are FIXED and pass locally (prod build, `next start`), but running 3 POS specs together in the 2-core CI runner makes ALL of them (incl. the otherwise-green `payment-cash`) hit the 90s timeout (~12.5m run, page renders but interaction/assert hangs) — does NOT reproduce locally. The gate is therefore pinned to `payment-cash` alone (proven green, 4m25s). Root-cause the CI hang before re-adding specs: likely webServer/app degradation over a long single-process run or runner saturation (try a bigger runner, `workers:1` already set, split into separate jobs, or replace `waitForLoadState("networkidle")` with explicit element waits).
  - `kds-queue.spec.ts` — 4/10 pass; 5 fail on **behavioral** KDS queue-ordering assertions (e.g. "preparing stays current" expects the preparing card first but the priority-pending card is `data-kds-current=true`). NOT a selector fix — reconcile against intended KDS sort/current-card semantics (may be a real behavior change vs stale test; needs owner judgment on intended ordering). Realtime new-ticket-hydration tests (464/502) are flaky.
  - `daily-limit-realtime.spec.ts` — enforcement test reads `sold_today` via UTC `limit_date` while the trigger `enforce_branch_menu_daily_limit` keys on server-tz `CURRENT_DATE` → fails on a UTC+7 machine past UTC-midnight (likely passes on CI's UTC runner). Make `getBranchMenuDailyLimitSoldToday`/`setBranchMenuDailyLimit` tz-robust. Broadcast test is flaky.
  - **Realtime publication (blocks the realtime ca of kds-queue + daily-limit):** the baseline pg_dump drops `supabase_realtime` membership; Section D of the fold migration `20260627140000_fold_managed_surfaces.sql` is the canonical set. A bring-up step applying it (`docker exec … ALTER PUBLICATION`) was added then **REMOVED 2026-06-22** because actively streaming `orders`/`payments`/`tables` saturated the 2-core CI runner and broke the specs' `waitForLoadState("networkidle")` → all POS specs hit the 90s timeout (12.5m run). Re-add it ONLY when gating the realtime specs, and first drop those specs' `networkidle` reliance (use explicit element waits) so the websocket stream doesn't wedge the gate.
  - `inventory/*.spec.ts` — DB-contract scenarios pass; UI scenarios `test.skip` under the cashier storageState. To exercise the UI, add a `warehouse_manager` storageState (a 2nd `auth.setup` project; `E2E_INVENTORY_MANAGER_*` already wired) + `test.use` it. `issue-label-by-branch-kind` test 3 needs an `ingredients` seed row (tenant 1).
  - `edit-pending-pricing` modifier ca — the qty+discount path is now gated/green; the modifier ca is still deferred: needs `menu_item_modifiers`/`menu_item_variants` fixtures to assert `unit_price = base + variant + modifier + side`.

- [~] **Residual broad grants** — các revoke (cosmetic grants + definer secdef) đã gộp vào `00000000000000_baseline.sql` qua #109 re-baseline (file gốc `20260616120000`/`20260616170000` nay ở `_archive/`). Không còn code task; chỉ verify prod ledger trước khi owner apply lại ở môi trường nào còn thiếu. Phần `bmidl_write` legacy `auth_role()` gộp vào `α4c`.
- [~] **HRM Đợt 2** (D026) — đã land: `updateEmployee`, ngưng việc (`is_active` + contract `end_date`), pending nghỉ phép toàn chi nhánh, nhãn `/admin/staff` = "Tài khoản & phân quyền", và notification nghỉ phép **2 chiều** (`approve`/`reject_leave_request` → kind `hr.leave_approved`/`hr.leave_rejected`, merged `48781506`). Còn lại: owner apply migration `20260627121500` lên prod + runtime verify.
- [~] **HRM payroll/base_salary** (D026/D031) — checkout đã có payroll HKD đơn giản: `calculatePayroll` đọc `employees.base_salary`, lọc `is_active && base_salary > 0`, tính công theo 2 ca/ngày, PIT theo legal-version, proration đã clamp qua `Math.min(workingDays, standardDays)`, calculate+status đã đi qua `upsert_payroll_calculation`, và `/hr` có tab/link vào `/hr/payroll`. `standard_days` owner nhập đã land (đọc `period.standard_days`, không còn tự đếm T2-T6). Còn thật: export CSV/Excel, màn đối chiếu trước duyệt, và runtime verify.
- [ ] **UI ratchet real-debt bridge** — Goal: close the component-system debt by route family, using `docs/spec/design-system.md` as the only UI authority and treating `pnpm audit:ui-components -- --family <family>` as orientation only. Do not chase audit totals to zero: shrink real debt, reconcile stale baselines for free, and keep documented exceptions when the workflow needs the primitive directly.
  - **Definition of done per slice:** state the surface, primary user job, route family, change type, and primitives before implementation; run family audit before/after; reduce at least one real-debt signal or explicitly classify it as a contract-valid exception; add/update focused static tests when a guard/audit rule changes; pass `corepack pnpm lint:ui-contract` plus focused route tests; run `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm build` before marking an implementation slice complete.
  - **W0 audit correctness / adapter floor:** keep adapter implementation files out of debt scoring, count `useIsMobile` call sites (not imports), count object `STATUS` maps only, and never add wrapper layers just to improve a score. Current checkout: PWA help Dialog consolidated into shared `PwaInstallHelpDialog`; branch/employee PWA Dialog debt burned down.
  - **W1 Inventory:** first close structural drift that users feel: width/header/mobile chrome, panel/card clones, chart motion/color drift, form-field idiom splits, and DataTable/mobile-card twins. Current `inventory` audit has only two high-risk signals: `production-order-list.tsx` shortage Dialog is a valid short contextual result dialog, and `grn/[id]/grn-detail-client.tsx` uses device-derived mobile navigation for receiver flow; do not refactor either just for the score.
  - **W2 Finance:** burn down table/card/dialog remnants only where they duplicate existing adapters (`DataTable`, `KpiCard`, `FormDialog`, `AppSection`) or expose mixed form idioms. Do not change finance metric definitions until the owner resolves the dashboard metric decision.
  - **W3 HR:** finish the remaining real-debt surfaces: checklist-template builder to `FormDialog`/form helpers, payroll detail width parity, local status-badge replacement, and narrow wrapper cleanup. HR direct `Table` and route-local `STATUS` maps are already at zero in the current checkout.
  - **W4 POS/KDS/Runner:** handle operational exceptions after runtime/Preview verification: WS-3 client splits by concern, first-viewport POS/KDS tails, duplicated order-target/status displays, disabled-reason discoverability, and destructive-action separation. Do not weaken POS/KDS workflow contracts to fit generic admin adapters.
  - **W5 Branch/Employee/Management shells:** keep one chrome family per route owner, project nav from the shared config, and remove branch/mobile header duplication only when the branch-native route slice is active.

### Audit 2026-06-21 — Mechanism follow-ups (each = own PR; specs reconstructed, audit worklog gone)

- [x] **Guard regex over-match literal** — ✅ PR #87: `guard-prod-db.mjs` `stripSqlNoise` (strip single-quoted literals + comments, NOT `$$` bodies) trước `WRITE_SQL`; 3 fixture mới khoá. SELECT chứa từ-khoá-write trong literal không còn bị chặn nhầm.
- [x] **CI scan: SECURITY DEFINER thiếu authz** — forward-migration static guard added in `security-definer-rpc-static.test.ts`: every new `SECURITY DEFINER` function must either contain an auth boundary (`has_permission`/`has_permission_any`/`auth_tenant_id`/`auth.uid()`/`auth.role()`) or revoke `PUBLIC`/`anon`/`authenticated` in the same migration; service-role-only bodies must not grant browser roles. Baseline/archive scan intentionally deferred to avoid noisy historical false positives.
- [x] **CI scan: RPC grants over-broad** — added forward-migration static guard in `apps/web/tests/security-definer-rpc-static.test.ts`: browser-executable `GRANT EXECUTE/ALL ... TO PUBLIC/anon/authenticated` must define an auth boundary in the same migration or sit in the explicit allowlist (`inv_to_base`, `generate_order_payment_code`). Targeted guard test green 2026-06-30.
- [x] **CI scan: route → ModuleKey coverage** — ✅ `apps/web/tests/protected-route-module-coverage.test.ts` (merged `00428f7e`): enumerate `app/(protected)/**/page.tsx`, resolve qua `resolveRouteFamilyContract` thật (KHÔNG replicate matcher), assert family non-public có `moduleKeys` (allowlist public = runner display).
- [ ] **Surface lỗi đọc DB bị nuốt** — nhiều Server Action nuốt Supabase `error` vào message generic (vd PostgREST `42702` ambiguous `branch_id` làm list rỗng im lặng — xem `database.md` Known Failure Patterns). Log `error.code`/`details` server-side (không leak ra client) để debug. Diện rộng; làm theo từng shell. T2.
- [ ] **cron_run_log + alert** — instrument các cron RPC (`cron_*`) bằng bảng run-log + alert khi fail/stale (producer vào `notifications` theo `notifications.md`). DB migration + prod apply (owner-delegated). T3.
- [x] **`cancel_pending_payment` in-function authz** — ✅ PR #89 (`af0125f5`): authz `p_tenant_id = auth_tenant_id()` + `has_permission(branch, 'pos:use')` (file `20260621190000_*` nay gộp trong `baseline.sql` qua #109). (Class `create_payment`/D043 cũ: definer + GRANT authenticated không verify.)
- [ ] **Completion-auth tightening (D043 defer)** — nếu owner muốn *hoàn tất* thanh toán cần `pos:confirm_payment` (thay vì `pos:use`): sửa `create_payment` RPC + action `createPayment` + route UI bill tiền mặt qua đường confirm. Quyết định owner đã hoãn 2026-06-21. T3.

## Blocked: No Non-Prod Runtime

> `.env.local` đang trỏ PROD. **Preview-branch validation ĐÃ LIVE (D047)** — PR **có
> đổi file DB** (migration/seed/config) tự sinh Supabase preview branch (full chain +
> seed) + Vercel preview để test (#136). Prod migrations VẪN manual (xem entry dưới).

- [~] **Preview-branch runtime (D047)** — **preview validation LIVE** qua GitHub-App PR có đổi file DB → replay repo baseline-first chain (gồm fold, fresh-create OK) + seed + Vercel preview, tất cả xanh (#136). Guard nới + consolidation XONG; HRM notif `20260627121500` đã apply prod. **GIỚI HẠN đã biết:** (1) MCP `create_branch` KHÔNG dùng được — replay prod *historical* ledger (167/539, fail ~25/04) → branch thiếu schema; chỉ GitHub-App PR branch chạy. (2) Branching prod-deploy/reconcile INCOMPATIBLE với baseline-first → "main" = MIGRATIONS_FAILED (protective, tránh apply baseline lên prod) → **prod migrations giữ MANUAL**. **Còn lại:** GitHub Actions billing (CI); owner verify/tắt Supabase "deploy to production" setting. Runbook `docs/runbooks/db/preview-branch-setup.md`.
- [~] **Design-system surface tails (cần staging/Preview)** — phần static đã land (xem Shipped); còn lại cần runtime env để verify. **Employee:** W5 nav-projection shell-collapse (project finance/inventory/office shell nav từ `nav-config.ts`, đổi nav theo role). **POS/KDS (7):** pos-desktop-shell dup order-target row vs cart/append header (md+), pos-table-gate service-mode selector scroll khỏi viewport-1, session-gate flex-center overflow clip, order-item-row pulse-ring single-source, bill confirm-button disabled-reason discoverability, cart-pane mobile clear-cart rest-state cue, order-item-actions void-button separation.

- [x] **✅ RESOLVED (#109 re-baseline, merged 2026-06-22) — re-extracted self-contained baseline (public+private) từ prod, replay sạch, `db:baseline:local-check` wired vào `ci.yml` (baseline-replay job). Original analysis kept as history:** Baseline không self-contained → không replay được env mới (ROOT CAUSE của cả section) — `supabase/migrations/00000000000000_baseline.sql` là dump `--schema=public`: nó GIỮ trigger/policy `public` tham chiếu `private.*` nhưng KHÔNG tạo `CREATE SCHEMA private` lẫn các function → `supabase start`/`db reset` trên DB trắng lỗi ngay `schema "private" does not exist` (tại `CREATE TRIGGER trg_staff_permissions_scope ... private.enforce_staff_permission_scope()`). Baseline tham chiếu 9 fn `private.*` (`enforce_staff_permission_scope`, `can_access_{grn,purchase_order,supplier_invoice,supplier_return}_source`, `staff_permission_effective_branch_id`, `finance_scope`, `enqueue_kitchen_completion_print_internal`, `staff_role_from_position_code`); prod hiện chỉ còn 4 (6 cái forward đã drop). Cùng class với regression `DROP-PUBLIC-CASCADE-DROPS-STORAGE-POLICIES` (dump public bỏ rơi managed-surface). **Prod KHÔNG hỏng** (build dần in-place, ledger khớp); chỉ artifact baseline không bootstrap được env mới — đây là lý do "No Non-Prod Runtime" chưa ai mở được, và `docs/ref/setup.md` chỉ seed qua `--linked` (giả định đã có remote DB đủ schema). **Fix gốc:** re-extract baseline từ prod hiện tại với đủ schema set (`public` + `private` + storage policies + extensions/managed-surface) qua `pnpm db:baseline:extract`; verify replay sạch bằng `pnpm db:baseline:local-check`; wire `db:baseline:local-check` vào `ci.yml` để chặn tái diễn. T3 (baseline/migration-chain + RLS fn + storage policy); migration/baseline file → PR → owner. Độ rộng đầy đủ (chỉ `private` hay còn storage/schema khác bị bỏ) đang được xác minh bằng local-bring-up 2026-06-21 — cập nhật entry này khi có kết quả.
- [~] **α4c — remove `can_access_branch`** — live/repo audit 2026-06-30 confirmed 0 active RLS policies and 4 KDS RPCs still used `can_access_branch`. File-only fix written in `20260629190446_kds_inline_branch_scope.sql`: KDS RPCs inline the branch predicate, then revoke/drop the helper. Còn lại: owner apply migration, then run `pnpm db:types` against the type-source schema.
- [ ] **WS-3 `pos-desktop-shell` + `order-detail-sheet`** — có realtime `.channel()` → split `_hooks/`+`views/` cần running-app verify. One PR per file. Goal = một concern rõ mỗi file (cohesion, KHÔNG đếm dòng).
- [x] **✅ RESOLVED (#110 e2e-smoke, 2026-06-22)** — `e2e-smoke` CI job dựng Supabase Local từ baseline + seed, prod-build app, chạy gate `payment-cash` → POS→payment→KDS smoked end-to-end trên DB+RPC thật. `payment-vietqr` và `edit-pending-pricing` đã xanh cục bộ nhưng chưa quay lại CI gate vì multi-spec timeout trên runner 2-core (xem mục CI multi-spec instability). `scripts/supabase-e2e-bringup.mjs` là non-prod runtime (thay staging cho nhóm POS spec). Runbook `docs/runbooks/inventory/pre-release-qa.md`.
- [ ] **Unused indexes (~231 prod)** — cần ≥1 chu kỳ (gồm month-end) `pg_stat_user_indexes` thật rồi mới DROP (`stats_reset` từng NULL → chưa đại diện).
- [ ] **Dead-RPC drop wave 2** — prod hiện `track_functions = none` → `pg_stat_user_functions` không tin được; cần bật tracking + traffic thật → 6-channel scan → wave ≤10. Tiers B/C/D per `RPC-DROP-MUST-SCAN-6-CHANNELS`. (Phase B 2026-06-17: 6-channel scan 13 ứng viên đã chạy → 0 cái Tier-A `total=0` an toàn; vẫn chặn vì thiếu telemetry runtime.)
- [~] **Real POS→payment→KDS/print→HĐĐT smoke** — POS→payment→KDS phần ĐÃ smoke trong CI (#110, prod-build + DB/RPC thật). CÒN LẠI: print-agent + HĐĐT cần live provider creds + máy in thật → vẫn cần dev/test/staging. Stock leg out per **D016** (`20260611001000` live). Tail `consume_stock_for_order` removal: dưới Dead-RPC.

## Chờ owner quyết / ops

- [ ] **Định nghĩa metric (chặn dashboard polish)** — chốt `doanh thu` (P&L: HĐĐT phát hành vs tiền đã thu) + các khoản trừ của `lãi gộp` (blueprint §7.3 — 4 co-founder; D028). Code đang dùng tạm `netRevenueBeforeVat − ingredientCost` để không chặn build. (2) device-signal tile chỉ xét lại nếu sau fail-silent wave vẫn sót lỗi in.
- [ ] **Dead-RPC candidates — Phase B 6-channel (2026-06-17): 0 xóa được ngay** — INTENTIONAL KEEP: `handle_new_user` (auth trigger), `has_position` (UI hints), `update_my_profile` (self-service granted authenticated), `sync_missing_permissions_from_template` (helper migration/seed, revoked 06-16), `consume_stock_for_order` (D016), `transition_order_status` (gọi `consume_stock_for_order`). UNCERTAIN/DEFER (0 ref tĩnh nhưng baseline bất biến + không telemetry): `transition_order_item_status`, `resolve_po_price(s_batch)`, `set_branch_kind`, `rotate_branch_override_code`, `try_auto_approve_grn`, `release_table`. MỚI orphan: `get_daily_revenue` (caller `fetchDailyRevenue` đã xóa). Drop chỉ khi có function-tracking → wave ≤10 Tier-A; T3 migration per RPC. (`post_payroll_journal` đã drop theo D020.)
- [ ] **Tách hóa đơn / `record_partial_payment` (D031 c)** — N partial-payment/đơn CHƯA build (mới ở plan `ux-ia-remediation-2026-06.md` D4a/D4b). 1 migration T3 nguyên tử: DROP `idx_payments_order_active` + nới gate amount (`create_payment`/`confirm_*`) + RPC `record_partial_payment` (FOR UPDATE+SUM); order flip 'paid' khi SUM(completed)>=total; status 'partial' derive-at-read.
- [ ] **Uptime monitor `/api/health`** — UptimeRobot (ops; route đã có).
- [ ] **HRM IA còn mở** — (a) payroll vào nav hay ẩn-chủ-đích; (b) gộp `/admin/staff` + `/hr`-employees ngay hay chờ W5; (c) selfie check-in có ai dùng không (nếu không → cân nhắc bỏ). D026 "Còn mở".
- [ ] **HRM Đợt 3 (payroll)** — chặn tới khi owner chốt bỏ Excel (D026 §3): UI `base_salary`+`dependents_count`, `calculatePayroll` eligibility theo base_salary (bỏ phụ thuộc 0-contract), `standard_days` cố định + clamp ≤ base (§1), Export Excel/CSV, view đối chiếu trước Duyệt, PIT trên phiếu, link `/hr`→`/hr/payroll`. IA: gom 5 tab → 3 trục Người·Ngày công·Lương.
- [ ] **F-018 Supplier "Khác"** — chọn 1: NCC chính thức / "Mua ngoài"+note / generic "Khác" (GRN hiện bắt `supplierId` dương).
- [ ] **transfer_ownership(p_new_user_id) RPC + UI** — chốt semantics (instant vs 2-phase, representative sync, audit shape, permission gate). Manual SQL UPDATE OK pilot. ADR 0005.
- [ ] **Print-agent deploy** — bundle v1.0.0 lên 3 chi nhánh (Phước Hải 0.2.0) + smoke `PRINTER_HOST=<ip> pnpm test:print`. (Print infra đã trong `baseline.sql` qua #109; file `20260611120000`/`20260611150000` ở `_archive/`. Chỉ còn deploy binary.)

## Deferred post-pilot (parked có chủ đích)

- [ ] **POS calls provider trước DB lock** — RPC fail = orphan gateway order. DEFER-WITH-MITIGATION (idempotency 23505 đã có).
- [ ] **HĐĐT e-invoice post-pilot** — reconcile cron orphan `signing` (admin retry covers pilot); replace flow TT 78 (pilot cancel + manual portal); provider config encrypted `system_settings` (env-only OK single-tenant); PDF/XML persist + download UI (portal link OK). 3-way matching `supplier_invoices` ĐÃ SHIP (bỏ khỏi đây).
- [x] **Inventory legacy backfill — Kho CN -> Bếp CN** — closed by read-only production dry-run on 2026-06-22: `scripts/inventory-legacy-kitchen-backfill.mjs --tenant-id 1 --json` found `legacyTransferCount=0`, `transferInMovementCount=0`, `phantomKitchenQuantity=0`, and `dryRunCorrections=0`. No write/backfill required.
- [ ] **Refund partial-refund T3** — duyệt partial flip cả `payments.status='refunded'` → chặn refund phần còn lại (`create_refund` cần `completed`) + overstate `get_revenue_kpis.voided_amount`. `20260612120000` chỉ sửa nhãn `orders.payment_status`. (Gộp "Refunds flow gaps" cũ vào đây — không có gap riêng.)
- [ ] **H3b** `has_permission()` dual-source flip — tripwire, chỉ flip nếu có incident silent-demote thứ 2 (`tenants.owner_user_id` ship `20260601500000`). Per ADR 0005.
- [ ] **F-009 Stock master-detail drawer** — side-panel `stock-client.tsx` hiện chấp nhận được; chỉ làm nếu thành vấn đề UX.
- [ ] **P3 Login rate-limit fail-open** — fail-open + log đã có; chỉ thiếu bảng `security_events` (chờ wave đó). Agent làm được nếu owner duyệt kéo wave lên.
- [ ] **Audit `insurance_base_salary`/`gross_salary`** — defer tới khi payroll vào app (Đợt 3); hiện `employment_contracts`=0, payroll Excel → audit surface rỗng. Hạ tầng `log_audit()` đã có.
- [ ] **M5-Ext S8 / M7 residual** — calc + reports (AP aging, consumption variance, yield_factor, PIT 5 bậc, BHXH) ĐÃ wire & UI. Chỉ còn GL posting formal — moot khi còn HKD (D012/D020). Re-scope hoặc đóng.
- [ ] **Inventory unbuilt scaffolds (E4)** — stocktake conflict-resolution dashboard, stocktake escalation flow, và auto-waste listing chưa build. 3 stub route `notFound()` đã xóa (D031 Track E4); server action scaffold (`closeRecountRound`/`escalateRound4`/`finalizeStocktake`/`listStocktakeConflicts`/`resolveStocktakeConflict` + supplier-returns write) đã xóa — build lại từ đầu khi có yêu cầu thật (conflict resolve hiện làm inline ở stocktake session detail qua RPC `resolve_stocktake_conflict` vẫn giữ).
- [ ] Automated E2E + staging env + inventory smoke runbook periodically — xem "Chặn: cần env".

## N/A while Má Tư is a Hộ kinh doanh (no formal BCTC)

- [ ] `voidJournalEntry` closed-period void mutates signed BCTC — moot: HKD files no BCTC (TT 152/2025); GL surface đang retire theo **D020** (code `voidJournalEntry`/`statement-actions.ts` đã gỡ). Revisit chỉ khi chuyển sang company form.

## Post-v1.0 (Tier 2)

> Owner trim 2026-06-10 (định hướng "phần mềm hỗ trợ Hộ Kinh Doanh" — see **D012**): Local-First/offline POS, VNPay, và Native POS migration (Flutter) ĐÃ LOẠI BỎ. Không đề xuất lại các hướng này.

- [ ] QR Self-Order tại bàn
- [ ] Loyalty / Vouchers
- [ ] Advanced Analytics
- [ ] Employee portal full features

## Shipped (condensed — see git / `regressions.md` for detail)

- **2026-06-27** — Backlog-next batch: WS-3 split `grn-detail-client` (1596→~340, `d698d482`); route→ModuleKey guard test (`00428f7e`); HRM 2-way leave notification (`48781506`, migration `20260627121500` **applied to prod 2026-06-27**, ledger `hr_leave_result_notification`); D047 preview-branch runtime + runbook (`cfcae5d1`); fold managed-surfaces migration (merged #135 `4c483cee`); guard relax create_branch/delete_branch (`0fc46850`).
- **2026-06-22** — Design-system surface reform committed (`b3433fec`/`facb7a2c`): Employee waves 1–3 + `BrandLogoBox`/`AppBottomNav`/status-badge `dots` single-sourcing + `CONSUMPTION_REPORT_STATUS_LABELS_VI`/`LEAVE_TYPE_LABELS_VI` (shared) + visual spec; POS/KDS static subset (focus-view decorative motion removed, append-draft-pane dup badge, bill cash-shortfall `text-destructive`); **POS close-shift relabel** (step-1 "Chốt ca" + confirm gate, step-2 read-only "Xong", "Đếm lại" = pre-commit cancel). Runtime-gated tails → No-Runtime.
- **2026-06-15/16** — HRM per-shift attendance + checklist rework (D026/D027): 2 ca Global + attendance re-key `(employee,date,shift,tenant)` + scope/phase EN + position-default checklist + 7 template/95 việc; migrations `130000/160000/170000/180000/181000` LIVE; scope-editor + position-default UI (commit `f7438718`). orders.customer_count drop (`20260616100000`, p1–p6 live). Settings: HKD identity card + `update_tenant_identity` RPC.
- **2026-06-13** — POS/KDS/Runner fulfillment simplification (collapse `preparing`→pending; Runner live queue only); **D017** steps 4–5 (Admin L0 Tenant Command + Branch Command day-metrics). Tenant-admin fallback removal (**D018**, `20260613110000`) + dead role-string cleanup (`20260613130000`) applied to prod + verified (retired tenant-admin/area buckets stripped from 37 fns + 13 RLS policies).
- **2026-06-14** — Supabase advisor waves (prod): definer revoke Wave 5 (161→158), `auth_rls_initplan` 20→0, FK covering indexes (145→141). Worklogs `docs/worklog/supabase-{definer-revoke-wave5,rls-initplan,fk-indexes}-2026-06-14.md`. Migration files `20260614090000/091000/092000` committed (`2cfe8c00`).
- **2026-06-11** — UX E2E B1–B6 (ready→handoff, peak >15 đơn, fail-silent print/HĐĐT/runner alerts, fewer-taps, visual pass, W4.4 DataTable twins→0); UI molecule **D014** W0–W4 (loading/error/404 frames, StatusBadge SSOT + 3 vocab-vs-DB bug fixes, formatVND single style, KpiCard canonical, Empty/Confirm single path, DataTable canonical 6 real consumers); print-agent bitmap-only + VietQR on payment receipt; owner template editor + `packages/print-render` (agent esbuild single-file); HRM Phase 2 (drop `shift_assignments` + HR keys 9→5 + rename `hr:approve_checkout`).
- **2026-06-10** — HRM "1 trục Ngày công": leave grants backfill + drop shift-register flow + drop `shift_requests`; canonical position codes (lean to 11, English-only mappers, push-targeting fix); Branch Manager default-shift on clock-in + branch employee list; BM attendance simplification.
- **2026-06-09** — HKD Finance/Admin surface cleanup (operating finance default, accounting hidden); Employee Portal mobile-first overhaul (multiple distill/motion/IA passes); per-role checklist templates; protected route-map + nav contract; checkout-approval flow.
- **2026-05-30** (git `ac95f841..43a3ec4b`) — HĐĐT B2B double-issue guard; payroll-draft + attendance-bypass + `stock_transfer_items` + RLS-policy-dedup fixes; `requireBranchScope` ×22; clock-in graceful shift-window; **baseline-first migration consolidation** (`00000000000000_baseline.sql` + forward chain, 358 archived) + managed-surfaces companion.
- **2026-05-27 — Shell helpers refactor** — `with-action.ts` (`withActionPositional`/`customAuth`/`afterSuccess`) + `rpc-error-map.ts`; all `Skip withAction` annotations removed (WS-1b/2 closed); WS-3 concern-split done for `order-actions` / `grn-actions` / `production-actions` / inventory `actions` (client-shell decomposition is the remaining tail — see Agent-doable + Chặn-env).
- **2026-05-24** — Pilot hardening (snapshot-doc refresh, schema source-ladder, route-group migration, network-gate D9); Interface closure IF-001..012 (retired `matu-*` pilot layer, UI guards, Finance-Basic landing); Pre-deploy + M4 Payments + M6 Finance P0 (refund RPCs, webhook idempotency + MoMo tenant-binding + server-recompute total, audit-log RPC-only + PII strip, HĐĐT cancel-reason ≥20); Network gate D9 + VietQR/Momo live + HĐĐT via Viettel; Sprint 6 Inventory UX (F-017 PO display id, server-side GRN drafts).
- **Auth foundation** — H3 intermediate access scoping replaced by explicit branch grants / tenant-level permissions (no intermediate scope remains). Legacy `employees_manage`/`shifts_manage` verified absent.

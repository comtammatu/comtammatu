# Backlog — Post-Pilot Features

> Features đã review nhưng defer ra sau v1.0.0 pilot.
> Promote vào sprint khi pilot stable.
> Updated: 2026-04-24

## Inventory Redesign — Approved Workshop (2026-04-24)

> Spec: `docs/plan/inventory-redesign.md`. 7 policy chốt + 10 blocker đã duyệt. Ship qua 9 sprint bắt đầu bằng S0 foundation.

### S0 — Foundation sprint ✅ SHIPPED 2026-04-24

Migrations `20260425050000_s0a`, `20260425060000_s0b`, `20260425070000_s0c` applied to dev DB `iexwsuaqqenyjiskawoj`. Build + lint + typecheck all green.

- [x] **S0-a `timezone + shift_key`** — `branches.timezone TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh'`; `inventory_shift_key(branch_id, at)` RETURNS TEXT canonical `YYYY-MM-DD_{morning|afternoon|evening}` with 04:00 business-day cutoff per branch tz. Verified 6/6 boundary tests (morning/afternoon/evening/overnight/4am-exact/3:59:59).
- [x] **S0-b `catalog_review_policy`** — `ingredient_category_review_policy(tenant_id, category, requires_manual_review)` + `ingredients.review_override BOOLEAN`; resolver `inventory_requires_manual_review(ingredient_id)` = override ?? category policy ?? false. RLS gated by `inventory:catalog_review_policy_set`.
- [x] **S0-c(A) `branch_override_codes`** — bcrypt hash (pgcrypto `crypt`/`gen_salt`); `rotate_branch_override_code()` + `verify_branch_override_code()` with 3-attempts/min rate limit via `branch_override_attempts`. RPC-only access (USING false).
- [x] **S0-c(B) `accounting_periods`** — two-stage close (`soft_closed_at`, `hard_closed_at`); `period_status_at(tenant, at)` + `enforce_period_close()` trigger scaffold. Write-gated by `accounting:period_reopen`. Triggers attach in S2/S3/S5.
- [x] **S0-c(C) `branch_daily_waste_cap`** — snapshot table + `compute_branch_daily_waste_caps()` with `max(500k, min(5tr, 0.025 × avg_rev_7d))`; pg_cron `30 17 * * *` UTC (00:30 VN). Seeded 4 active branches.
- [x] **S0-c(D) 14 permission keys** — inserted into `permission_keys` catalog (68 → 82). Role templates extended: `quan_ly_CN +7`, `quan_ly_vung +10`, `kho_truong +1`, `ke_toan +1`, `ke_toan_truong +2`, `owner/super_manager +14`. Mirrored to `packages/shared/src/auth/permissions.ts` (`PERMISSION_KEY_COUNT = 82`).
- [ ] **MV access wrappers** — DEFERRED to sprints that create each MV (S1 for `mv_grn_price_baseline`, S4 for `mv_inventory_stock_current`, S5 for `mv_inventory_value_ranking`). Regression rule `RLS-NOT-APPLIED-ON-MV` enforces pattern at that time.

**Exit criteria met**: regression rules in `tasks/regressions.md` (5 new entries for S0 date) enforced; Q1–Q7 sprints unblocked.

### S1–S9+ sprint queue (from `docs/plan/inventory-redesign.md §4`)

| Sprint | Scope | Gate |
|---|---|---|
| ~~S1~~ | ~~Q6 tier 1 (supplier_price_list) + Q3 baseline MV~~ | ✅ SHIPPED 2026-04-24 — `20260425080000_s1_supplier_price_list_and_baseline_mv.sql`. Priority gen column verified (contract=1<quotation=2<grn_last=3). MV revoked from authenticated per RLS-NOT-APPLIED-ON-MV; hourly cron. Resolvers + baseline fallback chain (same_supplier → any_supplier → none). No auto-trigger; goes into S2. |
| ~~S2~~ | ~~Q3 full (symmetric 3-tier + override code + hardblock exception + baseline pause)~~ | ✅ SHIPPED 2026-04-24 — `20260425090000_s2`, `20260425091000_s2a_baseline_variance_column`, `20260425092000_s2b_fix_baseline_mv_date_cast`. 4-tier ladder verified in-transaction (0/1/2/3 at 4.76%/23.8%/61.9%/185.7%), `is_hard_blocked` toggles at tier 3. `baseline_variance_pct` added as separate column (pre-existing `price_variance_pct` is generated GRN↔PO, kept intact). Hardblock RPC: 2/week rate-limit, evidence URL + 50-char note + 6 reason codes. 30-day baseline pause on override. Auto-upsert `grn_last` on confirm (skipped when `express_approved=true`). Storage bucket `grn-evidence` RLS-gated. Weekly cron report → notifications. |
| ~~S3~~ | ~~Q1 full (2-tier + anti-split v2 + POS/KDS auto-gen)~~ | ✅ SHIPPED 2026-04-24 — `20260425100000_s3`. Tier ladder 0/1/2 verified; photo rejection on tier-1-without-url; reason_code immutability; period-close hard-block for stock_issues. RPCs: `create_waste_entry`, `approve_waste`, `create_waste_from_order`. Branch-daily-cap, shift-cap 1.5tr, rolling-15min same-SKU, manual-review flag all wired into BEFORE-trigger. Weekly cron `weekly_waste_report`. **Photo EXIF validation DEFERRED to S3-b Edge Function** (schema-only deploy). |
| ~~S4~~ | ~~Q5 dashboard + MVP stabilize~~ | ✅ SHIPPED 2026-04-24 — `20260425110000_s4`. `mv_inventory_stock_current` (26 rows, refreshed /5min CONCURRENTLY). Wrapper RPCs: `get_inventory_dashboard(branch_id)` returning {summary, locations[], top_alerts[], in_transit[]}; `get_inventory_alerts(branch_id, types[], limit, offset)`; `refresh_inventory_dashboard()`. Cost fields masked NULL unless `reports:view_branch`/`reports:view_tenant`. Regression RLS-NOT-APPLIED-ON-MV enforced (authenticated REVOKED). **Perf: 0.381 ms execution** (< 800ms target; 2100× headroom). **MVP milestone — Q1+Q3+Q5+Q6-tier1+S0 foundation shipped.** |
| ~~S5~~ | ~~Q2 blind + recount + cross-branch audit~~ | ✅ SHIPPED 2026-04-24 — `20260425120000_s5`. 7 session cols + 5 line cols added. `ingredient_abc_class` + `mv_inventory_value_ranking` (REVOKED) + `refresh_abc_classification()` cron Sunday 02:00 VN. RESTRICTIVE RLS `stocktake_lines_blind_block` (gates blind sessions behind `inventory:stocktake_unblind`). 9 RPCs: start_stocktake (seeds round-1 + ABC snapshot), get_stocktake_lines_blind (omits system_quantity), submit_count_round, close_recount_round (tier-A tighter thresholds + median on round≥2), finalize_stocktake, escalate_round_4 (QLV+admin, note≥20), assign_auditor (soft un-audited flag per §B1). ABC compute returned 20 classified ingredients. |
| ~~S6~~ | ~~Q4a deterministic auto-approve + Express window~~ | ✅ SHIPPED 2026-04-24 — `20260425130000_s6`. Tables: `branch_express_window` (seeded 4 active branches @ 06:00-09:00), `grn_express_extend_audit`. RPCs: `configure_express_window` (QLV/Admin), `extend_express_window` (QL CN +60min, 3/week rate-limit, note≥10), `grn_is_auto_approvable` (7-condition JSONB evaluator with soft/hard split + in_window), `try_auto_approve_grn` (wrapper: eval → confirm + express_approved=true). Conditions 1/3/4/5/7 hard; 2 (variance) + 6 (supplier history) soft (express bypass only in window). S2 trigger `trg_grn_upsert_grn_last_on_confirm` skips upsert when `express_approved=true` — circular baseline guard. |
| ~~S7~~ | ~~Q7 RFC + pilot 1 CN (Layer 1+2)~~ | ✅ SHIPPED 2026-04-24 (server-side scaffold) — `20260425140000_s7`. Schema: `stocktake_sessions.offline_enabled`, `stocktake_lines.client_op_id+offline_created_at`. Tables: `stocktake_zone_locks` (30-min TTL + heartbeat), `stocktake_conflicts` (resolver ledger). RPCs: `acquire_zone_lock`/`heartbeat`/`release`, `resolve_stocktake_conflict`. `submit_count_round` return changed INT→JSONB `{applied_count, conflict_count}` with clock-tamper reject (`offline_created_at` outside `[session.started_at, now()+5min]`) + `is_final_overwrite` conflict detection per OFFLINE-NO-SILENT-CLIENTWINS regression rule. **Client-side artifacts (Dexie, uuidv7, private-mode detect, fail-safe email) deferred outside migration, gated by feature flag per session.** |
| ~~S8~~ | ~~Q7 rollout + Q4b trust_score design~~ | ✅ SHIPPED 2026-04-24 — `20260425150000_s8`. Period close: `close_period_soft`/`close_period_hard`/`reopen_period` RPCs + `auto_close_periods()` daily cron 02:00 VN — verified prior month (2026-03) soft+hard closed on day-24 invocation. Q4b scaffold: `user_trust_score` table + RLS + stub `compute_user_trust_score()` (50/60/70 tier stub; asymmetric decay deferred to S9). Q7 rollout: `enable_offline_for_session(session_id)` gated by `settings:tenant`; audit via `offline_enabled_by/at` cols. |
| ~~S9~~ | ~~Q4b trust_score build + supplier_items~~ | ✅ SHIPPED 2026-04-24 — `20260425160000_s9` + `s9a` volatility fix. Real Q4b formula: warmup 50+n (first 20 clean/60d), post 70+(n-20)*0.5, incident −20, cap 85 if incident. `grn_is_auto_approvable` extended: **8 conditions** (+ `c8_trust_score_ok` hard ≥70). Tested: fresh user → score 50, cache upsert verified. `supplier_items` table + RLS shipped (Q6 phase 3 scaffold; wiring deferred). |

## Hoàn thành (moved out of backlog)

- ✅ **Notifications System** — shipped with print agent pilot (commit `7649253`, 2026-04-20). `/notifications` route + in-app alerts live.
- ✅ **Stock Counts (Kiểm kê)** — shipped via M5 Phase 0 (`stocktake_sessions`, `stocktake_lines`, end-to-end flow).
- ✅ **Warehouses + Stock Transfers** — shipped via multi-instance Kho Tổng (`central_warehouse`) + Bếp trung tâm (`central_kitchen`) model; transfer direction matrix enforced via DB trigger. See [D000](decisions.md#d000).

## Post-Pilot (Priority Order)

### Waste Logs

- `waste_logs` table — ghi nhận hao hụt/hư hỏng nguyên liệu
- Stock movement type='waste'
- Food cost accuracy improvement
- **Depends on:** M5 (Stock)

### KDS Timing Rules

- `kds_timing_rules` table — cảnh báo món chậm theo category
- Color escalation: green → yellow → red
- **Depends on:** M3 (KDS)

### Push Notifications (web + mobile)

- `push_subscriptions` table (in-app + /notifications route đã ship)
- Web push API + service worker
- **Depends on:** existing notifications module

## Post-v1.0 (Tier 2)

### Delivery Integration

- `delivery_orders` + `delivery_platforms` + `platform_menu_mappings`
- GrabFood + ShopeeFood auto-sync
- **Depends on:** M2 (POS) + M1 (Menu)

### Marketing Campaigns

- `campaigns` + `campaign_recipients`
- Zalo OA/ZNS notifications
- Targeted promotions
- **Depends on:** Post-v1.0 (Loyalty)

### Device Registration

- `registered_devices` table — POS device management
- Approve/reject devices per branch
- **Depends on:** M2 (POS)

### Leave Management

- `leave_requests` table — xin nghỉ phép
- Approval workflow (employee → manager)
- **Depends on:** M7 (Nhân sự & tiền lương)

### Shift Assignments UI

- `shift_assignments` table tồn tại; cần calendar view + auto-assignment
- **Depends on:** M7 (Nhân sự & tiền lương)

## Explicitly Excluded (from greenfield)

| Feature                 | Reason                                             |
| ----------------------- | -------------------------------------------------- |
| `menus` (wrapper table) | Old multi-brand pattern. Direct categories → items |
| `menu_branches`         | Single-tenant, no per-branch menu variants         |
| `deletion_requests`     | GDPR-style. Not required for internal F&B          |
| `security_events`       | Merged into audit_logs                             |
| `registered_devices`    | Simplified — POS terminals handle device identity  |

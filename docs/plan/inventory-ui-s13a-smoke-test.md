# S13a Pilot Smoke Test — Stocktake Basic + Blind + Auto-save

> Manual end-to-end verification for S13a: basic stocktake workflow, blind
> counting, 30s draft auto-save, zone-lock lifecycle.
> Run before pilot cutover at Kho Tổng (#1) + Đất Đỏ (#2).

## Prerequisites

- S0–S9 DB foundation applied
- Migration `20260425180000_s13a_stocktake_drafts.sql` applied (`supabase db push`)
- `pnpm db:types` regenerated after migration
- `branch_feature_flags` seeded with `inv_s13a_stocktake_v2`
- RPCs live: `start_stocktake`, `get_stocktake_lines_blind`, `submit_count_round`,
  `acquire_zone_lock`, `heartbeat_zone_lock`, `release_zone_lock`,
  `is_feature_enabled`
- Test user has permission key `inventory:stocktake_create` on pilot branches

## Step 0 — Enable S13a flag for pilot branches

```sql
UPDATE public.branch_feature_flags
   SET enabled = true, enabled_at = now()
 WHERE branch_id IN (1, 2)
   AND flag_key = 'inv_s13a_stocktake_v2';

SELECT branch_id, flag_key, enabled, enabled_at
  FROM public.branch_feature_flags
 WHERE branch_id IN (1, 2) AND flag_key = 'inv_s13a_stocktake_v2';
```

Expect: 2 rows, both `enabled = true`.

## Step 1 — Flag gate blocks non-pilot branches

1. Navigate `/inventory/stocktake/new` as a user whose claims.branch_id = 3
2. Expect redirect to `/inventory/stocktake?branchId=3&error=stocktake_v2_not_enabled`
3. Re-test as a user with branch_id = 2 → page renders normally

## Step 2 — New session form layout

Login as QLV for branch #2. Navigate `/inventory/stocktake/new`.

1. Header: "Bắt đầu kiểm kê" + description
2. Left card "Chế độ kiểm kê": 5 mode radio-cards
   - `daily` — "Unaudited" badge, **no** Blind badge
   - `weekly` — no badges
   - `monthly` — "Blind" badge
   - `quarterly` — "Blind" badge
   - `spot` — "Blind" badge
3. Each card description is VN prose (e.g. "Full inventory, blind mode…")
4. Branch select pre-populated from session claim; Location select disabled
   until a branch is picked
5. Switch "Blind mode" reflects per-mode default (toggle flips to override)
6. Threshold % + VND inputs accept VN-formatted numbers
7. Right card "Tóm tắt" live-updates as form changes

## Step 3 — Start session

1. Pick mode `monthly`, keep branch = 2, skip location, leave overrides blank
2. Click "Bắt đầu đếm"
3. Toast: "Đã tạo session #N — X dòng"
4. Browser routes to `/inventory/stocktake/{N}/count`

Verify in DB:
```sql
SELECT id, mode, blind_mode, is_unaudited, branch_id, created_at
  FROM public.stocktake_sessions
 WHERE id = <N>;
-- Expect: mode='monthly', blind_mode=true, is_unaudited=false
```

## Step 4 — Count page layout

1. Header: "Đếm kiểm kê #N · CN #2 · Round R1"
2. Round stepper: R1 active (primary tone), R2/R3 pending (muted), R4 pending
3. Draft-saver badge: "Chưa có draft" (idle tone)
4. Zone lock indicator: acquires on mount → green "Bạn đang giữ lock" + MM:SS
   countdown
5. BlindCountingGrid renders seeded rows (one per ingredient in ABC scope)
6. Each row shows ingredient, ABC chip, unit, qty input, "R1" badge
7. System quantity column is NEVER rendered

Network verify:
- `get_stocktake_lines_blind` response payload has no `system_quantity` key

## Step 5 — Auto-save (30s debounce)

1. Enter qty 5 into row 1
2. Observe Draft-saver badge stays "Chưa có draft" for <30s
3. After 30s: badge flips to "Đang lưu draft…" briefly, then
   "Đã lưu HH:MM" (green tone)
4. Verify in DB:
```sql
SELECT session_id, draft_counts, last_saved_at, saved_by
  FROM public.stocktake_drafts
 WHERE session_id = <N>;
-- Expect 1 row with draft_counts JSON matching ingredient_id → { qty: 5 }
```
5. Enter qty on row 2 → debounce resets → after 30s re-saves with combined map

## Step 6 — Zone lock heartbeat

1. With session open in tab A, note lock holder + countdown
2. Wait ≥10 min (1/3 of default 1800s TTL) — countdown refreshes automatically
3. Inspect `public.stocktake_zone_locks` table — `expires_at` advanced
4. In tab B (different user, same branch), open same session
5. Expect tab B indicator: "Đã có người giữ" (orange tone)
6. Click "Thử lại" in tab B → still blocked
7. Close tab A → `release_zone_lock` fires → tab B "Thử lại" now succeeds

## Step 7 — Zone lock lost ownership

1. With tab A holding lock, manually force-release via SQL:
```sql
SELECT public.release_zone_lock(<session_id>, 'session-<N>');
```
2. In tab A, wait for next heartbeat (≤10 min) OR click "Gia hạn"
3. Expect toast "Mất zone lock — ngừng nhập số đếm"
4. Inputs become disabled (readOnly)
5. Indicator flips to red "Mất lock"

## Step 8 — Submit round 1

1. Fill in at least 3 rows with realistic qtys
2. Click "Kết thúc round"
3. Pre-submit: `flush()` forces draft save (badge briefly "Đang lưu…")
4. Server call: `submit_count_round(session_id, round_no=1, counts=[...])`
5. Toast: "Round 1 — áp dụng X, conflict 0"
6. Page refreshes (`router.refresh()`)
7. Rows that are now `is_final=true` show green "Final" badge; rows with
   variance beyond threshold show orange "Cần recount" + increment R2 counter
   in stepper

## Step 9 — ABC class propagation

1. Pick one A-class ingredient, hover the red "A" chip → tooltip
   "Nhóm A — ngưỡng recount chặt: 3% hoặc 100k VND"
2. Submit a slightly off count (e.g. 2% variance) → expect `is_final=true`
   (under 3% threshold)
3. Submit a 4% variance A-class count → expect row flagged `needs_recount`

Verify server-side:
```sql
SELECT ingredient_id, abc_class, needs_recount, is_final
  FROM public.stocktake_lines
 WHERE session_id = <N>
   AND abc_class = 'A';
```

## Step 10 — Flag-off fallback

1. Turn off flag:
```sql
UPDATE public.branch_feature_flags
   SET enabled = false
 WHERE branch_id = 2 AND flag_key = 'inv_s13a_stocktake_v2';
```
2. Navigate `/inventory/stocktake/{N}/count`
3. Expect redirect to `/inventory/stocktake/{N}?error=stocktake_v2_not_enabled`
   (legacy detail view)
4. Navigate `/inventory/stocktake/new`
5. Expect redirect to list with `error=stocktake_v2_not_enabled` query param

## Step 11 — Draft cleanup on finalize

1. Re-enable flag, create session #M, enter counts, wait for draft save
2. Verify 1 row in `stocktake_drafts` for session #M
3. Finalize the session (via admin close flow or direct `delete stocktake_sessions`)
4. Verify:
```sql
SELECT COUNT(*) FROM public.stocktake_drafts WHERE session_id = <M>;
-- Expect: 0 (CASCADE deleted)
```

## Acceptance

All 11 steps must pass before enabling `inv_s13a_stocktake_v2` for additional
branches. If a step fails, file an issue referencing the step number and do
NOT widen the rollout.

## Known deferred

- Per-zone lock partitioning inside `draft_counts` JSONB (multiple counters
  per zone) — deferred to S13b
- R4 QLV+Admin escalation UI — deferred to S13b
- Conflict queue when `submit_count_round` returns `conflict_count > 0` —
  deferred to S13b
- Blind-mode variance visualization for R2+ rounds — blind flag flips on R4
  only in current UI; full variance reveal logic lands in S13b

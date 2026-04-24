# S13b Pilot Smoke Test — Recount Ladder + R4 Escalation + Conflict Queue

> Manual end-to-end verification for S13b: recount R2/R3 with variance
> heatmap, R4 QLV+Admin escalation (20-char note), offline conflict queue
> with 4 resolution modes, finalize gate.
> Run after S13a smoke test passes + pilot branches are live.

## Prerequisites

- S13a shipped + flag `inv_s13a_stocktake_v2` enabled for pilot branches 1 & 2
- S0-S9 DB foundation applied (including s5 recount RPCs + s7 conflict scaffold)
- RPCs live: `close_recount_round`, `escalate_round_4`, `finalize_stocktake`,
  `resolve_stocktake_conflict`, `submit_count_round` (offline branch)
- Test user has both `inventory:stocktake_recount` and
  `inventory:stocktake_complete` permissions on pilot branches
- At least one open session with seeded R1 lines (from S13a smoke test)

## Step 0 — Enable S13b flag for pilot branches

```sql
UPDATE public.branch_feature_flags
   SET enabled = true, enabled_at = now()
 WHERE branch_id IN (1, 2)
   AND flag_key = 'inv_s13b_stocktake_recount';

SELECT branch_id, flag_key, enabled
  FROM public.branch_feature_flags
 WHERE branch_id IN (1, 2)
   AND flag_key IN ('inv_s13a_stocktake_v2', 'inv_s13b_stocktake_recount');
```

Expect: 4 rows, all `enabled = true`.

## Step 1 — Flag gate blocks non-pilot branches

1. Navigate `/inventory/stocktake/conflicts?branchId=3` (branch without flag)
2. Expect redirect to `/inventory/stocktake?branchId=3&error=stocktake_recount_not_enabled`
3. Navigate `/inventory/stocktake/999/escalate`
4. Expect redirect to legacy detail + error param (if branch 999 off-flag);
   or notFound if session missing

## Step 2 — R2 variance heatmap appears

Pre-setup: from a session currently at R1, submit counts with moderate
variance (enough to flag `needs_recount` at a few A-class rows).

1. Navigate `/inventory/stocktake/{N}/count`
2. Click "Kết thúc round" — submits R1
3. Click "Đóng round R1" — calls `closeRecountRound`
4. Expect toast: "Round 1 đóng — X final, Y chuyển sang R2"
5. Page refreshes → round stepper shows R2 active, R1 done
6. **Biểu đồ variance R1→R2** card appears above the grid
7. Heatmap table: 7 columns (Nguyên liệu, ABC, R1, R2, R3, R4, Trạng thái)
8. R2 cells blank (no counts yet), R1 cells populated
9. Grid title switches to "Recount R2"; grid filters to `needs_recount` rows only
10. No "Chỉ xem cần recount" toggle visible (auto-applied at R2+)

## Step 3 — R2 counts + heatmap coloring

1. Enter R2 counts for 3 needs-recount rows — some matching R1, some different
2. Click "Kết thúc round" → submits R2
3. Page refreshes → heatmap R2 column now populated
4. **Cell tones** (percentage off median):
   - Yellow: > ½×threshold (e.g. A-class row 1.5%-3%)
   - Orange: > threshold
   - Red: > 2×threshold
5. Rows with R1 & R2 in agreement flip to `is_final`, show green "Final" badge
6. Rows still divergent remain `needs_recount`

## Step 4 — R3 and escalation trigger

1. Click "Đóng round R2"
2. If lines still flagged: toast "Round 2 đóng — Y chuyển sang R3"
   → round stepper → R3 active
3. Enter R3 counts that still diverge for at least 1 line
4. Submit R3, click "Đóng round R3"
5. Expected: toast warning **"còn X dòng cần escalation R4"**
6. Auto-redirect to `/inventory/stocktake/{N}/escalate`

## Step 5 — R4 escalation form

1. Land on `/inventory/stocktake/{N}/escalate`
2. Header: "Round-4 escalation — Session #N"
3. Each outstanding ingredient renders:
   - Name + ABC chip + unit
   - R1/R2/R3 history badges
   - Final qty `FormattedNumberInput`
   - Note textarea with **(N/20)** char counter
   - Escalate button disabled until qty + 20-char note satisfied
4. Verify note counter flips `text-muted-foreground` → `text-green-700` at 20 chars
5. Enter < 20 chars + valid qty, click Escalate → toast error
   "Ghi chú phải có ít nhất 20 ký tự"
6. Fill valid data, click Escalate → toast success
7. Row moves to **"Đã escalate"** resolved list with R4 badge + final qty
8. `needEscalation` counter in header decrements

Verify in DB:
```sql
SELECT session_id, ingredient_id, round_no, counted_quantity, is_final,
       variance_reason
  FROM public.stocktake_lines
 WHERE session_id = <N>
   AND round_no = 4;
```
Expect 1 row per escalation; `is_final=true`; `variance_reason` starts with `[ROUND4] `.

## Step 6 — Finalize session gate

1. While still `needEscalation.length > 0`: "Finalize session" button
   shows "Còn X dòng" and is disabled
2. Escalate the remaining rows
3. Button flips to "Finalize session" (enabled)
4. Click → `finalizeStocktake` RPC fires
5. Toast: "Đã finalize session — trạng thái completed"
6. Redirect to `/inventory/stocktake/{N}` (legacy detail)

Verify:
```sql
SELECT id, status, completed_at
  FROM public.stocktake_sessions
 WHERE id = <N>;
-- Expect: status='completed', completed_at ≈ now()
```

## Step 7 — Finalize blocked if R1 not final

Pre-setup: create a session with offline submit that left some R1 lines
`is_final=false` (or delete an escalation row manually).

1. Navigate `/inventory/stocktake/{N}/escalate`
2. If `needEscalation.length = 0` but R1 has non-final lines, clicking
   Finalize → RPC raises `22023 cannot finalize: Y round-1 line(s) still not final`
3. UI toast shows that VN-mapped error

## Step 8 — Conflict queue entry

Pre-setup: force a conflict via SQL (simulates offline client submit
overwriting a final line):

```sql
INSERT INTO public.stocktake_conflicts (
  tenant_id, session_id, ingredient_id, round_no, conflict_type,
  client_payload, server_payload, submitted_by, submitted_at
)
VALUES (
  1, <N>, <any_ingredient_id>, 1, 'is_final_overwrite',
  jsonb_build_object('counted_quantity', 9.0, 'client_op_id', gen_random_uuid()::text),
  jsonb_build_object('existing_counted_quantity', 10.0, 'is_final', true),
  auth.uid(), now() - interval '5 minutes'
);
```

1. Navigate `/inventory/stocktake/conflicts?branchId=<branch>`
2. Expect header: "Conflict queue — CN #X · 1 chờ xử lý · 0 đã resolve"
3. Pending card renders with:
   - Ingredient name + Session # + R1 badge
   - Red/orange conflict_type badge ("Ghi đè dòng đã final")
   - 2-col diff: blue **Server đang giữ** 10 · orange **Client offline submit** 9
   - JSON payloads pretty-printed
   - Note textarea + 4 action buttons

## Step 9 — Resolution modes

Test all 4 resolutions (use fresh injected conflicts for each):

### 9a. keep_server
1. Click "Giữ server" → toast "Conflict #X resolved — Giữ server"
2. Line `counted_quantity` unchanged (= 10.0)
3. Conflict row moves to resolved list (if `?resolved=1`)

### 9b. apply_client
1. Fresh conflict → click "Áp dụng client"
2. Line `counted_quantity` = 9.0 (the client value)

### 9c. manual_value
1. Fresh conflict → click "Thủ công"
2. Inline number input appears
3. Click confirm with empty input → toast error "Nhập số lượng hợp lệ"
4. Enter 11.5 → click "Xác nhận thủ công"
5. Line `counted_quantity` = 11.5; resolved.resolution_qty = 11.5

### 9d. reject
1. Fresh conflict → click "Reject (không đổi)"
2. Line untouched (same as before conflict created)
3. Row marked resolved with resolution='reject', resolution_qty=null

Verify in DB after each:
```sql
SELECT id, resolution, resolution_qty, resolved_at, resolution_note
  FROM public.stocktake_conflicts
 WHERE id = <conflict_id>;
```

## Step 10 — Filter toggle

1. On conflict queue with 0 pending
2. Click "Bao gồm đã resolve" button
3. URL becomes `/inventory/stocktake/conflicts?branchId=<x>&resolved=1`
4. Resolved section renders with compact rows + resolution badges
5. Click "Chỉ chờ xử lý" → URL drops `?resolved=1`, resolved list hides

## Step 11 — Permission enforcement

1. Login as a user without `inventory:stocktake_recount` permission
2. Navigate `/inventory/stocktake/{N}/count` → submit R1 + click "Đóng round R1"
3. Expect toast error: "Không có quyền đóng round"
4. Navigate `/inventory/stocktake/{N}/escalate`
5. Escalate button disabled OR server returns 42501 → toast "Không có quyền escalate"
6. Navigate `/inventory/stocktake/conflicts` → same result on resolution buttons

## Acceptance

All 11 steps must pass before enabling `inv_s13b_stocktake_recount` for
additional branches. If a step fails, file an issue referencing the step
number and do NOT widen the rollout.

## Known deferred

- Zone-lock rehearsal test with 2 physical devices on same zone — deferred
  to Tranche 3 QA adversarial suite
- Automated Playwright test for the 11 steps — deferred to QA sprint
- Ingredient-level trust score after escalation — S15 concern

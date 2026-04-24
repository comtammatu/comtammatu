# S12 Pilot Smoke Test — Dashboard + Period Admin

> Manual end-to-end verification for S12 inventory dashboard v2 + accounting period admin.
> Run before pilot cutover at Kho Tổng (#1) + Đất Đỏ (#2).

## Prerequisites
- S0-S11 migrations + S10/S11 UI shipped
- `branch_feature_flags` seeded
- Dashboard MV populated via `SELECT public.refresh_inventory_dashboard();`

## Step 0 — Enable S12 flag for pilot branches

```sql
UPDATE public.branch_feature_flags
   SET enabled = true, enabled_at = now()
 WHERE branch_id IN (1, 2)
   AND flag_key = 'inv_s12_dashboard_v2';
```

Verify:
```sql
SELECT branch_id, flag_key, enabled
FROM public.branch_feature_flags
WHERE branch_id IN (1,2) AND flag_key = 'inv_s12_dashboard_v2';
```

## Step 1 — Dashboard loads for pilot branch

1. Navigate `/inventory/dashboard?branchId=2`
2. Expect header: "Inventory dashboard • v2 pilot • Chi nhánh Đất Đỏ"
3. Expect 4 summary cards render:
   - Tổng giá trị tồn (shows "—" if no reports perm; else VND)
   - Số SKU đang hoạt động
   - Alert tồn thấp (orange tone if > 0)
   - In-transit
4. Expect Location breakdown table with per-location rows
5. Expect right sidebar: Top 5 alerts card + In-transit card
6. Expect "Cập nhật lúc HH:mm:ss" timestamp next to refresh button

## Step 2 — Auto branch redirect

1. Navigate `/inventory/dashboard` (no branchId)
2. Expect redirect to `/inventory/dashboard?branchId=X` where X = first active branch
3. If no active branches exist, redirect to `/inventory`

## Step 3 — Feature flag disabled fallback

1. Turn off flag for branch 3:
```sql
UPDATE public.branch_feature_flags SET enabled = false
 WHERE branch_id = 3 AND flag_key = 'inv_s12_dashboard_v2';
```
2. Navigate `/inventory/dashboard?branchId=3`
3. Expect redirect to `/inventory?branchId=3&error=dashboard_v2_not_enabled`

## Step 4 — Refresh button

1. On dashboard, note "Cập nhật lúc: 14:32:15"
2. Click "Làm mới"
3. Spinner shows, page re-fetches, timestamp updates to current time
4. Toast: "Đã refresh dashboard"
5. Click "Làm mới" again within 60s
6. Expect toast: "Vui lòng đợi Xs trước khi refresh lại"

## Step 5 — Alerts drawer

1. Click "Xem tất cả alert" trigger with red badge showing count
2. Sheet opens from right với full alert list
3. Test type filter chips: click "Tồn thấp" → list filters to low_stock only
4. Click "Tải thêm" if pagination available (>50 alerts)
5. Each alert row shows ingredient, location, shortage % badge, tồn/ngưỡng

## Step 6 — Cost masking

1. Login as user WITHOUT `reports:view_branch` perm (e.g. `chef` role user)
2. Dashboard loads but:
   - "Tổng giá trị tồn" card shows "—" with hint "Không có quyền xem cost"
   - Location table "Giá trị" column hidden
   - Tổng row hidden

## Step 7 — Period admin page

1. Navigate `/admin/accounting/periods`
2. Expect 13 cards (current + 12 prior months)
3. Each card state:
   - Open (no badge)
   - Soft closed (amber badge + timestamp)
   - Hard closed (red badge + timestamp)
4. For March 2026 (auto-closed by cron earlier): expect red "Hard closed" badge

## Step 8 — Soft close manual

1. Click "Soft close" on any "Open" card
2. Card re-renders with amber "Soft closed" badge
3. SQL verify:
```sql
SELECT year, month, soft_closed_at, hard_closed_at
FROM public.accounting_periods
WHERE year = 2026 AND month = 4;
```

## Step 9 — Hard close with typed confirm

1. Click "Hard close" on soft-closed card
2. AlertDialog opens: "Hard close 04/2026?"
3. Type anything except "CLOSE" → "Xác nhận" disabled
4. Type "CLOSE" → "Xác nhận" enabled
5. Click confirm → card re-renders với red badge
6. Back-dated insert blocked (verify by creating waste với `issued_at = '2026-04-10'`):
```sql
-- Should raise 42501 "target accounting period is hard-closed"
INSERT INTO public.stock_issues (tenant_id, branch_id, issue_number, issue_type, status,
  issued_at, created_by, approval_status, source_type)
VALUES (1, 2, 'HARDCLOSE-TEST', 'writeoff', 'draft',
  '2026-04-10'::timestamptz, 'a0000001-0000-4000-8000-000000000001',
  'not_required', 'manual');
```

## Step 10 — Reopen với typed confirm

1. Click "Reopen kỳ" on hard-closed card
2. AlertDialog: "Reopen 04/2026?"
3. Type "REOPEN" → confirm enabled
4. After reopen, card back to "Open" state
5. SQL verify both timestamps NULL

## Step 11 — Non-admin sees nothing

1. Login as user without `accounting:period_reopen` perm
2. Navigate `/admin/accounting/periods` → redirect to `/`
3. Admin-only route confirmed

## Sign-off criteria

- [ ] Dashboard v2 loads with all 4 KPI cards
- [ ] Location breakdown table renders với cost masking respected
- [ ] Alerts drawer opens + filters + paginates
- [ ] Refresh button updates timestamp from server
- [ ] Feature flag disable redirects legacy route
- [ ] Period admin shows 13 months
- [ ] Soft close persists + switches badge color
- [ ] Hard close blocks back-dated inserts (SQLSTATE 42501)
- [ ] Typed confirm "CLOSE"/"REOPEN" strict mode works
- [ ] Non-admin cannot access period admin page

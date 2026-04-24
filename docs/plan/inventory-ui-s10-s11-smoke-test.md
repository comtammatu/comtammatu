# S10 + S11 Pilot Smoke Test

> Manual end-to-end verification for Tranche 1 before pilot cutover at Kho Tổng (#1) + Đất Đỏ (#2).
> Tests DB policy chain via fresh UI surface. Run by owner or pilot QA.

## Prerequisites

- 20+ DB migrations applied (S0-S9 + S10/S11 foundations)
- Dev DB `iexwsuaqqenyjiskawoj` is clean (transactional tables truncated)
- Actor: Owner or QLV account at pilot branch

## Step 0 — Enable flags for pilot branches

```sql
UPDATE public.branch_feature_flags
   SET enabled = true,
       enabled_at = now()
 WHERE branch_id IN (1, 2)
   AND flag_key IN (
     'inv_s10_grn_variance',
     'inv_s11_waste_tier',
     'inv_s14_auto_approve'
   );
```

Verify:
```sql
SELECT branch_id, flag_key, enabled
FROM public.branch_feature_flags
WHERE branch_id IN (1,2) AND enabled = true
ORDER BY branch_id, flag_key;
```

## Step 1 — S10 GRN variance pill (optional sanity)

1. Navigate to an existing confirmed GRN detail page
2. Verify `<GrnVarianceWrapper>` card renders với 8-condition breakdown
3. Expected on fresh reset: c2 variance NULL (baseline n<3), c6 supplier history 0 → approved=false

## Step 2 — S10 cold-chain admin

1. Navigate `/admin/inventory/cold-chain`
2. Toggle "Thịt" category ON → expect toast "Đã bật manual review cho 'Thịt'"
3. Verify via SQL:
```sql
SELECT * FROM public.ingredient_category_review_policy WHERE category='Thịt';
```
4. Create a new GRN với ingredient category=Thịt → `grn_is_auto_approvable.conditions.c7_no_manual_review=false`

## Step 3 — S10 express window config

1. Navigate `/admin/inventory/express-windows`
2. Change CN #2 Đất Đỏ window to `05:00-11:00`, save → toast success
3. Verify:
```sql
SELECT branch_id, enabled, start_time, end_time
FROM public.branch_express_window WHERE branch_id=2;
```

## Step 4 — S10 override code rotation

1. Same admin page, scroll Đất Đỏ override code section
2. Enter `owner1` + confirm `owner1` → click "Rotate mã"
3. Toast success
4. Verify:
```sql
SELECT branch_id, rotated_at IS NOT NULL AS has_code
FROM public.branch_override_codes WHERE branch_id=2;
```

## Step 5 — S11 happy path waste tier 0

1. Navigate `/inventory/waste/new?branchId=2`
2. Select location "Kho bếp"
3. Line 1: ingredient "Gạo Tấm", qty 1 kg, cost 40k, reason "spoiled"
4. Expect: `WasteTierBadge` hidden (tier 0), `ShiftCapMeter` green <70%, no photo required
5. Submit → redirect to `/inventory/issues/[id]` showing confirmed writeoff

## Step 6 — S11 tier 1 photo required

1. Same flow, qty 5 kg × 40k = 200k
2. Expect: tier 1 yellow badge "Cần ảnh", photo upload section appears
3. Submit without photo → toast error "Dòng X cần ảnh (tier 1)"
4. Upload fake photo via PhotoUploadInput → submit success

## Step 7 — S11 tier 2 approval

1. Same flow, qty 15 kg × 40k = 600k
2. Expect: tier 2 orange badge, photo required, "requires_approval=true"
3. Submit → toast "Đã tạo phiếu WO-xxx • Chờ QLV duyệt"
4. Verify:
```sql
SELECT id, approval_status, status FROM public.stock_issues
WHERE issue_number LIKE 'WO-%' ORDER BY id DESC LIMIT 1;
-- approval_status=pending, status=draft
```

## Step 8 — S11 self-approval guard

1. Navigate `/inventory/waste/approvals` as same Owner user
2. See pending card với "Bạn tạo — không thể tự duyệt" amber badge
3. Approve/Reject buttons **disabled**
4. Attempt server-side: try RPC `approve_waste(ID, 'approved')` → 42501 "self-approval forbidden"

## Step 9 — S11 QLV cross-approve

1. Login as `QL Chi nhánh Đất Đỏ` (`a0000003-0000-4000-8000-000000000003`)
2. Navigate `/inventory/waste/approvals`
3. Approve the tier-2 waste với note "Đã xác nhận hư hỏng"
4. Verify:
```sql
SELECT approval_status, approved_by, status FROM public.stock_issues WHERE id=ID;
-- approved + confirmed
```

## Step 10 — S11 anti-split behavior

1. Back as Owner, `/inventory/waste/new?branchId=2`
2. Line 1: qty 3 kg × 40k = 120k, reason "spoiled" → tier 0
3. Submit
4. Within 14 minutes: new session, qty 1 kg × 40k = 40k same SKU
5. Expect `<AntiSplitRollingMeter>`: "Rolling 15min: 120k + 40k pending = 160k → trigger tier 1"
6. Submit → server promotes to tier 1 → photo required error

## Step 11 — Flag disable rollback

1. SQL:
```sql
UPDATE public.branch_feature_flags
   SET enabled = false, disabled_at = now()
 WHERE branch_id = 2 AND flag_key = 'inv_s11_waste_tier';
```
2. Navigate `/inventory/waste/new?branchId=2` → redirect to `/inventory/issues?error=waste_v2_not_enabled`
3. Confirms per-branch rollout controllable

## Sign-off criteria

- [ ] Cold-chain toggle persists + reflects in `inventory_requires_manual_review`
- [ ] Express window config persists, default 06:00-09:00 respected
- [ ] Override code rotates; old code invalid after rotate
- [ ] Waste tier 0 submit without friction
- [ ] Waste tier 1 blocks submit without photo
- [ ] Waste tier 2 creates pending; shows in approval queue
- [ ] Self-approval blocked both UI + RPC layers
- [ ] Cross-user approval works + adds note
- [ ] Anti-split rolling meter surfaces before user submits
- [ ] Feature flag disable gates UI completely

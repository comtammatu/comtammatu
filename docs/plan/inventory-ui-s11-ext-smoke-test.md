# S11-ext Pilot Smoke Test — POS void / KDS cancel auto-gen waste

> Manual end-to-end verification for S11-ext: auto-waste server action
> with non-fatal semantics, KDS cancel stage picker + ratio slider,
> cashier/chef toast helper, auto-waste viewer page.
> Run after S11 + S11-core + S13a shipped; POS/KDS host integration is
> still deferred to the POS rebuild sprint, so this smoke test exercises
> the SDK boundary only.

## Prerequisites

- S10, S11-core, S12, S13a, S13b flags enabled for pilot branches 1 & 2
- RPCs live: `create_waste_from_order`, `create_waste_entry`,
  `is_feature_enabled`
- Test user has `inventory:writeoff` permission on pilot branches
- At least one existing order row in `public.orders` for pilot branch

## Step 0 — Enable S11-ext flag for pilot branches

```sql
UPDATE public.branch_feature_flags
   SET enabled = true, enabled_at = now()
 WHERE branch_id IN (1, 2)
   AND flag_key = 'inv_s11_ext_auto_waste';

SELECT branch_id, flag_key, enabled
  FROM public.branch_feature_flags
 WHERE branch_id IN (1, 2)
   AND flag_key = 'inv_s11_ext_auto_waste';
```

Expect: 2 rows, both `enabled = true`.

## Step 1 — Flag gate blocks non-pilot branches

1. Navigate `/inventory/waste/auto?branchId=3` (branch without flag)
2. Expect redirect to `/inventory/waste?branchId=3&error=auto_waste_not_enabled`
3. Re-test as a user with branch_id = 2 → page renders

## Step 2 — Empty auto-waste viewer

Pre-setup: no POS void / KDS cancel produced waste for branch 2 yet.

1. Navigate `/inventory/waste/auto?branchId=2`
2. Header: "Waste auto-generated · CN #2 · 0 phiếu · 0 chờ duyệt"
3. Empty-state card: icon + "Chưa có phiếu waste auto" + microcopy
   "POS void hoặc KDS cancel sẽ sinh phiếu tại đây"

## Step 3 — Create auto-waste from order (pos_return)

Using Node REPL / server-action test harness OR a seeded POS handler,
call `createWasteFromOrder`:
```ts
await createWasteFromOrder({
  orderId: <real_order_id>,
  locationId: <real_location_id_for_branch_2>,
  sourceType: "pos_return",
  items: [
    { ingredient_id: <some_id>, quantity: 0.5, unit: "kg" },
  ],
  note: "Smoke test — POS trả khách",
});
```

Verify returned `ActionResult`:
- `success = true`
- `data.softFailed = false`
- `data.issueId` is a positive integer
- `data.lineCount = 1`

Verify in DB:
```sql
SELECT id, source_type, source_ref, issue_type, approval_status
  FROM public.stock_issues
 WHERE id = <data.issueId>;

SELECT ingredient_id, quantity, reason_code, waste_tier
  FROM public.stock_issue_items
 WHERE issue_id = <data.issueId>;
```
Expect:
- `source_type = 'pos_return'`
- `source_ref = {"order_id": <orderId>}`
- Item `reason_code = 'customer_return'` (RPC backfilled default)
- `waste_tier` set by the existing s3 trigger

## Step 4 — KDS cancel with mid_cook ratio

Call the action with stage `mid_cook` and scaled items:
```ts
const baseRecipe = [
  { ingredient_id: 11, quantity: 1.0, unit: "kg" },
  { ingredient_id: 12, quantity: 0.2, unit: "kg" },
];
const ratio = 40; // 40%
const scaled = baseRecipe.map((r) => ({
  ...r,
  quantity: Math.round(r.quantity * (ratio / 100) * 1000) / 1000,
}));

await createWasteFromOrder({
  orderId: <order_id>,
  locationId: <location_id>,
  sourceType: "kds_cancel_mid_cook",
  items: scaled,
  note: "KDS mid-cook 40%",
});
```

Verify DB `stock_issue_items.quantity` equals the scaled value (0.4 and 0.08).

## Step 5 — Non-fatal semantics

1. Call with invalid `orderId = 999999999` (not in `orders`)
2. RPC raises `P0002 order not found`
3. Expect action returns `{ success: true, data: { softFailed: true, softError: "Không tìm thấy order", issueId: null, sourceType, lineCount: 1 } }`
4. No `stock_issues` row created
5. Confirm this behavior across 3 other failure modes:
   - Missing permission (user without `inventory:writeoff`) → softFailed
     + softError "Không có quyền tạo waste"
   - Invalid `sourceType` ("kds_cancel_before_cook") → Zod blocks; returns
     `{ success: false }` (that's the one hard-fail — client-side guard,
     not server)
   - Network/RPC exception → caught by try/catch → softFailed + generic
     softError message

## Step 6 — Auto-waste viewer populated

1. After Steps 3 & 4, navigate `/inventory/waste/auto?branchId=2`
2. Header: total value sum of all auto-waste items; pending count if any
3. Two cards render (Step 3 POS + Step 4 KDS mid_cook):
   - POS card: red icon, "POS trả khách" badge, Order # badge
   - KDS mid_cook card: amber icon, "KDS hủy giữa chừng" badge
4. Each card lists ingredient rows with `name · reason_code · qty unit · VND`
5. Approval status chip reflects the s3 trigger's decision (tier 0 →
   "Không cần duyệt"; tier 1/2 → "Chờ QLV duyệt")
6. If pending: inline "Mở queue duyệt" button → `/inventory/waste/approvals`

## Step 7 — Approvals page → auto-waste nav

1. Navigate `/inventory/waste/approvals?branchId=2`
2. Header right: "Auto-waste" outline button + phieu count badge
3. Click "Auto-waste" → routes to `/inventory/waste/auto?branchId=2`

## Step 8 — KdsCancelStagePicker UX

Mount `<KdsCancelStagePicker>` in a Storybook/preview page and verify:
1. 3 radio cards render: "Trước khi nấu" / "Đang nấu" / "Sau khi nấu xong"
2. "Trước khi nấu" → "Không sinh waste" slate badge, `IconFlameOff`;
   onChange emits `{stage:"before_cook", wasteSourceType:null, ratio:undefined}`
3. "Đang nấu" → "Sinh waste" red badge, `IconFlame`; ratio slider appears
   below card with amber background
4. Slider step is 5 (drag shows 0, 5, 10, …, 100); min=0 max=100 default=50
5. Slider label "N%" updates in tabular-nums as drag proceeds
6. "Sau khi nấu xong" → `IconChefHat`; onChange emits `wasteSourceType:"kds_cancel_after_cook"`
   with ratio undefined (100%)

## Step 9 — applyCancelRatioToItems helper

Unit-test the helper:
```ts
const items = [
  { ingredient_id: 1, quantity: 10, unit: "kg" },
  { ingredient_id: 2, quantity: 0, unit: "kg" },  // 0-qty filtered out
];
applyCancelRatioToItems(items, {
  stage: "mid_cook",
  ratio: 30,
  wasteSourceType: "kds_cancel_mid_cook",
});
// Expect [{ingredient_id:1, quantity:3, unit:"kg"}]

applyCancelRatioToItems(items, {
  stage: "before_cook",
  wasteSourceType: null,
});
// Expect [] (empty — host short-circuits RPC call)

applyCancelRatioToItems(items, {
  stage: "after_cook",
  wasteSourceType: "kds_cancel_after_cook",
});
// Expect [{ingredient_id:1, quantity:10, unit:"kg"}] (full, 0-qty filtered)
```

## Step 10 — showAutoWasteToast helper

In a test harness, pass each branch to the toast helper and verify:
- `null` → `toast.warning("Không có dữ liệu waste auto — admin sẽ xử lý")`
- `{softFailed: true, softError: "X"}` → warning with appended "(X)"
- `{softFailed: false, issueId: null, lineCount: 1}` → warning "chưa có ID"
- `{softFailed: false, issueId: 42, lineCount: 3}` → success
  "Đã tạo phiếu waste #42 (3 dòng)"

## Acceptance

All 10 steps must pass before enabling `inv_s11_ext_auto_waste` for
additional branches. If a step fails, file an issue referencing the step
number and do NOT widen the rollout.

## Known deferred

- POS `completePayment` wiring (auto-call after `void_after_served`) — POS rebuild sprint
- KDS cancel button wiring (mount KdsCancelStagePicker + fire `createWasteFromOrder`) — POS rebuild sprint
- Photo EXIF validation on auto-waste entries — deferred; current trigger
  allows `photo_urls=[]` for auto-sourced writeoffs
- Recipe expansion helper (SQL function that translates `order_id + ratio` →
  expanded ingredient rows) — deferred; POS/KDS currently expand client-side
- Playwright E2E spec mimicking the POS return flow — QA adversarial sprint

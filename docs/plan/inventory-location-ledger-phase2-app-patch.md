# Inventory Location Ledger Phase 2 App Patch

> Date: `2026-04-14`  
> Status: `Patch prep only - not implemented`  
> Depends on:
> - owner applied `20260417040000_inventory_locations_phase1.sql`
> - `pnpm db:types` regenerated after apply
> - `docs/plan/inventory-location-ledger-phase2.md`

## 1. Why This File Exists

Doc `inventory-location-ledger-phase2.md` đã chốt contract ở mức schema + rollout.

File này đi thêm một bước:

- chỉ rõ file nào trong app phải sửa
- function nào sẽ dual-write
- function nào chỉ là wrapper, không cần tự implement lại

## 2. App Touch Map

### 2.1 `apps/web/app/admin/inventory/actions.ts`

Các function cần đổi trực tiếp:

- `fetchStockLevels` at line 133
- `adjustStock` at line 180
- `createStocktakeSession` at line 285
- `fetchStocktakeSessions` at line 333
- `fetchStocktakeDetail` at line 407
- `updateStocktakeLine` at line 454
- `completeStocktake` at line 526
- `cancelStocktake` at line 565
- `fetchExpiryAlerts` at line 619
- `fetchReorderAlerts` at line 717

Patch intent:

- `fetchStockLevels`:
  - Phase 2 vẫn đọc branch-level là chính
  - chuẩn bị optional join location nếu report cần
- `adjustStock`:
  - thêm resolve default issue location cho `branchId`
  - khi insert `stock_movements`, ghi cả `branch_id` và `location_id`
- `createStocktakeSession`:
  - RPC mới/future RPC phải nhận hoặc tự resolve `location_id`
  - default là `default_receive`
- `fetchStocktakeSessions` / `fetchStocktakeDetail`:
  - select thêm `location_id`
  - hiển thị fallback branch-level nếu chưa cutover UI
- `updateStocktakeLine`:
  - không đổi nhiều logic, nhưng validation path phải giữ consistency với `session.location_id`
- `completeStocktake`:
  - RPC phải xử lý dual-path: location-first, branch fallback
- `fetchExpiryAlerts` / `fetchReorderAlerts`:
  - read-path tạm vẫn branch-level
  - chỉ annotate future location-aware grouping, chưa ép đổi UI ở Phase 2

### 2.2 `apps/web/app/admin/inventory/issue-actions.ts`

Các function cần đổi trực tiếp:

- `fetchStockIssues` at line 37
- `createStockIssueDraft` at line 74
- `fetchStockIssueDetail` at line 122
- `upsertStockIssueLine` at line 164
- `confirmStockIssue` at line 244
- `cancelStockIssue` at line 275

Patch intent:

- `createStockIssueDraft`:
  - insert thêm `source_location_id`
  - nếu `issue_type = kitchen_use`, insert thêm `target_location_id = default_consumption`
- `fetchStockIssues` / `fetchStockIssueDetail`:
  - select thêm `source_location_id`, `target_location_id`
  - join names nếu UI cần
- `confirmStockIssue`:
  - vẫn gọi RPC `confirm_stock_issue`
  - RPC sau Phase 2 phải dual-write movement/location

### 2.3 `apps/web/app/inventory/issue-actions.ts`

File này hiện là bản duplicate logic của admin issue actions.

Các function tương ứng:

- `fetchStockIssues` at line 37
- `createStockIssueDraft` at line 74
- `fetchStockIssueDetail` at line 122
- `upsertStockIssueLine` at line 164
- `confirmStockIssue` at line 244
- `cancelStockIssue` at line 275

Patch intent:

- giữ parity 1:1 với admin surface
- nếu có thể, nên cân nhắc refactor để surface `/inventory/*` reuse admin implementation thay vì copy

### 2.4 `apps/web/app/admin/inventory/transfer-actions.ts`

Các function cần đổi trực tiếp:

- `fetchStockTransferDetail` at line 26
- `fetchStockTransfers` at line 51
- `createStockTransfer` at line 124
- `upsertTransferLine` at line 271
- `transferConfirmShip` at line 301
- `transferMarkInTransit` at line 322
- `transferConfirmReceive` at line 340
- `transferReceive` at line 361
- `fetchBranchesForTransfer` at line 381

Patch intent:

- `createStockTransfer`:
  - resolve `from_location_id` and `to_location_id`
  - pass them into RPC once types/migration Phase 2 exist
- `fetchStockTransferDetail` / `fetchStockTransfers`:
  - select thêm location ids / names
- `transferConfirmShip`, `transferConfirmReceive`, `transferReceive`:
  - RPC layer phải update movement theo cả branch + location
- `fetchBranchesForTransfer`:
  - ở cuối Phase 2 có thể vẫn trả branch list
  - location picker chỉ nên mở ở Phase 3 nếu muốn giảm scope

### 2.5 `apps/web/app/inventory/transfer-actions.ts`

File này là wrapper sang admin implementation:

- `fetchStockTransferDetail` at line 22
- `fetchStockTransfers` at line 28
- `createStockTransfer` at line 34
- `upsertTransferLine` at line 40
- `transferConfirmShip` at line 46
- `transferMarkInTransit` at line 52
- `transferConfirmReceive` at line 58
- `transferReceive` at line 64
- `fetchBranchesForTransfer` at line 70

Patch intent:

- không đổi logic riêng
- chỉ verify wrapper signatures vẫn đúng sau khi admin file đổi

### 2.6 `apps/web/app/br/[branchId]/pos/payment-actions.ts`

Các function liên quan:

- `fetchPaymentMethodsForPos` at line 93
- `createPayment` at line 125
- `confirmPayment` at line 285

Patch intent:

- `createPayment` và `confirmPayment` đều gọi `consume_stock_for_order`
- sau Phase 2, RPC này phải resolve `default_consumption location`
- app code không cần đổi nhiều nếu RPC giữ tên cũ
- chỉ cần verify error handling vẫn đúng khi movement bắt đầu ghi `location_id`

## 3. Suggested Shared Helpers

Sau khi Phase 1 apply + types regenerate, nên thêm helper server-side chung:

- `resolveDefaultInventoryLocation(supabase, tenantId, branchId, mode)`
- `resolveIssueLocations(branchId, issueType)`
- `resolveTransferLocations(fromBranchId, toBranchId)`

`mode` tối thiểu:

- `receive`
- `issue`
- `consumption`

Lợi ích:

- tránh lặp query `inventory_locations` ở nhiều server actions
- giúp admin surface và inventory surface dùng cùng rule

## 4. RPC Compatibility Strategy

Để giảm thay đổi ở app layer, ưu tiên:

1. giữ tên RPC cũ
2. mở rộng implementation SQL bên dưới để đọc `location_id`
3. chỉ đổi payload app ở những nơi thật sự cần insert thêm columns

Ưu tiên patch app:

- insert/update trực tiếp vào table
- select cần hiển thị location fields

Không cần patch lớn ngay:

- những chỗ chỉ gọi RPC cũ và không cần payload mới

## 5. Recommended Coding Order

1. thêm helper resolve location
2. vá `admin/inventory/issue-actions.ts`
3. đồng bộ `inventory/issue-actions.ts`
4. vá `admin/inventory/transfer-actions.ts`
5. verify wrappers `inventory/transfer-actions.ts`
6. vá `admin/inventory/actions.ts` cho stocktake + adjust stock
7. verify POS payment flows với `consume_stock_for_order`

## 6. Acceptance Checklist

Patch app dual-write chỉ được coi là sẵn sàng khi:

1. mọi insert movement trực tiếp có thể ghi `location_id`
2. issue draft cho `kitchen_use` có thể gắn source/target locations
3. transfer draft có thể resolve from/to locations
4. stocktake session có thể tạo với default receive location
5. không có regression ở surface `/admin/inventory/*`
6. surface `/inventory/*` vẫn chạy do wrapper hoặc parity patch
7. sau regenerate types, `pnpm typecheck && pnpm lint && pnpm build` pass

# Operator Workspace — Sub-project #4 Stock Floor Plan

Reconciled-through 7f1e011d

Mục tiêu: đưa các việc Kho sàn vào URL Operator `/br/[branchId]/stock/*` mà
không clone UI Kho desktop và không mở thêm nguồn ACL/nav mới. Lát đầu chỉ là
compat shim có test: URL mới giữ `branchId` bằng segment rồi redirect sang route
Inventory hiện hữu có `?branchId=`.

## Review Tier

T2 — thay đổi route behavior, không đụng RLS/money/migration.

- PM: khóa URL Operator cho 4 việc sàn trước; không hứa đã có mobile stock UI.
- BA: `count` là kiểm kê thật (`stocktake`), `receive/transfer` dùng transfer
  list vì `/inventory/receiving` là procurement hub, `waste` mở form hao hụt.
- Senior Dev: route family `operator-stock` đã bao `/br/[id]/stock/*`; không sửa
  ACL/route-map nếu test coverage đã xanh.
- QA: test static phải fail khi thiếu shim và full route coverage phải thấy page
  mới resolve được module.

## Lát Đã Build

| Operator URL | Target hiện hữu |
|---|---|
| `/br/[id]/stock/count` | `/inventory/stocktake?branchId=[id]` |
| `/br/[id]/stock/receive` | `/inventory/transfers?branchId=[id]` |
| `/br/[id]/stock/transfer` | `/inventory/transfers?branchId=[id]` |
| `/br/[id]/stock/waste` | `/inventory/waste/new?branchId=[id]` |

## Chưa Build

- Chưa move Stock UI vào Operator shell.
- Chưa tách receive vs transfer thành mobile flow riêng.
- Chưa đổi `inventory` ACL hay RLS; proxy/route-map hiện hữu vẫn là cổng gác.
- Chưa đụng procurement `/inventory/receiving`.

## Verification

- `apps/web/tests/operator-stock-redirect-static.test.ts`
- `apps/web/tests/protected-route-module-coverage.test.ts`
- `packages/shared/src/auth/__tests__/operator-routes-static.test.ts`
- Full gate: `pnpm typecheck && pnpm lint && pnpm test`

# Inventory remediation — tech-debt + realtime (2026-07-05)

> Reconciled-through `0acdf5dc1`
>
> Nguồn: audit 5-lane 2026-07-05 (dead-routes · scope · hub-debt · realtime ·
> rpc-schema), verify code + PROD. Owner directive 2026-07-05: kiểm dead
> route/scope/legacy, **đừng mỗi lần sửa lại thêm tech debt**, tối ưu RPC/
> schema/realtime để mọi người nhận thông báo công việc trực tiếp — **realtime
> cho TOÀN Inventory** (không chỉ CN yêu cầu hàng).

## Kết luận đã verify (bỏ báo động sai)

- `listMyGrnDrafts` cross-branch leak — **ĐÃ FIX** (#256, branch-scope theo
  routeBranchId).
- `stock/on-hand/[ingredientId]` **KHÔNG** orphan — `stock-client` link thẳng
  vào (audit sai); chỉ `on-hand/page.tsx` là redirect shim vô hại → giữ.
- `ProductionPageContent` **KHÔNG** dead — office `/inventory/production` render
  qua nó.
- `fetchBranchQueueCounts` 8× `has_permission` **đã Promise.all song song**
  (audit gọi nhầm N+1); batch 1-SQL chỉ khi có RPC mới.

## Đã làm (#257, merged)

- Dedup `parseBranchId` → `parseOperatorBranchId` (4 file operator).
- Production perm serial loop → `currentUserHasAnyPermissionAny` (parallel,
  regressions.md MULTI-KEY-PERMISSION-PARALLEL).
- Fix redirect 2-hop `printers/jobs` → `/admin/settings/printers`.

## Realtime — transport A2 (owner chốt 2026-07-05)

Chọn **A2 Broadcast-from-Database** thay A1 (mở publication postgres_changes)
vì A1 nhồi bảng vào WAL publication từng nghẽn CI runner 2-core + gãy e2e
`networkidle` (bài học đã ghi), A2 payload mỏng + auth theo topic + không đụng
publication.

**PR migration (T3 file→PR→owner apply):** `20260706120000_inventory_realtime_ops_bus.sql`
- `broadcast_branch_ops()` AFTER INSERT/UPDATE/DELETE trên 8 bảng chứng từ
  (grn, po, transfer, issues, production, count-slips, stocktake, returns —
  **KHÔNG** stock_movements: ghi mỗi dòng bán → bão message, tồn xem qua MV) →
  `realtime.send` `{domain,table,op,id,at}` tới `branch:{id}:ops` (transfer bắn
  cả from+to branch). `to_jsonb` table-agnostic; trigger thấy full OLD/NEW nên
  **không cần REPLICA IDENTITY FULL**.
- `can_read_branch_ops(branch_id)` — RLS predicate mirror owner-bypass +
  staff_permissions của `has_permission_any` + guard tenant.
- RLS `realtime.messages FOR SELECT` theo `realtime.topic()`.
- 4 covering index (grn/production/transfers/po composite `(tenant, branch|
  to_branch, status)`).

**PR client (T2, sau, auto):** hook wrapper `useBranchOpsRefresh(branchId)` đắp
lên `useRealtimeChannel` (reconnect/visibility/poll default) + `<BranchOpsRefresh/>`
coalesced `router.refresh` (qua `makeRealtimeCoalescer`, mirror
`runner-realtime-refresh.tsx`) mount MỌI surface operator inventory (hub home,
stock, grn list+detail, receive, transfer, stocktake, production, count-slips,
waste). + notification CN-yêu-cầu: `dispatchNotificationOutbox` trong
`createStockTransfer` + kind `inventory.transfer_requested` "Yêu cầu chuyển kho
mới" → operator site đích. **KHÔNG** thêm TanStack/SWR (RSC là nguồn thật).

## Còn (chưa làm)

- Revoke grant thừa anon/authenticated trên trigger-fn
  (`enforce_stock_transfer_direction`/`enforce_po_grn_branch_is_procurement`/
  `ensure_production_order_central_kitchen`) — security hygiene, migration riêng.
- Batch `fetchBranchQueueCounts` 8 perm → 1 SQL (cần RPC `has_permission_batch`).
- Dedup extract theo extract-on-second-use: `DocumentDraftCard`, `OperatorQueueRow`,
  QC-line — làm dần trong slice rebuild UI, không big-bang.

## Rule no-new-debt (owner 2026-07-05)

Mỗi slice PHẢI: (a) tái dùng/extract thay vì clone (xuất hiện lần 2 = tách);
(b) test theo contract, không pin implementation-string dễ vỡ; (c) không thêm
wrapper embed Office mới trên route operator (native fork). Promote vào
`workflow.md` khi chốt.

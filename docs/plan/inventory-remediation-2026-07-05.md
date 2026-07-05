# Inventory remediation — tech-debt + realtime (2026-07-05)

> Reconciled-through `a5310c8ef`
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

**PR migration — MERGED #258** (a5310c8ef). 3-lens adversarial review: RLS
receive-side NO-LEAK (fail-closed on every crafted-topic path, tenant guard
composes), correctness 0 bug, 1 HIGH fixed (broadcast wrapped in
`BEGIN/EXCEPTION WHEN OTHERS` → best-effort, không rollback được document
write). PROD-apply chờ owner (guard-prod-db). baseline-replay xanh = full chain
apply sạch trên DB trống.

**PR client (T2) — this branch.** Extract chung (finance broadcast = use#1,
branch-ops = use#2 → tách, no-new-debt): `useRealtimeRefresh({setupChannel,
deps,enabled})` (`app/_hooks/use-realtime-refresh.ts`) sở hữu scheduler
(trailing debounce 2.5s + min-interval 15s + visibility-aware 60s poll
fallback) + `useRealtimeChannel`; `computeRefreshWaitMs` chuyển vào đây,
finance hook thành wrapper mỏng (re-export cho test cũ). `<BranchOpsRefresh
branchId>` (`(operator)/branch-ops-refresh.tsx`) subscribe private broadcast
`branch:{id}:ops` event `ops` → coalesced `router.refresh`. Mount **1 chỗ** ở
`(operator)/layout.tsx` → phủ MỌI surface operator (DRY, future-proof), không
clone 20 mount. Static test contract client↔SQL topic/event/private
(`tests/branch-ops-realtime-static.test.ts`). **KHÔNG** thêm TanStack/SWR (RSC
là nguồn thật). Merge độc lập được: trước khi owner apply #258, subscribe chỉ
nhận rỗng (graceful).

**PR notification — DEFERRED (owner 2026-07-05).** Owner chốt: realtime
live-refresh (#258+#259) đã phủ "Kho/Bếp biết khi đang mở màn kho" → quay lại
main task (transfer-receive), bell là fast-follow. Thiết kế khi làm: SQL trigger
`stock_transfers` INSERT → `notifications` kind `inventory.transfer_requested`
target `from_branch_id` (site trung tâm fulfiller, roles warehouse_manager/
production_manager/owner), CHỈ khi CN yêu cầu — không self-notify khi central
tự đẩy (gate theo `created_by` ∉ from_branch, hoặc branch_manager-created).
sibling `trg_notify_transfer_in_transit`. + registry `messages/notifications.ts`
kindLabel + `notification-item.tsx` iconFor + static test. LƯU Ý:
`dispatchNotificationOutbox` là webhook relay (`notification_outbox`), KHÔNG
phải bell feed (`notifications`) — bell do SQL trigger đổ.

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

# Chương trình Realtime & Data-Sync — hết cảnh reload mới thấy dữ liệu (2026-07-03)

> Reconciled-through d69a0a48
>
> Nguồn: research 6 lane (realtime-inventory · stale-surfaces · db-prod-state ·
> cron-freshness · query-stability · options-matrix), verify code + PROD
> (SELECT-only) + docs Supabase hiện hành. Mọi định danh code giữ nguyên văn.

## 1. Kết luận gốc — KHÔNG phải websocket hỏng

Stack realtime hiện có **trưởng thành**: cả 11 site subscribe trong browser đều
đi qua một hook chuẩn `apps/web/app/_hooks/use-realtime-channel.ts` (auth
pinning, resubscribe khi token refresh, chống double-subscribe strict-mode);
POS/KDS còn đủ bộ "re-SUBSCRIBED refetch + stale poll + visibility refetch".
Prod khỏe: replication slots active (lag ~90 kB), REPLICA IDENTITY FULL đủ,
pg_cron 0 fail trong 7 ngày, publication khớp đúng bộ 9 bảng canonical.

**Cái "phải reload" nằm ở chỗ KHÁC: các surface chưa từng có cơ chế sync nào.**
`revalidatePath` (127 call site — đều đúng chuẩn) chỉ làm mới cho *chính thiết
bị vừa thao tác*; thiết bị khác không bao giờ tự nhận thay đổi. Cụ thể verdict
STALE-UNTIL-RELOAD:

- **Toàn bộ module inventory** — 0 realtime, 0 poll, 0 visibility-refetch
  (GRN, PO, transfer, stocktake, count slips, production); cộng thêm sàn trễ
  15 phút của `mv_inventory_stock_current`.
- **Orders list ở office** — bảng `orders` ĐÃ trong publication (POS đang
  dùng) nhưng trang list không subscribe → đơn mới/refund từ nơi khác vô hình.
- **Cả 4 hàng đợi duyệt** (kết ca, nghỉ phép, hao hụt, kiểm kê) + **Hub queue
  counts** + attendance.

## 2. Lỗi thật đang sống (fix trong chương trình)

| ID | Mức | Vấn đề |
|----|-----|--------|
| F1 | P1 | Inventory module zero cross-device sync (bằng chứng: 0 hit `useRealtimeChannel` dưới `(protected)/inventory/`) |
| F2 | P1 | Orders list static dù bảng đã published |
| RT-01 | P1 | Finance subscribe `webhook_events` nhưng bảng KHÔNG có trong publication → listener chết im lặng |
| F5 | P1→P2 | `notification-popups` (mount app-wide qua `pwa-runtime.tsx`) không filter tenant/branch + bare `.subscribe()` không status callback |
| F4 | P2 | `admin-order-audit-{id}` bare `.subscribe()` — mất reconnect-refetch |
| F7 | P2 | KDS thiếu id-dedupe trên INSERT path (POS có) |
| CRON-01/02 | P2 | Không có run-log/alert cron; RPC refresh tay của finance đã chết; 2 MV không còn ai đọc vẫn refresh |

## 3. Kiến trúc đích (hybrid — không đụng thứ đang chạy tốt)

1. **Giữ nguyên** 9-bảng `postgres_changes` cho POS/KDS/finance/notifications.
2. **"Branch ops bus" mới** bằng **Broadcast-from-Database** (phương pháp
   Supabase khuyến nghị hiện hành): 1 trigger AFTER generic gọi
   `realtime.broadcast_changes` bắn payload tín-hiệu-mỏng
   `{domain, table, op, id, at}` (không body row) vào topic private
   `branch:{id}:ops`; authorize bằng 1 RLS policy trên `realtime.messages`
   theo branch membership sẵn có; gắn vào ~10 bảng office/inventory stale.
   Có Broadcast Replay (72h) làm catch-up event bị lỡ.
3. **Client: 1 hook wrapper** (vd `useBranchOpsRefresh(domains, onInvalidate?)`)
   đắp lên `use-realtime-channel.ts`, mặc định sẵn: reconnect-backoff khi
   CHANNEL_ERROR/TIMED_OUT, refetch khi re-SUBSCRIBED, refetch-on-visibility,
   backstop poll chậm — không caller nào phải tự nhớ nữa.
4. **Cross-device propagation = coalesced `router.refresh()`** (mô hình
   finance đã chứng minh prod): mount MỘT component `<BranchOpsRefresh/>` mỗi
   trang stale — không rewrite trang, RSC giữ nguyên. Coalesce qua
   `makeRealtimeCoalescer` sẵn có (50 dòng kiểm kê = 1 refresh, không phải 50).
5. **MV/cron:** đóng dấu `data_as_of` lên widget đọc MV; alert "cron chết"
   qua notifications producer (theo `docs/agent/rules/notifications.md`); trang
   tồn kho xét live-compute nếu EXPLAIN rẻ; bỏ 2 MV refresh không người đọc.
6. **Fetch nặng:** delta refetch bằng cursor `updated_at` (vd `fetchIngredients`
   ~2000 rows đang bị refetch nguyên khối).
7. **REJECT:** thêm TanStack Query/SWR (không có client cache để quản — RSC
   là source of truth; thêm dep = mở nguồn drift thứ hai).

## 4. Lộ trình 6 PR (mỗi PR một mối quan tâm; POS/KDS không bị đụng tới PR cuối)

| PR | Việc | Tier | Ghi chú |
|----|------|------|---------|
| PR1 | Client hardening không schema: hook wrapper + fix 2 bare-subscribe (F4, F5 kèm filter) + KDS dedupe (F7) | T2 | Làm ngay được |
| PR2 | Migration owner: bus trigger + policy `realtime.messages` + fix RT-01 `webhook_events` | **T3** | file → PR → owner apply |
| PR3 | Mount hook: 4 hàng đợi duyệt + orders list + Hub counts | T2 | Giá trị owner thấy rõ nhất |
| PR4 | Inventory surfaces + delta/bounded fetch | T2 | F1, F2/F3 query |
| PR5 | Freshness stamps + cron run-log/alert | T2/T3 | CRON-01/02/03 |
| PR6 | POS menu-structure sync qua bus | T2 | Cuối cùng, một mình — frontline |

Harness đo tải có sẵn (`apps/web/scripts/realtime-load-harness.ts`) gate PR2/PR3.

## 5. Điểm chờ owner chốt

1. **Transport bus:** A2 Broadcast-from-Database (khuyến nghị — auth theo
   topic, payload mỏng, replay 72h, đúng hướng Supabase) vs A1 chỉ mở rộng
   publication postgres_changes (S-effort, nhanh hơn nhưng tạo đợt migration
   thứ hai sau này). **Default: A2.**
2. **Trang tồn kho:** live-compute (bỏ sàn 15 phút) vs MV + đóng dấu
   `data_as_of`. **Default: live-compute nếu EXPLAIN rẻ, không thì MV+stamp.**
3. **Xác nhận tier Supabase plan** cho quota headroom (Free: 200 conn/100
   msg/s — chỉ msg/s là số sát; Pro: 500/500). **Default: kiểm tra plan hiện
   tại trước PR2.**

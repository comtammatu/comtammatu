# Vận hành chi nhánh

Tham chiếu nghiệp vụ dài hạn cho ca làm (HR) và ca bán (POS) tại Branch Operator
Surface. Quyết định kiến trúc nằm ở ADR; tài liệu này giữ mô hình vận hành và
định biên đã chốt.

**Authority:** [ADR 0023](../plan/adr/0023-shift-leader-delegation.md),
[ADR 0024](../plan/adr/0024-branch-business-day-summary-no-manual-close.md),
D009, D012, D019, D052, D069, D076, D093, D103.

## Hai vòng độc lập

1. **Ca làm (HR):** phân ca, chấm công (được vào sớm 60 phút trước giờ ca), checklist `position_shift_tasks`, kết ca chờ quản lý duyệt rồi tự duyệt sau 2 giờ nếu quên, trưởng ca.
2. **Ca bán (POS):** một phiên POS mở / chi nhánh; giao ca Close → Open; tiền chỉ
   qua `opening_cash` / `closing_cash` đếm tay.
3. **Không** gộp hai vòng thành ceremony “Chốt ngày”. Không `carryover_cash`.
4. **Cửa sổ ngày nghiệp vụ 04:00** (`VN_BUSINESS_DAY_CUTOFF_HOUR`) chỉ chia cửa sổ
   báo cáo — **không** tự đóng sổ / ghi `is_closed`.

## Định biên 7 vị trí / ca

| Vị trí | `position_code` | Auth role |
| --- | --- | --- |
| Thu ngân | `cashier` | `cashier` |
| Quầy lên món | `kitchen_counter` | `chef` |
| Quầy nướng | `grill_counter` | `chef` |
| Phụ bếp | `kitchen_helper` | `chef` |
| Phục vụ ×2 | `waiter` | `branch_staff` |
| Tạp vụ | `cleaner` | `branch_staff` |

Không seed alias `server`. Thu ngân và phục vụ không gộp quyền tiền:
Phục vụ (near-cashier) được POS order/thu/in; không mở két, không chốt ca,
không void trực tiếp.

## Trưởng ca và void sau thanh toán

- Một trưởng ca / `(branch_id, shift_id, work_date)` trên `shift_assignments.is_shift_leader`.
- Cashier gửi yêu cầu void-after-paid → hàng đợi `pos_void_requests` → trưởng ca /
  BM / Owner duyệt trên session.
- Owner giữ đường void trực tiếp. Không PIN, không Web Push đóng app.

## Báo cáo tổng hợp ngày

- Route `/br/[branchId]/close-day` là **Daily Summary** (đọc): kết quả ngày
  (DT thuần, giá vốn món, lãi gộp, biên, KQKD ngày), món bán chạy, ca POS
  (drill Đối soát ca), bấm ca HR, tiêu hao/hao hụt. Không checklist Chốt ngày.
- RPC `get_branch_day_report`; `close_branch_day` retired (`branch_day_close_retired`).
- Cửa sổ 04:00. Chi VH ngày = chi đã ghi `expense_date` hôm đó (0đ vẫn hiện);
  chi tháng không phân bổ xuống ngày.

## Việc trong ca và KDS

- SSOT việc theo vị trí: `position_shift_tasks` (`allows_photo` = bắt buộc ảnh minh chứng khi hoàn thành; không tick xong khi thiếu `photo_path`).
- Không dùng `shift_checklist_template_items` cho photo evidence ca.
- Seed ngắn đầu/cuối ca theo vị trí (3–5 việc); HR có thể chỉnh sau.
- KDS mặc định một station “Quầy lên món” khi chi nhánh chưa có station; typography
  theo token Geist (D069).

### Nhiệm vụ vận hành chính theo vị trí

| Vị trí | Đầu ca | Cuối ca |
| --- | --- | --- |
| Thu ngân | Đếm quỹ lẻ, mở ca POS; setup sảnh; lau sàn chống ruồi | Đếm tiền, chốt ca POS; dọn khu phụ trách (ảnh) |
| Quầy lên món | Bật KDS; setup quầy | Cất thừa; tắt KDS, dọn quầy; dọn khu phụ trách (ảnh) |
| Quầy nướng | Nhóm than, lấy sườn | Rửa vỉ, vệ sinh lò; dọn khu phụ trách (ảnh) |
| Phụ bếp | Bật điện; nấu cơm/canh; sơ chế topping | Vệ sinh nồi/tủ/bếp; dọn khu phụ trách (ảnh) |
| Phục vụ | Setup sảnh; lau sàn chống ruồi | Dọn sảnh, quầy nước; dọn khu phụ trách (ảnh). Không chốt ca/void |
| Tạp vụ | Vệ sinh WC; chuẩn bị khu rửa | Rửa hết chén dĩa; đổ rác, lau sàn; dọn khu phụ trách (ảnh) |
| Bảo vệ | Quét sân trước; trông xe | Kéo bạt, dọn khu phụ trách (ảnh) |
| Quản lý chi nhánh | Điểm danh; kiểm tra sẵn sàng bán | Đối chiếu doanh thu; duyệt kiểm kê / đặt hàng; dọn khu phụ trách (ảnh) |

## Màn hình liên quan

| Việc | Route |
| --- | --- |
| POS | `/br/[branchId]/pos` |
| KDS | `/br/[branchId]/kds` |
| Gọi số (public pickup) | `/br/[branchId]/pickup` |
| Chốt ca POS | `/br/[branchId]/pos-sessions` |
| Báo cáo ngày | `/br/[branchId]/close-day` |
| Phân ca | `/br/[branchId]/shift/roster` |

## Disposition — không tái mở khi dọn kỹ thuật

Các mục dưới đây **không phải backlog “làm tiếp ngay”**. Agent cite ADR/D-row
và dừng; không tạo ticket “để dành soft”.

### Closed — rejected

| Mục | Authority |
| --- | --- |
| `carryover_cash` / quỹ mặc định / prefilling thay đếm tay | ADR 0024 |
| Cron hoặc job ghi `branch_day_state.is_closed` lúc 04:00 | ADR 0024 |
| PIN / shared device code cho trưởng ca duyệt void | ADR 0023 |
| Gộp `cashier` + `waiter` (hoặc alias `server`) | ADR 0023, định biên trên |

### Gated — chỉ khi Owner mở trigger

| Mục | Trigger |
| --- | --- |
| Adapter nền tảng giao đồ ăn | D103: duyệt đối tác + contract kỹ thuật chính thức; readiness theo `docs/runbooks/food-delivery-platform-onboarding.md` — không đoán payload |
| SOP dài ngoài file này dưới `docs/ref/` | Owner yêu cầu tên file/mục cụ thể |

### Scheduled — follow-up ODC riêng

| Mục | Trigger |
| --- | --- |
| Align finance/order window `00:00` với branch-day `04:00` | Owner xác nhận đau khi đối chiếu Daily Summary ↔ finance; không nhét vào PR branch-ops — xem ODC `branch_day_state` |

## Lỗi phiếu kho (user-addressable)

Mutation phiếu kho (chuyển kho, hủy, kiểm kê, YCM/YCH, GRN, yêu cầu mua, xuất,
sản xuất) phải trả `ActionResult` với:

- `error`: câu tiếng Việt vận hành (không raw Postgres/Supabase).
- `errorCode` ổn định để UI nhánh xử lý.
- `meta.ingredientId` (và `field: "quantity"` khi liên quan số lượng) khi lỗi gắn
  một dòng nguyên liệu — ví dụ thiếu tồn.

UI: toast mức chứng từ; highlight dòng / ô số lượng khi có `meta.ingredientId`.
Mapper dùng chung: `mapInventoryRpcFailure` + vocabulary
`apps/web/lib/messages/inventory-rpc-errors.ts`. Helper client:
`applyInventoryActionError`.

# Khung ngữ nghĩa dữ liệu vận hành

Contract đặt tên, lấy dữ liệu, tính toán, và hiển thị metric/card trên Owner,
Inventory, Finance, Reports, và tổng quan. Mỗi số trên UI phải trả lời: là gì,
từ đâu, tính thế nào, ai xem, và có đủ tin cậy không.

## Cách đọc

- `docs/ref/glossary.md` — thuật ngữ / naming
- Module docs (`docs/modules/finance.md`, `docs/ref/inventory.md`) — business boundary
- File này — contract chung cho metric, card, report summary

Card/title/metric mới không map được → **chưa được phép** vào UI. Cập nhật
contract trước, rồi mới sửa code.

## Quy tắc bắt buộc cho card và metric

Mỗi card/tile/KPI/summary/chart label chứa dữ liệu vận hành phải có:

1. **Metric contract key** — số liệu tính toán, hoặc
2. **Workflow/entity contract** — trạng thái việc cần làm

Không dùng title chung (`Tài chính`, `Hiệu suất`, `Tồn kho`, …) nếu không nói
rõ nghĩa nghiệp vụ và nguồn.

### Mẫu contract (tối thiểu)

| Trường | Ý nghĩa |
| --- | --- |
| `contract_key` | Key EN ổn định, vd `finance.revenue.money_collected` |
| `ui_label_vi` | Nhãn VI ngắn |
| `owner_question` | Câu hỏi vận hành |
| `scope` | Tenant / branch / session / date range / snapshot |
| `formula` | Công thức + đơn vị + bucket thời gian |
| `source_of_truth` | Bảng/RPC/view/action |
| `exclusions` | Không được tính vào |
| `freshness` | Realtime / request / snapshot / đối soát thủ công |
| `confidence` | `trusted` \| `needs_review` \| `estimated` \| `blocked` |
| `permission` | Quyền/role tối thiểu |
| `drilldown` | Route/action giải thích hoặc xử lý |

Thiếu đủ trường → chỉ hiện việc cần xử lý / chưa đủ dữ liệu; không gọi KPI chính thức.

| `confidence` | Nghĩa | Hiển thị |
| --- | --- | --- |
| `trusted` | SoT + công thức khớp | KPI chính được |
| `needs_review` | Có dữ liệu, cần duyệt/đối soát | Queue/ngoại lệ, không kết quả cuối |
| `estimated` | Định mức/snapshot/nguồn thiếu | Phải ghi `ước tính` |
| `blocked` | Thiếu source/migration/quyền/config | Không card KPI; ghi blocker |

## Ranh giới thuật ngữ tài chính

| Khái niệm | Nghĩa chuẩn | Không lẫn với |
| --- | --- | --- |
| Tổng tiền đã thu | Thanh toán hoàn tất trong kỳ (có thể gồm VAT) | Doanh thu tính thuế, HĐĐT, tiền mặt đang giữ |
| Doanh thu thuần | `subtotal_revenue - discount_amount` đơn đã trả, chưa VAT | Tiền khách trả gồm VAT, doanh thu tính thuế |
| HĐĐT đã phát hành | HĐĐT bán ra đã provider/CQT xử lý | Doanh thu vận hành nếu chưa/không xuất HĐĐT |
| Giá trị tồn kho | Đầu/cuối kỳ từ stock ledger + giá vốn | Chi phí kỳ, tiền đã chi NCC |
| Giá vốn món / food cost | Nguyên liệu đã duyệt/apply từ tiêu hao bán | Recipe theoretical, chi vận hành, HĐ NCC, PO chưa nhận |
| Chi vận hành | Thuê, điện nước, gas, lương, sửa chữa, vật tư tiêu hao, khấu hao/phân bổ, marketing, phí/thuế, tiếp khách, khác | Giá vốn món, Chi phí ban đầu, nguyên giá TSCĐ, NL/vật tư kho, thanh toán NCC, nộp tiền mặt NH, điều chuyển, hàng nhập mua |
| Chi phí ban đầu | Vốn đã bỏ ra cho quán/chi nhánh: thi công, máy, xe, nội thất, đặt cọc. Toàn bộ, không theo kỳ, gồm GTGT | Chi vận hành tháng, giá vốn món, HĐ NCC, khấu hao kỳ |
| Chi phí hàng | Giá điều chuyển đã nhận vào kho chi nhánh trong kỳ (nhánh `Chi phí`) | Chi vận hành, YC chưa giao, phiếu đang chuyển, hóa đơn NCC công ty |
| Chi mua hàng | HĐ đầu vào đã xác nhận (chưa VAT), gồm chưa thanh toán | Điều chuyển nội bộ, nháp HĐ, chi vận hành, trừ thêm khi khớp ngân hàng |
| Lợi nhuận gộp | Doanh thu thuần − giá vốn món. Dòng độc lập | Kết quả KD, dòng tiền, LN ròng |
| Kết quả kinh doanh | Doanh thu thuần − chi phí hàng − chi vận hành + biến động tồn. Không lấy từ LN gộp | LN ròng hoặc kết quả kê khai thuế |

Nhãn: `finance.revenue.money_collected` → `Tổng tiền đã thu`. Kết quả kỳ bắt đầu từ `Doanh thu thuần`; kê khai → `Doanh thu tính thuế`; theo HĐ → `HĐĐT đã phát hành`.

## Contract Finance Basic

Hai dòng độc lập, không thác nước:

`Doanh thu thuần − Giá vốn món = Lợi nhuận gộp`.

`Doanh thu thuần − Chi phí hàng` (ĐC đã nhận / mua NCC) `− Chi vận hành + Biến động tồn = Kết quả kinh doanh`.

Cấm `Kết quả = LN gộp − chi vận hành + Δtồn`. Chi phí hàng không ghi `expenses`.
Giá vốn món không trừ trong kết quả. Δ tồn giữ vì hàng vào là mua/ĐC đã nhận —
tồn cuối vẫn là tài sản, không phải lãi.
Tiền mặt hiện có = tenant-wide; giá trị tồn cuối kỳ theo ngày/CN đang chọn;
cần xử lý cuối trang. Section UI chỉ title — không mô tả theo/không theo bộ lọc.

| `contract_key` | Nhãn UI | Source/rule tóm tắt | Confidence |
| --- | --- | --- | --- |
| `finance.revenue.money_collected` | Tổng tiền đã thu | `payments.amount` completed, `paid_at` ngày VN; có thể gồm VAT | `trusted` khi payment/order sync xanh; chỉ báo cáo chi tiết |
| `finance.revenue.before_vat_after_discount` | Doanh thu thuần | `subtotal_revenue - discount_amount` đơn payment hoàn tất | `trusted`; không phải doanh thu tính thuế |
| `finance.revenue.monthly_target` | Chỉ tiêu doanh thu tháng | `branch_revenue_targets.target_amount` `(branch_id, year_month)` | thiếu row → “Chưa đặt”, không coi 0 |
| `finance.revenue.monthly_target_reward` | Mốc thưởng KPI | `reward_tiers`; mốc cao nhất đạt được, không cộng dồn; `%` trên Doanh thu thuần | cấu hình quỹ thưởng CN, chưa tự payroll |
| `finance.revenue.monthly_target_progress` | Tiến độ chỉ tiêu | Doanh thu thuần tháng/ngày / target; BM chỉ branch gán | thiếu target không hiện 0% |
| `finance.inventory_value.current` | Tồn kho | `get_inventory_value_period` | fallback cost → `needs_review` |
| `finance.inventory_value.opening` | Tồn đầu kỳ | cuối − movement kỳ; `%` tone trung tính; đầu 0 → `Mới` | cùng closing |
| `finance.expense.operating` | Chi vận hành | `get_finance_expense_period_summary`: `expenses.subtotal` nhóm operating cả kỳ (không sum trang list). `amount` = gross | chưa có → `not_recorded` |
| `finance.inbound_transfer_value` | Chi phí hàng | `inventory_value_allocations` `event_type=transfer_in` bucket `inventory`, chi nhánh nhận trong kỳ | `location=branch`/`branches`; phiếu chưa nhận không tính |
| `finance.inventory_purchases` | Chi mua hàng | `supplier_invoices.subtotal` status `confirmed`/`adjusted` theo `invoice_date` ngày VN; gồm chưa thanh toán; không `draft`; không ĐC; không trừ thêm khi khớp ngân hàng | `location=all`/`company` |
| `finance.expense.startup_capital` | Chi phí ban đầu | `expenses.amount` (gross, gồm GTGT) `capital`+`deposit`, không theo kỳ; chi nhánh = `branch_id` khớp, không gồm `NULL` | chưa có → `not_recorded`; không trừ `Kết quả kinh doanh` |
| `finance.asset.equipment` | Thiết bị | `expenses.amount` `category=capital`, all-time, cùng scope Chi phí ban đầu | chưa có → `not_recorded`; lát `capital` của Chi phí ban đầu; drill `/finance/equipment`; không phải TSCĐ / giá trị còn lại |
| `finance.asset.total_value` | Tổng giá trị | Tổng tiền + tồn kho (nếu có quyền định giá) + thiết bị `capital` | chưa mở sổ quỹ → không bịa; không gồm đặt cọc; không phải tổng tài sản GL |
| `finance.food_cost.recorded` | Giá vốn món | `inventory_value_allocations` bucket `food_cost` khi cutover `active`; chưa cutover → trống | thiếu coverage / chưa cutover → `needs_review`; không trừ kết quả kỳ |
| `finance.food_cost.theoretical` | Giá vốn lý thuyết | `fetchFoodCost` / `buildFoodCostRows`: định mức hiện tại × SL bán × resolver catalog (cùng `/inventory/menu-recipes`) | `estimated` |
| `finance.gross_profit.readonly` | Lợi nhuận gộp | Doanh thu thuần − food cost recorded | thiếu coverage → không hiện số; dòng độc lập, không phải cha của kết quả kỳ |
| `finance.operating_result` | Kết quả kinh doanh | DT thuần − chi phí hàng − chi VH + (closing − opening); không gọi LN ròng; không lấy từ LN gộp | cần đã ghi chi VH; không chờ coverage giá vốn món |

### Gate hiển thị VAT và thiết bị

| Giá trị | Được gọi là | Chưa được gọi là |
| --- | --- | --- |
| `supplier_invoices.vat_breakdown` / `expenses.vat_breakdown` | GTGT đầu vào đã ghi nhận | GTGT được khấu trừ |
| HĐĐT bán ra hiệu lực | GTGT đầu ra theo HĐĐT | GTGT phải nộp |
| `stock_levels` / ledger | Tồn kho | Tổng tài sản kế toán |
| Tổng tiền + tồn + chi `capital` | `Tổng giá trị` | Tổng tài sản GL, TSCĐ, giá trị còn lại |
| Chi mua thiết bị / thi công trong `expenses` | `Thiết bị` (`capital`, all-time) | TSCĐ, giá trị còn lại, chi vận hành kỳ |

`Thiết bị` trên `/finance` là số tiền đã chi `capital`, không phải sổ TSCĐ.
`Tổng giá trị` là công thức hiển thị (tiền + tồn + thiết bị), không phải tổng
tài sản kế toán. Chưa thêm KPI `GTGT phải nộp`, `GTGT đầu vào được khấu trừ`,
`Giá trị thiết bị` (giá trị còn lại) cho đến khi đủ source/formula/exclusions/
confidence/drilldown.

### Bộ dữ liệu + nguồn `/finance` (tóm tắt)

| Nhóm | Nguồn chính | Ghi chú |
| --- | --- | --- |
| Bán/thanh toán | `get_revenue_kpis` / `get_revenue_rollup` | payments + orders; method cards cần rà nếu duplicate |
| Top món | `get_top_items` | tách cancelled/side theo contract |
| Food cost thật | `sale_consumption` movements | thiếu `order_id` coverage → không LN gộp |
| Giá trị tồn | `get_inventory_value_period` | không phải chi phí kỳ |
| Chi VH | `expenses` nhóm operating | không suy từ PO/GRN/NCC; không gồm `capital`/`deposit` |
| Thiết bị | `expenses` `capital` | all-time gross; lát của Chi phí ban đầu; drill `/finance/equipment`; không TSCĐ |
| Tổng giá trị | quỹ + tồn + thiết bị | hiển thị trên `/finance` Tài sản; không gồm đặt cọc; chưa mở sổ thì không bịa |
| Chi phí ban đầu | `expenses` `capital`+`deposit` | all-time gross, ignores period; ngoài công thức kết quả |
| Quỹ TM/NH | `get_finance_current_funds` | Owner nhập số dư đầu; “Chưa mở sổ”; không = đếm ca POS |
| Giao dịch / VietQR | `bank_transactions` + matches | `needs_review`; không sửa doanh thu/số dư tự động |
| HĐĐT queue | `get_finance_dashboard_summary` | workflow, không thay doanh thu VH |
| Công nợ NCC | `supplier_invoices` / payments | AP queue; không = chi VH nếu chưa qua contract |
| Lệch ca / desync | `get_cash_variance_*`, `find_payment_order_desync` | exception; không sửa KPI chính |
| Sửa method | `correct_payment_method`; `payments.method` SoT | VietQR có NH evidence không đổi cash đến khi gỡ |
| Đổi TM→VietQR tại POS | `pos_convert_cash_payment_to_vietqr` | Thu ngân `pos:confirm_payment`; gắn `payment_code`; in QR |

Chi tiết triển khai từng số cockpit: `apps/web` finance fetchers + RPCs trên.
Không thêm KPI tài chính mới nếu không trả lời daily operator hoặc accountant export bắt buộc.

## Contract tổng quan Inventory

Workflow-first: phiếu, việc cần xử lý, ngoại lệ, tồn thật. Analytics không che
công việc vận hành.

| `contract_key` | Nhãn UI | Source/rule |
| --- | --- | --- |
| `inventory.stock_value.current` | Giá trị tồn kho | `stock_levels` tại active warehouse duy nhất (D091) |
| `inventory.stock_quantity.current` | Tồn hiện tại | `current_quantity` Đơn vị chuẩn |
| `inventory.alert.low_stock` | Sắp hết hàng | so với reorder/min |
| `inventory.alert.negative_stock` | Âm kho | stock < 0 |
| `inventory.grn.pending` | Phiếu nhập chờ xác nhận | GRN chưa confirm/WAC |
| `inventory.stocktake.active` | Kiểm kê đang chạy | session chưa finalize |
| `inventory.consumption.review_queue` | Tiêu hao chờ duyệt | consumption report workflow |

Transfer Kho→Bếp cùng CN chỉ còn audit. Tồn VH + POS consumption tại warehouse
site. `stock_transfers` chỉ giữa warehouse hai site. `supplier_invoice`/AP =
Finance handoff — không gate đóng ngày kho nếu GRN/WAC/ledger đã đúng.

## Tổng quan Owner

Chỉ ba nhóm: (1) tình trạng cần chú ý, (2) công việc chờ xử lý, (3) lối vào
module. Số tiền/tính toán → `finance.*`; tồn/phiếu → `inventory.*`. Link điều
hướng không đặt title như KPI.

## branch_day_state / ngày kinh doanh chi nhánh

**Authority:** ADR 0024 — Daily Summary, không ceremony Chốt ngày. Cutoff 04:00
**chỉ** cửa sổ ngày KD; **không** tự ghi `is_closed`.

- Window: `[D 04:00 local, (D+1) 04:00)` theo `branches.timezone` (fallback
  `Asia/Ho_Chi_Minh`), khớp `inventory_shift_key`.
- Helpers: SQL `branch_business_day_bounds` / `branch_business_date`; TS
  `getVNBusinessDateString` / `getVNBusinessDayUtcRange` /
  `VN_BUSINESS_DAY_CUTOFF_HOUR = 4`.
- `/close-day` = Daily Summary qua `get_branch_day_summary`. `close_branch_day`
  raise `branch_day_close_retired`. Hàng đã đóng giữ audit.
- `open_session_count`: ca POS `opened_at` trong bounds + `status = 'open'`.
- Lệch tạm: nhiều finance filter vẫn `getVNDayUtcRange` (00:00–24:00). Không
  align trong PR branch-ops; ODC follow-up khi Owner xác nhận đau đối chiếu.
- Tiền mặt SSOT: chốt `pos_sessions`. Không `carryover_cash` (ADR 0024 rejected).

## Quy tắc cho Agent

- Trước sửa tổng quan/card/KPI: đọc file này + glossary + module doc.
- Danh từ nghiệp vụ mới → glossary trước.
- Số mới → khai báo/tái dùng `contract_key`.
- Ước tính / thiếu source → không gọi kết quả thật.
- Thiếu policy/config → ghi blocker; không tự chọn công thức cho UI đầy.
- Không thêm feature/route chỉ để hợp thức hóa card chưa có contract.

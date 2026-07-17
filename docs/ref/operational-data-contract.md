# Khung ngữ nghĩa dữ liệu vận hành

Tài liệu này là contract cho cách đặt tên, lấy dữ liệu, tính toán, và hiển thị
metric/card trên Admin, Inventory, Finance, Reports, và các bề mặt tổng quan.

Mục tiêu: không để Agent tự sinh `Card`, `Title`, `KPI`, hay "feature" mới chỉ
vì thấy thiếu chỗ hiển thị. Mỗi số liệu trên UI phải trả lời được: nó là gì,
lấy từ đâu, tính thế nào, ai được xem, và có đang đủ tin cậy để gọi là số thật
hay không.

## Cách đọc

- `docs/ref/glossary.md` chốt thuật ngữ và canonical naming.
- Module docs như `docs/modules/finance.md` và `docs/ref/inventory.md` chốt
  business boundary của từng module.
- File này chốt contract chung cho metric, card tổng quan, report summary, và
  cách nối dữ liệu giữa các module.

Nếu một card/title/metric mới không map được vào contract ở đây hoặc module doc
tương ứng, mặc định là **chưa được phép thêm vào UI**. Cập nhật contract trước,
sau đó mới sửa code.

## Quy tắc bắt buộc cho card và metric

Mỗi card, tile, KPI, summary row, chart label, hoặc title tổng quan có chứa dữ
liệu vận hành phải có một trong hai loại binding:

1. **Metric contract key**: dùng cho số liệu tính toán, ví dụ doanh thu, tồn
   kho, chi vận hành, lãi gộp, cảnh báo giá vốn.
2. **Workflow/entity contract**: dùng cho trạng thái việc cần làm, ví dụ phiếu
   nhập chờ xác nhận, ca POS đang mở, HĐĐT lỗi, kiểm kê đang chạy.

Không được dùng title chung chung như `Tài chính`, `Hiệu suất`, `Tồn kho`, `Lợi
nhuận`, `Doanh thu hôm nay`, `Cần xử lý` nếu không nói rõ nghĩa nghiệp vụ và
nguồn dữ liệu.

## Mẫu contract

Khi thêm metric hoặc card mới, định nghĩa tối thiểu:

| Trường            | Ý nghĩa                                                           |
| ----------------- | ----------------------------------------------------------------- |
| `contract_key`    | Key tiếng Anh ổn định, ví dụ `finance.revenue.money_collected`.   |
| `ui_label_vi`     | Nhãn tiếng Việt ngắn gọn hiển thị cho người dùng.                 |
| `owner_question`  | Câu hỏi vận hành mà số liệu trả lời.                              |
| `scope`           | Tenant, branch, POS session, date range, hay snapshot hiện tại.   |
| `formula`         | Công thức hoặc rule tính, gồm đơn vị và thời gian bucket.         |
| `source_of_truth` | Bảng/RPC/view/action sở hữu dữ liệu thật.                         |
| `exclusions`      | Những thứ không được tính vào số này.                             |
| `freshness`       | Realtime, theo request, snapshot ngày, hay cần đối soát thủ công. |
| `confidence`      | `trusted`, `needs_review`, `estimated`, `blocked`.                |
| `permission`      | Quyền hoặc role tối thiểu để xem.                                 |
| `drilldown`       | Route/action giải thích số hoặc xử lý ngoại lệ.                   |

Nếu chưa đủ các trường này, UI chỉ được hiển thị dạng việc cần xử lý hoặc trạng
thái chưa đủ dữ liệu; không được gọi là KPI chính thức.

## Trạng thái tin cậy của số liệu

| `confidence`   | Nghĩa                                                                  | Quy tắc hiển thị                                             |
| -------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------ |
| `trusted`      | Đã có source of truth và công thức khớp module contract.               | Có thể là KPI chính.                                         |
| `needs_review` | Có dữ liệu thật nhưng đang cần người duyệt hoặc đối soát.              | Hiển thị như ngoại lệ/queue, không gọi là kết quả cuối.      |
| `estimated`    | Công thức suy ra từ định mức, snapshot, hoặc nguồn chưa đầy đủ.        | Phải ghi rõ `ước tính` hoặc chuyển thành supporting context. |
| `blocked`      | Thiếu source, migration, quyền, hoặc policy/config chưa được khai báo. | Không tạo card KPI; chỉ ghi blocker cụ thể.                  |

## Ranh giới thuật ngữ tài chính

Các khái niệm dưới đây không được dùng thay thế nhau:

| Khái niệm               | Nghĩa chuẩn                                                                         | Không được lẫn với                                                          |
| ----------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Tiền đã thu             | Tổng tiền đã nhận qua thanh toán hoàn tất.                                          | HĐĐT đã phát hành, doanh thu trước VAT, công nợ.                            |
| Doanh thu ròng          | Giá trị bán hàng sau giảm giá/hoàn tiền, trước thuế GTGT; đây là mẫu số margin F&B. | Tiền mặt trong két, tổng thanh toán gồm VAT, HĐĐT đã phát hành.             |
| HĐĐT đã phát hành       | Hóa đơn điện tử bán ra đã được provider/CQT xử lý theo trạng thái.                  | Doanh thu vận hành nếu đơn chưa/không xuất HĐĐT.                            |
| Giá trị tồn kho         | Snapshot giá trị tồn hiện tại theo `stock_levels` và WAC/giá vốn fallback.          | Chi phí trong kỳ, tiền đã chi cho NCC.                                      |
| Giá vốn món / food cost | Chi phí nguyên liệu thực tế đã được quản lý duyệt/apply từ tiêu hao bán hàng.       | Recipe theoretical cost, chi vận hành, hóa đơn NCC, hoặc PO chưa nhận hàng. |
| Chi vận hành            | Chi phí HKD đã ghi nhận trong kỳ, không gồm direct ingredient COGS.                 | Giá vốn món, thanh toán NCC cho nguyên liệu nếu đang tính COGS riêng.       |
| Lãi gộp                 | Doanh thu trước VAT sau giảm giá trừ giá vốn món/food cost.                         | Lợi nhuận ròng, dòng tiền, lợi nhuận kế toán doanh nghiệp.                  |

Quy tắc mặc định: nếu một báo cáo vận hành dùng nhãn ngắn `doanh thu`, nghĩa
chuẩn là `doanh thu ròng trước VAT` / `doanh thu thuần` theo
`finance.revenue.before_vat_after_discount`. Nếu câu hỏi là tiền đã vào
payment, dùng `Tiền đã thu`; nếu câu hỏi là hóa đơn, dùng `HĐĐT đã phát hành`.

## Contract Finance Basic

Finance landing có bốn metric chính: tiền đã thu, doanh thu ròng, giá trị tồn kho
và chi vận hành. Giá vốn ghi nhận, giá vốn lý thuyết và lãi gộp là metric hỗ
trợ/derived trong contract; không tự nâng thành card landing mặc định nếu không
có quyết định mới.

| `contract_key`                              | Nhãn UI           | Câu hỏi owner                                                          | Source/rule                                                                                                                            | Confidence                                                                                            |
| ------------------------------------------- | ----------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `finance.revenue.money_collected`           | Tiền đã thu       | Kỳ này đã thu bao nhiêu tiền?                                          | Thanh toán hoàn tất, bucket theo ngày Việt Nam tại thời điểm paid.                                                                     | `trusted` khi payment/order sync xanh.                                                                |
| `finance.revenue.before_vat_after_discount` | Doanh thu ròng    | Giá trị bán hàng trước VAT sau giảm giá/hoàn tiền là bao nhiêu?        | Đơn đã thanh toán/đóng POS, loại VAT theo contract thuế.                                                                               | `trusted` khi tax/payment mapping khớp.                                                               |
| `finance.inventory_value.current`           | Giá trị tồn kho   | Hiện đang giữ bao nhiêu tiền trong kho?                                | `stock_levels.current_quantity * avg_unit_cost` hoặc unit-cost fallback theo Inventory contract.                                       | `trusted` nếu stock ledger/WAC đã gated; nếu không là `needs_review`.                                 |
| `finance.expense.operating`                 | Chi vận hành      | Kỳ này đã ghi nhận bao nhiêu chi phí vận hành?                         | Expense đã posted trong kỳ, category thuộc nhóm `operating`; không gồm `cogs_manual` và `bank_deposit`.                                | `trusted` khi expense module active.                                                                  |
| `finance.food_cost.recorded`                | Giá vốn món       | Kỳ này đã ghi nhận bao nhiêu chi phí nguyên liệu cho món bán/tiêu hao? | `stock_movements.type = 'consumption'`, `movement_subtype = 'sale_consumption'`, `abs(quantity_change) * unit_cost`, theo branch/date. | `trusted` khi mọi sale outcome POS đủ điều kiện đã post và tiêu hao ngoài POS đã duyệt/apply; `needs_review` khi thiếu coverage hoặc có thể ghi trùng. |
| `finance.food_cost.theoretical`             | Giá vốn lý thuyết | Theo recipe thì kỳ này lẽ ra tốn bao nhiêu nguyên liệu?                | `mv_food_cost` / `get_food_cost`, dùng để tham chiếu và variance.                                                                      | `estimated`.                                                                                          |
| `finance.gross_profit.readonly`             | Lãi gộp           | Sau khi trừ giá vốn món thực tế, còn bao nhiêu?                        | `finance.revenue.before_vat_after_discount - finance.food_cost.recorded`.                                                              | `trusted` khi revenue, POS sale outcome, và tiêu hao ngoài POS đều xanh; không dùng recipe-only cost làm lãi gộp thật. |

### Bộ dữ liệu Finance một quán F&B cần

Finance F&B không bắt đầu bằng sổ kế toán doanh nghiệp. Nó cần đủ dữ liệu để
chủ quán trả lời tiền đã vào chưa, món bán có trừ kho chưa, còn bao nhiêu tiền
nằm trong tồn, chi phí nào đã ghi, và ngoại lệ nào cần xử lý.

| Nhóm dữ liệu               | Cần để trả lời                           | Nguồn hiện tại                                                                                                       | Trạng thái đúng/sai                                                                                                |
| -------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Bán hàng và thanh toán     | Tiền đã thu, doanh thu ròng, cơ cấu tiền | `payments` + `orders`, qua RPC `get_revenue_kpis` / `get_revenue_rollup`.                                            | Đúng khi payment/order sync xanh; tiền đã thu/cơ cấu tiền lấy từ `payments.amount`, sales facts distinct theo đơn. |
| Món bán                    | Top món, mix món, đối chiếu food cost    | `order_items`, qua RPC `get_top_items`.                                                                              | Đúng khi order item cancelled/side item được tách theo contract top món.                                           |
| Giá vốn món thực tế        | Lãi gộp thật                             | `stock_movements` với `type='consumption'`, `movement_subtype='sale_consumption'`.                                   | Đúng khi số đơn đã thanh toán có đủ `stock_movements.order_id`; thiếu coverage thì `needs_review`.                 |
| Giá trị tồn kho            | Tiền đang nằm trong kho                  | `stock_levels` tại stock-bearing locations, giá `avg_unit_cost` hoặc fallback `ingredients.unit_cost`.               | Snapshot đúng khi stock ledger/WAC không lệch.                                                                     |
| Chi vận hành               | Chi phí HKD trong kỳ                     | `expenses`, category thuộc nhóm `operating` trong `EXPENSE_CATEGORY_GROUP`.                                          | Đúng khi expense đã được ghi; không tự suy ra từ PO/GRN/NCC, không gồm giá vốn món hoặc nộp tiền nội bộ.           |
| Tồn quỹ tiền mặt/ngân hàng | Dòng tiền đang giữ                       | `system_settings` opening balance/date + revenue cash + paid expenses + `supplier_payments` + SePay events.          | Đúng sau khi chủ quán đặt mốc tồn quỹ; trước đó chỉ hiển thị trạng thái chưa đặt mốc.                              |
| Đối soát ngân hàng         | Tiền vào/ra đã gắn đúng nguồn chưa       | `webhook_events` SePay/manual qua `fetchSepayBankTransactions` và bucket `finance.cash_reconciliation.bank_webhook`. | Supporting workflow `needs_review`; không phải KPI doanh thu, chỉ chỉ ra dòng cần xử lý.                           |
| Đối soát payment với NH    | Thanh toán VietQR đã thu có sao kê chưa  | `payments` VietQR completed + `webhook_events.payment_id` qua `fetchSepayPaymentWebhookSummary`.                     | Supporting workflow `needs_review`; không tự sửa `Tiền đã thu` vì `payments` vẫn là source cho tiền đã thu.        |
| HĐĐT                       | Hóa đơn cần xử lý                        | `tax_invoices`, qua RPC `get_finance_dashboard_summary`.                                                             | Supporting workflow; không thay thế doanh thu vận hành.                                                            |
| Công nợ nhà cung cấp       | NCC còn phải trả, quá hạn chưa trả       | `supplier_invoices`, `supplier_payments`, branch scope qua `goods_received_notes`.                                    | Supporting AP queue; còn phải trả = `total_amount - paid_amount - credit_applied_amount`, aging theo `due_date`, không tính là chi vận hành hoặc giá vốn nếu chưa đi qua contract tương ứng. |
| Lệch tiền / payment desync | Ngoại lệ cần đối soát                    | `pos_sessions` qua `get_cash_variance_summary`, `payments`/`orders` qua `find_payment_order_desync`.                 | Chỉ là cảnh báo vận hành; không sửa công thức KPI chính.                                                           |

### Nguồn số hiện tại trên `/finance`

| Số hiển thị                  | Source triển khai                                                                                  | Công thức hiện tại                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Điều kiện được gọi là đúng                                                                                                                                                                  | UI khi chưa đủ                                                                       |
| ---------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `Tiền đã thu`                | `fetchFinanceCockpit` -> `fetchRevenueKpis` -> `get_revenue_kpis`.                                 | Tổng `payments.amount` của payment `completed`, bucket theo `payments.paid_at` ngày Việt Nam.                                                                                                                                                                                                                                                                                                                                                                                                      | Payment completed, order không cancelled, order `payment_status='paid'`; amount mismatch vẫn vào exception đối soát.                                                                        | Vẫn hiển thị, nhưng payment/order desync phải vào exception.                         |
| `Doanh thu ròng`             | Cùng RPC doanh thu.                                                                                | `subtotal_revenue - discount_amount`; đây là mẫu số margin.                                                                                                                                                                                                                                                                                                                                                                                                                                        | Tax/payment mapping xanh; không dùng HĐĐT làm nguồn doanh thu.                                                                                                                              | Không đổi nhãn thành số kế toán khác.                                                |
| `Số đơn`                     | Cùng RPC doanh thu.                                                                                | `COUNT(DISTINCT orders.id)` trong tập payment hoàn tất.                                                                                                                                                                                                                                                                                                                                                                                                                                            | Đúng khi payment/order sync xanh; DB hiện khóa một active payment/order bằng `idx_payments_order_active`.                                                                                   | Không dùng làm coverage nếu phát hiện duplicate payment/order.                       |
| `Tiền mặt`, `VietQR`         | Cùng RPC doanh thu.                                                                                | Tổng `payments.amount` theo `payments.method`.                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Đúng theo dòng tiền thực nhận; sửa phương thức thanh toán dùng `payments.method` làm nguồn.                                                                                                 | Payment-method cards phải bị coi là cần rà soát nếu có duplicate completed payments. |
| `Giá trị tồn kho`            | `fetchInventoryValueByBranch`.                                                                     | `stock_levels.current_quantity` nhân `avg_unit_cost`, fallback `ingredients.unit_cost`, tại stock-bearing locations.                                                                                                                                                                                                                                                                                                                                                                               | Ledger/WAC xanh; đây là snapshot hiện tại, không phải chi phí trong kỳ.                                                                                                                     | Hiển thị 0 nếu không có stock-bearing location hoặc không đọc được stock rows.       |
| `Chi vận hành`               | `fetchOperatingExpenseTotal` và `/finance/expenses`.                                               | Tổng `expenses.amount` trong kỳ với category nhóm `operating`; loại `cogs_manual` và `bank_deposit`.                                                                                                                                                                                                                                                                                                                                                                                               | Đúng khi expense được ghi trong `/finance/expenses`; không tự kéo nguyên liệu/NCC vào.                                                                                                      | 0 nghĩa là chưa ghi expense, không phải chắc chắn không có chi phí.                  |
| `Dòng tiền trong kỳ`         | `CashPanel` từ `fetchCashSummary` + cockpit revenue.                                               | `Tiền đã thu - cashOutPaidPeriod`; `cashOutPaidPeriod = expensesPaidPeriod + supplierPaymentsPaidPeriod`. Đây là cash-basis signal trừ tiền đã chi/trả, loại `bank_deposit` để không coi nộp tiền nội bộ là chi phí.                                                                                                                                                                                                                                                                               | Chỉ là cash-basis signal; không phải lợi nhuận kế toán và không thay thế `Chi vận hành`; thanh toán NCC làm giảm dòng tiền nhưng không biến hóa đơn NCC thành expense.                      | Không thay thế `Lãi gộp`.                                                            |
| `Giá vốn món`                | `fetchActualFoodCostSnapshot` / `fetchActualFoodCostTotal`.                                        | `sum(abs(stock_movements.quantity_change) * unit_cost)` theo ngày kinh doanh Việt Nam.                                                                                                                                                                                                                                                                                                                                                                                                             | Chỉ `trusted` khi distinct `stock_movements.order_id` phủ đủ số đơn đã thanh toán trong kỳ.                                                                                                 | Hiện coverage `x/y đơn có giá vốn món`.                                              |
| `Lãi gộp`                    | `buildKpis` trong Finance cockpit.                                                                 | `Doanh thu ròng - Giá vốn món`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Chỉ hiển thị tiền khi `costAvailable=true`; recipe-only cost không được dùng làm lãi gộp thật.                                                                                              | Hiển thị `Cần rà soát`.                                                              |
| `Công nợ NCC`                | `fetchUnpaidSupplierInvoiceRisk` và `/finance/supplier-invoices`.                                  | `sum(max(total_amount - paid_amount - credit_applied_amount, 0))` cho `supplier_invoices.payment_status <> 'paid'`; drilldown nhóm theo NCC/đơn mua, aging theo `due_date`, lần trả gần nhất đọc từ `supplier_payments`.                                                                                                                                                                                                                                                                          | Chỉ Owner được xem số công nợ toàn tenant; branch filter phải đi qua GRN. Thanh toán NCC làm giảm dòng tiền/công nợ nhưng không tự biến thành expense trong kỳ.                             | Hiển thị trong exception/support workflow và màn phải trả NCC.                       |
| `HĐĐT cần xử lý`             | `get_finance_dashboard_summary`.                                                                   | Đếm hóa đơn theo trạng thái attention/issued/not required trong kỳ.                                                                                                                                                                                                                                                                                                                                                                                                                                | Đúng khi queue Viettel S-invoice/HĐĐT được đồng bộ.                                                                                                                                         | Là workflow hỗ trợ, không đổi doanh thu.                                             |
| `Lệch tiền ca`               | `get_cash_variance_summary`.                                                                       | Tổng trị tuyệt đối chênh lệch ca POS đã đóng, chưa resolve theo rule RPC.                                                                                                                                                                                                                                                                                                                                                                                                                          | Đúng khi ca POS đóng và variance note/status được cập nhật.                                                                                                                                 | Hiển thị exception, không trừ trực tiếp vào revenue.                                 |
| `Payment/order desync`       | `find_payment_order_desync`.                                                                       | Đếm completed payments có order chưa được đánh dấu paid.                                                                                                                                                                                                                                                                                                                                                                                                                                           | Dùng để cảnh báo sync lỗi; không tự cộng vào doanh thu nếu order chưa đạt contract paid order.                                                                                              | Hiển thị exception xử lý.                                                            |
| `Đối soát ngân hàng`         | `/finance/bank-transactions` -> `fetchSepayBankTransactions` -> `buildSepayReconciliationSummary`. | Danh sách giao dịch SePay/manual hợp lệ gần nhất đang hiển thị; `matched` khi tiền vào có `payment_id`, tiền ra có `expenseIds`, hoặc tiền ra khớp khoản trả NCC `supplier_payments` theo ngày + mã tham chiếu + số tiền; NCC match drill sang `/finance/supplier-invoices?invoiceId=...`; `needs_review` khi webhook lỗi, tiền vào chưa gắn đơn, hoặc tiền ra chưa gắn nguồn; tiền ra chưa gắn nguồn được đưa vào queue riêng để ghép chi hoặc kiểm tra khoản trả NCC; drilldown tiền vào phân loại `webhook_error`, `missing_reference`, `unmatched_reference`; owner có thể gắn thủ công webhook tiền vào vào một payment VietQR đã thu khi số tiền khớp. | Supporting workflow `finance.cash_reconciliation.bank_webhook`; không dùng để sửa `Tiền đã thu` hay `Chi vận hành` tự động.                                                                 | Hiển thị bucket cần rà soát trên màn giao dịch ngân hàng.                            |
| `VietQR thiếu webhook NH`    | `/finance/bank-transactions` -> `fetchSepayPaymentWebhookSummary`.                                 | 100 payment VietQR completed gần nhất, trừ các payment có `webhook_events` SePay/manual hợp lệ, không lỗi, `transferType='in'` cùng `payment_id`; drilldown hiển thị `payment_id`, `order_id`, `amount`, `paid_at`, `provider_ref`, `provider_data.bankWebhookReview`.                                                                                                                                                                                                                             | Supporting workflow; `payments` vẫn là nguồn tiền đã thu, bucket này chỉ báo thiếu bằng chứng sao kê ngân hàng; `resolved`/`ignored` chỉ đóng queue xử lý, không thay thế `webhook_events`. | Hiển thị trong hàng KPI đối soát và bảng drilldown, không cộng/trừ vào doanh thu.    |

Không thêm KPI tài chính mới nếu KPI đó không trả lời câu hỏi daily operator
hoặc accountant export bắt buộc.

## Contract tổng quan Inventory

Inventory là bề mặt workflow-first: ưu tiên phiếu, việc cần xử lý, ngoại lệ, và
trạng thái tồn thật. Analytics phụ trợ không được che mất công việc vận hành.

| `contract_key`                       | Nhãn UI                   | Nghĩa chuẩn                                                          | Source/rule                                                                                           |
| ------------------------------------ | ------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `inventory.stock_value.current`      | Giá trị tồn kho           | Snapshot tiền đang nằm trong tồn kho vận hành.                       | `stock_levels` ở stock-bearing location: Kho chi nhánh (`warehouse`). Bếp CN retired (D078). |
| `inventory.stock_quantity.current`   | Tồn hiện tại              | Số lượng hiện có theo đơn vị tồn chuẩn tại stock-bearing location. | `stock_levels.current_quantity` tại warehouse active của chi nhánh. |
| `inventory.alert.low_stock`          | Sắp hết hàng              | Nguyên liệu dưới reorder/min threshold.                              | Stock level so với điểm đặt hàng.                                                                     |
| `inventory.alert.negative_stock`     | Âm kho                    | Tồn nhỏ hơn 0, cần xử lý dữ liệu.                                    | Stock level hiện tại.                                                                                 |
| `inventory.transfer.open`            | Phiếu điều chuyển đang mở | Phiếu chưa hoàn tất nhận/hủy.                                        | `stock_transfers` theo state machine hợp lệ.                                                          |
| `inventory.grn.pending`              | Phiếu nhập chờ xác nhận   | GRN chưa confirm/cập nhật WAC.                                       | GRN state.                                                                                            |
| `inventory.stocktake.active`         | Kiểm kê đang chạy         | Phiên kiểm kê chưa finalize.                                         | Stocktake session state.                                                                              |
| `inventory.consumption.review_queue` | Tiêu hao chờ duyệt        | Báo cáo tiêu hao bếp chưa được quản lý duyệt/apply.                  | Consumption report workflow, không phải employee checklist tick.                                      |

`Kho CN -> Bếp CN` chỉ còn là lịch sử audit. Tồn vận hành và POS consumption
đều ghi tại Kho CN; khi import hoặc diễn giải dữ liệu lịch sử từ hệ thống khác,
chỉ phân loại thành `stock_movements.consumption/sale_consumption` nếu đó là
nguyên liệu đã thực sự xuất dùng trong ngày để tạo doanh thu.

`supplier_invoice`, AP aging, và thanh toán NCC là Finance handoff. Inventory
không được gọi các số đó là gate đóng ngày kho nếu GRN/WAC/stock ledger đã
đúng.

## Tổng quan Admin

Tổng quan Admin không phải chỗ gom mọi KPI. Nó chỉ được hiển thị ba nhóm:

1. **Tình trạng vận hành cần chú ý**: lỗi HĐĐT, print-agent offline, payment
   mismatch, stock alert, ca POS lệch tiền.
2. **Công việc chờ xử lý**: phiếu, duyệt, đối soát, thiết lập còn thiếu.
3. **Lối vào module**: shortcut đến Finance, Inventory, HR, POS/KDS settings,
   Reports.

Card Admin có số tiền hoặc tính toán tài chính phải dùng `finance.*`. Card Admin
có tồn kho hoặc phiếu kho phải dùng `inventory.*`. Nếu chỉ là link điều hướng,
không được đặt title như một KPI.

## Quy tắc cho Agent

- Trước khi sửa tổng quan/card/title/KPI ở Admin, Inventory, Finance, Reports:
  đọc file này, `docs/ref/glossary.md`, và module doc tương ứng.
- Nếu title mới chứa một danh từ nghiệp vụ, kiểm tra glossary trước.
- Nếu card mới chứa một con số, phải khai báo hoặc tái dùng `contract_key`.
- Nếu dữ liệu là ước tính hoặc chưa đủ source, không được gọi là kết quả thật.
- Nếu phép tính cần policy/config riêng chưa có trong contract, ghi rõ blocker
  trong task/docs; không tự chọn công thức để UI trông đầy đủ hơn.
- Không thêm feature hoặc route chỉ để hợp thức hóa một card chưa có contract.

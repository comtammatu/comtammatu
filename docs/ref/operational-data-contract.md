# Khung ngữ nghĩa dữ liệu vận hành

Tài liệu này là contract cho cách đặt tên, lấy dữ liệu, tính toán, và hiển thị
metric/card trên Owner, Inventory, Finance, Reports, và các bề mặt tổng quan.

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

| Khái niệm               | Nghĩa chuẩn                                                                       | Không được lẫn với                                                           |
| ----------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Doanh thu               | Tổng giá trị thanh toán hoàn tất trong kỳ, có thể gồm VAT.                        | Doanh thu tính thuế, HĐĐT đã phát hành, tiền mặt đang giữ.                   |
| Bán hàng sau giảm giá   | `subtotal_revenue - discount_amount` của đơn đã trả, chưa gồm VAT.                | Doanh thu kế toán sau mọi điều chỉnh, tổng tiền khách trả gồm VAT.           |
| HĐĐT đã phát hành       | Hóa đơn điện tử bán ra đã được provider/CQT xử lý theo trạng thái.                | Doanh thu vận hành nếu đơn chưa/không xuất HĐĐT.                             |
| Giá trị tồn kho         | Giá trị đầu/cuối kỳ suy từ stock ledger và giá vốn chuyển động.                   | Chi phí trong kỳ, tiền đã chi cho NCC.                                       |
| Giá vốn món / food cost | Chi phí nguyên liệu thực tế đã được quản lý duyệt/apply từ tiêu hao bán hàng.     | Recipe theoretical cost, chi vận hành, hóa đơn NCC, hoặc PO chưa nhận hàng.  |
| Chi vận hành            | Chi thuê, điện nước, gas, lương, sửa chữa, vật dụng, marketing, phí/thuế và khác. | Giá vốn món, vật tư/nguyên liệu, thanh toán NCC, nộp tiền mặt vào ngân hàng. |
| Lãi gộp                 | Doanh thu trước VAT sau giảm giá trừ giá vốn món/food cost.                       | Lợi nhuận ròng, dòng tiền, lợi nhuận kế toán doanh nghiệp.                   |

Trên Finance Basic, nhãn `Doanh thu` luôn trỏ đến
`finance.revenue.money_collected`: tổng payment hoàn tất. Giá trị bán hàng để
tính margin phải ghi rõ `Bán hàng sau giảm giá`; số dùng kê khai phải ghi
`Doanh thu tính thuế`; số theo hóa đơn phải ghi `HĐĐT đã phát hành`.

## Contract Finance Basic

Finance landing có bốn metric chính: doanh thu, bán hàng sau giảm giá, giá trị
tồn kho và chi vận hành. Giá vốn ghi nhận, giá vốn lý thuyết và lãi gộp là metric hỗ
trợ/derived trong contract; không tự nâng thành card landing mặc định nếu không
có quyết định mới.

| `contract_key`                              | Nhãn UI                 | Câu hỏi owner                                                              | Source/rule                                                                                                                            | Confidence                                                                                                                                             |
| ------------------------------------------- | ----------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `finance.revenue.money_collected`           | Doanh thu               | Kỳ này có bao nhiêu giá trị thanh toán hoàn tất?                           | Tổng `payments.amount` completed, bucket theo `paid_at` ngày Việt Nam; có thể gồm VAT.                                                 | `trusted` khi payment/order sync xanh; không gọi là doanh thu tính thuế.                                                                               |
| `finance.revenue.before_vat_after_discount` | Bán hàng sau giảm giá   | Tổng giá món sau giảm giá, chưa VAT là bao nhiêu?                          | `subtotal_revenue - discount_amount` của tập đơn có payment hoàn tất.                                                                  | `trusted` khi tax/payment mapping khớp; không gọi là `Doanh thu ròng`.                                                                                 |
| `finance.inventory_value.current`           | Giá trị tồn kho cuối kỳ | Cuối kỳ đang giữ bao nhiêu tiền trong kho?                                 | `get_inventory_value_period`: lấy current stock value rồi đảo movement sau ngày cuối kỳ.                                               | `trusted` nếu stock ledger và movement unit cost đầy đủ; fallback cost thì `needs_review`.                                                             |
| `finance.inventory_value.opening`           | Tồn đầu kỳ              | Đầu kỳ đang giữ bao nhiêu tiền trong kho và biến động bao nhiêu phần trăm? | Giá trị cuối kỳ trừ giá trị movement trong kỳ; `% = (cuối - đầu) / abs(đầu)`, tone trung tính.                                         | Cùng confidence với giá trị cuối kỳ; đầu kỳ 0 hiển thị `Mới`, không chia cho 0.                                                                        |
| `finance.expense.operating`                 | Chi vận hành            | Kỳ này đã ghi nhận bao nhiêu chi phí vận hành?                             | `expenses.amount` thuộc `rent`, `utilities`, `gas_fuel`, `salary`, `repair`, `supplies`, `marketing`, `fees_tax`, `other`.             | `trusted` khi expense module active; loại `cogs_manual`, `materials`, `bank_deposit`, `transfer` và thanh toán NCC.                                    |
| `finance.food_cost.recorded`                | Giá vốn món             | Kỳ này đã ghi nhận bao nhiêu chi phí nguyên liệu cho món bán/tiêu hao?     | `stock_movements.type = 'consumption'`, `movement_subtype = 'sale_consumption'`, `abs(quantity_change) * unit_cost`, theo branch/date. | `trusted` khi mọi sale outcome POS đủ điều kiện đã post và tiêu hao ngoài POS đã duyệt/apply; `needs_review` khi thiếu coverage hoặc có thể ghi trùng. |
| `finance.food_cost.theoretical`             | Giá vốn lý thuyết       | Theo recipe thì kỳ này lẽ ra tốn bao nhiêu nguyên liệu?                    | `mv_food_cost` / `get_food_cost`, dùng để tham chiếu và variance.                                                                      | `estimated`.                                                                                                                                           |
| `finance.gross_profit.readonly`             | Lãi gộp                 | Sau khi trừ giá vốn món thực tế, còn bao nhiêu?                            | `finance.revenue.before_vat_after_discount - finance.food_cost.recorded`.                                                              | `trusted` khi revenue, POS sale outcome, và tiêu hao ngoài POS đều xanh; không dùng recipe-only cost làm lãi gộp thật.                                 |

### Bộ dữ liệu Finance một quán F&B cần

Finance F&B không bắt đầu bằng sổ kế toán doanh nghiệp. Nó cần đủ dữ liệu để
chủ quán trả lời tiền đã vào chưa, món bán có trừ kho chưa, còn bao nhiêu tiền
nằm trong tồn, chi phí nào đã ghi, và ngoại lệ nào cần xử lý.

| Nhóm dữ liệu               | Cần để trả lời                                | Nguồn hiện tại                                                                                                                                              | Trạng thái đúng/sai                                                                                                                                                                                                                                                           |
| -------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bán hàng và thanh toán     | Doanh thu, bán hàng sau giảm giá, cơ cấu tiền | `payments` + `orders`, qua RPC `get_revenue_kpis` / `get_revenue_rollup`.                                                                                   | Đúng khi payment/order sync xanh; Doanh thu/cơ cấu tiền lấy từ `payments.amount`, sales facts distinct theo đơn.                                                                                                                                                              |
| Món bán                    | Top món, mix món, đối chiếu food cost         | `order_items`, qua RPC `get_top_items`.                                                                                                                     | Đúng khi order item cancelled/side item được tách theo contract top món.                                                                                                                                                                                                      |
| Giá vốn món thực tế        | Lãi gộp thật                                  | `stock_movements` với `type='consumption'`, `movement_subtype='sale_consumption'`.                                                                          | Đúng khi số đơn đã thanh toán có đủ `stock_movements.order_id`; thiếu coverage thì `needs_review`.                                                                                                                                                                            |
| Giá trị tồn kho            | Tồn đầu kỳ, cuối kỳ và % biến động            | `get_inventory_value_period` đảo `stock_movements` từ `stock_levels` hiện tại, dùng movement cost hoặc fallback.                                            | Đúng khi stock ledger/WAC và movement cost không lệch; fallback giá nguyên liệu thì cần rà soát.                                                                                                                                                                              |
| Chi vận hành               | Chi phí HKD trong kỳ                          | `expenses`, category thuộc nhóm `operating` trong `EXPENSE_CATEGORY_GROUP`.                                                                                 | Đúng khi expense đã được ghi; không tự suy ra từ PO/GRN/NCC, không gồm giá vốn món hoặc nộp tiền nội bộ.                                                                                                                                                                      |
| Tồn quỹ tiền mặt/ngân hàng | Dòng tiền đang giữ theo sổ                    | `finance_fund_entries` opening bất biến + phát sinh canonical sau `effective_at` + adjustment append-only; đọc bằng `get_finance_current_funds`.            | Đúng sau khi Owner xác nhận mốc mở sổ; cutover dùng timestamp server chính xác, đầu ngày dự án chỉ dùng khi bằng chứng đúng tại 00:00; ba setting opening cũ chỉ giữ làm bằng chứng, chặn khởi tạo tương tác và không fallback; không thay thế số đếm vật lý tại từng ca POS. |
| Đối soát ngân hàng         | Tiền vào/ra đã gắn đúng nguồn chưa            | `bank_transactions` qua `fetchSepayBankTransactions`; `webhook_events` là bằng chứng xử lý, `bank_transaction_reconciliation_matches` là quan hệ phân loại. | Supporting workflow `needs_review`; không phải KPI doanh thu và việc gắn/gỡ chứng từ không làm đổi số dư ngân hàng.                                                                                                                                                           |
| Đối soát payment với NH    | Thanh toán VietQR có sao kê chưa              | `payments` VietQR completed + `bank_transaction_reconciliation_matches.payment_id`; webhook hợp lệ được backfill vào cùng quan hệ.                          | Supporting workflow `needs_review`; không tự sửa `Doanh thu` vì `payments` vẫn là source.                                                                                                                                                                                     |
| HĐĐT                       | Hóa đơn cần xử lý                             | `tax_invoices`, qua RPC `get_finance_dashboard_summary`.                                                                                                    | Supporting workflow; không thay thế doanh thu vận hành.                                                                                                                                                                                                                       |
| Công nợ nhà cung cấp       | NCC còn phải trả, quá hạn chưa trả            | `supplier_invoices`, `supplier_payments`, branch scope qua `goods_received_notes`.                                                                          | Supporting AP queue; còn phải trả = `total_amount - paid_amount - credit_applied_amount`, aging theo `due_date`, không tính là chi vận hành hoặc giá vốn nếu chưa đi qua contract tương ứng.                                                                                  |
| Lệch tiền / payment desync | Ngoại lệ cần đối soát                         | `pos_sessions` qua `get_cash_variance_summary`, `payments`/`orders` qua `find_payment_order_desync`.                                                        | Chỉ là cảnh báo vận hành; không sửa công thức KPI chính.                                                                                                                                                                                                                      |

### Nguồn số hiện tại trên `/finance`

| Số hiển thị                  | Source triển khai                                                                                                    | Công thức hiện tại                                                                                                                                                                                                                                                                                                                          | Điều kiện được gọi là đúng                                                                                                                                                                                                    | UI khi chưa đủ                                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `Doanh thu`                  | `fetchFinanceCockpit` -> `fetchRevenueKpis` -> `get_revenue_kpis`.                                                   | Tổng `payments.amount` của payment `completed`, bucket theo `payments.paid_at` ngày Việt Nam; có thể gồm VAT.                                                                                                                                                                                                                               | Payment completed, order không cancelled, order `payment_status='paid'`; amount mismatch vẫn vào exception đối soát.                                                                                                          | Vẫn hiển thị, nhưng payment/order desync phải vào exception.                                   |
| `Bán hàng sau giảm giá`      | Cùng RPC doanh thu.                                                                                                  | `subtotal_revenue - discount_amount` của đơn trong tập payment hoàn tất; chưa gồm VAT.                                                                                                                                                                                                                                                      | Tax/payment mapping xanh; không dùng HĐĐT làm nguồn.                                                                                                                                                                          | Không gọi là `Doanh thu ròng` hoặc doanh thu tính thuế.                                        |
| `Số đơn`                     | Cùng RPC doanh thu.                                                                                                  | `COUNT(DISTINCT orders.id)` trong tập payment hoàn tất.                                                                                                                                                                                                                                                                                     | Đúng khi payment/order sync xanh; DB hiện khóa một active payment/order bằng `idx_payments_order_active`.                                                                                                                     | Không dùng làm coverage nếu phát hiện duplicate payment/order.                                 |
| `Tiền mặt`, `VietQR`         | Cùng RPC doanh thu.                                                                                                  | Tổng `payments.amount` theo `payments.method`.                                                                                                                                                                                                                                                                                              | Đúng theo dòng tiền thực nhận; sửa phương thức thanh toán dùng `payments.method` làm nguồn.                                                                                                                                   | Payment-method cards phải bị coi là cần rà soát nếu có duplicate completed payments.           |
| `Giá trị tồn kho`            | `fetchInventoryPeriodValue` -> `get_inventory_value_period`.                                                         | Giá trị cuối kỳ = current value − movement value sau kỳ; tồn đầu kỳ = cuối kỳ − movement value trong kỳ; % biến động so với đầu kỳ.                                                                                                                                                                                                         | Ledger/WAC/movement cost xanh; không phải chi phí trong kỳ.                                                                                                                                                                   | Fallback về snapshot hiện tại nếu RPC chưa sẵn sàng; % khi đó bằng 0.                          |
| `Chi vận hành`               | `fetchOperatingExpenseTotal` và `/finance/expenses`.                                                                 | Tổng `expenses.amount` nhóm operating: thuê, điện nước, gas, lương, sửa chữa, vật dụng, marketing, phí/thuế, khác; loại nguyên liệu, NCC và nộp nội bộ.                                                                                                                                                                                     | Đúng khi expense được ghi trong `/finance/expenses`; không tự kéo PO/GRN/NCC vào.                                                                                                                                             | 0 nghĩa là chưa ghi expense, không phải chắc chắn không có chi phí.                            |
| `Tiền mặt theo sổ`           | `fetchCashSummary` -> `get_finance_current_funds`.                                                                   | Opening cash bất biến + cash payment completed − hoàn cash − chi cash − trả NCC cash + tổng adjustment append-only. Cả `staff_repaid` và `accepted_adjustment` của ca POS đều có book delta bằng 0.                                                                                                                                         | Tenant-wide, không theo filter; loại phát sinh trước `effective_at`; chỉ `supplier_payments.payment_method='cash'` trừ tiền mặt; opening không được sửa/xóa.                                                                  | Hiển thị `Đang xác minh` cho đến khi Owner ghi mốc mở sổ được xác minh.                        |
| `Tiền trong ngân hàng`       | `fetchCashSummary` -> `get_finance_current_funds` -> `bank_transactions`.                                            | Opening bank bất biến + tổng giao dịch canonical `in` − tổng giao dịch canonical `out` từ `effective_at` + tổng adjustment append-only; webhook SePay đã xác thực và CSV SePay do Owner nhập dùng cùng ID giao dịch để chống tính trùng.                                                                                                    | Số dư tenant-wide, không theo filter; `webhook_events`, expense/AP/refund và quan hệ đối soát không được cộng/trừ thêm; nộp tiền mặt giảm cash và tăng bank đúng một lần.                                                     | Hiển thị `Đang xác minh` cho đến khi Owner ghi mốc mở sổ được xác minh.                        |
| `Giá vốn món`                | `fetchActualFoodCostSnapshot` / `fetchActualFoodCostTotal`.                                                          | `sum(abs(stock_movements.quantity_change) * unit_cost)` theo ngày kinh doanh Việt Nam.                                                                                                                                                                                                                                                      | Chỉ `trusted` khi distinct `stock_movements.order_id` phủ đủ số đơn đã thanh toán trong kỳ.                                                                                                                                   | Hiện coverage `x/y đơn có giá vốn món`.                                                        |
| `Lãi gộp`                    | `buildKpis` trong Finance cockpit.                                                                                   | `Bán hàng sau giảm giá - Giá vốn món`.                                                                                                                                                                                                                                                                                                      | Chỉ hiển thị tiền khi `costAvailable=true`; recipe-only cost không được dùng làm lãi gộp thật.                                                                                                                                | Hiển thị `Cần rà soát`.                                                                        |
| `Công nợ NCC`                | `fetchUnpaidSupplierInvoiceRisk` và `/finance/supplier-invoices`.                                                    | `sum(max(total_amount - paid_amount - credit_applied_amount, 0))` cho `supplier_invoices.payment_status <> 'paid'`; drilldown nhóm theo NCC/đơn mua, aging theo `due_date`, lần trả gần nhất đọc từ `supplier_payments`.                                                                                                                    | Chỉ Owner được xem số công nợ toàn tenant; branch filter phải đi qua GRN. Trả NCC bằng cash trừ tiền mặt; trả bằng `bank_transfer` chỉ trừ ngân hàng qua canonical `bank_transactions.out`; quan hệ đối soát không tạo delta. | Hiển thị trong exception/support workflow và màn phải trả NCC.                                 |
| `HĐĐT cần xử lý`             | `get_finance_dashboard_summary`.                                                                                     | Đếm hóa đơn theo trạng thái attention/issued/not required trong kỳ.                                                                                                                                                                                                                                                                         | Đúng khi queue Viettel S-invoice/HĐĐT được đồng bộ.                                                                                                                                                                           | Là workflow hỗ trợ, không đổi doanh thu.                                                       |
| `Lệch tiền ca`               | `close_pos_session`, `get_cash_variance_summary`, `get_cash_variance_action_target`, `resolve_pos_session_variance`. | Dự thu = đầu ca + payment cash completed; lệch = tiền đếm lúc đóng − dự thu. `staff_repaid` và `accepted_adjustment` ghi nhận cách xử lý ca nhưng không thay đổi tiền mặt theo sổ.                                                                                                                                                          | Số đếm và lệch lúc đóng bất biến; sửa phương thức payment sẽ tính lại dự thu/lệch và mở lại resolution; tổn thất/lợi ích đã kiểm chứng phải dùng adjustment tài chính riêng.                                                  | Exception dẫn thẳng tới `/br/[id]/pos-sessions?session=[id]`.                                  |
| `Sửa phương thức thanh toán` | `correct_payment_method`; `payments.method` là nguồn, `orders.payment_method` chỉ là mirror.                         | Owner đổi `Tiền mặt`/`VietQR` kèm lý do; RPC đồng bộ payment/order, tính lại dự thu và lệch của ca đã đóng, rồi mở lại resolution cũ. Trigger đồng bộ mirror khi payment chuyển sang `completed` hoặc đổi method; backfill chỉ repair khi đúng một completed payment nguồn.                                                                 | VietQR có match ngân hàng hoặc webhook đã xác thực không được đổi thành tiền mặt cho đến khi Owner gỡ bằng chứng trong đối soát. `bank_transactions` không đổi và audit dùng `payment.method_correct`.                        | Xử lý từ bill của ca POS hoặc hàng đợi HĐĐT; lỗi dẫn về đối soát ngân hàng khi còn bằng chứng. |
| `Payment/order desync`       | `find_payment_order_desync`.                                                                                         | Đếm completed payments có order chưa được đánh dấu paid.                                                                                                                                                                                                                                                                                    | Dùng để cảnh báo sync lỗi; không tự cộng vào doanh thu nếu order chưa đạt contract paid order.                                                                                                                                | Hiển thị exception xử lý.                                                                      |
| `Đối soát ngân hàng`         | `/finance/bank-transactions` -> `fetchSepayBankTransactions` -> `bank_transaction_reconciliation_matches`.           | Danh sách canonical gồm cả webhook và CSV SePay; `matched` khi tiền vào gắn payment hoặc tiền ra gắn chi vận hành, khoản trả NCC hay hoàn tiền có tổng đúng bằng giao dịch. Quan hệ match có audit, Owner-only và không sửa số tiền/chiều giao dịch trong `bank_transactions`; webhook-backed rows tiếp tục đi qua invariant bằng chứng cũ. | Supporting workflow `finance.cash_reconciliation.bank_webhook`; không dùng để sửa `Doanh thu`, `Chi vận hành` hoặc số dư ngân hàng tự động.                                                                                   | Hiển thị bucket cần rà soát trên màn giao dịch ngân hàng.                                      |
| `VietQR thiếu bằng chứng NH` | `/finance/bank-transactions` -> `fetchSepayPaymentWebhookSummary`.                                                   | Payment VietQR completed chưa có `bank_transaction_reconciliation_matches.payment_id`; bằng chứng webhook hợp lệ và match từ CSV đều đóng cùng một khoảng trống đối soát.                                                                                                                                                                   | Supporting workflow; `payments` vẫn là nguồn `Doanh thu`, bucket này chỉ báo thiếu bằng chứng giao dịch ngân hàng; `resolved`/`ignored` chỉ đóng queue xử lý.                                                                 | Hiển thị trong bảng đối soát, không cộng/trừ vào doanh thu.                                    |
| `Finance cần xử lý`          | `get_cash_variance_action_target` + `get_finance_reconciliation_attention`.                                          | Tổng hợp ca lệch chưa xử lý, giao dịch SePay chưa gắn nguồn và VietQR thiếu bằng chứng trong đúng khoảng ngày Việt Nam.                                                                                                                                                                                                                     | Là danh sách Daily Close cần hành động, không phải KPI hay một phép cộng/trừ mới vào tiền mặt, ngân hàng hoặc doanh thu.                                                                                                      | Ca lệch dẫn tới đúng session; đối soát dẫn tới đúng khoảng ngày giao dịch ngân hàng.           |

Không thêm KPI tài chính mới nếu KPI đó không trả lời câu hỏi daily operator
hoặc accountant export bắt buộc.

## Contract tổng quan Inventory

Inventory là bề mặt workflow-first: ưu tiên phiếu, việc cần xử lý, ngoại lệ, và
trạng thái tồn thật. Analytics phụ trợ không được che mất công việc vận hành.

| `contract_key`                       | Nhãn UI                 | Nghĩa chuẩn                                                        | Source/rule                                                                                  |
| ------------------------------------ | ----------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `inventory.stock_value.current`      | Giá trị tồn kho         | Snapshot tiền đang nằm trong tồn kho vận hành.                     | `stock_levels` ở stock-bearing location: Kho chi nhánh (`warehouse`). Bếp CN retired (D078). |
| `inventory.stock_quantity.current`   | Tồn hiện tại            | Số lượng hiện có theo đơn vị tồn chuẩn tại stock-bearing location. | `stock_levels.current_quantity` tại warehouse active của chi nhánh.                          |
| `inventory.alert.low_stock`          | Sắp hết hàng            | Nguyên liệu dưới reorder/min threshold.                            | Stock level so với điểm đặt hàng.                                                            |
| `inventory.alert.negative_stock`     | Âm kho                  | Tồn nhỏ hơn 0, cần xử lý dữ liệu.                                  | Stock level hiện tại.                                                                        |
| `inventory.grn.pending`              | Phiếu nhập chờ xác nhận | GRN chưa confirm/cập nhật WAC.                                     | GRN state.                                                                                   |
| `inventory.stocktake.active`         | Kiểm kê đang chạy       | Phiên kiểm kê chưa finalize.                                       | Stocktake session state.                                                                     |
| `inventory.consumption.review_queue` | Tiêu hao chờ duyệt      | Báo cáo tiêu hao bếp chưa được quản lý duyệt/apply.                | Consumption report workflow, không phải employee checklist tick.                             |

`Kho CN -> Bếp CN` chỉ còn là lịch sử audit. Tồn vận hành và POS consumption
đều ghi tại Kho CN; khi import hoặc diễn giải dữ liệu lịch sử từ hệ thống khác,
chỉ phân loại thành `stock_movements.consumption/sale_consumption` nếu đó là
nguyên liệu đã thực sự xuất dùng trong ngày để tạo doanh thu.
`stock_transfers` chỉ còn là bằng chứng lịch sử/read-only và không sở hữu một
KPI hay hàng đợi vận hành hiện tại.

`supplier_invoice`, AP aging, và thanh toán NCC là Finance handoff. Inventory
không được gọi các số đó là gate đóng ngày kho nếu GRN/WAC/stock ledger đã
đúng.

## Tổng quan Owner

Tổng quan Owner không phải chỗ gom mọi KPI. Nó chỉ được hiển thị ba nhóm:

1. **Tình trạng vận hành cần chú ý**: lỗi HĐĐT, print-agent offline, payment
   mismatch, stock alert, ca POS lệch tiền.
2. **Công việc chờ xử lý**: phiếu, duyệt, đối soát, thiết lập còn thiếu.
3. **Lối vào module**: shortcut đến Finance, Inventory, HR, POS/KDS settings,
   Reports.

Card Owner có số tiền hoặc tính toán tài chính phải dùng `finance.*`. Card Owner
có tồn kho hoặc phiếu kho phải dùng `inventory.*`. Nếu chỉ là link điều hướng,
không được đặt title như một KPI.

## Quy tắc cho Agent

- Trước khi sửa tổng quan/card/title/KPI ở Owner, Inventory, Finance, Reports:
  đọc file này, `docs/ref/glossary.md`, và module doc tương ứng.
- Nếu title mới chứa một danh từ nghiệp vụ, kiểm tra glossary trước.
- Nếu card mới chứa một con số, phải khai báo hoặc tái dùng `contract_key`.
- Nếu dữ liệu là ước tính hoặc chưa đủ source, không được gọi là kết quả thật.
- Nếu phép tính cần policy/config riêng chưa có trong contract, ghi rõ blocker
  trong task/docs; không tự chọn công thức để UI trông đầy đủ hơn.
- Không thêm feature hoặc route chỉ để hợp thức hóa một card chưa có contract.

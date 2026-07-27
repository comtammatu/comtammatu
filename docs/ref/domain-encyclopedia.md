# Bách khoa nghiệp vụ F&B, tài chính, thuế và lao động

Tài liệu này là kho kiến thức nền để Agent hiểu và xử lý nghiệp vụ Cơm Tấm Má
Tư. Nó không phải UI copy, không phải backlog, không phải ghi chú phiên làm
việc. Khi cần định nghĩa nhãn/thuật ngữ ngắn, đọc `glossary.md`. Khi cần
contract cho card/KPI/report, đọc `operational-data-contract.md`. Khi cần số
luật hiện hành, đọc `legal-framework-2026.md`, `einvoice-tax.md`,
`payroll-pit.md`, và `labor-contracts.md`.

## Cách dùng

- Agent phải tự nắm các khái niệm phổ quát trong tài liệu này trước khi sửa
  Owner, Finance, Inventory, POS, KDS, HR, payroll, tax, hoặc report.
- Không hỏi owner định nghĩa thuật ngữ ngành phổ quát. Chỉ hỏi khi đó là policy
  riêng của Má Tư, cấu hình pháp lý, hoặc quyết định sản phẩm chưa có contract.
- UI không dùng label song ngữ. `term_en` dùng cho code/contract. `label_vi`
  dùng cho UI/docs vận hành. Acronym là biến thể riêng.
- Thuế, ngưỡng doanh thu, tỷ lệ, biểu thuế, và mẫu chứng từ là dữ liệu thay đổi.
  Không lấy số từ trí nhớ; kiểm tra doc pháp lý dự án trước khi code.

## Bản đồ tài liệu

| Cần làm                             | Đọc trước                                              |
| ----------------------------------- | ------------------------------------------------------ |
| Đặt tên thuật ngữ, nhãn UI, acronym | `glossary.md`                                          |
| Thêm card/KPI/report summary        | `operational-data-contract.md`                         |
| Sửa Finance landing hoặc report     | `modules/finance.md`, file này                         |
| Sửa Inventory, kho, WAC, tiêu hao   | `inventory.md`, file này                               |
| Sửa HĐĐT, VAT, doanh thu tính thuế  | `einvoice-tax.md`, `legal-framework-2026.md`, file này |
| Sửa payroll, BHXH, PIT lương        | `payroll-pit.md`, `labor-contracts.md`, file này       |
| Sửa POS/KDS/table/order lifecycle   | `glossary.md`, `modules/web-app.md`, regression rules  |

## Nguyên tắc phân lớp dữ liệu

| Lớp              | Câu hỏi                           | Ví dụ                                          | Không lẫn với         |
| ---------------- | --------------------------------- | ---------------------------------------------- | --------------------- |
| Sự kiện vận hành | Đã xảy ra việc gì?                | order paid, GRN confirmed, stocktake finalized | Số tổng hợp           |
| Chứng từ         | Bằng chứng nào ghi nhận sự kiện?  | receipt, HĐĐT, supplier invoice, GRN           | Trạng thái thanh toán |
| Ledger           | Sổ append-only nào tạo sự thật?   | stock movements, payments, cash session logs   | Dashboard card        |
| Metric           | Số trả lời câu hỏi nào?           | doanh thu ròng, food cost %, cash variance     | Label chung chung     |
| Workflow         | Ai cần xử lý gì tiếp?             | HĐĐT lỗi, tiền mặt lệch, phiếu nhập chờ duyệt  | Kết quả tài chính     |
| Report           | Giải thích số bằng drilldown nào? | doanh thu theo giờ, top món, AP aging          | Action trực tiếp      |

Agent phải xác định lớp trước khi thiết kế. Không được tạo một card chỉ vì có
field trong database.

## F&B và bán hàng

### Đơn, món, khách

Định nghĩa đơn, dòng món, món bán, phiên bàn, ngữ cảnh mang về (`order`,
`order_item`, `menu_item`, `table_session`, `takeaway_context`...) nằm ở
`glossary.md`. Term riêng của file này:

| term_en    | label_vi     | Nghĩa chuẩn                                                   | Không lẫn với                   |
| ---------- | ------------ | ------------------------------------------------------------- | ------------------------------- |
| `modifier` | tùy chọn món | Lựa chọn thêm/bớt như thêm trứng, thêm sườn, đổi topping.     | side item nếu là dòng bán riêng |
| `combo`    | combo        | Nhóm món bán chung dưới một giá/khuyến mãi.                   | production recipe               |
| `cover`    | lượt khách   | Một khách được phục vụ; chỉ dùng nếu POS capture guest count. | order count                     |
| `party`    | nhóm khách   | Nhóm khách dùng một bàn/phiên.                                | table                           |

Quy tắc: nếu chưa capture `guest_count`, không được suy `covers` từ số đơn dine-in
một cách im lặng. Dùng `order_count` hoặc ghi rõ ước tính.

### Vòng đời POS/KDS

Định nghĩa các trạng thái lifecycle dùng chung (`kds_ticket`, `ready`, `served`,
`completed`, `void`, `refund`...) nằm ở `glossary.md`. Term riêng của file này:

| term_en           | label_vi        | Nghĩa chuẩn                                                | Không lẫn với |
| ----------------- | --------------- | ---------------------------------------------------------- | ------------- |
| `draft_order`     | đơn nháp        | Đơn đang tạo, chưa gửi bếp/confirm.                        | đơn đã bán    |
| `confirmed_order` | đơn đã xác nhận | Đơn đã ghi nhận để chế biến hoặc thanh toán theo workflow. | paid order    |
| `cancel_order`    | hủy đơn         | Hủy toàn đơn trước commercial close.                       | refund        |

Quy tắc: `served` là fulfillment signal. `completed` là commercial close. Không
dùng một label `Hoàn thành` cho cả hai nếu cùng surface có thể nhầm.

### Kênh bán và phương thức thanh toán

Định nghĩa kênh bán, phương thức thanh toán, phí và payout nền tảng
(`sales_channel`, `payment_method`, `platform_commission`, `net_payout`...) nằm ở
`glossary.md`. Term riêng của file này:

| term_en             | label_vi           | Nghĩa chuẩn                                          | Không lẫn với    |
| ------------------- | ------------------ | ---------------------------------------------------- | ---------------- |
| `delivery_platform` | nền tảng giao hàng | Đối tác giao hàng bên thứ ba nếu tích hợp.           | payment provider |
| `settlement`        | đối soát nhận tiền | Quá trình khớp order với tiền về ngân hàng/nền tảng. | payment split    |

Quy tắc: doanh thu kênh delivery không bằng tiền nền tảng thực chuyển. Phí nền
tảng là cost/fee cần hạch toán riêng.

## Doanh thu và metric bán hàng

### Revenue layers

Định nghĩa từng lớp doanh thu (`gross_sales`, `net_sales`, `net_sales_before_vat`,
`total_collected`, `issued_invoice_revenue`, `taxable_revenue`...) nằm ở
`glossary.md`. Phần dưới là quy tắc chọn lớp.

Mặc định cho báo cáo vận hành: `doanh thu` nghĩa là `doanh thu ròng trước VAT`
nếu đang tính margin. Nếu câu hỏi là tiền vào, dùng `tiền đã thu`. Nếu câu hỏi là
hóa đơn, dùng `doanh thu HĐĐT đã phát hành`.

### Bán hàng và hiệu suất

Định nghĩa các chỉ số volume/AOV/mix (`order_count`, `average_order_value`,
`average_check`, `covers`, `average_spend_per_cover`, `sales_mix`,
`product_mix`...) nằm ở `glossary.md`. Term riêng của file này:

| term_en           | label_vi         | Công thức mặc định                           | Dùng khi nào         |
| ----------------- | ---------------- | -------------------------------------------- | -------------------- |
| `conversion_rate` | tỷ lệ chuyển đổi | Orders / visits/leads nếu có traffic source. | Online/campaign only |

Không dùng AOV thay `average_spend_per_cover` nếu chưa capture covers.

## Giá vốn, tồn kho và sản xuất

### Cost vocabulary

Định nghĩa các loại giá vốn (`cost_of_goods_sold`, `food_cost`,
`theoretical_food_cost`, `actual_food_cost`, `food_cost_variance`,
`portion_cost`, `packaging_cost`, `waste_cost`...) nằm ở `glossary.md`.

Quy tắc: mua nguyên liệu không phải ngay lập tức là food cost. Food cost xuất
hiện khi nguyên liệu được tiêu hao, bán, sản xuất, hủy hỏng, hoặc điều chỉnh
theo contract.

### Inventory vocabulary

Định nghĩa tồn kho, WAC, par/reorder, turnover, và các trạng thái tồn
(`stock_level`, `inventory_value`, `weighted_average_cost`, `par_level`,
`reorder_point`, `safety_stock`, `stockout`, `overstock`, `dead_stock`,
`shrinkage`, `spoilage`...) nằm ở `glossary.md`.

### Procurement và chứng từ kho

Định nghĩa chứng từ và costing mua hàng (`purchase_order`, `goods_received_note`,
`supplier_invoice`, `supplier_payment`, `three_way_matching`, `landed_cost`,
`supplier_price_variance`...) nằm ở `glossary.md`.

Không dùng một từ `hóa đơn` cho cả HĐĐT bán ra và hóa đơn NCC. Luôn nói rõ loại.

### Bếp, sản xuất và tiêu hao

Định nghĩa công thức, lệnh sản xuất, yield, và các loại biến động tồn
(`recipe`, `production_recipe`, `production_order`, `yield`, `trim_loss`,
`cooking_loss`, `consumption`, `stock_transfer`, `stock_issue`...) nằm ở
`glossary.md`.

Runtime hiện chỉ có một Kho CN stock-bearing cho mỗi branch. Kho↔Bếp đã nghỉ;

`consumption`, sale-consumption và write-off hợp lệ mới làm giảm tồn vận hành.

## Tài chính vận hành

### Profit ladder

Định nghĩa và công thức từng bậc lợi nhuận (`gross_profit`, `gross_margin`,
`contribution_margin`, `prime_cost`, `operating_expense`, `operating_profit`,
`net_profit`, `net_margin`, `owner_draw`...) nằm ở `glossary.md`.

Finance Basic hiện không mặc định đưa `net_profit` thành KPI chính nếu chưa có
đủ food cost, labor, opex, other income/expense, tax, owner draw policy.

### Cash, AP, AR

Định nghĩa tiền mặt, đối soát, và công nợ (`cash_basis`, `accrual_basis`,
`cash_flow`, `cash_on_hand`, `expected_cash`, `counted_cash`, `cash_variance`,
`bank_reconciliation`, `accounts_receivable`, `accounts_payable`,
`receivable_aging`, `payable_aging`, `prepaid_expense`, `accrued_expense`...)
nằm ở `glossary.md`.

Profit không bằng cash flow. Một ngày có lãi gộp tốt vẫn có thể thiếu tiền nếu
AR tăng, AP đến hạn, hoặc tiền nền tảng chưa settlement.

## Menu engineering và vận hành bàn

Định nghĩa menu engineering, vòng quay bàn, và các chỉ số thời gian phục vụ
(`menu_engineering`, `item_popularity`, `item_contribution_margin`, `menu_price`,
`table_turnover`, `seat_occupancy`, `RevPASH`, `party_size`, `dwell_time`,
`ticket_time`, `prep_time`, `service_time`, `86_item`...) nằm ở `glossary.md`.

Chỉ dùng `doanh thu trên ghế-giờ` khi dine-in capacity là bottleneck và hệ thống
có số ghế/giờ mở cửa đủ tin cậy.

## Thuế, HĐĐT và doanh nghiệp

### Chủ thể và đăng ký thuế

Định nghĩa chủ thể và nghĩa vụ doanh nghiệp (`joint_stock_company`,
`legal_representative`, `beneficial_owner`, `taxable_revenue`, `vat_payable`,
`cit_payable`, `tax_withholding`, `enterprise_accounting_book`...) nằm ở
`glossary.md`. Term riêng của file này:

| term_en            | label_vi     | Nghĩa chuẩn                               | Không lẫn với      |
| ------------------ | ------------ | ----------------------------------------- | ------------------ |
| `tax_registration` | đăng ký thuế | Thông tin MST/tên/địa chỉ theo hồ sơ doanh nghiệp. | brand display name |

Tên thương hiệu không thay cho tên pháp lý. Application role `owner` không tự
đồng nghĩa với cổ đông, người đại diện theo pháp luật hoặc người quản lý doanh
nghiệp.

### HĐĐT và chứng từ bán ra

Định nghĩa HĐĐT và các trường chứng từ bán ra (`tax_invoice`,
`cash_register_invoice`, `cqt_code`, `invoice_series`, `invoice_number`,
`invoice_cancellation`, `invoice_replacement`, `customer_tax_info`...) nằm ở
`glossary.md`. Term riêng của file này:

| term_en          | label_vi           | Nghĩa chuẩn                                              | Không lẫn với |
| ---------------- | ------------------ | -------------------------------------------------------- | ------------- |
| `receipt`        | phiếu tạm tính     | Bản in POS cho khách; không có mã CQT.                   | HĐĐT          |
| `invoice_status` | trạng thái hóa đơn | Draft/submitted/issued/cancelled/replaced theo provider. | order status  |

Không hứa “hóa đơn đủ pháp lý” nếu chưa xác minh provider, mã CQT, XML/PDF gốc,
trạng thái phát hành, và dữ liệu truyền CQT.

### Phương pháp GTGT và kế toán doanh nghiệp

| Chủ đề      | Ranh giới hiện hành |
| ----------- | ------------------- |
| Chủ thể     | Công ty cổ phần là pháp nhân; Branch là phạm vi vận hành phụ thuộc. |
| Kế toán     | Chọn TT 99, TT 133 hoặc TT 58 theo điều kiện; Finance app chưa phải sổ cái/BCTC. |
| VAT đầu vào | Chỉ khấu trừ khi đúng phương pháp và đủ điều kiện chứng từ/thanh toán. |
| HĐĐT        | Theo NĐ 254/2026, TT 91/2026 và cấu hình provider đã đăng ký. |
| Báo cáo     | Daily close và dashboard vận hành tách khỏi P&L, balance sheet, general ledger và tax reports đã khóa sổ. |

Agent không được trình bày balance sheet, general ledger, input VAT credit hoặc
lợi nhuận sau thuế như số tin cậy nếu contract và dữ liệu kế toán chưa đầy đủ.

## Lao động, nhân sự và payroll

### Vai trò và quan hệ lao động

Định nghĩa hồ sơ nhân sự và quan hệ lao động cốt lõi (`employee`,
`employment_contract`, `employer`, `employee_party`...) nằm ở `glossary.md`.
Term riêng của file này:

| term_en               | label_vi                         | Nghĩa chuẩn                            | Không lẫn với      |
| --------------------- | -------------------------------- | -------------------------------------- | ------------------ |
| `position`            | chức vụ                          | Nhãn HR/công việc.                     | permission         |
| `permission_key`      | khóa quyền                       | Quyền thao tác trong hệ thống.         | position           |
| `probation`           | thử việc                         | Giai đoạn thử việc theo luật/contract. | seasonal           |
| `fixed_term_contract` | hợp đồng xác định thời hạn       | Hợp đồng có thời hạn.                  | indefinite         |
| `indefinite_contract` | hợp đồng không xác định thời hạn | Hợp đồng không có ngày kết thúc.       | fixed term         |
| `seasonal_contract`   | hợp đồng mùa vụ                  | Công việc/ngắn hạn nếu hợp lệ.         | part-time schedule |

Không dùng chức vụ để suy quyền nếu ACL đã có `permission_key`. Quyền thật nằm ở
grant/permission contract.

### Chấm công, lương, bảo hiểm, thuế lương

| term_en         | label_vi          | Nghĩa chuẩn                            | Không lẫn với       |
| --------------- | ----------------- | -------------------------------------- | ------------------- |
| `attendance`    | chấm công         | Ghi nhận làm việc.                     | payroll approval    |
| `shift`         | ca làm            | Khung giờ làm việc.                    | POS session         |
| `timesheet`     | bảng công         | Tổng hợp giờ/ngày công.                | payroll entry       |
| `standard_days` | ngày công chuẩn   | Số ngày chuẩn kỳ lương.                | actual working days |
| `working_days`  | ngày công thực tế | Số ngày công nhân viên làm.            | calendar days       |
| `overtime`      | làm thêm giờ      | Thời gian vượt chuẩn theo policy/luật. | shift extension     |

Định nghĩa lương, bảo hiểm, TNCN lương, và dòng lương (`gross_salary`,
`net_salary`, `insurance_base_salary`, `social_insurance`, `health_insurance`,
`unemployment_insurance`, `personal_income_tax_salary`, `payroll_period`,
`payroll_entry`...) nằm ở `glossary.md`.

Số luật về giảm trừ, biểu thuế, mức đóng, trần bảo hiểm phải lấy từ
`payroll-pit.md`, `labor-contracts.md`, và `legal-framework-2026.md`.

## Quy tắc xử lý cho Agent

### Khi gặp một số liệu mới

1. Xác định số đó thuộc lớp nào: sales, payment, invoice, tax, inventory, cost,
   labor, cash, AP/AR, workflow.
2. Tìm thuật ngữ trong `glossary.md` hoặc file này.
3. Nếu là card/KPI/report, tìm `contract_key` trong `operational-data-contract.md`.
4. Nếu chưa có contract, không tạo UI chính; ghi blocker hoặc supporting analysis.
5. Nếu source legacy dùng tên sai, map lại nghĩa; không đổi nghĩa thuật ngữ.

### Khi gặp một chứng từ

1. Phân loại: POS receipt, HĐĐT bán ra, supplier invoice, PO, GRN, stocktake,
   payroll document, labor contract.
2. Xác định chứng từ là bằng chứng cho workflow nào.
3. Không dùng một chứng từ làm proxy cho metric khác nếu thiếu mapping. Ví dụ:
   supplier invoice không tự động là food cost; receipt không phải HĐĐT.

### Khi gặp một workflow tài chính

1. Hỏi workflow trả lời điều gì: tiền đã thu, doanh thu ròng, hóa đơn, thuế,
   chi phí, công nợ, tồn kho, hay lãi.
2. Xác định scope: branch, tenant, POS session, date range, invoice period.
3. Xác định confidence: trusted, needs_review, estimated, blocked.
4. Nếu confidence không trusted, UI phải nói rõ hoặc đưa vào queue/exception.

### Khi gặp luật/thuế

1. Phân loại domain:
   - Thuế GTGT/TNDN/HĐĐT/chứng từ vào-ra dùng `einvoice-tax.md`.
   - TNCN lương/payroll/BHXH/BHYT/BHTN/HĐLĐ dùng `payroll-pit.md` và
     `labor-contracts.md`.
2. Đọc `legal-framework-2026.md` trước khi khẳng định bất kỳ căn cứ, mức, ngưỡng hoặc thời hạn pháp lý nào.
3. Với phép tính, dùng contract thực thi đã nêu trong doc chuyên đề; không chép lại công thức hay hardcode số từ trí nhớ.
4. Nếu nguồn pháp lý và code khác nhau, ghi mismatch; không tự hòa giải thầm.

## Nguồn khảo cứu bên ngoài

- NetSuite, restaurant metrics:
  <https://www.netsuite.com/portal/resource/articles/accounting/restaurant-financial-metrics.shtml>
- TouchBistro, restaurant metrics:
  <https://www.touchbistro.com/blog/21-restaurant-metrics-and-how-to-calculate-them/>
- MarginEdge, restaurant accounting:
  <https://www.marginedge.com/blog/restaurant-accounting-101>
- Apicbase, restaurant metrics:
  <https://get.apicbase.com/essential-restaurant-metrics/>
- FIXE, restaurant bookkeeping glossary:
  <https://www.getmyfixe.com/fixe-restaurant-bookkeeping-glossary/>
- BEP Back Owner control, restaurant glossary:
  <https://bepbackoffice.com/glossary/>
- Black Box Intelligence, COGS and RevPASH glossary:
  <https://blackboxintelligence.com/resources/restaurant-glossary/cost-of-goods-sold-cogs/>,
  <https://blackboxintelligence.com/resources/restaurant-glossary/revenue-per-available-seat-hour/>
- Chính phủ/Cơ quan thuế, doanh nghiệp và HĐĐT 2026:
  <https://vanban.chinhphu.vn/?classid=1&docid=214562&orggroupid=1&pageid=27160>,
  <https://vanban.chinhphu.vn/?classid=1&docid=218689&orggroupid=2&pageid=27160>,
  <https://congbao.chinhphu.vn/van-ban/thong-tu-so-99-2025-tt-btc-46529/59634.htm>

# Bách khoa nghiệp vụ F&B, tài chính, thuế và lao động

Tài liệu này là kho kiến thức nền để Agent hiểu và xử lý nghiệp vụ Cơm Tấm Má
Tư. Nó không phải UI copy, không phải backlog, không phải ghi chú phiên làm
việc. Khi cần định nghĩa nhãn/thuật ngữ ngắn, đọc `glossary.md`. Khi cần
contract cho card/KPI/report, đọc `operational-data-contract.md`. Khi cần số
luật hiện hành, đọc `legal-framework-2026.md`, `einvoice-tax.md`,
`payroll-pit.md`, và `labor-contracts.md`.

## Cách dùng

- Agent phải tự nắm các khái niệm phổ quát trong tài liệu này trước khi sửa
  Admin, Finance, Inventory, POS, KDS, HR, payroll, tax, hoặc report.
- Không hỏi owner định nghĩa thuật ngữ ngành phổ quát. Chỉ hỏi khi đó là policy
  riêng của Má Tư, cấu hình pháp lý, hoặc quyết định sản phẩm chưa có contract.
- UI không dùng label song ngữ. `term_en` dùng cho code/contract. `label_vi`
  dùng cho UI/docs vận hành. Acronym là biến thể riêng.
- Thuế, ngưỡng doanh thu, tỷ lệ, biểu thuế, và mẫu chứng từ là dữ liệu thay đổi.
  Không lấy số từ trí nhớ; kiểm tra doc pháp lý dự án trước khi code.

## Bản đồ tài liệu

| Cần làm | Đọc trước |
| --- | --- |
| Đặt tên thuật ngữ, nhãn UI, acronym | `glossary.md` |
| Thêm card/KPI/report summary | `operational-data-contract.md` |
| Sửa Finance landing hoặc report | `modules/finance.md`, file này |
| Sửa Inventory, kho, WAC, tiêu hao | `inventory.md`, file này |
| Sửa HĐĐT, VAT, doanh thu tính thuế | `einvoice-tax.md`, `legal-framework-2026.md`, file này |
| Sửa payroll, BHXH, PIT lương | `payroll-pit.md`, `labor-contracts.md`, file này |
| Sửa POS/KDS/table/order lifecycle | `glossary.md`, `modules/web-app.md`, regression rules |

## Nguyên tắc phân lớp dữ liệu

| Lớp | Câu hỏi | Ví dụ | Không lẫn với |
| --- | --- | --- | --- |
| Sự kiện vận hành | Đã xảy ra việc gì? | order paid, GRN confirmed, stocktake finalized | Số tổng hợp |
| Chứng từ | Bằng chứng nào ghi nhận sự kiện? | receipt, HĐĐT, supplier invoice, GRN | Trạng thái thanh toán |
| Ledger | Sổ append-only nào tạo sự thật? | stock movements, payments, cash session logs | Dashboard card |
| Metric | Số trả lời câu hỏi nào? | doanh thu ròng, food cost %, cash variance | Label chung chung |
| Workflow | Ai cần xử lý gì tiếp? | HĐĐT lỗi, tiền mặt lệch, phiếu nhập chờ duyệt | Kết quả tài chính |
| Report | Giải thích số bằng drilldown nào? | doanh thu theo giờ, top món, AP aging | Action trực tiếp |

Agent phải xác định lớp trước khi thiết kế. Không được tạo một card chỉ vì có
field trong database.

## F&B và bán hàng

### Đơn, món, khách

| term_en | label_vi | Nghĩa chuẩn | Không lẫn với |
| --- | --- | --- | --- |
| `order` | đơn hàng bán | Đơn phát sinh ở POS, gồm nhiều dòng món, payment, table/takeaway context. | `purchase_order` |
| `order_item` | dòng món | Một món trong đơn, có quantity, price, status, discount, void/refund logic. | menu item |
| `menu_item` | món bán | Món trong menu có giá, trạng thái bán, recipe/cost mapping nếu có. | raw material |
| `modifier` | tùy chọn món | Lựa chọn thêm/bớt như thêm trứng, thêm sườn, đổi topping. | side item nếu là dòng bán riêng |
| `combo` | combo | Nhóm món bán chung dưới một giá/khuyến mãi. | production recipe |
| `cover` | lượt khách | Một khách được phục vụ; chỉ dùng nếu POS capture guest count. | order count |
| `party` | nhóm khách | Nhóm khách dùng một bàn/phiên. | table |
| `table_session` | phiên bàn | Vòng đời một lượt dùng bàn. | physical table |
| `takeaway_context` | ngữ cảnh mang về | Context bán mang về có thể có nhiều đơn mở như bàn. | đơn nhanh không cần chọn |

Quy tắc: nếu chưa capture `guest_count`, không được suy `covers` từ số đơn dine-in
một cách im lặng. Dùng `order_count` hoặc ghi rõ ước tính.

### Vòng đời POS/KDS

| term_en | label_vi | Nghĩa chuẩn | Không lẫn với |
| --- | --- | --- | --- |
| `draft_order` | đơn nháp | Đơn đang tạo, chưa gửi bếp/confirm. | đơn đã bán |
| `confirmed_order` | đơn đã xác nhận | Đơn đã ghi nhận để chế biến hoặc thanh toán theo workflow. | paid order |
| `kds_ticket` | phiếu bếp | Signal cho bếp chế biến. | tax invoice |
| `ready` | sẵn sàng | Bếp đã làm xong món/phiếu. | completed |
| `served` | đã phục vụ | Món đã lên bàn/trao khách. | paid/completed |
| `completed` | hoàn thành POS | Đơn đã thanh toán/đóng thương mại. | bếp xong |
| `void` | hủy trước thanh toán | Hủy dòng món trước khi đơn paid. | refund |
| `refund` | hoàn tiền | Trả tiền sau khi đã paid/completed. | void |
| `cancel_order` | hủy đơn | Hủy toàn đơn trước commercial close. | refund |

Quy tắc: `served` là fulfillment signal. `completed` là commercial close. Không
dùng một label `Hoàn thành` cho cả hai nếu cùng surface có thể nhầm.

### Kênh bán và phương thức thanh toán

| term_en | label_vi | Nghĩa chuẩn | Không lẫn với |
| --- | --- | --- | --- |
| `sales_channel` | kênh bán | Nơi phát sinh nhu cầu: tại bàn, mang về, delivery, nền tảng. | payment method |
| `payment_method` | phương thức thanh toán | Cách nhận tiền: tiền mặt, chuyển khoản, VietQR, MoMo. | sales channel |
| `delivery_platform` | nền tảng giao hàng | Đối tác giao hàng bên thứ ba nếu tích hợp. | payment provider |
| `platform_commission` | phí nền tảng | Phí nền tảng giữ lại hoặc xuất hóa đơn dịch vụ. | discount |
| `net_payout` | tiền nền tảng thực chuyển | Tiền về tài khoản sau khấu trừ/đối soát. | doanh thu ròng |
| `settlement` | đối soát nhận tiền | Quá trình khớp order với tiền về ngân hàng/nền tảng. | payment split |

Quy tắc: doanh thu kênh delivery không bằng tiền nền tảng thực chuyển. Phí nền
tảng là cost/fee cần hạch toán riêng.

## Doanh thu và metric bán hàng

### Revenue layers

| term_en | label_vi | Công thức mặc định | Không lẫn với |
| --- | --- | --- | --- |
| `gross_sales` | tổng giá bán trước giảm giá | Tổng giá menu/list trước giảm giá, refund, VAT. | tiền đã thu |
| `discount_amount` | giảm giá | Tổng khoản giảm thương mại. | waste |
| `refund_amount` | hoàn tiền | Tổng tiền trả lại sau paid. | void |
| `net_sales` | doanh thu ròng | `gross_sales - discounts - refunds`; trước VAT khi dùng cho margin. | total collected |
| `net_sales_before_vat` | doanh thu ròng trước VAT | Doanh thu ròng đã tách VAT; mẫu số cho margin. | doanh thu tính thuế |
| `total_collected` | tiền đã thu | Tổng tiền payment hoàn tất, có thể gồm VAT. | net sales |
| `issued_invoice_revenue` | doanh thu HĐĐT đã phát hành | Tổng giá trị HĐĐT trạng thái đã phát hành. | POS revenue |
| `taxable_revenue` | doanh thu tính thuế | Doanh thu làm căn cứ thuế theo phương pháp HKD. | doanh thu ròng dùng quản trị |

Mặc định cho báo cáo vận hành: `doanh thu` nghĩa là `doanh thu ròng trước VAT`
nếu đang tính margin. Nếu câu hỏi là tiền vào, dùng `tiền đã thu`. Nếu câu hỏi là
hóa đơn, dùng `doanh thu HĐĐT đã phát hành`.

### Bán hàng và hiệu suất

| term_en | label_vi | Công thức mặc định | Dùng khi nào |
| --- | --- | --- | --- |
| `order_count` | số đơn | Count paid/completed orders theo period. | Theo dõi volume bán |
| `average_order_value` | giá trị trung bình mỗi đơn | `net_sales / order_count`. | POS/takeaway/delivery |
| `average_check` | hóa đơn trung bình | `net_sales / check_count`. | Khi check khác order |
| `covers` | lượt khách | Sum guest count. | Dine-in có capture khách |
| `average_spend_per_cover` | chi tiêu trung bình mỗi khách | `net_sales / covers`. | Dine-in analysis |
| `sales_mix` | cơ cấu doanh thu | Revenue share theo món/nhóm/kênh. | Menu và channel |
| `product_mix` | cơ cấu món bán | Quantity/revenue share theo món. | Menu engineering |
| `conversion_rate` | tỷ lệ chuyển đổi | Orders / visits/leads nếu có traffic source. | Online/campaign only |

Không dùng AOV thay `average_spend_per_cover` nếu chưa capture covers.

## Giá vốn, tồn kho và sản xuất

### Cost vocabulary

| term_en | label_vi | Nghĩa chuẩn | Không lẫn với |
| --- | --- | --- | --- |
| `cost_of_goods_sold` | giá vốn hàng bán | Direct cost của hàng/món đã bán. | purchase spend |
| `food_cost` | giá vốn món | Cost nguyên liệu/bao bì trực tiếp gắn món bán/tiêu hao bếp. | chi vận hành |
| `theoretical_food_cost` | giá vốn định mức | Cost theo recipe x sales mix. | actual food cost |
| `actual_food_cost` | giá vốn thực tế | Cost từ stock ledger/tiêu hao/kiểm kê. | recipe estimate |
| `food_cost_variance` | chênh lệch giá vốn | `actual_food_cost - theoretical_food_cost`. | stocktake variance |
| `food_cost_percentage` | tỷ lệ giá vốn món | `food_cost / net_sales_before_vat`. | gross margin |
| `portion_cost` | giá vốn khẩu phần | Cost của một phần/món theo recipe/yield. | menu price |
| `packaging_cost` | chi phí bao bì trực tiếp | Bao bì đi cùng món bán, nhất là takeaway/delivery. | office supplies |
| `waste_cost` | giá trị hao hụt | Cost nguyên liệu/món bỏ đi, hỏng, quá hạn, sai quy trình. | discount |

Quy tắc: mua nguyên liệu không phải ngay lập tức là food cost. Food cost xuất
hiện khi nguyên liệu được tiêu hao, bán, sản xuất, hủy hỏng, hoặc điều chỉnh
theo contract.

### Inventory vocabulary

| term_en | label_vi | Nghĩa chuẩn | Không lẫn với |
| --- | --- | --- | --- |
| `stock_level` | tồn kho | Quantity và cost tại location. | purchase order |
| `inventory_value` | giá trị tồn kho | `quantity * unit_cost`. | profit |
| `weighted_average_cost` | giá vốn bình quân gia quyền | Cost bình quân cập nhật theo nhập/xuất. | selling price |
| `beginning_inventory` | tồn đầu kỳ | Tồn tại đầu period. | opening cash |
| `ending_inventory` | tồn cuối kỳ | Tồn cuối period. | closing cash |
| `inventory_turnover` | vòng quay tồn kho | `COGS / average_inventory_value`. | table turnover |
| `days_inventory_on_hand` | số ngày tồn kho | Average inventory / daily COGS. | shelf life |
| `par_level` | mức tồn chuẩn | Mức tồn mục tiêu để vận hành. | reorder point |
| `reorder_point` | điểm đặt hàng | Ngưỡng kích hoạt mua hàng. | par level |
| `safety_stock` | tồn an toàn | Tồn đệm cho biến động nhu cầu/lead time. | overstock |
| `stockout` | hết hàng | Không đủ tồn để bán/sản xuất. | low stock |
| `overstock` | dư tồn | Tồn vượt nhu cầu, làm kẹt tiền/hư hỏng. | inventory healthy |
| `dead_stock` | tồn chết | Hàng tồn lâu/khó dùng/khó bán. | safety stock |
| `shrinkage` | hao hụt không giải thích | Mất mát chưa phân loại. | waste đã ghi nhận |
| `spoilage` | hư hỏng | Hàng hỏng/quá hạn. | discount |

### Procurement và chứng từ kho

| term_en | label_vi | Nghĩa chuẩn | Không lẫn với |
| --- | --- | --- | --- |
| `purchase_order` | đơn đặt hàng NCC | Ý định mua gửi NCC. | order bán |
| `goods_received_note` | phiếu nhập kho | Hàng thực nhận, cập nhật tồn/WAC khi confirmed. | supplier invoice |
| `supplier_invoice` | hóa đơn NCC | Chứng từ NCC phát hành để đòi tiền/ghi chi phí. | GRN |
| `supplier_payment` | thanh toán NCC | Tiền trả NCC. | food cost |
| `three_way_matching` | đối soát 3 chứng từ | Khớp PO, GRN, supplier invoice. | payment reconciliation |
| `landed_cost` | giá nhập đủ chi phí | Unit cost gồm chi phí đưa hàng vào kho nếu policy tính. | unit price |
| `supplier_price_variance` | chênh giá NCC | Giá mua lệch so với chuẩn/lần trước/contract. | food cost variance |

Không dùng một từ `hóa đơn` cho cả HĐĐT bán ra và hóa đơn NCC. Luôn nói rõ loại.

### Bếp, sản xuất và tiêu hao

| term_en | label_vi | Nghĩa chuẩn | Không lẫn với |
| --- | --- | --- | --- |
| `recipe` | công thức món | Định mức nguyên liệu cho một món bán. | production recipe |
| `production_recipe` | công thức sản xuất | BOM cho thành phẩm/bán thành phẩm. | menu recipe |
| `production_order` | lệnh sản xuất | Lệnh nấu/sản xuất thành phẩm. | order bán |
| `yield` | tỷ lệ thu hồi | Tỷ lệ usable sau sơ chế/chế biến. | portion size |
| `trim_loss` | hao hụt sơ chế | Hao hụt khi cắt/làm sạch. | cooking loss |
| `cooking_loss` | hao hụt nấu nướng | Hao hụt khi nấu. | trim loss |
| `consumption` | tiêu hao | Trừ tồn vì bán hàng/sản xuất/hủy hỏng/sử dụng. | transfer |
| `stock_transfer` | điều chuyển nội bộ | Hàng vẫn còn tồn, chỉ đổi location/site. | consumption |
| `stock_issue` | phiếu xuất kho | Xuất dùng nội bộ nếu runtime có chứng từ issue. | transfer có location nhận |

Với runtime hiện tại, `Kho CN -> Bếp CN` là intra-branch stock transfer khi có
phiếu cấp bếp thật. Khi xử lý dữ liệu lịch sử/import, phân loại theo nghĩa vận
hành: hàng còn tồn ở bếp hay thực chất là tiêu hao/food cost.

## Tài chính vận hành

### Profit ladder

| term_en | label_vi | Công thức mặc định | Không lẫn với |
| --- | --- | --- | --- |
| `gross_profit` | lãi gộp | `net_sales_before_vat - food_cost`. | net profit |
| `gross_margin` | biên gộp | `gross_profit / net_sales_before_vat`. | food cost % |
| `contribution_margin` | lãi đóng góp | Net item/channel sales - variable cost. | gross profit toàn cửa hàng |
| `labor_cost` | chi phí nhân công | Payroll/labor cost trong kỳ. | PIT owner |
| `labor_cost_percentage` | tỷ lệ chi phí nhân công | `labor_cost / net_sales`. | prime cost ratio |
| `prime_cost` | chi phí chính | `food_cost + labor_cost`. | opex |
| `prime_cost_ratio` | tỷ lệ chi phí chính | `prime_cost / net_sales`. | gross margin |
| `operating_expense` | chi vận hành | Rent, utilities, software, repair, marketing, payment fee. | COGS |
| `operating_profit` | lợi nhuận vận hành | Revenue - COGS - labor - opex trong scope. | net income pháp lý |
| `net_profit` | lợi nhuận ròng | Bottom-line sau toàn bộ chi phí đã định nghĩa. | gross profit |
| `net_margin` | biên ròng | `net_profit / revenue`. | gross margin |
| `owner_draw` | chủ rút tiền | Tiền chủ rút khỏi hoạt động. | operating expense |

Finance Basic hiện không mặc định đưa `net_profit` thành KPI chính nếu chưa có
đủ food cost, labor, opex, other income/expense, tax, owner draw policy.

### Cash, AP, AR

| term_en | label_vi | Nghĩa chuẩn | Không lẫn với |
| --- | --- | --- | --- |
| `cash_basis` | ghi nhận theo tiền | Ghi doanh thu/chi phí khi tiền vào/ra. | accrual basis |
| `accrual_basis` | ghi nhận dồn tích | Ghi khi earned/incurred dù chưa thu/chi tiền. | cash basis |
| `cash_flow` | dòng tiền | Tiền vào/ra theo thời gian. | profit |
| `cash_on_hand` | tiền mặt hiện hữu | Tiền thật trong két/quỹ. | cash collected |
| `expected_cash` | tiền mặt kỳ vọng | Opening cash + cash payments - refunds/payouts. | counted cash |
| `counted_cash` | tiền mặt kiểm đếm | Tiền đếm thực tế. | expected cash |
| `cash_variance` | chênh lệch tiền mặt | `counted_cash - expected_cash`. | profit/loss |
| `bank_reconciliation` | đối soát ngân hàng | Khớp payment/settlement với sao kê. | payment split |
| `accounts_receivable` | phải thu | Tiền khách/nền tảng/đối tác còn nợ. | revenue |
| `accounts_payable` | phải trả | Tiền còn nợ NCC/đối tác. | purchase spend |
| `receivable_aging` | tuổi nợ phải thu | Phân nhóm khoản phải thu theo số ngày chưa thu. | daily sales |
| `payable_aging` | tuổi nợ phải trả | Phân nhóm khoản phải trả theo số ngày chưa trả. | expense by date |
| `prepaid_expense` | chi phí trả trước | Tiền đã trả nhưng phục vụ nhiều kỳ. | current opex |
| `accrued_expense` | chi phí dồn tích | Chi phí đã phát sinh nhưng chưa trả. | supplier invoice đã nhận |

Profit không bằng cash flow. Một ngày có lãi gộp tốt vẫn có thể thiếu tiền nếu
AR tăng, AP đến hạn, hoặc tiền nền tảng chưa settlement.

## Menu engineering và vận hành bàn

| term_en | label_vi | Nghĩa chuẩn | Không lẫn với |
| --- | --- | --- | --- |
| `menu_engineering` | phân tích menu | Phân loại món theo popularity và contribution margin. | top sales đơn thuần |
| `item_popularity` | độ phổ biến món | Tỷ trọng số lượng bán của món. | profitability |
| `item_contribution_margin` | lãi đóng góp theo món | Net item sales - variable cost. | gross profit toàn cửa hàng |
| `menu_price` | giá bán menu | Giá niêm yết trước discount/VAT policy. | net sales |
| `table_turnover` | vòng quay bàn | Số lượt party/khách mỗi bàn trong kỳ. | inventory turnover |
| `seat_occupancy` | tỷ lệ lấp đầy chỗ ngồi | Seat-hours used / seat-hours available. | table turnover |
| `revenue_per_available_seat_hour` | doanh thu trên ghế-giờ | Revenue / available seat-hours. | AOV |
| `party_size` | quy mô nhóm khách | Số khách trong một party. | covers cả ngày |
| `dwell_time` | thời gian ngồi bàn | Thời gian khách chiếm bàn. | prep time |
| `ticket_time` | thời gian xử lý phiếu | Từ gửi bếp đến ready/served. | dwell time |
| `prep_time` | thời gian chế biến | Thời gian bếp làm món. | service time |
| `service_time` | thời gian phục vụ | Tùy contract: order-to-served hoặc ready-to-served. | prep time |
| `item_unavailable` | món tạm hết | Món không bán được do hết hàng/sản xuất. | menu deactivated |

Chỉ dùng `doanh thu trên ghế-giờ` khi dine-in capacity là bottleneck và hệ thống
có số ghế/giờ mở cửa đủ tin cậy.

## Thuế, HĐĐT và HKD

### HKD hiện hành

| term_en | label_vi | Nghĩa chuẩn | Không lẫn với |
| --- | --- | --- | --- |
| `household_business` | hộ kinh doanh | Mô hình hiện hành của Má Tư; không phải công ty. | enterprise/company |
| `registered_owner` | chủ hộ kinh doanh | Người đại diện đăng ký HKD. | legal representative of company |
| `tax_registration` | đăng ký thuế | Thông tin MST/tên/địa chỉ theo hồ sơ HKD. | brand display name |
| `taxable_revenue` | doanh thu tính thuế | Doanh thu làm căn cứ kê khai/nộp thuế. | net sales for margin |
| `vat_payable` | GTGT phải nộp | Nghĩa vụ GTGT theo phương pháp áp dụng. | output VAT display |
| `pit_business_payable` | TNCN kinh doanh phải nộp | Thuế TNCN từ hoạt động HKD. | PIT payroll |
| `tax_withholding` | khấu trừ thuế | Thuế bị khấu trừ/nộp thay bởi nền tảng/đối tác nếu có. | platform commission |
| `hkd_accounting_book` | sổ kế toán HKD | Sổ doanh thu, thu chi, mua hàng, tồn kho theo regime HKD. | BCTC doanh nghiệp |

Không gọi Má Tư là CTCP/công ty/doanh nghiệp trong UI hoặc docs vận hành hiện
hành. Nếu cần nói mô hình doanh nghiệp, phải nói đó là comparison hoặc future
conversion, không phải trạng thái hiện tại.

### HĐĐT và chứng từ bán ra

| term_en | label_vi | Nghĩa chuẩn | Không lẫn với |
| --- | --- | --- | --- |
| `receipt` | phiếu tạm tính | Bản in POS cho khách; không có mã CQT. | HĐĐT |
| `tax_invoice` | hóa đơn điện tử bán ra | Chứng từ điện tử bán ra theo luật/provider. | supplier invoice |
| `cash_register_invoice` | HĐĐT từ máy tính tiền | HĐĐT khởi tạo từ máy tính tiền kết nối dữ liệu CQT. | receipt |
| `invoice_status` | trạng thái hóa đơn | Draft/submitted/issued/cancelled/replaced theo provider. | order status |
| `cqt_code` | mã CQT | Mã xác thực hóa đơn. | invoice number |
| `invoice_series` | ký hiệu hóa đơn | Series/ký hiệu hóa đơn. | invoice number |
| `invoice_number` | số hóa đơn | Số hóa đơn. | CQT code |
| `invoice_cancellation` | hủy HĐĐT | Hủy hóa đơn theo quy trình pháp lý/provider. | refund |
| `invoice_replacement` | thay thế HĐĐT | Lập hóa đơn thay thế cho hóa đơn sai. | edit receipt |
| `customer_tax_info` | thông tin người mua lấy HĐ | MST/tên/địa chỉ người mua khi yêu cầu hóa đơn. | thông tin khách lẻ bắt buộc |

Không hứa “hóa đơn đủ pháp lý” nếu chưa xác minh provider, mã CQT, XML/PDF gốc,
trạng thái phát hành, và dữ liệu truyền CQT.

### HKD trực tiếp và doanh nghiệp khấu trừ

| Chủ đề | HKD hiện hành | Doanh nghiệp/phương pháp khác |
| --- | --- | --- |
| Chủ thể | Hộ kinh doanh/chủ hộ | Công ty/pháp nhân |
| Kế toán | Sổ HKD, vận hành đơn giản, export theo regime HKD | Có thể cần double-entry, BCTC, VAS/TT200 |
| VAT đầu vào | Không mặc định khấu trừ nếu đang theo phương pháp trực tiếp | Có thể khấu trừ nếu đủ điều kiện và đăng ký |
| HĐĐT | Theo ngưỡng/phương pháp HKD và provider | Theo chế độ doanh nghiệp |
| Báo cáo | Daily close, cash, revenue, expense, inventory, HĐĐT, export kế toán | P&L, balance sheet, general ledger, tax reports đầy đủ |

Agent không được tự thêm balance sheet, general ledger, input VAT credit, VAS
reporting vào Finance Basic khi business model vẫn là HKD.

## Lao động, nhân sự và payroll

### Vai trò và quan hệ lao động

| term_en | label_vi | Nghĩa chuẩn | Không lẫn với |
| --- | --- | --- | --- |
| `employee` | nhân viên | Hồ sơ nhân sự trong hệ thống. | app user |
| `position` | chức vụ | Nhãn HR/công việc. | permission |
| `permission_key` | khóa quyền | Quyền thao tác trong hệ thống. | position |
| `employment_contract` | hợp đồng lao động | HĐLĐ và dữ liệu lương/bảo hiểm. | role template |
| `employer` | người sử dụng lao động | Phía HKD/chủ hộ thuê lao động. | company nếu nói HKD |
| `employee_party` | người lao động | Phía nhân viên trong HĐLĐ. | app user |
| `probation` | thử việc | Giai đoạn thử việc theo luật/contract. | seasonal |
| `fixed_term_contract` | hợp đồng xác định thời hạn | Hợp đồng có thời hạn. | indefinite |
| `indefinite_contract` | hợp đồng không xác định thời hạn | Hợp đồng không có ngày kết thúc. | fixed term |
| `seasonal_contract` | hợp đồng mùa vụ | Công việc/ngắn hạn nếu hợp lệ. | part-time schedule |

Không dùng chức vụ để suy quyền nếu ACL đã có `permission_key`. Quyền thật nằm ở
grant/permission contract.

### Chấm công, lương, bảo hiểm, thuế lương

| term_en | label_vi | Nghĩa chuẩn | Không lẫn với |
| --- | --- | --- | --- |
| `attendance` | chấm công | Ghi nhận làm việc. | payroll approval |
| `shift` | ca làm | Khung giờ làm việc. | POS session |
| `timesheet` | bảng công | Tổng hợp giờ/ngày công. | payroll entry |
| `standard_days` | ngày công chuẩn | Số ngày chuẩn kỳ lương. | actual working days |
| `working_days` | ngày công thực tế | Số ngày công nhân viên làm. | calendar days |
| `overtime` | làm thêm giờ | Thời gian vượt chuẩn theo policy/luật. | shift extension |
| `gross_salary` | lương gộp | Lương trước bảo hiểm/thuế/khấu trừ. | net salary |
| `net_salary` | lương thực lĩnh | Tiền nhân viên nhận sau khấu trừ/phụ cấp. | gross salary |
| `insurance_base_salary` | mức lương đóng bảo hiểm | Căn cứ đóng BH theo HĐ/luật. | gross salary |
| `social_insurance` | bảo hiểm xã hội | Một loại bảo hiểm. | health/unemployment insurance |
| `health_insurance` | bảo hiểm y tế | Một loại bảo hiểm. | social insurance |
| `unemployment_insurance` | bảo hiểm thất nghiệp | Một loại bảo hiểm. | social insurance |
| `personal_income_tax_salary` | TNCN tiền lương | Thuế TNCN khấu trừ từ lương nhân viên. | TNCN kinh doanh HKD |
| `payroll_period` | kỳ lương | Tháng/kỳ tính lương. | tax declared period |
| `payroll_entry` | dòng lương | Một nhân viên x một kỳ lương. | payslip file |

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

1. Đọc `legal-framework-2026.md` trước.
2. Đọc doc chuyên đề: `einvoice-tax.md`, `payroll-pit.md`, `labor-contracts.md`.
3. Không lấy tỷ lệ/ngưỡng từ trí nhớ hoặc nguồn blog nếu doc dự án đã có SSoT.
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
- BEP Back Office, restaurant glossary:
  <https://bepbackoffice.com/glossary/>
- Black Box Intelligence, COGS and RevPASH glossary:
  <https://blackboxintelligence.com/resources/restaurant-glossary/cost-of-goods-sold-cogs/>,
  <https://blackboxintelligence.com/resources/restaurant-glossary/revenue-per-available-seat-hour/>
- Chính phủ/Cơ quan thuế, HKD/HĐĐT 2026:
  <https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/4/141-ndcp.signed.pdf>,
  <https://xaydungchinhsach.chinhphu.vn/mot-so-noi-dung-moi-cua-nghi-dinh-so-70-2025-nd-cp-ve-hoa-don-chung-tu-119250403074719995.htm>,
  <https://vanban.chinhphu.vn/?docid=216533&pageid=27160>

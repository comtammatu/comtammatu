# Glossary

Nguồn chuẩn duy nhất cho ngôn ngữ dự án, thuật ngữ nghiệp vụ, và quy tắc đặt
tên của Cơm Tấm Má Tư.

Glossary này không thay thế module doc hoặc metric contract. Nó khóa nghĩa,
nhãn, ranh giới, và các cặp thuật ngữ không được lẫn. Công thức card/KPI cụ thể
phải nằm ở `docs/ref/operational-data-contract.md` hoặc module doc tương ứng.
Kiến thức nền chi tiết cho Agent nằm ở `docs/ref/domain-encyclopedia.md`.

## Mục tiêu

- Thống nhất cách gọi giữa business, architecture, specs, UI copy, và code.
- Ngăn Agent tự chế `Card`, `Title`, `KPI`, hoặc feature mới bằng thuật ngữ mơ hồ.
- Làm rõ thuật ngữ F&B, tài chính vận hành, HĐĐT, thuế HKD, kho, POS, và HR.
- Khóa cách hiểu của số liệu: số đó là gì, không phải gì, lấy từ đâu, và khi nào
  được xem là số tin cậy.

## Quy tắc đọc

- Nếu có xung đột giữa glossary này với docs cũ về nghĩa/nhãn, glossary này
  thắng.
- Business rules chi tiết vẫn nằm ở `docs/ref/*`; glossary chỉ chốt meaning và
  naming.
- Metric/card/title có số liệu phải map sang `contract_key` trong
  `docs/ref/operational-data-contract.md` hoặc module doc tương ứng.
- Trong UI có thể dùng label ngắn, nhưng code, schema, type, enum, RPC, file
  path, và contract key phải ưu tiên canonical English term.
- Khi cần thêm thuật ngữ mới cho feature mới, cập nhật glossary này trước hoặc
  cùng PR với feature.

## Nguyên tắc kiến thức nền cho Agent

Agent phải tự nắm nghĩa chuẩn của thuật ngữ phổ quát trong F&B/Finance trước khi
thiết kế UI, schema, report, hoặc card. Không hỏi owner để định nghĩa các khái
niệm ngành như `doanh thu ròng`, `giá vốn`, `lợi nhuận gộp`, `prime cost`,
`cash variance`, `vòng quay tồn kho`, `AP`, `AR`, `actual vs theoretical food
cost`, `AOV`, `covers`, `table turnover`, `RevPASH`.

Chỉ được hỏi owner hoặc kế toán khi câu hỏi là policy riêng của Má Tư hoặc cấu
hình pháp lý/chứng từ chưa có trong contract, ví dụ:

- phương pháp thuế/HĐĐT đã đăng ký với CQT/provider;
- tài khoản/khoản mục chi phí mà kế toán muốn map cho export;
- ngưỡng vận hành nội bộ như par level, reorder point, target food cost theo món;
- một KPI chưa nằm trong `operational-data-contract.md` có được đưa lên UI chính
  hay chỉ là supporting analysis.

Nếu thuật ngữ đã có nghĩa ngành ổn định, agent phải dùng nghĩa chuẩn rồi map dữ
liệu legacy vào đúng bucket. Không đổi nghĩa thuật ngữ để khớp một field cũ.

## Nguồn khảo cứu 2026-06-19

Glossary này tổng hợp từ tài liệu dự án và nguồn thị trường/chuyên ngành:

- Dự án: `docs/ref/operational-data-contract.md`, `docs/modules/finance.md`,
  `docs/ref/domain-encyclopedia.md`, `docs/ref/inventory.md`,
  `docs/ref/einvoice-tax.md`, `docs/ref/legal-framework-2026.md`,
  `docs/ref/business-context.md`.
- F&B/restaurant finance: NetSuite restaurant financial metrics,
  Restaurant365 prime cost, Toast sales/cash drawer docs, Black Box Intelligence,
  TouchBistro metrics, MarginEdge restaurant accounting, Apicbase restaurant
  metrics, FIXE bookkeeping glossary, BEP back-office glossary, meez
  actual-vs-theoretical food cost, BuyersEdge, Epos Now.
- HKD/thuế/HĐĐT: Cổng thông tin Chính phủ, Tổng cục Thuế/Cục Thuế địa phương,
  NĐ 68/2026, NĐ 141/2026, Luật QLT 108/2025, NĐ 252/2026, NĐ 254/2026,
  NĐ 253/2026, TT 87/2026, TT 152/2025, TT 32/2025.

Luật, thuế suất, ngưỡng doanh thu, và biểu thuế là dữ liệu dễ thay đổi. Glossary
chỉ khóa thuật ngữ; số luật cụ thể phải lấy từ `legal-framework-2026.md` và
`einvoice-tax.md` tại thời điểm triển khai.

## Documentation language convention

| Lớp                                   | Ngôn ngữ chuẩn      | Quy ước                                                                                          |
| ------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------ |
| Internal operator UI                  | Vietnamese          | Use approved Vietnamese labels or standalone acronyms; do not use bilingual labels              |
| Business/reference docs               | English             | Keep Vietnamese legal, product, UI, and `label_vi` values verbatim; do not mix explanatory prose |
| Code, DB schema, type, RPC, file path | English             | Do not create Vietnamese or unaccented Vietnamese identifiers                              |
| Technical comments                    | English             | State only non-obvious constraints; do not record change history                               |

Persisted identifiers include table/column/function/RPC names, enum values,
permission keys, position codes, role-template names, feature-flag keys, URL
query tokens, payload fields, and storage bucket/object contracts. These
identifiers use English `lower_snake_case` or ASCII route slugs. Vietnamese is
limited to labels, copy, and user data such as `label_vi`, seeded branch names,
menu item names, or printed/displayed content.

## Quy ước chính tả tiếng Việt

Dự án dùng quy tắc chính tả mới: dấu thanh đặt trên nguyên âm chính, không trên
nguyên âm phụ.

| Dùng chuẩn                           | Không dùng                           |
| ------------------------------------ | ------------------------------------ |
| `hóa đơn`, `chuẩn hóa`, `tối ưu hóa` | `hoá đơn`, `chuẩn hoá`, `tối ưu hoá` |
| `thỏa thuận`, `thỏa mãn`             | `thoả thuận`, `thoả mãn`             |
| `hòa giải`, `hòa đồng`               | `hoà giải`, `hoà đồng`               |
| `lóa mắt`, `tỏa sáng`, `xòa`         | `loá mắt`, `toả sáng`, `xoà`         |

Ngoại lệ: URL, tên file legacy, trích dẫn nguyên văn từ nguồn bên ngoài.

## Tách lớp tiếng Anh và tiếng Việt

`canonical_term` là thuật ngữ tiếng Anh dùng cho code, contract, schema, enum,
RPC, test, và tài liệu kỹ thuật. `label_vi` là nhãn tiếng Việt dùng cho UI và
tài liệu vận hành. `acronym` là biến thể hiển thị riêng, chỉ dùng khi đã được
duyệt.

Không dùng label lai trong UI hoặc copy vận hành:

- Không viết `Doanh thu ròng (Net sales)`, `Hóa đơn điện tử / e-invoice`,
  `Phiếu nhập kho (GRN)`, `Food cost cảnh báo`.
- Không nối tiếng Việt và tiếng Anh bằng `/`, `·`, ngoặc đơn, hoặc dấu gạch nối
  để tạo một label.
- Nếu cần giải thích trong docs, đặt thuật ngữ ở cột riêng:
  `canonical_term = net_sales_before_vat`, `label_vi = doanh thu thuần`.
- Nếu UI cần cực ngắn, dùng một trong hai: nhãn tiếng Việt ngắn hoặc acronym
  đứng riêng, ví dụ `Phiếu nhập` hoặc `GRN`, không dùng `Phiếu nhập (GRN)`.

## Whitelist English được giữ lại

Chỉ giữ English trong một trong các nhóm sau:

- Acronym hoặc thuật ngữ chuyên ngành đã chốt: `POS`, `KDS`, `Owner surface`, `tenant`, `ERP`,
  `PO`, `GRN`, `WAC`, `PIT`, `AOV`, `COGS`.
- Tên công nghệ, framework, hoặc vendor: `Supabase`, `Next.js`, `React`,
  `Tailwind`, `TypeScript`, `VietQR`, `Viettel S-invoice`.
- Proper noun, code identifier, route, schema, enum, RPC, payload field, HTTP
  verb, env var.
- Cột `canonical_term`, command, code sample, hoặc nguồn nghiên cứu trong docs.

Nếu không thuộc một trong các nhóm trên thì mặc định phải ưu tiên tiếng Việt.
`ERP` chỉ dùng khi nói về kiến trúc, bộ tham chiếu, hoặc so sánh phạm vi; entrypoint
và docs sản phẩm dùng `bộ phần mềm quản lý vận hành và bán hàng`.

## Denylist drift không được tái đưa vào copy

| Drift term                                       | Dùng thay                                                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `Employee Portal`                                | `Trang nhân viên`                                                                                |
| `Owner Shell`                                    | `Khung quản trị` hoặc `nền tảng quản trị` tùy ngữ cảnh                                           |
| `Dashboard` đứng riêng                           | `Tổng quan` hoặc `buồng lái` tùy ngữ cảnh; `Owner surface` là tên product surface đã chốt        |
| `Stock`                                          | `Kho hàng` hoặc `tồn kho` tùy ngữ cảnh                                                           |
| `Finance`                                        | `Tài chính` hoặc `Kế toán` tùy ngữ cảnh                                                          |
| `Shipped`                                        | `Hoàn thành`                                                                                     |
| `Point of Sale`                                  | `POS`                                                                                            |
| `Kitchen Display System`                         | `KDS` hoặc `màn hình bếp`                                                                        |
| `Restaurant Management System`                   | `hệ thống quản lý vận hành nhà hàng`                                                             |
| `Merchant Platform`                              | `bộ phần mềm quản lý vận hành và bán hàng`                                                       |
| `Báo cáo CEO`                                    | `Báo cáo điều hành`                                                                              |
| `CTCP`, `JSC`, `Công ty cổ phần`                 | `Hộ kinh doanh` / `HKD` cho mô hình hiện hành; chỉ dùng khi nói lịch sử hoặc lộ trình chuyển đổi |
| `financial health`                               | `sức khỏe tài chính` chỉ khi đã định nghĩa bộ metric; nếu không, dùng metric cụ thể              |
| `food cost` trong UI thường                      | `giá vốn món` hoặc `chi phí nguyên liệu`                                                         |
| `webhook`, `drill-down`, `hover` trong UI thường | `lỗi đồng bộ`, `xem chi tiết`, `rê chuột` hoặc hướng dẫn thao tác phù hợp                        |

### Owner surface

| Trường           | Giá trị                                                                 |
| ---------------- | ----------------------------------------------------------------------- |
| `canonical_term` | `owner`                                                                 |
| `label_vi`       | `Owner surface`                                                         |
| `definition`     | Mặt điều hành và thiết lập toàn hệ thống, chỉ Chủ sở hữu được truy cập. |

Owner surface gồm `/`, `/menu`, `/orders`, `/inventory`, `/finance`,
`/branches` và `/hr`. Công việc hằng ngày của Quản lý chi nhánh và Nhân viên
thuộc Branch tại `/br/[branchId]/*`. Không dùng lại nhãn `Văn phòng` cho mặt
sản phẩm này.

## Copy source ladder

Mỗi loại copy có đúng một nguồn sở hữu. Khi thêm/sửa copy, cập nhật nguồn đúng
trước hoặc trong cùng PR, rồi chạy `pnpm lint:copy`.

- Nghĩa business + quy tắc đặt tên: `docs/ref/glossary.md`.
- Metric/card/title có số liệu: `docs/ref/operational-data-contract.md`.
- Nhãn tiếng Việt domain dùng chung: `packages/shared/src/labels/vi.ts`.
- Action/state/error chung: `@comtammatu/shared/messages` hoặc
  `apps/web/lib/messages/*`.
- Chuỗi cố định theo luật: `packages/shared/src/labels/legal-fixed.ts`.
- Adapter route/thuật ngữ Inventory:
  `apps/web/app/(protected)/inventory/_lib/dictionary.ts`.
- Adapter route-specific khác: dictionary domain tương ứng.

## Mẫu entry bắt buộc

Thuật ngữ nghiệp vụ mới phải đủ các trường sau khi rủi ro nhầm lẫn cao:

| Trường                 | Ý nghĩa                                                          |
| ---------------------- | ---------------------------------------------------------------- |
| `canonical_term`       | English term dùng trong code/docs kỹ thuật                       |
| `label_vi`             | Nhãn tiếng Việt chuẩn                                            |
| `definition`           | Nghĩa đúng trong Cơm Tấm Má Tư                                   |
| `not_this`             | Những thứ không được lẫn                                         |
| `scope`                | POS, Finance, Inventory, Owner, HKD/legal, HR, hoặc cross-module |
| `source_of_truth`      | Doc/code/schema/RPC sở hữu dữ liệu hoặc rule                     |
| `allowed_variants`     | Long/short/acronym được phép dùng                                |
| `forbidden_synonyms`   | Cách gọi bị cấm hoặc chỉ dùng trong context hẹp                  |
| `related_contract_key` | Bắt buộc nếu term là metric/card số liệu                         |

## Bản đồ số liệu F&B và tài chính

Nguyên tắc nền:

- `Doanh thu thuần` trên bề mặt Owner là giá trị món của đơn đã trả sau
  discount và chưa VAT: `subtotal_revenue - discount_amount`.
- VAT/GTGT là khoản thu hộ/nộp lại hoặc nghĩa vụ thuế theo phương pháp HKD, không
  phải lãi của nhà hàng.
- Mua nguyên liệu không tự động là `food cost`; chỉ là giá vốn khi được ghi nhận
  là tiêu hao/bán hàng theo contract.
- `estimated` hoặc `needs_review` không được hiển thị như KPI tin cậy.
- Nhãn ngắn `Doanh thu` chỉ được dùng cho
  `finance.revenue.money_collected` trên Finance Basic, với hint nói rõ đây là
  payment hoàn tất và có thể gồm VAT. Các bề mặt khác không dùng nhãn trần nếu
  chưa nói rõ metric key, công thức, source, exclusions và confidence.

### Metric vocabulary

| Canonical term           | Nhãn chuẩn                    | Định nghĩa                                                                                                 | Công thức / rule                                                                                 | Không được lẫn với                                                                     | Contract/source                                                     |
| ------------------------ | ----------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `gross_sales`            | Tổng giá bán trước giảm giá   | Tổng giá menu/list của món bán trước giảm giá, refund, VAT passthrough.                                    | `sum(item_list_price * qty)` theo đơn hợp lệ.                                                    | Tiền đã thu, doanh thu trước VAT, doanh thu tính thuế.                                 | Revenue report; cần contract khi đưa lên KPI.                       |
| `discount_amount`        | Giảm giá                      | Tổng khuyến mãi, giảm giá, comp làm giảm doanh thu bán hàng.                                               | Tổng discount trên order/item đã đóng.                                                           | Waste, hủy món, hoàn tiền.                                                             | POS/revenue detail.                                                 |
| `refund_amount`          | Hoàn tiền                     | Tiền trả lại sau khi đơn đã thanh toán.                                                                    | Tổng refund đã approved trong kỳ.                                                                | Hủy món trước thanh toán, giảm giá.                                                    | Finance refund workflow.                                            |
| `voided_amount`          | Giá trị hủy trước thanh toán  | Giá trị dòng món/đơn bị hủy trước khi paid.                                                                | Tổng void/cancel trước commercial close.                                                         | Refund sau thanh toán, discount.                                                       | POS exception report.                                               |
| `net_sales_before_vat`   | Doanh thu thuần               | Giá trị món của đơn đã trả sau discount và chưa VAT; là mẫu số margin hiện tại.                            | `subtotal_revenue - discount_amount` trên tập đơn có payment hoàn tất.                           | Tổng payment gồm VAT, tiền mặt trong két, HĐĐT đã phát hành, doanh thu tính thuế.      | `finance.revenue.before_vat_after_discount`.                        |
| `total_collected`        | Tổng tiền đã thu              | Tổng giá trị payment hoàn tất trong kỳ, có thể gồm VAT.                                                    | Sum `payments.amount` completed tại `paid_at`, bucket theo ngày Việt Nam.                        | Doanh thu thuần, HĐĐT đã phát hành, công nợ, doanh thu tính thuế.                      | `finance.revenue.money_collected`.                                  |
| `cash_collected`         | Tiền mặt đã thu               | Phần `total_collected` bằng tiền mặt.                                                                      | Sum paid amount method `cash`.                                                                   | Tiền mặt hiện hữu trong két, cash variance.                                            | Payment split.                                                      |
| `bank_wallet_collected`  | Chuyển khoản đã thu           | Phần `total_collected` qua VietQR hoặc chuyển khoản.                                                       | Sum paid amount method `bank_transfer`/`vietqr`.                                                 | Doanh thu kênh bán, tiền ngân hàng đã settle nếu có delay.                             | Payment split.                                                      |
| `payment_split`          | Cơ cấu thanh toán             | Tỷ trọng thu theo phương thức thanh toán.                                                                  | `amount_by_method / total_collected`.                                                            | Sales channel mix.                                                                     | Finance/revenue report.                                             |
| `tax_collected`          | Thuế đã thu/ước tính phải nộp | Phần VAT/GTGT tương ứng doanh thu bán ra theo cấu hình HKD/HĐĐT.                                           | Theo `einvoice-tax.md`; không hardcode trong UI.                                                 | Lãi, doanh thu thuần, chi phí.                                                         | HĐĐT/tax module.                                                    |
| `issued_invoice_revenue` | Doanh thu HĐĐT đã phát hành   | Tổng giá trị HĐĐT trạng thái `issued`.                                                                     | Sum tax invoice amount where `status='issued'`.                                                  | Doanh thu POS nếu chưa/không xuất HĐĐT, tiền đã thu.                                   | HĐĐT report.                                                        |
| `tax_declared_revenue`   | Doanh thu tính thuế           | Doanh thu dùng để kê khai HKD theo luật và phương pháp thuế đã cấu hình.                                   | Theo `einvoice-tax.md` và `legal-framework-2026.md`.                                             | Doanh thu POS, HĐĐT đã phát hành, tiền đã thu, doanh thu thuần dùng cho biên lợi nhuận. | Legal/tax SSoT.                                                    |
| `order_count`            | Số đơn                        | Số đơn bán hợp lệ trong kỳ.                                                                                | Count order completed/paid theo contract.                                                        | Số lượt khách/covers, số bàn.                                                          | Revenue report.                                                     |
| `average_order_value`    | Giá trị trung bình mỗi đơn    | Doanh thu trung bình mỗi order.                                                                            | `net_sales_before_vat / order_count`.                                                            | Doanh thu/lượt khách nếu chưa có guest count.                                          | Revenue report.                                                     |
| `covers`                 | Lượt khách                    | Số khách phục vụ thực tế.                                                                                  | Sum `guest_count` nếu POS capture; takeaway dùng order count nếu chưa có khách.                  | Số đơn, số bàn.                                                                        | Future dine-in analytics.                                           |
| `food_cost`              | Giá vốn món                   | Chi phí nguyên liệu/bao bì trực tiếp đã ghi nhận cho món bán hoặc tiêu hao bếp.                            | Theo consumption/production/approved report.                                                     | Chi phí vận hành, hóa đơn NCC, PO, tiền đã trả NCC.                                    | `finance.food_cost.recorded`.                                       |
| `theoretical_food_cost`  | Giá vốn định mức              | Giá vốn suy ra từ công thức món và mix bán hàng.                                                           | `sum(recipe_qty * cost * sold_qty)`.                                                             | Giá vốn thực tế nếu chưa đối soát tồn/kiểm kê.                                         | Analysis only, `estimated`.                                         |
| `actual_food_cost`       | Giá vốn thực tế               | Giá vốn từ biến động kho/tiêu hao thực tế.                                                                 | `begin_inventory + purchases + transfers_in - transfers_out - ending_inventory +/- adjustments`. | Định mức recipe, purchase spend.                                                       | Inventory/Finance when source trusted.                              |
| `food_cost_percentage`   | Tỷ lệ giá vốn món             | Tỷ lệ giá vốn trên doanh thu trước VAT.                                                                    | `food_cost / net_sales_before_vat`.                                                              | Biên gộp, tỷ lệ giảm giá.                                                              | Finance food-cost report.                                           |
| `gross_profit`           | Lợi nhuận gộp                 | Phần còn lại sau khi trừ giá vốn món khỏi doanh thu thuần.                                                  | `net_sales_before_vat - food_cost`.                                                              | Kết quả vận hành, lợi nhuận ròng, dòng tiền, tiền mặt trong két.                       | `finance.gross_profit.readonly`.                                    |
| `gross_margin`           | Biên gộp                      | Tỷ lệ lợi nhuận gộp trên doanh thu thuần.                                                                  | `gross_profit / net_sales_before_vat`.                                                           | Tỷ lệ giá vốn món, biên ròng.                                                          | Supporting context.                                                 |
| `operating_expense`      | Chi phí vận hành              | Chi phí vận hành HKD đã ghi nhận: thuê mặt bằng, điện nước, phần mềm, marketing, sửa chữa, phí thanh toán. | Sum posted expense trong kỳ, loại direct ingredient COGS.                                        | Giá vốn món, supplier payable nguyên liệu, payroll nếu chưa đưa vào scope.             | `finance.expense.operating`.                                        |
| `operating_result`       | Kết quả vận hành              | Kết quả sau khi trừ giá vốn món, chi phí vận hành và cộng biến động tồn kho đã ghi nhận.                   | `gross_profit - operating_expense + inventory_movement`.                                         | Lợi nhuận ròng, dòng tiền, kết quả kê khai thuế.                                       | `finance.operating_result`.                                         |
| `labor_cost`             | Chi phí nhân công             | Lương, phụ cấp chịu chi phí, BH/thuế employer nếu được ghi nhận cho vận hành.                              | Theo payroll/HR contract.                                                                        | TNCN của chủ HKD, personal expense.                                                    | Future/HR-linked finance.                                           |
| `prime_cost`             | Chi phí chính                 | Chi phí kiểm soát chính trong nhà hàng: giá vốn món + chi phí nhân công.                                   | `food_cost + labor_cost`.                                                                        | Chi phí vận hành tổng, lợi nhuận ròng.                                                 | Chỉ dùng khi cả food cost và labor cost trusted.                    |
| `net_operating_profit`   | Lợi nhuận vận hành ròng       | Lãi sau khi trừ giá vốn, nhân công, chi phí vận hành, và khoản vận hành khác đã định nghĩa.                | `net_sales_before_vat - food_cost - labor_cost - operating_expense +/- other_operating_items`.   | Lợi nhuận gộp, tiền mặt, lợi nhuận kế toán doanh nghiệp.                               | Không là Finance Basic KPI mặc định.                                |
| `inventory_value`        | Giá trị tồn kho               | Tiền đang nằm trong tồn kho theo snapshot location/branch.                                                 | `stock_levels.current_quantity * (stock_levels.avg_unit_cost ?? ingredients.unit_cost ?? 0)`.    | Chi phí trong kỳ, tiền mua NCC, profit.                                                | `finance.inventory_value.current`, `inventory.stock_value.current`. |
| `stock_on_hand`          | Tồn hiện tại                  | Số lượng thực tế theo ledger tại location.                                                                 | `stock_levels.current_quantity`.                                                                 | Giá trị tồn kho, hàng đã đặt mua.                                                      | `inventory.stock_quantity.current`.                                 |
| `purchase_spend`         | Giá trị mua hàng              | Giá trị hàng/chi phí đã mua hoặc nhận từ NCC.                                                              | Theo trạng thái PO/GRN/hóa đơn NCC.                                                              | Giá vốn món, giá trị tồn kho, chi phí vận hành.                                        | Procurement report.                                                 |
| `supplier_payable`       | Phải trả NCC                  | Khoản còn nợ nhà cung cấp.                                                                                 | Invoice total - paid amount.                                                                     | Purchase spend, food cost, cash expense.                                               | Supplier invoice / AP workflow.                                     |
| `waste_cost`             | Giá trị hao hụt/hủy hỏng      | Chi phí nguyên liệu mất do hư, bỏ, sai món, quá hạn, vỡ.                                                   | `waste_qty * unit_cost`.                                                                         | Discount, comp, refund.                                                                | Inventory exception report.                                         |
| `stocktake_variance`     | Chênh lệch kiểm kê            | Chênh giữa sổ và đếm thực tế.                                                                              | `counted_qty - book_qty`, value by unit cost.                                                    | Waste đã ghi nhận, transfer chưa nhận.                                                 | Stocktake workflow.                                                 |
| `inventory_turnover`     | Vòng quay tồn kho             | Tốc độ chuyển tồn kho thành tiêu hao/bán hàng.                                                             | `COGS / average_inventory_value`.                                                                | Doanh thu, stockout.                                                                   | Inventory/Finance analysis.                                         |
| `expected_cash`          | Tiền mặt dự thu               | Tiền mặt POS đáng lẽ có trong két tại lúc đóng ca theo payment hoàn tất.                                   | `opening_cash + sum(completed cash payments)` trong ca.                                          | Tiền đếm thực tế, tiền mặt tenant-wide theo sổ.                                        | Cash session.                                                       |
| `counted_cash`           | Tiền mặt kiểm đếm             | Tiền mặt nhân sự/quản lý đếm thực tế.                                                                      | Manual count at close.                                                                           | Expected cash.                                                                         | Cash session.                                                       |
| `cash_variance`          | Chênh lệch tiền mặt           | Két thừa/thiếu so với kỳ vọng.                                                                             | `counted_cash - expected_cash`.                                                                  | Lợi nhuận, doanh thu, chi phí.                                                         | Cash session reconciliation.                                        |
| `staff_repaid`           | Nhân viên bù đủ tiền thiếu    | Quản lý đã nhận đủ `abs(cash_variance)` của ca thiếu; giữ nguyên số đếm lúc chốt.                          | Chỉ dùng khi `cash_variance < 0`; settlement bằng toàn bộ khoản thiếu.                           | Điều chỉnh sổ quỹ, sửa số đếm, thu một phần.                                           | `resolve_pos_session_variance`.                                     |
| `accepted_adjustment`    | Ghi nhận lệch ca              | Quản lý giữ số đếm thực tế và ghi nhận kết quả thừa/thiếu để báo cáo, điều tra.                            | Book delta bằng 0; tổn thất/lợi ích đã kiểm chứng dùng finance adjustment riêng.                 | Nhân viên bù tiền, sửa phương thức thanh toán, tự động đổi số dư theo sổ.              | `resolve_pos_session_variance`.                                     |

### Legacy identifier notes

- `net_revenue` trong database/RPC hiện bị overload, nhưng nghĩa nghiệp vụ không
  được overload. Trên UI Finance, `net_sales_before_vat` dùng nhãn
  `Doanh thu thuần`. Nếu source field `net_revenue` đang chứa
  `sum(orders.total_amount)` gồm VAT/tổng khách trả, adapter phải đổi tên nghĩa
  sang `total_collected`, không hỏi owner chọn lại định nghĩa.
- `Lợi nhuận ròng` không thuộc năm KPI Finance Basic hiện hành. Chỉ dùng khi đã
  có contract cho `net_operating_profit`, đủ source cho food cost/labor/expense,
  và confidence không phải `estimated`/`needs_review`.
- `Tiền mặt hiện hữu` chỉ dùng cho cash session/drawer khi có opening/counting
  contract; không dùng thay `cash_collected`.

## Từ điển kiến thức nền F&B/Finance

Các bảng dưới đây là kiến thức nền để agent dùng khi gặp thuật ngữ chuyên ngành.
Nếu chưa có source dữ liệu trong hệ thống, agent được phép đánh dấu
`blocked`/`estimated`, nhưng không được đổi nghĩa thuật ngữ.

### Revenue, sales, và kênh bán

| Term                      | Nhãn chuẩn                       | Nghĩa agent phải biết                                                          | Không được lẫn với             |
| ------------------------- | -------------------------------- | ------------------------------------------------------------------------------ | ------------------------------ |
| `sales`                   | doanh số bán hàng                | Tổng hoạt động bán ra theo đơn/dòng món; cần nói rõ gross/net/VAT/payment.     | tiền đã thu, HĐĐT đã phát hành |
| `gross_sales`             | tổng giá bán trước giảm giá      | Tổng giá list/menu trước discount/refund/VAT passthrough.                      | doanh thu ròng                 |
| `net_sales`               | doanh thu ròng / doanh thu thuần | Doanh thu sau giảm giá/hoàn tiền, trước VAT nếu dùng cho margin.               | tổng khách trả gồm VAT         |
| `net_sales_before_vat`    | doanh thu thuần trước VAT        | Canonical của Má Tư cho margin và lợi nhuận gộp.                               | `total_collected`              |
| `sales_return`            | hàng bán trả lại                 | Giá trị bán bị trả lại sau bán; F&B thường hiếm, gần với refund/void tùy flow. | discount                       |
| `discount`                | giảm giá                         | Khoản giảm thương mại trước/ở lúc thanh toán.                                  | waste, comp nội bộ             |
| `comp`                    | món tặng/miễn phí                | Món được miễn phí vì chăm sóc khách/sự cố; vẫn có thể tạo food cost.           | discount tiền, waste           |
| `void`                    | hủy trước thanh toán             | Xóa/hủy món hoặc đơn trước commercial close.                                   | refund                         |
| `refund`                  | hoàn tiền                        | Trả lại tiền sau khi paid/completed.                                           | void/cancel trước paid         |
| `service_charge`          | phí dịch vụ                      | Phí tính thêm cho dịch vụ nếu có chính sách rõ.                                | tip, VAT, doanh thu món        |
| `tip`                     | tiền tip                         | Tiền khách thưởng nhân viên; không mặc định là doanh thu nhà hàng.             | service charge, revenue        |
| `sales_channel`           | kênh bán                         | Nguồn phát sinh nhu cầu: dine-in, takeaway, delivery, app/platform.            | payment method                 |
| `payment_method`          | phương thức thanh toán           | Cách khách trả tiền: cash, bank transfer, VietQR.                              | sales channel                  |
| `delivery_platform_sales` | doanh thu qua nền tảng giao hàng | Doanh thu đơn đến từ nền tảng giao hàng bên thứ ba nếu tích hợp.               | payout về ngân hàng            |
| `platform_commission`     | phí nền tảng                     | Phí nền tảng khấu trừ hoặc xuất hóa đơn dịch vụ.                               | food cost, discount            |
| `net_payout`              | tiền nền tảng thực chuyển        | Tiền về sau khi trừ commission/fee/adjustment.                                 | doanh thu ròng                 |
| `settlement_lag`          | độ trễ đối soát tiền             | Khoảng thời gian giữa paid/order completed và tiền thực về ngân hàng.          | công nợ xấu                    |
| `sales_mix`               | cơ cấu doanh thu theo nhóm       | Tỷ trọng doanh thu theo món/nhóm/kênh.                                         | payment split                  |
| `product_mix`             | cơ cấu món bán                   | Tỷ trọng số lượng hoặc doanh thu từng món.                                     | sales channel mix              |

### Cost, margin, và profit

| Term                          | Nhãn chuẩn               | Nghĩa agent phải biết                                                                                             | Không được lẫn với                |
| ----------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `cost_of_goods_sold` (`COGS`) | giá vốn hàng bán         | Direct cost của món/hàng đã bán hoặc tiêu hao để tạo doanh thu. Trong F&B thường là food/beverage/packaging cost. | purchase spend, operating expense |
| `food_cost`                   | giá vốn món              | Phần COGS nguyên liệu/bao bì gắn với món bán hoặc tiêu hao bếp.                                                   | hóa đơn NCC                       |
| `beverage_cost`               | giá vốn đồ uống          | COGS của đồ uống nếu tách menu.                                                                                   | food cost nếu cần phân tích riêng |
| `packaging_cost`              | chi phí bao bì trực tiếp | Bao bì đi kèm món mang về/giao hàng; có thể tính vào COGS hoặc direct variable cost theo contract.                | opex văn phòng                    |
| `theoretical_food_cost`       | giá vốn định mức         | Giá vốn kỳ vọng từ recipe và mix bán hàng.                                                                        | actual food cost                  |
| `actual_food_cost`            | giá vốn thực tế          | Giá vốn từ tồn đầu + mua/nhận + điều chuyển - tồn cuối +/- điều chỉnh.                                            | recipe estimate                   |
| `food_cost_variance`          | chênh lệch giá vốn       | Actual food cost - theoretical food cost.                                                                         | stocktake variance riêng lẻ       |
| `standard_cost`               | giá vốn chuẩn            | Cost định mức dùng để tính nhanh/mô phỏng.                                                                        | WAC/current actual cost           |
| `actual_cost`                 | giá vốn thực tế          | Cost sau khi ghi nhận mua/tiêu hao/kiểm kê.                                                                       | standard cost                     |
| `gross_profit`                | lợi nhuận gộp            | Net sales - COGS/food cost.                                                                                       | net profit, cash flow             |
| `gross_margin`                | biên gộp                 | Lợi nhuận gộp / doanh thu thuần.                                                                                  | tỷ lệ giá vốn món                 |
| `contribution_margin`         | lãi đóng góp             | Doanh thu món/kênh trừ chi phí biến đổi trực tiếp.                                                                | gross profit toàn kỳ              |
| `variable_cost`               | chi phí biến đổi         | Chi phí thay đổi theo số đơn/món: nguyên liệu, bao bì, platform fee theo đơn.                                     | fixed cost                        |
| `fixed_cost`                  | chi phí cố định          | Chi phí ít đổi theo sản lượng ngắn hạn: thuê mặt bằng, phần mềm cố định.                                          | variable cost                     |
| `labor_cost`                  | chi phí nhân công        | Lương, phụ cấp, bảo hiểm/thuế employer nếu ghi nhận.                                                              | TNCN của chủ HKD                  |
| `labor_cost_percentage`       | tỷ lệ chi phí nhân công  | Labor cost / net sales.                                                                                           | prime cost %                      |
| `prime_cost`                  | prime cost               | Food/beverage COGS + labor cost; cost kiểm soát chính của nhà hàng.                                               | total operating expense           |
| `prime_cost_ratio`            | tỷ lệ chi phí chính      | Chi phí chính / doanh thu ròng.                                                                                   | biên gộp                          |
| `operating_expense` (`opex`)  | chi phí vận hành         | Rent, utilities, software, repair, marketing, bank/payment fee; không gồm direct COGS nếu đã tách.                | food cost                         |
| `operating_profit`            | lợi nhuận vận hành       | Lãi sau COGS/labor/opex trong phạm vi vận hành.                                                                   | net income pháp lý                |
| `net_profit`                  | lợi nhuận ròng           | Bottom-line sau tất cả chi phí đã định nghĩa. Với HKD chỉ dùng khi contract đủ.                                   | lợi nhuận gộp                     |
| `net_margin`                  | biên lợi nhuận ròng      | Net profit / revenue.                                                                                             | gross margin                      |
| `ebitda`                      | EBITDA                   | Earnings before interest, tax, depreciation, amortization; không phải KPI mặc định HKD.                           | cash profit                       |
| `owner_draw`                  | chủ rút tiền             | Tiền chủ hộ rút khỏi hoạt động.                                                                                   | expense vận hành                  |

### Cash, công nợ, và đối soát

| Term                         | Nhãn chuẩn             | Nghĩa agent phải biết                                                                        | Không được lẫn với                 |
| ---------------------------- | ---------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------- |
| `cash_basis`                 | ghi nhận theo tiền     | Doanh thu/chi phí ghi khi tiền thu/chi.                                                      | accrual basis                      |
| `accrual_basis`              | ghi nhận dồn tích      | Ghi khi doanh thu phát sinh/chi phí incurred, bất kể tiền đã chuyển chưa.                    | cash basis                         |
| `cash_flow`                  | dòng tiền              | Tiền vào/ra theo thời gian.                                                                  | profit                             |
| `cash_inflow`                | dòng tiền vào          | Tiền nhận từ khách/nền tảng/khoản khác.                                                      | revenue nếu chưa earned            |
| `cash_outflow`               | dòng tiền ra           | Tiền chi cho NCC/nhân sự/expense/chủ rút.                                                    | expense nếu là trả nợ cũ           |
| `cash_on_hand`               | tiền mặt hiện hữu      | Tiền thực có trong két hoặc quỹ.                                                             | cash collected                     |
| `bank_opening_balance`       | số dư ngân hàng đầu kỳ | Mốc số dư Owner nhập vì hệ thống không đọc được số dư tài khoản ngân hàng.                   | Tổng giao dịch SePay               |
| `bank_transaction`           | giao dịch ngân hàng    | Một biến động tiền vào hoặc tiền ra canonical từ SePay, tính đúng một lần theo ID giao dịch. | Webhook delivery, payment, expense |
| `opening_cash`               | tiền đầu ca            | Tiền mặt trong két khi mở ca.                                                                | doanh thu                          |
| `closing_cash`               | tiền cuối ca           | Tiền mặt thực đếm khi đóng ca.                                                               | expected cash                      |
| `cash_over_short`            | thừa/thiếu tiền mặt    | Counted cash - expected cash.                                                                | lãi/lỗ                             |
| `bank_reconciliation`        | đối soát ngân hàng     | Phân loại giao dịch ngân hàng vào payment/chứng từ; gắn hoặc gỡ không đổi số dư.             | payment split, bank movement       |
| `accounts_receivable` (`AR`) | phải thu               | Tiền khách/nền tảng/đối tác còn nợ.                                                          | revenue                            |
| `accounts_payable`           | phải trả               | Tiền còn nợ NCC/đối tác.                                                                     | purchase spend                     |
| `payable_due_date`           | hạn thanh toán NCC     | Ngày phải trả hóa đơn/khế ước NCC.                                                           | ngày GRN                           |
| `receivable_aging`           | tuổi nợ phải thu       | Phân nhóm khoản phải thu theo số ngày chưa thu.                                              | doanh thu ngày                     |
| `payable_aging`              | tuổi nợ phải trả       | Phân nhóm khoản phải trả theo số ngày chưa thanh toán.                                       | chi phí trong kỳ                   |
| `prepaid_expense`            | chi phí trả trước      | Tiền đã trả nhưng phân bổ cho nhiều kỳ.                                                      | chi phí vận hành kỳ hiện tại       |
| `accrued_expense`            | chi phí dồn tích       | Chi phí đã phát sinh nhưng chưa trả tiền.                                                    | AP invoice đã nhận nếu có invoice  |
| `deposit`                    | đặt cọc                | Tiền giữ chỗ/đặt cọc, chưa chắc là revenue.                                                  | payment for completed order        |

### Inventory, procurement, và costing

| Term                      | Nhãn chuẩn               | Nghĩa agent phải biết                                               | Không được lẫn với         |
| ------------------------- | ------------------------ | ------------------------------------------------------------------- | -------------------------- |
| `beginning_inventory`     | tồn đầu kỳ               | Giá trị/số lượng tồn tại đầu kỳ.                                    | opening cash               |
| `ending_inventory`        | tồn cuối kỳ              | Giá trị/số lượng tồn cuối kỳ.                                       | closing cash               |
| `average_inventory`       | tồn bình quân            | Bình quân tồn trong kỳ, dùng cho turnover.                          | inventory snapshot         |
| `inventory_turnover`      | vòng quay tồn kho        | COGS / average inventory value.                                     | sales growth               |
| `days_inventory_on_hand`  | số ngày tồn kho          | Average inventory / daily COGS; ước số ngày tồn đủ dùng.            | shelf life                 |
| `par_level`               | mức tồn chuẩn            | Tồn mục tiêu để vận hành đủ mà không dư quá.                        | reorder point              |
| `reorder_point`           | điểm đặt hàng            | Ngưỡng tồn kích hoạt đặt hàng.                                      | par level                  |
| `lead_time`               | thời gian giao hàng      | Thời gian từ đặt hàng đến nhận hàng.                                | shelf life                 |
| `safety_stock`            | tồn an toàn              | Phần tồn đệm để tránh stockout.                                     | overstock                  |
| `stockout`                | hết hàng                 | Tồn không đủ để bán/sản xuất.                                       | low stock                  |
| `overstock`               | dư tồn                   | Tồn vượt nhu cầu/par, tăng rủi ro hư hỏng/cash tied.                | inventory value cao có lợi |
| `dead_stock`              | tồn chết                 | Hàng tồn lâu/khó dùng/khó bán.                                      | safety stock               |
| `shrinkage`               | hao hụt không giải thích | Mất mát do thất thoát/sai đếm/hư hỏng chưa phân loại.               | waste đã ghi nhận          |
| `spoilage`                | hư hỏng                  | Hàng hỏng/quá hạn không dùng được.                                  | comp/discount              |
| `waste`                   | hao phí/bỏ đi            | Nguyên liệu/món bị bỏ vì sơ chế, lỗi, hỏng, quá hạn.                | void/refund                |
| `yield`                   | tỷ lệ thu hồi            | Lượng usable sau sơ chế/chế biến so với lượng mua.                  | recipe qty                 |
| `trim_loss`               | hao hụt sơ chế           | Phần mất khi làm sạch/cắt tỉa.                                      | cooking loss               |
| `cooking_loss`            | hao hụt nấu nướng        | Mất trọng lượng/số lượng khi nấu.                                   | trim loss                  |
| `portion_cost`            | giá vốn khẩu phần        | Cost cho một phần/món theo recipe/yield.                            | menu price                 |
| `landed_cost`             | giá nhập đủ chi phí      | Giá hàng gồm phí vận chuyển/handling liên quan để đưa hàng vào kho. | unit price trần            |
| `supplier_price_variance` | chênh giá NCC            | Chênh giá mua thực tế so với giá chuẩn/lần trước/contract.          | food cost variance         |
| `purchase_variance`       | chênh lệch mua hàng      | Chênh giữa PO, GRN, invoice về lượng/giá.                           | stocktake variance         |
| `cycle_count`             | kiểm kê luân phiên       | Kiểm kê một phần theo lịch.                                         | stocktake toàn kho         |

### Menu, bàn, và hiệu suất vận hành

| Term                       | Nhãn chuẩn                    | Nghĩa agent phải biết                                                        | Không được lẫn với            |
| -------------------------- | ----------------------------- | ---------------------------------------------------------------------------- | ----------------------------- |
| `average_order_value`      | giá trị trung bình mỗi đơn    | Doanh thu ròng / số đơn.                                                     | chi tiêu trung bình mỗi khách |
| `average_check`            | hóa đơn trung bình            | Tương tự AOV/check average, tùy check/order model.                           | total collected               |
| `covers`                   | lượt khách                    | Số khách phục vụ; chỉ dùng khi capture guest count.                          | order count                   |
| `average_spend_per_cover`  | chi tiêu trung bình mỗi khách | Net sales / covers.                                                          | AOV                           |
| `table_turnover`           | vòng quay bàn                 | Số lượt khách/party mỗi bàn trong kỳ.                                        | inventory turnover            |
| `seat_occupancy`           | tỷ lệ lấp đầy chỗ ngồi        | Seat-hours used / seat-hours available.                                      | table turnover                |
| `RevPASH`                  | doanh thu trên ghế-giờ        | Revenue per available seat hour; hữu ích khi dine-in capacity là bottleneck. | AOV                           |
| `party_size`               | quy mô nhóm khách             | Số khách trong một bàn/party.                                                | covers cả ngày                |
| `dwell_time`               | thời gian ngồi bàn            | Thời gian khách chiếm bàn.                                                   | prep time                     |
| `ticket_time`              | thời gian xử lý phiếu         | Thời gian từ gửi bếp đến ready/served.                                       | dwell time                    |
| `prep_time`                | thời gian chế biến            | Thời gian bếp chuẩn bị món.                                                  | service time                  |
| `service_time`             | thời gian phục vụ             | Thời gian từ order/ready đến served hoặc close tùy metric.                   | prep time                     |
| `86_item`                  | món tạm hết                   | Món không bán được vì hết nguyên liệu/sản xuất.                              | deactivated menu item         |
| `menu_engineering`         | phân tích menu                | Phân loại món theo popularity và contribution margin.                        | báo cáo doanh thu đơn thuần   |
| `item_popularity`          | độ phổ biến món               | Tỷ trọng món trong product mix.                                              | profitability                 |
| `item_contribution_margin` | lãi đóng góp theo món         | Net item sales - variable cost của món.                                      | gross profit toàn cửa hàng    |
| `menu_price`               | giá bán menu                  | Giá niêm yết đã gồm VAT, trước discount; không cộng VAT lần hai tại POS.      | net sales                     |

### Tax/HKD boundaries

| Term                    | Nhãn chuẩn                 | Nghĩa agent phải biết                                  | Không được lẫn với                       |
| ----------------------- | -------------------------- | ------------------------------------------------------ | ---------------------------------------- |
| `taxable_revenue`       | doanh thu tính thuế        | Revenue dùng làm căn cứ thuế theo HKD/config pháp lý.  | net sales for margin                     |
| `invoice_issued_amount` | giá trị HĐĐT đã phát hành  | Tổng tiền trên HĐĐT đã phát hành.                      | doanh thu POS nếu hóa đơn chưa phát hành |
| `vat_payable`           | GTGT phải nộp              | Nghĩa vụ GTGT theo phương pháp áp dụng.                | output VAT display                       |
| `pit_business_payable`  | TNCN kinh doanh phải nộp   | Nghĩa vụ TNCN từ hoạt động HKD.                        | PIT payroll                              |
| `tax_withholding`       | khấu trừ thuế              | Thuế bị khấu trừ/nộp thay bởi nền tảng/đối tác nếu có. | platform commission                      |
| `invoice_cancellation`  | hủy HĐĐT                   | Hủy hóa đơn theo trạng thái/provider/luật.             | refund order                             |
| `invoice_replacement`   | thay thế HĐĐT              | Lập hóa đơn thay thế sau sai sót/hủy theo quy định.    | edit receipt                             |
| `customer_tax_info`     | thông tin người mua lấy HĐ | MST/tên/địa chỉ người mua khi yêu cầu HĐĐT.            | thông tin khách lẻ bắt buộc              |

## Canonical terms

### Tổ chức và địa điểm vận hành

| Canonical term       | Nhãn chuẩn         | Định nghĩa                                                                | Không dùng                                           |
| -------------------- | ------------------ | ------------------------------------------------------------------------- | ---------------------------------------------------- |
| `tenant`             | tenant / hồ sơ HKD | Chủ thể kinh doanh cấp hệ thống, single-tenant row.                       | pháp nhân CTCP, công ty nếu đang nói row dữ liệu     |
| `household_business` | hộ kinh doanh      | Mô hình pháp lý hiện hành của Má Tư.                                      | CTCP, doanh nghiệp nếu không nói lộ trình chuyển đổi |
| `registered_owner`   | chủ hộ kinh doanh  | Người đại diện đăng ký HKD / người ký hồ sơ pháp lý.                      | representative pháp nhân                             |
| `branch`             | chi nhánh          | Site vận hành cấp L1: bán hàng, nhập kho, sản xuất, điều chuyển, kiểm kê. | cửa hàng nếu đang nói entity DB                      |
| `branch_warehouse`   | kho chi nhánh      | Location nhận/giữ tồn tại chi nhánh.                                      | kho con                                              |
| `branch_kitchen`     | bếp chi nhánh      | Location stock-bearing của chi nhánh sau khi kho chi nhánh cấp bếp.       | bếp cửa hàng nếu đang nói topology chuẩn             |
| `site`               | site vận hành      | Specs/technical docs khi cần gom branch/location.                         | dùng thay cho `branch` trong UI                      |

### Bề mặt sản phẩm

| Canonical term                 | Nhãn chuẩn                               | Ghi chú                                                                                                                |
| ------------------------------ | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `restaurant_operations_system` | bộ phần mềm quản lý vận hành và bán hàng | Nhãn chính của `comtammatu`.                                                                                           |
| `admin`                        | quản trị                                 | Tenant-level management surface.                                                                                       |
| `admin_overview`               | tổng quan quản trị                       | Bề mặt theo dõi vận hành và việc cần xử lý, không phải finance cockpit.                                                |
| `finance_basic`                | tài chính cơ bản HKD                     | Daily money, stock value, food cost, expenses, HĐĐT, accountant export.                                                |
| `inventory_ops`                | điều hành kho                            | Có thể rút gọn `Kho hàng` trong nav.                                                                                   |
| `point_of_sale`                | POS                                      | Không ép dịch thành `điểm bán` trong UI.                                                                               |
| `kitchen_display_system`       | KDS                                      | Có thể chú thích `màn hình bếp` ở docs/onboarding.                                                                     |
| `employee_portal`              | trang nhân viên                          | Legacy code label; route hiện tại là branch staff runtime dưới `/br/[branchId]/shift/*` và `/br/[branchId]/profile/*`. |
| `content_management`           | quản trị nội dung                        | Banner, promo, landing content, media, SEO metadata.                                                                   |

### Bán hàng, POS, và KDS

| Canonical term     | Nhãn chuẩn       | Định nghĩa                                                     | Không dùng                               |
| ------------------ | ---------------- | -------------------------------------------------------------- | ---------------------------------------- |
| `order`            | đơn hàng bán     | Đơn phát sinh ở POS.                                           | đơn hàng nếu đang đứng cạnh procurement  |
| `order_item`       | dòng món         | Một món trong đơn.                                             | item nếu viết user-facing copy           |
| `menu_item`        | món bán          | Item trong menu.                                               | sản phẩm nếu đang nói F&B order flow     |
| `table_session`    | phiên bàn        | Lifecycle phục vụ tại bàn.                                     | bàn mở nếu cần phân biệt record          |
| `takeaway_context` | ngữ cảnh mang về | Context bán mang về; có thể có nhiều order mở như bàn.         | đơn nhanh nếu workflow cần chọn order    |
| `pos_session`      | ca POS           | Shift mở trên terminal.                                        | ca bán hàng nếu đang nói entity kỹ thuật |
| `terminal`         | máy POS          | Thiết bị/điểm POS cụ thể.                                      | máy thu ngân                             |
| `kds_ticket`       | phiếu bếp        | Ticket hiển thị trên KDS.                                      | order bếp                                |
| `ready`            | sẵn sàng         | Món/phiếu bếp đã xong ở bếp.                                   | hoàn thành đơn                           |
| `served`           | đã phục vụ       | Marker phục vụ/fulfillment, không phải payment close.          | trả bàn, hoàn tất đơn                    |
| `completed`        | hoàn thành POS   | Đơn đã thanh toán và đóng ở POS; bàn release nếu dine-in.      | bếp xong                                 |
| `release_table`    | trả bàn          | Hệ thống release bàn khi đơn POS `completed` hoặc `cancelled`. | nút riêng sau thanh toán                 |

### Procurement, kho, và sản xuất

| Canonical term          | Nhãn chuẩn                          | Định nghĩa                                                                                                   | Không dùng                            |
| ----------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| `purchase_order`        | đơn đặt hàng NCC                    | Đơn mua gửi nhà cung cấp.                                                                                    | đơn hàng bán                          |
| `goods_received_note`   | phiếu nhập kho                      | Hàng thực nhận từ NCC tại kho chi nhánh.                                                                     | hóa đơn NCC, phiếu nhận chung         |
| `supplier_invoice`      | hóa đơn NCC                         | Hóa đơn đầu vào từ NCC.                                                                                      | HĐĐT bán ra, phiếu nhập kho           |
| `supplier_payment`      | thanh toán NCC                      | Giao dịch trả tiền cho nhà cung cấp.                                                                         | food cost, PO, GRN                    |
| `stock_level`           | tồn kho                             | Snapshot số lượng + WAC tại location.                                                                        | số lượng đặt mua                      |
| `stock_movement`        | biến động tồn kho                   | Ledger append-only của nhập/xuất/transfer/consumption/adjustment.                                            | giao dịch chung nếu cần rõ movement   |
| `stock_transfer`        | phiếu điều chuyển nội bộ            | Luân chuyển tồn giữa hai location/site theo Inventory contract.                                              | tiêu hao, bán hàng, food cost         |
| `stock_issue`           | phiếu xuất kho                      | Xuất dùng nội bộ khi runtime thật sự dùng chứng từ issue.                                                    | transfer nếu có location nhận tồn     |
| `consumption`           | tiêu hao                            | Trừ tồn vì bán hàng, sản xuất, hư hỏng, hoặc sử dụng bếp đã được duyệt.                                      | transfer, PO, hóa đơn NCC             |
| `stocktake`             | kiểm kê                             | Đếm thực tế và điều chỉnh.                                                                                   | kiểm kho nếu cần term chuẩn           |
| `entry_unit_id`         | đơn vị nhập / đơn vị đếm            | Đơn vị người dùng nhập trên PO/GRN/transfer/issue/waste; trong kiểm kê là đơn vị đếm.                        | đơn vị tồn chuẩn, text unit từ client |
| `base_unit`             | đơn vị tồn chuẩn                    | Đơn vị duy nhất `is_base = true` của nguyên liệu; ledger và tồn chuẩn lưu theo đơn vị này.                   | đơn vị nhập, đơn vị đóng gói          |
| `to_base_factor`        | quy đổi về tồn chuẩn                | Hệ số quy đổi dạng `1 đơn vị nhập/đếm = N đơn vị tồn chuẩn`. UI hiển thị canonical như `1 thùng = 24 chai`.  | hệ số đảo chiều                       |
| `purchase_unit_cost`    | đơn giá nhập                        | Giá nhập trên chứng từ, theo đơn vị nhập (`grn_items.unit_cost`, ₫ / đơn vị nhập).                           | giá vốn BQ, đơn giá ghi sổ            |
| `reference_unit_cost`   | giá nhập tham chiếu                 | Giá tham chiếu trên `ingredients.unit_cost`, dùng fallback khi chưa có giá vốn BQ.                           | giá vốn BQ chính thức                 |
| `average_unit_cost`     | giá vốn bình quân                   | `stock_levels.avg_unit_cost`, tính theo đơn vị tồn chuẩn. UI ngắn được dùng `Giá vốn BQ`.                    | đơn giá nhập                          |
| `movement_unit_cost`    | đơn giá ghi sổ                      | `stock_movements.unit_cost`, snapshot đơn giá dùng cho một movement; không gọi là WAC trên lịch sử movement. | giá vốn BQ hiện tại                   |
| `raw_material`          | nguyên liệu                         | Item đầu vào.                                                                                                | vật tư nếu không phải ngữ cảnh rộng   |
| `finished_good`         | thành phẩm                          | Hàng sản xuất tại chi nhánh hoặc giữ tồn sẵn tại chi nhánh.                                                  | món bán nếu đang nói menu             |
| `recipe`                | định mức (món bán)                  | Định mức nguyên liệu tiêu hao cho một món bán.                                                               | công thức (production)                |
| `production_recipe`     | công thức (sản xuất)                | Định mức nguyên liệu (BOM) để sản xuất ra thành phẩm.                                                        | định mức (POS)                        |
| `production_order`      | lệnh sản xuất                       | Lệnh sản xuất tại chi nhánh; entity runtime là `production_runs`.                                            | work order                            |
| `three_way_matching`    | đối soát 3 chứng từ                 | Đối chiếu `PO`, `GRN`, `supplier_invoice`.                                                                   | matching chung                        |
| `weighted_average_cost` | giá vốn bình quân gia quyền (`WAC`) | Costing chuẩn hiện tại.                                                                                      | FIFO nếu hệ thống không dùng          |

`Kho chi nhánh -> Bếp chi nhánh` trong contract hiện tại là `stock_transfer` cùng chi nhánh.
Tổng tồn chi nhánh không giảm ở bước này; tồn chỉ giảm khi có `stock_issue` /
`consumption` / write-off được ghi nhận sau đó.

### Thanh toán và tiền mặt

| Canonical term   | Nhãn chuẩn             | Định nghĩa                                                                                                                                           | Không dùng                                                   |
| ---------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `payment_method` | phương thức thanh toán | Customer payment `payments.method`: `cash`, `vietqr`.                                                                                                | kênh bán                                                     |
| `cash`           | tiền mặt               | Tiền mặt khách trả.                                                                                                                                  | tiền mặt hiện hữu nếu chưa kiểm đếm két                      |
| `bank_transfer`  | chuyển khoản           | `supplier_payments.payment_method` cho thanh toán NCC; công nợ cập nhật tại đây, còn số dư ngân hàng chỉ giảm qua canonical `bank_transactions.out`. | VietQR ở payment khách; trừ ngân hàng lần hai từ bản ghi NCC |
| `vietqr`         | VietQR                 | QR chuyển khoản liên ngân hàng.                                                                                                                      | QR thanh toán chung                                          |
| `payment_status` | trạng thái thanh toán  | `unpaid` -> `partial` -> `paid`.                                                                                                                     | order status                                                 |
| `payment_close`  | đóng thanh toán POS    | Event xác nhận thanh toán, chuyển order sang `completed`.                                                                                            | served, ready                                                |
| `cash_session`   | ca tiền mặt            | Phiên mở/đóng két, kiểm đếm, chênh lệch.                                                                                                             | ca POS nếu không quản lý tiền mặt                            |

### HĐĐT, thuế, và kế toán HKD

| Canonical term                 | Nhãn chuẩn                    | Định nghĩa                                                                                | Không dùng                                |
| ------------------------------ | ----------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------- |
| `value_added_tax`              | thuế GTGT                     | Thuế GTGT theo cấu hình HKD và luật hiện hành.                                            | doanh thu, lợi nhuận                      |
| `output_vat`                   | GTGT đầu ra                   | Thuế/giá trị thu từ bán ra cần kê khai/nộp theo phương pháp áp dụng.                      | lãi                                       |
| `input_vat`                    | GTGT đầu vào                  | VAT trên hóa đơn NCC; với HKD trực tiếp không mặc định được khấu trừ.                     | credit khấu trừ nếu chưa đúng phương pháp |
| `vat_rate`                     | thuế suất GTGT                | Lưu `NUMERIC(5,2)`, ví dụ `8.00`, `10.00`, `3.00`; không lưu `0.08`.                      | tỷ lệ TNCN                                |
| `personal_income_tax_business` | TNCN từ kinh doanh HKD        | Thuế TNCN của chủ/cá nhân kinh doanh từ hoạt động HKD.                                    | TNCN tiền lương nhân viên                 |
| `tax_invoice`                  | hóa đơn điện tử bán ra        | Hóa đơn bán ra dạng dữ liệu điện tử, có/không có mã CQT theo luật.                        | receipt POS, hóa đơn NCC                  |
| `cash_register_invoice`        | HĐĐT từ máy tính tiền         | HĐĐT khởi tạo từ máy tính tiền kết nối dữ liệu với CQT.                                   | receipt tạm tính                          |
| `supplier_invoice`             | hóa đơn đầu vào / hóa đơn NCC | Chứng từ mua hàng/chi phí từ NCC.                                                         | HĐĐT bán ra                               |
| `purchase_statement`           | bảng kê mua hàng              | Bảng kê khi mua từ người bán hợp pháp không phát hành hóa đơn theo hướng dẫn kế toán HKD. | hóa đơn tự chế                            |
| `cqt_code`                     | mã CQT                        | Mã xác thực HĐĐT sau khi `issued`.                                                        | invoice number                            |
| `invoice_series`               | ký hiệu hóa đơn               | Ký hiệu do provider/CQT cấp.                                                              | số hóa đơn                                |
| `invoice_number`               | số hóa đơn                    | Số hóa đơn do provider/CQT cấp.                                                           | mã CQT                                    |
| `einvoice_provider`            | nhà cung cấp HĐĐT             | Runtime hiện tại: `viettel`.                                                              | CQT                                       |
| `declared_period`              | kỳ kê khai                    | Format `YYYY-MM` hoặc quý/năm theo luật.                                                  | ngày thanh toán POS                       |
| `hkd_accounting_book`          | sổ kế toán HKD                | Sổ doanh thu, thu chi, mua hàng, tồn/kho theo TT 152/2025.                                | BCTC doanh nghiệp                         |
| `cashbook`                     | sổ thu chi / sổ quỹ           | Sổ vận hành theo dõi thu chi tiền.                                                        | general ledger doanh nghiệp               |

Má Tư là `Hộ kinh doanh`, không mặc định là công ty/pháp nhân doanh nghiệp. Không
tự tạo `input VAT credit`, `balance sheet`, `general ledger`, hoặc `BCTC` như
nghĩa vụ pháp định khi chưa có quyết định chuyển mô hình.

### Nhân sự và tiền lương

| Canonical term               | Nhãn chuẩn              | Định nghĩa                                                 | Không dùng                |
| ---------------------------- | ----------------------- | ---------------------------------------------------------- | ------------------------- |
| `employee`                   | nhân viên               | Row `employees`, hồ sơ HR.                                 | user nếu đang nói nhân sự |
| `employment_contract`        | hợp đồng lao động       | Row `employment_contracts`, source cho bảo hiểm/lương.     | thỏa thuận miệng          |
| `employer`                   | người sử dụng lao động  | Phía HKD/chủ hộ khi thuê nhân viên.                        | công ty nếu đang nói HKD  |
| `employee_party`             | người lao động          | Phía nhân viên.                                            | staff role                |
| `social_insurance`           | bảo hiểm xã hội         | Một loại bảo hiểm, không gom cả BHYT/BHTN.                 | bảo hiểm chung            |
| `health_insurance`           | bảo hiểm y tế           | Một loại bảo hiểm riêng.                                   | BHXH                      |
| `unemployment_insurance`     | bảo hiểm thất nghiệp    | Một loại bảo hiểm riêng.                                   | BHXH                      |
| `personal_income_tax_salary` | TNCN tiền lương         | Thuế thu nhập cá nhân từ tiền lương nhân viên.             | TNCN từ kinh doanh HKD    |
| `gross_salary`               | lương gộp               | Lương thỏa thuận trước BH/PIT.                             | lương thực lĩnh           |
| `net_salary`                 | lương thực lĩnh         | Lương gộp - bảo hiểm NLĐ - thuế TNCN - khấu trừ + phụ cấp. | lương gộp                 |
| `insurance_base_salary`      | mức lương đóng bảo hiểm | Căn cứ đóng bảo hiểm, có thể khác gross.                   | gross salary              |
| `payroll_period`             | kỳ lương                | Tháng/năm tính lương.                                      | kỳ kê khai thuế bán hàng  |
| `payroll_entry`              | dòng lương              | Một nhân viên x một kỳ.                                    | payslip file              |

Số luật cụ thể như giảm trừ gia cảnh, trần BHXH, bậc PIT nằm ở
`payroll-pit.md`, `labor-contracts.md`, và `legal-framework-2026.md`. Glossary
không hardcode các số này.

## Label variants

Mỗi thuật ngữ có tối đa ba dạng hiển thị. Chọn theo bề mặt UI, không theo sở
thích.

| Dạng      | Dùng ở                                                             | Điều kiện                                               |
| --------- | ------------------------------------------------------------------ | ------------------------------------------------------- |
| `long`    | heading, table cell, description, form label, tooltip dài          | Mọi canonical term quan trọng đều có `long`             |
| `short`   | button, tab, badge, sidebar nav, mobile chip, table header compact | Chỉ thêm khi `long` dài hoặc xuất hiện trong nav/button |
| `acronym` | KPI card, status pill 2-4 ký tự, icon label, chart legend          | Chỉ dùng khi người đọc đã quen vocabulary               |

Nếu `short == long` thì bỏ cột short. `acronym` phải nằm trong whitelist hoặc là
viết tắt tiếng Việt chính thức. UI chỉ được dùng một biến thể tại một vị trí:
`long`, `short`, hoặc `acronym`; không ghép nhiều biến thể thành một label.

### Tổ chức và địa điểm

| Term                 | Long          | Short | Acronym |
| -------------------- | ------------- | ----- | ------- |
| `tenant`             | Hồ sơ HKD     | HKD   | —       |
| `household_business` | Hộ kinh doanh | HKD   | `HKD`   |
| `branch`             | Chi nhánh     | CN    | —       |
| `branch_warehouse`   | Kho chi nhánh | Kho   | —       |
| `branch_kitchen`     | Bếp chi nhánh | Bếp   | —       |

### Finance/F&B metrics

| Term                     | Long                        | Short          | Acronym |
| ------------------------ | --------------------------- | -------------- | ------- |
| `gross_sales`            | Tổng giá bán trước giảm giá | Giá bán gốc    | —       |
| `net_sales_before_vat`   | Doanh thu thuần             | DT thuần       | —       |
| `total_collected`        | Tổng tiền đã thu            | Đã thu         | —       |
| `cash_collected`         | Tiền mặt đã thu             | Tiền mặt       | —       |
| `bank_wallet_collected`  | Chuyển khoản/ví đã thu      | CK/ví          | —       |
| `issued_invoice_revenue` | Doanh thu HĐĐT đã phát hành | Đã phát hành   | `HĐĐT`  |
| `tax_declared_revenue`   | Doanh thu tính thuế         | DT tính thuế   | —       |
| `food_cost`              | Giá vốn món                 | Giá vốn        | —       |
| `theoretical_food_cost`  | Giá vốn định mức            | Định mức       | —       |
| `actual_food_cost`       | Giá vốn thực tế             | Thực tế        | —       |
| `food_cost_percentage`   | Tỷ lệ giá vốn món           | % giá vốn      | —       |
| `gross_profit`           | Lợi nhuận gộp               | LN gộp         | —       |
| `gross_margin`           | Biên gộp                    | —              | —       |
| `operating_expense`      | Chi phí vận hành            | Chi phí VH     | —       |
| `operating_result`       | Kết quả vận hành            | Kết quả VH     | —       |
| `labor_cost`             | Chi phí nhân công           | Nhân công      | —       |
| `prime_cost`             | Chi phí chính               | —              | —       |
| `inventory_value`        | Giá trị tồn kho             | Tiền trong kho | —       |
| `cash_variance`          | Chênh lệch tiền mặt         | Lệch két       | —       |
| `average_order_value`    | Giá trị trung bình mỗi đơn  | Trung bình/đơn | `AOV`   |

### POS / KDS / bán hàng

| Term               | Long           | Short    | Acronym |
| ------------------ | -------------- | -------- | ------- |
| `order`            | Đơn hàng bán   | Đơn bán  | —       |
| `order_item`       | Dòng món       | Món      | —       |
| `menu_item`        | Món bán        | Món      | —       |
| `kds_ticket`       | Phiếu bếp      | —        | —       |
| `table_session`    | Phiên bàn      | —        | —       |
| `takeaway_context` | Mang về        | —        | —       |
| `pos_session`      | Ca POS         | —        | —       |
| `pending`          | Chờ xử lý      | Chờ      | —       |
| `preparing`        | Đang chế biến  | Đang làm | —       |
| `ready`            | Sẵn sàng       | —        | —       |
| `served`           | Đã phục vụ     | Phục vụ  | —       |
| `completed`        | Hoàn thành POS | Xong     | —       |
| `cancelled`        | Đã hủy         | Hủy      | —       |

### Thanh toán

| Term             | Long                   | Short         | Acronym |
| ---------------- | ---------------------- | ------------- | ------- |
| `payment_method` | Phương thức thanh toán | PT thanh toán | —       |
| `payment_status` | Trạng thái thanh toán  | TT thanh toán | —       |
| `payment_close`  | Đóng thanh toán POS    | Đóng TT       | —       |
| `cash`           | Tiền mặt               | —             | —       |
| `bank_transfer`  | Chuyển khoản ngân hàng | Chuyển khoản  | —       |
| `vietqr`         | VietQR                 | —             | —       |
| `unpaid`         | Chưa thanh toán        | Chưa trả      | —       |
| `partial`        | Thanh toán một phần    | Trả một phần  | —       |
| `paid`           | Đã thanh toán          | —             | —       |

### Procurement / kho / sản xuất

| Term                    | Long                        | Short            | Acronym              |
| ----------------------- | --------------------------- | ---------------- | -------------------- |
| `purchase_order`        | Đơn đặt hàng NCC            | Đơn NCC          | `PO`                 |
| `goods_received_note`   | Phiếu nhập kho              | Phiếu nhập       | `GRN`                |
| `supplier_invoice`      | Hóa đơn NCC                 | HĐ NCC           | —                    |
| `supplier_payment`      | Thanh toán NCC              | Trả NCC          | —                    |
| `stock_level`           | Tồn kho                     | —                | —                    |
| `stock_movement`        | Biến động tồn kho           | Biến động        | —                    |
| `stock_transfer`        | Phiếu điều chuyển nội bộ    | Điều chuyển      | —                    |
| `stock_issue`           | Phiếu xuất kho nội bộ       | Xuất kho         | —                    |
| `consumption`           | Tiêu hao                    | —                | —                    |
| `stocktake`             | Kiểm kê                     | —                | —                    |
| `raw_material`          | Nguyên liệu                 | —                | —                    |
| `finished_good`         | Thành phẩm                  | —                | —                    |
| `recipe`                | Định mức món bán            | Định mức         | Công thức (sản xuất) |
| `production_recipe`     | Công thức sản xuất          | Công thức        | Định mức (POS)       |
| `production_order`      | Lệnh sản xuất               | Lệnh SX          | —                    |
| `three_way_matching`    | Đối soát 3 chứng từ         | Đối soát 3 chiều | —                    |
| `weighted_average_cost` | Giá vốn bình quân gia quyền | Giá vốn BQ       | `WAC`                |

### HĐĐT, thuế, kế toán HKD

| Term                           | Long                        | Short            | Acronym |
| ------------------------------ | --------------------------- | ---------------- | ------- |
| `value_added_tax`              | Thuế giá trị gia tăng       | Thuế GTGT        | `GTGT`  |
| `personal_income_tax_business` | Thuế TNCN từ kinh doanh HKD | TNCN HKD         | `TNCN`  |
| `tax_invoice`                  | Hóa đơn điện tử bán ra      | HĐ điện tử       | `HĐĐT`  |
| `cash_register_invoice`        | HĐĐT từ máy tính tiền       | HĐ máy tính tiền | `HĐĐT`  |
| `supplier_invoice`             | Hóa đơn nhà cung cấp        | HĐ NCC           | —       |
| `purchase_statement`           | Bảng kê mua hàng            | Bảng kê          | —       |
| `cqt_code`                     | Mã Cục Quản lý Thuế         | Mã CQT           | `CQT`   |
| `invoice_series`               | Ký hiệu hóa đơn             | Ký hiệu HĐ       | —       |
| `invoice_number`               | Số hóa đơn                  | Số HĐ            | —       |
| `einvoice_provider`            | Nhà cung cấp HĐĐT           | NCC HĐĐT         | —       |
| `declared_period`              | Kỳ kê khai                  | —                | —       |
| `hkd_accounting_book`          | Sổ kế toán HKD              | Sổ HKD           | —       |
| `cashbook`                     | Sổ thu chi                  | Sổ quỹ           | —       |

### Nhân sự và tiền lương

| Term                         | Long                    | Short         | Acronym        |
| ---------------------------- | ----------------------- | ------------- | -------------- |
| `employee`                   | Nhân viên               | NV            | —              |
| `employment_contract`        | Hợp đồng lao động       | Hợp đồng      | `HĐLĐ`         |
| `employer`                   | Người sử dụng lao động  | NSDLĐ         | `NSDLĐ`        |
| `employee_party`             | Người lao động          | NLĐ           | `NLĐ`          |
| `social_insurance`           | Bảo hiểm xã hội         | BHXH          | `BHXH`         |
| `health_insurance`           | Bảo hiểm y tế           | BHYT          | `BHYT`         |
| `unemployment_insurance`     | Bảo hiểm thất nghiệp    | BHTN          | `BHTN`         |
| `personal_income_tax_salary` | Thuế TNCN tiền lương    | Thuế TNCN     | `TNCN` / `PIT` |
| `gross_salary`               | Lương gộp               | —             | —              |
| `net_salary`                 | Lương thực lĩnh         | Thực lĩnh     | —              |
| `insurance_base_salary`      | Mức lương đóng bảo hiểm | Lương đóng BH | —              |
| `payroll_period`             | Kỳ lương                | —             | —              |
| `payroll_entry`              | Dòng lương              | Lương NV      | —              |

### Bề mặt sản phẩm

| Term                 | Long                 | Short     | Acronym |
| -------------------- | -------------------- | --------- | ------- |
| `admin`              | Quản trị             | —         | —       |
| `admin_overview`     | Tổng quan quản trị   | Tổng quan | —       |
| `finance_basic`      | Tài chính cơ bản HKD | Tài chính | —       |
| `inventory_ops`      | Kho hàng             | —         | —       |
| `content_management` | Quản trị nội dung    | Nội dung  | `CMS`   |
| `employee_portal`    | Trang nhân viên      | Nhân viên | —       |
| `reports`            | Báo cáo              | —         | —       |

## Decision rules cho các cặp dễ drift

### `Tổng tiền đã thu` vs `Doanh thu thuần` vs `HĐĐT`

- `Tổng tiền đã thu` là money collected qua payment đã hoàn tất; dùng trên màn
  chi tiết doanh thu và phải nói rõ có thể gồm VAT.
- `Doanh thu thuần` là `subtotal_revenue - discount_amount`, chưa VAT, dùng làm
  điểm bắt đầu của công thức kết quả theo kỳ.
- `Doanh thu HĐĐT đã phát hành` là giá trị hóa đơn `issued`.
- `Doanh thu tính thuế` là số dùng kê khai HKD theo luật và phương pháp thuế đã
  cấu hình.
- Không suy `Tổng tiền đã thu` hoặc `Doanh thu thuần` thành doanh thu tính thuế
  hay tiền mặt đang giữ; nếu câu hỏi là hóa đơn, dùng
  `Doanh thu HĐĐT đã phát hành`.

### `gross_sales` vs `net_sales_before_vat`

- `gross_sales` là giá menu/list trước giảm giá/refund.
- `net_sales_before_vat` là sau giảm giá/refund và trước VAT.
- Discount làm giảm net sales; VAT không làm tăng doanh thu vận hành.

### `food_cost` vs `purchase_spend` vs `operating_expense`

- `food_cost` là nguyên liệu/bao bì đã tiêu hao hoặc gắn với món bán.
- `purchase_spend` là giá trị mua/nhận từ NCC, có thể vẫn nằm trong tồn kho.
- `operating_expense` là chi phí vận hành không gồm direct ingredient COGS.
- Hóa đơn NCC nguyên liệu không tự động là food cost cho kỳ bán hàng.

### `inventory_value` vs `profit`

- `inventory_value` là tài sản/tồn hiện tại theo quantity x cost.
- Lãi/lỗ chỉ xuất hiện khi có revenue và chi phí/giá vốn trong kỳ.
- Không diễn giải tồn kho cao là lợi nhuận cao.

### `gross_profit` vs `net_operating_profit` vs cash flow

- `gross_profit` = revenue before VAT after discount - food cost.
- `net_operating_profit` trừ thêm labor/opex/other operating items đủ contract.
- Cash flow là dòng tiền vào/ra và settlement; không phải profit.

### `cash_collected` vs `cash_on_hand` vs `cash_variance`

- `cash_collected` là payment method tiền mặt đã thu.
- `cash_on_hand`/`counted_cash` là tiền thực đếm trong két.
- `cash_variance` là chênh giữa thực đếm và kỳ vọng.
- Không dùng `tiền mặt hiện hữu` thay cho doanh thu tiền mặt.

### `supplier_invoice` vs `tax_invoice` vs `receipt`

- `supplier_invoice` là hóa đơn đầu vào từ NCC.
- `tax_invoice`/`HĐĐT` là hóa đơn bán ra.
- `receipt`/phiếu tạm tính là bản in POS, không có mã CQT, không phải chứng từ
  thuế.
- Không dùng `invoice` trần trong specs/code nếu có thể gây nhầm.

### `payment_status` vs `order_status` vs `invoice_status`

- `payment_status` nói về tiền đã trả/chưa trả.
- `order_status` nói về vòng đời đơn POS.
- `invoice_status` nói về HĐĐT draft/submitted/issued/cancelled/replaced.
- Một đơn có thể paid nhưng HĐĐT chưa issued; một phiếu bếp có thể served nhưng
  đơn chưa completed.

### `stock_transfer` vs `stock_issue` vs `consumption`

- `stock_transfer` giữ hàng trong hệ thống tồn kho nhưng đổi site/location stock-bearing.
- `stock_issue` là xuất nội bộ khi runtime có chứng từ issue và không còn tồn ở
  location nhận.
- `consumption` là tiêu hao/giá vốn/hao hụt làm giảm tồn vì sử dụng hoặc bán.
- `Kho chi nhánh -> Bếp chi nhánh` là transfer cùng chi nhánh; dữ liệu nhập từ nguồn khác
  phải giữ nguyên tắc hàng còn tồn ở Bếp chi nhánh cho đến khi có phiếu xuất/tiêu hao.

### `order` vs `purchase_order`

- `order` là đơn bán phát sinh ở POS.
- `purchase_order` là đơn đặt hàng NCC.
- Không dùng label ngắn `Đơn hàng` cho cả sales và procurement trong cùng một
  surface.

### `completed` vs `served`

- `completed` là commercial close: đơn đã thanh toán, bàn release.
- `served` là fulfillment signal: món/đơn đã lên bàn.
- Thanh toán không force KDS ticket sang terminal; bếp vẫn có thể hoàn tất sau
  khi đơn POS đã paid.

### `TNCN từ kinh doanh HKD` vs `TNCN tiền lương`

- `TNCN từ kinh doanh HKD` là thuế của chủ/cá nhân kinh doanh từ hoạt động HKD.
- `TNCN tiền lương` là thuế khấu trừ từ thu nhập nhân viên.
- Không dùng chung một công thức, bảng lương, hoặc label nếu không nói rõ nguồn
  thu nhập.

## Quy tắc theo bề mặt

### Owner Tổng Quan

Owner Tổng Quan không phải finance cockpit. Nó chỉ hiển thị:

1. Tình trạng vận hành cần chú ý: lỗi HĐĐT, print-agent offline, payment mismatch,
   stock alert, cash variance.
2. Công việc chờ xử lý: phiếu, duyệt, đối soát, thiết lập còn thiếu.
3. Lối vào module: Finance, Inventory, HR, POS/KDS settings, Reports.

Card Owner có số tiền hoặc tính toán tài chính phải dùng `finance.*`. Card Owner
có tồn kho hoặc phiếu kho phải dùng `inventory.*`. Nếu chỉ là link điều hướng,
không đặt title như một KPI.

### Finance

Finance Basic hiện có năm card kết quả theo kỳ theo
`docs/modules/finance.md`:

- `finance.revenue.before_vat_after_discount`
- `finance.food_cost.recorded`
- `finance.gross_profit.readonly`
- `finance.expense.operating`
- `finance.operating_result`

`finance.revenue.money_collected` thuộc báo cáo doanh thu chi tiết. Số dư hiện
có và `finance.inventory_value.current` là hai section tách khỏi công thức kết
quả. `net_operating_profit`, `prime_cost`, `labor_cost`, AP aging, cash variance
và HĐĐT recovery là supporting workflow hoặc analysis.

### Inventory

Inventory là workflow-first: phiếu, việc cần xử lý, ngoại lệ, tồn thật, WAC, và
kiểm kê. Analytics phụ trợ không được che mất việc vận hành. Supplier payable
và payment NCC là Finance handoff; Inventory không gọi đó là điều kiện đóng ngày
kho nếu PO/GRN/WAC/stock ledger đã đúng.

### Reports

Reports dùng để drilldown/đối chiếu, không phải chỗ tạo thuật ngữ mới. Mọi chart
label phải dùng canonical metric vocabulary và nêu rõ denominator/scope.

## Quan hệ với các nguồn chuẩn khác

- Metric/card contract: [operational-data-contract.md](operational-data-contract.md)
- Bách khoa nghiệp vụ: [domain-encyclopedia.md](domain-encyclopedia.md)
- Business context HKD: [business-context.md](business-context.md)
- Finance module: [../modules/finance.md](../modules/finance.md)
- Inventory semantics: [inventory.md](inventory.md)
- HĐĐT & thuế GTGT: [einvoice-tax.md](einvoice-tax.md)
- Legal framework register: [legal-framework-2026.md](legal-framework-2026.md)
- Thuế TNCN & lương: [payroll-pit.md](payroll-pit.md)
- HĐLĐ, BHXH: [labor-contracts.md](labor-contracts.md)
- Kiến trúc hệ thống: [../spec/architecture.md](../spec/architecture.md)
- Schema và enum: [../spec/database-schema.md](../spec/database-schema.md)
- Inventory UI labels:
  [../../apps/web/app/(protected)/inventory/\_lib/dictionary.ts](<../../apps/web/app/(protected)/inventory/_lib/dictionary.ts>)
- Module/site/nav labels chung:
  [../../packages/shared/src/labels/vi.ts](../../packages/shared/src/labels/vi.ts)
- Regression rules: [../../tasks/regressions.md](../../tasks/regressions.md)

## Nguồn bên ngoài đã dùng

- NetSuite, restaurant financial metrics:
  <https://www.netsuite.com/portal/resource/articles/accounting/restaurant-financial-metrics.shtml>
- TouchBistro, restaurant metrics:
  <https://www.touchbistro.com/blog/21-restaurant-metrics-and-how-to-calculate-them/>
- MarginEdge, restaurant accounting:
  <https://www.marginedge.com/blog/restaurant-accounting-101>
- Apicbase, restaurant metrics and actual/theoretical food cost:
  <https://get.apicbase.com/essential-restaurant-metrics/>
- FIXE, restaurant bookkeeping glossary:
  <https://www.getmyfixe.com/fixe-restaurant-bookkeeping-glossary/>
- BEP Back Owner control, restaurant back-office glossary:
  <https://bepbackoffice.com/glossary/>
- Restaurant365, prime cost / COGS / labor:
  <https://www.restaurant365.com/blog/how-to-calculate-prime-cost-in-a-restaurant/>
- Toast, sales summary and cash drawer reporting:
  <https://support.toasttab.com/en/article/Sales-Summary-FAQ>,
  <https://support.toasttab.com/en/article/Cash-Drawer-Reports-Overview>
- Black Box Intelligence, RevPASH:
  <https://blackboxintelligence.com/resources/restaurant-glossary/revenue-per-available-seat-hour/>
- meez, actual vs theoretical food cost:
  <https://www.getmeez.com/blog/actual-vs-theoretical-food-costs>
- Chính phủ, NĐ 168/2025 về đăng ký doanh nghiệp/HKD:
  <https://xaydungchinhsach.chinhphu.vn/toan-van-nghi-dinh-168-2025-nd-cp-ve-dang-ky-doanh-nghiep-119250702175708554.htm>
- Chính phủ/Cơ quan thuế, NĐ 68/2026, TT 18/2026, NĐ 141/2026 và HKD:
  <https://xaydungchinhsach.chinhphu.vn/noi-dung-moi-cua-nghi-dinh-68-2026-nd-cp-va-thong-tu-18-2026-tt-btc-nguoi-nop-thue-can-luu-y-119260312140920747.htm>,
  <https://xaydungchinhsach.chinhphu.vn/phuong-phap-tinh-thue-voi-ca-nhan-kinh-doanh-ho-kinh-doanh-119260309100708724.htm>,
  <https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/4/141-ndcp.signed.pdf>
- Cục Thuế/GDT địa phương, hướng dẫn HKD, HĐĐT, tỷ lệ GTGT/TNCN:
  <https://gialai.gdt.gov.vn/wps/portal/news/detail?1dmy=&current=true&urile=wcm%3Apath%3A%2Fgialai%2Fsite%2Fnews%2Fcucthue%2F5e07f89c-32a0-4d6a-aabe-61029a38a6b0>,
  <https://vinhlong.gdt.gov.vn/wps/wcm/connect/VinhLong/site/news/cucthue/69e3ecd6-165e-4594-abd1-473c2cac0e93?presentationTemplate=Lib%2Fpt_new_detail_print>
- HĐĐT/chứng từ điện tử hiện hành từ 01/07/2026:
  <https://vanban.chinhphu.vn/?docid=218689&pageid=27160>
- Thuế TNCN hiện hành từ 01/07/2026:
  <https://vanban.chinhphu.vn/?classid=1&docid=218684&pageid=27160&typegroupid=4>,
  <https://vanban.chinhphu.vn/?docid=218772&pageid=27160>
- TT 152/2025 kế toán HKD:
  <https://vanban.chinhphu.vn/?docid=216533&pageid=27160>

## Khi thêm thuật ngữ mới

Thêm vào glossary này trước hoặc cùng lúc với feature nếu thuật ngữ mới thuộc
một trong các nhóm sau:

- Mở thêm bounded context mới.
- Thêm workflow mới có chứng từ/trạng thái mới.
- Thêm label dễ drift giữa UI, business docs, và code.
- Thêm acronym mới cần dùng lặp lại nhiều nơi.
- Thêm metric/card/title có số liệu hoặc chart/report summary.

Quy trình tối thiểu:

1. Thêm glossary entry đủ `definition`, `not_this`, `scope`, `source_of_truth`.
2. Nếu là số liệu, thêm/tái dùng `contract_key` ở
   `operational-data-contract.md`.
3. Cập nhật dictionary/copy owner đúng tầng.
4. Thêm test/lint guard nếu term có nguy cơ bị Agent tái dùng sai.

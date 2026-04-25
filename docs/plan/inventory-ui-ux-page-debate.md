# Inventory UI/UX Page Debate

> Status: planning draft for discussion.  
> Scope: `/inventory/*` desktop and `/inventory/m/*` mobile.  
> Runtime UI remains unchanged in this document.

## 0. Debate Rule

This document converts the 4-role debate into page-level UI contracts:

- PM decides the primary user job and what must be visible first.
- BA validates workflow rules, document state, business exceptions, and missing states.
- Senior Dev maps the page to existing shadcn primitives and app components.
- QA defines what must be testable by looking at the page and clicking the next action.

Design-system constraints:

- Use the locked shadcn runtime contract: `radix-lyra`, `stone`, `tabler`, semantic tokens.
- No route-specific theme, fake primitive, arbitrary dimensions, or duplicated workflow state.
- Inventory is workflow-first: pending documents, exception queues, and required evidence appear before analytics.
- Branch/site scope stays in URL `?branchId=`.
- Destructive actions are visually separated and confirmed.

## 1. Shared Inventory Shell

### Debate

| Role | Position |
| --- | --- |
| PM | The shell must answer "I am working at which site?" and "which workflow group am I in?" without taking space from the page job. |
| BA | Navigation labels must follow Inventory terminology; storage sites and branch sites need different issue wording. |
| Senior Dev | Keep `InventoryShell`, `Sidebar`, `InventoryHeader`, `InventoryBranchFilter`; improve grouping before page-specific redesign. |
| QA | Every route must preserve selected `branchId` when navigating. Sidebar active state must not break on detail routes. |

### Contract

```text
+--------------------------------------------------------------------------------+
| Sidebar groups: Overview | Procurement | Transfers | Issue/Waste | Control | Data |
+--------------------------------------------------------------------------------+
| Header: [branch/site selector] [page title] [short state]        [primary action]|
+--------------------------------------------------------------------------------+
| Page-owned "next action" strip                                                   |
+--------------------------------------------------------------------------------+
| Main workflow surface                                                            |
+--------------------------------------------------------------------------------+
```

Navigation grouping target:

- Overview: `Tổng quan`, `Tồn kho`
- Procurement: `Đặt hàng NCC`, `Phiếu nhập`, `Hóa đơn NCC`, `Trả NCC`, `Ghi có NCC`
- Flow: `Điều chuyển`, `Xuất kho / Hao hụt kho`
- Waste: `Tạo hao hụt`, `Duyệt hao hụt`, `Phát hiện tự động`
- Control: `Kiểm kê`, `Xử lý lệch`, `Hạn sử dụng`, `Báo cáo`
- Data: `Nguyên liệu`, `Nhà cung cấp`, `Định mức`, `Cài đặt`

## 1A. Domain Model Map

Mục này tách Inventory thành các model vận hành. Khi debate UI, mỗi page phải chỉ ra nó đang đọc/ghi model nào, thao tác nào làm thay đổi trạng thái, và nhân viên cần thấy gì để không phải đoán.

| Model | Nghĩa vận hành | Workflow chính | Page chính | Nhân viên phải nhìn thấy |
| --- | --- | --- | --- | --- |
| `inventory_site` | Điểm tồn kho: CW, CK, branch, bin/khu nếu có | Chọn phạm vi làm việc, chuyển kho, kiểm kê | Shell, Stock, Transfer, Stocktake | Đang làm ở site nào, site loại gì, quyền thao tác nào được phép |
| `ingredient` | Mã nguyên liệu / bán thành phẩm / thành phẩm tồn kho | Catalog, mua hàng, nhận hàng, sản xuất, xuất kho | Ingredients, Stock, PO, GRN, Production | Tên, đơn vị mua, đơn vị tồn, quy đổi, trạng thái dùng/khóa |
| `stock_level` | Số lượng tồn hiện tại theo site/item/lot nếu có | Theo dõi tồn, cảnh báo, kiểm kê | Stock, Dashboard, Expiry, Reports | On hand, reserved/committed nếu có, reorder point, WAC, hạn dùng |
| `stock_movement` | Nhật ký mọi biến động tồn | Audit, báo cáo, điều tra lệch | Stock detail, Reports, document detail | Tăng/giảm từ chứng từ nào, ai xác nhận, lúc nào, giá trị bao nhiêu |
| `supplier` | Nhà cung cấp và điều kiện mua | PO, GRN, invoice, return, credit note | Suppliers, PO, GRN, Invoice | Liên hệ, mặt hàng thường mua, lead time, công nợ/chứng từ mở |
| `purchase_order` | Đề nghị/đơn mua trước khi nhận | Procurement to stock | PO list, PO new, PO detail | Trạng thái, dòng hàng, số lượng còn phải nhận, hành động kế tiếp |
| `goods_received_note` | Phiếu nhận hàng thực tế vào kho | Receiving | Receiving, GRN list, GRN detail, mobile GRN | Supplier, PO link, dòng nhận, lệch giá/số lượng/QC, nút xác nhận |
| `supplier_invoice` | Hóa đơn NCC cần đối chiếu | 3-way match | Supplier invoices | PO-GRN-invoice có khớp không, lệch nào chặn hạch toán |
| `supplier_return` | Trả hàng về NCC | Return and credit | Supplier returns, GRN detail | Dòng trả, lý do, chứng cứ, liên kết credit note |
| `supplier_credit_note` | Ghi nhận giảm trừ từ NCC | Accounting reconciliation | Credit notes | Return/invoice liên quan, số tiền, trạng thái đối chiếu |
| `stock_transfer` | Chuyển hàng giữa CW/CK/branch | Replenishment / internal movement | Transfers, transfer detail, mobile receive | From/to, trạng thái ship/receive, số lượng gửi/nhận/lệch |
| `stock_issue` | Xuất kho nội bộ hợp lệ theo schema | Branch issue / storage loss | Issues, issue detail | Lý do hợp lệ, item, WAC không sửa tay, người xác nhận |
| `waste` | Hao hụt, hủy, mất do vận hành | Waste capture and approval | Waste new, approvals, auto waste | Lý do, bằng chứng, giá trị WAC, cần duyệt hay tự ghi nhận |
| `production_recipe` | BOM/định mức sản xuất hoặc recipe bán | Production readiness | Recipes, Production | Input, output, yield, hao hụt định mức, cảnh báo thiếu |
| `production_order` | Lệnh sản xuất ở CK | Central kitchen production | Production, mobile production | Cần gì, thiếu gì, sản lượng dự kiến/thực tế, post stock như thế nào |
| `stocktake_session` | Kỳ kiểm kê theo site/phạm vi | Count, recount, finalize | Stocktake list, new, detail, count, conflicts | Phạm vi, chế độ blind, tiến độ, lệch, quyền finalize |
| `expiry_alert` | Lô/hàng có rủi ro hạn dùng | Expiry review / write-off | Expiry, Dashboard | Hạn còn lại, qty rủi ro, hành động chuyển dùng/ghi waste |
| `policy_settings` | Quy tắc tồn kho: QC, expiry, approval, period | Governance | Settings, dashboard blockers | Quy tắc nào đang bật, thay đổi ảnh hưởng workflow nào |

Debate trọng tâm:

- Nếu một model có thể đổi trạng thái, page phải có timeline hoặc audit strip.
- Nếu một thao tác làm thay đổi tồn, page phải hiển thị nguồn chứng từ và tác động tồn trước khi xác nhận.
- Nếu nhân viên không có quyền hoặc thiếu điều kiện, nút chính không biến mất im lặng; nó chuyển thành trạng thái disabled có lý do.
- Không có page nào cho phép "sửa tồn tay" như workflow mặc định. Điều chỉnh tồn phải đi qua stocktake, issue/waste, transfer, GRN, hoặc production.

## 1B. Workflow Playbooks

### W1. Procurement To Stock: PO -> GRN -> Stock -> Invoice

Mục tiêu: nhân viên mua/nhận hàng biết cần mua gì, nhận gì, lệch gì, và khi nào hàng đã vào tồn.

| Bước | Page | UI phải hiện | Thao tác chính | Chặn/kiểm tra | Sau khi xong |
| --- | --- | --- | --- | --- | --- |
| 1. Nhận biết cần mua | `/inventory`, `/inventory/stock` | Card `Need reorder`, item dưới min, supplier gợi ý, site đang thiếu | Mở tạo PO từ item | Không có supplier mặc định thì yêu cầu chọn supplier | Đi đến PO new với dòng đã prefill |
| 2. Tạo PO | `/inventory/purchase-orders/new` | Supplier, site nhận, dòng item, đơn vị mua, quy đổi, giá dự kiến, ngày cần hàng | Lưu nháp hoặc gửi PO | Thiếu supplier, item inactive, quy đổi sai, qty <= 0 | PO detail trạng thái Draft/Sent |
| 3. Theo dõi PO | `/inventory/purchase-orders/[id]` | Status stepper: Draft -> Sent -> Partial Received -> Closed | Gửi NCC, sửa nháp, tạo GRN | Không sửa dòng đã nhận nếu ảnh hưởng GRN | PO vào queue receiving |
| 4. Nhận hàng | `/inventory/grn/[id]` hoặc mobile GRN | Dòng PO bên trái, dòng nhận thực tế bên phải, lệch qty/price/QC | Nhập số nhận, chọn QC pass/fail, thêm ảnh/note | Nhận vượt tolerance, item không thuộc PO, period đóng | GRN Ready to post |
| 5. Post GRN | GRN detail | Tóm tắt tác động tồn: +qty, site, WAC dự kiến, chứng từ liên quan | Confirm receive | Thiếu quyền, thiếu QC, mismatch chưa xử lý | Tồn tăng, PO cập nhật received |
| 6. Đối chiếu invoice | `/inventory/supplier-invoices` | 3 cột PO / GRN / Invoice, lệch màu rõ | Match, mark exception, approve | Invoice không khớp tolerance | Hạch toán hoặc tạo exception |
| 7. Return/Credit nếu lỗi | `/inventory/supplier-returns`, `/inventory/supplier-credit-notes` | Dòng trả, lý do, liên kết GRN/invoice | Tạo return, ghi credit note | Không trả quá số đã nhận còn tồn | Tồn giảm hoặc credit đối chiếu |

Đủ cho nhân viên sử dụng khi:

- Mở dashboard là thấy PO/GRN nào cần xử lý hôm nay.
- Tạo GRN không cần nhớ PO đang ở đâu; từ PO detail có nút tạo GRN và từ receiving hub có queue.
- Mỗi dòng nhận hàng có trạng thái riêng: ok, thiếu, dư, lỗi QC, cần duyệt.
- Xác nhận GRN luôn cho xem tác động tồn trước khi post.

### W2. Transfer: CW/CK/Branch Movement

Mục tiêu: chuyển kho không nhầm nguồn/đích, không mất dấu hàng đang đi đường, và mobile nhận hàng đủ nhanh.

| Bước | Page | UI phải hiện | Thao tác chính | Chặn/kiểm tra | Sau khi xong |
| --- | --- | --- | --- | --- | --- |
| 1. Nhìn queue chuyển | `/inventory/transfers` | Tabs: Need to ship, In transit, Need to receive, Exceptions | Mở transfer hoặc tạo mới | Scope URL phải rõ site nguồn/đích | Người dùng thấy đúng việc của site mình |
| 2. Tạo transfer | Transfer create pattern từ list/detail | From site, to site, dòng item, available qty, unit, note | Save draft, submit, ship | Không đủ tồn, from/to sai loại, period đóng | Transfer chờ ship hoặc in phiếu |
| 3. Ship hàng | `/inventory/transfers/[id]` | Pick list, packed qty, người ship, time | Confirm ship | Qty ship > available, thiếu dòng bắt buộc | Hàng vào trạng thái in transit |
| 4. Nhận hàng | Mobile transfer receive | Card từng transfer, dòng item lớn dễ bấm, shipped vs received | Confirm receive, report variance | Nhận lệch phải bắt lý do/ảnh nếu vượt tolerance | Tồn tăng ở site nhận, variance vào exception |
| 5. Xử lý lệch | Transfer detail | Variance panel, movement timeline | Approve variance hoặc tạo follow-up | Thiếu quyền duyệt | Transfer closed hoặc pending approval |

Đủ cho nhân viên sử dụng khi:

- List mặc định lọc theo "việc tôi cần làm", không bắt nhân viên hiểu toàn bộ network.
- Trên mobile, nhận hàng chỉ cần mở transfer, nhập số nhận, xác nhận; lệch mới mở thêm lý do.
- Transfer detail có timeline rõ: created, shipped, received, variance, closed.

### W3. Branch Replenishment And Internal Issue

Mục tiêu: branch biết hàng nào thiếu, hàng nào cần xuất/ghi nhận hao hụt theo lý do hợp lệ, không dùng đường tắt sửa tồn.

| Bước | Page | UI phải hiện | Thao tác chính | Chặn/kiểm tra | Sau khi xong |
| --- | --- | --- | --- | --- | --- |
| 1. Branch nhận cảnh báo | `/inventory`, `/inventory/stock` | Low stock, expiry risk, pending transfer | Request transfer hoặc mở item | Không có quyền tạo transfer thì hiện người phụ trách | Queue chuyển kho hoặc yêu cầu bổ sung |
| 2. Nhận transfer | Mobile transfer receive | Transfer inbound của branch | Confirm receive | Variance cần lý do | Stock branch cập nhật |
| 3. Xuất nội bộ hợp lệ | `/inventory/issues` hoặc issue detail | Loại issue hợp lệ trong schema, dòng item, WAC chỉ đọc | Create issue | Không dùng `kitchen_use` nếu enum đã retire; không cho sửa WAC | Tồn giảm và movement có audit |
| 4. Ghi hao hụt vận hành | `/inventory/waste/new` | Item, qty, reason, evidence, cost impact | Submit waste | Vượt ngưỡng cần duyệt | Waste pending hoặc posted |

Đủ cho nhân viên sử dụng khi:

- Branch manager không cần biết model nội bộ; họ thấy "Cần nhận hàng", "Sắp hết", "Sắp hết hạn", "Cần kiểm kê".
- Mọi thao tác giảm tồn hiển thị giá trị ảnh hưởng bằng WAC nhưng không cho nhập giá tùy ý.
- Lý do xuất/hao hụt được chọn từ danh sách chuẩn, không nhập text tự do làm hỏng báo cáo.

### W4. Central Kitchen Production

Mục tiêu: CK biết có đủ nguyên liệu để sản xuất không, sản xuất xong tồn input/output thay đổi như thế nào.

| Bước | Page | UI phải hiện | Thao tác chính | Chặn/kiểm tra | Sau khi xong |
| --- | --- | --- | --- | --- | --- |
| 1. Kiểm tra readiness | `/inventory/production` | Recipe/order cards: can produce, missing input, blocked | Chọn production order | Thiếu input, recipe inactive | Mở order detail hoặc tạo transfer request |
| 2. Quản lý BOM | `/inventory/recipes` | Output item, input list, yield, loss allowance | Create/update recipe | Unit conversion thiếu, duplicate ingredient, invalid yield | Recipe ready for production |
| 3. Tạo lệnh sản xuất | Production hub/detail | Output target qty, required inputs, expected cost | Start order | Không đủ tồn input nếu policy chặn | Order in progress |
| 4. Confirm sản xuất | Production detail/mobile | Actual input used, actual output, variance, cost impact | Post production | Variance vượt ngưỡng cần lý do/duyệt | Input giảm, output tăng, movement audit |

Đủ cho nhân viên sử dụng khi:

- Production hub không chỉ là bảng; nó phải trả lời câu "hôm nay làm được món nào, thiếu gì".
- Khi thiếu input, UI đưa thẳng đến transfer/request thay vì chỉ báo lỗi.
- Confirm production có preview biến động tồn input/output.

### W5. Waste And Evidence

Mục tiêu: hao hụt được ghi nhanh, đủ bằng chứng, và rõ trường hợp nào cần duyệt.

| Bước | Page | UI phải hiện | Thao tác chính | Chặn/kiểm tra | Sau khi xong |
| --- | --- | --- | --- | --- | --- |
| 1. Tạo waste | `/inventory/waste/new` | Site, item search, qty, reason, evidence, WAC impact | Submit | Qty > on hand, reason thiếu, threshold vượt | Posted hoặc pending approval |
| 2. Duyệt waste | `/inventory/waste/approvals` | Queue theo risk/cost, evidence preview, requester | Approve/reject/request info | Thiếu quyền duyệt | Tồn giảm hoặc trả về người tạo |
| 3. Auto waste | `/inventory/waste/auto` | Rule-generated candidates, confidence, source event | Review/post batch | Candidate không đủ dữ liệu thì cần manual review | Waste movement posted |

Đủ cho nhân viên sử dụng khi:

- Nhân viên sàn tạo waste trong dưới một phút trên mobile/desktop.
- Người duyệt nhìn thấy cost impact và bằng chứng trước nút approve.
- Auto waste không post mù; luôn có queue và audit.

### W6. Stocktake: Count, Recount, Conflict, Finalize

Mục tiêu: kiểm kê đủ chặt để tránh sửa tồn tùy tiện nhưng vẫn dễ thao tác khi đếm thực tế.

| Bước | Page | UI phải hiện | Thao tác chính | Chặn/kiểm tra | Sau khi xong |
| --- | --- | --- | --- | --- | --- |
| 1. Tạo kỳ kiểm kê | `/inventory/stocktake/new` | Site, scope, categories/items, blind mode, freeze window | Start session | Scope thiếu, session overlap, period đóng | Session active |
| 2. Đếm | `/inventory/stocktake/[id]/count` | One-item focus, unit, expected hidden nếu blind, progress | Enter count, mark unavailable, add note | Negative count, invalid unit | Count saved, next item |
| 3. Review detail | `/inventory/stocktake/[id]` | Progress, counted/unaccounted, variance summary, evidence | Request recount, finalize if clear | Uncounted items, unresolved variance | Ready to finalize hoặc conflict queue |
| 4. Resolve conflict | `/inventory/stocktake/conflicts` | Variance sorted by value/risk, count history, movement history | Accept count, request recount, adjust via RPC | Conflict resolution must go through RPC, not client math | Posted stock adjustment with audit |
| 5. Finalize | Stocktake detail | Final impact preview: qty/value by item | Confirm finalize | Missing approval, period closed | Stock levels updated |

Đủ cho nhân viên sử dụng khi:

- Người đếm chỉ thấy màn hình đếm, không bị kéo vào báo cáo.
- Blind mode thực sự không lộ expected qty trên counting surface.
- Conflict page giải thích vì sao lệch, không chỉ hiện số âm/dương.

### W7. Expiry And Write-Off

Mục tiêu: hàng sắp hết hạn được xử lý chủ động trước khi thành waste lớn.

| Bước | Page | UI phải hiện | Thao tác chính | Chặn/kiểm tra | Sau khi xong |
| --- | --- | --- | --- | --- | --- |
| 1. Review risk | `/inventory/expiry` | Tabs: today, 3 days, 7 days, expired; qty and value | Filter by site/category | Không có lot/expiry thì flag data quality | Chọn hành động |
| 2. Hành động | Expiry page/detail | Options theo policy: transfer, use first, waste/write-off | Create transfer, create waste, mark reviewed | Expired item không cho move nếu policy chặn | Action document created |
| 3. Theo dõi | Dashboard/report | Open expiry actions | Close follow-up | Follow-up quá hạn | Risk reduced |

Đủ cho nhân viên sử dụng khi:

- Hàng có rủi ro cao xuất hiện ngay dashboard.
- Mỗi item có hành động rõ ràng, không chỉ là cảnh báo.

### W8. Catalog And Import

Mục tiêu: master data đủ sạch để các workflow không vỡ ở lúc thao tác.

| Bước | Page | UI phải hiện | Thao tác chính | Chặn/kiểm tra | Sau khi xong |
| --- | --- | --- | --- | --- | --- |
| 1. Ingredient catalog | `/inventory/ingredients` | Status, units, conversions, default supplier, reorder config | Create/edit/import | Unit conversion missing, inactive item in active recipe | Item usable in PO/GRN/stock |
| 2. Supplier catalog | `/inventory/suppliers` | Active suppliers, linked items, contact, lead time | Create/edit/import | Duplicate supplier, missing required contact if policy | Supplier usable in PO |
| 3. Recipe catalog | `/inventory/recipes` | Output, input, yield, cost preview | Create/edit/import BOM | Invalid conversion, missing ingredient | Recipe usable in production |

Đủ cho nhân viên sử dụng khi:

- Catalog list có cột "Ready / Blocked" để thấy dữ liệu nào chưa dùng được.
- Import không chỉ báo fail; nó chỉ dòng lỗi, cột lỗi, và cách sửa.

### W9. Settings, Period, And Policy

Mục tiêu: OPS biết rule nào đang chi phối workflow, nhưng nhân viên thường ngày không bị lộ cấu hình phức tạp.

| Bước | Page | UI phải hiện | Thao tác chính | Chặn/kiểm tra | Sau khi xong |
| --- | --- | --- | --- | --- | --- |
| 1. QC settings | `/inventory/settings/*` | Tolerance, required evidence, approval thresholds | Update policy | Thay đổi phải audit | Workflow nhận hàng/waste áp dụng rule mới |
| 2. Expiry settings | Settings + Expiry | Warning windows, action rules | Update policy | Rule mâu thuẫn | Expiry alerts recalculated |
| 3. Period close | Settings/report area | Open/closed period, blockers, unposted docs | Close/reopen if allowed | Unresolved stocktake/GRN/transfer | Period locked |

Đủ cho nhân viên sử dụng khi:

- Nhân viên không phải vào settings để hiểu vì sao bị chặn; blocker xuất hiện ngay page thao tác.
- OPS có một nơi xem toàn bộ rule ảnh hưởng Inventory.

## 1C. Staff Journey View

### Warehouse Operator At CW

```text
Dashboard -> Receiving queue -> GRN detail -> Stock check -> Transfer outbound -> Transfer detail
```

UI cần ưu tiên:

- Bảng việc theo ngày, không phải dashboard marketing.
- Nút chính theo trạng thái: `Receive`, `Post GRN`, `Ship transfer`.
- Mobile receiving dùng item rows lớn, ít text, thao tác được khi đang ở kho.

### Central Kitchen Operator

```text
Dashboard -> Transfer receive -> Production readiness -> Production order -> Finished goods transfer
```

UI cần ưu tiên:

- Production hub trả lời "hôm nay làm gì được".
- Thiếu nguyên liệu phải có đường đi tiếp: nhận transfer, request transfer, hoặc đổi kế hoạch.
- Confirm production preview cả input giảm và output tăng.

### Branch Manager

```text
Dashboard -> Receive transfer -> Stock risk -> Waste / Issue -> Stocktake count
```

UI cần ưu tiên:

- First viewport chỉ có việc branch cần làm.
- Cảnh báo tồn thấp/hết hạn chuyển thành hành động cụ thể.
- Mobile count/waste phải thao tác được bằng một tay, không dùng bảng dày.

### OPS / Accounting

```text
Dashboard -> Supplier invoice match -> Returns / credit notes -> Reports -> Period close
```

UI cần ưu tiên:

- Màn hình đối chiếu chứng từ, không chỉ danh sách.
- Lệch PO/GRN/invoice có mức nghiêm trọng và owner xử lý.
- Period close có checklist blocker rõ ràng.

## 1D. Enough For Staff To Use Checklist

Một page Inventory được coi là đủ dùng cho nhân viên khi đạt các điều kiện này:

1. First viewport trả lời được: tôi đang ở site nào, việc gì đang cần làm, nút chính là gì.
2. Chỉ có một primary action theo trạng thái hiện tại; action phụ và destructive action được tách khỏi đường chính.
3. Mọi action bị khóa đều có lý do và cách xử lý tiếp theo.
4. Mỗi status gắn với next step cụ thể, không chỉ là label màu.
5. Empty state phải recoverable: tạo mới, import, đổi filter, hoặc xem tài liệu vận hành.
6. Mobile page không dùng bảng desktop thu nhỏ; mỗi thao tác chính là card/list row có target bấm đủ lớn.
7. Detail page phải có 4 vùng: summary, line items, blockers/exceptions, timeline/audit.
8. List page mặc định lọc theo "việc tôi có thể xử lý", sau đó mới cho mở rộng tất cả.
9. Không workflow nào cho sửa tồn trực tiếp; mọi thay đổi tồn đi qua chứng từ hoặc RPC có audit.
10. Success state phải nói rõ chứng từ tiếp theo hoặc queue tiếp theo, ví dụ "GRN posted, PO còn 2 dòng chưa nhận".

## 2. `/inventory` - Work Queue Dashboard

### Debate

| Role | Position |
| --- | --- |
| PM | This page should be a command center, not a KPI dashboard. First scan target is work due now. |
| BA | Queues must separate document types: GRN, transfer, waste approval, stocktake, expiry, period close. |
| Senior Dev | Compose from `Card`, `Badge`, `Button`, `Table`, `Sheet`; keep `AlertsDrawer` and location breakdown. |
| QA | A user should know the next page to open within five seconds. Counts must link to filtered lists. |

### Target Layout

```text
+--------------------------------------------------------------------------------+
| Tổng quan kho - CN Đất Đỏ                                  [Tạo nhanh] [Refresh]|
+--------------------------------------------------------------------------------+
| Việc cần làm ngay                                                              |
| [GRN cần confirm: 3] [Transfer cần nhận: 2] [Waste cần duyệt: 5] [Kiểm kê mở: 1]|
+------------------------------------------+-------------------------------------+
| Tồn theo location                         | Cảnh báo ưu tiên                    |
| Kho CN          128 SKU       42.000.000  | Hết hàng: Gạo tấm                   |
| Bếp CN           41 SKU        8.000.000  | Sắp hết hạn: Sườn ướp               |
| Đang vận chuyển   7 SKU                   | Transfer treo: TR-128               |
+------------------------------------------+-------------------------------------+
| Dòng việc mới nhất: PO, GRN, Transfer, Stocktake, Issue                         |
+--------------------------------------------------------------------------------+
```

### Components

- `InventoryHeader`: title, selected site, refresh action.
- `TaskQueueStrip`: repeated `Button`/`Badge` links, one per actionable queue.
- `LocationBreakdownTable`: visible without a drawer.
- `AlertsDrawer`: right-side full list.
- `RecentWorkflowTable`: compact activity rows.

### Acceptance

- No analytics card appears above actionable queue unless it changes the next action.
- Location breakdown shows `Kho CN`, `Bếp CN`, and in-transit ownership where available.
- Empty state says what to do next, not "no data" only.

## 3. `/inventory/stock` - Stock Workspace

### Debate

| Role | Position |
| --- | --- |
| PM | Main job is to find risky items and choose the correct follow-up flow. |
| BA | Stock should not invite manual edits as the normal path. Users should go to GRN, transfer, stocktake, waste, or issue. |
| Senior Dev | Use dense `Table` on desktop, row `Sheet` for movements, mobile cards for risk-first list. |
| QA | Low/out/expired states must have a visible next action and must preserve branch scope. |

### Target Layout

```text
+--------------------------------------------------------------------------------+
| Tồn kho - CN Đất Đỏ                     [Nhập GRN] [Điều chuyển] [Kiểm kê]      |
+--------------------------------------------------------------------------------+
| Filters: [Search SKU/name] [Location] [Risk: all/low/out/over/date] [Category]  |
+--------------------------------------------------------------------------------+
| Table                                                                           |
| Item | Location | On hand | Available | Risk | WAC | Value | Next action        |
+--------------------------------------------------------------------------------+
| Row detail Sheet: last movements, thresholds, active transfers, related docs     |
+--------------------------------------------------------------------------------+
```

### Components

- `DataTable`, `InputGroup`, `Select`, `Badge`, `Sheet`.
- Row actions: `Nhập GRN`, `Tạo transfer`, `Kiểm kê`, `Tạo hao hụt`.
- Detail sheet: movement timeline, thresholds, WAC read-only.

### Acceptance

- No editable WAC or direct quantity edit in the default table.
- Risk filters are mutually clear; "all" is reversible.
- Row action labels change by branch kind where required.

## 4. `/inventory/receiving` - Receiving Hub

### Debate

| Role | Position |
| --- | --- |
| PM | This page should explain the procurement pipeline at a glance. |
| BA | Procurement is valid only for CW/CK sites; branch sites should not be pushed into NCC receiving. |
| Senior Dev | Use three workflow columns, not a generic dashboard. |
| QA | Empty supplier/PO prerequisites must be visible before the user tries to create a GRN. |

### Target Layout

```text
+--------------------------------------------------------------------------------+
| Nhập hàng HQ                                             [Tạo PO] [Phiếu nhập]  |
+--------------------------------------------------------------------------------+
| 1. Đặt hàng NCC        | 2. Nhận hàng / GRN        | 3. Hóa đơn / đối soát      |
| PO draft/sent          | GRN draft/needs confirm    | Invoice pending/mismatch   |
| [Mở PO] [Tạo PO]       | [Mở GRN] [Từ PO]           | [Mở hóa đơn]               |
+--------------------------------------------------------------------------------+
| Recent activity table: document, supplier, site, status, next action            |
+--------------------------------------------------------------------------------+
```

### Acceptance

- If selected site is not CW/CK, show blocked/redirect guidance instead of fake actions.
- Counts link to their list pages with equivalent filters.

## 5. `/inventory/purchase-orders` - PO List

### Debate

| Role | Position |
| --- | --- |
| PM | User needs to know which PO is draft, sent, partially received, or ready for GRN. |
| BA | PO status must be derived from GRN confirmation logic, not edited from list UI. |
| Senior Dev | Keep table; add status tabs and "next action" column. |
| QA | A sent PO with no GRN should expose "Tạo GRN"; a received PO should not. |

### Target Layout

```text
Tabs: [Cần xử lý] [Nháp] [Đã gửi] [Nhận một phần] [Hoàn tất] [Đã hủy]
Toolbar: [Search PO/NCC] [Supplier] [Site] [Date range]
Table: PO | NCC | Site | Status | Ordered date | Received progress | Next action
```

### Components

- `Tabs`, `DataTable`, `StatusBadge`, `Button`.
- Empty states by tab: "Không có PO cần xử lý", with a route to create if allowed.

## 6. `/inventory/purchase-orders/new` - Create PO

### Debate

| Role | Position |
| --- | --- |
| PM | Create PO should feel like guided buying, not a blank spreadsheet. |
| BA | Suggested quantity comes from stock/reorder context; user must still review supplier/site and line prices. |
| Senior Dev | Use a stepper layout plus sticky footer; avoid multiple unrelated cards above line items. |
| QA | Cannot submit without supplier, site, and at least one valid line. Price deviation hints must appear before submit. |

### Target Layout

```text
+--------------------------------------------------------------------------------+
| Tạo đơn đặt hàng                                      [Hủy] [Lưu nháp/Gửi NCC] |
+--------------------------------------------------------------------------------+
| Step 1: NCC + site + period                                                     |
+--------------------------------------------------------------------------------+
| Step 2: Gợi ý đặt hàng                                                          |
| [reorder suggestions] [add all] [add selected]                                  |
+--------------------------------------------------------------------------------+
| Step 3: Dòng đặt hàng                                                           |
| Ingredient | Qty | Unit | Unit price | Deviation hint | Remove                  |
+--------------------------------------------------------------------------------+
| Sticky footer: total lines, estimated value, validation summary, submit          |
+--------------------------------------------------------------------------------+
```

### Components

- `Combobox`, `Select`, `Table`, `Badge`, `Alert`, `Button`.
- Line editor can remain inline, but row validation must be visible next to the row.

## 7. `/inventory/purchase-orders/[id]` - PO Detail

### Debate

| Role | Position |
| --- | --- |
| PM | Detail page must make the document state and next legal action obvious. |
| BA | Draft can send/cancel; sent can create GRN; received is mostly read-only. |
| Senior Dev | Keep `TimelineStepper`; move summary into a right rail and line table into main area. |
| QA | Primary action must change by status and must be disabled with reason when blocked. |

### Target Layout

```text
Header: PO #... | status | supplier | [primary action]
Stepper: Draft -> Sent -> Partially received -> Received
Main: ordered line table with received qty and variance
Right rail: supplier terms, totals, linked GRNs, audit notes
Footer: Back | Cancel draft | Send PO / Create GRN
```

## 8. `/inventory/grn` - GRN List

### Debate

| Role | Position |
| --- | --- |
| PM | GRN list should prioritize receiving documents that are not confirmed. |
| BA | GRN creates stock only when confirmed; draft/dirty lines need a clear warning. |
| Senior Dev | Status tabs plus table, not a generic all-history table first. |
| QA | Draft GRN must navigate to editable detail; confirmed GRN should be read-only by default. |

### Target Layout

```text
Tabs: [Cần confirm] [Nháp] [Đã confirm] [Có trả NCC] [Tất cả]
Table: GRN | NCC | PO | Site | Received date | Variance | Status | Next action
```

## 9. `/inventory/grn/[id]` - GRN Detail

### Debate

| Role | Position |
| --- | --- |
| PM | This is an operational checking page; the line table is the product. |
| BA | Confirm must be blocked by dirty lines, missing qty, invalid price variance evidence, cold-chain review, or hard block. |
| Senior Dev | Use editable row components, variance column, QC side panel, and sticky footer. |
| QA | User can tell exactly why confirm is disabled. No raw DB errors. |

### Target Layout

```text
+--------------------------------------------------------------------------------+
| GRN #... - NCC X                         [Lưu thay đổi] [Confirm GRN]          |
+--------------------------------------------------------------------------------+
| Guard strip: Dirty lines? Price variance? Cold-chain? Evidence?                |
+--------------------------------------------------------------------------------+
| Line table                                                                         |
| Item | PO qty | Received qty | Unit | Price | Variance | QC | Expiry | Status   |
+--------------------------------------------------------------------------------+
| Side/Sheet: baseline, override evidence, supplier history, linked PO/invoice    |
+--------------------------------------------------------------------------------+
```

### Components

- `GrnLineVarianceColumn`, `AutoApproveEvalPanel`, `HardblockOverrideDialog`.
- `Alert`, `Badge`, `Table`, `Input`, `Select`, `Date input`, `Photo/PDF evidence` where implemented.

## 10. `/inventory/supplier-invoices` - Supplier Invoice Matching

### Debate

| Role | Position |
| --- | --- |
| PM | User should reconcile one invoice at a time while scanning the backlog. |
| BA | Matching status and payment status are separate; do not collapse them into one badge. |
| Senior Dev | Master-detail layout: table left, invoice detail right. |
| QA | Recompute matching and mark paid actions must be permission-aware and not hide mismatches. |

### Target Layout

```text
Left: invoice queue table
Right detail:
  Invoice summary
  Matching: PO vs GRN vs Invoice
  Payment: due date, paid amount, outstanding
  Actions: recompute match, mark paid
```

## 11. `/inventory/supplier-returns` - Supplier Returns

### Debate

| Role | Position |
| --- | --- |
| PM | Return page should answer why goods leave stock and which GRN caused it. |
| BA | Return source must be GRN/rejected items; return method and credit note linkage matter. |
| Senior Dev | Keep table; create flow should usually start from GRN detail when possible. |
| QA | Return rows show GRN, supplier, reason, handling method, value, and status. |

### Target Layout

```text
Table: Return no | Supplier | Site | GRN | Source | Reason | Handling | Value | Status
Detail action: open return, link GRN, link credit note
```

## 12. `/inventory/supplier-credit-notes` - Credit Notes

### Debate

| Role | Position |
| --- | --- |
| PM | User needs to see available credits and apply them to invoices. |
| BA | Credit remaining, applied amount, and invoice target must stay separate. |
| Senior Dev | Table plus apply dialog is enough; no dashboard chrome. |
| QA | Cannot apply more than remaining credit or to an invalid invoice. |

### Target Layout

```text
Table: Credit note | Supplier | Type | Return | Total | Applied | Remaining | Status | Invoice applied
Dialog: choose open invoice -> preview remaining -> apply
```

## 13. `/inventory/transfers` - Transfer Queue

### Debate

| Role | Position |
| --- | --- |
| PM | This page is a logistics queue. Sort by action: receive, ship, in transit, history. |
| BA | Transfer direction must follow valid CW/CK/branch rules. Intra-branch transfer replaces retired `kitchen_use`. |
| Senior Dev | Replace raw tab buttons with `Tabs`; keep create dialog tabs for inbound/outbound/internal. |
| QA | A receiving user sees "Cần nhận" first; a shipper sees "Cần xuất" first when appropriate. |

### Target Layout

```text
Tabs: [Cần nhận] [Cần xuất] [Đang vận chuyển] [Nháp] [Lịch sử]
Table: Transfer | Route | Status | Created | Ship/receive date | Next action
Create dialog:
  [Phiếu nhập] [Phiếu xuất] [Nội bộ]
  From | To | Lines | Notes
```

## 14. `/inventory/transfers/[id]` - Transfer Detail

### Debate

| Role | Position |
| --- | --- |
| PM | Transfer detail should behave like a checklist from ship to receive. |
| BA | SL giao và SL nhận có thể khác; lý do chênh lệch phải được ghi nhận. |
| Senior Dev | Timeline plus line table, with editable receive qty only in receive stage. |
| QA | Confirm receive cannot silently accept discrepancies without reason. |

### Target Layout

```text
Header: Transfer #... | route | [primary action]
Stepper: Draft -> Confirmed ship -> In transit -> Receiving -> Received
Line table: item | sent qty | received qty | variance | reason
Right rail: route, actors, timestamps, notes
Footer: Back | Cancel | Confirm ship / Start receive / Confirm receive
```

## 15. `/inventory/issues` - Issue / Storage Loss List

### Debate

| Role | Position |
| --- | --- |
| PM | User needs a clear distinction between branch consumption and storage loss. |
| BA | `issue_type='consumption'` label depends on `branch_kind`; do not show a static "Tiêu hao" everywhere. |
| Senior Dev | Keep list table; create dialog should start by choosing issue surface based on selected site. |
| QA | `kitchen_use` must not be reintroduced. WAC is system-derived, not editable. |

### Target Layout

```text
Tabs: [Nháp] [Cần confirm] [Đã confirm] [Đã hủy]
Table: Issue no | Issue surface | Site | Created date | Status | Next action
Create dialog: Site -> issue type -> lines -> note
```

## 16. `/inventory/issues/[id]` - Issue Detail

### Debate

| Role | Position |
| --- | --- |
| PM | The page should make the issue safe to confirm or easy to cancel before posting. |
| BA | Confirm writes stock movement using strict WAC; user should not edit unit cost. |
| Senior Dev | Line table with add/remove while draft; sticky footer for confirm/cancel. |
| QA | Confirm disabled if lines are empty, WAC not ready, or period is closed. |

### Target Layout

```text
Header: Issue #... | surface | status | [Confirm]
Guard strip: WAC readiness, period close, line validation
Line table: item | qty | unit | WAC snapshot/readiness | value | remove
Footer: Back | Cancel issue | Confirm issue
```

## 17. `/inventory/waste/new` - Create Waste

### Debate

| Role | Position |
| --- | --- |
| PM | This form should guide evidence capture first; tier preview must be visible before submit. |
| BA | Photo/evidence rules depend on value, qty ratio, reason, shift cap, branch daily cap. |
| Senior Dev | Use form sections, tier badges, photo upload, reason dropdown, sticky footer. |
| QA | Tier 1/2 requirement is mirrored client-side but server remains authoritative. |

### Target Layout

```text
Header: Tạo phiếu hao hụt
Section 1: Site/location + shift cap meter
Section 2: Waste lines
  item | qty | reason | estimated value | tier preview | photo/evidence
Section 3: Note and summary
Footer: Add line | Save draft | Submit
```

## 18. `/inventory/waste/approvals` - Waste Approval Queue

### Debate

| Role | Position |
| --- | --- |
| PM | This is an approval inbox; every card must show enough evidence to decide. |
| BA | Self-created waste cannot be approved by the same user. Tier 2 needs proper evidence. |
| Senior Dev | Use approval cards or table with detail expansion; destructive reject uses confirmation. |
| QA | Approve/reject states update locally and cannot approve missing evidence. |

### Target Layout

```text
Queue cards:
  Issue no | site | creator | value | reason | tier | photo/evidence | age
  [Reject] [Approve]
Resolved section collapsed below
```

## 19. `/inventory/waste/auto` - Auto Waste

### Debate

| Role | Position |
| --- | --- |
| PM | User needs to understand which POS/KDS event created the waste. |
| BA | POS return and KDS cancel have different note/photo requirements. Auto waste failure must be non-fatal to parent POS/KDS action. |
| Senior Dev | Use source cards with links to approval queue and source order/ticket. |
| QA | Card clearly labels `pos_return`, `kds_cancel_before`, `mid`, `after`; no phantom zero-qty rows. |

### Target Layout

```text
Cards: source | order/ticket | stage | item | qty/value | status | next action
```

## 20. `/inventory/production` - Central Kitchen Hub

### Debate

| Role | Position |
| --- | --- |
| PM | Bếp trung tâm needs readiness first: can I produce or what is blocking me? |
| BA | Production requires CK site, BOM, raw stock, finished good output, and transfer after production. |
| Senior Dev | Split into `Orders`, `BOM`, `Readiness`; keep mobile production path task-led. |
| QA | Confirm production disabled when BOM or raw stock is missing, with clear reason. |

### Target Layout

```text
Header: Bếp trung tâm                                      [Tạo lệnh sản xuất]
Readiness strip: BOM thiếu | nguyên liệu thiếu | lệnh draft | cần chuyển CN
Tabs: [Lệnh sản xuất] [BOM thành phẩm] [Nguyên liệu cần bổ sung]
Order table: order | CK site | finished good | qty | status | cost | next action
```

## 21. `/inventory/stocktake` - Stocktake List

### Debate

| Role | Position |
| --- | --- |
| PM | If a session is open, "continue counting" must beat "create new". |
| BA | Only one in-progress session per branch/site; conflicts queue is part of the same workflow. |
| Senior Dev | Active session cards above history table; link to count/conflicts. |
| QA | Create is blocked when an active session exists; active card shows progress and next action. |

### Target Layout

```text
Active sessions:
  KK-128 | CN Đất Đỏ | 34/80 counted | blind/open | [Tiếp tục đếm] [Chi tiết]
Actions: [Xử lý lệch] [Tạo phiên]
History table: session | branch | started | mode | status | variance | next action
```

## 22. `/inventory/stocktake/new` - New Stocktake

### Debate

| Role | Position |
| --- | --- |
| PM | User should understand what they are starting and whether blind mode applies. |
| BA | Mode is dictated by schedule/tier; user should not bypass blind mode manually. |
| Senior Dev | Use one form card/dialog, not many config panels. |
| QA | Cannot create without branch/location and valid mode; open active session is a blocker. |

### Target Layout

```text
Form:
  Branch/site
  Location/zone
  Session kind: daily / weekly / monthly / spot
  Mode preview: open / blind
  Auditor requirement preview
  [Create session]
```

## 23. `/inventory/stocktake/[id]` - Stocktake Detail

### Debate

| Role | Position |
| --- | --- |
| PM | Detail should show progress and whether the session can be finalized. |
| BA | Finalize is blocked by missing counts, unresolved conflicts, required recount, or R1 not final. |
| Senior Dev | Progress header, line table, variance summary, sticky finalize footer. |
| QA | Finalize button explains exact blocker count; cancel is destructive and confirmed. |

### Target Layout

```text
Header: KK-128 | status | mode | [Tiếp tục đếm] [Chốt kết quả]
Progress: counted/total | conflicts | recount needed | final lines missing
Tabs: [Đang đếm] [Chênh lệch] [Audit]
Table: item | unit | counted | system qty if allowed | variance | reason | status
```

## 24. `/inventory/stocktake/[id]/count` - Counting Surface

### Debate

| Role | Position |
| --- | --- |
| PM | This is a frontline counting surface; one item and one next input should dominate. |
| BA | Blind mode must not deliver `system_quantity` to client payload. Zone lock loss flips page read-only. |
| Senior Dev | Use `BlindCountingGrid`, `NumberPadSheet`, `ZoneLockIndicator`, autosave status. |
| QA | In blind mode network payload and UI do not contain system qty. Offline/conflict behavior is visible when enabled. |

### Target Layout

```text
+----------------------------------------------+
| Đếm KK-128 | Zone A | Lock active | Auto-save |
+----------------------------------------------+
| Progress 34/80                                |
| Search/filter zone                            |
| Item card/table row: name | unit | count input|
| [Open number pad] [Save draft]                |
+----------------------------------------------+
| Sticky bottom: Unsaved count | Submit round   |
+----------------------------------------------+
```

## 25. `/inventory/stocktake/conflicts` - Conflict Queue

### Debate

| Role | Position |
| --- | --- |
| PM | Conflict queue is a resolution inbox, not a report. |
| BA | Resolution must use RPC only: keep server, apply client, manual value, reject. |
| Senior Dev | Show unresolved first, resolved collapsed; manual value has explicit input. |
| QA | No direct-update path; manual value requires quantity and note where needed. |

### Target Layout

```text
Unresolved conflict card:
  item | session | server count | client count | actor | age | note
  [Keep server] [Apply client] [Manual value] [Reject]
Resolved section: collapsed audit table
```

## 26. `/inventory/expiry` - Expiry Alerts

### Debate

| Role | Position |
| --- | --- |
| PM | Expired and near-expiry items must be visible before all-history data. |
| BA | Expiry does not block stock movement in v1; it prompts manual write-off. |
| Senior Dev | Use `Tabs`, urgency filter, table, destructive write-off dialog. |
| QA | Write-off requires quantity and confirmation; destructive action is separated. |

### Target Layout

```text
Tabs: [Đã hết hạn] [Sắp hết hạn] [Tất cả]
Toolbar: branch, search, urgency
Table: item | lot/GRN | expiry date | remaining qty | site | action
Action: [Xóa sổ] -> AlertDialog qty + reason
```

## 27. `/inventory/reports` - Reports

### Debate

| Role | Position |
| --- | --- |
| PM | Reports should be secondary to operation, with clear filters before charts. |
| BA | Food cost, inventory value, AP aging, movement variance have different scopes and permissions. |
| Senior Dev | Use filter header, report tabs, charts/tables below. |
| QA | Branch and period filters must affect every visible widget consistently. |

### Target Layout

```text
Filter bar: branch/site | period | report family | export
Tabs: [Food cost] [Inventory value] [AP aging] [Movement variance]
Content: chart + supporting table + drilldown links
```

## 28. `/inventory/ingredients` - Ingredient Catalog

### Debate

| Role | Position |
| --- | --- |
| PM | Catalog page is reference data, not the stock operation page. |
| BA | Import/export format must match live importer: purchase unit, measure unit, conversion factor, item kind, thresholds. |
| Senior Dev | Dense table with import/export menu, create/edit dialog. |
| QA | Import validation should surface row-level errors; toggling active state is permission-gated. |

### Target Layout

```text
Toolbar: search | category | active | item kind | [Import/Export] [Tạo nguyên liệu]
Table: ingredient | SKU | units/conversion | storage | reference price | thresholds | status | actions
Dialog: grouped fields for identity, units, costing, thresholds, storage
```

## 29. `/inventory/suppliers` - Supplier Catalog

### Debate

| Role | Position |
| --- | --- |
| PM | User manages supplier identity and purchasing readiness. |
| BA | Tax code uniqueness matters for supplier-swap gaming prevention. |
| Senior Dev | Table plus dialog; destructive delete must be confirmed or disabled when linked docs exist. |
| QA | Supplier with PO/GRN history should not be silently deleted if backend blocks it. |

### Target Layout

```text
Toolbar: search | active | payment terms | [Tạo NCC]
Table: supplier | tax code | phone | address | terms | status | actions
Dialog: identity, tax, contact, terms
```

## 30. `/inventory/recipes` - Sales Recipe Catalog

### Debate

| Role | Position |
| --- | --- |
| PM | User needs to know which menu items have complete recipes and yield assumptions. |
| BA | Recipe drives POS consumption; missing recipe becomes stock/report risk. |
| Senior Dev | Cards per menu item with line table; edit line dialog. |
| QA | Duplicate ingredient line in one recipe is rejected; yield visible and editable only with permission. |

### Target Layout

```text
Toolbar: search menu item | category | recipe completeness | [Tạo định mức]
Recipe card:
  menu item | category | completeness badge
  line table: ingredient | qty | unit | yield | note
```

## 31. `/inventory/settings/*` - Inventory Settings

### Debate

| Role | Position |
| --- | --- |
| PM | Settings should not compete with daily work. It is for policy configuration. |
| BA | QC, expiry, express window, category review, period close policies must be auditable. |
| Senior Dev | Section nav + form cards + sticky save footer. |
| QA | Invalid threshold ordering is blocked client and server side. |

### Target Layout

```text
Settings nav: [Expiry] [QC nhập kho] [Category review] [Express window] [Period]
Main: one policy group per card
Footer: last updated | reset/cancel | save
```

## 32. `/inventory/m` - Mobile Hub

### Debate

| Role | Position |
| --- | --- |
| PM | Mobile home should be a task launcher for people physically handling goods. |
| BA | Mobile should expose only workflows safe for touch operation: receive, stock, transfer receive, count, production. |
| Senior Dev | Keep `MobilePage`, `MobileTopBar`, `MobileSectionHeader`, `InteractiveCard`. |
| QA | First viewport shows the most likely next action; no desktop management noise. |

### Target Layout

```text
+--------------------------------+
| Kho - CN Đất Đỏ                |
+--------------------------------+
| Xin chào                       |
| [Nhận hàng GRN]                |
| [Nhận điều chuyển]             |
| [Kiểm kê / Đếm]                |
| [Xem tồn cần xử lý]            |
| [Sản xuất - nếu CK]            |
+--------------------------------+
| Drafts / việc đang làm dở       |
+--------------------------------+
```

## 33. `/inventory/m/grn/new/[supplierId]` - Mobile GRN Create

### Debate

| Role | Position |
| --- | --- |
| PM | Receiver should tap item, enter qty/price, and submit without spreadsheet friction. |
| BA | Draft autosave is local but final submit must validate server-side. |
| Senior Dev | Keep item list + line edit sheet + number pad sheet + sticky submit. |
| QA | Removing a line, discarding draft, and submitting empty draft behave predictably. |

### Target Layout

```text
Header: NCC | draft status
Search items
Item list: name | unit | added qty/price
Line edit Sheet: qty | unit price | expiry | note | save/remove
Sticky bottom: lines count | total | submit GRN
```

## 34. `/inventory/m/stock` - Mobile Stock

### Debate

| Role | Position |
| --- | --- |
| PM | Mobile stock is a risk list, not the full accounting table. |
| BA | It should guide to receive, transfer, stocktake, or waste, not direct edit. |
| Senior Dev | Use search + segmented risk filters + touch cards. |
| QA | Low/out items sort first; status filters are reversible. |

### Target Layout

```text
Search
Filter chips: [Cần xử lý] [Thấp] [Hết] [Cận date] [Tất cả]
Card: item | location | qty | risk | next action
```

## 35. `/inventory/m/transfers` and receive detail

### Debate

| Role | Position |
| --- | --- |
| PM | Receiver must see only transfer jobs that need action now. |
| BA | Receive qty may differ; reason is required on discrepancy. |
| Senior Dev | Keep mobile tabs and receive detail with number pad. |
| QA | Cannot confirm receive until every line has qty and discrepancy reason where needed. |

### Target Layout

```text
Tabs: [Cần nhận] [Cần xuất] [Lịch sử]
Transfer card: route | items | status | action
Receive detail:
  line cards: sent qty | received qty | reason
  sticky bottom: confirm receive
```

## 36. `/inventory/m/production` - Mobile Production

### Debate

| Role | Position |
| --- | --- |
| PM | CK operator needs readiness and quick confirm/cancel for draft orders. |
| BA | Production confirm requires BOM and raw stock; transfer to branch is follow-up. |
| Senior Dev | Keep tabs by status, readiness card, mobile order cards. |
| QA | Confirm/cancel actions are clear and destructive cancel is confirmed. |

### Target Layout

```text
Readiness card: can produce / missing BOM / missing stock
Tabs: [Nháp] [Đã xong] [Đã hủy]
Order card: output item | qty | status | cost | [Confirm] [Cancel] [Transfer]
```

## 37. Cross-Page Open Decisions

1. Dashboard priority: adopt `work queue first`, KPI second.
2. Sidebar IA: group procurement documents together, route URLs unchanged.
3. Detail pages: use one standard `Stepper + line table + summary rail + sticky footer` pattern for PO, GRN, transfer, issue, stocktake.
4. Mobile: treat as field operation surface, not a shrunken desktop admin.
5. Inventory issue language: branch kind controls the label; never reintroduce `kitchen_use`.
6. Reports remain secondary; alerts and queues drive operations.
7. Implementation should be split into small waves:
   - Wave A: shell, dashboard, shared detail/page patterns.
   - Wave B: procurement pages and GRN detail.
   - Wave C: stock, transfers, issues, waste.
   - Wave D: stocktake and mobile operational pages.
   - Wave E: catalog, settings, reports polish.

## 38. Implementation Gate Later

Before runtime implementation:

- Run the repo's 4-agent debate against the selected wave.
- State surface, primary user job, route family, change type, primitives, and regression risks.
- Verify with browser at desktop and mobile sizes.
- Run `pnpm typecheck && pnpm lint && pnpm build`.

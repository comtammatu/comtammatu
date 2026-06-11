# Glossary

Nguồn chuẩn duy nhất cho ngôn ngữ dự án, thuật ngữ nghiệp vụ, và quy tắc đặt tên của Cơm Tấm Má Tư.

Mục tiêu:

- thống nhất cách gọi giữa business, architecture, specs, UI copy, và implementation
- tránh dùng một từ cho nhiều meaning khác nhau
- gom vocabulary cấp repo về một chỗ dễ tra cứu như ERP reference docs

## Quy tắc đọc

- Nếu có xung đột giữa glossary này với docs cũ, glossary này thắng.
- Business rules chi tiết vẫn nằm ở `docs/ref/*`; glossary chỉ chốt meaning và naming.
- Trong UI có thể dùng business label ngắn cho dễ đọc, nhưng docs, code, schema, type, enum, RPC, và file path phải ưu tiên canonical term.
- Nếu cần thêm thuật ngữ mới cho feature mới, cập nhật glossary này cùng lúc với feature.

## Quy ước ngôn ngữ

| Lớp                                   | Ngôn ngữ chuẩn                     | Quy ước                                                                      |
| ------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------- |
| UI cho người dùng nội bộ              | Tiếng Việt                         | Giữ acronym quen thuộc như `POS`, `KDS`, `HQ`, `GRN`, `WAC` nếu cần ngắn gọn |
| Docs nghiệp vụ                        | Tiếng Việt là chính                | Lần nhắc đầu có thể ghi `Tiếng Việt (English)` để khóa nghĩa                 |
| Code, DB schema, type, RPC, file path | Tiếng Anh                          | Không đặt identifier bằng tiếng Việt hoặc tiếng Việt không dấu               |
| Comment kỹ thuật                      | Tiếng Anh hoặc tiếng Việt ngắn gọn | Ưu tiên rõ nghĩa, không trộn 2 nghĩa cho cùng một entity                     |

Persisted identifiers gồm table/column/function/RPC name, enum value, permission key,
position code, role template name, feature flag key, URL query token, payload field, và
storage bucket/object contract. Các identifier này dùng `lower_snake_case` hoặc route
slug ASCII bằng tiếng Anh. Tiếng Việt chỉ nằm ở label/copy/user data, ví dụ
`label_vi`, seeded branch names, menu item names, hoặc nội dung in/hiển thị.

## Quy ước chính tả tiếng Việt

Dự án dùng **quy tắc chính tả mới (sau 1984)** — dấu thanh đặt trên nguyên âm chính, không trên nguyên âm phụ:

| Dùng (chuẩn)                         | Không dùng (cũ)                                                     |
| ------------------------------------ | ------------------------------------------------------------------- |
| `hóa đơn`, `chuẩn hóa`, `tối ưu hóa` | `hoá đơn`, `chuẩn hoá`, `tối ưu hoá`                                |
| `thỏa thuận`, `thỏa mãn`             | `thoả thuận`, `thoả mãn`                                            |
| `hòa giải`, `hòa đồng`               | `hoà giải`, `hoà đồng`                                              |
| `lóa mắt`, `tỏa sáng`, `xòa`         | `loá mắt`, `toả sáng`, `xoà`                                        |
| `quả`, `thủy`, `quỳnh`               | (không đổi — chỉ áp dụng khi nguyên âm chính là `o`/`a` đứng trước) |

Nguyên tắc đơn: với nhóm `oa / oe / oo / uy` + dấu thanh, đặt dấu trên nguyên âm đứng sau (`ó`, `ẻ`, `ỗ`, `ý`). Ví dụ: `hóa` (ó trên o thứ hai của oa), `thỏa` (ỏ trên o thứ hai), `lúy`.

Lint nhẹ: nếu copy/docs mới xuất hiện `hoá|thoả|hoà|loá|toả|xoà|choáng` → review thay bằng form `hóa|thỏa|hòa|lóa|tỏa|xòa|choáng`. Ngoại lệ: URL, tên file legacy, trích dẫn nguyên văn từ nguồn bên ngoài.

## Whitelist English được giữ lại

Chỉ giữ English trong một trong các nhóm sau:

- acronym hoặc thuật ngữ chuyên ngành đã chốt: `POS`, `KDS`, `HQ`, `ERP`, `PO`, `GRN`, `WAC`, `PIT`
- tên công nghệ, framework, hoặc vendor: `Supabase`, `Next.js`, `React`, `Tailwind`, `TypeScript`, `MoMo`, `VietQR`, `Viettel S-invoice`
- proper noun, code identifier, route, schema, enum, RPC, payload field, HTTP verb, env var
- đoạn glossary hoặc lần định nghĩa đầu cần khóa nghĩa theo mẫu `Tiếng Việt (English)`

Nếu không thuộc 1 trong 4 nhóm trên thì mặc định phải ưu tiên tiếng Việt.
`ERP` chỉ dùng khi nói về kiến trúc, bộ tham chiếu, hoặc so sánh phạm vi; entrypoint
và docs sản phẩm dùng `bộ phần mềm quản lý vận hành và bán hàng`.

## Denylist drift không được tái đưa vào copy

Các cụm dưới đây bị xem là drift và phải thay bằng nhãn tiếng Việt chuẩn tương ứng:

| Drift term                     | Dùng thay                                              |
| ------------------------------ | ------------------------------------------------------ |
| `Employee Portal`              | `Trang nhân viên`                                      |
| `Admin Shell`                  | `Khung quản trị` hoặc `nền tảng quản trị` tùy ngữ cảnh |
| `Dashboard`                    | `Tổng quan` hoặc `buồng lái` tùy ngữ cảnh              |
| `Stock`                        | `Kho hàng` hoặc `tồn kho` tùy ngữ cảnh                 |
| `Finance`                      | `Kế toán` hoặc `tài chính` tùy ngữ cảnh                |
| `Shipped`                      | `Hoàn thành`                                           |
| `Point of Sale`                | `POS`                                                  |
| `Kitchen Display System`       | `KDS` hoặc `màn hình bếp`                              |
| `HR / Payroll`, `HR & Payroll` | `Nhân sự` trong UI HKD; dùng `nhân sự & tiền lương` trong docs pháp lý/payroll |
| `Restaurant Management System` | `hệ thống quản lý vận hành nhà hàng`                   |
| `Merchant Platform`            | `bộ phần mềm quản lý vận hành và bán hàng`             |
| `Báo cáo CEO`                  | `Báo cáo điều hành`                                    |
| `CTCP`, `JSC`, `Công ty cổ phần` | `Hộ kinh doanh` / `HKD` cho mô hình hiện hành; chỉ dùng CTCP khi nói lịch sử hoặc lộ trình chuyển đổi |

## Quy tắc thực thi

- Không viết label kiểu `Tiếng Việt · English label` trong UI, status page, docs vận hành, hoặc roadmap.
- Khi thêm copy mới vào app, ưu tiên đi qua `packages/shared/src/labels/vi.ts` hoặc dictionary domain tương ứng trước khi hardcode.
- Khi sửa docs hoặc status artifact, ưu tiên một cách gọi tiếng Việt xuyên suốt trong cùng tài liệu.
- Khi một cụm thuộc denylist xuất hiện lại trong PR, phải sửa về nhãn chuẩn ngay trong cùng PR đó.

## Canonical terms

### Tổ chức và địa điểm vận hành

| Canonical English   | Nhãn tiếng Việt chuẩn   | Dùng khi nào                                                                        | Tránh dùng                                        |
| ------------------- | ----------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------- |
| `tenant`            | tenant / hồ sơ HKD      | Khi nói về chủ thể kinh doanh cấp hệ thống, single-tenant row                      | pháp nhân CTCP, công ty nếu đang nói row dữ liệu  |
| `household business` | hộ kinh doanh (`HKD`)   | Mô hình pháp lý hiện hành của Má Tư                                                | CTCP, doanh nghiệp nếu không nói lộ trình chuyển đổi |
| `registered owner`  | chủ hộ kinh doanh       | Người đại diện đăng ký HKD / người ký hồ sơ pháp lý                                | representative pháp nhân                           |
| `branch`            | chi nhánh               | Site vận hành cấp L1                                                                | cửa hàng nếu đang nói entity DB                   |
| `central_warehouse` | kho tổng (`CW`)         | Điểm nhập NCC đa thể hiện (có thể có nhiều Kho Tổng)                                | HQ, headquarters, trụ sở                          |
| `central kitchen`   | bếp trung tâm           | Site sản xuất thành phẩm                                                            | tổng bếp, bếp tổng                                |
| `branch warehouse`  | kho chi nhánh           | Điểm nhận / giữ tồn tại chi nhánh                                                   | kho con                                           |
| `branch kitchen`    | bếp chi nhánh           | Điểm tiêu hao cuối cùng cho bán hàng                                                | bếp cửa hàng nếu đang nói topology chuẩn          |
| `site`              | site vận hành           | Specs / technical docs khi cần gom `central_warehouse`, `central_kitchen`, `branch` | dùng thay cho `branch` trong UI                   |

### Bề mặt sản phẩm

| Canonical English                        | Nhãn tiếng Việt chuẩn | Ghi chú                                                           |
| ---------------------------------------- | --------------------- | ----------------------------------------------------------------- |
| `restaurant operations system`           | bộ phần mềm quản lý vận hành và bán hàng | Nhãn chính của `comtammatu`; dùng cho entrypoint/docs sản phẩm |
| `admin`                                  | quản trị              | Tenant-level management surface                                   |
| `content management system (CMS)`        | quản trị nội dung     | Dùng cho banner, promo, landing content, media, SEO metadata      |
| `inventory ops`                          | điều hành kho         | Có thể rút gọn `Kho hàng` trong nav                               |
| `point of sale (POS)`                    | POS                   | Không ép dịch thành `điểm bán` trong UI                           |
| `kitchen display system (KDS)`           | KDS                   | Có thể chú thích `màn hình bếp` ở docs/onboarding                 |
| `employee portal`                        | cổng nhân viên        | Dùng cho `/employee`                                              |

### Bán hàng và vận hành tiền tuyến

| Canonical English | Nhãn tiếng Việt chuẩn | Dùng khi nào                                                  | Tránh dùng                               |
| ----------------- | --------------------- | ------------------------------------------------------------- | ---------------------------------------- |
| `order`           | đơn hàng bán          | Đơn phát sinh ở POS                                           | đơn hàng nếu đang đứng cạnh procurement  |
| `order item`      | dòng món              | Một món trong đơn                                             | item nếu viết user-facing copy           |
| `menu item`       | món bán               | Item trong menu                                               | sản phẩm nếu đang nói F&B order flow     |
| `table session`   | phiên bàn             | Nếu cần nói lifecycle tại bàn                                 | bàn mở nếu cần phân biệt record          |
| `POS session`     | ca POS                | Shift mở trên terminal                                        | ca bán hàng nếu đang nói entity kỹ thuật |
| `terminal`        | máy POS               | Thiết bị / điểm POS cụ thể                                    | máy thu ngân                             |
| `kds ticket`      | phiếu bếp             | Ticket hiển thị trên KDS                                      | order bếp                                |
| `ready`           | sẵn sàng              | Món/phiếu bếp đã xong ở bếp; không tự động trả bàn            | hoàn thành đơn                           |
| `served`          | đã phục vụ            | Marker phục vụ/fulfillment; không phải payment close          | trả bàn, hoàn tất đơn                    |
| `completed`       | hoàn thành POS        | Đơn đã thanh toán và đóng ở POS; bàn được release nếu dine-in | bếp xong                                 |
| `release table`   | trả bàn               | Hệ thống release bàn khi đơn POS `completed` hoặc `cancelled` | nút riêng sau thanh toán                 |

### Procurement, kho, và sản xuất

| Canonical English             | Nhãn tiếng Việt chuẩn           | Dùng khi nào                                                           | Tránh dùng                                     |
| ----------------------------- | ------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------- |
| `purchase order (PO)`         | đơn đặt hàng NCC                | Đơn mua gửi NCC                                                        | đơn hàng                                       |
| `goods received note (GRN)`   | phiếu nhập kho                  | Hàng thực nhận từ NCC tại Kho Tổng (CW) hoặc Bếp Trung Tâm (CK)        | receiving note, phiếu nhận                     |
| `supplier invoice`            | hóa đơn NCC                     | Hóa đơn đầu vào từ NCC                                                 | invoice nếu không rõ loại                      |
| `tax invoice / e-invoice`     | hóa đơn điện tử bán ra (`HĐĐT`) | Hóa đơn xuất cho giao dịch bán                                         | hóa đơn nếu đang đứng cạnh supplier invoice    |
| `stock level`                 | tồn kho                         | Snapshot số lượng + WAC tại site                                       | số lượng tồn nếu đang nói entity chuẩn         |
| `stock movement`              | biến động tồn kho               | Ledger append-only                                                     | giao dịch kho nếu cần chỉ rõ loại movement     |
| `stock transfer`              | phiếu điều chuyển nội bộ        | Luân chuyển giữa hai site thật                                         | phiếu xuất kho nếu đang là inter-site transfer |
| `stock issue`                 | phiếu xuất kho                  | Xuất dùng nội bộ trong cùng site / cấp phát                            | điều chuyển nếu không có site nhận riêng       |
| `stocktake`                   | kiểm kê                         | Đếm thực tế và điều chỉnh                                              | kiểm kho nếu đang cần term chuẩn               |
| `raw material`                | nguyên liệu                     | Item đầu vào                                                           | vật tư nếu không phải ngữ cảnh ERP rộng        |
| `finished good`               | thành phẩm                      | Hàng do bếp trung tâm sản xuất hoặc giữ tồn để cấp xuống bếp chi nhánh | món hoàn chỉnh nếu đang nói item tồn kho       |
| `recipe`                      | công thức món                   | Định mức nguyên liệu cho món bán                                       | BOM nếu không phải production context          |
| `production recipe`           | công thức sản xuất              | BOM cho thành phẩm                                                     | recipe nếu cần phân biệt rõ với món bán        |
| `production order`            | lệnh sản xuất                   | Lệnh tại bếp trung tâm                                                 | work order                                     |
| `three-way matching`          | đối soát 3 chứng từ             | Đối chiếu `PO`, `GRN`, `supplier_invoice`                              | matching nếu không nói rõ 3 chiều              |
| `weighted average cost (WAC)` | giá vốn bình quân gia quyền     | Costing chuẩn hiện tại                                                 | FIFO cost nếu đang nói hệ thống hiện tại       |

### Vai trò người dùng

| Code role (`user_role` legacy) | Nhãn tiếng Việt chuẩn | Boundary                                                                      |
| ------------------------------ | --------------------- | ----------------------------------------------------------------------------- |
| `owner`                        | chủ sở hữu            | Vai trò cao nhất cấp tenant                                                   |
| `super_manager`                | quản lý tổng          | Vận hành cấp tenant (CW + CK)                                                 |
| `branch_manager`               | quản lý chi nhánh     | Quản trị một chi nhánh vận hành                                               |
| `warehouse_manager`            | quản lý kho tổng      | Procurement + kho Trụ sở                                                      |
| `production_manager`           | quản lý sản xuất      | Bếp trung tâm                                                                 |
| `cashier`                      | thu ngân              | POS                                                                           |
| `waiter`                       | phục vụ               | POS                                                                           |
| `chef`                         | bếp                   | KDS                                                                           |
| `office`                       | văn phòng             | Trang nhân viên, không gắn site vận hành cụ thể                               |

`user_role` là compatibility claim trong JWT, derived từ `positions.code`. Vai trò mới (`warehouse_manager`, `production_manager`) được thêm khi Auth tách Kho và Bếp trung tâm thành workstream riêng.

Position code tiếng Việt legacy (`quan_ly_CN`, `kho_truong`, `thu_kho`,
`bep_truong`, `phu_bep`, `ke_toan`, `ke_toan_truong`, `tro_ly_giam_doc`) đã được
rename/loại bỏ tận gốc bởi migration `20260610230000_canonical_position_codes_lean`.
Bộ mã canonical CHỈ gồm 11 mã English: `owner`, `super_manager`, `branch_manager`,
`warehouse_manager`, `production_manager`, `head_chef`, `kitchen_helper`, `chef`,
`cashier`, `waiter`, `office`. Thêm mã mới = cập nhật ĐỒNG THỜI
`POSITION_CODE_TO_STAFF_ROLE` (shared TS) + SQL twin
`private.staff_role_from_position_code` trong cùng PR.

### Auth — Position ⟂ Permission

| Thuật ngữ                   | Code identifier                                         | Ý nghĩa                                                                                                                         |
| --------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| position (chức vụ)          | `positions(code, label_vi, label_en)`                | Nhãn HR của nhân viên. Không gate authz trực tiếp. Code thuộc bộ 11 mã English canonical, vd `head_chef`, `warehouse_manager`. |
| permission key (khóa quyền) | `permission_keys(key)`                                  | Chuỗi canonical cho hành động, vd `inventory:production_create`. Đơn vị authz nhỏ nhất.                                         |
| template (bộ quyền mẫu)     | `role_templates(position_code, permission_keys[])`      | Preset quyền gắn với 1 position; snapshot, không propagate khi edit.                                                            |
| grant (cấp quyền)           | `staff_permissions(user_id, branch_id, permission_key)` | Quyền thật của user tại branch cụ thể. `branch_id IS NULL` = tenant-wide.                                                       |

Copy UI ưu tiên tiếng Việt: `chức vụ`, `khóa quyền`, `bộ quyền mẫu`, `cấp quyền`. Code, schema, RPC giữ tên tiếng Anh.

### Trạng thái POS, món, và phiếu bếp

| Entity               | Status values                                                                      | Ý nghĩa                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `orders.status`      | `new` → `confirmed` → `preparing` → `ready` → `served` → `completed` / `cancelled` | Vòng đời đơn bán ở POS. `completed` = đã thanh toán, đóng phía POS, release bàn dine-in. |
| `order_items.status` | `pending` → `preparing` → `ready` → `served` / `cancelled`                         | Trạng thái từng dòng món. Sync từ `kds_tickets` qua trigger `sync_order_item_status`.    |
| `kds_tickets.status` | `pending` → `preparing` → `ready` → `served` / `cancelled`                         | Trạng thái ticket trên KDS. Fulfillment signal, không phải commercial close.             |
| `tables.status`      | `available` → `occupied` → `available`                                             | Release khi đơn `completed` hoặc `cancelled`, không release khi chỉ `served`.            |

Canonical rule (áp dụng 2026-04-24): payment confirmation → `orders.status='completed'`; `served` KHÔNG release bàn; bếp vẫn tiếp tục ticket sau thanh toán. Tham chiếu regression: `PAYMENT-AUTO-COMPLETES-ORDER`, `POS-SERVED-NOT-TABLE-TERMINAL`.

### Thao tác mutation trên đơn bán

| Canonical English | Nhãn tiếng Việt | Dùng khi nào                                               | Khác biệt                                                 |
| ----------------- | --------------- | ---------------------------------------------------------- | --------------------------------------------------------- |
| `append items`    | thêm món        | Bổ sung vào đơn chưa `served`                              | Không tạo đơn mới, route lại KDS qua `route_order_to_kds` |
| `void item`       | hủy món         | Hủy 1 dòng món (mgr+, cần lý do)                           | Nếu hủy dòng cuối → auto-cancel đơn                       |
| `cancel order`    | hủy đơn         | Terminal, giải phóng bàn (mgr+, cần lý do)                 | Khác `void item` ở cấp entity                             |
| `transfer table`  | chuyển bàn      | Đơn dine-in, sang bàn khả dụng khác                        | Giữ nguyên items                                          |
| `quick reorder`   | đặt lại         | Nạp giỏ từ đơn cũ, tạo đơn mới                             | Lọc item đã deactivate                                    |
| `refund`          | hoàn tiền       | Hoàn tiền sau thanh toán (M4 Payment, **chưa triển khai**) | Khác `cancel` — đơn đã `paid`                             |

### Thanh toán

| Canonical English | Nhãn tiếng Việt        | Ghi chú                                                                 |
| ----------------- | ---------------------- | ----------------------------------------------------------------------- |
| `payment_method`  | phương thức thanh toán | `cash`, `bank_transfer`, `momo`, `vietqr`                               |
| `cash`            | tiền mặt               |                                                                         |
| `bank_transfer`   | chuyển khoản           | Ưu tiên cho giao dịch NCC giá trị lớn để đủ hồ sơ thanh toán/kế toán    |
| `momo`            | ví MoMo                | Giữ tên thương hiệu, không dịch                                         |
| `vietqr`          | VietQR                 | QR chuyển khoản liên ngân hàng, giữ nguyên tên                          |
| `payment_status`  | trạng thái thanh toán  | `unpaid` → `partial` → `paid` (dùng cho `supplier_invoices`)            |
| `payment close`   | đóng thanh toán POS    | Event: xác nhận thanh toán → `orders.status='completed'` + release bàn  |

### In ấn và thiết bị

| Canonical English | Nhãn tiếng Việt              | Ghi chú                                                         |
| ----------------- | ---------------------------- | --------------------------------------------------------------- |
| `print agent`     | agent in                     | Daemon 1 instance / chi nhánh, subscribe Realtime `print_jobs`  |
| `print_jobs`      | công việc in                 | Row xếp hàng chờ agent claim + render + dispatch                |
| `printer_agents`  | bảng máy in đã đăng ký       | Heartbeat, `is_online` theo ngưỡng 60s                          |
| `receipt`         | phiếu tạm tính / hóa đơn POS | **Không phải** `tax invoice`. In cho khách xem, không có mã CQT |
| `kitchen ticket`  | phiếu bếp                    | Đồng nghĩa `kds ticket`; dùng khi nói về bản in giấy            |
| `ESC/POS`         | ESC/POS                      | Giao thức máy in nhiệt, giữ nguyên English                      |
| `connection_type` | kiểu kết nối máy in          | `lan` (TCP:9100) — LAN-only sau cleanup 2026-05-07              |
| `print_mode`      | chế độ in                    | `text` (ESC/POS + CP1258) hoặc `bitmap` (rasterize tiếng Việt)  |

### Kế toán và thuế GTGT

| Canonical English        | Nhãn tiếng Việt                | Ghi chú                                                                         |
| ------------------------ | ------------------------------ | ------------------------------------------------------------------------------- |
| `value-added tax (VAT)`  | thuế GTGT                      | Với HKD, phương pháp tính thuế theo cấu hình đăng ký/luật hiện hành; không mặc định khấu trừ |
| `output VAT`             | GTGT đầu ra                    | Thu từ khách, nộp CQT                                                           |
| `input VAT`              | GTGT đầu vào                   | Trả cho NCC, được khấu trừ nếu đủ điều kiện                                     |
| `vat_rate`               | thuế suất GTGT                 | Lưu `NUMERIC(5,2)`, ví dụ `8.00`, `10.00`, `5.00` — **KHÔNG** lưu `0.08`        |
| `Cục Quản lý Thuế (CQT)` | Cục Quản lý Thuế               | Cơ quan cấp mã cho HĐĐT                                                         |
| `cqt_code`               | mã CQT                         | Mã xác thực HĐĐT sau khi `issued`                                               |
| `invoice_series`         | ký hiệu hóa đơn                | Ví dụ `1C25TLL`                                                                 |
| `invoice_number`         | số hóa đơn                     | Do provider / CQT cấp                                                           |
| `einvoice provider`      | nhà cung cấp HĐĐT              | runtime hiện tại: `viettel`                                                     |
| `declared_period`        | kỳ kê khai                     | Format `YYYY-MM`                                                                |
| `is_vat_deductible`      | khấu trừ GTGT                  | Boolean; cần 3-way match + hóa đơn hợp lệ + thanh toán ngân hàng nếu ≥ 20 triệu |
| `matching_status`        | trạng thái đối soát 3 chứng từ | `pending` → `matched` / `discrepancy` → `approved`                              |

**HĐĐT state machine** (`tax_invoices.status`): `draft` → `signing` → `submitted` → `issued` → (`cancelled` / `replaced`). Chỉ `issued` là hợp lệ; hủy sau `issued` phải lập biên bản + xuất HĐ thay thế.

**Tờ khai chuẩn** — hệ thống chỉ **xuất dữ liệu**, không nộp trực tiếp:

| Tờ khai       | Nội dung                 | Hạn nộp                                               |
| ------------- | ------------------------ | ----------------------------------------------------- |
| `01/GTGT`     | Kê khai GTGT tháng       | Ngày 20 tháng sau                                     |
| `05/KK-TNCN`  | Khấu trừ TNCN từ lương   | Ngày 20 tháng sau (hoặc ngày 30 quý sau nếu khai quý) |
| `05/QTT-TNCN` | Quyết toán TNCN năm      | 31/3 năm kế tiếp                                      |
| `05/BK-TNCN`  | Bảng kê thu nhập cá nhân | Kèm `05/QTT-TNCN`                                     |
| `02/ĐK-TNCN`  | Đăng ký người phụ thuộc  | NLĐ nộp cho HR                                        |

### Nhân sự và tiền lương

| Canonical English       | Nhãn tiếng Việt              | Ghi chú                                                                                                               |
| ----------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `employee`              | nhân viên                    | Row `employees` — hồ sơ HR                                                                                            |
| `employment contract`   | hợp đồng lao động (HĐLĐ)     | Row `employment_contracts`, source of truth cho `insurance_base_salary`                                               |
| `NSDLĐ`                 | người sử dụng lao động       | Phía Hộ kinh doanh/chủ hộ khi thuê nhân viên, đóng BHXH 21.5%                                                         |
| `NLĐ`                   | người lao động               | Phía nhân viên, đóng BHXH 10.5%                                                                                       |
| `indefinite`            | HĐ không xác định thời hạn   | Mặc định sau 2 HĐ `fixed_term` liên tiếp                                                                              |
| `fixed_term`            | HĐ xác định thời hạn         | 12–36 tháng, ký tối đa 2 lần                                                                                          |
| `seasonal`              | HĐ mùa vụ / công việc cụ thể | < 12 tháng, không gia hạn                                                                                             |
| `probation`             | HĐ thử việc                  | 30 ngày (phổ thông) / 60 ngày (kỹ thuật, quản lý); lương ≥ 85% chính thức                                             |
| `BHXH`                  | bảo hiểm xã hội              | NLĐ 8% + NSDLĐ 17.5% = 25.5%                                                                                          |
| `BHYT`                  | bảo hiểm y tế                | NLĐ 1.5% + NSDLĐ 3% = 4.5%                                                                                            |
| `BHTN`                  | bảo hiểm thất nghiệp         | NLĐ 1% + NSDLĐ 1% = 2%                                                                                                |
| `PIT` / `TNCN`          | thuế thu nhập cá nhân        | Biểu lũy tiến 7 bậc 5% → 35%                                                                                          |
| `gross_salary`          | lương gộp (gross)            | Lương thỏa thuận trước BHXH + PIT                                                                                     |
| `net_salary`            | lương thực lĩnh              | Gross − BHXH NLĐ − PIT − khấu trừ khác + phụ cấp miễn thuế                                                            |
| `insurance_base_salary` | mức lương đóng BH            | Source `employment_contracts` → sync `employees` → snapshot `payroll_entries.insurance_base`. **Khác `gross_salary`** |
| `personal_deduction`    | giảm trừ bản thân            | 11,000,000 VND/tháng (từ 01/07/2020)                                                                                  |
| `dependent_deduction`   | giảm trừ người phụ thuộc     | 4,400,000 VND/người/tháng                                                                                             |
| `payroll_period`        | kỳ lương                     | (tháng, năm); status `draft` → `calculated` → `approved` → `paid`                                                     |
| `payroll_entry`         | dòng lương                   | 1 nhân viên × 1 kỳ, `UNIQUE(period, employee)`                                                                        |
| `working_days`          | ngày công thực tế            |                                                                                                                       |
| `standard_days`         | ngày công chuẩn tháng        |                                                                                                                       |
| `overtime_pay`          | tiền làm thêm giờ            | Phần vượt 150% chịu thuế; 150% ngày thường miễn thuế                                                                  |
| `tax_exempt_allowances` | phụ cấp miễn thuế            | Ăn ca ≤ 730k, xăng xe, điện thoại, gửi xe có hóa đơn                                                                  |
| `insurance_cap`         | trần đóng BHXH               | 20 × lương cơ sở = 46,800,000 VND/tháng (2024)                                                                        |

## Label variants — long / short / acronym

Mỗi thuật ngữ có thể có tối đa 3 dạng hiển thị. Chọn theo **bề mặt UI**, không theo sở thích.

### Quy tắc chọn variants

| Dạng      | Dùng ở                                                             | Điều kiện bắt buộc                                             |
| --------- | ------------------------------------------------------------------ | -------------------------------------------------------------- |
| `long`    | heading, table cell, description, form label, tooltip dài          | Mọi canonical term đều có `long`                               |
| `short`   | button, tab, badge, sidebar nav, mobile chip, table header compact | Chỉ thêm khi `long > 14 ký tự` HOẶC xuất hiện trong nav/button |
| `acronym` | KPI card, status pill 2–4 ký tự, icon label, chart legend          | Chỉ dùng khi đối tượng đọc đã quen business vocab              |

Quy tắc phụ:

- Nếu `short == long` thì **bỏ cột short** (tránh trùng lặp).
- `acronym` phải nằm trong [Whitelist English](#whitelist-english-được-giữ-lại) hoặc là viết tắt tiếng Việt chính thức (`HĐĐT`, `HĐLĐ`, `NSDLĐ`, `NLĐ`, `GTGT`, `TNCN`, `BHXH`, `BHYT`, `BHTN`).
- Tránh trộn English + Vietnamese trong cùng một label cùng dạng (vd: không dùng `"Đơn NCC (PO)"` ở dạng short — hoặc `Đơn NCC` hoặc `PO`, chọn một).
- Responsive rule: dưới 640px breakpoint → ưu tiên `short`; ≥ 768px → `long`. Nav desktop collapsed dùng `short` hoặc `acronym`.

### Cơ chế thực thi (hiện tại)

File [apps/web/app/(protected)/inventory/\_lib/labels.ts](<../../apps/web/app/(protected)/inventory/_lib/labels.ts>) đã hiện thực `LabelContext` (`button`/`tab`/`badge`/`navigation`/`heading`/`table`) với mapping: nav/button/tab/badge → `short`, heading/table → `long`. Khi promote ra shared (L2 roadmap), các module POS/HR/Finance sẽ dùng lại pattern này.

### Bảng variants — Tổ chức và địa điểm

| Term                | Long           | Short     | Acronym |
| ------------------- | -------------- | --------- | ------- |
| `central_warehouse` | Kho Tổng       | —         | `CW`    |
| `central_kitchen`   | Bếp Trung Tâm  | Bếp TT    | `CK`    |
| `branch_warehouse`  | Kho chi nhánh  | Kho CN    | —       |
| `branch_kitchen`    | Bếp chi nhánh  | Bếp CN    | —       |
| `branch`            | Chi nhánh      | —         | `CN`    |
| `tenant`            | Hồ sơ HKD     | HKD       | —       |

### Bảng variants — POS / KDS / bán hàng

| Term              | Long             | Short    | Acronym |
| ----------------- | ---------------- | -------- | ------- |
| `order`           | Đơn hàng bán     | Đơn bán  | —       |
| `order_item`      | Dòng món         | Món      | —       |
| `kds_ticket`      | Phiếu bếp        | —        | —       |
| `table_session`   | Phiên bàn        | —        | —       |
| `pos_session`     | Ca POS           | —        | —       |
| `release_table`   | Trả bàn          | —        | —       |
| `append_items`    | Thêm món         | —        | —       |
| `void_item`       | Hủy món          | —        | —       |
| `cancel_order`    | Hủy đơn          | —        | —       |
| `transfer_table`  | Chuyển bàn       | —        | —       |
| `quick_reorder`   | Đặt lại          | —        | —       |
| `refund`          | Hoàn tiền        | —        | —       |
| **Status values** |                  |          |         |
| `pending`         | Chờ xử lý        | Chờ      | —       |
| `preparing`       | Đang chế biến    | Đang làm | —       |
| `ready`           | Sẵn sàng         | —        | —       |
| `served`          | Đã phục vụ       | Phục vụ  | —       |
| `completed`       | Hoàn thành (POS) | Xong     | —       |
| `cancelled`       | Đã hủy           | Hủy      | —       |

### Bảng variants — Thanh toán

| Term             | Long                   | Short         | Acronym |
| ---------------- | ---------------------- | ------------- | ------- |
| `payment_method` | Phương thức thanh toán | PT thanh toán | —       |
| `payment_status` | Trạng thái thanh toán  | TT thanh toán | —       |
| `payment_close`  | Đóng thanh toán POS    | Đóng TT       | —       |
| `cash`           | Tiền mặt               | —             | —       |
| `bank_transfer`  | Chuyển khoản ngân hàng | Chuyển khoản  | —       |
| `momo`           | Ví MoMo                | MoMo          | —       |
| `vietqr`         | VietQR                 | —             | —       |
| `unpaid`         | Chưa thanh toán        | Chưa trả      | —       |
| `partial`        | Thanh toán một phần    | Trả một phần  | —       |
| `paid`           | Đã thanh toán          | —             | —       |

### Bảng variants — Procurement / kho / sản xuất

| Term                    | Long                        | Short            | Acronym |
| ----------------------- | --------------------------- | ---------------- | ------- |
| `purchase_order`        | Đơn đặt hàng NCC            | Đơn NCC          | `PO`    |
| `goods_received_note`   | Phiếu nhập kho              | Phiếu nhập       | `GRN`   |
| `supplier_invoice`      | Hóa đơn NCC                 | HĐ NCC           | —       |
| `supplier_return`       | Phiếu trả nhà cung cấp      | Trả NCC          | —       |
| `supplier_credit_note`  | Ghi có nhà cung cấp         | Ghi có NCC       | —       |
| `stock_level`           | Tồn kho                     | —                | —       |
| `stock_movement`        | Biến động tồn kho           | Biến động        | —       |
| `stock_transfer`        | Phiếu điều chuyển nội bộ    | Điều chuyển      | —       |
| `stock_issue`           | Phiếu xuất kho nội bộ       | Xuất kho         | —       |
| `stocktake`             | Kiểm kê                     | —                | —       |
| `raw_material`          | Nguyên liệu                 | —                | —       |
| `finished_good`         | Thành phẩm                  | —                | —       |
| `recipe`                | Công thức món               | Định mức         | —       |
| `production_recipe`     | Công thức sản xuất          | Định mức SX      | `BOM`   |
| `production_order`      | Lệnh sản xuất               | Lệnh SX          | —       |
| `three_way_matching`    | Đối soát 3 chứng từ         | Đối soát 3 chiều | —       |
| `weighted_average_cost` | Giá vốn bình quân gia quyền | Giá vốn BQ       | `WAC`   |
| `expiry_warning`        | Cảnh báo hạn sử dụng        | Hạn dùng         | —       |

### Bảng variants — Kế toán và thuế

| Term                | Long                  | Short      | Acronym |
| ------------------- | --------------------- | ---------- | ------- |
| `value_added_tax`   | Thuế giá trị gia tăng | Thuế GTGT  | `GTGT`  |
| `output_vat`        | GTGT đầu ra           | —          | —       |
| `input_vat`         | GTGT đầu vào          | —          | —       |
| `vat_rate`          | Thuế suất GTGT        | TS GTGT    | —       |
| `tax_invoice`       | Hóa đơn điện tử       | HĐ điện tử | `HĐĐT`  |
| `cqt_code`          | Mã Cục Quản lý Thuế   | Mã CQT     | `CQT`   |
| `invoice_series`    | Ký hiệu hóa đơn       | Ký hiệu HĐ | —       |
| `invoice_number`    | Số hóa đơn            | Số HĐ      | —       |
| `einvoice_provider` | Nhà cung cấp HĐĐT     | NCC HĐĐT   | —       |
| `declared_period`   | Kỳ kê khai            | —          | —       |
| `vat_deductible`    | Được khấu trừ GTGT    | Khấu trừ   | —       |
| `matching_status`   | Trạng thái đối soát   | Đối soát   | —       |

### Bảng variants — Nhân sự và tiền lương

| Term                     | Long                         | Short          | Acronym        |
| ------------------------ | ---------------------------- | -------------- | -------------- |
| `employee`               | Nhân viên                    | NV             | —              |
| `employment_contract`    | Hợp đồng lao động            | Hợp đồng       | `HĐLĐ`         |
| `employer`               | Người sử dụng lao động       | NSDLĐ          | `NSDLĐ`        |
| `employee_party`         | Người lao động               | Nhân viên      | `NLĐ`          |
| `indefinite_contract`    | HĐ không xác định thời hạn   | HĐ vô thời hạn | —              |
| `fixed_term_contract`    | HĐ xác định thời hạn         | HĐ có thời hạn | —              |
| `seasonal_contract`      | HĐ mùa vụ / công việc cụ thể | HĐ mùa vụ      | —              |
| `probation_contract`     | HĐ thử việc                  | Thử việc       | —              |
| `social_insurance`       | Bảo hiểm xã hội              | BHXH           | `BHXH`         |
| `health_insurance`       | Bảo hiểm y tế                | BHYT           | `BHYT`         |
| `unemployment_insurance` | Bảo hiểm thất nghiệp         | BHTN           | `BHTN`         |
| `personal_income_tax`    | Thuế thu nhập cá nhân        | Thuế TNCN      | `TNCN` / `PIT` |
| `gross_salary`           | Lương gộp                    | Gross          | —              |
| `net_salary`             | Lương thực lĩnh              | Thực lĩnh      | —              |
| `insurance_base_salary`  | Mức lương đóng bảo hiểm      | Lương đóng BH  | —              |
| `personal_deduction`     | Giảm trừ bản thân            | GT bản thân    | —              |
| `dependent_deduction`    | Giảm trừ người phụ thuộc     | GT NPT         | —              |
| `payroll_period`         | Kỳ lương                     | —              | —              |
| `payroll_entry`          | Dòng lương                   | Lương NV       | —              |
| `working_days`           | Ngày công thực tế            | Công thực tế   | —              |
| `standard_days`          | Ngày công chuẩn tháng        | Công chuẩn     | —              |
| `overtime_pay`           | Tiền làm thêm giờ            | Làm thêm       | —              |
| `tax_exempt_allowances`  | Phụ cấp miễn thuế            | PC miễn thuế   | —              |
| `insurance_cap`          | Trần đóng bảo hiểm           | Trần BH        | —              |

### Bảng variants — In ấn và thiết bị

| Term              | Long                | Short     | Acronym |
| ----------------- | ------------------- | --------- | ------- |
| `print_agent`     | Agent in nhiệt      | Agent in  | —       |
| `print_jobs`      | Lệnh in             | —         | —       |
| `printer_agents`  | Máy in đã đăng ký   | Máy in    | —       |
| `receipt`         | Phiếu tạm tính      | Phiếu     | —       |
| `kitchen_ticket`  | Phiếu bếp in        | Phiếu bếp | —       |
| `connection_type` | Kiểu kết nối máy in | Kết nối   | —       |

### Bảng variants — Bề mặt sản phẩm (nav)

| Term                    | Long               | Short      | Acronym |
| ----------------------- | ------------------ | ---------- | ------- |
| `admin`                 | Quản trị           | —          | —       |
| `inventory_ops`         | Kho hàng           | —          | —       |
| `content_management`    | Quản trị nội dung  | Nội dung   | `CMS`   |
| `employee_portal`       | Trang nhân viên    | Nhân viên  | —       |
| `dashboard`             | Tổng quan          | —          | —       |
| `reports`               | Báo cáo            | —          | —       |

## Decision rules cho các cặp từ dễ drift

### `order` vs `purchase order`

- Dùng `order` khi nói về đơn bán phát sinh ở `POS`.
- Dùng `purchase order` hoặc `đơn đặt hàng NCC` khi nói procurement.
- Không dùng label ngắn `Đơn hàng` cho cả sales và procurement trong cùng một surface.

### `central_warehouse` vs `headquarters` (legacy)

- Dùng `central_warehouse` hoặc `kho tổng (CW)` làm canonical term.
- `headquarters` / `trụ sở (HQ)` là legacy phrasing — đã retire trong migration `20260424000000`. Không dùng trong docs mới.
- Lý do: pilot nay hỗ trợ nhiều Kho Tổng (multi-CW); khái niệm singleton HQ không còn scale.

### `stock transfer` vs `stock issue`

- `stock transfer` là luân chuyển giữa hai site thật, có `from` và `to`.
- `stock issue` là xuất dùng nội bộ trong cùng site, ví dụ cấp phát từ kho chi nhánh xuống bếp chi nhánh.
- Không gọi `stock issue` là `transfer` chỉ vì đều là xuất kho.

### `branch kitchen` vs `central kitchen`

- `central kitchen` là site sản xuất cấp tenant.
- `branch kitchen` là điểm tiêu hao cuối cùng của từng chi nhánh.
- Chỉ viết `bếp` khi context đã đủ rõ; nếu không, phải ghi rõ `bếp trung tâm` hoặc `bếp chi nhánh`.

### `supplier invoice` vs `tax invoice`

- `supplier invoice` là hóa đơn đầu vào từ NCC.
- `tax invoice / e-invoice` là hóa đơn bán ra cho giao dịch.
- Không dùng `invoice` trần trong docs/specs nếu có thể gây nhầm.

### `order.status='completed'` vs `kds_ticket.status='served'`

- `completed` là **commercial close** — đơn đã thanh toán, bàn release. Payment confirmation là sự kiện duy nhất chuyển sang `completed`.
- `served` là **fulfillment signal** — món/đơn đã lên bàn. Không gate thanh toán, không release bàn.
- Thanh toán **KHÔNG** force `kds_tickets.status` hoặc `order_items.status` sang terminal — bếp vẫn tiếp tục ticket sau khi đơn `completed`.
- Không dùng `hoàn thành` cho cả "bếp xong" và "thanh toán xong" trong cùng một surface.

### `void item` vs `cancel order` vs `refund`

- `void item`: hủy 1 dòng món **trước khi thanh toán**, mgr+ + lý do. Nếu dòng cuối → auto-cancel đơn + release bàn.
- `cancel order`: hủy toàn đơn **trước khi `completed`**, mgr+ + lý do, release bàn.
- `refund`: hoàn tiền **sau khi đã thanh toán** (đơn `completed`/`paid`). Thuộc M4 Payment, **chưa triển khai**.
- Không gọi `cancel order` là `refund` (chưa paid thì không có tiền để hoàn).

### `receipt` (phiếu tạm tính) vs `tax invoice` (HĐĐT)

- `receipt` = bản in hóa đơn POS (`BillReceipt`), không có mã CQT, không có giá trị pháp lý khấu trừ.
- `tax invoice / HĐĐT` = row trong `tax_invoices` với `status='issued'` và `cqt_code` đã cấp.
- Khách không yêu cầu HĐĐT → chỉ in `receipt`. Khách yêu cầu HĐĐT → tạo `tax_invoices` row → ký số → gửi CQT → in HĐĐT có mã.
- Không gọi `receipt` là `hóa đơn` trong kế toán/báo cáo thuế.

### `gross_salary` vs `insurance_base_salary` vs `net_salary`

- `gross_salary`: lương thỏa thuận trong HĐ, gồm phụ cấp chịu thuế.
- `insurance_base_salary`: căn cứ đóng BH; **có thể nhỏ hơn gross** vì không tính thưởng, ăn ca, xăng xe, nhà ở. Trần = 46,800,000 VND/tháng.
- `net_salary`: lương thực lĩnh = gross − BHXH NLĐ (10.5%) − PIT − khấu trừ khác + phụ cấp miễn thuế.
- Nguồn sự thật: `employment_contracts.insurance_base_salary` → sync `employees.insurance_base_salary` → snapshot `payroll_entries.insurance_base` (immutable sau `approved`).
- Không cho phép update trực tiếp `employees.insurance_base_salary` ngoài luồng HĐ.

### `BHXH` vs `BHYT/BHTN` vs `PIT`

- `BHXH`, `BHYT`, `BHTN` là 3 loại bảo hiểm **riêng biệt**, đóng song song (tổng NLĐ 10.5% + NSDLĐ 21.5% = 32% trên `insurance_base_salary`). Không gom cả 3 thành "bảo hiểm xã hội" trong docs/code/copy.
- `PIT / TNCN` là **thuế**, không phải bảo hiểm. Khấu trừ theo biểu lũy tiến 7 bậc.
- Trong `payroll_entries`: 3 cột riêng `bhxh_employee`, `bhyt_employee`, `bhtn_employee` + cột `pit_tax`.

## Quy tắc áp dụng theo bề mặt

### UI và product copy

- Ưu tiên tiếng Việt ngắn, rõ nghiệp vụ.
- Giữ acronym quen thuộc nếu người dùng đã nhận diện: `POS`, `KDS`, `CW`, `CK`, `GRN`, `WAC`.
- Nếu UI cần label riêng, map ở dictionary/formatter layer thay vì tạo synonym trong domain type.

### Docs và specs

- Lần nhắc đầu tiên nên giới thiệu song ngữ cho thuật ngữ dễ nhầm.
- Trong cùng một tài liệu, dùng một cách gọi duy nhất cho cùng một entity.
- Khi sơ đồ cần rút gọn, ưu tiên label ngắn nhưng vẫn giữ canonical meaning, ví dụ `CW / Kho Tổng`.

### Code, DB, và contracts

- Dùng English canonical terms cho table, type, enum, RPC, folder, và file.
- Không đổi qua lại giữa `warehouse`, `hq`, `headquarters`, `central_warehouse` cho cùng một khái niệm — schema chốt là `central_warehouse`.
- Không nhét alias business vào identifier kỹ thuật để “cho dễ đọc”.

## Quan hệ với các nguồn chuẩn khác

- Business semantics chi tiết: [business-context.md](business-context.md), [inventory.md](inventory.md)
- HĐĐT & thuế GTGT: [einvoice-tax.md](einvoice-tax.md)
- Thuế TNCN & lương: [payroll-pit.md](payroll-pit.md)
- HĐLĐ, BHXH: [labor-contracts.md](labor-contracts.md)
- Kiến trúc hệ thống: [../spec/architecture.md](../spec/architecture.md)
- Schema và enum: [../spec/database-schema.md](../spec/database-schema.md)
- Inventory UI labels: [../../apps/web/app/(protected)/inventory/\_lib/dictionary.ts](<../../apps/web/app/(protected)/inventory/_lib/dictionary.ts>)
- Module / site / nav labels chung: [../../packages/shared/src/labels/vi.ts](../../packages/shared/src/labels/vi.ts)
- Regression rules: [../../tasks/regressions.md](../../tasks/regressions.md)

## Khi thêm thuật ngữ mới

Thêm vào glossary này trước hoặc cùng lúc với feature nếu thuật ngữ mới thuộc một trong các nhóm sau:

- mở thêm bounded context mới
- thêm workflow mới có chứng từ / trạng thái mới
- thêm label dễ drift giữa UI, business docs, và code
- thêm acronym mới cần dùng lặp lại nhiều nơi

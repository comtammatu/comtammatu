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

| Lớp | Ngôn ngữ chuẩn | Quy ước |
| --- | --- | --- |
| UI cho người dùng nội bộ | Tiếng Việt | Giữ acronym quen thuộc như `POS`, `KDS`, `HQ`, `GRN`, `WAC` nếu cần ngắn gọn |
| Docs nghiệp vụ | Tiếng Việt là chính | Lần nhắc đầu có thể ghi `Tiếng Việt (English)` để khóa nghĩa |
| Code, DB schema, type, RPC, file path | Tiếng Anh | Không đặt identifier bằng tiếng Việt |
| Comment kỹ thuật | Tiếng Anh hoặc tiếng Việt ngắn gọn | Ưu tiên rõ nghĩa, không trộn 2 nghĩa cho cùng một entity |

## Whitelist English được giữ lại

Chỉ giữ English trong một trong các nhóm sau:

- acronym hoặc thuật ngữ chuyên ngành đã chốt: `POS`, `KDS`, `HQ`, `ERP`, `PO`, `GRN`, `WAC`, `PIT`
- tên công nghệ, framework, hoặc vendor: `Supabase`, `Next.js`, `React`, `Tailwind`, `TypeScript`, `MoMo`, `VietQR`, `MISA`
- proper noun, code identifier, route, schema, enum, RPC, payload field, HTTP verb, env var
- đoạn glossary hoặc lần định nghĩa đầu cần khóa nghĩa theo mẫu `Tiếng Việt (English)`

Nếu không thuộc 1 trong 4 nhóm trên thì mặc định phải ưu tiên tiếng Việt.

## Denylist drift không được tái đưa vào copy

Các cụm dưới đây bị xem là drift và phải thay bằng nhãn tiếng Việt chuẩn tương ứng:

| Drift term | Dùng thay |
| --- | --- |
| `Employee Portal` | `Cổng nhân viên` |
| `Admin Shell` | `Khung quản trị` hoặc `nền tảng quản trị` tùy ngữ cảnh |
| `Dashboard` | `Tổng quan` hoặc `buồng lái` tùy ngữ cảnh |
| `Stock` | `Kho hàng` hoặc `tồn kho` tùy ngữ cảnh |
| `Finance` | `Kế toán` hoặc `tài chính` tùy ngữ cảnh |
| `Shipped` | `Hoàn thành` |
| `Point of Sale` | `POS` |
| `Kitchen Display System` | `KDS` hoặc `màn hình bếp` |
| `HR / Payroll`, `HR & Payroll` | `Nhân sự & tiền lương` |
| `Restaurant Management System` | `hệ thống quản lý vận hành nhà hàng` |
| `Báo cáo CEO` | `Báo cáo điều hành` |

## Quy tắc thực thi

- Không viết label kiểu `Tiếng Việt · English label` trong UI, status page, docs vận hành, hoặc roadmap.
- Khi thêm copy mới vào app, ưu tiên đi qua `packages/shared/src/labels/vi.ts` hoặc dictionary domain tương ứng trước khi hardcode.
- Khi sửa docs hoặc status artifact, ưu tiên một cách gọi tiếng Việt xuyên suốt trong cùng tài liệu.
- Khi một cụm thuộc denylist xuất hiện lại trong PR, phải sửa về nhãn chuẩn ngay trong cùng PR đó.

## Canonical terms

### Tổ chức và địa điểm vận hành

| Canonical English | Nhãn tiếng Việt chuẩn | Dùng khi nào | Tránh dùng |
| --- | --- | --- | --- |
| `tenant` | tenant / pháp nhân CTCP | Khi nói về legal owner cấp hệ thống, single-tenant row | công ty, hệ thống, brand nếu đang nói row dữ liệu |
| `branch` | chi nhánh | Site vận hành cấp L1 | cửa hàng nếu đang nói entity DB |
| `headquarters` | trụ sở (`HQ`) | Điểm nhập NCC duy nhất trong pilot | kho tổng |
| `central kitchen` | bếp trung tâm | Site sản xuất thành phẩm | tổng bếp, bếp tổng |
| `branch warehouse` | kho chi nhánh | Điểm nhận / giữ tồn tại chi nhánh | kho con |
| `branch kitchen` | bếp chi nhánh | Điểm tiêu hao cuối cùng cho bán hàng | bếp cửa hàng nếu đang nói topology chuẩn |
| `site` | site vận hành | Specs / technical docs khi cần gom `HQ`, `central_kitchen`, `branch` | dùng thay cho `branch` trong UI |

### Bề mặt sản phẩm

| Canonical English | Nhãn tiếng Việt chuẩn | Ghi chú |
| --- | --- | --- |
| `admin` | quản trị | Tenant-level management surface |
| `content management system (CMS)` | quản trị nội dung | Dùng cho banner, promo, landing content, media, SEO metadata |
| `customer relationship management (CRM)` | quản lý khách hàng | Dùng cho hồ sơ khách, lịch sử mua, loyalty, voucher, segmentation |
| `inventory ops` | điều hành kho | Có thể rút gọn `Kho hàng` trong nav |
| `point of sale (POS)` | POS | Không ép dịch thành `điểm bán` trong UI |
| `kitchen display system (KDS)` | KDS | Có thể chú thích `màn hình bếp` ở docs/onboarding |
| `employee portal` | cổng nhân viên | Dùng cho `/employee` |

### Bán hàng và vận hành tiền tuyến

| Canonical English | Nhãn tiếng Việt chuẩn | Dùng khi nào | Tránh dùng |
| --- | --- | --- | --- |
| `order` | đơn hàng bán | Đơn phát sinh ở POS | đơn hàng nếu đang đứng cạnh procurement |
| `order item` | dòng món | Một món trong đơn | item nếu viết user-facing copy |
| `menu item` | món bán | Item trong menu | sản phẩm nếu đang nói F&B order flow |
| `table session` | phiên bàn | Nếu cần nói lifecycle tại bàn | bàn mở nếu cần phân biệt record |
| `POS session` | ca POS | Shift mở trên terminal | ca bán hàng nếu đang nói entity kỹ thuật |
| `terminal` | máy POS | Thiết bị / điểm POS cụ thể | máy thu ngân |
| `kds ticket` | phiếu bếp | Ticket hiển thị trên KDS | order bếp |

### Procurement, kho, và sản xuất

| Canonical English | Nhãn tiếng Việt chuẩn | Dùng khi nào | Tránh dùng |
| --- | --- | --- | --- |
| `purchase order (PO)` | đơn đặt hàng NCC | Đơn mua gửi NCC | đơn hàng |
| `goods received note (GRN)` | phiếu nhập kho | Hàng thực nhận từ NCC tại HQ | receiving note, phiếu nhận |
| `supplier invoice` | hóa đơn NCC | Hóa đơn đầu vào từ NCC | invoice nếu không rõ loại |
| `tax invoice / e-invoice` | hóa đơn điện tử bán ra (`HĐĐT`) | Hóa đơn xuất cho giao dịch bán | hóa đơn nếu đang đứng cạnh supplier invoice |
| `stock level` | tồn kho | Snapshot số lượng + WAC tại site | số lượng tồn nếu đang nói entity chuẩn |
| `stock movement` | biến động tồn kho | Ledger append-only | giao dịch kho nếu cần chỉ rõ loại movement |
| `stock transfer` | phiếu điều chuyển nội bộ | Luân chuyển giữa hai site thật | phiếu xuất kho nếu đang là inter-site transfer |
| `stock issue` | phiếu xuất kho | Xuất dùng nội bộ trong cùng site / cấp phát | điều chuyển nếu không có site nhận riêng |
| `stocktake` | kiểm kê | Đếm thực tế và điều chỉnh | kiểm kho nếu đang cần term chuẩn |
| `raw material` | nguyên liệu | Item đầu vào | vật tư nếu không phải ngữ cảnh ERP rộng |
| `finished good` | thành phẩm | Hàng do bếp trung tâm sản xuất hoặc giữ tồn để cấp xuống bếp chi nhánh | món hoàn chỉnh nếu đang nói item tồn kho |
| `recipe` | công thức món | Định mức nguyên liệu cho món bán | BOM nếu không phải production context |
| `production recipe` | công thức sản xuất | BOM cho thành phẩm | recipe nếu cần phân biệt rõ với món bán |
| `production order` | lệnh sản xuất | Lệnh tại bếp trung tâm | work order |
| `three-way matching` | đối soát 3 chứng từ | Đối chiếu `PO`, `GRN`, `supplier_invoice` | matching nếu không nói rõ 3 chiều |
| `weighted average cost (WAC)` | giá vốn bình quân gia quyền | Costing chuẩn v1 | FIFO cost nếu đang nói hệ thống hiện tại |

### Vai trò người dùng

| Code role (`user_role` legacy) | Nhãn tiếng Việt chuẩn | Boundary |
| --- | --- | --- |
| `owner` | chủ sở hữu | Vai trò cao nhất cấp tenant |
| `super_manager` | quản lý tổng | Vận hành cấp trụ sở |
| `area_manager` | quản lý khu vực | Quản trị nhiều chi nhánh |
| `branch_manager` | quản lý chi nhánh | Quản trị một chi nhánh vận hành |
| `warehouse_manager` | quản lý kho tổng | Procurement + kho Trụ sở (`kho_truong`, `thu_kho`) |
| `production_manager` | quản lý sản xuất | Bếp trung tâm (`bep_truong`) |
| `cashier` | thu ngân | POS |
| `waiter` | phục vụ | POS |
| `chef` | bếp | KDS |
| `office` | văn phòng | Cổng nhân viên / HQ |

`user_role` là **legacy claim** trong JWT, derived từ `positions.legacy_role_code`. Vai trò mới (`warehouse_manager`, `production_manager`) được thêm khi Auth v2 tách Kho và Bếp trung tâm thành workstream riêng.

### Auth v2 — Position ⟂ Permission

| Thuật ngữ | Code identifier | Ý nghĩa |
| --- | --- | --- |
| position (chức vụ) | `positions(code, legacy_role_code)` | Nhãn HR của nhân viên. Không gate authz trực tiếp. VD: `bep_truong`, `kho_truong`, `thu_kho`. |
| permission key (khóa quyền) | `permission_keys(key)` | Chuỗi canonical cho hành động, vd `inventory:production_create`. Đơn vị authz nhỏ nhất. |
| template (bộ quyền mẫu) | `role_templates(position_code, permission_keys[])` | Preset quyền gắn với 1 position; snapshot, không propagate khi edit. |
| grant (cấp quyền) | `staff_permissions(user_id, branch_id, permission_key)` | Quyền thật của user tại branch cụ thể. `branch_id IS NULL` = tenant-wide. |

Copy UI ưu tiên tiếng Việt: `chức vụ`, `khóa quyền`, `bộ quyền mẫu`, `cấp quyền`. Code, schema, RPC giữ tên tiếng Anh.

## Decision rules cho các cặp từ dễ drift

### `order` vs `purchase order`

- Dùng `order` khi nói về đơn bán phát sinh ở `POS`.
- Dùng `purchase order` hoặc `đơn đặt hàng NCC` khi nói procurement.
- Không dùng label ngắn `Đơn hàng` cho cả sales và procurement trong cùng một surface.

### `headquarters` vs `kho tổng`

- Dùng `headquarters` hoặc `trụ sở (HQ)` làm canonical term.
- `kho tổng` chỉ nên xuất hiện như legacy phrasing cần thay dần.
- Lý do: `kho tổng` dễ bị hiểu là một warehouse node, không phải site chuẩn của pilot.

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

## Quy tắc áp dụng theo bề mặt

### UI và product copy

- Ưu tiên tiếng Việt ngắn, rõ nghiệp vụ.
- Giữ acronym quen thuộc nếu người dùng đã nhận diện: `POS`, `KDS`, `HQ`, `GRN`, `WAC`.
- Nếu UI cần label riêng, map ở dictionary/formatter layer thay vì tạo synonym trong domain type.

### Docs và specs

- Lần nhắc đầu tiên nên giới thiệu song ngữ cho thuật ngữ dễ nhầm.
- Trong cùng một tài liệu, dùng một cách gọi duy nhất cho cùng một entity.
- Khi sơ đồ cần rút gọn, ưu tiên label ngắn nhưng vẫn giữ canonical meaning, ví dụ `HQ / Trụ sở`.

### Code, DB, và contracts

- Dùng English canonical terms cho table, type, enum, RPC, folder, và file.
- Không đổi qua lại giữa `warehouse`, `hq`, `headquarters` cho cùng một khái niệm nếu schema đã chốt là `headquarters`.
- Không nhét alias business vào identifier kỹ thuật để “cho dễ đọc”.

## Quan hệ với các nguồn chuẩn khác

- Business semantics chi tiết: [business-context.md](business-context.md), [inventory.md](inventory.md)
- Kiến trúc hệ thống: [../spec/architecture.md](../spec/architecture.md)
- Schema và enum: [../spec/database-schema.md](../spec/database-schema.md)
- Inventory UI labels hiện có: [../../apps/web/app/inventory/_lib/dictionary.ts](../../apps/web/app/inventory/_lib/dictionary.ts)

## Khi thêm thuật ngữ mới

Thêm vào glossary này trước hoặc cùng lúc với feature nếu thuật ngữ mới thuộc một trong các nhóm sau:

- mở thêm bounded context mới
- thêm workflow mới có chứng từ / trạng thái mới
- thêm label dễ drift giữa UI, business docs, và code
- thêm acronym mới cần dùng lặp lại nhiều nơi

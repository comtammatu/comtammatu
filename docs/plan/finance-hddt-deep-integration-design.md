# Thiết kế Finance HĐĐT Deep Integration

> Ngày: 2026-06-17
>
> Phạm vi: thiết kế IA, wireframe chú thích, component inventory, status taxonomy,
> copy deck và interaction spec cho Finance + Dashboard HĐĐT Viettel S-invoice.
> Không có product code trong artifact này.

## 1. Cổng thiết kế

**Skill plan:** repo rules = `engineering.md`, `skills.md`, `ui.md`,
`workflow.md`, `team.md`, `references.md`, `docs/spec/design-system.md`,
`docs/modules/ui.md`, `docs/modules/finance.md`, `docs/ref/legal-framework-2026.md`,
`docs/ref/einvoice-tax.md`, `docs/ref/business-context.md`; external skills =
`product-design:get-context` playback, `build-web-apps:shadcn`, `impeccable`
product register; runtime tools = CodeGraph + shell đọc docs; skipped = không
prototype, không browser smoke vì task là spec-only.

**Surface:** Finance workspace.

**Primary user job:**

- Chủ: mở điện thoại để biết hôm nay tiền ổn chưa, HĐĐT đã xuất và lưu đủ chưa,
  còn việc gì phải xử lý ngay không.
- Kế toán: mở desktop để lọc, đối soát, xử lý lỗi, tải XML/PDF, xuất dữ liệu kê
  khai và kiểm tra log vận hành.

**Route family:** `/finance`.

**Change type:** UX flow + IA + copy + behavior spec. Không thay visual system.

**Primitives bắt buộc:** `AppPage`, `AppPageHeader`, `AppSection`, `AppToolbar`,
`KpiCard`, `CompareChip`, `DataTable` + `mobileCardRender`, `StatusBadge`,
`FilterBar`, `ChartCard`, `HeatmapGrid`, `CashPanel`, `MvStalenessBanner`,
`ExportToolbar`, `WorkQueueStrip`, `Sheet`, `AlertDialog`, `Field/FieldGroup`,
`Sonner`.

**Regression rules cần giữ:** `DESIGN-SYSTEM-CONTRACT-FIRST`,
`APP-SURFACE-ADAPTER-FIRST`, `UI-PERMISSION-FLAGS-THREADED-NOT-SERVER-ONLY`,
`UI-EMPTY-STATE-VIA-APP-EMPTY-STATE`, `UI-NO-RAW-TABLE-OUTSIDE-PRIMITIVE`,
`STATUS-LABEL-NO-LOGIC`, `REALTIME-SUBSCRIBE-NEEDS-STATUS-CALLBACK`,
`HDDT-RECONCILE-UNKNOWN-STATUS-NO-OP`.

## 2. Góc rà soát

**PM:** Không biến `/finance` thành ERP. Landing vẫn là "Sổ tiền của quán"; HĐĐT
được thêm như lớp an tâm tuân thủ và hàng đợi cần xử lý. Done khi chủ thấy ngay:
đã xuất, đã lưu, có lỗi CQT không, cần bấm đâu.

**BA:** Phân biệt bốn thứ không được nhầm: `cqt_code` là Mã CQT, `reservationCode`
là mã tra cứu bí mật, XML là bản gốc pháp lý, PDF là bản đọc được. HKD dùng
phương pháp trực tiếp: không hiển thị một mức VAT chung như 8%; luôn dùng
`vat_rate` trên từng hóa đơn và ghi chú giá MTT đã gồm thuế.

**Senior Dev:** Tái dùng route/component hiện có. Hub attention có thể là đầu
`/finance/invoices`; detail dùng `Sheet`; list dùng `DataTable`. Trạng thái mới
đi qua `StatusBadge` registry, không tạo map page-local. Bộ lọc nằm ở URL params,
không dùng localStorage.

**QA/QC:** Mỗi surface phải có loading, empty, error, no-access và trạng thái partial.
Mobile của chủ phải có queue/action đầu tiên trong viewport; desktop kế toán phải
có bảng dày và export. Action thiếu quyền phải bị ẩn hoặc disabled có lý do,
không đợi click rồi trả lỗi.

## 3. Kiến trúc thông tin

### 3.1 Sitemap

```text
/finance
  Tổng quan tiền hôm nay
  + HĐĐT & Tuân thủ band

/finance/revenue
  Doanh thu, VAT đầu ra, heatmap, thu ngân

/finance/expenses
  Chi vận hành HKD

/finance/food-cost
  Giá vốn món, biên gộp

/finance/invoices
  Hóa đơn điện tử
  - tab: Cần xử lý
  - tab: Danh sách HĐ
  - tab: Lưu trữ & giao email

/finance/kekhai
  Kê khai
  - output HĐĐT issued
  - input supplier_invoices
  - ngưỡng 1 tỷ/năm và nhóm doanh thu
  - export cho kế toán

/finance/operations
  Vận hành HĐĐT
  - reconcile_run_log
  - archive_run_log
  - summary_run_queue
  - manual triggers

/finance/summary
  Compatibility route hiện có
  - giữ deep link
  - trỏ vào /finance/operations?tab=summary sau khi có route mới
```

### 3.2 Nav Placement

| Nhóm nav | Item | Route | Gate | Ghi chú |
| --- | --- | --- | --- | --- |
| Cơ bản | Tổng quan | `/finance` | `finance:view` | Giữ landing tiền |
| Cơ bản | Doanh thu | `/finance/revenue` | `finance:view` | Giữ như hiện tại |
| Cơ bản | Tồn kho | `/admin/reports/inventory-value` | existing | Giữ link từ Finance Basic |
| Cơ bản | Lợi nhuận gộp | `/finance/food-cost` | `finance:view` | Giữ read-only |
| Cơ bản | Chi vận hành | `/finance/expenses` | `finance:view` | Giữ HKD single-entry |
| Hóa đơn | Hóa đơn điện tử | `/finance/invoices` | `finance:view` | Hub + list |
| Hóa đơn | Kê khai | `/finance/kekhai` | `finance:view` | New |
| Hóa đơn | Vận hành HĐĐT | `/finance/operations` | `settings:tenant` để action, `finance:view` để read | New |

`showInvoices` điều khiển `Hóa đơn điện tử` + `Kê khai`. `showSummary` hoặc
`settings:tenant` điều khiển action trong `Vận hành HĐĐT`; read-only log vẫn có
thể hiện khi có `finance:view` nếu owner muốn kế toán xem nhưng không trigger.

## 4. Surface A: Dashboard `/finance`

### 4.1 Wireframe desktop

```text
AppPage wide compact
┌ AppPageHeader: Sổ tiền của quán                         2026-06-17 -> 2026-06-17 ┐
├ FilterBar: chi nhánh, hôm nay/hôm qua/7 ngày/tháng này                            │
├ KpiCard x5: Doanh thu | Giá trị tồn kho | Chi vận hành | Lãi gộp | Lãi ròng        │
├ CashPanel: Tiền mặt hiện hữu | Lợi nhuận thực tế                                  │
├ AppSection size=sm title="HĐĐT & Tuân thủ" action="Mở hàng đợi"                   │
│  ┌ HĐ issued kỳ này ┐ ┌ Cần xử lý ┐ ┌ Chưa lưu trữ ┐ ┌ CQT từ chối ┐              │
│  │ 3.190            │ │ 12        │ │ 48           │ │ 2           │              │
│  └ hint             ┘ └ warning   ┘ └ warning      ┘ └ destructive ┘              │
│  RetentionMeter: Lưu trữ 1.240/3.190 HĐ đã phát hành                              │
│  Inline note: XML là bản gốc pháp lý, PDF là bản đọc được.                         │
├ Grid QuickPanel x4                                                                 │
│  Tiền thu theo phương thức | Công thức lãi gộp                                    │
│  Nguyên liệu giữ vốn nhiều nhất | Cần kiểm tra                                    │
└───────────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Wireframe mobile

```text
Sổ tiền của quán
Khoảng: hôm nay
[FilterBar collapsed]

[KPI cards 1 cột hoặc 2 cột tùy width]
[CashPanel]

HĐĐT & Tuân thủ
┌ Cần xử lý 12        [Mở] ┐
│ CQT từ chối 2            │
│ Chưa lưu trữ 48          │
│ Lưu trữ 1.240/3.190      │
└──────────────────────────┘

[QuickPanel Cần kiểm tra]
```

### 4.3 Chú thích

- Band nằm sau `CashPanel`, trước QuickPanel grid. Như vậy tiền vẫn là nội dung
  đầu, HĐĐT là lớp kiểm tra sau tiền.
- Dùng `AppSection size="sm"` với `tone="warning"` chỉ khi attention > 0 hoặc
  CQT rejection > 0. Nếu mọi thứ clear, dùng tone default và success meter.
- `RetentionMeter` dùng `Progress` semantic. Không dùng chart mới.
- Copy phải ngắn: "Cần xử lý" quan trọng hơn "Tổng số hóa đơn".
- Link chính: `/finance/invoices?queue=attention`. Tap từ từng tile thêm filter:
  `queue=draft`, `queue=archive_error`, `queue=cqt_rejected`.

### 4.4 Trạng thái

| State | Thiết kế |
| --- | --- |
| Loading | Skeleton cho 4 compliance tiles + thanh meter. Không spinner giữa page. |
| Empty | "Chưa có HĐĐT trong kỳ này." Link "Xem danh sách hóa đơn". |
| Error | `AppEmptyState mode="error"` trong AppSection, copy an toàn. |
| No access | Ẩn band nếu không có `finance:view`. Finance owner-only nên không render cho role khác. |
| Partial | `cqt_code` thiếu không làm toàn band lỗi. Tile CQT dùng "Đang chờ mã" khi `submitted/signing`. |

## 5. Surface B: HĐĐT Compliance & Operations Hub

Đặt ở đầu `/finance/invoices`, trên bảng list. Route page có `AppPageHeader`:
"Hóa đơn điện tử", description: "Theo dõi phát hành, Mã CQT, lưu trữ XML/PDF và
giao email cho khách."

### 5.1 Wireframe desktop

```text
AppPage
├ AppPageHeader: Hóa đơn điện tử                         [Phát hành lại tất cả nháp]
├ AppSection title="Cần xử lý trước"
│  ┌ Nháp/lỗi phát hành ┐ ┌ Kẹt ký/gửi CQT ┐ ┌ Lỗi lưu trữ ┐ ┌ CQT từ chối ┐ ┌ Chưa giao email ┐
│  │ 8                  │ │ 3              │ │ 48          │ │ 2           │ │ 17              │
│  │ lâu nhất 42 phút   │ │ cron 5 phút    │ │ coverage 98%│ │ xem lý do   │ │ resend          │
│  │ [Phát hành lại]    │ │ [Đồng bộ lại]  │ │ [Lưu hàng loạt] │ [Mở queue] │ [Gửi lại]       │
│  └────────────────────┘ └────────────────┘ └─────────────┘ └────────────┘ └────────────────┘
├ AppSection title="Sức khỏe cron"
│  Reconcile: chạy 5 phút trước · backlog 3
│  Archive: chạy 12 phút trước · backlog 48 · giveup 1
│  Summary: 02:05 ICT · hôm qua issued 3 chi nhánh
└ Tabs: Cần xử lý | Danh sách HĐ | Lưu trữ & giao email
```

### 5.2 Wireframe mobile

```text
Hóa đơn điện tử
[Segmented: Cần xử lý | Danh sách]

Cần xử lý trước
┌ Nháp/lỗi phát hành 8        [Phát hành lại] ┐
│ Hóa đơn bị provider từ chối hoặc tạo draft. │
└─────────────────────────────────────────────┘
┌ Kẹt ký/gửi CQT 3             [Đồng bộ lại]  ┐
└─────────────────────────────────────────────┘
┌ Lỗi lưu trữ 48               [Lưu hàng loạt]┐
└─────────────────────────────────────────────┘

Sức khỏe cron
Reconcile 5 phút trước
Archive 12 phút trước
```

### 5.3 Ngữ nghĩa hàng đợi

| Queue | Query intent | Primary action | Gate |
| --- | --- | --- | --- |
| Nháp/lỗi phát hành | `status='draft'` hoặc provider rejected | `Phát hành lại tất cả` | `orders:write` |
| Kẹt ký/gửi CQT | `status IN ('signing','submitted')` quá SLA | `Đồng bộ lại` | `orders:write` hoặc `settings:tenant` tùy action hiện có |
| Lỗi lưu trữ | `status='issued'` và thiếu PDF/XML/hash hoặc `archive_last_error` | `Lưu trữ hàng loạt` | `settings:tenant` |
| CQT từ chối | `cqt_rejection_reason IS NOT NULL` | Mở list filtered + detail banner | `finance:view`; sửa/retry cần action gate |
| Chưa giao email | buyer_email có nhưng delivery chưa sent hoặc error | `Gửi lại email` | `settings:tenant` hoặc delivery permission khi có |

## 6. Surface C: Invoice List `/finance/invoices`

### 6.1 Wireframe desktop

```text
AppToolbar
  Search: Số HĐ, Mã CQT, đơn, MST
  Filters: trạng thái | loại HĐ | khoảng ngày | chi nhánh | có MST | lưu trữ | giao email
  Bulk: theo queue đang chọn
  Actions: Làm mới

DataTable
┌ Số HĐ      ┬ Ký hiệu ┬ Mã CQT     ┬ Người mua / MST ┬ Giá trị ┬ Trạng thái ┬ Lưu trữ ┬ Giao ┬ Thời gian ┬ Actions ┐
│ C26MAA3190 │ C26MAA │ 00ABC...   │ Công ty A / MST │ 145.000 │ Đã phát hành │ Đã lưu │ Đã gửi │ 17/06 12:44 │ ...    │
│ C26MAA3189 │ C26MAA │ Đang chờ   │ Người mua...    │ 65.000  │ Đã gửi CQT   │ Chưa lưu│ Không yêu cầu │ ...    │ ...    │
└────────────┴────────┴────────────┴──────────────────┴─────────┴────────────┴─────────┴──────┴───────────┴────────┘
[Tải thêm]
```

### 6.2 Card mobile

```text
┌ C26MAA3190                         Đã phát hành ┐
│ Ký hiệu C26MAA                                      │
│ Mã CQT: 00ABC...                                    │
│ Người mua: Công ty A                                │
│ MST: 0312891234                                     │
│ 145.000đ                          Lưu: Đã lưu       │
│ 17/06/2026 12:44                  Giao: Đã gửi      │
│ [Chi tiết] [PDF] [XML] [⋯]                          │
└─────────────────────────────────────────────────────┘
```

### 6.3 Cột dữ liệu

| Cột | Desktop | Mobile |
| --- | --- | --- |
| Số HĐ | `font-mono`, copy ở detail | dòng 1 |
| Ký hiệu | `invoice_series`, fallback "Chưa có" | metadata |
| Mã CQT | hiển thị giá trị, "Đang chờ", "Không khả dụng" | metadata kèm tooltip |
| Người mua / MST | 2 dòng | 2 dòng |
| Giá trị | `font-mono tabular-nums`, canh phải | nổi bật |
| Trạng thái | `StatusBadge domain="tax-invoice"` | top-right |
| Lưu trữ | archive state badge | metadata |
| Giao | delivery state badge | metadata |
| Thời gian | issued_at else created_at | footer |
| Actions | nút icon | nút text khi cần rõ nghĩa |

### 6.4 Bộ lọc

| Bộ lọc | Giá trị | URL param |
| --- | --- | --- |
| Trạng thái | tất cả, nháp, đang ký, đã gửi CQT, đã phát hành, đã hủy, đã thay thế, legacy | `status` |
| Loại HĐ | tất cả, HĐ theo đơn, HĐ tổng hợp B2C ngày | `kind` |
| Khoảng ngày | hôm nay, hôm qua, 7 ngày, tháng này, quý này, tự chọn | finance params hiện có |
| Chi nhánh | tất cả, branch ids | `branch` |
| Có MST | tất cả, có MST, không MST | `buyerTax` |
| Tình trạng lưu trữ | tất cả, chưa lưu, đã lưu, lỗi, quá hạn | `archive` |
| Giao email | tất cả, đã gửi, chưa gửi, lỗi gửi, không yêu cầu | `delivery` |

Keyset paging giữ `before` cursor. Khi đổi filter, reset cursor và scroll false.

## 7. Surface D: Invoice Detail Sheet

### 7.1 Wireframe desktop

```text
Sheet side, width large, max-h-dvh-95
┌ Header: C26MAA3190                         [Đã phát hành] [X] ┐
│ HĐ theo đơn · Đơn #MT-2401 · CN Cao Thắng                     │
├ RejectionBanner nếu có CQT từ chối                             │
├ Identity                                                        │
│ Số HĐ [copy] | Ký hiệu [copy] | Mã CQT [copy hoặc Đang chờ]     │
│ Mã tra cứu Viettel [copy]  (không phải Mã CQT)                  │
├ Buyer                                                           │
│ Tên, MST, địa chỉ, email, trạng thái giao email                 │
├ Amounts                                                         │
│ Tạm tính | vat_rate | Tiền thuế | Tổng                          │
│ Note: Mẫu MTT 2/... hiển thị giá đã gồm thuế; XML là bản gốc.   │
├ Line items table                                                │
├ State timeline                                                  │
│ draft -> signing -> submitted -> issued                         │
│ actor, time, payload summary, note                              │
├ Provider refs                                                   │
│ transactionID, transactionUuid, supplierTaxCode                  │
├ Archive panel                                                   │
│ PDF [Tải] sha256 ... | XML [Tải bản gốc pháp lý] sha256 ...     │
│ archived_at, attempts, last_error, [Lưu trữ lại]                 │
├ Lookup panel                                                    │
│ Link Viettel, QR, mã tra cứu reservationCode                    │
├ Replacement chain                                                │
│ HĐ gốc -> HĐ thay thế, lý do, biên bản, ngày                    │
└ Sticky footer actions                                            │
  [Sửa PTTT] [Hoàn tiền] [Thay thế] [Hủy hóa đơn]
```

### 7.2 Wireframe mobile

```text
Bottom Sheet
C26MAA3190                  Đã phát hành
Tổng: 145.000đ

[Alert nếu CQT từ chối]
[Identity compact]
[Tải XML] [Tải PDF]
[Tra cứu Viettel]

Tabs:
Tổng quan | Dòng món | Lịch sử | Lưu trữ

Sticky bottom:
[Thay thế] [Hủy]
```

### 7.3 Khối nội dung

| Block | Dữ liệu | Ghi chú |
| --- | --- | --- |
| Identity | invoice_number, invoice_series, cqt_code, invoice_kind, summary_date, summary_orders_count | `cqt_code` optional. Không dùng reservationCode cho Mã CQT. |
| Buyer | buyer_name, buyer_tax_code, buyer_address, buyer_email | Mặc định "Người mua không lấy hóa đơn". |
| Amounts | subtotal, vat_rate, vat_amount, total_amount | `vat_rate` per invoice. Note MTT VAT-inclusive. |
| Line items | order lines hoặc summary grouped lines | Món kèm/topping là dòng riêng nếu provider payload có. |
| Timeline | `tax_invoice_events` | Payload collapsed, copy actor "Hệ thống" cho cron UUID. |
| Provider refs | provider_data.transactionID, transactionUuid, supplierTaxCode | Reservation code ở lookup block riêng. |
| Archive | pdf_url, xml_url, sha256, archived_at, attempts, last_error | XML button phải nhấn mạnh "bản gốc pháp lý". |
| Lookup | reservationCode + seller MST | Fallback rõ ràng nếu chưa rõ URL hoặc thiếu code. |
| Delivery | buyer_email + delivery status | Nếu chưa xác nhận Viettel auto-delivery, hiển thị "Chưa xác nhận kênh giao". |
| Replacement | replaced_by, replaced_for, reason, agreement ref/date | Link hai chiều cũ/mới. |

### 7.4 Gate quyền

| Action | Khi hiện | Gate | Confirm |
| --- | --- | --- | --- |
| Phát hành lại | `status='draft'`, có order_id | `orders:write` | AlertDialog bulk/single |
| Đồng bộ lại | `signing/submitted` | `orders:write` hoặc route action hiện có | No destructive confirm, toast outcome |
| Lưu trữ lại | issued thiếu archive | `settings:tenant` | Confirm nhẹ nếu bulk |
| Gửi lại email | buyer_email có | delivery permission hoặc `settings:tenant` | Confirm nhẹ |
| Hủy hóa đơn | issued | `settings:tenant` | reason >=20, legal warning |
| Thay thế | issued | `settings:tenant` | reason >=20, biên bản, ngày, buyer fields |
| Hoàn tiền | issued/order paid | payment refund permission hiện có | reason >=5, warning không tự hủy HĐ |
| Sửa PTTT | issued/order paid | current action permission | reason >=5, warning chỉ sửa nội bộ |

User thiếu quyền permanent: ẩn action. Block tạm thời: disabled + tooltip, ví dụ
"Chỉ hủy được HĐ đã phát hành" hoặc "Cần PDF/XML trước khi tải".

## 8. Surface E: Kê khai `/finance/kekhai`

### 8.1 Wireframe desktop

```text
AppPage wide compact
├ AppPageHeader: Kê khai
│  description: Tổng hợp HĐĐT đầu ra, chứng từ đầu vào và ngưỡng HKD cho kế toán.
├ AppToolbar
│  Kỳ: Quý 2/2026 | Chi nhánh: Tất cả | Loại: quý/tháng | [Tải CSV] [Tải Excel]
├ KpiCard row
│  Doanh thu HĐĐT issued | GTGT đầu ra | GTGT đầu vào | Ngưỡng 1 tỷ/năm | Nhóm doanh thu
├ AppSection title="Tình trạng nghĩa vụ"
│  Khai theo quý · Hạn nhắc: 30/07/2026 · Không tính tiền phạt trong hệ thống
│  Progress: doanh thu năm / 1 tỷ
├ AppSection title="Đầu ra theo loại hóa đơn"
│  DataTable: kỳ, invoice_kind, số HĐ, subtotal, vat, total
├ AppSection title="Đầu vào từ nhà cung cấp"
│  DataTable: supplier, invoice_number, matching_status, declared_period, vat, total
├ AppSection title="Gói xuất cho kế toán"
│  ExportToolbar + signature filters + checklist: XML archived, CQT rejections open, input docs matched
```

### 8.2 Wireframe mobile

```text
Kê khai
[Kỳ: Q2/2026] [Tất cả CN]

Doanh thu HĐĐT issued
3.190 HĐ · 412.000.000đ

Ngưỡng 1 tỷ/năm
412.000.000 / 1.000.000.000
Trạng thái: chưa vượt ngưỡng trong dữ liệu hệ thống

[Xuất CSV]
[Đầu ra] [Đầu vào] [Checklist]
```

### 8.3 Ngữ nghĩa thuế

- Output totals lấy `tax_invoices WHERE status='issued'`, group by period +
  `invoice_kind`.
- Input totals lấy `supplier_invoices`, group by `declared_period` và
  `matching_status`.
- Với HKD phương pháp trực tiếp, `supplier_invoices` là hồ sơ đối chiếu chi phí
  và thuế, không mặc định là VAT được khấu trừ nếu chưa có cấu hình kế toán.
- Ngưỡng 1 tỷ/năm theo NĐ 141/2026 được hiển thị như indicator nghĩa vụ, không
  tự kết luận hồ sơ pháp lý nếu dữ liệu năm chưa đủ.
- Nhóm doanh thu theo NĐ 68/2026: hiển thị "Dựa trên dữ liệu hệ thống" + "Kế toán xác
  nhận khi chốt hồ sơ".
- Không tính tiền phạt. Chỉ flag: "Sắp đến hạn kê khai", "Quá hạn nộp tờ khai"
  nếu lịch được cấu hình, và "Cần kế toán xử lý".

## 9. Surface F: Operations Log `/finance/operations`

### 9.1 Wireframe desktop

```text
AppPage wide compact
├ AppPageHeader: Vận hành HĐĐT
│  actions: [Đồng bộ lại] [Lưu trữ hàng loạt] [Chạy tổng hợp ngày]
├ Cron health strip
│  Reconcile 5 phút/lần · Archive 15 phút/lần · Summary 02:05 ICT
├ Tabs
│  Đồng bộ CQT | Lưu trữ PDF/XML | HĐ tổng hợp B2C
├ Tab Đồng bộ CQT
│  Filters: outcome, status before/after, branch, date, invoice
│  DataTable: thời gian, HĐ, before, provider_returned, outcome, tuổi attempt, error
├ Tab Lưu trữ PDF/XML
│  Filters: outcome, branch, date, giveup
│  DataTable: thời gian, HĐ, outcome, bytes PDF/XML, sha, attempt, error
├ Tab HĐ tổng hợp B2C
│  Trigger form: chi nhánh, ngày, [Chạy tổng hợp]
│  DataTable: summary_date, branch, status, trigger, tax_invoice_id, last_error, finished_at
```

### 9.2 Wireframe mobile

```text
Vận hành HĐĐT
[Tabs: CQT | Lưu trữ | Tổng hợp]

Cron health
Reconcile: 5 phút trước
Archive: 12 phút trước, backlog 48

[Outcome filter]
┌ 17/06 12:45  C26MAA3190  archived ┐
│ PDF 82KB · XML 21KB · attempt 2    │
│ hash ok                            │
└────────────────────────────────────┘
```

### 9.3 Bảng vận hành

| Tab | Outcomes | Action hàng loạt/thủ công |
| --- | --- | --- |
| Đồng bộ CQT | transitioned, no_change, race_lost, provider_error, unknown_status, giveup_24h | Đồng bộ lại các HĐ đang kẹt |
| Lưu trữ PDF/XML | archived, no_change, provider_error, storage_error, invalid_payload, hash_mismatch, giveup | Lưu trữ hàng loạt, retry failed |
| HĐ tổng hợp B2C | queued, running, issued, failed, skipped | Chạy tổng hợp ngày |

Trigger thủ công cần `settings:tenant`; nếu thiếu quyền, chỉ hiển thị bảng read-only.

## 10. Taxonomy trạng thái

### 10.1 Invoice Status

| Key | Label VI | Tone | Badge variant | Ý nghĩa |
| --- | --- | --- | --- | --- |
| `draft` | Nháp/lỗi phát hành | warning | `warning` | Provider chưa nhận hoặc đã từ chối, cần retry |
| `signing` | Đang ký | info | `info` | Đang ký/xử lý async |
| `submitted` | Đã gửi CQT | info | `info` | Đã gửi, chờ Mã CQT |
| `issued` | Đã phát hành | success | `success` | HĐ hợp lệ đang active |
| `cancelled` | Đã hủy | destructive | `destructive` | Trạng thái cuối |
| `replaced` | Đã thay thế | muted | `secondary` | Trạng thái cuối, có HĐ mới |
| `not_required` | Không yêu cầu (legacy) | muted | `secondary` | Chỉ dữ liệu cũ, không insert mới |

### 10.2 Archive State

| Key | Label VI | Tone | Badge variant | Quy tắc |
| --- | --- | --- | --- | --- |
| `not_archived` | Chưa lưu | warning | `warning` | issued nhưng thiếu PDF/XML/hash |
| `archiving` | Đang lưu | info | `info` | archive job đang chạy hoặc attempt mới |
| `archived` | Đã lưu | success | `success` | PDF + XML + sha256 + archived_at |
| `archive_error` | Lỗi lưu | destructive | `destructive` | archive_last_error hoặc outcome lỗi |
| `archive_overdue` | Quá hạn | destructive | `destructive` | giveup hoặc attempts >= threshold |

### 10.3 Delivery State

| Key | Label VI | Tone | Badge variant | Quy tắc |
| --- | --- | --- | --- | --- |
| `not_sent` | Chưa gửi | warning | `warning` | buyer_email có nhưng chưa delivered |
| `sent` | Đã gửi | success | `success` | delivered to buyer email |
| `send_error` | Lỗi gửi | destructive | `destructive` | delivery error |
| `not_required` | Không yêu cầu | muted | `secondary` | buyer_email trống hoặc khách không cần |

### 10.4 CQT Exchange

| Key | Label VI | Tone | Badge variant | Quy tắc |
| --- | --- | --- | --- | --- |
| `pending_code` | Chờ mã | info | `info` | signing/submitted hoặc issued nhưng cqt_code trống do provider chưa trả |
| `code_issued` | Đã cấp mã | success | `success` | cqt_code có |
| `rejected` | CQT từ chối | destructive | `destructive` | cqt_rejection_reason có |
| `unavailable` | Không khả dụng | muted | `outline` | MTT live probe xác nhận provider không trả Mã CQT |

### 10.5 Ops Outcome Badges

| Domain | Success | Info/muted | Warning | Destructive |
| --- | --- | --- | --- | --- |
| reconcile | transitioned | no_change, race_lost | unknown_status | provider_error, giveup_24h |
| archive | archived | no_change | provider_error | storage_error, invalid_payload, hash_mismatch, giveup |
| summary | issued | queued, running, skipped | skipped khi có lý do nghiệp vụ | failed |

## 11. Component inventory

### 11.1 Component hiện có cần tái dùng

| Component | Cách dùng |
| --- | --- |
| `AppPage`, `AppPageHeader`, `AppSection`, `AppToolbar` | Shell trang, section, toolbar |
| `KpiCard`, `CompareChip` | KPI tiền hiện có + tổng kê khai |
| `DataTable` + `mobileCardRender` | Invoice list, tax-period tables, ops logs |
| `StatusBadge` | Invoice, archive, delivery, CQT, ops outcomes |
| `FilterBar` | Dashboard/revenue style range controls |
| `ChartCard`, `HeatmapGrid` | Xu hướng kê khai và biểu đồ doanh thu hiện có nếu cần |
| `CashPanel` | Giữ dashboard hiện tại |
| `MvStalenessBanner` | Độ mới dữ liệu và refresh thủ công |
| `ExportToolbar` | Kê khai CSV/Excel-like export |
| `WorkQueueStrip` | Pattern tương thích cho queue compact |
| `Sheet`, `AlertDialog`, `Field/FieldGroup`, `Sonner` | Chi tiết, xác nhận, form, feedback |

### 11.2 Component mới đề xuất

| Component | Props | Trạng thái |
| --- | --- | --- |
| `ComplianceBand` | `summary`, `retention`, `attentionHref`, `canViewInvoices` | loading, clear, warning, error, no-access |
| `RetentionMeter` | `archivedCount`, `issuedCount`, `label`, `href` | empty, partial, complete |
| `InvoiceOpsHub` | `queues`, `cronHealth`, `permissions`, `onBulkAction` | clear, attention, bulk-pending, permission-readonly |
| `InvoiceFilterToolbar` | `filters`, `branches`, `onChange`, `bulkActions` | no filters, filtered, disabled pending |
| `InvoiceDetailSheet` | `invoice`, `events`, `permissions`, `onAction` | loading, not-found, partial archive, no-action |
| `InvoiceIdentityBlock` | `invoiceNumber`, `series`, `cqtCode`, `reservationCode` | code pending, code unavailable |
| `StateTimeline` | `events` | empty legacy row, collapsed payload, loading |
| `ArchivePanel` | `pdf`, `xml`, `sha`, `attempts`, `lastError`, `permissions` | not archived, archived, error, retrying |
| `LookupQr` | `reservationCode`, `sellerTaxCode`, `portalUrl` | available, unavailable, missing code |
| `DeliveryPanel` | `buyerEmail`, `status`, `lastAttempt`, `permissions` | no email, sent, error, pending |
| `ReplacementChain` | `replacedBy`, `replacedFor`, `reason`, `agreement` | none, original, replacement |
| `KekhaiPeriodPicker` | `periodType`, `period`, `branches` | month, quarter, custom if later |
| `TaxThresholdIndicator` | `yearRevenue`, `threshold`, `tier`, `asOf` | under, near, over, incomplete-data |
| `KekhaiExportPanel` | `signature`, `sections`, `archiveChecklist` | ready, disabled, warnings |
| `OpsLogTable` | `kind`, `rows`, `filters`, `manualActions` | empty, loading, filtered empty, error |

New components must delegate to approved primitives. No route-local `Card`,
`Table`, `Badge`, `Button`, `Empty` clones.

## 12. Copy deck tiếng Việt

### 12.1 Nav và tiêu đề trang

| Surface | Copy |
| --- | --- |
| Dashboard band title | HĐĐT & Tuân thủ |
| Dashboard band description | Kiểm tra nhanh hóa đơn đã phát hành, lưu trữ XML/PDF và lỗi cần xử lý. |
| Invoices title | Hóa đơn điện tử |
| Invoices description | Theo dõi phát hành, Mã CQT, lưu trữ XML/PDF và giao email cho khách. |
| Hub title | Cần xử lý trước |
| Tax page title | Kê khai |
| Tax page description | Tổng hợp HĐĐT đầu ra, chứng từ đầu vào và ngưỡng HKD cho kế toán. |
| Ops title | Vận hành HĐĐT |
| Ops description | Theo dõi cron đồng bộ CQT, lưu trữ PDF/XML và HĐ tổng hợp B2C. |

### 12.2 Nhãn trường

| Field | Label |
| --- | --- |
| `invoice_number` | Số hóa đơn |
| `invoice_series` | Ký hiệu |
| `cqt_code` | Mã CQT |
| `reservationCode` | Mã tra cứu |
| `transactionUuid` | Transaction UUID |
| `supplierTaxCode` | MST người bán |
| `buyer_name` | Người mua |
| `buyer_tax_code` | MST người mua |
| `buyer_address` | Địa chỉ người mua |
| `buyer_email` | Email nhận hóa đơn |
| `invoice_kind` | Loại HĐ |
| `summary_date` | Ngày tổng hợp |
| `summary_orders_count` | Số đơn tổng hợp |
| `subtotal` | Doanh thu trước thuế nội bộ |
| `vat_rate` | Thuế suất trên HĐ |
| `vat_amount` | Tiền thuế |
| `total_amount` | Tổng thanh toán |
| `xml_sha256` | Mã băm XML |
| `pdf_sha256` | Mã băm PDF |

### 12.3 Tooltip và ghi chú

| Context | Copy |
| --- | --- |
| Mã CQT pending | Mã CQT chưa có trong dữ liệu provider. HĐ vẫn cần theo dõi tới khi Viettel/CQT trả trạng thái cuối. |
| Mã CQT unavailable | Provider hiện chưa trả Mã CQT cho mẫu MTT này. Dùng XML đã lưu làm bản gốc pháp lý. |
| Reservation code | Mã tra cứu dùng cho cổng Viettel, không phải Mã CQT. |
| XML legal | XML là bản gốc pháp lý. PDF chỉ là bản đọc được cho người dùng. |
| VAT-inclusive | Mẫu máy tính tiền `2/...` hiển thị giá đã gồm thuế, không có dòng VAT riêng trên PDF. |
| Signed URL | Link tải hết hạn sau khoảng 5 phút vì bucket HĐĐT là private. |
| Input VAT HKD | Hóa đơn đầu vào là hồ sơ đối chiếu chi phí/thuế. Không mặc định là VAT được khấu trừ nếu kế toán chưa cấu hình. |
| Penalty | Hệ thống chỉ nhắc nghĩa vụ kê khai, không tự tính tiền phạt. |

### 12.4 Trạng thái rỗng

| Surface | Title | Description |
| --- | --- | --- |
| Dashboard band | Chưa có HĐĐT trong kỳ này | Khi có đơn đã thanh toán và HĐĐT được phát hành, trạng thái tuân thủ sẽ hiện tại đây. |
| Attention hub | Không có việc HĐĐT cần xử lý | Hóa đơn trong kỳ đã phát hành, đồng bộ và lưu trữ đủ theo dữ liệu hiện có. |
| Invoice list | Chưa có hóa đơn phù hợp | Đổi bộ lọc hoặc kiểm tra lại khoảng thời gian. |
| Detail events | Chưa có lịch sử trạng thái | Hóa đơn cũ có thể chưa ghi `tax_invoice_events`. Kiểm tra bản ghi chính và provider refs. |
| Tax period | Chưa có dữ liệu kê khai cho kỳ này | Chọn kỳ khác hoặc kiểm tra HĐĐT đã phát hành và hóa đơn NCC đã nhập. |
| Ops logs | Chưa có lần chạy trong khoảng này | Cron hoặc manual trigger chưa ghi log cho bộ lọc đang chọn. |

### 12.5 Trạng thái lỗi

| Context | Copy |
| --- | --- |
| Load invoices | Không thể tải danh sách HĐĐT. Vui lòng thử lại. |
| Load detail | Không thể tải chi tiết hóa đơn. |
| Download PDF | Không tạo được link tải PDF. Link private có thể đã hết hạn, hãy thử lại. |
| Download XML | Không tạo được link tải XML. XML là bản gốc pháp lý, cần kiểm tra lưu trữ nếu lỗi lặp lại. |
| Reconcile | Không thể đồng bộ với Viettel lúc này. Hệ thống sẽ thử lại ở lượt cron tiếp theo. |
| Archive | Không thể lưu trữ PDF/XML. Kiểm tra log lưu trữ để xem lỗi provider hoặc storage. |
| Email | Không thể gửi email hóa đơn. Kiểm tra email người mua và thử lại. |

### 12.6 Copy xác nhận

**Hủy hóa đơn**

- Title: `Xác nhận hủy hóa đơn`
- Description: `Hủy HĐĐT {invoice_number}? Hành động này được ghi vào hồ sơ HĐĐT theo NĐ 70/2025 và TT 32/2025. Hãy nhập lý do tối thiểu 20 ký tự và lưu biên bản/thỏa thuận nếu phát sinh với người mua.`
- Field: `Lý do hủy (tối thiểu 20 ký tự)`
- Placeholder: `Ví dụ: Khách yêu cầu xuất lại vì sai MST người mua.`
- CTA: `Hủy hóa đơn`

**Thay thế hóa đơn**

- Title: `Thay thế hóa đơn`
- Description: `Tạo HĐ thay thế cho {invoice_number}. HĐ gốc sẽ chuyển sang trạng thái "Đã thay thế". Theo TT 32/2025, cần lý do thay thế, biên bản/thỏa thuận và ngày văn bản.`
- Fields: `Lý do thay thế`, `Số biên bản/thỏa thuận`, `Ngày văn bản`, `Tên người mua`, `MST người mua`, `Địa chỉ`
- CTA: `Tạo HĐ thay thế`

**Hoàn tiền**

- Title: `Xác nhận hoàn tiền`
- Description: `Hoàn tiền/đảo thanh toán không tự hủy HĐĐT đã phát hành. Nếu cần xử lý hóa đơn, dùng Hủy hoặc Thay thế riêng theo quy trình HĐĐT.`
- CTA: `Hoàn tiền`

**Sửa phương thức thanh toán**

- Title: `Sửa phương thức thanh toán`
- Description: `Chỉ sửa báo cáo nội bộ theo phương thức thanh toán. Không thay đổi HĐĐT đã phát hành.`
- CTA: `Lưu phương thức`

## 13. Spec tương tác

### 13.1 Đường drill-down

| From | To | Filter |
| --- | --- | --- |
| Dashboard `Cần xử lý` | `/finance/invoices` | `queue=attention` |
| Dashboard `Chưa lưu trữ` | `/finance/invoices` | `archive=not_archived` |
| Dashboard `CQT từ chối` | `/finance/invoices` | `cqt=rejected` |
| Hub queue tile | `/finance/invoices` tab list | matching query |
| List row click | `InvoiceDetailSheet` | invoice id |
| Detail replacement link | Same Sheet reload | replaced invoice id |
| Tax period row | `/finance/invoices` | date range + kind |
| Ops log invoice id | `InvoiceDetailSheet` | invoice id |

### 13.2 Action hàng loạt

| Action | Scope | Confirmation | Result feedback |
| --- | --- | --- | --- |
| Phát hành lại tất cả | current `draft` queue | AlertDialog count + warning | Sonner summary: issued, failed, remaining |
| Đồng bộ lại | selected stuck signing/submitted | confirm if >1 | Sonner + refresh queue |
| Lưu trữ hàng loạt | issued missing archive | confirm count | Sonner + archive backlog refresh |
| Gửi lại email | selected delivery error/not_sent | confirm if >1 | Sonner per summary |
| Chạy tổng hợp ngày | branch + date | Form submit, no extra confirm | Sonner outcome + queue row |

Bulk actions use current filter snapshot. Copy should include count and branch/date
context so accountant does not run a wider action accidentally.

### 13.3 Hành vi tải file

- Nút PDF/XML gọi server action để tạo signed URL từ private bucket.
- TTL copy: "Link tải hết hạn sau khoảng 5 phút."
- XML button label: `Tải XML (bản gốc pháp lý)`.
- PDF button label: `Tải PDF`.
- Nếu URL thiếu hoặc hết hạn: hiển thị toast an toàn và giữ detail Sheet đang mở.
- Không hiển thị raw storage path trên UI.
- Nếu thiếu `archived_at`: disable button kèm tooltip "Chưa lưu trữ PDF/XML".

### 13.4 Realtime và refresh

- `use-finance-realtime-refresh` refresh dashboard band, hub counters và danh
  sách hóa đơn hiện tại khi `tax_invoices`, `summary_run_queue`, reconcile hoặc
  archive outcomes đổi.
- Realtime subscription phải dùng status callback pattern để resync sau reconnect.
- `MvStalenessBanner` vẫn dùng cho độ mới dữ liệu finance materialized.
- "Làm mới" thủ công refresh route hiện tại, không refresh global app state.
- Không lưu scope hoặc filter trong localStorage/React Context. Chỉ dùng URL params.

### 13.5 Ma trận loading, error, permission, partial

| Surface | Loading | Rỗng | Lỗi | Quyền | Partial |
| --- | --- | --- | --- | --- | --- |
| Dashboard band | tile skeleton | chưa có HĐĐT trong kỳ | AppEmptyState error | ẩn nếu thiếu finance:view | CQT pending, archive pending |
| Hub | queue skeleton | không có attention | AppEmptyState error | ẩn action read-only | cron health unknown |
| List | table skeleton | DataTable empty | AppEmptyState error | route denied by ACL | cqt_code thiếu, delivery unknown |
| Detail | Sheet skeleton | not-found message | error block + retry | action footer trimmed | thiếu lookup/email/archive block |
| Kê khai | KPI skeleton | chưa có dữ liệu kỳ | AppEmptyState error | route hidden/no-access | doanh thu năm chưa đủ dữ liệu |
| Ops | table skeleton | chưa có lần chạy | AppEmptyState error | ẩn trigger | log row đã redacted error |

## 14. Câu hỏi mở và fallback

| Câu hỏi | Fallback design |
| --- | --- |
| MTT template có trả Mã CQT không? | `cqt_code` optional. Hiển thị "Đang chờ" khi đang xử lý, "Không khả dụng" chỉ sau live probe xác nhận. XML archive vẫn là bản ghi pháp lý. |
| Viettel lookup URL exact format? | `LookupQr` hiển thị panel disabled: "Chưa xác nhận link tra cứu Viettel." Khi xác nhận format `reservationCode` + seller MST, bật link + QR. |
| Email auto-delivery có do Viettel xử lý không? | Delivery panel có state "Chưa xác nhận kênh giao". Nếu app gửi email sau này, taxonomy trạng thái vẫn giữ nguyên. |
| CQT rejection reason schema mới đã applied chưa? | Nếu field thiếu ở môi trường hiện tại, queue tile có thể đếm từ provider/log error fallback và detail banner ghi "Chưa có mô tả từ CQT." |
| Kê khai deadline config lấy từ đâu? | Chỉ hiển thị reminder khi đã cấu hình. Nếu chưa có config, hiển thị "Kế toán xác nhận hạn nộp kỳ này." |

## 15. Checklist nghiệm thu

- `/finance` vẫn giữ 5 KPI tiền và `CashPanel` trước HĐĐT band.
- Chủ trên mobile thấy "Cần xử lý" và retention trong một viewport sau KPI/cash.
- Kế toán trên desktop có hub attention, list enriched, detail Sheet đầy đủ,
  kê khai export và ops logs.
- Mã CQT và mã tra cứu Viettel không bị nhầm.
- XML luôn được gọi là bản gốc pháp lý.
- Mẫu MTT `2/...` ghi chú giá đã gồm thuế, không hiển thị VAT generic.
- Action thiếu quyền không error-on-click.
- Status badges đi qua registry, không có page-local color map.
- List dùng `DataTable` + `mobileCardRender`, giữ keyset "Tải thêm".
- Mọi surface có empty, loading, error, no-access và partial states.

# HĐĐT & Thuế GTGT — Hóa Đơn Điện Tử & Giá Trị Gia Tăng

> Áp dụng: Hộ kinh doanh Cơm Tấm Má Tư — mô hình F&B multi-branch.
> Khung pháp lý tham chiếu đến 07/2026: Luật Quản lý thuế
> 108/2025/QH15; NĐ 252/2026/NĐ-CP; NĐ 254/2026/NĐ-CP;
> TT 32/2025/TT-BTC; NĐ 68/2026/NĐ-CP; NĐ 141/2026/NĐ-CP;
> TT 152/2025/TT-BTC.
> Last updated: 2026-07-19.

## 1. Ranh Giới Nghiệp Vụ

Finance có hai loại chứng từ khác nhau:

| Bề mặt | Ý nghĩa | Nguồn sự thật |
| --- | --- | --- |
| `/finance/invoices` | HĐĐT đầu ra của đơn bán hàng | `tax_invoices` + Viettel S-invoice |
| `/finance/supplier-invoices` | Hóa đơn/chứng từ đầu vào và công nợ nhà cung cấp | `supplier_invoices` liên kết GRN |

`supplier-invoices` không phải doanh thu, không phải HĐĐT bán cho khách và
không tự động trở thành chi vận hành. Nó là hồ sơ phải trả/đối chiếu đầu vào;
chi phí chỉ được ghi nhận theo contract Finance và kế toán hiện hành.

Ứng dụng sở hữu phát hành HĐĐT theo từng đơn, phát hành lại bản nháp, hủy và
thay thế. Viettel S-invoice sở hữu việc tra cứu pháp lý và cung cấp bản thể hiện
PDF/XML theo tài khoản đã đăng ký.

## 2. Khung Thuế HKD

Cơm Tấm Má Tư vận hành theo mô hình Hộ kinh doanh. Không mặc định áp dụng mô
hình doanh nghiệp nộp GTGT theo phương pháp khấu trừ.

- Từ 01/01/2026, HKD không còn áp dụng thuế khoán; dữ liệu POS, HĐĐT, sổ doanh
  thu và chứng từ phải đủ để kê khai.
- HKD bán trực tiếp cho người tiêu dùng, gồm dịch vụ ăn uống, thuộc diện dùng
  HĐĐT khởi tạo từ máy tính tiền khi đạt ngưỡng pháp luật hiện hành.
- TT 152/2025/TT-BTC điều chỉnh chế độ kế toán HKD từ 01/01/2026.
- Nhóm doanh thu, phương pháp TNCN, kỳ khai và hồ sơ kê khai phải được kế toán
  xác nhận theo doanh thu thực tế từng năm.

### 2.1 Phương Pháp Tỷ Lệ Trên Doanh Thu

Với HKD kê khai theo tỷ lệ trên doanh thu:

| Ngành | GTGT | TNCN | Ghi chú |
| --- | ---: | ---: | --- |
| Dịch vụ ăn uống | 3% | 1,5% | Mức GTGT hiệu dụng 2,4% chỉ áp dụng trong thời gian chính sách giảm 20% của tỷ lệ 3% còn hiệu lực |

Mẫu hóa đơn bán hàng từ máy tính tiền `2/...` dùng giá bán đã gồm thuế và
không hiển thị một dòng VAT riêng như hóa đơn GTGT mẫu `1/...`.

Trường `vat_rate` trong dữ liệu lưu phần trăm, ví dụ `8.00`, không lưu
`0.08`.

### 2.2 Phương Pháp Khấu Trừ

Chỉ dùng contract hóa đơn GTGT mẫu `1/...` sau khi HKD đã đăng ký phương pháp
khấu trừ với CQT. Không suy diễn cấu hình này từ việc schema có
`is_vat_deductible` hoặc `vat_rate`.

## 3. HĐĐT Đầu Ra Theo Đơn

### 3.1 Luồng Phát Hành

```text
Payment thành công
  → chụp dữ liệu order, người mua và các dòng hàng
  → issueTaxInvoiceForPaidOrder
  → ViettelSinvoiceProvider.createInvoice
  → ghi tax_invoices với provider_ref và trạng thái provider trả về
  → nếu provider lỗi: giữ payment, lưu draft + last_error để Finance xử lý
```

HĐĐT là side effect bắt buộc sau thanh toán nhưng lỗi HĐĐT không được rollback
payment. Mọi lần thử lại phải dùng cùng định danh giao dịch của bản ghi để tránh
phát hành trùng.

Khách không cung cấp tên/MST vẫn đi qua luồng phát hành với:

```text
buyerName = "Bán cho người tiêu dùng"
buyerTaxCode = ""
buyerNotGetInvoice = true
```

Nếu trạng thái `signing` hoặc `submitted` kéo dài, nhân sự Finance tra
`provider_ref` trực tiếp trên Viettel S-invoice trước khi thử lại. Không tạo
một hóa đơn mới chỉ vì ứng dụng chưa nhận số hóa đơn.

### 3.2 Dòng Hàng Và Tổng Tiền

- Dữ liệu provider phải dùng
  `buildInvoiceLineItemsFromOrderItems` từ `@comtammatu/shared/hddt`.
- Topping và món kèm tính tiền là các dòng pháp lý riêng; không gộp toàn bộ vào
  đơn giá món chính.
- Chiết khấu cấp đơn phải được phân bổ xuống từng dòng, không vượt thành tiền
  dòng.
- Tổng HĐĐT phải bằng số tiền khách thực trả sau chiết khấu.
- Mẫu `2/...` gửi giá gross và không gửi `taxPercentage`/`taxAmount` cho
  từng dòng.

### 3.3 Trạng Thái

```text
draft → signing → submitted → issued
draft/signing → draft khi provider lỗi và cho phép thử lại
issued → cancelled
issued → replaced
```

| Trạng thái | Ý nghĩa |
| --- | --- |
| `draft` | Chưa phát hành thành công; có thể sửa và thử lại |
| `signing` | Đang gửi/ký tại provider |
| `submitted` | Provider đã nhận nhưng chưa trả đủ số/mã |
| `issued` | Đã phát hành thành công |
| `cancelled` | Đã hủy |
| `replaced` | Đã được thay thế |
| `not_required` | Giá trị tương thích dữ liệu cũ; không tạo mới |

Các chuyển trạng thái nghiệp vụ phải đi qua RPC
`transition_tax_invoice_state`; không UPDATE trực tiếp từ client.

### 3.4 Idempotency Và Audit

`uq_tax_invoices_active_per_order` bảo đảm mỗi order chỉ có một HĐĐT
`per_order` đang hoạt động. Double-click phải trả lỗi nghiệp vụ rõ ràng thay
vì lộ raw constraint error.

`tax_invoice_events` lưu các chuyển trạng thái qua RPC. `provider_data`,
`provider_ref`, `invoice_number`, `cqt_code` và `audit_logs` bổ sung bằng
chứng cho lần phát hành trực tiếp.

### 3.5 Hủy Và Thay Thế

- Hủy/thay thế cần `settings:tenant`.
- Lý do hủy phải đáp ứng validation hiện hành.
- Thay thế phải tham chiếu hóa đơn gốc và dùng transaction UUID mới.
- Không sửa tay `status`, `invoice_number` hoặc `provider_ref` trong DB để
  “khớp” với provider.

## 4. Hóa Đơn Nhà Cung Cấp

### 4.1 Mục Đích

`supplier_invoices` lưu hóa đơn/chứng từ đầu vào để:

- đối chiếu hàng đã nhận;
- theo dõi số tiền phải trả và đã trả;
- cung cấp hồ sơ kế toán/thuế;
- phát hiện lệch số lượng hoặc giá giữa chứng từ và thực nhận.

Một hóa đơn nhà cung cấp không được tính thành chi vận hành chỉ vì đã nhập vào
hệ thống. Nó phải đi qua contract ghi nhận chi phí để tránh đếm trùng với GRN,
payment hoặc sổ chi.

### 4.2 Đối Chiếu

Contract chuẩn là supplier → GRN → supplier invoice. Purchase order chỉ tham
gia khi quy trình mua hàng thực tế có dùng PO.

Trước khi đưa vào export kế toán, cần xác nhận:

1. Nhà cung cấp và số hóa đơn hợp lệ.
2. Thông tin người mua khớp hồ sơ HKD.
3. Hàng đã nhận qua GRN.
4. Số lượng, đơn giá và tổng tiền đã đối chiếu.
5. Trạng thái thanh toán và kỳ ghi nhận được xác định.

`is_vat_deductible` là field kỹ thuật cho cấu hình kế toán nâng cao. Không
hiển thị nó như mặc định của HKD nếu chưa có quyết định kế toán riêng.

### 4.3 Contract Dữ Liệu Chính

| Nhóm field | Ý nghĩa |
| --- | --- |
| `supplier_id`, `grn_id`, `po_id` | Liên kết nghiệp vụ mua/nhận hàng |
| `invoice_number`, `invoice_date` | Định danh chứng từ |
| `subtotal`, `vat_rate`, `vat_amount`, `total_amount` | Số tiền trên chứng từ |
| `matching_status`, `matching_notes` | Kết quả đối chiếu |
| `payment_status`, `payment_method`, `paid_at` | Tình trạng phải trả |
| `declared_period`, `is_vat_deductible` | Phân loại cho kế toán |

Unique key `(invoice_number, supplier_id, tenant_id)` chặn nhập trùng theo nhà
cung cấp.

## 5. Viettel S-invoice

Runtime chỉ đăng ký `ViettelSinvoiceProvider`.

### 5.1 Interface

```typescript
interface InvoiceProvider {
  readonly name: string;
  createInvoice(request: InvoiceRequest): Promise<InvoiceResult>;
  cancelInvoice(providerRef: string, reason: string): Promise<void>;
}
```

Provider interface chỉ chứa capability ứng dụng đang sở hữu. Việc tra cứu và
tải bản thể hiện được vận hành trên Viettel S-invoice.

### 5.2 Cấu Hình

```env
COMPANY_TAX_CODE=<supplierTaxCode đã đăng ký>
SINVOICE_USERNAME=<api username>
SINVOICE_PASSWORD=<api password>
SINVOICE_TEMPLATE_CODE=<mẫu 2/... đã đăng ký>
SINVOICE_INVOICE_SERIES=<ký hiệu đã đăng ký>
SINVOICE_BASE_URL=https://api-vinvoice.viettel.vn
```

`SINVOICE_SANDBOX=true` chỉ là metadata môi trường; credential Viettel quyết
định tài khoản thực tế.

`ensureInvoiceProviderRegistered` fail closed khi thiếu cấu hình hoặc khi
`SINVOICE_TEMPLATE_CODE` không bắt đầu bằng `2/`.

### 5.3 Định Danh Provider

`buildSinvoiceTransactionUuid` tạo transaction UUID xác định từ bản ghi cần
phát hành. `provider_ref` phải được giữ ổn định qua các lần thử lại.

Các lỗi cấu hình phổ biến:

| Tình huống | Kiểm tra |
| --- | --- |
| Sai MST người bán | `COMPANY_TAX_CODE` và tài khoản Viettel |
| Mẫu/ký hiệu chưa hoạt động | `SINVOICE_TEMPLATE_CODE`, `SINVOICE_INVOICE_SERIES` |
| Duplicate transaction | Tra `provider_ref` trước khi thử lại |
| Rate limit/maintenance | Chờ provider ổn định, không tạo định danh mới |

## 6. Báo Cáo Và Quyền

### 6.1 Dữ Liệu Kế Toán

- HĐĐT đầu ra: `tax_invoices WHERE status = 'issued'`.
- Chứng từ đầu vào: `supplier_invoices`.
- Doanh thu vận hành vẫn theo contract payment tại
  `docs/ref/operational-data-contract.md`; không thay bằng tổng HĐĐT.
- Hệ thống xuất dữ liệu cho kế toán nhưng không tự nộp tờ khai.

### 6.2 Quyền

| Hành động | Permission |
| --- | --- |
| Xem HĐĐT và dữ liệu Finance | `finance:view` |
| Phát hành theo đơn | `orders:write` và authority của payment/order |
| Hủy hoặc thay thế | `settings:tenant` |

Route admission không thay thế permission, branch scope, PBAC hoặc RLS.

### 6.3 Lưu Giữ Chứng Từ

Nghĩa vụ lưu giữ hóa đơn/chứng từ vẫn áp dụng dù ứng dụng không giữ một kho
PDF/XML riêng. Owner/kế toán phải xác định nơi lưu chính thức và kiểm tra khả
năng tải lại từ Viettel S-invoice theo thời hạn pháp luật hiện hành.

## 7. Source Of Truth

- `apps/web/lib/hddt-per-order.ts` — phát hành theo đơn.
- `apps/web/app/(protected)/finance/actions.ts` — phát hành lại, hủy và danh
  sách HĐĐT.
- `apps/web/app/(protected)/finance/replace-invoice-actions.ts` — thay thế.
- `apps/web/lib/invoice-provider-init.ts` — cấu hình provider.
- `packages/shared/src/hddt/invoice-line-items.ts` — dựng dòng HĐĐT.
- `packages/shared/src/providers/invoice.ts` — provider interface.
- `packages/shared/src/providers/impl/viettel-sinvoice.ts` — Viettel
  S-invoice implementation.
- `docs/runbooks/hddt-viettel-operations.md` — vận hành và smoke.
- `docs/ref/inventory.md` — GRN và hóa đơn nhà cung cấp.
- `tasks/regressions.md` — regression rules HĐĐT còn hiệu lực.

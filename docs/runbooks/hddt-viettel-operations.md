# HĐĐT Viettel S-invoice Operations

Runbook vận hành HĐĐT theo từng đơn qua Viettel S-invoice. Hợp đồng nghiệp vụ
và pháp lý nằm tại `docs/ref/einvoice-tax.md`.

## Phạm Vi

Ứng dụng hiện chỉ sở hữu các thao tác theo từng đơn:

- Phát hành HĐĐT khi thanh toán.
- Phát hành lại bản nháp bị lỗi sau khi đã sửa dữ liệu.
- Hủy hoặc thay thế hóa đơn theo quyền Finance.

Ứng dụng không chạy hóa đơn tổng hợp ngày, không tự đối soát trạng thái định kỳ
và không lưu bản PDF/XML vào kho nội bộ. Tra cứu trạng thái và chứng từ điện tử
được thực hiện trên Viettel S-invoice theo `provider_ref` hoặc số hóa đơn.

## Env Bắt Buộc

```env
SINVOICE_USERNAME=<viettel api username>
SINVOICE_PASSWORD=<viettel api password>
SINVOICE_BASE_URL=https://api-vinvoice.viettel.vn
```

`SINVOICE_SANDBOX=true` chỉ dùng để ghi nhận môi trường thử; tài khoản Viettel
quyết định môi trường thực tế. Không commit secret.

MST người bán, mẫu số và ký hiệu nằm trong `invoice_profiles`, được snapshot
vào hóa đơn trước khi gọi Viettel. Profile đăng ký hiện tại là `1/002`
(Hóa đơn GTGT từ MTT) / `C26MCS`; chỉ kích hoạt sau khi hồ sơ pháp nhân
Tenant đầy đủ và MST khớp.

## Smoke Hóa Đơn Theo Đơn

1. Xác nhận đúng target host, Supabase ref và tài khoản Viettel.
2. Tạo đơn POS test, thanh toán bằng phương thức được duyệt và yêu cầu HĐĐT.
3. Kiểm bản ghi gần nhất:

```sql
SELECT id, branch_id, order_id, status, provider, provider_ref,
       invoice_number, signing_started_at, issued_at, last_error
FROM tax_invoices
ORDER BY created_at DESC
LIMIT 10;
```

Kỳ vọng:

- `provider = 'viettel'`;
- `provider_ref` có transaction UUID;
- hóa đơn có mã đi tới `issued`;
- hóa đơn không mã có thể ở `submitted` khi Viettel đã nhận nhưng chưa trả số;
- tổng tiền sau chiết khấu khớp đơn đã thanh toán.

Nếu kết quả không rõ, tra trực tiếp trên Viettel S-invoice trước khi thử lại.
Không tạo hóa đơn mới chỉ vì ứng dụng chưa có số hóa đơn.

## Xử Lý Lỗi

| Tình huống                                            | Xử lý                                                                         |
| ----------------------------------------------------- | ----------------------------------------------------------------------------- |
| Bản nháp có `last_error`                              | Sửa dữ liệu/cấu hình rồi dùng phát hành lại trên `/finance/invoices`          |
| CQT từ chối cấp mã                                    | Kiểm MST, mẫu số, ký hiệu và dữ liệu người mua                                |
| Timeout hoặc trạng thái `signing`/`submitted` kéo dài | Tra `provider_ref` trên Viettel; không phát hành trùng                        |
| `INVOICE_ISSUE_DATE_INVALID_TT78` / ngày lập không hợp lệ | Đơn đã sang ngày VN mới — đối soát Viettel, không requeue cùng `invoiceIssuedDate` hôm trước |
| Cần PDF/XML                                           | Tải từ Viettel S-invoice và lưu theo quy trình chứng từ của đơn vị            |
| Cần hủy/thay thế                                      | Dùng thao tác trên `/finance/invoices`, sau đó đối chiếu kết quả trên Viettel |

## Verify Gate

Sau thay đổi HĐĐT, payment, discount hoặc receipt, chạy:

```bash
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm build
```

Với thay đổi runtime, smoke ít nhất một đơn paid → HĐĐT qua môi trường đã được
owner cho phép. Production luôn cần ủy quyền rõ trong session hiện tại.

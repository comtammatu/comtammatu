# HĐĐT, thuế GTGT và thuế TNDN — Doanh nghiệp

> Áp dụng cho doanh nghiệp F&B loại hình công ty cổ phần.
> Last verified: 2026-07-27.

## 1. Ranh giới chứng từ

| Bề mặt | Ý nghĩa | Nguồn sự thật |
| --- | --- | --- |
| `/finance/invoices` | HĐĐT bán ra theo đơn | `tax_invoices` + Viettel S-invoice |
| `/finance/supplier-invoices` | Hóa đơn đầu vào, đối chiếu GRN và công nợ NCC | `supplier_invoices` |

Nhập HĐ NCC không tự tạo chi phí; thanh toán NCC không tạo chi phí lần hai.
Hàng còn trong kho = tài sản. Giá vốn/chi phí, GTGT đầu vào được khấu trừ và kỳ
hạch toán theo chính sách kế toán đã chọn.

## 2. Thuế GTGT

- Không `vatRate = 0` mặc định toàn DN.
- Mức luật định 0% / 5% / 10%; đủ điều kiện từ 10% giảm còn 8% đến hết
  31/12/2026 theo NQ 204/2025 và NĐ 174/2025 — theo từng hàng hóa/dịch vụ,
  ngày giao dịch, hồ sơ; không mặc định chung cho đồ ăn/uống/bia rượu/phí/voucher/GH/KM.
- `menu_items.vat_rate` = cấu hình đã kế toán duyệt; `order_items.vat_rate` =
  snapshot bất biến lúc bán.
- Phương pháp khấu trừ / trực tiếp = cấu hình pháp lý cấp DN, không suy từ
  doanh thu/schema/template.
- Khấu trừ: VAT đầu ra = phải nộp; VAT đầu vào chỉ khấu trừ khi đủ HĐ/chứng
  từ/thanh toán. VAT ≠ doanh thu/lãi.

Công thức (chỉ phương pháp khấu trừ, sau khóa kỳ + điều chỉnh):

```text
GTGT phải nộp = GTGT đầu ra − GTGT đầu vào được khấu trừ +/- điều chỉnh kỳ
```

`GTGT đầu ra` = tổng VAT chứng từ bán hiệu lực kỳ — không phải toàn bộ tiền
khách trả. Hủy/điều chỉnh/thay thế theo quan hệ chứng từ; không cộng cả bản cũ + mới.

## 3. HĐĐT từ máy tính tiền

Khung từ 01/07/2026: Luật 108/2025, NĐ 252/2026, NĐ 254/2026, TT 90/2026,
TT 91/2026. Ăn uống/nhà hàng thuộc bán trực tiếp NTD → HĐĐT từ máy tính tiền
kết nối CQT.

```text
Payment hoàn tất
→ snapshot bất biến seller, branch, buyer, dòng món, thuế, tổng, paid_at
→ phát hành/đối soát qua provider
→ hủy / điều chỉnh / thay thế bằng workflow riêng
```

HĐ đã phát hành không dựng lại từ menu/config hiện tại. Đổi thuế/template/series
chỉ giao dịch mới. Provider response chưa rõ → đối soát cùng idempotency
identity; không tự phát hành HĐ mới.

**Dòng bắt buộc:** tên HH/DV thực; ĐVT, SL, đơn giá, CK; thuế suất/căn cứ theo
dòng khi template yêu cầu; tổng trước thuế / VAT / thanh toán theo rounding đã
duyệt; source order/payment; seller/buyer snapshot; thời điểm; template, series,
provider ref, số HĐ, mã CQT/retrieval. Nhiều mức thuế/đơn — không reverse-split
bằng một `invoice_vat_rate`; tổng VAT = tổng đã làm tròn theo dòng/nhóm.

## 4. Hóa đơn đầu vào

Trước export/khấu trừ: (1) NCC + số HĐ + người mua khớp hồ sơ; (2) đối chiếu
GRN/PO nếu có; (3) SL/đơn giá/tổng/thuế/VAT khớp; (4) điều kiện thanh toán
không tiền mặt + khấu trừ khác; (5) kỳ ghi nhận + phân bổ tồn/TSCĐ/chi phí + công nợ.

Từ 01/07/2025: mua ≥ 5 triệu (đã gồm VAT) cần chứng từ không tiền mặt. Cùng
người bán trong ngày / trả chậm-góp: kiểm tra quy định chi tiết — không tách HĐ
hoặc suy `đã nhập` = đủ điều kiện.

Nhiều mức thuế → breakdown bất biến theo mức; `subtotal` / `vat_amount` /
`total_amount` suy từ breakdown.

| Trạng thái | Ý nghĩa |
| --- | --- |
| `input_vat_recorded` | VAT đúng như HĐ đầu vào đã nhập |
| `input_vat_pending_review` | Chưa đủ hồ sơ / mục đích / thanh toán / phân bổ |
| `input_vat_deductible` | Đã có bằng chứng đủ điều kiện khấu trừ |
| `input_vat_non_deductible` | Không được khấu trừ theo kết luận có căn cứ |

Schema hiện: `supplier_invoices` + `expenses.vat_breakdown` = chỉ
`input_vat_recorded`. Chưa đủ trạng thái/bằng chứng/phân bổ/kỳ/điều chỉnh → UI
**không** gọi **GTGT được khấu trừ** hay tính **GTGT phải nộp**.

## 5. Thiết bị, công cụ và VAT đầu vào

Mua thiết bị ≠ tự động chi VH kỳ:

- Đủ ba tiêu chí (lợi ích tương lai, >1 năm, nguyên giá ≥ 30tr tin cậy) → TSCĐ;
  chỉ khấu hao kỳ vào chi phí theo nơi dùng.
- Không đủ → công cụ/vật dụng (ghi trực tiếp hoặc phân bổ theo chính sách).
- Vật tư tiêu hao kỳ = chi VH trực tiếp.
- VAT đầu vào đủ khấu trừ theo dõi riêng, không cộng nguyên giá; VAT không khấu
  trừ chỉ vào nguyên giá/chi phí khi pháp luật + chính sách cho phép.

Finance chưa có sổ TSCĐ/công cụ → chưa hiển thị **Giá trị thiết bị** tin cậy.

## 6. Thuế TNDN

Dựa trên thu nhập tính thuế — không phải doanh thu POS hay số dư tiền. Tại mốc
kiểm tra có thể miễn hoặc 15% / 17% / 20% tùy doanh thu, liên kết, ưu đãi;
DN nhỏ và vừa đăng ký lần đầu có thể miễn ba năm. Không hardcode ưu đãi.
Chỉ hiện `thuế TNDN ước tính` khi có version quy tắc + nguồn + `estimated`.
**Lợi nhuận sau thuế TNDN** chỉ sau kỳ kế toán đầy đủ và khóa sổ.

## 7. Nguồn pháp lý

Danh mục văn bản và ngày hiệu lực:
[legal-framework-2026.md](legal-framework-2026.md).

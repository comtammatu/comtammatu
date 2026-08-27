# HĐĐT, thuế GTGT và thuế TNDN — Doanh nghiệp

> Áp dụng cho doanh nghiệp F&B loại hình công ty cổ phần.
> Last verified: 2026-08-19.

## 1. Ranh giới chứng từ

| Bề mặt | Ý nghĩa | Nguồn sự thật |
| --- | --- | --- |
| `/finance/invoices` | HĐĐT bán ra theo đơn | `tax_invoices` + Viettel S-invoice |
| `/finance/supplier-invoices` | Hóa đơn đầu vào, đối chiếu GRN và công nợ NCC | `supplier_invoices` |

Nhập HĐ NCC không tự tạo chi phí; thanh toán NCC không tạo chi phí lần hai.
Hàng còn trong kho = tài sản. Giá vốn/chi phí, GTGT đầu vào được khấu trừ và kỳ
hạch toán theo chính sách kế toán đã chọn.

## 2. Thuế GTGT

- Không `vatRate = 0` mặc định toàn DN. Mức 0% / 5% / 10% (8% giảm theo NQ 204/2025, NĐ 174/2025 đến 31/12/2026) theo từng HH/DV, ngày, hồ sơ.
- `menu_items.vat_rate` = cấu hình đã duyệt; `order_items.vat_rate` = snapshot lúc bán. Phương pháp khấu trừ / trực tiếp = cấu hình pháp lý DN.
- Khấu trừ: `GTGT phải nộp = GTGT đầu ra − GTGT đầu vào được khấu trừ +/- điều chỉnh kỳ`. GTGT đầu ra = tổng VAT chứng từ bán hiệu lực kỳ.

## 3. HĐĐT từ máy tính tiền

Khung từ 01/07/2026: Luật 108/2025, NĐ 252/2026, NĐ 254/2026, TT 90/2026, TT 91/2026 (bán trực tiếp NTD kết nối CQT).
Flow: Payment hoàn tất → snapshot bất biến (seller, branch, buyer, dòng món, thuế, tổng, paid_at) → phát hành/đối soát qua provider → hủy/điều chỉnh/thay thế bằng workflow riêng.

HĐ đã phát hành không dựng lại từ menu hiện tại. Cửa sổ QR: trước 22:00 `min(paid_at + 2 giờ, 23:55)`; từ 22:00 phát hành ngay. `transactionUuid` = `tax_invoices.id`.
**Dòng bắt buộc:** tên HH/DV thực, ĐVT, SL, đơn giá, thuế suất, tổng trước thuế/VAT/thanh toán, snapshot seller/buyer, thời điểm, provider ref, số HĐ, mã CQT. VND không thập phân: bóc NET nguyên đồng, VAT = GROSS − NET, lệch ±1₫ hấp thụ vào dòng khác; tổng HĐ = `orders.total_amount`.
**Chiết khấu (ADR 0013):** giá POS gồm VAT; CK trừ trên GROSS rồi bóc NET, nhúng vào đơn giá/thành tiền sau giảm (không dòng CK riêng). CK món chỉ VND; CK đơn `%` materialize VND rồi trừ rẻ→đắt; dòng 0đ omit. `total_amount = 0` → `not_required`. Phụ phí > 0 cộng vào dòng món. ĐVT: `Phần`/`Ly`/`Lon`/`Chai`/`Tô`/`Cái`/`Bộ`.

## 4. Hóa đơn đầu vào

Trước export/khấu trừ: (1) NCC + số HĐ + người mua khớp; (2) đối chiếu GRN/PO; (3) SL/đơn giá/tổng/thuế/VAT khớp; (4) chứng từ không tiền mặt (≥5tr từ 01/07/2025); (5) kỳ ghi nhận + phân bổ + công nợ. Nhiều mức thuế → breakdown bất biến; `subtotal`/`vat_amount`/`total_amount` suy từ breakdown.

| Trạng thái | Ý nghĩa |
| --- | --- |
| `input_vat_recorded` | VAT đúng như HĐ đầu vào đã nhập |
| `input_vat_pending_review` | Chưa đủ hồ sơ / mục đích / thanh toán / phân bổ |
| `input_vat_deductible` | Đã có bằng chứng đủ điều kiện khấu trừ |
| `input_vat_non_deductible` | Không được khấu trừ theo kết luận có căn cứ |

Schema hiện: `supplier_invoices` + `expenses.vat_breakdown` = chỉ `input_vat_recorded`. Chưa đủ bằng chứng/phân bổ/kỳ → UI **không** gọi **GTGT được khấu trừ** hay tính **GTGT phải nộp**.

## 5. Thiết bị, công cụ và VAT đầu vào

Mua thiết bị ≠ tự động chi VH kỳ: Đủ 3 tiêu chí (>1 năm, lợi ích tương lai, nguyên giá ≥30tr) → TSCĐ, khấu hao kỳ theo nơi dùng; không đủ → công cụ/vật dụng phân bổ; vật tư tiêu hao kỳ = chi VH trực tiếp. VAT đầu vào đủ khấu trừ theo dõi riêng. Finance chưa có sổ TSCĐ → chưa hiển thị **Giá trị thiết bị** tin cậy.

## 6. Thuế TNDN

Dựa trên thu nhập tính thuế (không phải doanh thu POS/số dư tiền). Thuế suất 15%/17%/20% tùy quy mô/ưu đãi. Không hardcode ưu đãi. Chỉ hiện `thuế TNDN ước tính` khi có version quy tắc + nguồn + `estimated`. **Lợi nhuận sau thuế TNDN** chỉ sau kỳ kế toán đầy đủ và khóa sổ.

## 7. Đơn giao hàng (POS thủ công) và HĐĐT

Căn cứ hợp đồng ShopeeFood số `SHOPEEFOOD_VN_0392303` (20/08/2026, CTCP Chén Sứ
↔ CTCP Foody). Grab / beFood / Green SM: cùng mô hình POS cho đến khi có HĐ riêng.

| Quy tắc | Hệ quả sản phẩm |
| --- | --- |
| NBH bán trực tiếp cho Người Mua (Điều 4.1–4.2) | Đơn Má Tư = bán hàng Chén Sứ; không phải Foody bán lại |
| Phí Hoa Hồng 25% trên Giá Trị Thực Nhận (Điều 3.1) | Seed giá kênh Shopee ≈ +25%; **không** trừ hoa hồng trên `orders.total_amount` |
| Công Cụ Quản Lý vs Cash Merchant (Điều 3.1(b)) | Tender `platform` vs tiền mặt/VietQR tại quán |
| Foody xuất HĐ phí hoa hồng (Điều 3.2) | AP/input Phase 2+ — không phải HĐĐT bán hàng MTT |
| NBH cung cấp hóa đơn/chứng từ cho Người Mua (Điều 4.6) | HĐĐT bán hàng MTT **tự xếp hàng** khi thanh toán xong (cả `platform` và COD), GROSS giá kênh, khách lẻ + QR `/q/invoice/[token]` |
| Giá Trị Thực Nhận không gồm phí giao (Điều 1.7) | Không ghi phí shipper vào doanh thu món Má Tư |

**S-Invoice Phase 1:** payload Viettel vẫn buyer + dòng hàng + tiền +
`transactionUuid` nội bộ. **Không** truyền mã đơn sàn (`external_order_ref`)
hay `GH-…` lên mặt HĐ qua S-Invoice. Mã sàn và `GH-…` dùng trên POS/KDS/Pickup.

Kênh nội bộ này **không** mở cổng adapter HTTP (D103 / D104).

## 8. Nguồn pháp lý

Danh mục văn bản và ngày hiệu lực: [legal-framework-2026.md](legal-framework-2026.md).

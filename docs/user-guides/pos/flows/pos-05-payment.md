# POS-05 — Thanh toán đơn

> Hướng dẫn thu tiền: tiền mặt hoặc chuyển khoản, có thể xuất HĐĐT.
> Dành cho **thu ngân (cashier)** — phục vụ KHÔNG có quyền confirm tiền mặt.

## Tóm tắt

| Trường | Giá trị |
| --- | --- |
| **Vai trò** | Thu ngân, Quản lý chi nhánh |
| **Quyền cần có** | `pos:confirm_payment` (xác nhận tiền mặt). Phục vụ vẫn thấy bill nhưng KHÔNG xác nhận được tiền mặt — chỉ chuyển khoản |
| **Điều kiện trước** | Đơn ở `confirmed` (chưa thanh toán) |
| **Kết quả đúng** | `orders.payment_status` = `paid`; bàn chuyển sang `available`; HĐĐT gửi (nếu tick); toast "Đã thanh toán" (kèm trạng thái HĐĐT) |
| **Thời gian** | ~30 giây |

## Đường dẫn

URL: `/br/{branchId}/pos` (qua bàn occupied → đơn → "Thanh toán")

## Các bước

### Bước 1 — Mở hóa đơn

![Bước 1 - Bill sheet mở](../mockups/pos-05/pos-05-step-01-open-bill.png)

**Bạn làm:**

1. Vào chi tiết đơn (qua bàn occupied → multi-order picker → đơn).
2. Chạm nút lớn **Thanh toán - {tổng tiền}đ** (đỏ ở dưới).

**Bạn thấy:** Sheet "Phương thức thanh toán" mở từ phải:

- 2 phương thức: **Tiền mặt** (mặc định chọn) + **Chuyển khoản**.
- "Tổng tạm tính: {tổng}đ".
- Ô "Tổng nhận" (mặc định = tổng tiền — tức khách trả đúng).
- 5 chip mệnh giá nhanh: 15k / 16k / 20k / 30k / 100k (auto-fit theo tổng).
- "Tiền trả khách": 0đ (tự cộng nếu khách đưa thừa).
- Checkbox "Xuất hóa đơn điện tử" (mặc định KHÔNG tick).
- 3 nút bottom: **Hủy**, **Đã thanh toán** (đỏ, lớn), **In tạm tính**.

> ⚠️ Nếu thấy alert vàng "Đơn chưa đánh dấu đã phục vụ" — vẫn thanh toán được. Alert chỉ nhắc nhở: nếu đã bấm "Đã phục vụ" trước đó, alert biến mất.

### Bước 2 — Nhập tiền khách đưa (cho tiền mặt)

![Bước 2 - Cash amount](../mockups/pos-05/pos-05-step-02-cash-amount.png)

**Bạn làm:** 1 trong 2:

1. **Nhanh nhất**: Chạm chip mệnh giá khách đưa (ví dụ khách đưa tờ 20.000đ → chạm chip "20.000đ").
2. **Tự gõ**: Chạm ô "Tổng nhận", gõ số tiền cụ thể.

**Bạn thấy:** Ô "Tiền trả khách" cập nhật ngay (= Tổng nhận - Tổng tạm tính).

**Ví dụ:**
- Tổng tạm tính 15.000đ, khách đưa tờ 20.000đ → chạm chip 20.000đ → "Tiền trả khách: 5.000đ" → trả khách 5.000đ.
- Khách đưa đúng 15.000đ → giữ "Tổng nhận" mặc định → "Tiền trả khách: 0đ".

> 💡 Khách đưa nhỏ hơn tổng (ví dụ thiếu 1.000đ) — vẫn xác nhận được, "Tiền trả khách" sẽ là số âm. Hệ thống cảnh báo nhưng không khóa — manager xử lý sau.

### Bước 3 — HĐĐT (tùy chọn)

![Bước 3 - Invoice toggle](../mockups/pos-05/pos-05-step-03-invoice-toggle.png)

**Bạn làm:** Hỏi khách "Có cần xuất hóa đơn không ạ?". Nếu cần → chạm checkbox **Xuất hóa đơn điện tử**.

**Bạn thấy (sau khi tick):** Form HĐĐT mở rộng — nhập tên khách / công ty / mã số thuế / email.

> 💡 Khách lẻ không lấy HĐĐT → để mặc định (không tick). Bỏ qua bước này. Vẫn lưu được giao dịch trong báo cáo doanh số.

### Bước 4 — Xác nhận thanh toán

![Bước 4 - Confirm](../mockups/pos-05/pos-05-step-04-confirm.png)

**Bạn làm:** Chạm nút **Đã thanh toán** (đỏ, lớn).

**Bạn thấy ngay sau:**

- Toast hiện trong 1 trong 3 trạng thái:
  - **"Đã thanh toán & xuất HĐĐT"** ✅ — happy path khi tick HĐĐT.
  - **"Đã thanh toán — không xuất HĐĐT"** — nếu KHÔNG tick HĐĐT.
  - **"Đã thu tiền — HĐĐT chưa xuất được"** ⚠️ — nếu tick HĐĐT nhưng phía VAT/CMS lỗi. Tiền vẫn vào, HĐĐT sẽ retry sau.
- Sheet đóng.
- Đơn chuyển sang `paid`, bàn về `available` (nếu dine_in).
- Giấy in (nếu có máy in nhiệt được setup).

✅ **Xong!** Khách rời quán. Bàn sẵn sàng cho khách mới.

> ⚠️ Quan trọng: chạm "Đã thanh toán" 1 lần thôi. Đợi toast hiện rồi mới làm tiếp — nhiều lần có thể tạo payment trùng.

---

## Tình huống ngoại lệ

### Khách thanh toán chuyển khoản (VietQR)

![Variant - Transfer](../mockups/pos-05/pos-05-variant-transfer.png)

**Bạn làm:** Chạm phương thức **Chuyển khoản** (icon QR góc phải).

**Bạn thấy:** Mã QR (VietQR) hiện kèm thông tin tài khoản nhận.

**Bạn làm tiếp:**

1. Đưa máy POS hoặc điện thoại có QR cho khách.
2. Khách quét và chuyển khoản.
3. **Đợi xác nhận chuyển khoản** (xem app ngân hàng / SMS).
4. Sau khi xác nhận tiền vào → chạm **Đã thanh toán**.

> 🛡️ KHÔNG bao giờ chạm "Đã thanh toán" trước khi xác nhận tiền vào tài khoản. Nếu khách scam (báo đã chuyển nhưng chưa) → mất tiền không truy được.

### In tạm tính (đưa khách check trước thu)

**Bạn làm:** Trong bill sheet, chạm nút **In tạm tính** (góc dưới cùng).

**Bạn thấy:** Máy in nhiệt in tờ tạm tính (món + giá + tổng) — KHÔNG phải hóa đơn chính thức.

**Khi nào dùng:** Khách yêu cầu xem chi tiết món + tổng trước khi quyết định trả bằng gì. Hoặc check chia tiền với bạn.

> 💡 Tờ tạm tính có ghi "TẠM TÍNH" và KHÔNG hợp lệ làm chứng từ thuế. HĐĐT chỉ xuất sau khi xác nhận thanh toán.

### Phục vụ (waiter) mở bill này

**Bạn thấy:** Sheet vẫn mở, NHƯNG nút "Tiền mặt" bị mờ / không bấm được.

**Lý do:** Waiter không có quyền `pos:confirm_payment` → không cho confirm tiền mặt (cash chạm két vật lý).

**Cách xử lý:** Waiter chỉ có thể chọn "Chuyển khoản" + xác nhận khi khách đã chuyển. Nếu khách trả tiền mặt → gọi thu ngân ra confirm.

### Mất mạng giữa lúc thanh toán

**Bạn thấy:** Spinner "Đang xử lý..." kéo dài >10 giây.

**Cách xử lý:**

1. **Đợi** — hệ thống có cơ chế retry. Đừng chạm lại "Đã thanh toán".
2. Nếu thật sự đứng → đóng và mở lại chi tiết đơn → xem trạng thái:
   - Nếu đơn đã `paid` → **xong**, không cần làm lại.
   - Nếu đơn vẫn `confirmed` → mở bill và thử lại.
3. Vẫn lỗi → báo kỹ thuật. Ghi mã đơn + số tiền vào sổ tay tạm thời để đối soát sau.

### Lỗi máy in

**Bạn thấy:** Đã thanh toán xong nhưng tờ giấy không in ra.

**Cách xử lý:**

1. Kiểm tra giấy / kẹt giấy.
2. Mở chi tiết đơn → "Khác..." → "In lại".
3. Vẫn không in được → ghi lại mã đơn, in tay sau khi sửa máy.

> 💡 Đã thanh toán = xong giao dịch. Không in được giấy không ảnh hưởng đến tiền — chỉ ảnh hưởng giấy đưa khách.

---

## Tham khảo nội bộ

> Phần này dành cho kỹ thuật và quản lý đào tạo.

### Code path

- **Bill sheet (mobile drawer / desktop side):** [apps/web/app/br/[branchId]/pos/_components/bill/bill-receipt-sheet.tsx](../../../../apps/web/app/br/%5BbranchId%5D/pos/_components/bill/bill-receipt-sheet.tsx)
- **Payment picker:** [apps/web/app/br/[branchId]/pos/_components/bill/bill-receipt-payment-picker.tsx](../../../../apps/web/app/br/%5BbranchId%5D/pos/_components/bill/bill-receipt-payment-picker.tsx)
- **Cash tendered logic:** trong `bill-receipt-sheet.tsx` (không có dialog riêng — tất cả trong 1 sheet)
- **Invoice form:** [apps/web/app/br/[branchId]/pos/_components/bill/invoice-form-section.tsx](../../../../apps/web/app/br/%5BbranchId%5D/pos/_components/bill/invoice-form-section.tsx)
- **Server actions:** [apps/web/app/br/[branchId]/pos/payment-actions.ts](../../../../apps/web/app/br/%5BbranchId%5D/pos/payment-actions.ts)
- **Print actions:** [apps/web/app/br/[branchId]/pos/print-actions.ts](../../../../apps/web/app/br/%5BbranchId%5D/pos/print-actions.ts)

### Database

- Insert vào `payments` (atomic với update `orders`).
- `orders.payment_status` chuyển từ `unpaid` → `paid`.
- `orders.status` chuyển sang `paid` (hoặc tương đương).
- `tables.status` reset về `available` (nếu bàn không còn đơn nào active khác).
- HĐĐT: trigger gọi VAT provider qua queue, nếu thành công insert vào `einvoices`.

### Permission

- `pos:confirm_payment` — chỉ thu ngân và branch_manager. Waiter có thể thấy bill và chọn Chuyển khoản nhưng KHÔNG xác nhận tiền mặt.

### Regression rules quan trọng

- **HDDT-PAYMENT-FIRST-FAILSOFT-ORPHAN:** payment phải insert TRƯỚC HĐĐT call. Nếu HĐĐT lỗi → tiền vẫn vào, HĐĐT retry sau (không rollback payment).
- **HDDT-FORM-PAYLOAD-FREEZE-AT-CLICK:** payload HĐĐT phải freeze ngay tại moment click "Đã thanh toán" — chống race condition khi user sửa form trong lúc đang submit.
- **POS-PAYMENT-REUSE-UNIQUE-SLOT:** retry payment phải reuse slot cũ (idempotency key), không tạo bản ghi trùng.

### Tham chiếu thiết kế

- Order lifecycle: [docs/archive/plan/m2-order-lifecycle.md](../../../archive/plan/m2-order-lifecycle.md)
- HĐĐT: [docs/ref/einvoice-tax.md](../../../ref/einvoice-tax.md)
- Regression rules: [tasks/regressions.md](../../../../tasks/regressions.md)

---

## Metadata mockup

| Trường | Giá trị |
| --- | --- |
| Viewport | 390×844 (iPhone mặc định) |
| Capture script | [apps/web/e2e/guides/pos-05-payment.guide.ts](../../../../apps/web/e2e/guides/pos-05-payment.guide.ts) |
| Lệnh refresh | `pnpm --filter @comtammatu/web guides:capture --grep="POS-05"` |
| Cập nhật mockup gần nhất | 2026-04-27 |
| Người maintain | _TBD_ |

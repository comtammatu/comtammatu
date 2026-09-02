# SOP Inventory — Kho và Bếp chi nhánh

> Áp dụng sau **D093**. Business contract và phân vai: [inventory.md](inventory.md)
> §11. Route/action authority: runtime auth + permission/RLS/RPC.

## 1. Boundary

- Site active: `branch`, `central_supply`, `central_kitchen`. Mỗi chi nhánh
  thường luôn có đúng một Kho nhận/cấp và một Bếp tiêu hao. Kho Tổng và Bếp
  Trung Tâm giữ topology trung tâm, không có cặp Kho/Bếp của chi nhánh.
- **Mua NCC:** chỉ Kho Tổng / Bếp TT — **Tạo đơn** theo nguyên liệu (NCC trên
  từng dòng; một phiếu có thể nhiều NCC) → **một GRN** chung. Mỗi lần NCC giao,
  chốt đúng dòng của NCC đó. Yêu cầu mua chỉ còn lịch sử.
- **Bổ sung CN:** phiếu **Điều chuyển** xin hàng (QL CN tạo nháp, chưa trừ tồn)
  → Kho Tổng / Bếp TT ship từ điểm nguồn → CN nhận. Nguồn dòng = Owner tick
  Nguồn hàng trên catalog (Kho Tổng, Bếp TT, hoặc cả hai — OD-4). Prefill
  `from` = Kho Tổng khi cả hai còn tồn; Bếp TT khi Kho Tổng = 0 và Bếp còn
  tồn. Lịch sử Yêu cầu hàng vẫn đọc được. Checklist sẵn sàng tại
  `/inventory/ingredients`. «Thiếu» = chưa tick kho nào, không phải hết tồn.
- Kho trên GRN nháp ghi SL / đơn vị / **Đơn giá** net (chưa VAT) / từ chối
  (+ lý do/ảnh). PO không chứa giá thương mại.
- Chi nhánh **không** GRN UI, **không** production, **không** PO/giá mua chuỗi.
- Không dùng tài liệu này để suy ra quyền.

## 2. Nhập hàng từ nhà cung cấp (chỉ trung tâm)

### 2a. Happy path — Kho Tổng / Bếp TT

1. Kho **Tạo đơn** (kho nhận + nguyên liệu; NCC trên từng dòng) trên Đơn mua.
   Yêu cầu mua chỉ còn lịch sử.
2. Gửi đơn (`approved`). PO không nhập giá. Phân bổ YCM không còn happy path.
3. Hệ thống **tự tạo đúng một GRN nháp** cho cả phiếu (Auto-GRN), kể cả khi
   nhiều NCC. Nút «Tạo phiếu nhập» trên PO chỉ là recovery / idempotent.
4. Kho mở GRN, nhập thực nhận và **Đơn giá** net cho dòng NCC đang giao; từ chối
   cần lý do + ảnh. Chốt **theo NCC** (không ghi sổ dòng NCC chưa giao).
5. Số giữ lại ghi sổ theo Đơn giá dòng và **viết lại SL dòng đơn mua** khi NCC
   giao dư (ADR 0040). Thiếu → dòng còn lại trên **cùng GRN**. Hết phần còn:
   **Đóng phần còn lại** (không hủy dòng đã ghi sổ). HĐ NCC bill ≤ `po_applied`
   của **đúng NCC**.

Hàng tặng nhập như hàng mua (Đơn giá > 0). HĐ 0đ / không bill là lệch AP;
không dòng đơn mua giá 0.

### 2b. Chi nhánh — không GRN

CN không nhận NCC trực tiếp. Dùng §3 Điều chuyển xin hàng.

## 2c. Chọn đơn vị nguyên liệu

Contract: [inventory.md](inventory.md) §2.1 — Đơn vị chuẩn và các đơn vị quy đổi.

## 3. Điều chuyển chi nhánh (xin hàng và giao đi)

Có hai loại phiếu dùng chung mã `DC-YYYY-####`:

- **Liên điểm:** khác site, từ warehouse đến warehouse; đi qua nháp → xuất →
  đang chuyển → kiểm nhận → đã nhận. Hàng từ trung tâm/chi nhánh khác luôn vào
  Kho chi nhánh.
- **Nội bộ Kho ↔ Bếp:** cùng chi nhánh, xác nhận một lần và hoàn tất ngay. Kho
  cấp Bếp hoặc Bếp hoàn Kho; thiếu một dòng thì toàn phiếu không ghi sổ.

Mỗi chi nhánh thường luôn có sẵn hai vị trí **Kho** và **Bếp**; không có bước
bật/tắt riêng. Kho Tổng và Bếp Trung Tâm không dùng topology hai vị trí này. Màn
hình tồn của Chủ sở hữu và QL chi nhánh cho chuyển tab **Kho / Bếp / Tổng**, đặt
ngưỡng riêng tại từng vị trí và mở **Cấp Kho ↔ Bếp** ngay cạnh bộ chọn. Hàng liên
điểm luôn vào Kho; POS và kiểm đếm vận hành mặc định tại Bếp.

Phiếu nội bộ đã hoàn tất không sửa dòng, xóa, hủy hoặc dùng Điều chỉnh tồn một
đầu. Chọn **Đảo phiếu**, nhập toàn bộ hoặc phần còn lại; hệ thống tạo phiếu nội
bộ chiều ngược lại. Muốn gửi hàng đang ở Bếp sang site khác, phải hoàn Bếp → Kho
trước rồi lập phiếu liên điểm từ Kho.

1. QL CN tạo phiếu **Điều chuyển** nháp trên `/br/.../stock/transfer/new`
   (`Xin hàng` hoặc `Giao đi`). Không trừ tồn lúc tạo.
2. Xin hàng: chọn Nguồn (Kho Tổng / Bếp TT). Catalog tick Nguồn hàng; thiếu
   mapping → không thêm được («Thiếu Nguồn hàng» = chưa tick kho nào).
   Prefill Kho Tổng khi cả hai còn tồn; Bếp TT khi Kho Tổng hết tồn mà Bếp
   còn (đổi được trên phiếu).
3. Giao đi: chọn nơi nhận (Kho Tổng, Bếp TT, hoặc chi nhánh khác); số lượng
   không vượt tồn nguồn.
4. Điểm **from** ship (`stock_transfer_confirm_ship`) — QL CN chỉ ship phiếu
   xuất từ CN mình. Điểm **to** nhận.
5. Lịch sử YCH còn đọc tại `/br/.../stock/requests/[id]` và filter YCH trên
   hub. Không tạo YCH mới (`/requests/new` chuyển sang tạo DC).

## 4. Sản xuất và tiêu hao

- Sản xuất chỉ tại Bếp TT (và Owner). **Không** production tại chi nhánh (D093).
- Owner, Kho Tổng hoặc Bếp TT có quyền production quản lý công thức: sản lượng
  chuẩn, đơn vị thành phẩm và đơn vị từng nguyên liệu. Công thức `Cần duyệt`/
  `Ngừng dùng` không được tạo lệnh; Bếp TT chỉ thao tác trong site được gán.
- Tạo lệnh chỉ nhập sản lượng kế hoạch và vị trí cùng Bếp TT. Bắt đầu lệnh rồi
  mới nhập sản lượng/nguyên liệu thực tế để hoàn thành.
- Mẻ không có sản lượng: hủy lệnh, sau đó ghi vật tư hỏng qua Hao hụt.
- Thành phẩm hoàn thành nằm tại Bếp TT. Giao về chi nhánh từ lệnh sản xuất bằng
  CTA **Giao chi nhánh** → `/inventory/transfers/new` (cùng form Điều chuyển
  thủ công trên hub Giao nhận). Sau khi xuất kho, inbound hiện trên hub nhận
  của CN — CN không quản lý lifecycle DC xuất từ trung tâm. Trả
  nguyên liệu thừa / tồn dư về Kho Tổng cũng dùng Điều chuyển (Bếp TT → Kho Tổng).
- Tiêu hao / hao hụt theo contract hiện hành tại site được cấp.

## 5. Kiểm kê

Một cửa **Kiểm kê**. QL mở phiên tại kho của site → đếm số đang có (không hiện số sổ) → đối soát lệch → hoàn tất để ghi `count_adjustment`.

Nhân viên được giao trong ca dùng **Đếm tồn** (phiếu đếm). Phiếu đó không tự sửa tồn; QL duyệt hoặc đếm trong phiên Kiểm kê.

Thu ngân chi nhánh được gán đếm tồn nước theo ca (sáng/chiều/tối). Tạm thời chỉ Coca, Sprite, Fanta cam, Fanta xá xị, Nước suối (chưa sâm/rau má). Việc cuối ca có **Đếm tồn nước**. Cửa nhân viên: tab **Ca** → phiếu đếm; QL xem/duyệt tại **Đội** / `/stock/count-slips`. Nhân viên chọn đơn vị đếm (mặc định Đơn vị chuẩn). Phiếu và màn duyệt đối chiếu tồn sổ / thực đếm / lệch cùng đơn vị đó.

1. Nhân viên đếm hằng ngày tại Bếp. QL/Owner tạo phiên kiểm kê Kho hoặc Bếp bằng location tường minh.
2. Đếm theo Đơn vị đang dùng; hệ thống quy về Đơn vị chuẩn.
3. RPC hoàn tất mới post `count_adjustment`.

## 6. Đóng ngày và bằng chứng

- GRN trung tâm confirmed đúng; yêu cầu CN không kẹt; DC nhận đủ hoặc có bước tiếp.
- Consumption / write-off / kiểm kê mở có owner rõ.
- Bằng chứng: env/ref, branch, actor, document IDs, GREEN/YELLOW/RED.

## 7. Tài liệu liên quan

- [inventory.md](inventory.md)
- [operational-data-contract.md](operational-data-contract.md)

## 8. Hygiene cutover (Production 2026-08-20)

Chờ đơn giá GRN đã chốt = 0. Còn đóng **không convert:** YCM-07082026-0022
(`partially_ordered`); YC-31072026-0001 và YC-08082026-0002 (`submitted`, DC
đã nhận). Map NL↔NCC + NCC ưu tiên trước khi dựa Tạo đơn NL-first. Wave 4
REVOKE ghi YCM/YCH sau soak.

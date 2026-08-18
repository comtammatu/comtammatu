# SOP Inventory — Một warehouse mỗi site

> Áp dụng sau **D093**. Business contract và phân vai: [inventory.md](inventory.md)
> §11. Route/action authority: runtime auth + permission/RLS/RPC.

## 1. Boundary

- Site active: `branch`, `central_supply`, `central_kitchen`. Mỗi site một
  warehouse active (default receive/issue/consumption).
- **Mua NCC:** chỉ Kho Tổng / Bếp TT — Yêu cầu mua → PO theo NCC → GRN theo
  lần giao.
- **Bổ sung CN:** phiếu **Yêu cầu hàng** → fulfill trung tâm → DC → CN nhận.
  Nguồn dòng = `ingredients.default_fulfill_site_kind` (Owner gán trên catalog;
  checklist sẵn sàng tại `/inventory/ingredients`).
- Kho trên GRN nháp ghi SL / đơn vị / **Đơn giá** net (chưa VAT) / từ chối
  (+ lý do/ảnh). PO không chứa giá thương mại.
- Chi nhánh **không** GRN UI, **không** production, **không** PO/giá mua chuỗi.
- Không dùng tài liệu này để suy ra quyền.

## 2. Nhập hàng từ nhà cung cấp (chỉ trung tâm)

### 2a. Happy path — Kho Tổng / Bếp TT

1. Kho tạo **Yêu cầu mua** tại site nhận trung tâm.
2. Kế toán hoặc Owner tạo PO theo từng NCC và duyệt (`draft → sent`). PO
   không nhập giá.
3. Khi PO chuyển `sent` (hoặc `approved` / `partially_received`), hệ thống **tự
   tạo** đúng một GRN nháp **Chờ nhập hàng** (Auto-GRN). Một PO chỉ có một GRN
   nháp hoạt động tại một thời điểm. Nút «Tạo phiếu nhập» trên PO chỉ là recovery
   / idempotent — không phải bước quy trình chính.
4. Kho mở danh sách GRN, nhập thực nhận, **Đơn giá** net (gắn đơn vị giá, không
   nhầm thùng/hộp), và từ chối; lý do + ảnh là bắt buộc khi có từ chối.
5. Kho xác nhận GRN. Chốt bắt buộc Đơn giá > 0 trên dòng có số nhận hợp lệ.
   Số giữ lại ghi sổ theo Đơn giá phiếu nhập và **viết lại số lượng dòng đơn mua** khi
   NCC giao nhiều hơn phần còn. Ví dụ đặt 10 thùng: giao 9 thùng 6 hộp →
   áp dụng 9 thùng 6 hộp, PO `partially_received`, GRN nháp kế cho phần còn
   (hoặc **Đóng phần còn lại**); giao 10 thùng 6 hộp → dòng đơn mua tăng 10.25
   thùng, áp dụng hết, PO `received`. Cùng đơn vị (đặt 4, nhận 6): dòng đơn mua
   thành 6, áp dụng 6.
6. Nếu PO còn thiếu sau confirm, hệ thống **tự tạo GRN nháp kế tiếp** cho phần
   còn lại, hoặc kho/kế toán **Đóng phần còn lại** (`closed` + lý do). HĐ NCC
   bill ≤ số đã tính vào đơn (`po_applied` = số giữ lại).

Hàng tặng nhập như hàng mua (Đơn giá > 0). HĐ 0đ / không bill là lệch AP;
không dòng đơn mua giá 0.

### 2b. Chi nhánh — không GRN

CN không nhận NCC trực tiếp. Dùng §3 Yêu cầu hàng.

## 2c. Chọn đơn vị nguyên liệu

Contract: [inventory.md](inventory.md) §2.1 — Đơn vị chuẩn và các đơn vị quy đổi.

## 3. Yêu cầu hàng chi nhánh → điều chuyển

1. QL CN tạo phiếu yêu cầu (draft) trên `/br/.../stock/requests`.
2. Thêm dòng nguyên liệu: hệ thống copy `default_fulfill_site_kind`; thiếu
   mapping → không thêm được.
3. Submit. Kho Tổng / Bếp TT thấy inbox dòng thuộc nguồn mình trên
   `/inventory/transfers`.
4. Bên nguồn fulfill → tạo DC → ship. Có thể 1 hoặc 2 DC / phiếu.
5. QL CN nhận DC trên hub `/br/.../stock` (filter cần nhận hoặc bước Xác nhận
   của YCH); tồn CN tăng theo cost snapshot nguồn.

## 4. Sản xuất và tiêu hao

- Sản xuất chỉ tại Bếp TT (và Owner). **Không** production tại chi nhánh (D093).
- Owner duyệt từng công thức: sản lượng chuẩn, đơn vị thành phẩm và đơn vị của
  từng nguyên liệu. Công thức `Cần duyệt`/`Ngừng dùng` không được tạo lệnh.
- Tạo lệnh chỉ nhập sản lượng kế hoạch và vị trí cùng Bếp TT. Bắt đầu lệnh rồi
  mới nhập sản lượng/nguyên liệu thực tế để hoàn thành.
- Mẻ không có sản lượng: hủy lệnh, sau đó ghi vật tư hỏng qua Hao hụt.
- Thành phẩm hoàn thành nằm tại Bếp TT. Giao về chi nhánh từ lệnh sản xuất bằng
  CTA **Giao chi nhánh** → `/inventory/transfers/new` (cùng form Điều chuyển
  thủ công trên hub Giao nhận). Sau khi xuất kho, inbound hiện trên hub nhận
  của CN (cùng chỗ với YCH cần nhận) — CN không quản lý lifecycle DC xuất. Trả
  nguyên liệu thừa / tồn dư về Kho Tổng cũng dùng Điều chuyển (Bếp TT → Kho Tổng).
- Tiêu hao / hao hụt theo contract hiện hành tại site được cấp.

## 5. Kiểm kê

Một cửa **Kiểm kê**. QL mở phiên tại kho của site → đếm số đang có (không hiện số sổ) → đối soát lệch → hoàn tất để ghi `count_adjustment`.

Nhân viên được giao trong ca dùng **Đếm tồn** (phiếu đếm). Phiếu đó không tự sửa tồn; QL duyệt hoặc đếm trong phiên Kiểm kê.

1. QL tạo phiên kiểm kê (một kho / site).
2. Đếm theo Đơn vị đang dùng; hệ thống quy về Đơn vị chuẩn.
3. RPC hoàn tất mới post `count_adjustment`.

## 6. Đóng ngày và bằng chứng

- GRN trung tâm confirmed đúng; yêu cầu CN không kẹt; DC nhận đủ hoặc có bước tiếp.
- Consumption / write-off / kiểm kê mở có owner rõ.
- Bằng chứng: env/ref, branch, actor, document IDs, GREEN/YELLOW/RED.

## 7. Tài liệu liên quan

- [inventory.md](inventory.md)
- [operational-data-contract.md](operational-data-contract.md)

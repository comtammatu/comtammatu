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
- Kho trên GRN nháp chỉ SL / đơn vị / từ chối (+ lý do/ảnh). Đơn giá trên PO.
- Chi nhánh **không** GRN UI, **không** production, **không** PO/giá mua chuỗi.
- Không dùng tài liệu này để suy ra quyền.

## 2. Nhập hàng từ nhà cung cấp (chỉ trung tâm)

### 2a. Happy path — Kho Tổng / Bếp TT

1. Kho tạo **Yêu cầu mua** tại site nhận trung tâm.
2. Kế toán hoặc Owner tạo PO theo từng NCC, nhập giá và duyệt (`draft → sent`).
3. Khi PO chuyển `sent` (hoặc `approved` / `partially_received`), hệ thống **tự
   tạo** đúng một GRN nháp **Chờ nhập hàng** (Auto-GRN). Một PO chỉ có một GRN
   nháp hoạt động tại một thời điểm. Nút «Tạo phiếu nhập» trên PO chỉ là recovery
   / idempotent — không phải bước quy trình chính.
4. Kho mở danh sách GRN, nhập thực nhận và từ chối; lý do + ảnh là bắt buộc khi
   có từ chối.
5. Kho xác nhận GRN. Phần áp dụng PO dùng giá PO; phần dư ngoài đơn nhập giá `0`.
6. Nếu PO còn thiếu sau confirm, hệ thống **tự tạo GRN nháp kế tiếp** cho phần
   còn lại. HĐ NCC → Finance/AP.

Hàng tặng biết trước là dòng PO giá `0`; không tạo phân hệ khuyến mãi.

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

1. QL tạo phiên kiểm kê Kho CN.
2. Gán người đếm; blind count khi yêu cầu.
3. Chọn đơn vị đang hoạt động phù hợp lúc đếm; hệ thống quy về Đơn vị chuẩn.
4. RPC hoàn tất mới post `count_adjustment`.

## 6. Đóng ngày và bằng chứng

- GRN trung tâm confirmed đúng; yêu cầu CN không kẹt; DC nhận đủ hoặc có bước tiếp.
- Consumption / write-off / kiểm kê mở có owner rõ.
- Bằng chứng: env/ref, branch, actor, document IDs, GREEN/YELLOW/RED.

## 7. Tài liệu liên quan

- [inventory.md](inventory.md)
- [operational-data-contract.md](operational-data-contract.md)

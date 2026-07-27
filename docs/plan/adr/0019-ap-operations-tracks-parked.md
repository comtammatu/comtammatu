# ADR 0019 — AP and central-site operation tracks (Parked)

**Trạng thái:** Parked (D082, 2026-07-27).
**Điều kiện xem lại:** Owner mở một trong hai track để triển khai.
**Phạm vi:** `comtammatu` hiện hữu. Không dùng hoặc mở lại Greenfield/candidate
target, không tạo database mới, không thực hiện data cutover.

## Nguyên tắc

- Runtime hiện tại vẫn là Inventory branch-only theo `docs/ref/inventory.md`;
  không bật site, route, quyền hay migration chỉ vì có roadmap này.
- `supplier_payments` là Finance/AP; GRN và đối soát hóa đơn vẫn thuộc handoff
  từ Inventory.
- `location_kind='kitchen'` là Bếp CN lịch sử, không được khôi phục. Kho Bếp
  TT là kho `warehouse` của site `central_kitchen`.
- Không mở ERP, payment proposal batch, approval nhiều cấp hoặc WIP/labor
  accounting.

## Track 1 — Thanh toán NCC

**Mục tiêu:** Owner ghi nhận thanh toán một phần hoặc toàn bộ cho hóa đơn NCC,
biết số phải trả còn lại và đối soát đúng với tiền mặt/ngân hàng.

1. Hoàn tất gate đang có: `record_supplier_payment` required-key, retry an toàn,
   UI Cash/VietQR-only và bằng chứng Preview của “Verify the Finance payment
   cutover” trong `tasks/todo.md`.
2. Mở thao tác tại `/finance/supplier-invoices`: chỉ hóa đơn đã đối soát/được
   duyệt mới được thanh toán; số tiền dương, không vượt số còn phải trả; cho
   phép partial payment.
3. Ghi atomically một `supplier_payment`, cập nhật trạng thái/còn nợ hóa đơn và
   audit. Thanh toán tiền mặt giảm quỹ tiền mặt một lần; `bank_transfer` chỉ
   đối soát với `bank_transactions`, không tạo thêm dòng giảm tiền ngân hàng.
4. Bàn giao khi danh sách AP hiển thị unpaid/partial/paid, dư nợ đúng sau retry
   và payment không biến thành chi phí vận hành hoặc giá vốn.

## Track 2 — Kho Tổng và Bếp Trung Tâm

**Mục tiêu:** Khôi phục hai site vận hành trung tâm với tuyến tồn minh bạch:
`NCC → Kho Tổng → Bếp TT → Chi nhánh`. Bếp TT nhận nguyên liệu, sản xuất thành
phẩm và chuyển thành phẩm về chi nhánh.

1. Chốt contract trước code: site `central_supply` (Kho Tổng), site
   `central_kitchen` (Bếp TT), ma trận điều chuyển, quyền/assignment và route
   matrix. Branch vẫn có đúng một Kho CN; chỉ Bếp TT có Kho Bếp TT và
   `production`.
2. Mở Kho Tổng: GRN tại Kho Tổng, tồn và kiểm kê độc lập; điều chuyển sang Bếp
   TT phải ghi ledger nguồn/đích trong một RPC. Không cho Branch tự tạo route
   hoặc dùng site trung tâm ngoài scope được cấp.
3. Mở Bếp TT: chỉ actor được gán Bếp TT mới tạo/xác nhận `production_runs`;
   RPC tiêu hao nguyên liệu và nhập thành phẩm tại Kho Bếp TT atomically. Tắt
   khả năng tạo/xác nhận Production tại Branch trong cùng đợt triển khai.
4. Mở điều chuyển thành phẩm Bếp TT → Kho CN bằng RPC; không dùng transfer để
   giả tiêu hao, hao hụt hoặc thanh toán NCC.
5. Bàn giao pilot khi RLS/route chặn sai site, mọi movement có nguồn-đích và
   actor đúng, tồn không âm, và một vòng NCC → Kho Tổng → Bếp TT → Chi nhánh
   đối chiếu được số lượng lẫn giá vốn.

## Gate triển khai chung

- T3 review cho tiền, RLS, migration và RPC nhiều dòng; migration phải đi trước
  code phụ thuộc, sau đó tạo lại database types.
- Chỉ bật sau Preview proof, targeted tests, `typecheck`, `lint`, `build`, CI
  và owner delegation riêng cho Production apply.
- Khi bắt đầu Track 2, sửa D073/D078, `docs/ref/inventory.md`, SOP, ACL/RLS,
  route matrix và UI cùng một thay đổi nhất quán; trước đó các contract hiện
  tại vẫn là authority.

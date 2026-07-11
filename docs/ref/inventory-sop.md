# SOP Inventory — Một kho mỗi chi nhánh

> Áp dụng cho vận hành Inventory hiện hành của Cơm Tấm Má Tư. Business contract
> chi tiết sống ở [inventory.md](inventory.md); route/action authority sống trong
> runtime auth và permission/RLS/RPC.

## 1. Boundary

- Site vận hành active chỉ có `branch`.
- Mỗi chi nhánh có đúng một location stock-bearing `warehouse`.
- `central_supply`, `central_kitchen` và location `kitchen` chỉ còn phục vụ dữ
  liệu lịch sử; không tạo workflow mới trên các bucket này.
- Purchase order, supplier return, same-branch Kho↔Bếp transfer, lot/expiry và
  production order không phải workflow hằng ngày.
- Không dùng tài liệu này để suy ra quyền. `module-acl.ts`,
  `inventory-roles.ts`, permission keys và RLS/RPC là authority.

## 2. Nhập hàng trực tiếp từ nhà cung cấp

1. Chọn đúng chi nhánh và nhà cung cấp.
2. Tạo GRN supplier-first; không yêu cầu PO.
3. Nhập số lượng thực nhận, đơn vị, đơn giá và bằng chứng/QC cần thiết.
4. Xác nhận GRN bằng action/RPC hiện hành.
5. Kiểm tra GRN đã chuyển trạng thái đúng, stock movement được ghi và tồn của
   Kho CN tăng đúng một lần.
6. Chứng từ/hoá đơn NCC chuyển sang luồng đối soát Finance/AP; Inventory không tự
   ghi nhận thanh toán.

Không tiếp tục nếu chi nhánh, đơn vị hoặc số lượng thực nhận không xác định rõ.
Không sửa tồn trực tiếp để bù một GRN lỗi.

## 3. Sản xuất và tiêu hao

- Sản xuất diễn ra tại chi nhánh và phải dùng workflow/RPC đang có; không tái lập
  `production_orders` đã nghỉ.
- Tiêu hao thực tế chỉ post khi nguồn nghiệp vụ hợp lệ được duyệt hoặc khi POS
  sale-consumption đủ điều kiện theo contract hiện hành.
- Hao hụt/write-off phải có lý do và actor; không dùng transfer giả để giảm tồn.
- Một nghiệp vụ nhiều dòng phải atomic trong RPC. Khi RPC fail, không coi chứng
  từ hoặc payment là hoàn tất.

Sau mỗi lần post, đối chiếu branch, ingredient, quantity, unit và movement type.

## 4. Kiểm kê

1. Tạo một phiên kiểm kê cho Kho CN đúng branch.
2. Gán người đếm theo permission và branch scope; blind count nếu flow yêu cầu.
3. Nhập số thực đếm, lý do chênh lệch và hoàn tất vòng đếm.
4. Nếu hệ thống mở recount, chỉ đóng khi các dòng cần đếm lại đã hội tụ.
5. Chỉ RPC hoàn tất kiểm kê mới được post `count_adjustment` và cập nhật tồn.

Không có nhiều location stock-bearing để operator tự chọn trong cùng chi nhánh.

## 5. Đóng ngày và bằng chứng

Trước khi coi Inventory trong ngày là ổn:

- GRN đã xác nhận không còn movement thiếu hoặc trùng.
- Consumption, sale-consumption và write-off có nguồn, actor và branch đúng.
- Phiên kiểm kê mở có owner và bước tiếp theo rõ.
- Không còn chứng từ fail nhưng UI hiển thị thành công.
- Finance/reporting đọc được dữ liệu vừa post theo contract hiện hành.

Bằng chứng tối thiểu: environment/ref, branch, actor, document IDs, movement IDs,
trạng thái trước/sau và kết quả GREEN/YELLOW/RED. Không ghi production secret hoặc
raw database error vào bằng chứng.

## 6. Tài liệu liên quan

- [inventory.md](inventory.md)
- [operational-data-contract.md](operational-data-contract.md)
- [operations-smoke-gate.md](../runbooks/operations-smoke-gate.md)

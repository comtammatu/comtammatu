# SOP Inventory — Một kho mỗi chi nhánh

> Áp dụng cho vận hành Inventory hiện hành của Cơm Tấm Má Tư. Business contract
> chi tiết sống ở [inventory.md](inventory.md); route/action authority sống trong
> runtime auth và permission/RLS/RPC.

## 1. Boundary

- Site Greenfield active: `branch` (chi nhánh), `central_supply` (Kho Tổng),
  `central_kitchen` (Bếp Trung Tâm). Authority: D082; D073/D078 chỉ là lịch sử
  `matu-prod`.
- Mỗi site có đúng một location stock-bearing `warehouse`. Location `kitchen`
  (Bếp CN) chỉ còn dữ liệu lịch sử.
- Owner lập PO một cấp (`draft → sent`) với destination bất kỳ site active; không
  mở PR. Branch runtime không có PO — nhập NCC supplier-first tại CN (D083).
- Supplier return và same-branch Kho↔Bếp transfer giả không phải workflow hằng ngày.
- Không dùng tài liệu này để suy ra quyền. `module-acl.ts`,
  `inventory-roles.ts`, permission keys và RLS/RPC là authority.

## 2. Nhập hàng từ nhà cung cấp

### 2a. Owner PO → GRN (CN / Kho Tổng / Bếp TT)

1. Owner chọn destination site và nhà cung cấp, lập PO nháp.
2. Duyệt mua một cấp (`draft → sent`); không PR.
3. Tạo GRN từ PO đã duyệt; nhập số lượng thực nhận, đơn vị, đơn giá, QC.
4. Xác nhận GRN; tồn `warehouse` của site đích tăng đúng một lần.

### 2b. Branch supplier-first (chỉ chi nhánh)

1. Chọn đúng chi nhánh và nhà cung cấp.
2. Tạo GRN supplier-first; không yêu cầu PO.
3. Nhập số lượng thực nhận, đơn vị, đơn giá và bằng chứng/QC cần thiết.
4. Xác nhận GRN bằng action/RPC hiện hành.
5. Kiểm tra GRN đã chuyển trạng thái đúng, stock movement được ghi và tồn của
   Kho CN tăng đúng một lần.
6. Chứng từ/hoá đơn NCC + file HĐ GTGT chuyển sang luồng Finance/AP; Inventory
   không tự ghi nhận thanh toán. Thanh toán AP bắt buộc có file HĐ GTGT.

Không tiếp tục nếu chi nhánh, đơn vị hoặc số lượng thực nhận không xác định rõ.
Không sửa tồn trực tiếp để bù một GRN lỗi.

## 2c. Chọn đơn vị nguyên liệu

Contract kỹ thuật: [inventory.md](inventory.md) §2.1 — mỗi nguyên liệu chỉ có
**đơn vị nhập** và **đơn vị xuất** (`1 nhập = N xuất`). Không mở tầng ledger thứ
ba.

| Nhóm hàng | Đơn vị xuất | Đơn vị nhập | Ghi chú |
| --- | --- | --- | --- |
| Sốt, dầu, nước mắm, nước tương | `ml` | `thùng` / `chai` | Production/recipe nhập số ml, không dùng `0,1 chai` |
| Gia vị bột, đường | `g` | `bao` / `kg` | Định mức theo gram |
| Lon nước, trứng, hộp dùng nguyên | `lon` / `quả` / `hộp` | `thùng` | Không cần xuống ml |
| Thịt, rau | `g` hoặc `kg` | `kg` / `thùng` | Theo cách cân thực tế |

**Tồn trên màn hình:** sổ lưu theo đơn vị xuất; UI hiện dạng hỗn hợp khi đủ pack
(ví dụ `2 thùng + 30 ml`) kèm tổng đúng theo đơn vị xuất.

**Kiểm kê:** ưu tiên đếm theo đơn vị nhập/đóng gói (mặc định picker); hệ thống
quy về đơn vị xuất khi ghi sổ.

**Chai/bao đã mở:** đếm số nguyên còn nguyên + ước lượng phần đã mở (hoặc cân).
Không soi từng ml mỗi ngày trừ khi đang cân kiểm soát.

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
3. Nhập số thực đếm theo đơn vị đóng gói/nhập khi có (mặc định), lý do chênh
   lệch và hoàn tất vòng đếm. Hệ thống quy về đơn vị xuất.
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

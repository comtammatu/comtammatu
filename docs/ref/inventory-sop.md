# SOP Inventory — Một warehouse mỗi site

> Áp dụng cho vận hành Inventory hiện hành của Cơm Tấm Má Tư. Business contract
> chi tiết sống ở [inventory.md](inventory.md); route/action authority sống trong
> runtime auth và permission/RLS/RPC.

## 1. Boundary

- Site Greenfield active: `branch` (chi nhánh), `central_supply` (Kho Tổng),
  `central_kitchen` (Bếp Trung Tâm).
- Mỗi site active có đúng một active `warehouse`, đồng thời là default
  receive/issue/consumption. Không có stock location Bếp; `production_storage`
  chỉ dùng tường minh cho production trung tâm.
- Luồng mua canonical (D091): **GRN draft → PO từ GRN → duyệt PO → confirm
  GRN**. Branch runtime không có UI PO; confirm vẫn bắt buộc PO đã duyệt
  (fail closed). Không mở PR.
- Kho trên nháp chỉ ghi **số lượng / đơn vị nhập / số lượng từ chối** — không
  nhập đơn giá mua. Khi có hàng từ chối, lý do + ảnh là bắt buộc. Đơn giá
  thương mại do Kế toán/Owner trên PO; sync vào
  `grn_items.unit_cost` khi duyệt PO.
- Không có CTA tạo PO trực tiếp, tạo GRN từ PO hoặc same-branch Kho↔Bếp.
- Không dùng tài liệu này để suy ra quyền. `module-acl.ts`,
  `inventory-roles.ts`, permission keys và RLS/RPC là authority.

## 2. Nhập hàng từ nhà cung cấp

### 2a. Happy path — mọi site stock-bearing (CN / Kho Tổng / Bếp TT)

1. Kho chọn site nhận + nhà cung cấp, tạo **GRN draft**; nhập số lượng thực nhận,
   đơn vị nhập và số lượng từ chối. Nếu từ chối bất kỳ lượng nào, nhập lý do
   và ảnh. **Không** nhập đơn giá hoặc trạng thái QC thủ công.
2. Kế toán hoặc Owner tạo **PO từ GRN draft**, điền/chỉnh đơn giá thương mại
   (`unit_price_est`), duyệt một cấp (`draft → sent`). Cùng một người được tạo
   và duyệt.
3. Khi duyệt PO, hệ thống sync giá sang `grn_items.unit_cost`.
4. Kho **confirm GRN** chỉ khi PO liên kết đã duyệt; thiếu PO duyệt → chặn.
5. Kiểm tra GRN confirmed, stock movement và tồn `warehouse` tăng đúng một lần.
6. Chứng từ/HĐ NCC + file HĐ GTGT chuyển Finance/AP; Inventory không tự thanh toán.

Nếu toàn bộ số lượng bị từ chối, hủy GRN draft khi chưa liên kết PO; không tạo
PO giá trị bằng không và không ghi nhập tồn.

### 2b. Chi nhánh (Branch runtime)

1. QL CN / kho CN tạo GRN draft như §2a bước 1 trên `/br/.../stock` (không UI PO,
   không xem giá mua chuỗi).
2. Kế toán/Owner xử lý PO trên Owner plane (`/inventory`) như §2a bước 2–3.
3. QL CN confirm GRN sau khi PO duyệt (cùng gate RPC như site trung tâm).

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

- Sản xuất dùng workflow/RPC hiện hành tại site được cấp quyền. Branch dùng
  warehouse duy nhất; `production_storage` chỉ hợp lệ tại site trung tâm khi
  được chọn tường minh. D091 không thực hiện central-production cutover.
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
- Dòng GRN có số lượng từ chối đều có lý do và ảnh; không có price-QC đang chờ
  Kho xử lý.
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

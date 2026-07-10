# Inventory Operator Journeys

> Bộ kịch bản đóng vai trực tiếp nhân viên đang dùng hệ thống mỗi ngày.
>
> Dùng kèm:
>
> - [ui-ux-rubric.md](./ui-ux-rubric.md)
> - [route-cta-matrix.md](./route-cta-matrix.md)
> - [pre-release-qa.md](./pre-release-qa.md)
> - Ghi evidence trực tiếp vào ticket/PR hoặc worklog hiện hành nếu chưa promote được vào canonical docs.

Updated: `2026-06-19`

---

## 1. Procurement Loop

- `persona`: `warehouse_manager` (hoặc `production_manager`) chạy procurement
- `site_kind`: `branch`
- `device`: `desktop`
- `starting route`: `/inventory`
- `goal`: đi trọn vòng `Dashboard -> GRN supplier-first -> Supplier Invoice`
- `preconditions`:
  - có ít nhất 1 supplier active;
  - có ingredient master đủ để lập GRN;
  - role thuộc `PROCUREMENT_ROLES` (owner, warehouse_manager, production_manager) và có quyền `inventory_procurement`;
  - dữ liệu test không làm nhiễu bởi GRN nháp cũ.
- `steps`:
  1. Từ dashboard, xác nhận quick action và task queue dẫn về đúng procurement surfaces.
  2. Vào `/inventory/operations`, kiểm cửa `Phiếu nhập kho` dẫn đúng vào GRN.
  3. Chọn NCC, tạo GRN mới hoặc mở GRN draft sẵn có.
  4. Trên GRN detail, kiểm actual/QC rồi chốt nhập.
  5. Vào `supplier-invoices`, tạo hóa đơn và chạy `tính lại đối soát`.
- `expected next step`:
  - dashboard/operations phải làm rõ được bước kế tiếp sau từng màn;
  - sau chọn NCC là form GRN đúng site nhận;
  - sau GRN confirm là `Supplier Invoice`.
- `handoff`: bàn giao cho kế toán/OPS theo dõi AP aging và matching status
- `success`:
  - user không phải đoán bước tiếp theo;
  - trạng thái GRN/invoice đổi rõ ràng;
  - tồn chi nhánh và AP readout phản ánh logic vừa làm.
- `blocked states`:
  - chưa có supplier;
  - GRN thiếu NCC hoặc line item hợp lệ;
  - GRN không confirm được;
  - invoice không match hoặc không ghi nhận paid được.
- `recovery`:
  - UI phải chỉ đúng màn cần quay lại;
  - error copy không được mơ hồ;
  - blocked state phải chỉ ra dữ liệu nào đang thiếu.

## 2. Blocked Procurement Path

- `persona`: `warehouse_manager` (hoặc `owner`)
- `site_kind`: `branch`
- `device`: `desktop`
- `starting route`: `/inventory/grn/new`
- `goal`: xác nhận UI chặn lỗi sớm, không để operator commit sai dữ liệu procurement
- `preconditions`:
  - có supplier nhưng chưa hoàn tất line item hoặc form thiếu dữ liệu;
  - có ít nhất 1 GRN draft để thử negative paths.
- `steps`:
  1. Thử tạo GRN thiếu supplier hoặc thiếu line item.
  2. Từ GRN draft, thử chốt khi line/QC chưa hợp lý.
  3. Từ invoice, xác nhận Inventory không render action ghi nhận thanh toán.
- `expected next step`: hệ thống phải nói rõ cần bổ sung gì và quay về khu vực nào
- `handoff`: không có; đây là audit error prevention
- `success`:
  - lỗi không chung chung;
  - destructive/commit actions có guard;
  - blocked state không khiến user mất ngữ cảnh.
- `blocked states`: bất kỳ thao tác nào im lặng hoặc chỉ báo “không thể” mà thiếu nguyên nhân
- `recovery`: user quay lại đúng field/section và hoàn tất được trong lần thử tiếp theo

## 3. Branch Production Happy Path

- `persona`: `branch_manager` (hoặc `owner` theo `PRODUCTION_OPERATOR_ROLES`)
- `site_kind`: `branch`
- `device`: `tablet`, đối chiếu lại trên `desktop`
- `starting route`: `/inventory`
- `goal`: nhập nguyên liệu, tạo và confirm production order tại chính chi nhánh
- `preconditions`:
  - có GRN hoặc transfer nguyên liệu đã vào chi nhánh;
  - có `finished_good` và `production_recipes` hợp lệ;
  - site hiện tại là `branch`.
- `steps`:
  1. Từ dashboard, kiểm task card và quick action `Tạo lệnh sản xuất`.
  2. Vào `/inventory/production`, kiểm readiness message cho chi nhánh.
  3. Tạo production order với ít nhất 1 thành phẩm.
  4. Confirm production order.
  5. Kiểm list order, status, total cost, và tồn thành phẩm cộng vào chính chi nhánh.
- `expected next step`: sau confirm production, người dùng hiểu thành phẩm đã cộng vào tồn chi nhánh và tiêu hao/xuất dùng mới là bước giảm tồn
- `handoff`: thành phẩm nằm trong tồn chi nhánh cho tiêu hao bán hàng
- `success`:
  - create/confirm production mạch lạc trên tablet;
  - status và cost phản hồi rõ;
  - không lộ production cho role sai hoặc sai branch scope.
- `blocked states`:
  - thiếu BOM;
  - thiếu nguyên liệu;
  - chưa có `finished_good` hoặc chi nhánh chưa cấu hình.
- `recovery`: readiness/error copy phải chỉ user sang `recipes`, `ingredients`, hoặc `transfers` đúng chỗ

## 4. Branch Production Blocked Path

- `persona`: `branch_manager` (hoặc `owner`)
- `site_kind`: `branch`
- `device`: `tablet`
- `starting route`: `/inventory/production`
- `goal`: xác nhận màn production không tạo cảm giác “hỏng” khi thực chất là chưa đủ cấu hình
- `preconditions`:
  - chuẩn bị data khiến một trong các điều kiện readiness thiếu.
- `steps`:
  1. Mở production khi chi nhánh chưa cấu hình.
  2. Mở production khi thiếu finished good.
  3. Mở production khi thiếu raw material hoặc BOM.
  4. Thử confirm order thiếu điều kiện.
- `expected next step`: user phải biết cần cấu hình gì trước, không phải hỏi dev
- `handoff`: chuyển về team quản trị danh mục/công thức
- `success`: blocked state rõ, không dùng copy mơ hồ, không có CTA giả
- `blocked states`: dialog create mở được nhưng không tạo được mà không giải thích
- `recovery`: empty state và error state phải nêu rõ dependency còn thiếu

## 5. Branch Daily Loop

- `persona`: `branch_manager`
- `site_kind`: `branch`
- `device`: `tablet`
- `starting route`: `/br/[branchId]`
- `goal`: nhận hàng, duyệt tiêu hao thật trong ngày, kiểm tác động tồn, chốt stocktake cuối ca
- `preconditions`:
  - có transfer `chi nhánh → chi nhánh` đến branch ở trạng thái cần nhận;
  - có ingredient/stock data nhìn thấy được ở branch;
  - có order hoàn tất hoặc data bridge tiêu hao để đối chiếu.
- `steps`:
  1. Từ dashboard, mở task `Nhận transfer`.
  2. Trên transfer detail (phiếu `chi nhánh → chi nhánh`), đi đủ máy trạng thái 5 bước tới `confirmed_receive -> received`.
  3. Quay lại dashboard hoặc `/inventory/consumption`, mở danh sách tiêu hao.
  4. Duyệt/apply báo cáo tiêu hao đã submit từ Employee checkout flow.
  5. Vào `/inventory/stock`, kiểm Kho CN và Bếp CN đều nằm trong tổng tồn chi nhánh; `sale_consumption` chỉ giảm tồn khi đã ghi phiếu tiêu hao/xuất.
  6. Đối chiếu doanh thu POS/KDS completed với actual consumption đã duyệt.
  7. Cuối ca vào `/inventory/stocktake`, hoàn tất một phiên kiểm kê.
- `expected next step`:
  - sau `received`, UI phải gợi đủ rõ sang `Tiêu hao` nếu chi nhánh cần chốt nguyên liệu đã dùng;
  - sau duyệt tiêu hao, user hiểu tồn tại location nguồn giảm và giá vốn thực tế tăng;
  - sau stocktake, user hiểu variance/kết quả chốt; conflict/recount S13b không nằm trong daily UI.
- `handoff`: báo chênh lệch lớn cho OPS/owner
- `success`:
  - đây là journey branch quan trọng nhất và không được cần “người biết hệ thống trước” mới dùng được;
  - các action chính luôn thấy được trên tablet;
  - mental model `Nhận hàng -> Bán -> Duyệt tiêu hao -> Kiểm kê` liền mạch.
- `blocked states`:
  - nhận hàng xong nhưng không thấy hướng sang `Tiêu hao` khi cần duyệt consumption;
  - issue confirm xong nhưng tác động tồn không rõ;
  - stocktake save/complete không có feedback.
- `recovery`: dashboard, badge, toast, detail page phải kéo user về flow đúng

## 6. Branch Mobile Ergonomics Path

- `persona`: `branch_manager`
- `site_kind`: `branch`
- `device`: `mobile`
- `starting route`: `/inventory`
- `goal`: đảm bảo các action dùng nhiều nhất vẫn thao tác được khi cầm máy
- `preconditions`:
  - branch có dữ liệu transfer, issue, stocktake, consumption và waste tối thiểu.
- `steps`:
  1. Kiểm Branch Hub quick actions và task queue trên mobile.
  2. Kiểm `/br/[branchId]/stock/transfer`, `/stock/consumption`, `/stock/stocktake` trong Branch shell.
  3. Mở ledger tiêu hao và typed detail; đổi segmented view sang chứng từ thủ công.
  4. Kiểm `/stock/count-assignments`, `/stock/count-slips` và review bằng bottom sheet.
  5. Kiểm `/stock/waste`, `/stock/waste-approvals` và `/shift/leave-approvals`.
  6. Kiểm row actions, icon buttons, sheet footer, vùng chạm và không có cuộn ngang.
- `expected next step`: user vẫn hoàn tất được flow chính mà không cần desktop rescue
- `handoff`: không có; đây là wave ergonomics
- `success`:
  - action chính không phụ thuộc hover;
  - cột quan trọng không biến mất quá mức;
  - dialog và footer button vẫn nằm trong tầm thao tác.
- `blocked states`:
  - action ẩn;
  - icon-only không có nhãn hoặc quá khó hiểu;
  - modal dài, khó đóng, khó submit.
- `recovery`: nếu màn chưa đủ tốt cho mobile, phải log rõ là limitation, không ngầm coi là pass

## 7. Cross-Branch Operator Review Path

- `persona`: `owner`
- `site_kind`: cross-branch (`branch`)
- `device`: `desktop`
- `starting route`: `/inventory`
- `goal`: đọc inventory ops surfaces nhiều chi nhánh mà không bị dẫn vào procurement hay production sai scope
- `preconditions`:
  - role thuộc ACL `inventory` (owner, branch_manager, warehouse_manager, production_manager) và thấy được nhiều chi nhánh qua branch scope.
- `steps`:
  1. Kiểm nav lộ đúng surface theo quyền (`GRN`, `Supplier Invoice` chỉ khi có `inventory_procurement`; `Production` chỉ khi thuộc production roles — `branch_manager` own-branch theo D068, guard vẫn admit `production_manager`); không còn PO/supplier-return daily UI.
  2. Mở dashboard, stock, transfers, stocktake, reports.
  3. Kiểm data không null im lặng.
  4. Kiểm reports/alerts đọc được khi review nhiều chi nhánh.
- `expected next step`: user thấy rõ đây là review nhiều chi nhánh, không phải operator daily flow của một chi nhánh
- `handoff`: chuyển finding cho operator chi nhánh đúng vai
- `success`: đúng quyền, đúng nav, đúng mental model
- `blocked states`: route vào được nhưng trống/không giải thích, hoặc nav lộ sai vai trò
- `recovery`: redirect/forbidden và copy phải rõ ràng

## 8. Owner Oversight Path

- `persona`: `owner`
- `site_kind`: oversight (mọi inventory site trong tenant)
- `device`: `desktop`
- `starting route`: `/inventory`
- `goal`: xác nhận owner không bị UX dẫn thành operator kho hằng ngày
- `preconditions`:
  - owner qua ACL `inventory` nhưng layout ẩn procurement + production (`isOversightRole === owner`).
- `steps`:
  1. Mở dashboard và reports.
  2. Kiểm quick actions, nav emphasis, task queue wording.
  3. Kiểm owner không được dẫn như người trực tiếp chạy procurement/branch ops.
- `expected next step`: owner nên được dẫn về giám sát, không phải thao tác live workflow
- `handoff`: escalation cho operator đúng vai
- `success`: owner vẫn đọc được phần cần đọc nhưng UI không cổ vũ hành vi operator
- `blocked states`: dashboard và CTA trông y như branch operator
- `recovery`: log issue ở lớp UX/nav/task framing

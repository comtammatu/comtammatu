# Inventory SOP Router & Workflow Contract

> Date: 2026-05-09  
> Surface: `/inventory/*`  
> Primary user job: quản lý kho mở điện thoại, biết việc kế tiếp trong ca, thao tác chứng từ kho ít lần chạm nhất có thể.  
> Route family: Inventory App Router, responsive mobile-first.  
> Change type: IA/router contract, redirect aliases, navigation vocabulary, SOP-to-route mapping.  
> Primitives/runtime: Next.js App Router `page.tsx` redirects, `AppShell`, `AppPage`, shadcn primitives, URL search params for scope.

## 1. SOP Mental Model

Inventory không phải một dashboard số liệu. Đây là một chuỗi công việc vật lý:

```text
NCC -> PO -> GRN -> CW/CK stock
CW -> CK / Branch warehouse
CK production -> finished goods
CK -> Branch warehouse
Branch warehouse -> Branch kitchen
POS consumption -> stocktake / adjustment
```

Người quản lý kho không nghĩ theo module kỹ thuật. Họ nghĩ theo ca:

1. Hôm nay có gì cần xử lý ngay?
2. Hàng nào đang đến hoặc đang đi?
3. Có nhập hàng NCC nào phải kiểm nhận không?
4. Có cần cấp bếp trước giờ bán không?
5. Cuối ca còn lệch, hỏng, cận hạn, kiểm kê gì không?

Vì vậy router phải ưu tiên "việc trong ca" trước, rồi mới đến danh mục và cấu hình.

## 2. Four-Perspective Checkpoint

PM:
- Scope lần này là router/redirect/IA contract, không mở thêm ERP/WMS.
- Acceptance: route canonical rõ, alias cũ không 404, nav phản ánh 3 flow vận hành, mobile entry về đúng route.

BA:
- `branch_manager` không đi vào PO/GRN/NCC; họ nhận transfer và cấp bếp.
- PO, GRN, supplier invoice, supplier return thuộc procurement gate.
- `stock_issue(kitchen_use)` không được hồi sinh; cấp bếp đi qua intra-branch transfer.

Senior Dev:
- Source runtime nằm ở `apps/web/app/inventory/_lib/paths.ts`, `InventoryShell`, và `packages/shared/src/auth/route-resolution.ts`.
- Redirect alias dùng App Router page-level `redirect()` để giữ link cũ, không tạo namespace mobile mới.
- Scope tiếp tục đi qua URL query `branchId`, không localStorage/context.

QA/QC:
- Kiểm tra `/inventory/m`, `/inventory/m/drafts`, `/inventory/m/grn` redirect đúng.
- Kiểm tra `/inventory/drafts` và `/inventory/supplier-returns*` resolve về `inventory_procurement`.
- Chạy full gate `pnpm typecheck && pnpm lint && pnpm build`.

## 3. Canonical Route Map

### A. Hôm nay

| Route | Job |
| --- | --- |
| `/inventory` | Control tower theo ca: việc cần làm, flow chính, cảnh báo ưu tiên |
| `/inventory/dashboard` | Redirect về `/inventory` |

### B. Kiểm soát tồn

| Route | Job |
| --- | --- |
| `/inventory/stock` | Workbench tồn: xem tồn, cảnh báo, thao tác nhanh |
| `/inventory/stocktake` | Danh sách phiên kiểm kê |
| `/inventory/stocktake/new` | Mở phiên kiểm kê |
| `/inventory/stocktake/[id]` | Chi tiết phiên |
| `/inventory/stocktake/[id]/count` | Đếm thực tế |
| `/inventory/stocktake/[id]/escalate` | Xử lý lệch cần escalation |
| `/inventory/stocktake/conflicts` | Xử lý conflict kiểm kê |
| `/inventory/expiry` | Hạn dùng/cận date |
| `/inventory/issues` | Hao hụt, write-off, adjustment ledger |
| `/inventory/issues/[id]` | Chi tiết phiếu hao hụt/điều chỉnh |
| `/inventory/waste/new` | Tạo phiếu hao hụt nhanh |
| `/inventory/waste/approvals` | Duyệt waste tier 2 |
| `/inventory/reports` | Báo cáo movement/chênh lệch |

### C. Nhập, nhận, đối soát

| Route | Job |
| --- | --- |
| `/inventory/receiving` | Hub PO -> GRN -> hóa đơn NCC |
| `/inventory/purchase-orders` | Danh sách PO |
| `/inventory/purchase-orders/new` | Tạo PO |
| `/inventory/purchase-orders/[id]` | Chi tiết PO, thêm dòng nhanh |
| `/inventory/grn` | Danh sách GRN |
| `/inventory/grn/new` | Chọn NCC/PO để tạo GRN |
| `/inventory/grn/new/[supplierId]` | Tạo GRN theo NCC |
| `/inventory/grn/[id]` | Chi tiết GRN, kiểm nhận dòng |
| `/inventory/supplier-invoices` | Hóa đơn NCC và 3-way matching |
| `/inventory/supplier-returns` | Trả NCC sau QC/nhận hàng |
| `/inventory/supplier-returns/new` | Tạo phiếu trả NCC |
| `/inventory/supplier-returns/[id]` | Chi tiết phiếu trả NCC |
| `/inventory/drafts` | Draft GRN của tôi |

### D. Điều phối, sản xuất

| Route | Job |
| --- | --- |
| `/inventory/transfers` | Nhận hàng, xuất hàng, cấp bếp |
| `/inventory/transfers/[id]` | Chi tiết transfer |
| `/inventory/transfers/[id]/receive` | Kiểm nhận transfer |
| `/inventory/production` | Bếp trung tâm: BOM, lệnh sản xuất, thành phẩm |

### E. Danh mục và cấu hình

| Route | Job |
| --- | --- |
| `/inventory/ingredients` | Item master nguyên liệu/thành phẩm |
| `/inventory/suppliers` | Nhà cung cấp |
| `/inventory/recipes` | Định mức món bán cho POS consumption |
| `/inventory/settings` | Cài đặt kho |
| `/inventory/settings/expiry` | Cấu hình hạn dùng |
| `/inventory/settings/qc` | Cấu hình QC nhập kho |
| `/inventory/settings/thresholds` | Ngưỡng tồn |

## 4. Redirect Contract

| From | To | Reason |
| --- | --- | --- |
| `/inventory/dashboard` | `/inventory` | Dashboard cũ hợp nhất thành Hôm nay |
| `/inventory/m` | `/inventory` | Mobile-first là route mặc định, không cần namespace riêng |
| `/inventory/m/drafts` | `/inventory/drafts` | Draft GRN chuyển về route canonical |
| `/inventory/m/grn` | `/inventory/grn` | GRN mobile dùng responsive route canonical |

Redirect phải giữ query string, đặc biệt `branchId`.

## 5. UX Assessment

Những điểm đã đúng:
- `/inventory` đã bắt đầu đi theo 3 flow chính.
- PO/GRN/Transfer/BOM/Waste đã có bulk line input để giảm số lần chạm.
- Transfer của branch đã tách "Nhận" và "Cấp bếp" gần đúng SOP.

Những điểm cần tiếp tục:
- Detail pages cần thống nhất layout: header chứng từ, trạng thái, next action, lines, audit.
- Receiving hub cần trở thành điểm vào chính của PO/GRN/invoice, không chỉ là trang phụ.
- Supplier return và draft GRN phải nằm sau procurement gate, không rơi vào inventory general.
- Mobile first viewport phải luôn có "việc tiếp theo" hoặc CTA chính, không mở bằng bảng dài.

## 6. Next Implementation Waves

1. Route foundation: route contract, redirects, nav, ACL tests.
2. Detail standardization: PO, GRN, transfer, stocktake detail cùng cấu trúc.
3. Flow compression: bulk add/edit cho mọi line-heavy form, sticky submit, inline validation.
4. Operational QA: smoke redirect, permission gate, mobile viewport, then full build gate.

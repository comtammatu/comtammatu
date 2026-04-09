# M5 Inventory — UX Deep Redesign (Page-by-Page)

## Bối cảnh

Session trước đã hoàn thành navigation restructure (PR #10):

- Nav mới 7 items (không scroll) + mobile bottom sheet
- Dashboard "Việc cần làm" với actionable alert cards
- Hub pages: `/receiving` (stepper), `/stock`, `/settings` (tabs)
- Tất cả detail pages giữ nguyên URL

Session này: đi sâu redesign UX **từng page**, tiêu chí: **đầy đủ, tiện dụng, đơn giản**.

## Vấn đề chung cần fix xuyên suốt

### 1. Component monolith (P0)

6 file > 500 LOC cần tách nhỏ:

- `po-detail-client.tsx` (668 LOC) → PriceHistoryPanel, AddLineForm, LinkedGRNsSection
- `new-po-client.tsx` (698 LOC) → SuggestionsPanel, LineItemsSection, AddLineForm
- `grn-detail-client.tsx` (762 LOC) → AddLineForm, LineItemsTable, StatusStepper
- `transfers-list-client.tsx` (845 LOC) → CreateTransferDialog extract
- `stocktake-detail-client.tsx` (545 LOC) → CountingPhase, ResultsPhase
- `issue-detail-client.tsx` (643 LOC) → AddLineForm, LineItemsTable

### 2. Mobile responsiveness (P0)

Hầu hết tables dùng `hidden sm:table-cell` → mobile chỉ thấy 2-3 cột. Cần:

- Card-based layout cho mobile (< 640px)
- Hoặc horizontal scroll with sticky first column
- Action buttons LUÔN visible (không hover-only)

### 3. Loading & empty states (P1)

- Thêm Skeleton UI khi fetch data
- Empty states có CTA link (ví dụ: "Chưa có NCC? Thêm ngay →")

### 4. Accessibility (P1)

- Thêm `aria-label` cho icon-only buttons
- Badge dùng icon + text (không chỉ màu) cho colorblind users
- Action buttons always visible, không chỉ on hover

## Page-by-page redesign scope

### Nhóm 1: Luồng Nhập Kho (PO → GRN → Invoice) — Ưu tiên cao nhất

#### 1.1 PO List (`purchase-orders-client.tsx`)

**Hiện tại:** Search + table + create dialog. Thiếu filter.
**Cần làm:**

- Thêm filter: status dropdown, supplier dropdown
- Thêm status count badges trong header ("5 Nháp · 2 Đã gửi · 1 Nhận một phần")
- Action button always visible trên mobile (không hover-only)
- Responsive: card layout trên mobile

#### 1.2 PO Detail (`po-detail-client.tsx` — 668 LOC)

**Hiện tại:** Monolith. Price deviation khó nhìn. Add-line form không responsive.
**Cần làm:**

- Tách thành: `POHeaderCard`, `POLineItemsTable`, `AddLineForm`, `PriceHistoryPanel`, `LinkedGRNsSection`
- Price deviation: highlight rõ hơn (badge cảnh báo trên ingredient name)
- Mobile: card layout cho line items
- Thêm confirm dialog trước khi gửi PO ("Bạn có chắc gửi PO với X dòng, tổng Y VNĐ?")

#### 1.3 New PO (`new-po-client.tsx` — 698 LOC)

**Hiện tại:** Monolith. Suggestions panel tốt nhưng chưa sort theo urgency.
**Cần làm:**

- Tách: `SupplierSection`, `SuggestionsPanel`, `LineItemsSection`, `AddLineForm`
- Sort suggestions theo urgency (dưới reorder point trước)
- Add-line form responsive (stack trên mobile)
- Hiện tổng giá trị PO nổi bật
- Validate ≥1 line trước khi submit

#### 1.4 GRN List (`grn-list-client.tsx`)

**Hiện tại:** Tương đối ổn. Thiếu status counts.
**Cần làm:**

- Thêm status count badges
- Hiện PO number trên mobile (hiện đang hidden)
- Filter: status, supplier

#### 1.5 GRN Detail (`grn-detail-client.tsx` — 762 LOC)

**Hiện tại:** Monolith. Expiry date dual-mode gây nhầm lẫn. Mobile ẩn quá nhiều cột.
**Cần làm:**

- Tách: `GRNHeaderCard`, `StatusStepper`, `GRNLineItemsTable`, `AddGRNLineForm`
- Expiry date: đơn giản hóa (chỉ date picker, bỏ "X ngày" mode)
- Mobile: hiện batch + expiry (ẩn cost thay vì ẩn quality info)
- Thêm WAC impact preview trước confirm ("WAC sườn: 180,000 → 185,000 VNĐ/kg")
- Temperature field: reset khi đổi ingredient

#### 1.6 Supplier Invoices (`supplier-invoices-client.tsx` — 552 LOC)

**Hiện tại:** 11 cột, mobile chỉ thấy 4. Action hover-only.
**Cần làm:**

- Giảm cột mặc định: invoice #, supplier, total, matching status, payment status, actions
- Thêm filter: payment status, matching status, overdue toggle
- Action buttons always visible
- Thêm "overdue" badge nổi bật (đỏ) cho invoice quá hạn
- Mobile: card layout

### Nhóm 2: Vận hành kho

#### 2.1 Transfers List (`transfers-list-client.tsx` — 845 LOC)

**Hiện tại:** Create dialog cực kỳ phức tạp (role-based branching). Ingredient picker mở dialog riêng.
**Cần làm:**

- Extract `CreateTransferDialog` thành file riêng (giảm từ 845 → ~400 + ~450)
- Đơn giản hóa create flow: step 1 (chọn kho gửi/nhận) → step 2 (chọn nguyên liệu)
- Ingredient picker inline (không mở dialog riêng)
- Thêm "Copy phiếu trước" cho staff chuyển hàng lặp hàng tuần

#### 2.2 Transfer Detail (`transfer-detail-client.tsx`)

**Hiện tại:** Ổn. Picker mở dialog riêng. Print template có vấn đề a11y.
**Cần làm:**

- Ingredient picker inline
- Print template: `aria-hidden="true"`
- Thêm cảnh báo trước khi ship ("Xác nhận xuất X nguyên liệu từ kho Y?")

#### 2.3 Stocktake List (`stocktake-list-client.tsx`)

**Hiện tại:** Thiếu progress %. Create flow không nhất quán.
**Cần làm:**

- Hiện progress "X/Y đã đếm" và % ngay trong list
- Thống nhất create flow (luôn hiện dialog chọn branch)
- Thêm estimated time ("~15 phút cho 50 items")

#### 2.4 Stocktake Detail (`stocktake-detail-client.tsx` — 545 LOC)

**Hiện tại:** 2 UI modes (counting vs results) trong 1 component.
**Cần làm:**

- Tách: `CountingPhase` (form nhập số lượng) + `ResultsPhase` (bảng kết quả)
- Counting: thêm "đã lưu" indicator sau mỗi input blur
- Results: thêm variance legend (xanh <1%, vàng 1-5%, đỏ >5%)
- Mobile counting: card mode 1 item/screen (đã có spec trong m5-stock-enhancement.md)

#### 2.5 Issues List (`issues-list-client.tsx`)

**Hiện tại:** Thiếu issue type filter. Navigate sau create không có feedback.
**Cần làm:**

- Thêm issue type filter dropdown
- Show toast "Đã tạo phiếu PX-{id}" trước khi navigate

#### 2.6 Issue Detail (`issue-detail-client.tsx` — 643 LOC)

**Hiện tại:** Monolith. Picker label confusing. Cost mặc định 0.
**Cần làm:**

- Tách: `IssueHeaderCard`, `IssueLineItemsTable`, `AddIssueLineForm`
- Auto-fill cost từ ingredient master (WAC hoặc unit_cost)
- Make "reason" required field (audit trail)
- Hiện preview impact trước confirm ("Sẽ trừ X kg sườn từ kho Y")

### Nhóm 3: Cài đặt & Báo cáo

#### 3.1 Reports (`reports-client.tsx` — 400+ LOC)

**Hiện tại:** 4 reports trong 1 component. Không auto-load. Không có loading skeleton.
**Cần làm:**

- Tách mỗi report thành component riêng: `MovementReport`, `BranchSummaryReport`, `APAgingReport`, `VarianceReport`
- Auto-load khi click tab (không cần bấm "Xem báo cáo")
- Loading skeleton
- Thêm CSV export button
- AP Aging: ẩn date filter (không áp dụng)

#### 3.2 Ingredient Table (`ingredient-table.tsx`)

**Hiện tại:** Mobile chỉ thấy name + unit.
**Cần làm:**

- Mobile: thêm storage type badge (quan trọng cho nhận hàng)
- Search: hỗ trợ tìm theo SKU
- Thêm filter: category, storage type, active/inactive

#### 3.3 Ingredient Form Dialog (`ingredient-form-dialog.tsx`)

**Hiện tại:** 9 fields, thiếu validation min < max.
**Cần làm:**

- Validate: min_stock < max_stock, reorder_point between min/max
- Help text cho reorder point ("Khi tồn dưới mức này, hệ thống sẽ cảnh báo")
- Group fields: "Thông tin" (name, SKU, unit, category) + "Kho" (storage, shelf life) + "Mức tồn" (min, max, reorder)
- Cost step = 1 (thay vì 1000)

#### 3.4 Suppliers (`suppliers-client.tsx`)

**Hiện tại:** Thiếu validation phone/tax code. Không có "last PO date".
**Cần làm:**

- Phone validation (10-11 digits)
- Inline active/inactive toggle (không cần mở dialog)
- Thêm "Đơn hàng gần nhất" column

#### 3.5 Recipes (`recipes-client.tsx`)

**Hiện tại:** Yield factor UI gây nhầm (0.85 vs 15%).
**Cần làm:**

- Yield input hiện "% hao hụt" (15) thay vì factor (0.85) — convert nội bộ
- Thêm tooltip giải thích: "15% = cần mua 1.18kg để có 1kg thành phẩm"
- Thêm "Copy công thức" button

#### 3.6 Expiry List (`expiry-list-client.tsx`)

**Hiện tại:** Write-off dialog thiếu current stock qty. Tab "Near" gộp critical + warning.
**Cần làm:**

- Hiện current stock qty trong write-off dialog
- Tách tab: "Đã hết hạn" | "Nguy hiểm (<3 ngày)" | "Cảnh báo (3-7 ngày)"
- Thêm batch info rõ hơn

## Ràng buộc (giữ nguyên từ session trước)

- KHÔNG thay đổi server actions, database schema, hoặc business logic
- CHỈ thay đổi: component structure, UI layout, form validation (client-side)
- Giữ nguyên tất cả ACL rules
- `pnpm typecheck && pnpm lint && pnpm build` PHẢI pass
- Follow CLAUDE.md constraints
- NO-ARBITRARY-DIMENSIONS regression rule
- Không import barrel `@comtammatu/database` trong "use client"

## Execution order đề xuất

1. **PO + GRN flow** (cao nhất — daily use cho thủ kho HQ)
2. **Transfers** (cao — daily use cho tất cả branches)
3. **Stocktake + Issues** (trung bình — weekly/monthly)
4. **Reports** (trung bình — weekly review)
5. **Settings pages** (thấp — setup once)

## Cách tiếp cận

Mỗi nhóm page có thể là 1 session riêng:

- Session A: PO list + PO detail + New PO + GRN list + GRN detail + Invoices (6 pages)
- Session B: Transfers list + detail + Stocktake list + detail + Issues list + detail (6 pages)
- Session C: Reports + Ingredients + Recipes + Suppliers + Expiry (5 pages)

Hoặc gộp 2-3 sessions nếu thay đổi nhỏ.

## Definition of Done (cho toàn bộ redesign)

- [ ] Tất cả monolith components (>500 LOC) đã tách thành sub-components
- [ ] Tất cả tables có responsive layout trên mobile (card hoặc horizontal scroll)
- [ ] Action buttons always visible (không hover-only)
- [ ] Loading skeleton cho async data
- [ ] Empty states có CTA link hướng dẫn
- [ ] Form validation client-side đầy đủ
- [ ] Status filter + count badges trên tất cả list pages
- [ ] `/verify` passes
- [ ] Tất cả existing functionality vẫn hoạt động

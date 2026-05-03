# UI/UX Markdown Layout Map

> Created: 2026-05-02
> Status: planning contract before runtime UI rebuild
> Scope: all user-facing route families in `apps/web/app`

## Purpose

This document is the markdown-first layout map for the frontend rebuild. It turns the current route tree into shared page structures before touching runtime components.

Use it together with:

- `docs/spec/design-system.md`
- `docs/modules/ui.md`
- `docs/plan/ui-ux-rebuild.md`
- `docs/plan/ui-ux-page-contracts.md`
- `docs/ref/glossary.md`
- `tasks/regressions.md`

Workflow note: this is a documentation-only planning artifact, so the 4-agent debate is skipped under `docs/agent/rules/workflow.md`.

## Authority

When this document and older planning notes disagree, follow the source order in `docs/spec/design-system.md`.

Locked runtime:

- shadcn preset `radix-lyra`
- base color `neutral`
- icon library `lucide`
- shared primitives from `packages/ui/src/components/*`
- Vietnamese utility copy from glossary and shared label dictionaries

Important conflict resolution: older planning drafts may mention `stone` or `tabler`. This layout map follows the locked design system: `neutral` and `lucide`.

## Global Layout Rules

Every route family must declare:

- Surface
- Primary user job
- Route family
- Change type: visual refactor, UX flow, copy, behavior
- Primitives used
- First viewport promise

Shared visual rules:

- One source of truth for the same workflow state.
- Mobile layout is the baseline.
- Desktop may add density but not a different information architecture.
- Search, filters, counts, and bulk actions live in one toolbar.
- Tables stay tables on desktop; mobile uses `Item`, `ItemGroup`, `Card`, `Drawer`, or task rows when a compressed table would be unreadable.
- `Card` is for repeated items, framed tools, modals, and detail sections, not for nesting whole page sections inside decorative cards.
- Empty, loading, blocked, and error states use `Empty`, `Skeleton`, `Spinner`, `Alert`, or approved wrappers.
- Destructive actions are separated from primary actions and use `AlertDialog`.

## Common Shells

### Shell A - Management Workspace

Used by:

- `/admin/*`
- `/menu`
- `/orders`
- `/finance/*`
- `/hr/*`

Runtime base: `AppShell`.

```text
+--------------------------------------------------------------------------------+
| Sidebar: brand, nav groups, user, sign-out                                      |
+---------------------------+----------------------------------------------------+
| Nav group A               | Breadcrumb / scope badges                 Actions  |
| - Active route            | Page title                                         |
| - Sibling route           | Short operational description if useful           |
|                           +----------------------------------------------------+
| Nav group B               | Toolbar: search/filter/count/bulk action          |
| - Child route             +----------------------------------------------------+
|                           | Primary content: table/list/detail/workflow        |
| Footer: user + sign out   | Empty/loading/error state in same content slot     |
+---------------------------+----------------------------------------------------+
```

Rules:

- The shell header owns page identity. Page content must not add a second hero card with the same title.
- Page-level descriptions are allowed only when they change the user's next decision.
- Route nav should come from `nav-config.ts` or shell constants, not page-local ad hoc sidebars.
- Detail pages use breadcrumbs or path-derived title, then summary/action/tabs inside content.

### Shell B - Inventory Workspace

Used by `/inventory/*`.

Runtime base: `InventoryShell`.

```text
+--------------------------------------------------------------------------------+
| Sidebar: site selector, workflow nav groups, user, sign-out                     |
+----------------------------+---------------------------------------------------+
| Điểm vào                   | Sticky InventoryHeader: title, site, actions      |
| 1 · Kiểm soát tồn          +---------------------------------------------------+
| 2 · Nhập/Nhận/Đối soát     | Next-action strip / blocker                       |
| 3 · Điều phối/Sản xuất     +---------------------------------------------------+
| Danh mục                   | Main workflow: queue, document, table, form       |
+----------------------------+---------------------------------------------------+
```

Mobile inventory routes use `/inventory/m/*` with `MobileTopBar` and task-first pages.

Rules:

- Scope stays in `?branchId=` only.
- First viewport answers: site nào, việc gì cần làm, nút chính là gì.
- Detail pages have four zones: summary, line items, blockers/exceptions, timeline/audit.
- No "sửa tồn tay" default path. Thay đổi tồn đi qua GRN, transfer, issue/waste, production, stocktake, or audited RPC.

### Shell C - Frontline Full Screen

Used by:

- `/br/[branchId]/pos`
- `/br/[branchId]/kds`

```text
+--------------------------------------------------------------------------------+
| Compact operational header: branch/session/station/current state/actions        |
+--------------------------------------------------------------------------------+
| Primary task surface                                                            |
| POS: menu + new-order cart / order detail                                       |
| KDS: live queue + station/status/order-type filters                             |
+--------------------------------------------------------------------------------+
| Mobile bottom/drawer actions only when they keep the primary task visible       |
+--------------------------------------------------------------------------------+
```

Rules:

- These are operational tools, not dashboards.
- First mobile viewport shows the next safe action or live queue.
- Once context is locked, chrome compresses.
- Keyboard shortcuts use `Kbd`/`KbdGroup` hints only when wired.

### Shell D - Cổng Nhân Viên

Used by `/employee/*`.

```text
+--------------------------------+
| Narrow shell / mobile header    |
+--------------------------------+
| Today task                      |
| Primary action                  |
+--------------------------------+
| Next shift / personal summary   |
+--------------------------------+
| Compact self-service links      |
+--------------------------------+
```

Rules:

- The portal is self-service, not a second admin workspace.
- First viewport shows clock state or next shift.
- POS/KDS/admin links are secondary handoffs, only when access allows.

### Shell E - Standalone System State

Used by:

- `/login`
- `/access-denied`
- `/notifications` until it gets a shell

```text
+----------------------------------------+
| Single task card or narrow content area |
| Primary state                           |
| Primary action                          |
| Secondary recovery/action               |
+----------------------------------------+
```

Rules:

- Do not add marketing hero/layout chrome.
- Errors must be safe Vietnamese copy.
- Access-denied remains presentation-only.

## Standard Page Structures

### List / Index Page

```text
+--------------------------------------------------------------------------------+
| Header: title, scope, primary action                                            |
+--------------------------------------------------------------------------------+
| Toolbar: search | filters | status tabs | count | bulk action                   |
+--------------------------------------------------------------------------------+
| Desktop: Table                                                                  |
| Mobile: ItemGroup / Drawer actions                                              |
+--------------------------------------------------------------------------------+
| Empty/Loading/Error in the same slot                                             |
+--------------------------------------------------------------------------------+
```

Use:

- `Table`, `DataTable` wrappers where already used
- `InputGroup`, `Select`, `Tabs`, `ToggleGroup`
- `Badge` for status/count
- `Empty`, `Spinner`, `Skeleton`

### Detail Page

```text
+--------------------------------------------------------------------------------+
| Breadcrumb / back | entity title | status badge                 Primary action  |
+--------------------------------------------------------------------------------+
| Summary: owner, site/branch, totals, dates, current state                        |
+--------------------------------------------------------------------------------+
| Blockers / exceptions / next action                                              |
+--------------------------------------------------------------------------------+
| Tabs: Tổng quan | Dòng | Lịch sử                                                |
+--------------------------------------------------------------------------------+
| Secondary actions                                      Destructive actions       |
+--------------------------------------------------------------------------------+
```

Use:

- `Badge` for status
- `Tabs` for overview/lines/history
- `Table` for line-heavy sections
- `Alert` for blockers
- `AlertDialog` for destructive actions

### Short Form

```text
+------------------------------------+
| Dialog/Sheet title                 |
| FieldGroup                         |
| Field errors inline                |
| [Cancel]                 [Submit]  |
+------------------------------------+
```

Use `Dialog` or `Sheet` with shared form helpers.

### Long Form / Line Array

```text
+--------------------------------------------------------------------------------+
| Page title / draft status / save actions                                         |
+--------------------------------------------------------------------------------+
| Header fields                                                                    |
+--------------------------------------------------------------------------------+
| Line table with inline validation                                                |
+--------------------------------------------------------------------------------+
| Totals / blockers / submit                                                       |
+--------------------------------------------------------------------------------+
```

Use a page, not a cramped dialog.

### Operational Drawer

```text
+--------------------------------+
| Drawer title                   |
| Context summary                |
+--------------------------------+
| Focused content                |
+--------------------------------+
| Sticky action row              |
+--------------------------------+
```

Use for mobile POS cart, active orders, KDS detail if needed, and compact inventory mobile actions.

## Module Map

| Module | Route family | Shell | Primary job |
| --- | --- | --- | --- |
| Auth | `/login` | E | Staff signs in and reaches role default |
| Access state | `/access-denied` | E | Explain blocked route and recovery |
| Admin | `/admin/*` | A | Tenant/foundation management |
| Menu | `/menu` | A | Manage menu catalog |
| Orders | `/orders` | A | Search orders, refunds, payment review |
| POS | `/br/[branchId]/pos` | C | Create orders and handle order lifecycle |
| KDS | `/br/[branchId]/kds` | C | Process live kitchen queue |
| Branch settings | `/br/[branchId]/settings*` | E/A-lite | Branch floor devices and limits |
| Inventory | `/inventory/*` | B | Tồn kho, procurement, transfer, production, control |
| Finance | `/finance/*` | A | Revenue, journals, statements, period controls |
| HR | `/hr/*` | A | Staff records, shifts, attendance, payroll |
| Employee | `/employee/*` | D | Self-service workday tasks |
| Notifications | `/notifications` | E | Durable action feed |

## Auth And System State

### `/login`

Primary job: enter credentials and redirect by claims.

```text
+----------------------------------------+
| Cơm Tấm Má Tư                          |
| Đăng nhập                              |
| Email                                  |
| [ input ]                              |
| Mật khẩu                               |
| [ input ]                              |
| [ Đăng nhập ]                          |
| Alert error if any                     |
+----------------------------------------+
```

Rules:

- One task card.
- `Alert` for errors.
- `Spinner` inside submit while pending.
- No role picker.
- No decorative trust cards.

### `/access-denied`

Primary job: understand why route is blocked and recover.

```text
+----------------------------------------+
| Badge: Quyền truy cập                  |
| Title from blocked-state copy          |
| Safe description                       |
| Next step / blocked path               |
| [ Về trang mặc định ] [ Đăng nhập lại ]|
+----------------------------------------+
```

Rules:

- Presentation only. No auth or redirect policy in UI.
- Copy comes from blocked-state helpers.

### `/notifications`

Primary job: review durable cross-role or follow-up notifications.

```text
+----------------------------------------+
| Thông báo                              |
| Filter: Tất cả | Chưa đọc | Cần xử lý |
+----------------------------------------+
| ItemGroup                              |
| - severity badge, title, context       |
| - action link, timestamp               |
+----------------------------------------+
| Empty state                            |
+----------------------------------------+
```

Rules:

- Use `ItemGroup` rather than a custom feed.
- Notification is not a toast replacement.

## Admin Module

Route family:

- `/admin`
- `/admin/dashboard`
- `/admin/staff`
- `/admin/staff/[id]/permissions`
- `/admin/staff/audit`
- `/admin/settings/*`
- `/admin/inventory/*`
- `/admin/reports/*`
- `/admin/accounting/periods`
- `/admin/crm`

### Khung Quản Trị

```text
+--------------------------------------------------------------------------------+
| Sidebar groups: Điều hành, Quản lý                                              |
+---------------------------+----------------------------------------------------+
| Tổng quan vận hành        | Breadcrumb: Quản trị / current module             |
| Báo cáo                   | Title from active route                           |
| Nhân viên                 | Actions: Cổng nhân viên, Báo cáo                  |
| Cấu hình kho              +----------------------------------------------------+
| Kỳ kế toán                | Page content                                       |
| Cài đặt                   |                                                    |
+---------------------------+----------------------------------------------------+
```

Rules:

- No duplicated `PageHero` inside admin pages.
- Admin pages use the same header, toolbar, table, empty-state rhythm.
- ACL/nav/page guards/server actions must agree.

### `/admin/dashboard`

Primary job: open the next management surface or review critical operations.

```text
+--------------------------------------------------------------------------------+
| Toolbar: scope / refresh                                                        |
+--------------------------------------------------------------------------------+
| Action links: Cài đặt, Nhân viên, Báo cáo, Cấu hình kho                         |
+--------------------------------------------------------------------------------+
| Operational snapshot: recent orders, blockers, branch health                    |
+--------------------------------------------------------------------------------+
```

Do:

- Use `SurfaceLinkCard` or `ItemGroup` for quick access.
- Keep only metrics that support a management decision.

Do not:

- Add hero copy or decorative count badges.

### `/admin/staff`

Primary job: manage staff records.

```text
+--------------------------------------------------------------------------------+
| Toolbar: search | role | branch | status | count | [Thêm nhân viên]             |
+--------------------------------------------------------------------------------+
| Staff table: name, position, branch, status, actions                            |
+--------------------------------------------------------------------------------+
| Dialog: create/edit staff                                                       |
+--------------------------------------------------------------------------------+
```

Use `Table`, `Badge`, `Select`, `Input`, `FormDialog`, `DropdownMenu`.

### `/admin/staff/[id]/permissions`

Primary job: grant/revoke permissions safely.

```text
+--------------------------------------------------------------------------------+
| Staff summary: name, position, branch, owner protection                         |
+--------------------------------------------------------------------------------+
| Tabs: Đang có quyền | Có thể cấp | Lịch sử                                      |
+--------------------------------------------------------------------------------+
| Permission rows: key, meaning, branch scope, valid window, action               |
+--------------------------------------------------------------------------------+
| AlertDialog for grant/revoke                                                    |
+--------------------------------------------------------------------------------+
```

Rules:

- Owner permissions remain protected.
- Audit trail is visible or linked.
- Grant/revoke copy uses permission wording, not role-only wording.

### `/admin/settings/*`

Primary job: configure tenant and branch-floor settings.

```text
+--------------------------------------------------------------------------------+
| Settings tabs: Chung | Chi nhánh | Khu vực | Bàn | POS | KDS | Thanh toán       |
+--------------------------------------------------------------------------------+
| Toolbar: branch scope when needed | primary action                              |
+--------------------------------------------------------------------------------+
| Table/list/form content                                                        |
+--------------------------------------------------------------------------------+
```

Rules:

- Tenant strategy pages: branches, general, payments, areas.
- Branch-floor pages: tables, POS, KDS, printers.
- Branch scope is URL-addressable.
- Use `Tabs` or `ToggleGroup`, not custom pill navigation.

### `/admin/inventory/*`

Primary job: inventory policy and configuration, not daily stock operations.

```text
+--------------------------------------------------------------------------------+
| Policy tool tabs: Feature flags | Cold-chain | Express windows | Trust          |
+--------------------------------------------------------------------------------+
| Tool-specific toolbar: branch/category/user filter                              |
+--------------------------------------------------------------------------------+
| Policy table / form / audit result                                              |
+--------------------------------------------------------------------------------+
```

Rules:

- Clearly label as `Cấu hình kho`.
- Operational stock work remains under `/inventory/*`.
- Fine-grained permissions are documented per action.

### `/admin/reports/*`

Primary job: executive reporting.

```text
+--------------------------------------------------------------------------------+
| Toolbar: date range | branch filter | export                                    |
+--------------------------------------------------------------------------------+
| Report summary row                                                               |
+--------------------------------------------------------------------------------+
| Chart/table content                                                              |
+--------------------------------------------------------------------------------+
| Drilldown link rows                                                              |
+--------------------------------------------------------------------------------+
```

Rules:

- Report filters are URL-addressable.
- Materialized views are accessed through SECURITY DEFINER functions.
- Revenue buckets use paid-at local timezone rules.

### `/admin/accounting/periods`

Primary job: review period state and control reopen/close.

```text
+--------------------------------------------------------------------------------+
| Current period state | blockers | policy dates                                  |
+--------------------------------------------------------------------------------+
| Table: period, status, soft close, hard close, actions                          |
+--------------------------------------------------------------------------------+
| AlertDialog: reopen/control action                                              |
+--------------------------------------------------------------------------------+
```

Rules:

- UI never bypasses database period policy.
- High-risk actions require explicit confirmation.

### `/admin/crm`

Primary job: future customer management placeholder.

```text
+--------------------------------------------------------------------------------+
| Empty: Khách hàng chưa mở                                                       |
| [Back to admin]                                                                 |
+--------------------------------------------------------------------------------+
```

Rules:

- Do not expand CRM without a separate business contract.

## Menu Module

Route family: `/menu`.

Primary job: manage menu categories, menu items, variants, images, active state, import/export.

Target:

```text
+--------------------------------------------------------------------------------+
| Shell header: Thực đơn                                      [Import/Export]     |
+--------------------------------------------------------------------------------+
| Toolbar: search món | category filter | active status | [Thêm món]              |
+--------------------------------------------------------------------------------+
| Tabs: Món bán (count) | Danh mục (count)                                        |
+--------------------------------------------------------------------------------+
| Món bán table: image, name, category, price, active, sort, actions              |
+--------------------------------------------------------------------------------+
| Danh mục table: name, type, sort, active, actions                               |
+--------------------------------------------------------------------------------+
```

Rules:

- Remove duplicated `PageHero`; shell header owns identity.
- Count chips inside tabs use `Badge` or approved tab count pattern, not raw span styling.
- Item/category dialogs use form helpers.
- Image input stays inside item form, not list rows.
- Menu route is tenant-wide catalog, not branch daily limit.

## Orders Module

Route family: `/orders`.

Primary job: search and inspect completed/current sales orders, refunds, and payment state.

Target:

```text
+--------------------------------------------------------------------------------+
| Shell header: Đơn hàng bán                                 [Báo cáo]            |
+--------------------------------------------------------------------------------+
| Tabs: Đơn hàng | Hoàn tiền (pending badge)                                      |
+--------------------------------------------------------------------------------+
| Toolbar: search | branch | status | payment | date range                        |
+--------------------------------------------------------------------------------+
| Orders table/list                                                               |
+--------------------------------------------------------------------------------+
| Order detail Sheet: summary, items, payment, invoice, audit                     |
+--------------------------------------------------------------------------------+
```

Refund tab:

```text
+--------------------------------------------------------------------------------+
| Toolbar: status | date | branch                                                 |
+--------------------------------------------------------------------------------+
| Refund table: order, amount, reason, status, requested by, action               |
+--------------------------------------------------------------------------------+
| AlertDialog: approve/reject when permitted                                      |
+--------------------------------------------------------------------------------+
```

Rules:

- Orders module is review/exception handling. POS remains the selling surface.
- Refunds are not cancel-order actions.
- Payment and refund mutations follow server/RPC contracts.
- No duplicated hero card inside `AppShell`.

## POS Module

Route family: `/br/[branchId]/pos`.

Primary job: open session, select order context, create new order, then manage submitted orders from detail/history.

Existing detailed contract: `docs/plan/ui-ux-page-contracts.md` section `/br/[branchId]/pos`.

### End-to-end Flow

```text
1. Proxy gate
2. No session -> open ca POS
3. Session open -> choose table or takeaway
4. Menu -> customizer -> Giỏ đơn mới -> Đặt món
5. After submit -> order history/detail
6. Existing order -> thêm món / phục vụ / thanh toán / chuyển bàn / hủy
7. Close shift -> cash reconciliation
```

### State A - No Session

```text
+----------------------------------------+
| POS                                    |
| Mở ca POS                              |
| Máy POS                                |
| [ Select ]                             |
| Tiền đầu ca                            |
| [ Money input ]                        |
| [ Mở ca ]                              |
| Alert / Empty if blocked               |
+----------------------------------------+
```

### State B - Choose Context

```text
+--------------------------------------------------------------------------------+
| POS - Quầy 1 - Chưa chọn bàn                                   [Đóng ca]       |
+--------------------------------------------------------------------------------+
| ToggleGroup: Tại bàn | Mang về                                                   |
+-----------------------------------------------+--------------------------------+
| Table grid by zone                             | Đơn đang phục vụ              |
| Available/occupied table buttons               | Item rows + detail/payment    |
+-----------------------------------------------+--------------------------------+
```

### State C - New Order

```text
+--------------------------------------------------------------------------------+
| POS - Quầy 1 - Bàn 12 / Mang về - 4 đơn đang phục vụ             [Đóng ca]      |
+---------------------------------------------------+----------------------------+
| Search | menu tabs | category tabs                | Tabs: Đơn mới | Đang phục vụ|
| Menu item cards/buttons                           | Giỏ đơn mới                 |
| Add/customize actions                             | Items, note, total, Đặt món |
+---------------------------------------------------+----------------------------+
```

Mobile:

```text
+--------------------------------+
| POS - Bàn 12       [Đóng ca]   |
+--------------------------------+
| Search | tabs                   |
| Menu items                      |
| Sticky actions: Đang phục vụ | Giỏ |
+--------------------------------+
| Drawer: cart OR active orders  |
+--------------------------------+
```

Rules:

- `Giỏ đơn mới` is only for new-order creation.
- Existing order mutations never live in the cart.
- Destructive order actions require permission and `AlertDialog`.

## KDS Module

Route family: `/br/[branchId]/kds`.

Primary job: chef sees live ticket queue, filters by station/status/order type, marks ready, and recalls when allowed.

Runtime structure:

- `KdsBoard`
- `BoardHeader`
- `UnassignedBanner`
- `StationToggleBar`
- `FilterBar`
- `OrderGrid`
- `OrderCard`
- `TicketRow`

### End-to-end Flow

```text
1. Proxy gate branch scope
2. Load active KDS stations
3. Load pending/preparing/ready tickets
4. Subscribe realtime
5. Filter station/status/order type
6. Cook ticket -> mark ready
7. Recall ready ticket if permission allows
8. Clear filters with Escape
```

### Target Layout

```text
+--------------------------------------------------------------------------------+
| KDS - CN Đất Đỏ                      Chờ: 12       Mode toggle      [Refresh]   |
+--------------------------------------------------------------------------------+
| Alert: 3 món chưa phân trạm                                      [Lọc ngay]    |
+--------------------------------------------------------------------------------+
| Station ToggleGroup: Tất cả (12) | Nướng (5) | Bếp nóng (4) | Nước (3)         |
+--------------------------------------------------------------------------------+
| FilterBar: Trạng thái | Loại đơn | Count | [Xóa lọc]                           |
+--------------------------------------------------------------------------------+
| OrderGrid                                                                      |
| +-----------------------+ +-----------------------+ +-----------------------+   |
| | Ticket #K12           | | Ticket #K13           | | Ticket #K14           |   |
| | Bàn 05 / Tại bàn      | | Mang về               | | Bàn 08               |   |
| | AgeBadge              | | AgeBadge              | | AgeBadge             |   |
| | 2x Cơm sườn           | | 1x Nước mía           | | 1x Canh thêm         |   |
| | [Đang làm] [Sẵn sàng] | | [Sẵn sàng]            | | [Sẵn sàng]           |   |
| +-----------------------+ +-----------------------+ +-----------------------+   |
+--------------------------------------------------------------------------------+
```

Mobile:

```text
+--------------------------------+
| KDS             Chờ: 12        |
+--------------------------------+
| Station horizontal toggle      |
| Filters as compact Sheet       |
+--------------------------------+
| Ticket cards, one column       |
| Large ready action             |
+--------------------------------+
```

Rules:

- Queue is primary content.
- Urgency/status has one source of truth per ticket.
- Station and filters are compact and reversible.
- `Sẵn sàng` requires `kds:mark_ready`.
- `Gọi lại` requires `kds:recall`.
- Do not add dashboard cards above the queue.

## Branch Settings And Daily Limits

Route family:

- `/br/[branchId]/settings`
- `/br/[branchId]/settings/*`
- `/br/[branchId]/menu-limits`

Primary job: configure branch floor, devices, KDS/POS settings, printers, and same-day item quotas.

### Settings Hub

```text
+--------------------------------------------------------------------------------+
| Back: Cổng nhân viên / Admin | Thiết lập chi nhánh | branch name               |
+--------------------------------------------------------------------------------+
| Tile grid                                                                        |
| - Thực đơn                                                                        |
| - Khu vực                                                                         |
| - Bàn                                                                             |
| - POS                                                                             |
| - Ca POS                                                                          |
| - Máy in                                                                          |
| - Trạm bếp (KDS)                                                                  |
| - Hạn mức bán hàng ngày                                                           |
+--------------------------------------------------------------------------------+
```

Rules:

- Tile grid is acceptable because this is a hub.
- HQ/central warehouse/central kitchen branch kinds must show only relevant settings.
- Use `Card` + `Button asChild`, but avoid rounded custom visual systems outside primitive contract.

### `/br/[branchId]/menu-limits`

Primary job: set today's per-item quota or temporarily disable item at branch.

```text
+--------------------------------------------------------------------------------+
| Back: Cài đặt chi nhánh | Hạn mức bán hàng ngày | branch + business date       |
+--------------------------------------------------------------------------------+
| Alert: reset and quota behavior                                                  |
+--------------------------------------------------------------------------------+
| Toolbar: search | category | status                                             |
+--------------------------------------------------------------------------------+
| Table: món, sold_today, limit, còn lại, tắt món, actions                         |
+--------------------------------------------------------------------------------+
```

Rules:

- This is operational and date-scoped.
- Copy must reflect daily reset and quota release on cancel/reduce when implemented.
- POS/KDS visible states should use the same quota status wording.

## Inventory Module

Route family:

- `/inventory`
- `/inventory/dashboard`
- `/inventory/stock`
- `/inventory/expiry`
- `/inventory/issues/*`
- `/inventory/purchase-orders/*`
- `/inventory/receiving`
- `/inventory/grn/*`
- `/inventory/supplier-invoices`
- `/inventory/supplier-returns/*`
- `/inventory/supplier-credit-notes`
- `/inventory/transfers/*`
- `/inventory/production`
- `/inventory/stocktake/*`
- `/inventory/ingredients`
- `/inventory/suppliers`
- `/inventory/recipes`
- `/inventory/reports`
- `/inventory/settings/*`
- `/inventory/m/*`

Primary job: run stock operations by site with clear next actions, document state, blockers, and audit.

### Inventory Home `/inventory`

```text
+--------------------------------------------------------------------------------+
| Hôm nay - CN Đất Đỏ                                         [Tạo nhanh] [Refresh]|
+--------------------------------------------------------------------------------+
| Việc cần làm ngay                                                              |
| [GRN cần chốt] [Transfer cần nhận] [Waste cần duyệt] [Kiểm kê mở] [Hết hạn]     |
+------------------------------------------+-------------------------------------+
| Tồn theo location                         | Cảnh báo ưu tiên                    |
| Kho CN / Bếp CN / Đang vận chuyển         | Hết hàng / sắp hết hạn / treo       |
+------------------------------------------+-------------------------------------+
| Dòng việc mới nhất: PO, GRN, Transfer, Stocktake, Issue                         |
+--------------------------------------------------------------------------------+
```

Rules:

- Command center, not KPI dashboard.
- Counts link to filtered lists.
- First viewport shows work due now.

### Tồn Kho `/inventory/stock`

```text
+--------------------------------------------------------------------------------+
| Tồn kho / Tồn cần xử lý                                      [Xuất báo cáo]     |
+--------------------------------------------------------------------------------+
| Toolbar: site | search SKU | category | status | below-min | expiry risk        |
+--------------------------------------------------------------------------------+
| Table: item, location, on hand, reserved, WAC, min, status, action              |
+--------------------------------------------------------------------------------+
| Detail Sheet: stock summary, movements, related documents                       |
+--------------------------------------------------------------------------------+
```

### Expiry `/inventory/expiry`

```text
+--------------------------------------------------------------------------------+
| Hạn sử dụng                                                                     |
+--------------------------------------------------------------------------------+
| Tabs: Hôm nay | 3 ngày | 7 ngày | Đã hết hạn                                    |
+--------------------------------------------------------------------------------+
| Table/List: item, lot, qty, value, days left, recommended action                |
+--------------------------------------------------------------------------------+
| Actions: tạo transfer | tạo waste | đánh dấu đã xem                             |
+--------------------------------------------------------------------------------+
```

### Issues And Waste

Routes:

- `/inventory/issues`
- `/inventory/issues/[id]`
- `/inventory/waste/new`
- `/inventory/waste/approvals`
- `/inventory/waste/auto`

List:

```text
+--------------------------------------------------------------------------------+
| Hao hụt/điều chỉnh                                                              |
+--------------------------------------------------------------------------------+
| Toolbar: site | reason | approval status | date                                 |
+--------------------------------------------------------------------------------+
| Table: document, item count, WAC impact, reason, requester, status, action      |
+--------------------------------------------------------------------------------+
```

New waste:

```text
+--------------------------------------------------------------------------------+
| Tạo hao hụt                                                                     |
+--------------------------------------------------------------------------------+
| Site | item search | qty | reason | evidence | WAC impact                       |
+--------------------------------------------------------------------------------+
| Gate panel: tier, photo required, approval required, shift cap                  |
+--------------------------------------------------------------------------------+
| [Lưu nháp] [Gửi]                                                                |
+--------------------------------------------------------------------------------+
```

Rules:

- WAC impact is displayed but not user-editable.
- Evidence requirements are explicit before submit.
- Approval queue shows cost impact before approve/reject.

### Procurement: PO -> GRN -> Invoice

Routes:

- `/inventory/purchase-orders`
- `/inventory/purchase-orders/new`
- `/inventory/purchase-orders/[id]`
- `/inventory/receiving`
- `/inventory/grn`
- `/inventory/grn/[id]`
- `/inventory/supplier-invoices`
- `/inventory/supplier-returns/*`
- `/inventory/supplier-credit-notes`

End-to-end:

```text
1. Reorder alert or procurement list
2. Create PO
3. Send PO
4. Create GRN from PO or receiving queue
5. Enter actual received lines and QC
6. Confirm GRN and preview stock/WAC impact
7. Match supplier invoice
8. Return / credit note if needed
```

PO list:

```text
+--------------------------------------------------------------------------------+
| Đơn đặt hàng NCC                                            [Tạo PO]            |
+--------------------------------------------------------------------------------+
| Toolbar: supplier | status | site | date | search                               |
+--------------------------------------------------------------------------------+
| Table: PO, supplier, receiving site, value, status, next action                 |
+--------------------------------------------------------------------------------+
```

PO detail:

```text
+--------------------------------------------------------------------------------+
| PO-001 | status badge | supplier | receiving site             [Gửi] [Tạo GRN]  |
+--------------------------------------------------------------------------------+
| Summary: value, due date, received progress                                      |
+--------------------------------------------------------------------------------+
| Blockers/exceptions                                                              |
+--------------------------------------------------------------------------------+
| Tabs: Dòng hàng | GRN liên quan | Lịch sử                                       |
+--------------------------------------------------------------------------------+
```

GRN detail:

```text
+--------------------------------------------------------------------------------+
| GRN-001 | status badge | supplier | site                         [Chốt nhập]   |
+--------------------------------------------------------------------------------+
| PO lines vs actual receive lines                                                |
+--------------------------------------------------------------------------------+
| Variance panel: price/qty/QC, baseline, required checks                         |
+--------------------------------------------------------------------------------+
| Tác động tồn: +qty, WAC, movement                                               |
+--------------------------------------------------------------------------------+
| Tabs: Dòng nhập | Đối soát | Lịch sử                                           |
+--------------------------------------------------------------------------------+
```

Invoice matching:

```text
+--------------------------------------------------------------------------------+
| Hóa đơn NCC                                                                     |
+--------------------------------------------------------------------------------+
| Toolbar: supplier | status | discrepancy | date                                 |
+--------------------------------------------------------------------------------+
| Three columns: PO | GRN | Invoice                                               |
+--------------------------------------------------------------------------------+
| Exception panel and approve/payment action                                      |
+--------------------------------------------------------------------------------+
```

### Transfers

Routes:

- `/inventory/transfers`
- `/inventory/transfers/[id]`
- `/inventory/m/transfers`
- `/inventory/m/transfers/[id]/receive`

End-to-end:

```text
1. Queue: cần ship / đang đi / cần nhận / lệch
2. Create transfer
3. Confirm ship
4. Confirm receive on desktop or mobile
5. Resolve variance
```

List:

```text
+--------------------------------------------------------------------------------+
| Điều chuyển / Nhận hàng & cấp bếp                                               |
+--------------------------------------------------------------------------------+
| Tabs: Cần gửi | Đang đi | Cần nhận | Lệch                                       |
+--------------------------------------------------------------------------------+
| Table/List: code, from, to, lines, status, age, next action                     |
+--------------------------------------------------------------------------------+
```

Detail:

```text
+--------------------------------------------------------------------------------+
| TR-001 | status | from -> to                                  [Ship/Receive]    |
+--------------------------------------------------------------------------------+
| Pick/receive line table                                                         |
+--------------------------------------------------------------------------------+
| Variance panel if received != shipped                                           |
+--------------------------------------------------------------------------------+
| Timeline: created, shipped, received, closed                                    |
+--------------------------------------------------------------------------------+
```

Mobile receive:

```text
+--------------------------------+
| Nhận hàng                      |
+--------------------------------+
| Transfer card                  |
| Item rows: shipped vs received |
| Variance reason only if needed |
| [Xác nhận nhận]                |
+--------------------------------+
```

### Production

Routes:

- `/inventory/production`
- `/inventory/m/production`
- `/inventory/recipes`

Production hub:

```text
+--------------------------------------------------------------------------------+
| Lệnh sản xuất                                                                   |
+--------------------------------------------------------------------------------+
| Tabs: Có thể làm | Thiếu nguyên liệu | Đang làm | Hoàn tất                      |
+--------------------------------------------------------------------------------+
| Cards/Table: output, target qty, missing inputs, expected cost, next action     |
+--------------------------------------------------------------------------------+
```

Recipe catalog:

```text
+--------------------------------------------------------------------------------+
| Công thức món / Công thức sản xuất                                               |
+--------------------------------------------------------------------------------+
| Toolbar: search | output type | active | [Tạo công thức]                       |
+--------------------------------------------------------------------------------+
| Table: output, input count, yield, cost preview, ready/blocked                  |
+--------------------------------------------------------------------------------+
```

Rules:

- Production hub answers: hôm nay làm gì được, thiếu gì.
- Confirm production previews input decreases and output increases.

### Kiểm Kê

Routes:

- `/inventory/stocktake`
- `/inventory/stocktake/new`
- `/inventory/stocktake/[id]`
- `/inventory/stocktake/[id]/count`
- `/inventory/stocktake/[id]/escalate`
- `/inventory/stocktake/conflicts`

End-to-end:

```text
1. Create session
2. Count
3. Review variance
4. Request recount/escalate
5. Resolve conflicts
6. Finalize adjustment through RPC
```

List:

```text
+--------------------------------------------------------------------------------+
| Kiểm kê                                                     [Tạo kỳ kiểm kê]    |
+--------------------------------------------------------------------------------+
| Toolbar: site | mode | status | date                                            |
+--------------------------------------------------------------------------------+
| Table: session, scope, progress, variance, auditor, next action                 |
+--------------------------------------------------------------------------------+
```

Count page:

```text
+--------------------------------------------------------------------------------+
| Kiểm kê - Zone A | progress | lock owner                                        |
+--------------------------------------------------------------------------------+
| One-item focus / blind grid                                                     |
| Unit, count input, note, unavailable action                                     |
+--------------------------------------------------------------------------------+
| [Lưu] [Tiếp theo]                                                               |
+--------------------------------------------------------------------------------+
```

Detail:

```text
+--------------------------------------------------------------------------------+
| Session summary | status | progress                         [Finalize if clear] |
+--------------------------------------------------------------------------------+
| Variance summary by value/risk                                                  |
+--------------------------------------------------------------------------------+
| Tabs: Dòng đếm | Lệch | Lịch sử                                                 |
+--------------------------------------------------------------------------------+
```

Conflicts:

```text
+--------------------------------------------------------------------------------+
| Xử lý lệch kiểm kê                                                              |
+--------------------------------------------------------------------------------+
| Queue sorted by risk/value                                                      |
+--------------------------------------------------------------------------------+
| Detail panel: system movement history, count history, decision                  |
+--------------------------------------------------------------------------------+
```

### Catalog

Routes:

- `/inventory/ingredients`
- `/inventory/suppliers`
- `/inventory/recipes`
- `/inventory/settings/ingredients` redirect
- `/inventory/settings/suppliers` redirect
- `/inventory/settings/recipes` redirect

Layout:

```text
+--------------------------------------------------------------------------------+
| Catalog title                                              [Import] [Create]    |
+--------------------------------------------------------------------------------+
| Toolbar: search | status | ready/blocked | category/supplier                    |
+--------------------------------------------------------------------------------+
| Table: identity fields, readiness, linked workflow, actions                     |
+--------------------------------------------------------------------------------+
| FormDialog / Sheet for focused edits                                            |
+--------------------------------------------------------------------------------+
```

Rules:

- Catalog rows show `Ready / Blocked` so staff know if data can be used.
- Import errors identify row and column.

### Reports And Settings

Reports:

```text
+--------------------------------------------------------------------------------+
| Báo cáo kho                                                                     |
+--------------------------------------------------------------------------------+
| Toolbar: site | date range | report type | export                               |
+--------------------------------------------------------------------------------+
| Summary + Table/Chart                                                           |
+--------------------------------------------------------------------------------+
```

Settings:

```text
+--------------------------------------------------------------------------------+
| Cài đặt kho                                                                     |
+--------------------------------------------------------------------------------+
| Tabs: Hạn sử dụng | QC                                                          |
+--------------------------------------------------------------------------------+
| Policy forms with audit note                                                    |
+--------------------------------------------------------------------------------+
```

Rules:

- Settings explain active policy, but blockers appear on the workflow page where users hit them.

## Finance Module

Route family:

- `/finance`
- `/finance/revenue`
- `/finance/revenue/[date]`
- `/finance/chart-of-accounts`
- `/finance/journal`
- `/finance/posting-rules`
- `/finance/statements`
- `/finance/food-cost`
- `/finance/periods`
- `/finance/reconciliation`
- `/finance/audit-trail`

Primary job: manage accounting records, revenue reports, statements, reconciliation, and audit.

### Finance Home

```text
+--------------------------------------------------------------------------------+
| Shell header: Kế toán / Tài chính                           [Báo cáo tài chính]|
+--------------------------------------------------------------------------------+
| Next action / blockers: unposted docs, period state, failed webhooks            |
+--------------------------------------------------------------------------------+
| Revenue snapshot | HĐĐT state | top food cost exceptions                        |
+--------------------------------------------------------------------------------+
| Recent accounting work: journal, periods, reconciliation                        |
+--------------------------------------------------------------------------------+
```

Rules:

- Remove duplicated `PageHero`.
- Use accounting words from glossary.
- Metrics support period close or accounting decisions.

### Revenue

```text
+--------------------------------------------------------------------------------+
| Doanh thu                                                                       |
+--------------------------------------------------------------------------------+
| Toolbar: period granularity | date range | branch | export                      |
+--------------------------------------------------------------------------------+
| KPI row: orders, customers, revenue, VAT, payment mix                            |
+--------------------------------------------------------------------------------+
| Charts: payment mix, dine-in/takeaway, VAT output                               |
+--------------------------------------------------------------------------------+
| Table: period/branch, orders, revenue, cash, VietQR, MoMo, VAT, action          |
+--------------------------------------------------------------------------------+
```

Drilldown `/finance/revenue/[date]`:

```text
+--------------------------------------------------------------------------------+
| Doanh thu ngày YYYY-MM-DD                                                       |
+--------------------------------------------------------------------------------+
| Branch selector if needed                                                       |
+--------------------------------------------------------------------------------+
| Hourly revenue                                                                  |
+--------------------------------------------------------------------------------+
| Orders table: time, order code, type, guests, items, payment, VAT, total, HĐĐT  |
+--------------------------------------------------------------------------------+
```

Rules:

- Revenue buckets use completed payments and local business timezone.

### Chart Of Accounts

```text
+--------------------------------------------------------------------------------+
| Hệ thống tài khoản                                          [Thêm tài khoản]    |
+--------------------------------------------------------------------------------+
| Toolbar: search | type | cashflow section | active                              |
+--------------------------------------------------------------------------------+
| Tree/Table: code, name, parent, type, cashflow section, actions                 |
+--------------------------------------------------------------------------------+
| Sheet/Dialog: create/edit account                                               |
+--------------------------------------------------------------------------------+
```

### Journal

```text
+--------------------------------------------------------------------------------+
| Sổ nhật ký                                                   [Tạo bút toán]     |
+--------------------------------------------------------------------------------+
| Toolbar: period | status | branch | search reference                            |
+--------------------------------------------------------------------------------+
| Table: number, date, description, debit, credit, status, actions                |
+--------------------------------------------------------------------------------+
| Detail Sheet: lines, attachments, void/reverse action, audit                    |
+--------------------------------------------------------------------------------+
```

Rules:

- Voids use reversing entries, never destructive line edits.
- Period closed blockers come from DB/RPC state.

### Posting Rules

```text
+--------------------------------------------------------------------------------+
| Quy tắc hạch toán tự động                                                       |
+--------------------------------------------------------------------------------+
| Toolbar: transaction type | active                                              |
+--------------------------------------------------------------------------------+
| Table: source event, debit, credit, tax/cost behavior, active, actions          |
+--------------------------------------------------------------------------------+
```

### Statements

```text
+--------------------------------------------------------------------------------+
| Báo cáo tài chính                                                               |
+--------------------------------------------------------------------------------+
| Toolbar: statement type | period | branch/tenant | export                       |
+--------------------------------------------------------------------------------+
| Statement table with totals and drilldown links                                 |
+--------------------------------------------------------------------------------+
```

### Food Cost

```text
+--------------------------------------------------------------------------------+
| Giá vốn món                                                                     |
+--------------------------------------------------------------------------------+
| Toolbar: period | branch | category                                             |
+--------------------------------------------------------------------------------+
| Table: menu item, revenue, WAC cost, food cost %, trend, action                 |
+--------------------------------------------------------------------------------+
```

### Reconciliation

```text
+--------------------------------------------------------------------------------+
| Đối soát ngân hàng                                                              |
+--------------------------------------------------------------------------------+
| Toolbar: account | date | status                                                |
+--------------------------------------------------------------------------------+
| Split view: bank statement lines | candidate matches                            |
+--------------------------------------------------------------------------------+
| Action: match / unmatch with confirmation                                       |
+--------------------------------------------------------------------------------+
```

### Audit Trail

```text
+--------------------------------------------------------------------------------+
| Nhật ký kiểm toán                                                               |
+--------------------------------------------------------------------------------+
| Toolbar: entity | action | actor | date | search                                |
+--------------------------------------------------------------------------------+
| Table: timestamp, actor, entity, action, diff summary, detail                   |
+--------------------------------------------------------------------------------+
```

## HR Module

Route family:

- `/hr`
- `/hr/payroll`
- `/hr/payroll/[periodId]`

The current shell nav references `/hr/employees`, `/hr/shifts`, `/hr/attendance`, `/hr/reports`, but runtime pages are currently consolidated under `/hr`. Rebuild should either create those pages or keep nav aligned to existing routes.

Primary job: manage employee records, shifts, attendance, payroll.

### HR Home

```text
+--------------------------------------------------------------------------------+
| Shell header: Nhân sự & tiền lương                           [Bảng lương]      |
+--------------------------------------------------------------------------------+
| Tabs: Nhân viên | Ca làm | Phân ca | Chấm công                                  |
+--------------------------------------------------------------------------------+
| Active tab toolbar                                                              |
+--------------------------------------------------------------------------------+
| Table / planner / attendance review                                             |
+--------------------------------------------------------------------------------+
```

Rules:

- Remove duplicated hero card.
- If keeping all work in `/hr`, shell nav must not link to non-existing pages.
- If splitting routes, use one page structure per route and URL-addressable filters.

### Employees

```text
+--------------------------------------------------------------------------------+
| Toolbar: search | branch | status | contract type | [Thêm nhân viên]            |
+--------------------------------------------------------------------------------+
| Table: code, name, branch, position, contract, start date, status, actions      |
+--------------------------------------------------------------------------------+
| FormDialog: employee profile and contract basics                                |
+--------------------------------------------------------------------------------+
```

### Shifts

```text
+--------------------------------------------------------------------------------+
| Toolbar: branch | active status | [Tạo ca]                                      |
+--------------------------------------------------------------------------------+
| Table: name, start, end, active, actions                                        |
+--------------------------------------------------------------------------------+
```

### Assignments

```text
+--------------------------------------------------------------------------------+
| Toolbar: branch | week navigation                                               |
+--------------------------------------------------------------------------------+
| Desktop planner table by shift x date                                           |
| Mobile day cards with assigned employees                                        |
+--------------------------------------------------------------------------------+
```

### Attendance

```text
+--------------------------------------------------------------------------------+
| Toolbar: branch | date range | status                                           |
+--------------------------------------------------------------------------------+
| Table: employee, check-in, check-out, status, exception                         |
+--------------------------------------------------------------------------------+
```

### Payroll List

```text
+--------------------------------------------------------------------------------+
| Bảng lương                                                   [Tạo kỳ lương]     |
+--------------------------------------------------------------------------------+
| Toolbar: period | status                                                        |
+--------------------------------------------------------------------------------+
| Table: period, status, gross, insurance, PIT, net, actions                      |
+--------------------------------------------------------------------------------+
```

### Payroll Detail

```text
+--------------------------------------------------------------------------------+
| Kỳ lương YYYY-MM | status badge                            [Tính lại] [Chốt]   |
+--------------------------------------------------------------------------------+
| Summary totals                                                                   |
+--------------------------------------------------------------------------------+
| Table: employee, gross, insurance, PIT, net, status                              |
+--------------------------------------------------------------------------------+
| Tabs: Dòng lương | Báo cáo | Lịch sử                                            |
+--------------------------------------------------------------------------------+
```

Rules:

- Payroll status controls what employee portal can see.
- Staff self-service payslip remains under `/employee/payslip`.

## Cổng Nhân Viên

Route family:

- `/employee`
- `/employee/clock`
- `/employee/schedule`
- `/employee/attendance`
- `/employee/payslip`
- `/employee/profile`
- `/employee/permissions`

Primary job: staff manages their own workday.

### `/employee`

```text
+--------------------------------+
| Cổng nhân viên  role badges    |
+--------------------------------+
| Chấm công hôm nay              |
| Status, in/out time            |
| [Chấm công vào/ra]             |
+--------------------------------+
| Ca tiếp theo                   |
+--------------------------------+
| Link grid: Lịch ca | Lịch sử   |
| Phiếu lương | Cá nhân          |
| POS/KDS compact if allowed     |
+--------------------------------+
| [Đăng xuất]                    |
+--------------------------------+
```

Rules:

- No hero card.
- No stat cards duplicating role/branch.
- No management launcher block.

### `/employee/clock`

```text
+--------------------------------+
| Chấm công                      |
+--------------------------------+
| GPS state                      |
| QR/manual code state           |
| Primary clock action           |
| Safe error/recovery copy       |
+--------------------------------+
```

### `/employee/schedule`

```text
+--------------------------------+
| Lịch ca                        |
| Week navigation                |
+--------------------------------+
| Day cards / week table         |
+--------------------------------+
```

### `/employee/attendance`

```text
+--------------------------------+
| Lịch sử chấm công              |
| Last 30 days                   |
+--------------------------------+
| Mobile list / desktop table    |
+--------------------------------+
```

### `/employee/payslip`

```text
+--------------------------------+
| Phiếu lương                    |
| Paid/released periods only     |
+--------------------------------+
| Period list                    |
| Detail breakdown               |
+--------------------------------+
```

### `/employee/profile`

```text
+--------------------------------+
| Hồ sơ cá nhân                  |
+--------------------------------+
| Name, email, branch, employee  |
| code, start date               |
+--------------------------------+
```

### `/employee/permissions`

```text
+--------------------------------+
| Thông tin quyền truy cập       |
| Support/debug only             |
+--------------------------------+
| Permission summary             |
+--------------------------------+
```

Rules:

- Hide from normal nav unless used for rollout support.
- Never accept `employeeId` from URL/client for self-service.
- Payslip shows paid periods only.

## Implementation Waves From This Map

### Wave 1 - Contract Sync

Files:

- `docs/plan/ui-ux-page-contracts.md`
- this file

Output:

- Every route family has a target layout.
- Known doc conflicts are resolved.

### Wave 2 - Shell Cleanup

Scope:

- Remove duplicated `PageHero` from pages already inside `AppShell`.
- Normalize toolbar/list/detail templates.
- Align HR shell nav with real routes.

### Wave 3 - Frontline

Scope:

- POS session/context/new order/detail states.
- KDS queue-first board and compact filters.
- Branch menu limits table.

### Wave 4 - Inventory

Scope:

- Inventory dashboard and document detail structures.
- Procurement, transfer, stocktake, waste, production mobile paths.

### Wave 5 - Back Office

Scope:

- Finance reports, journal, reconciliation.
- HR employees/shifts/payroll.
- Menu and orders cleanup.

### Wave 6 - Employee And System States

Scope:

- Employee task hub and self-service pages.
- Notifications feed.
- Access blocked/login polish.

## Completion Checklist For Any Runtime UI PR

- Surface, primary job, route family, change type, and primitives stated before code.
- Layout follows the matching shell in this document.
- No fake primitives.
- No arbitrary Tailwind dimensions.
- No route-specific theme CSS.
- No static presentation inline styles.
- No duplicated workflow state.
- Vietnamese copy follows glossary.
- POS/KDS first viewport shows next action/live queue.
- Inventory scope remains in `?branchId=`.
- `pnpm typecheck && pnpm lint && pnpm build` passes for implementation PRs.

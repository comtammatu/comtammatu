# UI/UX Page Contracts

> Updated: 2026-04-25 | Use with `docs/spec/design-system.md`

Cross-module markdown layout source: `docs/plan/ui-ux-markdown-layout-map.md`.

## Page Order

Priority order for the rebuild:

1. `/login`
2. `/br/[branchId]/pos`
3. `/br/[branchId]/kds`
4. `/admin/dashboard`
5. `/admin/settings/*`
6. `/admin/staff`
7. `/admin/staff/[id]/permissions`
8. `/inventory/*`
9. `/finance/*`
10. `/hr/*`
11. `/employee/*`

Runtime routes for menu and orders are `/menu` and `/orders`, not `/admin/menu` or `/admin/orders`. Do not add `/admin/menu` or `/admin/orders` routes.

Each page contract must state the surface, primary user job, change type, primitives, risks, and acceptance criteria before runtime edits.

## `/login`

Surface: Auth, `P0`.

Files:

- `apps/web/app/(auth)/login/page.tsx`
- `apps/web/app/(auth)/login/login-form.tsx`
- `apps/web/app/(auth)/login/actions.ts`

Primary user job:

- Staff enters email/password and lands in the correct workspace for their role and branch.

Change type:

- Visual refactor: yes.
- UX flow change: minor, mostly reducing chrome and clarifying status.
- Copy change: yes, keep Vietnamese utility copy.
- Behavior change: avoid unless fixing the claims extraction regression.

Current assessment:

- Uses real shadcn primitives (`Card`, `Badge`, `Button`, `Input`, `Label`, `Spinner`), so the page is already close to the preset.
- The page is too marketing-heavy for an auth task: brand panel, trust row, status pills, and helper block all repeat the same promise.
- The login card is the primary task but competes with the left brand card and three extra trust cards.
- `login-form.tsx` manually imitates badges/status chips with `span`; use `Badge` instead.
- Error UI manually imitates an alert; use `Alert`.
- Form fields should move toward `Field`, `FieldGroup`, `FieldLabel`, and `FieldError` if the page is touched.
- Avoid raw palette status classes (`sky-*`, `amber-*`) and use `info`, `warning`, or `destructive` token variants.
- Technical risk: `actions.ts` currently reads `extractClaims(user.app_metadata)` after login. Regression `JWT-CLAIMS-NOT-IN-APP-METADATA` says hook-injected claims must be read from the access token when needed.

UX decision:

- Keep `/login` as a task-first auth screen, not a landing page.
- One primary card: credentials and submit.
- One quiet brand/context area is allowed, but it must not push the form below the fold on mobile.
- Remove or collapse repeated trust/proof copy.
- Status should be one clear inline state: ready, checking, or error.
- Do not add role selection. Redirect remains claim-driven.

Allowed primitives:

- `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`
- `Button`
- `Input`
- `Field`, `FieldGroup`, `FieldLabel`, `FieldError`
- `Badge`
- `Alert`, `AlertTitle`, `AlertDescription`
- `Spinner`

Do not use:

- Fake status pills from raw `span`
- Raw palette status classes
- Extra decorative cards that do not help login
- New auth theme or route-specific CSS

Acceptance:

- Mobile first viewport shows the login form and submit button without scrolling on common phone sizes when no error is present.
- Error state is visible, uses `Alert`, and does not expose raw Supabase/Postgres messages.
- Pending state uses `Spinner` and disables submit.
- Form controls have labels, autocomplete, focus states, and minimum touch target.
- Redirect remains server-side and claim-driven.
- No new vocabulary drift.
- `pnpm typecheck && pnpm lint && pnpm build` passes after implementation.

## `/br/[branchId]/pos`

Surface: Branch POS, `P0`.

Files:

- `apps/web/app/br/[branchId]/pos/layout.tsx`
- `apps/web/app/br/[branchId]/pos/page.tsx`
- `apps/web/app/br/[branchId]/pos/session-gate.tsx`
- `apps/web/app/br/[branchId]/pos/pos-table-gate.tsx`
- `apps/web/app/br/[branchId]/pos/pos-menu.tsx`
- `apps/web/app/br/[branchId]/pos/pos-session-header.tsx`
- `apps/web/app/br/[branchId]/pos/pos-menu-grid.tsx`
- `apps/web/app/br/[branchId]/pos/cart-sidebar.tsx`
- `apps/web/app/br/[branchId]/pos/pos-sidebar-panel.tsx`
- `apps/web/app/br/[branchId]/pos/order-history.tsx`
- `apps/web/app/br/[branchId]/pos/order-detail-sheet.tsx`
- `apps/web/app/br/[branchId]/pos/item-customizer.tsx`
- `apps/web/app/br/[branchId]/pos/close-session-dialog.tsx`
- `apps/web/app/br/[branchId]/pos/bill-receipt.tsx`

Primary user job:

- Cashier/waiter opens a POS session, selects service context, adds menu items, submits a new order to kitchen, then handles existing order detail/payment flows from order history.

Change type:

- Visual refactor: yes.
- UX flow change: yes, but keep backend behavior and route contract stable.
- Copy change: yes, reduce instructional copy and keep Vietnamese operational terms.
- Behavior change: only if required to preserve existing order/session behavior.

Current assessment:

- POS is correctly treated as an operational surface, but it repeats workflow state in the header, cart progress card, table gate, sidebar tabs, and badges.
- `PosSessionHeader` is too tall after context lock. Once session/table/order type are known, it should become compact and leave space for menu/cart.
- `SessionGate` uses a two-column explanatory layout with progress cards and info cards. Opening a shift is a short task; the form should be primary.
- `PosTableGate` has long explanatory copy and a progress block before the table grid. Table selection should be visible earlier on mobile.
- `pos-menu.tsx` has a raw `button` radio group for order type even though `ToggleGroup` is already available and used elsewhere.
- `PosMenuGrid` uses `Tabs` correctly, but menu item cards are raw buttons with custom badge-like spans. This can stay as button cards if the card itself is the interaction, but status chips inside should use `Badge`.
- `CartSidebar` uses many cards/badges/progress signals. Cart should focus on current items, total, note, and submit.
- `OrderHistory` mixes summary/revenue copy with operational actions. Existing orders should focus on status, table/type, payment action, and detail.
- `SessionGate` currently has a static inline style for progress width. This violates `NO-STATIC-UI-INLINE-STYLES` unless changed to an approved primitive such as `Progress`.
- Auth V2 is shipped, but POS Server Actions still primarily gate with `POS_ROLES` / `MANAGER_ROLES`. UI rebuild must make the workflow ready for permission-key gating instead of baking role names deeper into components.

Auth V2 workflow boundary:

- Route entry remains proxy-owned. `apps/web/proxy.ts` validates session, JWT claims from access token, legacy module access, branch scope, and operational branch kind before POS renders.
- POS UI must not duplicate proxy auth checks or invent a second access policy.
- Server Actions remain the mutation gate. For Auth V2, action authority should map to permission keys, with RLS/RPC still authoritative.
- UI may hide/disable actions based on fetched permissions, but hidden UI is not security.
- Never read authorization from `user_metadata`. Claims come from the access token; permissions come from `staff_permissions` / `has_permission()`.

Permission map for POS workflow:

| Workflow action | Permission key | Current legacy fallback | UI treatment |
| --- | --- | --- | --- |
| Enter POS route / view POS data | `pos:use` | `MODULE_ACL.pos.allowedRoles` | Blocked by proxy/route; no in-page auth banner |
| Open POS session | `pos:use` | `cashier`, `waiter`, `branch_manager` | Primary form action before session exists |
| Create new order | `orders:write` | POS roles | Primary cart submit |
| Append item to existing order | `orders:write` | POS roles | Starts from order detail/history, not cart default |
| Mark served/completed | `orders:write` | POS roles | Order detail action |
| Transfer table | `orders:write` | POS roles | Order detail action with table picker |
| Void item / cancel order | `pos:void_order` or `orders:void` | manager roles | Destructive action, separated + confirmed |
| Apply discount | `pos:apply_discount` | not part of current UI unless implemented | Do not expose until backend/action exists |
| Reprint receipt | `pos:reprint_receipt` | POS roles if currently allowed | Bill/receipt action |
| Close POS shift | `pos:close_shift` | POS roles | Header/close-session dialog |

Implementation rule:

- New POS code should prefer permission keys from `PERMISSION_KEYS` for action availability and server-side checks. If an action still uses legacy roles, name it as transitional and do not spread that role check into UI components.
- Manager-only wording must become permission wording where possible: "Cần quyền hủy đơn" instead of "Cần quyền quản lý" when the permission is the real gate.
- For branch-scoped permissions, pass the route `branchId` into permission reads so tenant-wide grants and branch grants resolve consistently.

Canonical POS workflow:

```text
1. Proxy gate
   authenticated -> valid JWT claims -> route access -> branch scope

2. POS session gate
   no open session for current user -> choose terminal -> opening cash -> open session

3. Order context gate
   takeaway -> menu opens immediately
   dine-in -> choose available table -> menu opens

4. New order creation
   menu item -> customizer if needed -> cart -> note -> submit -> KDS routing

5. After submit
   cart clears -> order detail/history opens -> further mutations happen there

6. Existing order workflow
   append item -> mark served/completed -> bill/payment -> close table/order
   transfer/void/cancel only from order detail with permission + confirmation

7. Shift close
   close-session dialog -> closing cash -> safe errors -> return to session gate
```

UX decision:

- POS is not a dashboard. The first viewport must show the next safe action.
- Use one visual source of truth for the current workflow state.
- Before session open: show compact branch/terminal context and the open-session form.
- Before table lock for dine-in: show order type control and table grid immediately; helper copy must be short.
- After context lock: header compresses to one row of session, context, active orders, and close-session action.
- New order creation lives in menu + cart only.
- Existing order mutation/payment lives in order history/detail/bill flows, not in the cart.
- Mobile uses menu as the main workspace and opens cart/order history through a bottom drawer/action.
- Desktop uses menu workspace plus right-side operational panel.

Implementation lock after POS workflow debate:

- Blocked POS states render one direct problem state, not multi-step progress cards.
- `Giỏ đơn mới` is the only cart vocabulary and is used only before submitting a new order.
- `Thêm món` on an existing order creates a client-local append draft. Menu taps and customizer confirmation add lines to that draft; only `Gửi món thêm` calls the append mutation.
- Payment opens directly to method selection. `served` is a service marker only; the bill sheet may warn when an order is not served, but must not call `updateOrderStatus(..., "served")` or block payment.
- Paid orders use `Đã thanh toán` / `Hóa đơn`; cancelled orders use `Đã hủy`.
- Active served-but-unpaid orders remain in `Đơn cần xử lý` until payment closes the order.

Target layout:

### State A - No Open POS Session

Purpose:

- Staff must open a POS session before any selling workflow appears.
- The page should not show menu/cart/table chrome yet.

Desktop:

```text
+--------------------------------------------------------------------------------+
| <- Cong nhan vien                                      Chi nhanh #12            |
+--------------------------------------+-----------------------------------------+
| POS                                  | Mo ca ban hang                          |
|                                      |                                         |
| Terminal status                      | May POS                                 |
| - May dang ranh: 2                   | [ Select: Quay thu ngan 1        v ]   |
| - May dang co ca: 1                  |                                         |
|                                      | Tien dau ca                             |
| Active operator                      | [ 0                                ]   |
| - Ten nhan vien                      |                                         |
| - Chuc vu / permission hint          | [ Mo ca ]                               |
|                                      |                                         |
|                                      | Inline error / warning if needed        |
+--------------------------------------+-----------------------------------------+
```

Mobile:

```text
+--------------------------------+
| <- Cong nhan vien              |
+--------------------------------+
| POS                            |
| Mo ca ban hang                 |
|                                |
| May POS                        |
| [ Select terminal          v ] |
|                                |
| Tien dau ca                    |
| [ 0                          ] |
|                                |
| [ Mo ca ]                      |
|                                |
| Inline error / warning if any  |
+--------------------------------+
```

Rules:

- Use one form card at most.
- Do not show progress cards, trust cards, or explanatory side cards.
- If terminal list is empty or all terminals are busy, show one `Alert` / `Empty` block where the form would be.
- `Mo ca` requires `pos:use`.

### State B - Session Open, Order Context Not Locked

Purpose:

- Staff chooses takeaway or locks the correct table for dine-in.
- The next action must be visible before any menu browsing.

Desktop:

```text
+--------------------------------------------------------------------------------+
| POS - Quay 1 - Ca mo 09:00        Chua chon ban              [ Dong ca ]        |
+-----------------------------------------------+--------------------------------+
| Loai don                                      | Don dang phuc vu               |
| [ Tai ban ] [ Mang ve ]                       |                                |
|                                               | +----------------------------+ |
| Khu A                                         | | #A102  Ban 03  Dang lam    | |
| +------+------+------+------+                 | | [Chi tiet] [Hoa don]       | |
| | 01   | 02   | 03   | 04   |                 | +----------------------------+ |
| +------+------+------+------+                 |                                |
|                                               | No cart submit until context   |
| Khu B                                         | is ready.                      |
| +------+------+------+                        |                                |
| | 11   | 12   | 13   |                        |                                |
| +------+------+------+                        |                                |
+-----------------------------------------------+--------------------------------+
```

Mobile:

```text
+--------------------------------+
| POS - Chon ban      [Dong ca]  |
+--------------------------------+
| [ Tai ban ] [ Mang ve ]        |
|                                |
| Khu A                          |
| +-----+ +-----+ +-----+        |
| | 01  | | 02  | | 03  |        |
| +-----+ +-----+ +-----+        |
| +-----+ +-----+ +-----+        |
| | 04  | | 05  | | 06  |        |
| +-----+ +-----+ +-----+        |
|                                |
| [Don dang phuc vu]             |
+--------------------------------+
```

Rules:

- `Tai ban` / `Mang ve` uses `ToggleGroup`, not raw radio buttons.
- Dine-in table grid appears in the first mobile viewport.
- When `Mang ve` is selected, skip table lock and open menu immediately.
- Existing orders are accessible, but do not become the main content before table selection.

### State C - Active New Order, Desktop

Purpose:

- Staff adds menu items to a new order while keeping cart and active orders reachable.

```text
+--------------------------------------------------------------------------------+
| POS - Quay 1 - Ca mo 09:00     Ban 12 / Mang ve     4 don dang phuc  [Dong ca] |
+---------------------------------------------------+----------------------------+
| Menu toolbar                                      | [ Don moi ] [ Dang phuc vu ]|
| +--------------------+ +------------------------+ |                            |
| | Search mon         | | Khu thuc don tabs      | | Context                    |
| +--------------------+ +------------------------+ | Ban 12 / Mang ve           |
| [Danh muc tabs: Com | Bun | Mon them | Nuoc]      |                            |
|                                                   | Cart items                 |
| +----------------+ +----------------+             | +------------------------+ |
| | Com suon       | | Com bi         |             | | 1x Com suon   45.000d | |
| | 45.000d        | | 42.000d        |             | | [-] [1] [+] [remove]   | |
| | [Them]         | | [Tuy chinh]    |             | +------------------------+ |
| +----------------+ +----------------+             |                            |
| +----------------+ +----------------+             | Ghi chu don                |
| | Nuoc mia       | | Canh them      |             | [ textarea ]               |
| | 12.000d        | | 15.000d        |             |                            |
| +----------------+ +----------------+             | Tong tam tinh              |
|                                                   | 125.000d                   |
|                                                   | [ Dat mon ]                |
+---------------------------------------------------+----------------------------+
```

Right panel behavior:

- `Don moi` tab shows only the draft cart for creating a new order.
- `Dang phuc vu` tab shows existing orders in the current session.
- Switching tabs must not clear the cart.
- After successful `Dat mon`, cart clears and order detail/history becomes the active workflow.

### State D - Active New Order, Mobile

Purpose:

- Menu remains the main workspace; cart and active orders are opened through drawer actions.

```text
+--------------------------------+
| POS - Ban 12        [Dong ca]  |
+--------------------------------+
| [Search mon]                   |
| [Khu thuc don tabs scroll]     |
| [Danh muc tabs scroll]         |
|                                |
| +----------------------------+ |
| | Com suon                   | |
| | 45.000d                    | |
| | [Them]                     | |
| +----------------------------+ |
| +----------------------------+ |
| | Com bi                     | |
| | 42.000d                    | |
| | [Tuy chinh]                | |
| +----------------------------+ |
|                                |
| [Don dang phuc vu] [Gio - 3]  |
+--------------------------------+
```

Cart drawer on mobile:

```text
+--------------------------------+
| Don moi                         |
| Ban 12 / Mang ve                |
+--------------------------------+
| 1x Com suon       45.000d       |
| [-] [1] [+]       [Xoa]         |
|                                |
| Ghi chu don                    |
| [ textarea ]                   |
|                                |
| Tong tam tinh       125.000d    |
| [ Dat mon ]                    |
+--------------------------------+
```

Active orders drawer on mobile:

```text
+--------------------------------+
| Don dang phuc vu                |
+--------------------------------+
| #A102 - Ban 03 - Dang lam       |
| 125.000d                        |
| [Chi tiet] [Hoa don]            |
|                                |
| #A101 - Mang ve - Cho thanh toan|
| 82.000d                         |
| [Chi tiet] [Thanh toan]         |
+--------------------------------+
```

Rules:

- Bottom actions must not cover menu content; reserve safe bottom spacing.
- Mobile drawer contains either cart or active orders, never both mixed in one long scroll.
- `Dat mon` remains inside cart drawer so staff reviews before submit.

### State E - After Submit / Existing Order Detail

Purpose:

- All mutations for submitted orders happen from order detail/history, not the new-order cart.

Sheet / Drawer layout:

```text
+--------------------------------------------+
| Don #A102                         [Close]  |
| Ban 12 - Dang lam - Cho thanh toan         |
+--------------------------------------------+
| Items                                      |
| +----------------------------------------+ |
| | Com suon        1x   ready   45.000d   | |
| | Nuoc mia        1x   pending 12.000d   | |
| +----------------------------------------+ |
|                                            |
| Tong don                         57.000d   |
|                                            |
| Primary actions                            |
| [ Them mon ] [ Thanh toan / Hoa don ]      |
|                                            |
| Status actions                             |
| [ Da phuc vu ] [ Hoan tat ]                |
|                                            |
| More / destructive                         |
| [ Chuyen ban ] [ Huy mon ] [ Huy don ]     |
+--------------------------------------------+
```

Rules:

- `Them mon`, `Da phuc vu`, `Hoan tat`, `Chuyen ban` require `orders:write`.
- `Huy mon` / `Huy don` require `pos:void_order` or `orders:void`.
- Destructive actions use `AlertDialog` and require a reason when the backend requires one.
- If the user lacks a permission, hide the action or render it disabled with a short permission message; the Server Action must still enforce it.

### State F - Close Shift

Purpose:

- Staff closes the current POS session with cash reconciliation.

Dialog layout:

```text
+------------------------------------+
| Dong ca POS                        |
+------------------------------------+
| May POS: Quay 1                    |
| Ca mo luc: 09:00                   |
| Don chua hoan tat: 2               |
|                                    |
| Tien dong ca                       |
| [ amount input ]                   |
|                                    |
| Ghi chu                            |
| [ textarea ]                       |
|                                    |
| [Quay lai]           [Dong ca]     |
+------------------------------------+
```

Rules:

- Close shift requires `pos:close_shift`.
- If unfinished orders block closing, show one `Alert` with the next action.
- Closing shift must not be a ghost/destructive-adjacent button in the main cart area; it lives in the compact header and confirms in dialog.

Allowed primitives:

- `Button`, `ButtonGroup`, `ToggleGroup`
- `Tabs`
- `Badge`
- `Card` only for repeated menu/order/table items or framed tools
- `Sheet`/`Drawer`
- `Dialog`, `AlertDialog`
- `Input`, `InputGroup`, `Textarea`
- `Select`
- `ScrollArea`
- `Progress` where progress is still necessary
- `Spinner`, `Skeleton`, `Empty`
- `Item`, `ItemGroup` where list rows are not card interactions
- `Kbd`, `KbdGroup`

Do not use:

- Dashboard hero/status cards on POS.
- Multiple progress bars for the same new-order flow.
- Raw radio/segmented controls when `ToggleGroup`, `Tabs`, or `ButtonGroup` fits.
- Raw `span` badges for status/counts when `Badge` fits.
- Static inline presentation styles.
- Cart actions for mutating already-submitted orders.
- New POS-specific theme classes or route CSS.

Acceptance:

- Opening a session is a short form-first screen.
- Dine-in table selection shows the table grid in the first mobile viewport.
- After session/context lock, header is compact and does not repeat the cart state already shown in cart/sidebar.
- Desktop keeps one information architecture: menu workspace plus right operational panel.
- Mobile keeps one information architecture: menu workspace plus drawer for cart/order history.
- Cart only creates a new order.
- Existing orders are handled from order history/detail/bill flows.
- Destructive actions (`Xóa giỏ`, `Đóng ca`, cancel/void actions if touched) remain visually separated and confirmed.
- Keyboard shortcuts remain documented in `docs/modules/ui.md` when changed.
- No fake primitives, arbitrary Tailwind dimensions, static presentation inline styles, or vocabulary drift.
- `pnpm typecheck && pnpm lint && pnpm build` passes after implementation.

## `/admin` — Khung quản trị và hệ thống route

Surface: Admin, `P1`.

Primary user job:

- Manager/admin staff manage tenant-level operations: staff, settings, reports, accounting, CRM.

Route contract inventory:

| Route | Primary Job | Module Key | Initial Wave |
| --- | --- | --- | --- |
| `/admin` | Redirect to `/admin/dashboard` | `dashboard` | Gate 0 |
| `/admin/dashboard` | Action hub and operational snapshot | `dashboard` | MVP |
| `/admin/settings` | Settings index redirect | `settings` | MVP |
| `/admin/settings/branches` | Tenant branch setup | `settings` | MVP |
| `/admin/settings/general` | Tenant general setup | `settings` | MVP |
| `/admin/settings/payments` | Payment configuration | `settings` | MVP |
| `/admin/settings/areas` | Area/branch grouping | `settings` | MVP |
| `/admin/settings/tables` | Branch floor/table setup | `settings` | MVP |
| `/admin/settings/pos` | POS terminal setup | `settings` | MVP |
| `/admin/settings/kds` | Kitchen station setup | `settings` | MVP |
| `/admin/settings/printers` | Printer setup | `settings` | MVP if linked in settings nav |
| `/admin/settings/printers/jobs` | Print job monitoring | `settings` | Later wave |
| `/admin/staff` | Staff management | `staff` | MVP |
| `/admin/staff/audit` | Staff/admin audit trail | `staff` | Later wave |
| `/admin/staff/[id]/permissions` | Permission grant/revoke/template | `staff` | MVP |
| `/admin/inventory/*` | Retired Inventory v1 admin tools | `inventory_admin` legacy guard | Retired |
| `/admin/reports/*` | Executive reports | `reports` | Later wave |
| `/admin/accounting/periods` | Accounting period close/reopen | `accounting` | Later wave |
| `/admin/crm` | CRM placeholder | `crm` | Later wave |

Change type:

- Visual refactor: yes.
- UX flow change: minor, standardize heading rhythm and shell.
- Copy change: yes, keep Vietnamese utility copy.
- Behavior change: only route/ACL/nav reconciliation fixes.

ACL policy:

- Proxy no longer uses a blanket `dashboard` gate for all `/admin/*` routes. Each admin route resolves to its own `ModuleKey` via `resolveModuleFromPath`, and `canAccess(role, moduleKey)` gates each route independently.
- `dashboard` module: `owner`, `super_manager`.
- `settings` module: `owner`, `super_manager`, `area_manager`, `branch_manager`.
- `staff` module: `owner`, `super_manager`.
- `reports` module: `owner`, `super_manager`.
- `inventory_admin` module: no allowed roles; `/inventory/*` is the canonical Inventory workspace.
- `accounting` module: `owner`, `super_manager`.
- `crm` module: `owner`, `super_manager`.
- Settings sub-pages have additional role restrictions:
  - `/admin/settings/branches`: owner, super_manager only.
  - `/admin/settings/general`: owner, super_manager only.
  - `/admin/settings/payments`: owner, super_manager only.
  - `/admin/settings/areas`: owner, super_manager only.
  - `/admin/settings/tables`, `pos`, `kds`: BRANCH_FLOOR_SETTINGS_ROLES (super_manager, area_manager, branch_manager).
- Owner does NOT manage branch-floor settings directly (tables, POS terminals, KDS stations). Owner sees tenant strategy: branches, general, payments, areas.

Primitives:

- `Sidebar`, `SidebarContent`, `SidebarHeader`, `SidebarFooter`, `SidebarGroup`, `SidebarMenu`
- `Breadcrumb`, `BreadcrumbItem`, `BreadcrumbList`
- `Button`, `Badge`, `Separator`
- `Card`, `Table`, `Dialog`, `AlertDialog`, `DropdownMenu`
- `Empty`, `Spinner`, `Skeleton`
- Form helpers from `@/components/form`

Acceptance:

- Admin route contract names the surface, user job, route family, change type, primitives, risks, and acceptance tests.
- Admin pages share one shell/header rhythm and do not duplicate page identity in nested cards.
- Each MVP page has a clear toolbar/filter row, count/status context, table/list content, and approved empty/loading/error state.
- CRUD dialogs use shared form helpers or real shadcn field composition.
- Filters and scope are URL-addressable when they affect what data or branch is being managed.
- Navigation, proxy ACL, module ACL, page guards, and Server Actions agree.
- No raw Supabase/Postgres error message reaches clients.
- No fake primitive, arbitrary Tailwind dimension, route theme CSS, static presentation inline style, or vocabulary drift is introduced.
- `pnpm typecheck && pnpm lint && pnpm build` passes before implementation is marked complete.

## `/admin/dashboard` — Admin Dashboard

Surface: Admin Dashboard, `P1`.

Files:

- `apps/web/app/admin/dashboard/page.tsx`
- `apps/web/app/admin/dashboard/actions.ts`

Primary user job:

- Manager sees an operational snapshot and quick-access links to management actions.

Change type:

- Visual refactor: yes, reduce decorative stat-card mosaics.
- UX flow change: yes, shift from decorative dashboard to action hub.

Current assessment:

- Dashboard correctly links to management surfaces via `SurfaceLinkCard`.
- Stat cards (revenue, orders, avg value) are acceptable if they directly support management decisions.
- The recent orders card is useful for quick scanning.
- Hero heading "Tổng quan vận hành hôm nay" with description text is too decorative for a management workspace.
- Badge counts "X mục quản lý" / "X mục vận hành" are decorative chrome.
- Dashboard should focus on action links and operational alerts, not marketing-style copy.

UX decision:

- Keep dashboard as a route/action hub.
- Stat cards are allowed only when they directly support a management decision.
- Remove decorative count badges and hero-style copy.
- Recent orders and quick-access links are the primary content.

Allowed primitives:

- `Card`, `CardHeader`, `CardTitle`, `CardContent`
- `Button`, `Badge`
- `Table` (for recent orders if converted from custom list)
- `Empty`, `Spinner`, `Skeleton`

Acceptance:

- Dashboard focuses on actionable information, not decorative summaries.
- Quick-access links are the primary navigation method.
- No duplicate hero headings (AdminShell header already provides context).
- `pnpm typecheck && pnpm lint && pnpm build` passes.

## `/admin/staff` — Staff Management

Surface: Admin Staff, `P1`.

Files:

- `apps/web/app/admin/staff/page.tsx`
- `apps/web/app/admin/staff/staff-table.tsx`
- `apps/web/app/admin/staff/staff-filters.tsx`
- `apps/web/app/admin/staff/staff-form-dialog.tsx`
- `apps/web/app/admin/staff/add-staff-button.tsx`
- `apps/web/app/admin/staff/actions.ts`
- `apps/web/app/admin/staff/role-labels.ts`

Primary user job:

- Manager views, filters, creates, edits, and toggles staff members.

Change type:

- Visual refactor: yes.
- UX flow change: minor, standardize filter/table pattern.

Current assessment:

- Staff page correctly uses URL params for filters (`?role=`, `?branch=`, `?status=`).
- Hero card with "Nhân viên" heading and "Quản lý nhân viên" badge duplicates what AdminShell already provides.
- Raw `span` badge imitation for "Quản lý nhân viên" — should use `Badge`.
- `StaffTable` and `StaffFilters` are well-structured.
- Server Actions use proper auth context and permission checks.

UX decision:

- Remove the hero card. AdminShell provides page context.
- Use a toolbar row: filters + count + add button.
- Keep staff list as the primary content.

Allowed primitives:

- `Table`, `Badge`, `Button`, `DropdownMenu`
- `Dialog` or `FormDialog`
- `Select`, `Input`
- `Empty`, `Spinner`

Acceptance:

- Staff list is the primary content area.
- Filters are URL-addressable.
- Add/edit dialogs use form helpers.
- No hero card duplicating AdminShell context.
- `pnpm typecheck && pnpm lint && pnpm build` passes.

## `/admin/staff/[id]/permissions` — Permission Management

Surface: Admin Permissions, `P1`.

Files:

- `apps/web/app/admin/staff/[id]/permissions/page.tsx`
- `apps/web/app/admin/staff/[id]/permissions/permissions-client.tsx`
- `apps/web/app/admin/staff/[id]/permissions/actions.ts`

Primary user job:

- Manager views, grants, and revokes permissions for a specific staff member.

Change type:

- Visual refactor: yes.
- UX flow change: minor, standardize permission grant/revoke UX.

Current assessment:

- Permission management uses Auth v2 `staff_permissions` table.
- Grant/revoke actions use `SECURITY DEFINER` RPCs with audit logging.
- Owner permissions are protected from modification.

Acceptance:

- Permission list clearly shows granted vs available permissions.
- Grant/revoke uses `AlertDialog` confirmation.
- Audit trail is accessible.
- `pnpm typecheck && pnpm lint && pnpm build` passes.

## `/admin/settings/*` — Settings

Surface: Admin Settings, `P1`.

Files:

- `apps/web/app/admin/settings/layout.tsx`
- `apps/web/app/admin/settings/page.tsx`
- `apps/web/app/admin/settings/settings-nav.tsx`
- `apps/web/app/admin/settings/branches/*`
- `apps/web/app/admin/settings/general/*`
- `apps/web/app/admin/settings/payments/*`
- `apps/web/app/admin/settings/areas/*`
- `apps/web/app/admin/settings/tables/*`
- `apps/web/app/admin/settings/pos/*`
- `apps/web/app/admin/settings/kds/*`
- `apps/web/app/admin/settings/printers/*`

Primary user job:

- Manager configures tenant strategy (branches, general, payments, areas) and branch-floor settings (tables, POS terminals, KDS stations, printers).

Change type:

- Visual refactor: yes.
- UX flow change: minor, standardize settings nav and form patterns.

Current assessment:

- Settings layout has a hero card with "Cài đặt" heading — duplicates AdminShell.
- Settings nav uses custom pill-style links — should use `Tabs` or `ToggleGroup`.
- Settings sub-pages correctly enforce role restrictions via `SettingsNav.allowedRoles`.
- Branch-floor settings pages correctly filter by branch scope.

ACL policy:

- Tenant strategy pages (branches, general, payments, areas): owner, super_manager.
- Branch-floor pages (tables, POS, KDS): super_manager, area_manager, branch_manager.
- Owner sees only tenant strategy pages in settings nav.
- Branch-floor pages must use URL `?branchId=` for branch scope.

UX decision:

- Remove hero card. AdminShell provides page context.
- Settings nav should use `Tabs` or `ToggleGroup` instead of custom pill links.
- Each settings page should have: title, optional description, primary action, table/list content.

Acceptance:

- Settings nav uses approved primitives.
- No hero card duplicating AdminShell context.
- Branch-floor settings use URL params for branch scope.
- `pnpm typecheck && pnpm lint && pnpm build` passes.

## `/admin/inventory/*` — Retired Inventory V1 Admin Tools

Surface: Retired route boundary.

Files:

- `apps/web/app/admin/inventory/page.tsx`
- `apps/web/app/admin/inventory/feature-flags/page.tsx`
- `apps/web/app/admin/inventory/cold-chain/page.tsx`
- `apps/web/app/admin/inventory/express-windows/page.tsx`
- `apps/web/app/admin/inventory/trust/page.tsx`

Primary user job:

- None. Inventory operations and configuration entry points live under `/inventory/*`; old admin Inventory URLs must not render live tools.

Change type:

- Auth/nav: yes — route retired from discovery and ACL.
- Visual refactor: no.
- UX flow: yes — old URLs fail instead of opening v1 tools.
- Copy: no.
- Behavior: old admin Inventory tools no longer render.

Data source:

- None for the retired route pages.

Mutation path:

- None. Legacy action files may remain latent only when still referenced by v2 runtime code.

Permission and ACL:

- Module ACL: `inventory_admin` legacy guard.
- Allowed roles: none.
- Sub-page permission gates: none, because pages return unsupported route behavior before data access.

Scope rule:

- Branch scope stays URL-only under `/inventory/*`.
- Self-view trust score in the employee profile is separate from the retired admin leaderboard.
- No materialized view may be exposed through retired admin pages.

UI primitives:

- None for retired pages.

Regression risks:

- Reintroducing admin Inventory nav or app discovery creates a second Inventory source of truth.
- Legacy action/client files must not be deleted unless grep and typecheck prove zero v2 callers.

Acceptance:

- `/admin/inventory*` is not discoverable from admin nav or employee app discovery.
- `/admin/inventory*` does not preserve post-login `returnTo`.
- `/admin/inventory*` does not render feature flags, cold-chain, express windows, or trust leaderboard tools.
- Canonical Inventory workflow remains under `/inventory/*`.
- No raw Supabase/Postgres error message reaches clients.

## `/admin/reports/*` — Executive Reports

Surface: Admin Reports, later wave.

Files:

- `apps/web/app/admin/reports/page.tsx`
- `apps/web/app/admin/reports/revenue/page.tsx`
- `apps/web/app/admin/reports/stock-movement/page.tsx`
- `apps/web/app/admin/reports/inventory-value/page.tsx`

Primary user job:

- Owner and super_manager review revenue, stock movement, and inventory value reports.

Change type:

- Auth/nav: yes, through Gate 0 module mapping.
- Visual refactor: later wave.
- UX flow: later wave.
- Copy: later wave.
- Behavior: no metric semantics change.

Data source:

- Materialized views: `mv_top_items`, `mv_food_cost`, and others.
- Supabase reads through SECURITY DEFINER functions.

Permission and ACL:

- Module ACL: `reports`
- Allowed roles: owner, super_manager.

Scope rule:

- Report filters must be URL-addressable.
- Branch filters must be permission-checked.
- `RLS-NOT-APPLIED-ON-MV`: materialized views must not be queried directly by `authenticated` role. Access through SECURITY DEFINER functions that re-check tenant_id, branch_id, and has_permission.

UI primitives:

- `Card`, `Table`, `Badge`, `Button`
- `Select`, `Input` for date/branch filters
- `Empty`, `Spinner`, `Skeleton`

Regression risks:

- Materialized views bypass RLS if queried directly.
- Date/time filters can drift from business-day rules.
- Arbitrary Tailwind values may exist in current report UI.

Acceptance:

- Route contract exists before UI changes.
- No report implementation relies on sidebar visibility as access control.
- MV access always goes through SECURITY DEFINER functions.

## `/admin/accounting/periods` — Accounting Period Control

Surface: Admin Accounting, later wave, high security.

Files:

- `apps/web/app/admin/accounting/periods/page.tsx`
- `apps/web/app/admin/accounting/periods/period-admin-client.tsx`

Primary user job:

- Owner and super_manager review soft/hard-close state and perform approved period reopen/control actions.

Change type:

- Auth/nav: yes — Gate 0 fix for empty allowlist (completed).
- Visual refactor: later wave.
- UX flow: later wave.
- Copy: later wave.
- Behavior: no period close/reopen semantics change.

Data source:

- `accounting_periods`

Mutation path:

- Period reopen actions require `accounting:period_reopen` permission.
- High-risk actions require explicit confirmation.

Permission and ACL:

- Module ACL: `accounting`
- Allowed roles: owner, super_manager.
- Permission key: `accounting:period_reopen`.

Scope rule:

- Tenant-wide accounting control.
- High-risk actions require explicit confirmation and any policy-required 2FA flow.

UI primitives:

- `Table`, `Badge`, `Button`
- `AlertDialog` for destructive/reopen confirmations
- `Empty`, `Spinner`

Regression risks:

- Empty role allowlist was fixed in Gate 0.
- Period close rules are accounting-sensitive and must not be bypassed by UI-only logic.
- Backdated inventory/finance behavior must remain governed by database policy (`PERIOD-CLOSE-SOFT-HARD`).

Acceptance:

- Route contract exists before UI changes.
- Reopen/control actions remain permission-gated and auditable.
- Period close semantics are governed by database triggers, not UI logic.

## `/admin/crm` — CRM Placeholder

Surface: Admin CRM, later wave.

Files:

- `apps/web/app/admin/crm/page.tsx`

Primary user job:

- Not fully defined yet. Placeholder for future customer relationship tool.

Change type:

- Auth/nav: yes, through Gate 0 module mapping.
- Visual refactor: later wave.
- UX flow: N/A until business requirements exist.
- Copy: later wave.
- Behavior: no change.

Permission and ACL:

- Module ACL: `crm`
- Allowed roles: owner, super_manager.

Scope rule:

- Do not expand CRM behavior without a separate business contract.

Regression risks:

- Placeholder can become a decorative dead-end.
- CRM can overlap orders/customers without a defined source of truth.

Acceptance:

- Keep out of MVP.
- Do not add new CRM workflow until requirements exist.

## `/employee/*` — Cổng nhân viên (Employee Self-Service Portal)

Surface: Employee Self-Service, `P1`.

Rebuild plan: `docs/archive/plan/employee-portal-rebuild-plan.md`.

Files:

- `apps/web/app/employee/layout.tsx`
- `apps/web/app/employee/page.tsx`
- `apps/web/app/employee/_lib/employee-context.ts`
- `apps/web/app/employee/_lib/vn-business-date.ts`
- `apps/web/app/employee/_lib/action-messages.ts`
- `apps/web/app/employee/clock/page.tsx`
- `apps/web/app/employee/clock/clock-client.tsx`
- `apps/web/app/employee/clock/actions.ts`
- `apps/web/app/employee/schedule/page.tsx`
- `apps/web/app/employee/schedule/schedule-client.tsx`
- `apps/web/app/employee/schedule/actions.ts`
- `apps/web/app/employee/attendance/page.tsx`
- `apps/web/app/employee/payslip/page.tsx`
- `apps/web/app/employee/payslip/payslip-client.tsx`
- `apps/web/app/employee/profile/page.tsx`
- `apps/web/app/employee/permissions/page.tsx`
- `apps/web/app/employee/components/mobile-header.tsx`
- `apps/web/app/employee/components/bottom-nav.tsx`

Primary user job:

- Staff starts or reviews their workday: clock in/out, view schedule, check attendance history, view released payslips, confirm profile/support data, and jump to POS/KDS when authorized.

Change type:

- Visual refactor: yes, remove hero/dashboard feel.
- UX flow change: yes, task ordering and removal of management-shell drift.
- Copy change: yes, Vietnamese utility copy and glossary terms.
- Behavior/data contract change: yes, self-service reads and writes need RPC/RLS cleanup.

Route contract inventory:

| Route | Primary Job | Change |
| --- | --- | --- |
| `/employee` | Today task hub: clock state, next shift, compact links | Rebuild — remove hero card, stat cards, management launcher drift |
| `/employee/clock` | GPS + QR/manual code clock-in, clock-out | Keep — server actions already safe; polish state machine |
| `/employee/schedule` | Weekly self schedule | Keep — enforce self-only data below app filtering |
| `/employee/attendance` | Last 30 days attendance history | Keep — compact, self-scoped |
| `/employee/payslip` | Released/paid self payslips | Keep — add paid-only filter, privacy boundary |
| `/employee/profile` | User profile, branch, employee code | Keep — mask/omit sensitive data |
| `/employee/permissions` | Auth v2 self-debug | Hide from normal nav or convert to plain-language support summary |

ACL policy:

- Module ACL: `employee`
- Allowed roles: all staff roles (`STAFF_ROLES`)
- Self-service only: every route resolves `auth.uid()` → `employees.profile_id` → `employees.id` server-side
- Never accept `employeeId` from URL or client state for self-service routes

Data contract risks:

1. `employee-portal-actions.tsx` imports HR `checkIn`/`checkOut` gated by `SHIFT_ROLES` (manager-only), blocking normal staff. Must be removed.
2. Payslip reads fetch all `payroll_entries` regardless of period status (`draft`, `calculated` visible). Must filter to `paid` only.
3. Every page redundantly resolves the employee context. Extract to shared `_lib/employee-context.ts`.
4. `shift_assignments` reads are app-layer filtered only. RLS or RPC should enforce self scope.

Primitives:

- `Button`, `Badge`, `Card`, `Item`, `ItemGroup`, `Table`, `Tabs`, `Sheet`/`Drawer`, `Alert`, `Empty`, `Spinner`, `Skeleton`, `Input`, `Select`, `Label`, `Separator`

Do not use:

- Hero/status cards, dashboard stat mosaics, decorative admin cards
- Management launcher navigation sections
- Route-specific theme layer, fake primitives, arbitrary Tailwind dimensions
- `employeeId` from URL or client state for self-service operations

Acceptance:

- First mobile viewport on `/employee` shows the next staff action (clock state or next shift).
- Manager users see their own portal state first; management links are compact secondary handoffs only.
- No HR/admin management content is embedded in the portal.
- Payslip shows only `paid`/released self records.
- A staff member without HR permissions can use all self-service routes.
- No raw Supabase/Postgres error message reaches the client.
- No `"use client"` component imports `@comtammatu/database` barrel.
- UI follows radix-lyra, neutral, lucide, and existing shadcn primitive catalog.
- `pnpm typecheck && pnpm lint && pnpm build` passes.

### `/employee` — Portal Home (Task Hub)

Surface: Employee Home, `P1`.

Primary user job:

- Staff opens the portal and immediately answers: am I clocked in? What is my next shift? Where do I go next?

Current assessment:

- Hero card with "Bắt đầu ca làm nhanh chóng" heading and descriptive copy.
- Three stat cards (Vai trò, Ca làm, Vị trí) duplicate information already in the header badges.
- "Việc trong ngày" section has four action links — acceptable pattern but competes with hero for first viewport.
- "Không gian làm việc" section is a management launcher with POS, KDS, admin, inventory, reports, HR links. This creates dashboard/admin drift.
- `employee-portal-actions.tsx` is imported nowhere visible — dead code with HR action dependency.

UX decision:

- Remove hero card and stat cards entirely.
- First viewport: today's clock state and primary action.
- Second block: next shift / current shift summary.
- Third block: compact link grid to schedule, attendance, payslip, profile.
- POS/KDS handoff links only when route access and branch context allow — compact secondary placement.
- Logout button at bottom.

Layout:

Mobile:

```text
+--------------------------------+
| Cổng nhân viên  [Badge] [Badge]|
+--------------------------------+
| Chấm công hôm nay              |
| [Trạng thái: Đang làm / Chưa]  |
| Vào: 07:32  Ra: —              |
| [Chấm công ra]                 |
+--------------------------------+
| Ca tiếp theo                    |
| Ca sáng  07:00 – 14:00         |
| Chi nhánh ABC                   |
+--------------------------------+
| +------+ +------+ +------+     |
| |Lịch  | |Lịch  | |Phiếu |     |
| |ca    | |sử    | |lương |     |
| +------+ +------+ +------+     |
| +------+ +------+              |
| |Cá    | |POS   |              |
| |nhân  | |/KDS  |              |
| +------+ +------+              |
+--------------------------------+
| [Đăng xuất]                    |
+--------------------------------+
```

Desktop: same single-column layout, max-w-4xl, with link grid widening to 4 columns.

Allowed primitives:

- `Card`, `CardContent`, `CardHeader`, `CardTitle`
- `Button`, `Badge`
- `Item`, `ItemGroup`
- `Empty`, `Spinner`, `Skeleton`

Acceptance:

- No hero card, no stat cards, no management launcher section.
- Clock state visible in first mobile viewport.
- POS/KDS links are compact, role-gated, and secondary.
- No `employeeId` prop drilling to client components.

### `/employee/clock` — Clock In/Out

Surface: Employee Clock, `P1`.

Primary user job:

- Staff clocks in with GPS proximity + QR/manual code, or clocks out.

Current assessment:

- Server Actions (`clock/actions.ts`) are already properly self-service: `getEmployeeContext()` resolves from `auth.uid()`, validates GPS, validates daily code, prevents duplicates.
- Client state machine (`ClockClient`) handles GPS check → QR scan → code entry → verification → success.
- Branch selection needs limiting to assigned/scheduled branches only (deferred for MVP — current all-branches-with-GPS list is acceptable).

Change type:

- Visual refactor: minor, polish state machine UX.
- Behavior change: no — server actions are already safe.
- Data contract: no — already resolves employee from `auth.uid()`.

Acceptance:

- GPS denied, GPS too far, no GPS config, wrong code, valid manual code, camera fallback, duplicate check-in, checkout before check-in, second checkout all handled with safe Vietnamese messages.
- No raw error messages.
- No `employeeId` from client state.

### `/employee/schedule` — Weekly Schedule

Surface: Employee Schedule, `P1`.

Primary user job:

- Staff views their assigned shifts for the current and adjacent weeks.

Current assessment:

- Reads `shift_assignments` with `.eq("employee_id", employee.id)` — app-layer filter only.
- Week navigation works correctly.
- Skeleton loading via boneyard is implemented.

Change type:

- Visual refactor: minimal — already uses proper primitives.
- Data contract: add self-enforcement through shared context helper.

Acceptance:

- Self-only rows guaranteed by server-side employee resolution.
- Clear empty state when no shifts assigned.
- Week controls functional.

### `/employee/attendance` — Attendance History

Surface: Employee Attendance, `P1`.

Primary user job:

- Staff views the last 30 days of their own attendance records.

Current assessment:

- Server component reads directly from `attendance_records` with `.eq("employee_id", employee.id)`.
- Mobile list and desktop table views both implemented.
- Status labels and badge variants are correct.

Change type:

- Visual refactor: minimal.
- Data contract: use shared employee context helper.

Acceptance:

- Self-only rows, 30-day range.
- Status labels follow glossary.
- Compact mobile list and desktop table.

### `/employee/payslip` — Payslip

Surface: Employee Payslip, `P1`.

Primary user job:

- Staff views only released/paid payslip periods with net/gross/insurance/PIT breakdown.

Current assessment:

- **Privacy risk**: reads all `payroll_entries` for the employee regardless of `payroll_periods.status`. Draft and calculated periods are visible.
- Client component `PayslipClient` shows period status badges including `draft` and `calculated`.

Change type:

- Behavior change: yes — filter to `paid` periods only on the server query.
- Data contract: add period status filter to the query.

Acceptance:

- Only `paid` period entries appear in the list and network payload.
- Clear empty state when no paid periods exist.
- No draft/calculated/other-employee data in UI or network.

### `/employee/profile` — Profile

Surface: Employee Profile, `P1`.

Primary user job:

- Staff views their personal summary: name, email, branch, employee code, start date.

Current assessment:

- Imports `getMyTrustScore` from `@/inventory/trust-actions` — cross-module dependency.
- Shows trust score details (GRN 30d, incidents) which are inventory-specific.

Change type:

- Visual refactor: minor.
- Dependency cleanup: evaluate trust score inclusion — keep if it provides self-service value, but decouple from inventory action import.

Acceptance:

- Non-sensitive data only (no CCCD, bank details, GPS coordinates, raw permissions).
- Cross-module imports are justified or decoupled.

### `/employee/permissions` — Permission Debug

Surface: Employee Permission Debug, hidden from normal navigation.

Primary user job:

- QA/staff can verify their current permission grants and position code during Auth v2 rollout.

Change type:

- Hide from bottom nav and normal navigation.
- Keep the route accessible via direct URL for support/QA purposes.

Acceptance:

- Not linked from any normal portal navigation.
- Still renders correctly when accessed directly.
- Uses plain-language descriptions where possible.

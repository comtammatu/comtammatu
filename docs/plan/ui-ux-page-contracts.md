# UI/UX Page Contracts

> Updated: 2026-04-23 | Use with `docs/spec/design-system.md`

## Page Order

Priority order for the rebuild:

1. `/login`
2. `/br/[branchId]/pos`
3. `/br/[branchId]/kds`
4. `/admin/dashboard`
5. `/admin/settings/*`
6. `/admin/staff`
7. `/admin/menu`
8. `/admin/orders`
9. `/inventory/*`
10. `/finance/*`
11. `/hr/*`
12. `/employee/*`

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

# POS Mobile-First Workflow Rebuild

> Updated: 2026-04-25  
> Status: handoff plan after 4-agent debate  
> Surface: `/br/[branchId]/pos`  
> Runtime UI contract: `radix-lyra`, preset `b6G3vbGue`, `neutral`, `lucide`

## Purpose

Rebuild the POS UI/UX workflow as a mobile-first operational surface, not a dashboard or a new theme.

Primary user job:

- Cashier/waiter opens or rides the active POS session, chooses service context, creates a new order, then handles submitted orders from order history/detail/payment flows with minimum mobile friction.

This plan supersedes the POS-specific direction in `docs/plan/pos-kds-mobile-first.md` where that document conflicts with the current design-system contract. The locked source of truth remains `docs/spec/design-system.md`.

## Source Of Truth

Read these before implementation:

1. `AGENTS.md`
2. `docs/agent/rules/engineering.md`
3. `docs/agent/rules/database.md`
4. `docs/agent/rules/ui.md`
5. `docs/agent/rules/workflow.md`
6. `docs/agent/rules/references.md`
7. `docs/spec/design-system.md`
8. `docs/modules/ui.md`
9. `tasks/regressions.md`
10. `docs/plan/ui-ux-page-contracts.md`
11. `docs/plan/m2-order-lifecycle.md`
12. `docs/plan/m2-ext2-table-bill-ops.md`

Do not begin code before restating the route family, primary user job, change type, primitives, and regression risks.

## Debate Synthesis

### Agreements

- Scope is POS only: `/br/[branchId]/pos`.
- The first mobile viewport must expose the next safe action.
- POS is not a marketing surface and not a management dashboard.
- Cart means `Giỏ đơn mới` only, before submit.
- After submit, append, void, cancel, transfer, served, bill, and payment must start from order detail/history/bill flows.
- Payment confirmation is the commercial close. `served` is only a service marker and must not release a table or block payment.
- Multi-order-per-table Option A is already shipped and must remain explicit through occupied-table picker intent.
- Server Actions and RPCs stay authoritative. UI flags only hide or disable.
- Runtime stays shadcn-first: no route theme, no fake primitives, no raw palette drift.

### Conflicts Resolved

| Conflict | Resolution |
| --- | --- |
| Rebuild POS only or include KDS/Admin/Inventory | POS only for this plan. KDS has a separate contract. |
| Visual rebuild or backend redesign | Visual + UX-flow + copy cleanup by default. Backend/RPC changes only if required to preserve shipped behavior. |
| One table = one order | False. A table can have multiple active orders. Preserve `MultiOrderTablePicker` and `allowOccupiedTableId`. |
| Payment vs served semantics | Payment closes the POS order. `served` never releases table and never gates payment. |
| Terminal/session identity redesign | Out of scope. Preserve current per-terminal/latest-opened session behavior and regression guard. |
| Split/merge/offline in mobile-first scope | Out of scope. Track separately after pilot evidence. |
| Expand permission flags | Allowed only when the UI exposes an action. Server Actions/RPCs remain the real gate. |

## Scope

In scope:

- No-session and blocked POS states.
- POS session header and close-shift entry point.
- Service-context gate: `Tại bàn` / `Mang về`, table selection, occupied-table picker.
- Menu/search/category layout.
- New-order cart and submit confirmation.
- Mobile bottom actions and drawers.
- Active order list, order detail sheet, append draft, bill/payment entry points.
- Permission visibility for POS actions already present in the UI.
- Empty/loading/error states and accessibility polish.

Out of scope:

- New design system, token, font, icon library, or preset.
- POS-specific CSS theme layer.
- KDS/Admin/Inventory/Employee rebuilds.
- Split bill, merge bill, merge-table schema, refund, offline POS, QR self-order, or new payment provider work.
- Replacing Supabase/app architecture.
- Storing branch/session/table authority in `localStorage` or React Context.
- Multi-terminal picker UX. The session resolver stays "latest-opened deterministic" per regression `POS-SESSION-SCOPE-PER-TERMINAL-NOT-PER-USER`. Defer the picker until a real branch reports N>1 simultaneously open sessions.
- Moving `EmployeePortalBackControl` out of `pos-session-header.tsx`. Phase 2 keeps the back-control where it currently renders. A relocation requires a separate cross-surface UX decision and is not part of this rebuild.

## Target Workflow

### State A - No Open Session

Primary action: open POS session.

Rules:

- Show only branch/terminal context, terminal select, opening cash, and `Mở ca`.
- If the user cannot open a shift, show one direct blocked state and tell them to contact cashier/branch manager.
- Do not show menu, cart, table grid, progress cards, or dashboard chrome.

### State B - Session Open, Context Not Locked

Primary action: choose `Tại bàn` / `Mang về`, then select a table when dine-in.

Rules:

- `ToggleGroup` controls service mode.
- Dine-in table grid appears in the first mobile viewport.
- Takeaway skips table lock and opens menu immediately.
- Occupied table tap opens the explicit multi-order picker, not a silent block.

### State C - New Order Creation

Primary action: find menu items, add to `Giỏ đơn mới`, submit.

Rules:

- Menu/search/category tabs are the mobile workspace.
- Cart is a drawer on mobile and the primary right pane on desktop/tablet.
- Cart can only create a new order.
- Submit uses confirmation and prevents double-submit.
- After submit, cart clears and the active order detail/history becomes the next workflow.

### State D - Submitted Order

Primary action: inspect order, add more items, serve, bill, payment, transfer, void/cancel when authorized.

Rules:

- Entry starts from order history/detail.
- Destructive actions are separated and confirmed with reason where required.
- Payment opens directly to method selection.
- Paid order shows `Đã thanh toán` / `Hóa đơn`.
- Cancelled order shows `Đã hủy`.
- Served-but-unpaid order remains in `Đơn cần xử lý`.

### State E - Append Items

Primary action: select extra menu items, review append draft, then `Gửi món thêm`.

Rules:

- Append starts only from order detail/history.
- Menu taps add to a client-local append draft.
- Only `Gửi món thêm` calls `append_order_items`.
- Append draft must not reuse new-order cart copy or mutate the existing order before confirmation.

### State F - Payment And Invoice

Primary action: confirm payment safely.

Rules:

- Cash confirmation requires `pos:confirm_payment`.
- Payment reuses an existing active payment slot where applicable.
- Cash payment RPC is the commercial close and releases table only when no active orders remain for the table.
- HĐĐT runs after payment and fails soft. It must not roll back a paid order.
- Payment must not mutate KDS ticket fulfillment state.

### State G - Close Shift

Primary action: close POS session when permitted.

Rules:

- `Chốt ca` and F10 are visible/enabled only with `canCloseShift`.
- Waiter can ride cashier session but cannot open/close shift or confirm cash.
- Closing shift is terminal/session accountability, not a table/order shortcut.

## Affected Files

| Area | Files |
| --- | --- |
| Route coordinator | `apps/web/app/br/[branchId]/pos/page.tsx`, `pos-desktop-shell.tsx` |
| State providers/hooks | `_providers/pos-desktop-provider.tsx`, `_providers/cart-store.ts`, `_hooks/use-active-table.ts`, `_hooks/use-cart.ts`, `_hooks/use-append-target.ts`, `_hooks/use-pos-append.ts` |
| Session/context shell | `session-gate.tsx`, `pos-status-shell.tsx`, `pos-session-header.tsx`, `pos-table-gate.tsx`, `_components/multi-order-table-picker.tsx` |
| Menu/cart/orders | `_components/menu-pane.tsx`, `pos-menu-grid.tsx`, `_components/cart-pane.tsx`, `pos-sidebar-panel.tsx`, `_components/pos-sidebar-variants.tsx`, `_components/order-list-pane.tsx`, `order-history.tsx`, `_components/pos-mobile-action-bar.tsx` |
| Submitted order flows | `order-detail-sheet.tsx`, `_components/order-detail/*`, `_components/append-draft-pane.tsx` |
| Payment/shift close | `_components/bill/*`, `payment-actions.ts`, `close-session-sheet.tsx`, `session-actions.ts` |
| Server action boundary | `order-actions.ts`, `menu-actions.ts`, `print-actions.ts` |

`pos-desktop-shell.tsx` is the largest risk. Refactor it by extracting workflow boundaries, not by rewriting behavior in one PR.

## Implementation Plan

### 4-Agent Debate Cadence

CLAUDE.md requires the 4-agent workflow (PM + BA + Senior Dev + QA/QC) for every non-trivial change. Cadence for this rebuild:

- The master debate that produced this plan counts as round 1.
- Run a fresh, scoped 4-agent debate at the START of each implementation PR/wave (one PR per Phase is the default; Phase 1 may split into 2 PRs if the coordinator extraction is too large).
- Do NOT debate per file or per small refactor inside a phase — the per-PR scope check is the unit.
- Each per-PR debate restates: surface, primary user job, change type, primitives, regression rules touched, and the subset of phases in scope. The synthesis becomes the PR description.

### Phase 0 - Baseline Audit

- Capture current POS states before code: no session, blocked no-open permission, table gate, new order, append, active orders, bill/payment.
- Compare against `docs/plan/ui-ux-page-contracts.md`.
- Note existing worktree changes and do not revert unrelated edits.

### Phase 1 - Shell Boundary Refactor

- Keep RSC loading in `page.tsx`.
- Keep `PosDesktopProvider` and route-local store.
- Split `pos-desktop-shell.tsx` toward named boundaries:
  - `ContextGate` — wrapper/orchestrator that composes the existing `PosTableGate` plus the service-mode `ToggleGroup`. Do NOT rename or fork `PosTableGate`; it stays the table-grid primitive.
  - `NewOrderWorkspace`
  - `ActiveOrdersWorkspace`
  - `AppendOrderWorkspace` — owns `appendDraftItems` / `appendSubmitting` local state. Move them out of the coordinator in this phase. Keep `useAppendTarget` (route-local) as the cross-component selector.
  - `PaymentWorkspace` if needed
- Preserve current state behavior while reducing coordinator size.

### Phase 2 - Session And Context Gate

- Make no-session blocked states direct and form-first.
- Remove the dead `steps?: PosStatusStep[]` prop from `PosStatusShell` (declared at `pos-status-shell.tsx` line ~30, never rendered) AND stop building 3-step `steps[]` arrays in `page.tsx` blocked branches (currently around lines 57-77, 96-117, 135-155). Drop the `PosStatusStep` type if no other caller remains.
- Keep `SessionGate` focused on terminal + opening cash.
- Keep service mode/table grid visible early on mobile.
- Preserve `MultiOrderTablePicker` and explicit occupied-table intent.
- `PosSessionHeader` keeps rendering `EmployeePortalBackControl` in this phase. If a follow-up UX decision moves the back-control to a layout-level slot, that is a separate task.

### Phase 3 - New Order Workspace

- Keep menu/search/category as the main mobile workspace.
- Keep `Giỏ đơn mới` copy exclusive to unsubmitted orders.
- Ensure mobile action bar never covers reachable content.
- Prefer real shadcn primitives for list rows, status chips, actions, empty/loading/error states.
- Do not introduce a second visual source of workflow state.

### Phase 4 - Submitted Order Workspace

- Keep active orders separate from new-order cart.
- Keep order detail sheet as the hub for append, serve, transfer, cancel/void, bill/payment.
- Keep append draft independent from new-order cart.
- Keep destructive actions separated, confirmed, permission-gated, and auditable.

### Phase 5 - Payment, Invoice, And Close Shift

- Preserve `confirmCashPayment` and `confirmCashPaymentWithInvoice` boundaries.
- Preserve payment-first, invoice-fail-soft behavior.
- Ensure cash method is hidden/disabled without `canConfirmCash`.
- Keep close-shift UI hidden/disabled without `canCloseShift`.

### Phase 6 - Permission Flags

Mapping authority: `packages/shared/src/auth/permissions.ts` (`PERMISSION_KEYS`). Do NOT copy mappings from `docs/plan/ui-ux-page-contracts.md` — its POS table at lines 146-160 says "Open POS session = `pos:use`", which is stale. The current code uses `POS_OPEN_CASHBOX` (`pos:open_cashbox`) for `canOpenShift` (`fetchPosPermissionFlags` in `apps/web/app/br/[branchId]/pos/session-actions.ts` line ~207).

Current flags (already wired):

| Flag | Permission key | Constant | UI gate |
| --- | --- | --- | --- |
| `canOpenShift` | `pos:open_cashbox` | `POS_OPEN_CASHBOX` | Render `SessionGate` form vs. blocked state on no-session render |
| `canCloseShift` | `pos:close_shift` | `POS_CLOSE_SHIFT` | "Chốt ca" button + F10 shortcut |
| `canConfirmCash` | `pos:confirm_payment` | `POS_CONFIRM_PAYMENT` | "Tiền mặt" method on bill sheet |

Only add new flags when the UI exposes the action. Resolve each one to a key from `PERMISSION_KEYS`:

| Proposed flag | Permission key | Constant | UI gate |
| --- | --- | --- | --- |
| `canCreateOrder` | `orders:write` | `ORDERS_WRITE` | Cart submit |
| `canAppendItems` | `orders:write` | `ORDERS_WRITE` | "Thêm món" entry on order detail |
| `canVoidOrder` | `pos:void_order` (item) / `orders:void` (whole order) | `POS_VOID_ORDER` / `ORDERS_VOID` | Hủy món / Hủy đơn destructive actions |
| `canTransferTable` | `orders:write` | `ORDERS_WRITE` | Chuyển bàn |
| `canMarkServed` | `orders:write` | `ORDERS_WRITE` | Phục vụ |
| `canPrint` | `pos:print` (kitchen/bill) / `pos:reprint_receipt` (reprint) | `POS_PRINT` / `POS_REPRINT_RECEIPT` | Print/reprint actions on bill sheet |

Note: several proposed flags collapse to `orders:write`. Before adding all six, check whether one combined flag (e.g. `canMutateOrder`) covers the UI surface — duplicate flags that resolve to the same key add no real gating, only naming churn.

Server Actions remain authoritative. Never treat hidden UI as security.

### Phase 7 - Verification And Docs

- Run `pnpm typecheck && pnpm lint && pnpm build`.
- Browser-check mobile and desktop workflows.
- Update `docs/plan/ui-ux-page-contracts.md` only if workflow contract changes.
- Update `docs/modules/ui.md` only if a reusable UI pattern is introduced.
- Update `tasks/regressions.md` only for new reusable failure rules.

## Server And RPC Boundaries

| Workflow | UI entry | Server boundary |
| --- | --- | --- |
| New order | Cart submit | `submitOrder` -> `create_order` RPC |
| Append items | Append draft submit | `appendOrderItems` -> `append_order_items` RPC |
| Void item | Order detail destructive action | `voidOrderItem` -> RPC |
| Cancel order | Order detail destructive action | `cancelOrder` -> RPC |
| Transfer table | Order detail action | `transferOrderTable` -> RPC |
| Mark served | Order detail action | `updateOrderStatus(..., "served")` |
| Cash payment | Bill sheet cash confirm | `confirmCashPayment` -> `confirm_cash_payment` RPC |
| HĐĐT | After successful payment | `confirmCashPaymentWithInvoice` -> `createTaxInvoice` fail-soft |
| Close shift | Header/close sheet | `closePosSession` |

Multi-item writes must remain RPC-backed. Server Action inputs must remain Zod-validated and must never return raw Supabase/Postgres error messages.

## Regression Watchlist

- `DESIGN-SYSTEM-CONTRACT-FIRST`
- `NO-ARBITRARY-DIMENSIONS`
- `NO-SURFACE-THEME-IMPORTS`
- `NO-STATIC-UI-INLINE-STYLES`
- `NO-PRIMITIVE-DESIGN-OVERRIDE`
- `NO-FAKE-PRIMITIVES`
- `NO-LEGACY-APP-HELPERS` — mobile-first chrome (sticky header/footer, safe-area handling) is exactly where `app-*`, `safe-top`, `safe-bottom` historically reappeared. Use direct primitive composition.
- `TERMINOLOGY-SOURCE-OF-TRUTH`
- `POS-SESSION-SCOPE-PER-TERMINAL-NOT-PER-USER`
- `POS-CLOSE-SHIFT-UI-GATED`
- `POS-CONFIRM-CASH-GATED-BY-POS-CONFIRM-PAYMENT`
- `POS-MULTI-ORDER-PER-TABLE-NEW-INTENT-EXPLICIT`
- `POS-PAYMENT-REUSE-UNIQUE-SLOT`
- `PAYMENT-AUTO-COMPLETES-ORDER`
- `POS-SERVED-NOT-TABLE-TERMINAL`
- `HDDT-PAYMENT-FIRST-FAILSOFT-ORPHAN`
- `HDDT-FORM-PAYLOAD-FREEZE-AT-CLICK`

## QA Plan

### Viewports

- `360x780`
- `390x844`
- `430x932`
- `768x1024`
- `1440x900`

### Required Workflows

1. No-session: open POS session from available terminal.
2. No-session blocked: user without `pos:open_cashbox` sees one direct blocked state.
3. Terminal unavailable: all terminals busy or no terminal configured.
4. Dine-in: select table, add item, customize, add note, submit.
5. Takeaway: switch service mode before cart has items, submit without table.
6. Cart lock: changing order type/table does not corrupt an active draft.
7. Submit success: cart clears, active order opens, KDS/printer warnings are safe toasts.
8. Append: start from detail, select menu items, review append draft, `Gửi món thêm`.
9. Multi-order table: tap occupied table, open existing order or explicitly create new order.
10. Served-but-unpaid: remains in active orders until payment.
11. Payment: cash method respects `canConfirmCash`, payment closes order commercially.
12. HĐĐT: invoice failure after cash payment does not roll back payment.
13. Close shift: close action and F10 shortcut are hidden/disabled without `canCloseShift`.
14. Waiter rides cashier session: log in as waiter (only `pos:use`, no `pos:open_cashbox` / `pos:close_shift` / `pos:confirm_payment`) while cashier has an open session. Waiter can submit orders and confirm VietQR/MoMo, but `Chốt ca` button + F10 shortcut are absent and the cash method on the bill sheet is hidden/disabled. Covers regression `POS-SESSION-SCOPE-PER-TERMINAL-NOT-PER-USER`.
15. Payment slot reuse: open bill sheet, preview VietQR (creates a pending payment row), switch to Cash, confirm. No `idx_payments_order_active` duplicate-key error; the existing pending row is reused, not re-inserted. Covers regression `POS-PAYMENT-REUSE-UNIQUE-SLOT`.
16. HĐĐT payload freeze: enter MST + buyer info, click "Đã thanh toán", then attempt to edit MST or buyer name while MISA is in flight. Form inputs are disabled; the submitted payload uses the snapshot taken at click. Covers regression `HDDT-FORM-PAYLOAD-FREEZE-AT-CLICK`.

### Accessibility Checks

- Touch targets are practical for frontline mobile use.
- Focus is visible for buttons, tabs, drawers, sheets, dialogs, and menu items.
- Sheet/Dialog focus traps correctly and closes with Escape.
- Focus returns to a sensible trigger after close when feasible.
- Icon-only buttons have accessible names.
- Status is not color-only.
- Shortcuts do not fire inside input/textarea/contenteditable except documented cases.
- Reduced motion is respected.

## Acceptance Criteria

- Mobile first viewport shows the next safe action for every POS state.
- Desktop adds density but does not create a different IA.
- Cart is only `Giỏ đơn mới`.
- Submitted order mutations live in detail/history/bill flows.
- Payment-close, served, table-release, multi-order, cash permission, and HĐĐT fail-soft semantics are preserved.
- No client component imports the `@comtammatu/database` barrel.
- No localStorage or React Context stores branch/session/table authority.
- No fake primitive, route theme, arbitrary Tailwind dimension, static presentation inline style, or vocabulary drift is introduced.
- `pnpm typecheck && pnpm lint && pnpm build` passes before implementation is marked complete.

## Prompt For Next Agent

```text
You are the implementation agent for the POS Mobile-First Workflow rebuild in C:\Users\MATU\Downloads\comtammatu.

Read, in order:
1. AGENTS.md
2. docs/agent/rules/engineering.md
3. docs/agent/rules/database.md
4. docs/agent/rules/ui.md
5. docs/agent/rules/workflow.md
6. docs/agent/rules/references.md
7. docs/spec/design-system.md
8. docs/modules/ui.md
9. tasks/regressions.md
10. docs/plan/pos-mobile-first-workflow-rebuild.md
11. docs/plan/ui-ux-page-contracts.md POS section
12. docs/plan/m2-order-lifecycle.md
13. docs/plan/m2-ext2-table-bill-ops.md

Scope only /br/[branchId]/pos. Do not rebuild KDS/Admin/Inventory/Employee in this task.

Use the current runtime UI contract: shadcn radix-lyra, preset b6G3vbGue, neutral, lucide. Do not invent a new theme, route CSS layer, fake primitive, raw status palette, or new vocabulary source.

Before editing code, run the 4-agent workflow required by docs/agent/rules/workflow.md unless the task is documentation-only. Cadence: one per PR/wave (typically one per Phase), not per file. State:
- surface: /br/[branchId]/pos
- primary user job: cashier/waiter creates and manages POS orders quickly on mobile
- route family: branch POS
- change type: visual refactor + UX flow cleanup + copy cleanup, behavior preserved unless explicitly called out
- primitives: Button, Badge, ToggleGroup, Tabs, Sheet, Drawer, Dialog, AlertDialog, InputGroup, Item, Card, Empty, Spinner, Skeleton, ScrollArea
- regression rules touched from tasks/regressions.md
- permission keys touched, resolved against packages/shared/src/auth/permissions.ts (NOT against the stale POS table in docs/plan/ui-ux-page-contracts.md lines 146-160)

Implementation sequence:
1. Audit current POS state screenshots and note dirty worktree changes. Do not revert unrelated edits.
2. Refactor pos-desktop-shell.tsx into smaller workflow boundaries without changing behavior.
3. Make no-session and context/table gate mobile-first.
4. Keep cart only for new order creation.
5. Keep append as explicit append draft started from order detail/history.
6. Keep order mutations/payment in order detail/history/bill flows.
7. Expand permission flags only where UI exposes actions.
8. Preserve all Server Action/RPC/Zod boundaries.

Never import @comtammatu/database barrel in client components. Never store branch/session/table authority in localStorage or React Context. Branch stays route param; table selection stays URL ?table= plus server validation. Multi-item writes stay in RPCs. Do not expose raw Supabase/Postgres errors.

Before completion run pnpm typecheck && pnpm lint && pnpm build and perform mobile/desktop browser verification for no-session, table gate, new order, append, active orders, bill/payment, and close shift.
```

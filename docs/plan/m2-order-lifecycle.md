# M2-Ext: POS Order Lifecycle

> Status: PLANNED | Depends: M2 (SHIPPED), M3 (SHIPPED)
> Branch: main
> Reviews: CEO (SELECTIVE EXPANSION) + Eng (CLEAR) + Design (8/10)
> Design doc: ~/.gstack/projects/comtammatu-comtammatu/luongthebinh-main-design-20260406-182451.md

## Problem

After order submit, staff cannot modify orders. "Them mon" (add items) is the #1 pain point.
Current workaround: create a second separate order, causing billing errors, KDS confusion, and reconciliation drift.
Pattern: dine-in customers order com suon first, then add nuoc mia/canh/trung op la after food arrives.

## Scope

**PR1 (ship first, observe on floor):**

- Append items to existing order
- Order notes in cart UI (expose existing `note` field)
- Item-level status in order history
- Sync trigger: kds_tickets.status -> order_items.status

**PR2 (after floor validation of PR1):**

- Void item (role-based auth, manager+ required)
- Cancel entire order (role-based auth + reason)
- Transfer table
- Quick reorder from order history
- Update order status from POS (served/completed)

## Key Decisions (from reviews)

| #   | Decision                                    | Source            | Rationale                                                                                            |
| --- | ------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------- |
| 1   | Role-based auth, NOT manager PIN            | CEO outside voice | Simpler for pilot. Manager+ role check is sufficient. No pgcrypto/PIN infrastructure needed.         |
| 2   | 2 PRs with observation gap                  | CEO review        | Ship them mon, watch staff use it, then ship void/cancel/transfer.                                   |
| 3   | Reuse route_order_to_kds                    | Eng review        | ON CONFLICT DO NOTHING skips existing tickets. No new routing function needed.                       |
| 4   | Add sync trigger kds_tickets -> order_items | Eng review        | order_items.status never updated by KDS bump. Breaks void guard + item status display.               |
| 5   | Order-level advisory lock                   | Eng review        | pg_advisory_xact_lock(order_id) for mutations. Branch-level lock serializes all orders.              |
| 6   | Tax stays 0                                 | Eng review        | create_order sets tax_amount=0. No tax_rate field exists. Match existing behavior.                   |
| 7   | Server-side price verification              | CEO outside voice | append RPC must fetch canonical prices from menu tables, ignore client prices. Same as create_order. |
| 8   | Sheet overlay for order detail              | Design review     | Reuse existing Sheet pattern from bill-receipt. Consistent.                                          |
| 9   | Button grouping: primary + overflow         | Design review     | Them mon (green, always visible), status row, rest in "Khac..." dropdown.                            |
| 10  | Auto-cancel on void last item               | CEO review        | Order with zero active items has no reason to exist. Free table.                                     |

## NOT in scope

- Split bill (requires order-splitting logic, complex financial reconciliation)
- Merge bill (requires order-merge logic)
- Split/merge table (multi-order table management)
- Quantity edit (void + re-add workflow is sufficient)
- Reopen completed order (rare, create new order instead)
- Change order type dine_in <-> takeaway (edge case)
- Refund (depends on M4 Payment)
- Manager PIN infrastructure (deferred, using role-based auth instead)
- DESIGN.md creation (defer to /design-consultation)

---

## PR1: Append Items + Order Notes + Item Status

### PR1-S1: Migration — Sync Trigger

**File:** `supabase/migrations/YYYYMMDD_order_items_kds_sync.sql`

```sql
-- Trigger: when kds_tickets.status changes, sync to order_items.status
-- kds_tickets.status: pending, preparing, ready, served
-- order_items.status: pending, preparing, ready, served, cancelled

CREATE OR REPLACE FUNCTION sync_order_item_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Only sync non-cancelled items (void sets cancelled directly)
  IF NEW.status != OLD.status THEN
    UPDATE order_items
    SET status = NEW.status, updated_at = now()
    WHERE id = NEW.order_item_id
      AND status != 'cancelled';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_sync_order_item_status
  AFTER UPDATE OF status ON kds_tickets
  FOR EACH ROW
  EXECUTE FUNCTION sync_order_item_status();
```

**Edge case:** Items with no kds_ticket (category not mapped to any station) stay 'pending' forever. Acceptable for now. These items don't pass through KDS at all.

### PR1-S2: Migration — append_order_items RPC

**File:** `supabase/migrations/YYYYMMDD_append_order_items.sql`

```sql
CREATE OR REPLACE FUNCTION public.append_order_items(
  p_order_id   BIGINT,
  p_items      JSONB
) RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER AS $$
```

**Logic:**

1. `pg_advisory_xact_lock(p_order_id)` — order-level lock
2. Validate order exists, tenant/branch match caller's JWT claims
3. Validate order.status IN ('new','confirmed','preparing','ready')
4. For each item in p_items:
   - Fetch `base_price` from `menu_items` WHERE is_active=true (RAISE if not found)
   - Fetch `price_adjustment` from `menu_item_variants` if variant_id provided
   - Fetch modifier prices from `menu_item_modifiers`
   - Calculate: `unit_price = base_price + variant_adj + modifier_sum`
   - Calculate: `subtotal = unit_price * quantity`
   - INSERT into `order_items` with status='pending'
5. Recalculate order totals:
   ```sql
   UPDATE orders SET
     subtotal = (SELECT COALESCE(SUM(subtotal), 0) FROM order_items WHERE order_id = p_order_id AND status != 'cancelled'),
     tax_amount = 0,  -- no tax rate yet
     total_amount = subtotal + service_charge - discount_amount,
     updated_at = now()
   WHERE id = p_order_id;
   ```
6. Route new items to KDS: `PERFORM route_order_to_kds(p_order_id)` — ON CONFLICT DO NOTHING skips existing
7. Log to order_status_history: note = 'items_added: Nuoc mia, Canh chua'
8. Return: `{order_id, subtotal, tax_amount, total_amount}`

**GRANT:** `GRANT EXECUTE ON FUNCTION append_order_items TO authenticated;`

### PR1-S3: Server Action — appendOrderItems

**File:** `apps/web/app/br/[branchId]/pos/actions.ts`

```typescript
const appendItemsSchema = z.object({
  orderId: z.coerce.number().int().positive({ error: "Invalid order ID" }),
  items: z
    .array(cartItemSchema)
    .min(1, { error: "At least one item required" }),
});

export async function appendOrderItems(
  branchId: number,
  orderId: number,
  items: CartItem[],
): Promise<ActionResult<{ subtotal: number; total_amount: number }>>;
```

**Logic:**

1. Zod validate inputs
2. getAuthContext(POS_ROLES) — any POS role can append
3. Verify branch_id matches JWT
4. Transform cart items to RPC JSONB format (same as submitOrder)
5. Call `supabase.rpc('append_order_items', { p_order_id, p_items })`
6. Return safe error messages

### PR1-S4: Server Action — fetchOrderDetail

**File:** `apps/web/app/br/[branchId]/pos/actions.ts`

```typescript
export async function fetchOrderDetail(orderId: number): Promise<ActionResult>;
```

Fetches order with items including `order_items.status` for item-level display.
Query: `orders` with `order_items(id, item_name, variant_name, quantity, unit_price, subtotal, modifiers, sides, note, status)`, `tables(number)`, `branches(name, address)`.

### PR1-S5: UI — Order Detail Sheet

**File:** `apps/web/app/br/[branchId]/pos/order-detail-sheet.tsx` (new)

```
┌──────────────────────────────────────────────────┐
│ Order #1-260406-001                            X │
│ Ban 5 | Dine-in | [Badge: Dang lam]             │
│ ─────────────────────────────────────────────── │
│                                                  │
│ ✓  Com Tam Suon Bi         x1      45,000d     │
│ ⏳  Canh Chua               x1      20,000d     │
│ ○  Nuoc Mia                x1      15,000d     │
│                                                  │
│ ─────────────────────────────────────────────── │
│ Tong cong:                         80,000d      │
│                                                  │
│ [Them mon]  (green, primary)                    │
│ [Phuc vu] [Hoan thanh]  (status, secondary)    │
│ [Khac...▾]  → Huy mon, Chuyen ban, Dat lai,   │
│               Huy don                            │
└──────────────────────────────────────────────────┘
```

**Components:**

- `Sheet` from shadcn (reuse bill-receipt pattern)
- Item list with status icons: `CheckCircle` (ready/served), `Loader2` (preparing), `Circle` (pending)
- Status icons have `aria-label` for accessibility
- "Them mon" button opens existing item customizer in append mode
- Loading state: spinner on button, disable during submission
- Success: toast "Da them [N] mon", refresh item list

**PR1 also includes:**

- Expose `note` textarea in `cart-sidebar.tsx` above "Dat mon" button
- Pass note to submitOrder (already supported in schema, just hidden in UI)

### PR1 Completion Criteria

- [ ] Sync trigger migration written
- [ ] append_order_items RPC with server-side price verification
- [ ] appendOrderItems Server Action with Zod validation
- [ ] fetchOrderDetail Server Action
- [ ] Order detail Sheet with item-level status icons
- [ ] "Them mon" flow: opens customizer -> submit -> KDS shows new tickets -> bill updated
- [ ] Order notes textarea exposed in cart
- [ ] `pnpm typecheck && pnpm lint && pnpm build` passes
- [ ] Manual QA: append items to confirmed order, verify KDS, verify bill total

---

## PR2: Void + Cancel + Transfer + Reorder + Status

> Ship after observing PR1 on the floor for at least 1 shift

### PR2-S1: Migration — kds_tickets cancelled + RPCs

**File:** `supabase/migrations/YYYYMMDD_order_lifecycle_pr2.sql`

**Changes:**

1. ALTER kds_tickets: add 'cancelled' to status CHECK constraint

   ```sql
   ALTER TABLE kds_tickets DROP CONSTRAINT kds_tickets_status_check;
   ALTER TABLE kds_tickets ADD CONSTRAINT kds_tickets_status_check
     CHECK (status IN ('pending', 'preparing', 'ready', 'served', 'cancelled'));
   ```

2. `void_order_item(p_order_item_id, p_reason, p_approved_by)` RPC
   - pg_advisory_xact_lock(order_id from item)
   - Validate item.status NOT IN ('served', 'cancelled')
   - Validate order.status IN ('new','confirmed','preparing','ready')
   - Validate p_approved_by has role IN ('owner','super_manager','branch_manager')
   - UPDATE order_items SET status='cancelled'
   - UPDATE kds_tickets SET status='cancelled' WHERE order_item_id = p_order_item_id
   - Recalculate order totals (same formula as append)
   - **Auto-cancel check:** if ALL order_items are 'cancelled', cancel the entire order + free table
   - Log to order_status_history
   - Return updated totals

3. `cancel_order(p_order_id, p_reason, p_approved_by)` RPC
   - pg_advisory_xact_lock(p_order_id)
   - Validate order.status NOT IN ('completed','cancelled')
   - Validate p_approved_by has role IN ('owner','super_manager','branch_manager')
   - UPDATE all order_items SET status='cancelled'
   - UPDATE all kds_tickets SET status='cancelled'
   - UPDATE orders SET status='cancelled'
   - Free table: UPDATE tables SET status='available' WHERE id = order.table_id AND no other open orders
   - Log to order_status_history with reason
   - Return success

4. `transfer_table(p_order_id, p_new_table_id)` RPC
   - Validate order is dine_in, not completed/cancelled
   - Validate new table exists in same branch
   - UPDATE orders SET table_id = p_new_table_id
   - Free old table (conditional)
   - Occupy new table
   - Log to order_status_history
   - Return success

5. `update_order_status(p_order_id, p_new_status)` RPC
   - Validate status transition is valid (state machine)
   - For 'completed': guard that ALL order_items are in terminal state (ready, served, cancelled)
   - For 'served'/'completed': free table if applicable
   - Log to order_status_history
   - Return success

**GRANT all to authenticated.**

### PR2-S2: Server Actions

**File:** `apps/web/app/br/[branchId]/pos/actions.ts`

```typescript
// Void: requires manager+ role (getAuthContext checks this)
export async function voidOrderItem(
  branchId: number,
  orderItemId: number,
  reason: string,
): Promise<ActionResult>;

// Cancel: requires manager+ role
export async function cancelOrder(
  branchId: number,
  orderId: number,
  reason: string,
): Promise<ActionResult>;

// Transfer: any POS role
export async function transferTable(
  branchId: number,
  orderId: number,
  newTableId: number,
): Promise<ActionResult>;

// Status update: any POS role
export async function updateOrderStatus(
  branchId: number,
  orderId: number,
  newStatus: string,
): Promise<ActionResult>;

// Quick reorder: any POS role
export async function fetchOrderItemsForReorder(
  orderId: number,
): Promise<ActionResult>;
```

**Void/Cancel auth pattern:**

```typescript
// Instead of manager PIN, check caller's role
const ctx = await getAuthContext(["owner", "super_manager", "branch_manager"]);
if (!ctx) return { success: false, error: "Can quyen quan ly de thuc hien" };
// Pass ctx.user.id as approved_by to the RPC
```

### PR2-S3: UI Components

**Void item dialog:**

```
┌──────────────────────────────┐
│ Huy mon: Com Tam Suon Bi    │
│                              │
│ Ly do: [________________]   │
│        (required)            │
│                              │
│ [Huy bo]     [Xac nhan huy] │
└──────────────────────────────┘
```

- Only visible to manager+ roles (check from auth context)
- Reason field required (Zod min(1))
- On success: item shows strikethrough + "DA HUY" badge
- On last item void: toast "Don hang da tu dong huy"

**Cancel order dialog:**

```
┌──────────────────────────────┐
│ Huy don hang #1-260406-001?  │
│                              │
│ Ly do: [________________]   │
│                              │
│ ⚠ Tat ca mon se bi huy.     │
│ Ban se duoc giai phong.      │
│                              │
│ [Huy bo]     [Xac nhan huy] │
└──────────────────────────────┘
```

**Table transfer:**

- "Chuyen ban" in "Khac..." dropdown
- Opens table picker (reuse fetchTablesForBranch)
- Shows available tables only
- On success: toast "Da chuyen sang ban [N]"

**Quick reorder:**

- "Dat lai" in "Khac..." dropdown or on order history item
- Calls fetchOrderItemsForReorder
- Filters out deactivated menu items, warns: "X mon khong con trong menu"
- Pre-fills cart with remaining items (current canonical prices)
- User reviews cart, can modify, then submits normally

**Update order status:**

- "Phuc vu" button: marks order as 'served'
- "Hoan thanh" button: marks order as 'completed', frees table
- "Hoan thanh" disabled if any items are still preparing (guard from RPC)

**KDS void display:**

- In `kds-board.tsx`: when kds_ticket.status changes to 'cancelled' via realtime
- Show red "DA HUY" overlay on the ticket card
- setTimeout(30000) to fade the overlay
- Audio: no sound for void (optional, defer)

### PR2 Completion Criteria

- [ ] kds_tickets 'cancelled' status migration
- [ ] void_order_item RPC with auto-cancel check
- [ ] cancel_order RPC with table free
- [ ] transfer_table RPC with conditional table status
- [ ] update_order_status RPC with item-terminal guard
- [ ] All 5 Server Actions with Zod + role checks
- [ ] Void dialog with reason field
- [ ] Cancel dialog with warning
- [ ] Table transfer picker
- [ ] Quick reorder with stale item filter
- [ ] Status buttons (phuc vu / hoan thanh)
- [ ] KDS "DA HUY" overlay
- [ ] `pnpm typecheck && pnpm lint && pnpm build` passes
- [ ] Manual QA: full lifecycle test (create -> append -> void -> serve -> complete -> table freed)

---

## Interaction States

| Feature            | Loading                   | Empty            | Error                     | Success                          | Partial                 |
| ------------------ | ------------------------- | ---------------- | ------------------------- | -------------------------------- | ----------------------- |
| Them mon           | Spinner, disable btn      | N/A              | Toast + reason, re-enable | Toast "Da them", refresh         | N/A                     |
| Huy mon            | Spinner, dim item         | N/A              | Toast "Loi", restore      | Strikethrough + DA HUY           | N/A                     |
| Huy don            | Confirm dialog, dim sheet | N/A              | Toast, keep dialog        | Sheet closes, toast              | N/A                     |
| Chuyen ban         | Table picker loading      | "Khong co ban"   | Toast "Loi"               | Toast "Da chuyen", update header | N/A                     |
| Dat lai            | Cart loading              | Past order empty | Toast "Loi"               | Cart pre-filled                  | Items filtered, warning |
| Item status        | Skeleton rows             | "Chua co mon"    | N/A                       | Status icons                     | Mixed (normal)          |
| Phuc vu/Hoan thanh | Spinner on btn            | N/A              | Toast (items in-flight)   | Badge updates                    | N/A                     |

## Existing Code Reused

| Pattern            | Source                           | Used in                        |
| ------------------ | -------------------------------- | ------------------------------ |
| Atomic RPC         | create_order                     | append, void, cancel, transfer |
| KDS routing        | route_order_to_kds (ON CONFLICT) | append (re-call)               |
| Cart item schema   | types.ts cartItemSchema          | append items validation        |
| Price verification | create_order menu lookup loop    | append RPC                     |
| Audit trail        | order_status_history             | all mutations                  |
| Table picker       | fetchTablesForBranch             | transfer table                 |
| Sheet overlay      | bill-receipt.tsx                 | order detail view              |
| Status badges      | order-history.tsx                | item status icons              |

## State Machine (updated)

```text
                    ┌──────────┐
                    │   new    │
                    └────┬─────┘
                         │ confirm
                    ┌────▼─────┐
            ┌───────│confirmed │
            │       └────┬─────┘
            │            │ KDS bump
            │       ┌────▼─────┐
   cancel   │  ┌────│preparing │
   (mgr+)   │  │    └────┬─────┘
            │  │         │ KDS bump all
            │  │    ┌────▼─────┐
            │  │    │  ready   │
            │  │    └────┬─────┘
            │  │         │ POS: phuc vu
            │  │    ┌────▼─────┐
            │  │    │  served  │
            │  │    └────┬─────┘
            │  │         │ POS: hoan thanh (all items terminal)
            │  │    ┌────▼─────┐
            │  └───►│completed │ (terminal, frees table)
            │       └──────────┘
            │       ┌──────────┐
            └──────►│cancelled │ (terminal, mgr+ role + reason, frees table)
                    └──────────┘

  At any non-terminal state (not served for append/void):
    [Them mon]   → append items, route to KDS
    [Huy mon]    → void single item (mgr+ role, auto-cancel if last)
    [Chuyen ban] → update table_id (including served state)
```

## Data Flow: Append Items

```text
POS UI                Server Action           RPC                    KDS
  │                       │                    │                      │
  │ tap "Them mon"        │                    │                      │
  │ select items in       │                    │                      │
  │ customizer            │                    │                      │
  │ tap submit            │                    │                      │
  ├──────────────────────►│                    │                      │
  │                       │ Zod validate       │                      │
  │                       │ getAuthContext      │                      │
  │                       │ transform items     │                      │
  │                       ├───────────────────►│                      │
  │                       │                    │ advisory lock(order)  │
  │                       │                    │ validate status       │
  │                       │                    │ verify prices (menu)  │
  │                       │                    │ INSERT order_items    │
  │                       │                    │ recalc totals         │
  │                       │                    │ route_order_to_kds    │
  │                       │                    │  (ON CONFLICT skip)   │
  │                       │                    │ log status_history    │
  │                       │◄───────────────────┤                      │
  │◄──────────────────────┤                    │                      │
  │ toast "Da them"       │                    │    realtime event     │
  │ refresh order detail  │                    ├─────────────────────►│
  │                       │                    │    new kds_tickets    │
  │                       │                    │    (for new items)    │
```

## QA Test Plan

### PR1 Tests

1. Happy path: create order -> them mon (add 2 items) -> verify bill total updated
2. KDS: new items appear as new tickets under same order number
3. Order notes: add note in cart, verify it shows in bill receipt
4. Item status: bump items in KDS, verify POS shows updated icons (checkmark/spinner)
5. Edge: append to 'served' order (should reject)
6. Edge: append with deactivated menu item (should reject with error)
7. Edge: concurrent append while KDS bumping (advisory lock handles)
8. Edge: double-click submit (loading state prevents)

### PR2 Tests

1. Void: void pending item -> strikethrough + DA HUY -> bill total decreased
2. Void: non-manager attempts void (should show "Can quyen quan ly")
3. Void: void last item -> order auto-cancels -> table freed
4. Void: void served item (should reject "Khong the huy mon da phuc vu")
5. Cancel: cancel order -> all items cancelled -> table freed -> KDS tickets cancelled
6. Transfer: transfer to available table -> old table freed -> new table occupied
7. Transfer: transfer takeaway order (should reject)
8. Reorder: reorder from past order -> cart pre-filled
9. Reorder: reorder with deactivated items -> warning + filter
10. Status: mark served -> mark completed -> table freed
11. Status: complete with items still preparing (should reject)
12. Full lifecycle: create -> append -> void 1 item -> KDS bump rest -> serve -> complete

## Failure Modes

| Codepath                              | Failure               | Handled?             | User sees              |
| ------------------------------------- | --------------------- | -------------------- | ---------------------- |
| append: menu item deactivated         | Price lookup fails    | YES (RAISE)          | Error toast            |
| append: concurrent KDS bump           | Race on totals        | YES (advisory lock)  | Transparent            |
| void: item already served             | Guard rejects         | YES (status check)   | Error toast            |
| void: last item voided                | Auto-cancel triggered | YES (in RPC)         | Toast "Don da huy"     |
| cancel: order already completed       | Guard rejects         | YES (status check)   | Error toast            |
| transfer: target table occupied       | Status check          | YES (warning)        | Warning toast          |
| reorder: stale menu items             | Filter + warn         | YES (filter)         | Warning + partial cart |
| complete: items in-flight             | Terminal guard        | YES (RPC check)      | Error toast            |
| sync trigger: item with no KDS ticket | Trigger doesn't fire  | ACCEPTABLE           | Item stays 'pending'   |
| route_order_to_kds: station deleted   | FK violation possible | GAP (handle in impl) | 500 error              |

## GSTACK REVIEW REPORT

| Review        | Trigger               | Why                             | Runs | Status       | Findings                            |
| ------------- | --------------------- | ------------------------------- | ---- | ------------ | ----------------------------------- |
| CEO Review    | `/plan-ceo-review`    | Scope & strategy                | 1    | OPEN         | 5 proposals, 5 accepted, 7 deferred |
| Codex Review  | `/codex review`       | Independent 2nd opinion         | 0    | --           | --                                  |
| Eng Review    | `/plan-eng-review`    | Architecture & tests (required) | 1    | CLEAR (PLAN) | 7 issues, 1 critical gap            |
| Design Review | `/plan-design-review` | UI/UX gaps                      | 1    | CLEAR (FULL) | score: 5/10 -> 8/10, 4 decisions    |
| DX Review     | `/plan-devex-review`  | Developer experience gaps       | 0    | --           | --                                  |

**VERDICT:** CEO + ENG + DESIGN CLEARED. Ready to implement.

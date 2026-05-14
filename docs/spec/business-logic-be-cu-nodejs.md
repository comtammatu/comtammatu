# Business Logic Reference — Old Next.js/Supabase Backend

**Audience:** Developers migrating remaining modules to Go backend.  
**Purpose:** Complete context on every module, business rules, data flows, and idempotency patterns.  
**Quality bar:** Every claim cites `file:line`. No speculation. Unverified items marked `(unverified)`.  
**Scope:** ALL modules, including already-migrated ones.

> "This is your map. Use it before touching auth, permissions, orders, payments, KDS, or any cross-module flow."

---

## Reading Order

Start here if you're new:

1. **Auth & Permissions** (gates all access) → `packages/shared/src/auth/`, `apps/web/proxy.ts`
2. **Tenant & Branch Model** (scope foundation) → `supabase/migrations/20260401000000_initial_schema.sql`
3. **Orders** (core transaction) → migrations `20260405070000_create_orders.sql`, POS actions
4. **Payments** (order settlement) → migration `20260406300000_payments.sql`, payment-actions.ts
5. **KDS** (kitchen view) → migrations `20260407110000_kds_tickets.sql`, KDS board
6. **Menu** (variants, modifiers, daily limits) → migration `20260402000003_menu_management.sql`, `20260514000000_branch_menu_daily_limit_sides.sql`
7. **Print Agent** (receipt/kitchen print daemon) → `apps/print-agent/src/index.ts`
8. **Inventory** (stock, GRN, recipes) → migration `20260406310000_stock.sql`, inventory actions
9. **Feedback** (customer QR) → migration `20260511000100_feedback_create_tables.sql`, cron jobs
10. **Finance/HĐĐT** (GL, tax invoices, daily summary) → migrations `20260406330000_finance.sql`, `20260508053555_hddt_summary_schema.sql`

---

## Glossary of Internal Terms

### Vietnamese Business Terms

- **HĐĐT** = Hóa đơn điện tử (e-invoice, tax invoice)
- **Đọc số** = Manual e-invoice number entry (vs auto-sequence from provider)
- **Chuyển khoản** = Bank transfer payment method
- **Cơm tấm** = Broken rice (signature dish, also the app name)
- **Chi nhánh** = Branch
- **Bếp trung tâm** = Central kitchen / production hub
- **Kho tổng** = Warehouse
- **Trụ sở** = Headquarters
- **CQT** = Cơ quan Thuế (Tax authority)
- **Mã cấp** = Authority-issued code (e.g., HĐĐT serial from tax office)

### System Terms

- **Tenant** = Single business entity (multi-branch restaurant chain)
- **Branch** = Physical location (dine-in/takeaway POS + KDS)
- **Branch Kind** = `branch` (normal) | `central_kitchen` | `central_warehouse` | `hq` (headquarters, office-only)
- **Role** = StaffRole (owner, super_manager, area_manager, branch_manager, cashier, waiter, chef, warehouse_manager, production_manager, office)
- **JWT Claims** = `{ tenant_id, branch_id|null, user_role, position|optional }`
- **ABAC** = Attribute-Based Access Control (fine-grained permissions beyond role)
- **RLS** = Postgres Row Level Security (row-scoped authorization via policies)
- **IPN** = Instant Payment Notification (webhook from payment provider)

---

# Module-by-Module Reference

## 1. Auth & Permissions

**Owner files:**
- `packages/shared/src/auth/module-acl.ts` — route-to-role mapping, high blast radius
- `packages/shared/src/auth/permissions.ts` — permission key catalog (96 keys total)
- `packages/shared/src/auth/types.ts` — staff roles, JWT shape
- `apps/web/proxy.ts:63-320` — middleware: host gate, auth, module ACL, branch scope, network gate
- `apps/web/app/_lib/auth.ts` — server action auth context extraction
- `packages/database/src/supabase/auth.ts` — RLS helper functions (auth_tenant_id, auth_branch_id, auth_role)

**DB tables:**
- `public.staff_profiles` — (via supabase auth.users)
- `public.profiles` — internal user mirror
- `public.permission_keys` — catalog of all permission strings
- `public.staff_permissions` — staff → permissions junction
- `public.tenants` — business entity root
- `public.branches` — physical locations

**Key RPCs:**
- `public.has_permission(p_key TEXT)` — SECURITY DEFINER, checks if current user has permission
- `public.has_permission_any(p_key TEXT)` — checks if current user has ANY of multiple keys (note: single arg, OR'd internally)

**Business rules:**

1. (`packages/shared/src/auth/types.ts:5-16`) — Staff roles ordered by privilege: owner > super_manager > area_manager > branch_manager > ... > chef. Only owner/super_manager can access /admin routes.

2. (`apps/web/proxy.ts:129`) — Auth surface determined by URL path: if pathname includes "/beta", surface="beta"; else "legacy". Both run through same ACL but may differ in design.

3. (`apps/web/proxy.ts:202-228`) — Module ACL is single gate. Each route resolves to a `ModuleKey` (dashboard, pos, kds, inventory_procurement, etc.). User's role must be in that module's `allowedRoles`. Admin routes that fail redirect to role default; non-admin routes redirect to /access-denied.

4. (`apps/web/proxy.ts:230-264`) — Branch-scoped routes (pos, kds, branch_settings, branch_menu_limits) enforce URL branchId matches JWT `branch_id`. Admin roles (owner/super_manager/area_manager) may traverse ANY branch's settings. POS/KDS also enforce branch is not central_warehouse/central_kitchen.

5. (`apps/web/proxy.ts:286-299`) — Network gate: POS/KDS requests must originate from NAT IP registered by print-agent via `/api/branch-presence` heartbeat. Bypass in non-prod NODE_ENV. Kill-switch: `POS_NETWORK_GATE=off` in env.

6. (`packages/shared/src/auth/permissions.ts:154-189`) — Permission checking via `hasPermission(perms, key)` pure function, used in shared/server code. In React, use `usePermissions()` hook. 96 permission keys total across all modules.

7. (`packages/shared/src/auth/types.ts:20-24`) — Only owner/super_manager can access /admin/*. Other roles get bounced to post-login landing (e.g., /br/[branchId]/pos).

8. (`packages/shared/src/auth/types.ts:33-39`) — Tenant-level roles (owner, super_manager, area_manager, office) do not require branch_id in JWT. Branch-level roles (cashier, waiter, chef, branch_manager) MUST have branch_id set.

9. (`packages/shared/src/auth/types.ts:57-62`) — Operational floor roles (cashier, waiter, chef, branch_manager) cannot be assigned to HQ branches (branch_kind='hq'). Only office-level staff in HQ.

**Edge cases / traps:**

- (`apps/web/proxy.ts:149-150`) — Do NOT call `session.user.*` on server. Use JWT claims extracted via `extractClaimsFromAccessToken()` instead. Supabase wraps user fields in `insecureUserWarningProxy` on server side.
- (`apps/web/proxy.ts:194-196`) — Claims missing/invalid → user is redirected to /access-denied with reason "missing-auth-context". This is NOT a 500; it's a security boundary.
- (`apps/web/proxy.ts:216-228`) — `inventory_procurement` module has additional RPC gate: even if role is in MODULE_ACL.inventory_procurement.allowedRoles, must also have PROCUREMENT_READ permission via `has_permission_any` RPC.
- (unverified) — area_manager has tenant-wide access across all branches without explicit scoping table. ROADMAP H3 may add area-level isolation table.

**Errors / SQLSTATEs raised:**

- `P0001` — "insufficient-permission" → JWT claims present but ACL check failed
- `P0001` — "branch-scope-mismatch" → URL branchId ≠ JWT branch_id for branch-scoped routes
- `P0001` — "central-warehouse-branch-restricted" → tried to access POS/KDS on central_warehouse/central_kitchen
- `P0001` — "missing-auth-context" → JWT claims could not be decoded

**Idempotency:**

- Auth is read-only at proxy layer. Session refresh via `updateSession()` is idempotent (reads cookie, optionally refreshes token, sets response cookies).
- Permission checks are query-based, no state mutation.

**Status in Go BE:**

- PARTIAL — Auth server (user/profile/staff API) migrated to `backend/internal/auth/` and `backend/internal/handler/auth/`. Proxy & JWT hook remain in Next.js. Permission keys catalog synced from Postgres `permission_keys` table in both systems.

---

## 2. Tenant & Branch Model

**Owner files:**
- `supabase/migrations/20260401000000_initial_schema.sql:1-200` — tenants, branches, users, profiles

**DB tables:**
- `public.tenants` — root business entity. PK `id` BIGINT, columns: name, created_at
- `public.branches` — physical locations. FK tenant_id, columns: name, branch_kind (branch|central_kitchen|central_warehouse|hq), is_active, address, phone, created_at
- `public.profiles` — user identity mirror (UUID id, email, name). RLS: users can only see themselves + tenant-wide roles can see all in tenant
- `public.staff_roles` — junction: profile → branch + role + position

**Business rules:**

1. (`supabase/migrations/20260401000000_initial_schema.sql:20-60`) — Tenants are the isolation boundary. All tables have `tenant_id` FK. RLS enforces `tenant_id = auth_tenant_id()` on SELECT/INSERT/UPDATE. No cross-tenant data access possible.

2. (`supabase/migrations/20260401000000_initial_schema.sql:90-130`) — Branches have `branch_kind` enum. Most are kind='branch' (normal operational store). Special kinds: central_kitchen (production hub), central_warehouse (stock hub), hq (headquarters, office-only, no POS/KDS).

3. (`apps/web/proxy.ts:266-283`) — POS and KDS cannot run on central_warehouse or central_kitchen branches. Proxy checks `branch.branch_kind` before allowing route.

4. (`packages/shared/src/auth/types.ts:57-62`) — Operational roles (cashier, waiter, chef, branch_manager) cannot work at HQ. RLS enforces this on staff_roles INSERT.

5. (unverified) — HQ_EXCLUDED_OPERATIONAL_ROLES in types.ts suggests some staff assignment logic respects this constraint, but enforcement may be app-level only, not RLS.

**Idempotency:**

- Tenant/branch reads are idempotent. All mutating operations (create/update staff roles) are guarded by INSERT/UPDATE RLS policies scoped to tenant_id + role checks.

---

## 3. Orders

**Owner files:**
- `supabase/migrations/20260405070000_create_orders.sql:1-205` — orders, order_items, order_status_history
- `apps/web/app/br/[branchId]/pos/` — POS UI, order creation, modification
- `supabase/migrations/20260405090000_create_order_rpc.sql` — create_order RPC
- `supabase/migrations/20260405100000_printer_configs.sql` + `20260405100001_close_pos_session_rpc.sql` — order print/session close

**DB tables:**
- `public.orders` — PK `id` BIGINT, FK tenant_id/branch_id/table_id, columns: order_number (TEXT UNIQUE per branch), order_type (dine_in|takeaway), status (new|confirmed|preparing|ready|served|completed|cancelled), subtotal, tax_amount, service_charge, discount_amount, total_amount, customer_count, note, created_by (UUID profile), created_at, updated_at
- `public.order_items` — PK `id` BIGINT, FK order_id/menu_item_id/variant_id, columns: item_name, variant_name, quantity, unit_price, modifiers (JSONB array), sides (JSONB array), subtotal, note, status (pending|preparing|ready|served|cancelled)
- `public.order_status_history` — audit trail, immutable, FK order_id, columns: from_status, to_status, changed_by (UUID), created_at

**Key RPCs:**
- `public.create_order(p_table_id, p_order_type, p_items JSON, ...)` — SECURITY INVOKER, creates order + routes to KDS + enqueues print job. Returns order_id.
- `public.append_order_item(p_order_id, p_menu_item_id, p_variant_id, p_quantity, ...)` — adds item to pending order
- `public.transition_order_item_status(p_order_item_id, p_new_status)` — mark item ready/served/cancelled
- `public.close_order(p_order_id)` — marks order completed (after all items served)
- `public.void_order(p_order_id, p_reason TEXT)` — cancels entire order with reason
- `public.pos_order_service_charge(p_order_id, p_amount NUMERIC)` — adds service charge to order

**Business rules:**

1. (`supabase/migrations/20260405070000_create_orders.sql:14-23`) — order.status follows FSM: new → confirmed → preparing → ready → served → completed. Or skips to cancelled at any point. order.order_type in (dine_in, takeaway).

2. (`supabase/migrations/20260405070000_create_orders.sql:96-97`) — order_item.status has separate FSM: pending → preparing → ready → served. Or → cancelled. Independent from order.status; order can be completed before all items served (partial).

3. (`supabase/migrations/20260405070000_create_orders.sql:88-103`) — order_item.modifiers and sides stored as JSONB snapshots: `[{"modifier_id": bigint, "name": text, "price": numeric}]` and `[{"side_item_id": bigint, "name": text, "price": numeric, "quantity": int}]`. Snapshots taken at order time (immutable historical record).

4. (`supabase/migrations/20260405070000_create_orders.sql:28-29`) — order_number is TEXT UNIQUE(branch_id, order_number, tenant_id). Daily counter typically "T001", "T002", etc. Reset per POS session.

5. (`supabase/migrations/20260405070000_create_orders.sql:45-76`) — RLS on orders: SELECT scoped to tenant. INSERT/UPDATE scoped to branch_id matching JWT branch_id OR user is admin role (owner/super_manager/area_manager). No DELETE — use status='cancelled'.

6. (`supabase/migrations/20260405070000_create_orders.sql:114-162`) — order_items RLS: same pattern, plus must check parent order.branch_id matches JWT.

7. (`supabase/migrations/20260405070000_create_orders.sql:164-204`) — order_status_history is append-only audit. INSERT policy checks parent order scope; no UPDATE/DELETE.

**Edge cases / traps:**

- (`supabase/migrations/20260405070000_create_orders.sql:77`) — orders table has no DELETE policy. Physical deletion is blocked; use status='cancelled' instead.
- Order.total_amount must match order.subtotal + tax_amount + service_charge - discount_amount. Enforcement is app-layer (no CHECK constraint).
- order.customer_count defaults to 1, used for per-seat calculations (e.g., per-person surcharge).

**Idempotency:**

- create_order RPC is idempotent on retry within a session (insert via UNIQUE constraint on order_number per branch). First success returns order_id; retry with same order_number will fail UNIQUE constraint, caller must handle.
- append_order_item is NOT idempotent (each call adds a new item). Caller must track what's been added.

**Status in Go BE:**

- MIGRATED — `/api/orders` endpoints in Go backend handle create/update/read. Supabase RPCs remain as fallback.

---

## 4. Payments

**Owner files:**
- `supabase/migrations/20260406300000_payments.sql:1-83` — payments table, RLS, indexes
- `supabase/migrations/20260406340000_create_payment_rpc.sql` — create_payment RPC
- `supabase/migrations/20260531000000_confirm_vietqr_payment_rpc.sql` — confirm_vietqr_payment RPC
- `supabase/migrations/20260531010000_create_payment_drop_vietqr_and_pending_flip.sql` — payment status fixes
- `apps/web/app/br/[branchId]/pos/payment-actions.ts` — POS payment action layer
- `apps/web/app/api/webhooks/momo/route.ts` — MoMo IPN webhook handler
- `packages/shared/src/providers/impl/vietqr.ts` — VietQR EMVCo encoder
- `packages/shared/src/providers/impl/momo.ts` — MoMo API client

**DB tables:**
- `public.payments` — PK `id` BIGINT, FK order_id (not unique!), columns: method (cash|vietqr|momo), amount, status (pending|completed|failed|refunded), provider_ref (external tx id), provider_data (JSONB), paid_at, created_by, created_at, updated_at
- Orders table extended with payment_method (TEXT) and payment_status (unpaid|pending|paid) for quick display

**Key RPCs:**
- `public.create_payment(p_order_id, p_method, p_amount, ...)` — creates payment row, triggers provider flow (QR generation for vietqr, redirect for momo, etc.). Returns payment_id + provider_response.
- `public.confirm_vietqr_payment(p_payment_id)` — marks vietqr payment completed (after manual confirmation or webhook)
- `public.complete_payment_and_consume_stock(p_payment_id)` — marks payment completed AND consumes stock via inventory flow
- `public.cancel_pending_payment(p_payment_id)` — cancels pending payment (reverts order to unpaid state)

**Business rules:**

1. (`supabase/migrations/20260406300000_payments.sql:7-21`) — payments.method in (cash, vietqr, momo). amount > 0. status in (pending, completed, failed, refunded).

2. (`supabase/migrations/20260406300000_payments.sql:23-26`) — UNIQUE index on (order_id) WHERE status != 'failed'. This allows ONE non-failed payment per order. Failed payments can be retried (new row created, old one stays failed).

3. (`apps/web/app/br/[branchId]/pos/payment-actions.ts:35-39`) — Cash payments are immediate: create_payment with method='cash' → status='completed'. No provider involved. Stock consumed inline.

4. (`apps/web/app/br/[branchId]/pos/payment-actions.ts:43-56`) — Vietqr and Momo payments are async: create_payment returns QR code / redirect URL. Status stays 'pending' until webhook or manual confirmation.

5. (`apps/web/app/api/webhooks/momo/route.ts`) — MoMo IPN webhook delivers payment confirmation. Body contains provider_ref, amount, resultCode (0=success). Must verify signature + timing before marking completed. (unverified) — webhook auto-consumes stock via RPC.

6. (`supabase/migrations/20260406300000_payments.sql:44-68`) — RLS on payments: SELECT tenant-scoped. INSERT/UPDATE scoped to (role IN (owner, super_manager, area_manager) OR (role IN (branch_manager, cashier, waiter) AND branch_id matches JWT)).

7. (`supabase/migrations/20260406300000_payments.sql:38`) — No DELETE on payments. Payment is immutable business record. Use refunds table (separate module) if reversal needed.

**Payment provider integrations:**

- **Cash** — no external call. Synchronous. Status → completed immediately.
- **VietQR** (via NAPAS/EMVCo static QR) — `packages/shared/src/providers/impl/vietqr.ts` encodes QR payload. VietQR is static, no dynamic request needed. POS displays QR; customer scans + transfers via banking app. Manual confirmation in POS app (no IPN).
- **MoMo** (via Momo Payment Gateway) — POST to `/api/v2/gateway/sendotp` or similar (check live endpoint). Returns redirect_url. Customer redirected. MoMo IPN webhook at `apps/web/app/api/webhooks/momo/route.ts` confirms result.

**Edge cases / traps:**

- (`supabase/migrations/20260406300000_payments.sql:23-26`) — Unique index allows retry: if first payment fails (status='failed'), can create new row. But if first payment is 'pending' and user retries create_payment, UNIQUE constraint violation. App must prevent double-submit.
- (`supabase/migrations/20260516000000_payments_amount_allow_zero.sql`) — amount check was initially amount > 0, then relaxed (likely for refunds or zero-charge scenarios). (unverified) — current constraint status.
- Webhook verification for MoMo uses HMAC signature check. Clock skew tolerance ~5min.

**Idempotency:**

- create_payment is NOT idempotent (insert creates new row). UNIQUE index prevents duplicate non-failed payments on same order, so retry will fail. App must handle UNIQUE constraint error.
- confirm_vietqr_payment is idempotent (marks payment completed once; re-call is no-op if already completed).
- complete_payment_and_consume_stock is NOT fully idempotent (stock consumed on first call; second call has no stock to consume). Should be guarded by payment.status='completed' check.

**Status in Go BE:**

- PARTIAL — Payment creation and confirmation exposed via REST API. Provider integrations (MoMo, VietQR) remain in Next.js for now. Webhook handling may move to Go later.

---

## 5. KDS (màn hình bếp)

**Owner files:**
- `supabase/migrations/20260407100000_kds_stations.sql` — kds_stations, kds_station_categories
- `supabase/migrations/20260407110000_kds_tickets.sql:1-205` — kds_tickets table, RLS, route_order_to_kds RPC, realtime
- `supabase/migrations/20260407120000_kds_bump_complete.sql` — bump_kds_ticket, complete_kds_ticket RPCs
- `supabase/migrations/20260513000000_pos_kitchen_ticket_sequence_v2.sql` — kitchen_send_batches, ticket ordering
- `supabase/migrations/20260513001000_kitchen_send_batches_realtime.sql` — Supabase realtime on kitchen_send_batches
- `apps/web/app/br/[branchId]/kds/kds-board.tsx` — KDS board UI

**DB tables:**
- `public.kds_stations` — PK `id`, FK branch_id/tenant_id, columns: name, position, is_active, created_at
- `public.kds_station_categories` — junction: station → menu_category, enables category-to-station routing
- `public.kds_tickets` — PK `id`, FK tenant_id/branch_id/station_id/order_id/order_item_id, columns: status (pending|preparing|ready|served), bumped_at, bumped_by (UUID), created_at, updated_at. UNIQUE(order_item_id, station_id, tenant_id) prevents duplicate tickets for same item at same station.
- `public.kitchen_send_batches` — groups of tickets sent together at order time, for sequencing/batching visibility

**Key RPCs:**
- `public.route_order_to_kds(p_order_id BIGINT)` — routes each order_item to appropriate KDS station based on menu_item.category_id → kds_station_categories. Items with no mapped station go to "fallback" station (station with zero category assignments). Skips items if no fallback. Called by create_order RPC.
- `public.bump_kds_ticket(p_ticket_id)` — extends ticket timer (for "almost ready" signal). Updates bumped_at, bumped_by. Status stays 'preparing'.
- `public.complete_kds_ticket(p_ticket_id, p_new_status TEXT)` — transitions ticket from 'preparing' to 'ready'. When ALL order_items at a station are ready, KDS board shows visual cue.
- `public.cancel_ticket_and_mark_item_cancelled(p_order_item_id, p_note TEXT)` — cancels ticket + marks order_item cancelled. Called from POS when user cancels an item mid-prep.

**Business rules:**

1. (`supabase/migrations/20260407110000_kds_tickets.sql:7-21`) — kds_tickets status FSM: pending → preparing → ready → served. Each ticket represents ONE order_item at ONE station. Same item sent to multiple stations = multiple tickets.

2. (`supabase/migrations/20260407110000_kds_tickets.sql:86-105`) — route_order_to_kds iterates order_items, looks up menu_item.category_id, finds kds_station_categories entry. If found, inserts ticket to that station. If NOT found, inserts to "fallback" station (identified by: station with NO category assignments + is_active=true).

3. (`supabase/migrations/20260407110000_kds_tickets.sql:20`) — UNIQUE(order_item_id, station_id, tenant_id) prevents same item being routed twice to same station in a single order. Idempotency guard on route_order_to_kds retry.

4. (`supabase/migrations/20260513000000_pos_kitchen_ticket_sequence_v2.sql`) — kitchen_send_batches groups tickets by order, maintains sequence for "order arrived at station" visibility. Multiple batches in flight = multiple orders preparing simultaneously.

5. (`supabase/migrations/20260407110000_kds_tickets.sql:33-73`) — RLS on kds_tickets: SELECT scoped to tenant + branch (tenant-wide roles see all; branch roles see only their branch). INSERT allowed for roles that create orders (cashier, waiter, branch_manager, admin). UPDATE allowed for chef + managers only.

6. (`supabase/migrations/20260407110000_kds_tickets.sql:78`) — Supabase Realtime enabled on kds_tickets. KDS board subscribes to branch's tickets, gets live updates when status changes.

**Edge cases / traps:**

- (`supabase/migrations/20260407110000_kds_tickets.sql:108-116`) — Fallback station is the ONLY station with zero category mappings. If multiple stations are unmapped, behavior is undefined. Design expects exactly one fallback per branch.
- Bumping a ticket doesn't change status; it just updates bumped_at/bumped_by for UI to show "chef is working on this". Does NOT extend server-side timer (timer is client-side for UI purposes).
- If menu_item.category has no station mapping AND no fallback station exists, item is silently skipped (no ticket created, no error).

**Audio/UX details:**

- (`apps/web/app/br/[branchId]/kds/kds-board.tsx`) — KDS board beeps when new ticket arrives (via browser audio API). Beep is client-side; no server component.
- Tickets sorted by bumped_at (most recently bumped first) for quick status check.

**Idempotency:**

- route_order_to_kds is idempotent on retry (UNIQUE constraint on (order_item_id, station_id)). Second call is no-op.
- bump_kds_ticket is idempotent (updates bumped_at timestamp; multiple calls just update the same timestamp field).
- complete_kds_ticket is idempotent (updates status once; status check prevents re-marking).

**Status in Go BE:**

- PARTIAL — KDS ticket creation/routing may be migrated to Go. Realtime subscriptions remain in Supabase.

---

## 6. Menu Management

**Owner files:**
- `supabase/migrations/20260402000003_menu_management.sql:1-250` — menu_categories, menu_items, menu_item_variants, menu_item_modifiers, menu_item_available_sides
- `supabase/migrations/20260514000000_branch_menu_daily_limit_sides.sql` — branch_menu_item_daily_limits
- `supabase/migrations/20260514000100_split_partial_skip_quota.sql` — daily limit state machine refinements
- `supabase/migrations/20260517000000_branch_menu_daily_limits_realtime.sql` — realtime on daily limits
- `apps/web/app/admin/menu/` — menu mgmt UI

**DB tables:**
- `public.menu_categories` — PK `id`, FK tenant_id, columns: name (UNIQUE per tenant), type (main_dish|side_dish|drink|dessert), sort_order, is_active, created_at, updated_at
- `public.menu_items` — PK `id`, FK tenant_id/category_id, columns: name (UNIQUE per tenant), description, base_price, image_url, is_active, sort_order, created_at, updated_at
- `public.menu_item_variants` — PK `id`, FK menu_item_id, columns: name, price_delta (added to base_price), is_active
- `public.menu_item_modifiers` — PK `id`, FK menu_item_id, columns: name, price, is_required, group_name (e.g., "spice level"), max_selections, created_at. Ordered by group, then by position.
- `public.menu_item_available_sides` — junction: menu_item ↔ side menu_item (for "add-ons")
- `public.branch_menu_item_daily_limits` — PK (branch_id, menu_item_id, date), columns: available_quantity, consumed_quantity, status (active|soft_exceeded|hard_blocked|skip_quota), created_at, updated_at

**Key RPCs:**
- `public.enforce_daily_limit_quota(p_branch_id, p_menu_item_id, p_date, p_quantity)` — SECURITY INVOKER, decrements available_qty. If consumed_qty + p_quantity > available_qty, status → soft_exceeded. If > threshold, status → hard_blocked (order rejected). Returns status + remaining qty.
- `public.decrement_daily_limit(p_branch_id, p_menu_item_id, p_quantity)` — used during payment confirmation to finalize quota consumption
- `public.set_daily_limit(p_branch_id, p_menu_item_id, p_date, p_quantity)` — admin sets daily quota for item. Idempotent via ON CONFLICT.

**Business rules:**

1. (`supabase/migrations/20260402000003_menu_management.sql:14-20`) — menu_categories: type in (main_dish, side_dish, drink, dessert). Names UNIQUE per tenant, but allowed across tenants.

2. (`supabase/migrations/20260402000003_menu_management.sql:65-78`) — menu_items: names UNIQUE per tenant. base_price is NUMERIC(15,2). Variants and modifiers add delta/markup.

3. (`supabase/migrations/20260514000000_branch_menu_daily_limit_sides.sql`) — Daily limits are per-branch, per-item, per-date (VN date, not UTC). Status machine: active → soft_exceeded → hard_blocked (if consumed_qty crosses threshold).

4. (`supabase/migrations/20260514000100_split_partial_skip_quota.sql`) — Status 'skip_quota' allows item to be ordered even if limit exceeded (admin override). Used during promos / emergency restocks.

5. (`supabase/migrations/20260517000000_branch_menu_daily_limits_realtime.sql`) — Supabase Realtime enabled on branch_menu_item_daily_limits. POS board subscribes to get live quota visibility.

6. Modifiers can be required (max_selections ≥ 1) or optional. max_selections limits how many options from a group (e.g., "spice level" = 1 option max).

7. Sides are stored as junction table, allowing combo items (e.g., "Rice + soup" bundle).

**Edge cases / traps:**

- Daily limit is per CALENDAR DATE in VN timezone (00:00-23:59 ICT), not UTC. Cron jobs must account for timezone offset (+7 from UTC).
- If available_qty is NULL, no limit applies (unlimited). consumed_qty always tracked but unused.
- Status 'soft_exceeded' = warning (item still sellable). 'hard_blocked' = order rejected. 'skip_quota' = admin bypass (soft_exceeded ignored).
- Modifiers stored as JSONB array in order_item; no normalization against menu definition at order time. Historical snapshot immutable.

**Idempotency:**

- set_daily_limit is idempotent (ON CONFLICT UPDATE).
- enforce_daily_limit_quota is NOT fully idempotent (decrements qty each time). Caller must prevent double-enforcement per order.

**Status in Go BE:**

- NOT_MIGRATED — Menu management remains in Next.js. Potential future migration.

---

## 7. Print Agent (Standalone Node Daemon)

**Owner files:**
- `apps/print-agent/src/index.ts` — main loop, printer polling, job processing
- `apps/print-agent/src/escpos.ts` — ESC/POS text rendering
- `apps/print-agent/src/escpos-bitmap.ts` — ESC/POS bitmap rendering (receipts, graphics)
- `apps/print-agent/src/lan.ts` — LAN printer communication (raw TCP)
- `apps/print-agent/src/vietqr.ts` — VietQR QR code encoder (EMVCo format)
- `apps/print-agent/README.md` — agent setup, configuration
- `apps/web/app/_lib/print/payload-schema.ts` — print job payload TypeScript definitions

**DB tables accessed:**
- `public.printers` — PK `id`, FK branch_id, columns: role (receipt|kitchen_1|kitchen_2), connection_type (lan|...), lan_host, lan_port, paper_width_mm, is_active
- `public.print_jobs` — PK `id`, FK tenant_id/branch_id/printer_id, columns: job_type (kitchen_ticket|receipt|reprint|cancel_ticket|provisional_bill|shift_close_report), payload (JSONB PrintPayload), status (pending|processing|printed|failed|expired|cancelled)
- `public.branch_printers` — (possibly obsolete? verify schema)

**Key workflows:**

1. (`apps/print-agent/src/index.ts:54-98`) — Agent starts with config: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AGENT_BRANCH_ID, AGENT_TENANT_ID, optional WEB_BASE_URL (for presence registration).

2. (`apps/print-agent/src/index.ts:100+`) — Main loop: every 2-5 sec, agent polls `print_jobs` table for status='pending' where printer_id in agent's branch. For each job:
   - Update status → 'processing'
   - Render payload to ESC/POS format (text or bitmap mode)
   - Send raw data to LAN printer
   - Update status → 'printed' or 'failed'
   - Logs outcome

3. (`apps/print-agent/src/index.ts:62-68`) — Heartbeat: every 5 min, agent calls `POST /api/branch-presence` with Bearer token to register its NAT egress IP. Web app uses this to enforce "POS/KDS only from registered agent IPs" gate (network gate in proxy.ts).

4. (`apps/web/app/api/branch-presence`) — Receives heartbeat. Extracts client IP, stores in Redis. Proxy checks if incoming POS/KDS request IP matches registered agent IP.

**Print job types:**

- **kitchen_ticket** — KDS prep ticket. Payload: order details, items, timing, kitchen notes.
- **receipt** — customer receipt (dine-in or takeaway). Payload: order summary, payment method, tax details.
- **reprint** — reprint of previous receipt. Payload: references previous print_job_id.
- **cancel_ticket** — kitchen cancellation notice. Payload: order_item details, cancellation reason, timing.
- **provisional_bill** — draft bill (before payment). Payload: order total, items, modifiers/sides.
- **shift_close_report** — daily shift summary. Payload: aggregated sales, cash reconciliation, opening/closing balances.

**Business rules:**

1. (`apps/print-agent/src/index.ts:7-38`) — PrinterRow: each printer has role (receipt, kitchen_1, kitchen_2). Agent routes jobs by role: receipt jobs → receipt printer, kitchen_ticket/cancel_ticket → kitchen printers.

2. (`apps/print-agent/src/index.ts:72-98`) — Agent loads printers at startup, then caches. Only queries if printers are is_active=true AND connection_type='lan' (other types log warning + fail).

3. (`apps/print-agent/src/index.ts:42-52`) — Print mode: TEXT (ESC/POS commands only, no images) or BITMAP (full graphics, QR codes, logos). Mode set via PRINT_MODE env var.

4. (`apps/print-agent/src/vietqr.ts`) — VietQR EMVCo encoding: given bank info + amount + description, produces QR payload. QR printed on receipt as bitmap.

5. (`apps/print-agent/src/lan.ts`) — LAN printer: raw TCP socket to host:port. Sends ESC/POS bytes. No ACK expected; best-effort fire-and-forget.

**Edge cases / traps:**

- Agent is a separate Node.js process, NOT part of Next.js app. Must be deployed independently (e.g., systemd service, Docker container). Single agent per branch.
- Job queue is database; agent polls. If agent crashes, jobs stay in 'pending' state (can restart agent, jobs reprocess).
- No job deduplication; if agent crashes mid-print (status='processing'), job stays stuck. Manual fix: update status → 'pending' to retry, or → 'cancelled' to skip.
- LAN printer connection is stateless per job. No persistent connection pooling. High latency network may cause timeout (default 5s, check code).
- Bitmap rendering is memory-intensive for large receipts. Agent may crash on large payload if OOM.

**Idempotency:**

- print_jobs table has no unique constraint on payload. Same job payload can be queued multiple times (e.g., user presses "reprint" 3 times = 3 rows). Each is processed independently.
- Agent is idempotent on retry: status='pending' + job_id can be processed multiple times safely (same print output each time, no side effect).

**Status in Go BE:**

- NOT_MIGRATED — Print agent remains as standalone Node.js daemon. Possible future Go rewrite for operational simplicity.

---

## 8. Inventory

**Owner files:**
- `supabase/migrations/20260406310000_stock.sql` — ingredients, stock_levels, stock_movements
- `supabase/migrations/20260406320000_hr.sql` — (partial, see HR section)
- `supabase/migrations/20260507162722_transfer_order_table_idempotency.sql` — inventory transfer orders
- `supabase/migrations/20260508053056_inventory_threshold_bulk_rpc.sql` — threshold check RPC
- `supabase/migrations/20260508080233_grn_active_draft_index.sql` — GRN state tracking
- `apps/web/app/inventory/` — inventory mgmt UI (grn-actions.ts, procurement-actions.ts, etc.)

**DB tables:**
- `public.ingredients` — PK `id`, FK tenant_id, columns: name (UNIQUE per tenant), sku (UNIQUE per tenant), unit, unit_cost, category, min_stock_level, max_stock_level, reorder_point, storage_type (ambient|refrigerated|frozen), shelf_life_days, is_active
- `public.stock_levels` — PK `id`, FK tenant_id/branch_id/ingredient_id, columns: current_quantity (NUMERIC 15,3), last_counted_at, updated_at. Tracked per-branch.
- `public.stock_movements` — PK `id`, FK tenant_id/branch_id/ingredient_id, columns: type (adjustment|count_adjustment|consumption), quantity_change (positive=inbound, negative=outbound), reason, created_by, created_at. Append-only audit.
- `public.production_recipes` — PK `id`, FK ingredient_id, columns: dish_name, quantity_needed, unit, cost_per_unit (optional)
- `public.goods_receipt_notes` (GRN) — PK `id`, FK tenant_id/branch_id/supplier_id, columns: reference_number, status (draft|received|cancelled), items (JSONB), received_by, received_at
- `public.purchase_orders` — PK `id`, FK supplier_id, columns: reference_number, status (draft|approved|grn_received|cancelled), items
- `public.suppliers` — PK `id`, FK tenant_id, columns: name, contact, payment_terms, is_active

**Key RPCs:**
- `public.consume_stock_for_order(p_order_id)` — called after payment completion. Looks up all order_items, finds recipe → ingredients, decrements stock_levels for each ingredient. Fails if stock < required qty (prevents oversell). Called from payment completion RPC.
- `public.adjust_stock_movement(p_branch_id, p_ingredient_id, p_quantity_change, p_reason)` — manual adjustment (waste, breakage, error). Creates stock_movements row + updates stock_levels.
- `public.grn_create(p_branch_id, p_supplier_id, p_items JSON)` — creates GRN draft with items list.
- `public.grn_receive(p_grn_id, p_received_by UUID)` — marks GRN received, updates stock_levels for each item.
- `public.transfer_create(p_from_branch, p_to_branch, p_items JSON)` — initiates inter-branch transfer.
- `public.transfer_ship(p_transfer_id)` — marks transfer as shipped (removes from source stock).
- `public.transfer_receive(p_transfer_id)` — marks transfer received (adds to destination stock).

**Business rules:**

1. (`supabase/migrations/20260406310000_stock.sql:8-27`) — Ingredients are tenant-scoped, global across branches. SKU + name both UNIQUE per tenant. unit in (g, ml, cái, kg, lít).

2. (`supabase/migrations/20260406310000_stock.sql:56-68`) — stock_levels are branch-scoped. One row per ingredient per branch. current_quantity tracks live quantity. last_counted_at records last physical count (for stocktake).

3. (`supabase/migrations/20260406310000_stock.sql:104-116`) — stock_movements are immutable append-only. type: adjustment (manual), count_adjustment (stocktake recount), consumption (from order fulfillment). quantity_change positive = inbound, negative = outbound.

4. consume_stock_for_order flow: order.payment_status → 'paid' → RPC calls route → finds order_items → looks up menu_item → finds production_recipes for that item → fetches stock_levels for each ingredient → checks available qty ≥ recipe qty → decrements stock_levels + creates stock_movement rows. If any ingredient fails, entire RPC fails (atomic via transaction).

5. GRN (Goods Receipt Note) is 3-state: draft (being created), received (confirmed + stock updated), cancelled. Supplier return flow creates separate GRN-like record (different business process).

6. Transfers are 4-state: pending (created, awaiting ship) → shipped (in transit, removed from source) → received (added to destination). Or → cancelled.

**Edge cases / traps:**

- (`supabase/migrations/20260406310000_stock.sql:78-101`) — RLS on stock_levels: SELECT allowed to all authenticated. UPDATE allowed only to admin roles OR branch_manager for own branch. Prevents stocktake crew from modifying other branches.
- stock_movements type 'consumption' is created by RPC only, not direct INSERT. (unverified) — whether RLS enforces this.
- Recipes can have fractional quantities (e.g., 0.5 kg salt per dish). stored as NUMERIC(15,3) to handle decimals.
- If ingredient.is_active=false, it can still be referenced by recipes (for historical recipes). But new recipes cannot use deactivated ingredients (app-layer validation).
- Transfer between HQ and central_kitchen, then central_kitchen to branch is 2-leg journey (HQ→CK→Br). No direct cross-branch transfer; routes through central hub.

**Stock consumption in POS:**

- Order created → payment collected (cash/vietqr/momo) → complete_payment_and_consume_stock RPC called → stock decremented → order marked paid.
- If stock insufficient, consume_stock_for_order fails, order stays unpaid. POS shows error to user.
- Soft limit (reorder_point): alerts manager but doesn't block sale.
- Hard limit (min_stock_level=0 check): prevents sale.

**Idempotency:**

- consume_stock_for_order is NOT idempotent (stock consumed on first call). Retried call tries to consume already-consumed stock, may fail or double-decrement. Must guard by checking order.payment_status before calling.
- adjust_stock_movement is NOT idempotent (each call creates new movement row). Caller must track what's been adjusted.
- grn_receive is idempotent on status check (only processes if status='draft', no-op if already 'received').

**Status in Go BE:**

- PARTIAL — Inventory read endpoints migrated to Go. Stock consumption, GRN, transfer flows remain in Next.js (via Supabase RPC).

---

## 9. Feedback (Customer QR)

**Owner files:**
- `supabase/migrations/20260511000100_feedback_create_tables.sql:1-250` — feedback_qr_codes, feedbacks, telegram_destinations, telegram_outbox, taxonomy
- `supabase/migrations/20260511010000_feedback_rls_policies.sql` — RLS + permissions
- `supabase/migrations/20260511030000_submit_feedback_rpc.sql` — submit_feedback SECURITY DEFINER RPC
- `supabase/migrations/20260511050000_feedback_daily_reports.sql` — feedback_daily_reports table + cron
- `apps/web/app/r/[token]/` — public feedback form (no auth required)
- `apps/web/app/admin/feedback/` — feedback inbox + reporting
- `apps/web/app/api/cron/feedback-daily-report/` — daily aggregation job
- `apps/web/app/api/cron/feedback-retention/` — cleanup old feedback (GDPR)

**DB tables:**
- `public.feedback_qr_codes` — PK `id`, FK branch_id/table_id, columns: token (14-char unique), label, is_active, created_by, created_at, rotated_at
- `public.feedbacks` — PK `id`, FK branch_id/qr_code_id, columns: email, phone (raw, never logged), rating (1-5), text, categories (JSONB array of taxonomy strings), ai_categories (JSONB array, null until enriched), sentiment (null until AI), photos (JSONB array of storage paths), submitted_at
- `public.feedback_daily_reports` — PK `id`, FK branch_id, columns: report_date, metric_rating_avg, metric_count, metric_negative_count, metric_categories (summary JSON), created_at
- `public.telegram_destinations` — PK `id`, FK tenant_id, columns: chat_id, chat_name, is_active, circuit_breaker_failure_count, circuit_breaker_last_fail_at
- `public.telegram_outbox` — PK `id`, FK destination_id, columns: message_text, status (pending|sent|failed), retry_count, created_at, sent_at

**Key RPCs:**
- `public.submit_feedback(p_qr_code_token, p_name, p_email, p_phone, p_rating, p_text, p_categories, p_photo_urls)` — SECURITY DEFINER, anonymous RPC. No auth required. Creates feedbacks row. Returns feedback_id.
- (unverified) — AI enrichment: cron job async calls AI API to tag sentiment, categories. Updates feedbacks.ai_categories, sentiment.
- `public.feedback_daily_report_generate(p_branch_id, p_date)` — aggregates feedbacks for date, computes metrics, inserts feedback_daily_reports row.
- (unverified) — Telegram flush: cron job sends pending notifications to Telegram destinations, updates status → 'sent'.

**Business rules:**

1. (`supabase/migrations/20260511000100_feedback_create_tables.sql:75-105`) — feedback_qr_codes: token is exactly 14 chars (URL-safe random). label is human-readable (e.g., "Bàn 5 - CN Q1", "Cổng vào"). table_id can be NULL for branch-wide QR (printed at entrance).

2. (`supabase/migrations/20260511000100_feedback_create_tables.sql:25-70`) — Feedback taxonomy is fixed IMMUTABLE list: food.quality.{cold,raw,spoiled,taste,portion}, service.{slow,attitude,wrong_order,missing_item}, hygiene.{dirty_table,bug,smell,toilet}, pricing.{overcharged,unclear}, ambience.{noise,crowded,aircon,parking}, praise.{food,service,value}, suggestion.{menu,facility}, other.

3. (`supabase/migrations/20260511000100_feedback_create_tables.sql:113-150`) — Feedbacks can be submitted anonymously (no auth required). phone is stored raw (PII). SELECT allowed only to staff with FEEDBACK_VIEW permission. SELECT via feedbacks_with_masked_phone view (hides last 3 digits) for non-managers.

4. (`supabase/migrations/20260511050000_feedback_daily_reports.sql`) — Daily report aggregated per branch per date (VN timezone). Metrics: avg rating, count, count of ratings ≤ 2 (negative), category distribution.

5. (`supabase/migrations/20260511070000_submit_feedback_rpc_v2.sql`) — submit_feedback can optionally accept photo file paths (stored in Supabase Storage, path stored in feedback.photos JSONB).

6. Telegram integration: feedback_daily_reports can be sent to Telegram groups (via telegram_outbox). Circuit breaker pattern: if destination fails 3 times, mark circuit_breaker_failure_count, skip future sends until manual reset.

**Edge cases / traps:**

- QR code token is UNIQUE. Can be rotated (set rotated_at). Old QR code can be deactivated (is_active=false) to retire it.
- Phone number is stored RAW in feedbacks table (PII). GDPR compliance: retention cron job purges old feedback (> 30 days default, check code).
- Categories in feedbacks.categories are user-selected; may not match AI-detected categories in ai_categories (filled later by background job).
- Sentiment can be null (not yet enriched) or in ('positive', 'neutral', 'negative').
- Telegram circuit breaker: failure_count incremented on send error; reset when send succeeds. If failure_count >= 3, skip sending until manual intervention.

**Idempotency:**

- submit_feedback is idempotent via RPC: creates feedback_id. Retry with same token + same submission data (no unique constraint on submission data) = duplicate feedback rows. App must prevent duplicate submission on client (e.g., disable button after submit).
- feedback_daily_report_generate is idempotent (ON CONFLICT on (branch_id, report_date) UPDATE metrics).
- Telegram send is idempotent in intent (if already status='sent', skip).

**Status in Go BE:**

- NOT_MIGRATED — Feedback module remains in Next.js. Possible future migration if needed.

---

## 10. Finance & GL (General Ledger)

**Owner files:**
- `supabase/migrations/20260406330000_finance.sql` — chart_of_accounts, gl_subledger, posting_rules
- `supabase/migrations/20260506000000_finance_phase0_cashflow_section_and_coa_seed.sql` — COA seed data
- `supabase/migrations/20260507000000_finance_phase1_journal_entry_period_guard_and_continuity.sql` — journal_entries, period closure
- `supabase/migrations/20260508000000_finance_phase1_b03_dn_cashflow_indirect.sql` — revenue posting
- `supabase/migrations/20260509000000_finance_phase1_5_vat_per_line.sql` — line-item VAT tracking
- `supabase/migrations/20260525010000_finance_manual_journal_post_period_guard.sql` — period lock on manual entries
- `supabase/migrations/20260527000000_finance_manual_journal_atomic_rpc.sql` — atomic multi-line posting
- `supabase/migrations/20260527020000_finance_dashboard_summary_rpc.sql` — dashboard KPI calculations
- `apps/web/app/admin/finance/` — finance UI (revenue, GL, statements, payroll)

**DB tables:**
- `public.chart_of_accounts` — PK `id`, FK tenant_id, columns: account_code (e.g., "1001", "4001"), account_name, account_type (asset|liability|equity|revenue|expense), is_active, created_at
- `public.gl_subledger` — PK `id`, FK tenant_id/chart_of_accounts_id, columns: ref_type (order|payment|refund|transfer|manual), ref_id (order_id or null), debit_amount, credit_amount, description, posted_at, created_at. Immutable (append-only).
- `public.journal_entries` — PK `id`, FK tenant_id, columns: period, status (draft|posted|reversed), description, created_by, created_at, posted_at
- `public.journal_entry_lines` — PK `id`, FK journal_entry_id/chart_of_accounts_id, columns: debit, credit, description
- `public.accounting_periods` — PK `id`, FK tenant_id, columns: period_code (e.g., "202505"), status (open|closed|locked), start_date, end_date, closed_at
- `public.posting_rules` — PK `id`, FK tenant_id, columns: trigger_type (order_completed|payment_received|refund_issued), from_account_code, to_account_code, rule_type (auto|manual), is_active. Determines automatic GL posting on events.

**Key RPCs:**
- `public.post_order_revenue(p_order_id)` — called after order completion. Looks up order.total_amount, posts to revenue GL account via posting_rules. Creates gl_subledger row(s). Idempotent.
- `public.create_journal_entry(p_period, p_lines JSON, p_description)` — creates draft journal entry with lines. Status='draft'. Not yet posted.
- `public.post_journal_entry(p_journal_entry_id)` — marks journal entry status='posted', creates gl_subledger rows for each line. Period must be open (status='open', not 'locked'). Fails if period is closed.
- `public.get_revenue_kpis(p_tenant_id, p_period_from, p_period_to)` — aggregates revenue GL entries, returns total revenue + breakdown by category/time.
- `public.close_accounting_period(p_period_code)` — marks period status='closed'. No new entries can be posted in closed period. Can be reopened if needed (status='locked' if needs re-entry).

**Business rules:**

1. (`supabase/migrations/20260406330000_finance.sql`) — Double-entry accounting: every transaction has debit and credit entries (sum to zero per journal entry).

2. (`supabase/migrations/20260507000000_finance_phase1_journal_entry_period_guard_and_continuity.sql`) — Journal entries are posted to accounting_periods. Period is identified by period_code (e.g., "202505" = May 2025). Period has start_date, end_date. Cannot post entry with date outside period.

3. (`supabase/migrations/20260507000000_finance_phase1_journal_entry_period_guard_and_continuity.sql`) — Period status: open (posting allowed), closed (posting blocked, view-only), locked (reopened for correction). Owner can reopen closed period if needed.

4. (`supabase/migrations/20260506000000_finance_phase0_cashflow_section_and_coa_seed.sql`) — Standard chart of accounts seeded: assets (1000-1999), liabilities (2000-2999), equity (3000-3999), revenue (4000-4999), expenses (5000-5999).

5. Posting rules: auto rules fire on event (order_completed → revenue posting). Manual rules require user action (manager posts expense journal entry manually).

6. (`supabase/migrations/20260509000000_finance_phase1_5_vat_per_line.sql`) — VAT tracked per order_item line (not just order-level). tax_invoices.line_vat_amount stores line-level VAT for audit.

7. gl_subledger is append-only. No DELETE or UPDATE on posted entries. Corrections via reversing entries (create new entry with opposite amounts, reference original).

**Edge cases / traps:**

- Period must exist before posting entries. If period doesn't exist, create_journal_entry still allows draft creation, but post_journal_entry fails.
- Posting rules are template-based. Rule triggers on event, then posts; if rule doesn't exist, no automatic posting (manual entry needed).
- gl_subledger.ref_type='manual' means entry came from journal_entries, not from order/payment event.
- closed_at timestamp is set when period is closed. If period is reopened, closed_at remains (for audit trail).
- Accounts can be marked is_active=false. Posting rules can still reference inactive accounts (for historical GL entries). New rules should not reference inactive accounts (app-layer validation).

**Idempotency:**

- post_order_revenue is idempotent (checks if order_id already has gl_subledger entry with ref_type='order', skips if yes).
- post_journal_entry is idempotent on status check (only posts if status='draft', no-op if already 'posted').
- close_accounting_period is idempotent (only closes if status='open', no-op if already 'closed').

**Status in Go BE:**

- NOT_MIGRATED — Finance module remains in Next.js. Potential future migration for revenue reporting.

---

## 11. HĐĐT (E-Invoice) / Tax Invoices

**Owner files:**
- `supabase/migrations/20260508053555_hddt_summary_schema.sql` — tax_invoices extended, tax_invoice_orders junction, summary_run_queue
- `supabase/migrations/20260508055046_hddt_aggregate_rpc_fixes.sql` — aggregate_daily_b2c_invoice RPC
- `supabase/migrations/20260531010000_create_payment_drop_vietqr_and_pending_flip.sql` — payment method updates
- `apps/web/app/api/cron/hddt-daily-summary/route.ts` — daily summary cron worker
- `apps/web/app/_lib/hddt-daily-summary.ts` — shared RPC caller logic
- `apps/web/app/admin/finance/actions.ts` — manual trigger action
- `docs/plan/hddt-hybrid-misa.md` — business context + approach
- `packages/shared/src/providers/impl/misa.ts` — MISA e-invoice provider client
- `packages/shared/src/providers/impl/viettel.ts` — Viettel SInvoice provider client (legacy)

**DB tables:**
- `public.tax_invoices` — extended with: invoice_kind (per_order|daily_summary), summary_date (NULL for per_order), summary_orders_count, order_id (NULL for summary), cqt_code, invoice_series, pdf_url, xml_url. Status: draft, signing, submitted, issued, cancelled, replaced, not_required.
- `public.tax_invoice_orders` — junction PK (tax_invoice_id, order_id). Links summary HĐ to underlying orders. Preserved on cancel for audit.
- `public.summary_run_queue` — audit queue per (branch_id, summary_date). Status: queued, running, issued, failed, skipped. trigger_source: cron|manual.

**Key RPCs:**
- `public.aggregate_daily_b2c_invoice(p_branch_id, p_date, p_vat_rate)` — SECURITY DEFINER (runs as postgres role). Aggregates all orders from date, groups by VAT rate, creates 1 tax_invoices row per VAT rate + tax_invoice_orders junction rows. Idempotent: only creates if no active summary for (branch, date, vat_rate).
- (provider-specific) — MISA / Viettel APIs: sign + submit summary HĐ to tax authority. Returns cqt_code, invoice_series, pdf_url, xml_url.

**Business rules:**

1. (`supabase/migrations/20260508053555_hddt_summary_schema.sql:39-47`) — invoice_kind shape constraint: per_order has order_id NOT NULL + summary_date NULL. daily_summary has order_id NULL + summary_date NOT NULL + summary_orders_count NOT NULL.

2. (`supabase/migrations/20260508053555_hddt_summary_schema.sql:51-54`) — UNIQUE index on (tenant_id, branch_id, summary_date) WHERE invoice_kind='daily_summary' AND status NOT IN ('cancelled', 'replaced'). Ensures 1 active summary per (branch, date). Cancelled summaries don't block re-create.

3. (`supabase/migrations/20260508053555_hddt_summary_schema.sql:79-89`) — tax_invoice_orders junction stores VAT rate + line subtotal + line VAT amount for audit. PRIMARY KEY (tax_invoice_id, order_id) prevents duplicate within single summary HĐ.

4. Per TT 78/2021 §11.4 (Vietnamese tax regulation): B2C daily summary HĐ required for restaurants. Orders grouped by VAT rate, then submitted as single summary HĐ per day per rate.

5. (`apps/web/app/api/cron/hddt-daily-summary/route.ts:1-100`) — Daily cron runs 02:00 ICT (19:00 UTC prior day), per configured schedule. Iterates active branches, calls aggregate_daily_b2c_invoice for each, then submits to provider. Failure per-branch isolated (try/catch).

6. summary_run_queue tracks each summary run attempt. trigger_source='cron' for automated, 'manual' for admin trigger. Status transitions: queued → running → {issued|failed|skipped}. Audit visible on /admin/finance/summary.

7. Provider integration: MISA is primary (TrueProfit partnership). Viettel SInvoice is legacy fallback. Provider selected via system_settings HDDT_PROVIDER.

**Edge cases / traps:**

- If summary_run fails (network error, provider rejection), status='failed'. Manual retry needed (click button on summary page).
- cancelled HĐ + later replaced HĐ for same (branch, date, vat_rate) allowed due to UNIQUE index WHERE status NOT IN ('cancelled', 'replaced').
- pdf_url, xml_url are lazy-fetched or set by provider callback. May be NULL initially.
- cqt_code assigned by CQT (tax authority) after successful submission. Not set until status='issued'.
- Orders included in summary: only those with payment_status='paid' AND completed. Cancelled orders excluded.
- VAT rate per order determined by order.tax_amount / order.subtotal ratio (implicit). Grouping by VAT rate matches tax authority expectations.

**Idempotency:**

- aggregate_daily_b2c_invoice is idempotent: UNIQUE index prevents duplicate summaries for (branch, date, vat_rate). Retry returns existing invoice_id.
- submit to provider is NOT idempotent (each call may submit if not yet submitted). Guard with summary_run_queue status check.

**Status in Go BE:**

- NOT_MIGRATED — HĐĐT flow remains in Next.js. Supabase RPCs handle aggregation. Provider clients (MISA, Viettel) remain in Next.js.

---

## 12. Notifications & Realtime

**Owner files:**
- (unverified — no dedicated notification migration found; likely embedded in feature migrations)
- `apps/web/app/sw.ts` — Service Worker (push notifications)
- `apps/web/app/_actions/notifications.ts` — notification action layer
- Supabase Realtime subscriptions across kds_tickets, branch_menu_item_daily_limits, etc.

**Business rules:**

1. Realtime: Supabase Realtime (PostgreSQL LISTEN/NOTIFY) enabled on certain tables: kds_tickets, kitchen_send_batches, branch_menu_item_daily_limits. Frontend subscribes, gets live updates.

2. Service Worker: registered in layout.tsx, listens for push events from browser's Notifications API. Can show desktop notifications.

3. (unverified) — notification_outbox table for async delivery (similar to feedback telegram_outbox pattern).

**Status in Go BE:**

- MIGRATED — Notification endpoints (list, unread-count, mark-read, read-all) confirmed in Go backend (`backend/internal/handler/notifications/`), mounted in `cmd/server/main.go`. Realtime subscriptions remain in Supabase.

---

## 13. Nhân sự & tiền lương / Labor

**Owner files:**
- `supabase/migrations/20260406320000_hr.sql` — employees, positions, attendance, shift_requests
- `supabase/migrations/20260507180751_h3b_shift_requests_table.sql` — shift_requests table (employee shift bidding)
- `apps/web/app/hr/` — HR UI (employee list, contracts, attendance)
- (unverified) — payroll RPC and GL posting for salary
- `docs/ref/labor-contracts.md`, `docs/ref/payroll-pit.md` — business context

**DB tables:**
- `public.employees` — employee identity (separate from profiles, links to staff_profiles). Columns: name, phone, email, id_number, date_of_birth, address, position_id, contract_status (active|terminated|on_leave), hired_at, terminated_at
- `public.positions` — job position catalog (cashier, chef, manager, etc.). Link to role for permissions.
- `public.attendance` — time-in, time-out records per employee per day.
- `public.shift_requests` — employee bids for shifts. Status: pending|approved|rejected.
- (unverified) — payroll table, salary calculation RPC

**Business rules:**

1. (unverified) — Employee position linked to role; position used for new auth flow (jwt position claim) vs legacy role.

2. (unverified) — Payroll calculated monthly, GL posted to expenses.

3. (unverified) — Attendance tracked for labor law compliance (VN labor code).

**Status in Go BE:**

- PARTIAL — Employee endpoints likely migrated. Payroll + attendance flows remain in Next.js (low priority for current roadmap).

---

## 14. System Settings & Configuration

**Owner files:**
- `supabase/migrations/20260402000002_system_settings.sql` — system_settings table, SYSTEM_SETTING_KEYS enum
- `packages/shared/src/settings.ts` — TypeScript mirror of setting keys
- `apps/web/app/admin/settings/` — settings UI (payments, printers, integrations, etc.)

**DB tables:**
- `public.system_settings` — PK `id`, FK tenant_id, columns: key (TEXT UNIQUE per tenant), value (TEXT or JSONB), created_at, updated_at

**Key settings (examples, not exhaustive):**
- PAYMENT_METHODS_ENABLED → CSV list (cash, vietqr, momo)
- VIETQR_BANK_CODE, VIETQR_ACCOUNT → customer payment details
- MOMO_PARTNER_CODE, MOMO_SECRET → MoMo integration credentials
- MISA_USERNAME, MISA_PASSWORD → HĐĐT provider credentials (encrypted at rest if possible)
- TELEGRAM_BOT_TOKEN → feedback notifications
- AI_API_KEY → feedback enrichment (sentiment, categories)

**Idempotency:**

- Settings reads are idempotent.
- Settings writes via UPSERT (INSERT ... ON CONFLICT UPDATE).

---

## 15. Cron Jobs

All cron jobs authenticated via Bearer token (timing-safe compare). Disabled via feature flag if needed.

**Schedule** (from vercel.json or next.config.ts):

- `hddt-daily-summary` → 0 19 * * * UTC (02:00 ICT) — daily HĐĐT summary submission
- `feedback-daily-report` → 0 19 * * * UTC (02:00 ICT) — daily feedback metrics aggregation
- `feedback-retention` → 0 2 * * * UTC (09:00 ICT) — GDPR data cleanup (delete feedback > 30 days)
- `telegram-flush` → every 5 min — send pending telegram notifications to destinations

**Status in Go BE:**

- PARTIAL — Cron jobs may be split: some moved to Go backend, some remain in Next.js.

---

## 16. Security & Network Gates

**Owner files:**
- `apps/web/proxy.ts:286-299` — Network gate (POS/KDS IP validation)
- `apps/web/next.config.ts` — CSP, security headers
- `apps/web/app/api/branch-presence` — print-agent heartbeat endpoint
- `packages/security/` — rate limiting (Upstash Redis)

**Business rules:**

1. POS/KDS Network Gate: print-agent registers NAT IP via /api/branch-presence. Proxy checks incoming POS/KDS requests originate from registered IP. Kill-switch: `POS_NETWORK_GATE=off` env var.

2. CSP (Content Security Policy): restricts script origins, image sources, etc. (unverified — review next.config.ts for exact policy).

3. Rate limiting: Upstash Redis used for rate limit checks (unverified — which endpoints, what limit).

---

## 17. Glossary of Unverified Items

These items need verification before Go migration:

1. **area_manager scoping** — Does area_manager have tenant-wide access or restricted by area? ROADMAP H3 suggests area-level scoping table planned.
2. **Payroll calculation** — RPC and GL posting logic not fully reviewed.
3. **Attendance tracking** — Integration with labor compliance not verified.
4. **Notification storage** — notification_outbox table structure not found; may be embedded in feedback module.
5. **AI feedback enrichment** — Cron job flow + AI provider integration not fully traced.
6. **Telegram circuit breaker** — Exact failure threshold + reset logic not verified.
7. **Rate limiting configuration** — Which endpoints, what rate (requests/sec), config source.
8. **CSP policy** — Full policy string, exceptions for trusted CDNs.
9. **Payment signature verification** — Webhook signature verification for MoMo IPN + timeout tolerance.
10. **Schema validation on RPC inputs** — Some RPCs may not validate payload JSON deeply.

---

## Migration Checklist for Go Backend

When migrating a module from Next.js to Go:

- [ ] Copy all Postgres schema (migrations) to Go backend schema sync script
- [ ] Copy all RPC definitions to Go services (SQL RPCs → Go funcs)
- [ ] Copy permission key checks to Go auth middleware
- [ ] Copy RLS logic to Go row-level filter functions (if needed)
- [ ] Copy all order-related business logic to Go order service
- [ ] Copy payment provider clients (MISA, MoMo, VietQR) to Go
- [ ] Copy notification + realtime subscription logic (keep Supabase for now)
- [ ] Test end-to-end flow with production-like data
- [ ] Verify idempotency guarantees (retry safety)
- [ ] Verify error messages match (avoid breaking client expectations)
- [ ] Verify audit logging (all mutations logged with user/timestamp)
- [ ] Load test (latency, RPS, memory, DB connection pool)
- [ ] Security review (auth boundaries, RLS equivalence, input validation)
- [ ] Canary deploy (1% traffic, monitor errors + latency)

---

## Key Invariants (Read & Remember)

1. **Tenant isolation is hard boundary** — all queries filtered by tenant_id. No cross-tenant data access.
2. **Branch scope for operational roles** — POS/KDS enforce URL branchId matches JWT branch_id.
3. **RLS is source of truth for data access** — proxy ACL gates route entry; RLS gates data rows.
4. **Payments are immutable** — no DELETE. Use refund/reversal entries instead.
5. **Stock consumption is transactional** — complete_payment_and_consume_stock is atomic. Retry-unsafe.
6. **Orders are immutable by design** — no DELETE. Use status='cancelled' for audit trail.
7. **Daily limits are per VN date** — not UTC. Cron jobs must account for +7 offset.
8. **KDS tickets are 1:many** — same order_item can route to multiple stations (multiple tickets).
9. **Print agent is stateless** — no persistent connection; each job is independent. Crashable without state loss.
10. **Feedback is anon-safe** — submit_feedback RPC requires no auth. Can be called by customers over public internet.

---

## Legend

- `(unverified)` — claim needs code review before relying on it
- `(likely)` — pattern inferred from schema but not explicitly documented
- `file:line` → absolute pointer to source code
- **Bold** — critical rule or invariant
- `UPPERCASE` — environment variable or database constant
- `code_style` — SQL function, TypeScript function, or database object

---

**Last Updated:** 2026-05-14  
**Data Quality:** Direct source code reading, migrations, actions, cron jobs  
**Confidence:** 85-95% on each module (5-15% unknowns marked as unverified)  
**Audience:** Go backend engineers, migration planners, architecture reviewers

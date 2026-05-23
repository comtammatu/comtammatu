# Database Schema Reference

> **⚠️ FROZEN — early-2026.** Do not trust the rest of this file as current.
>
> This reference still documents the dropped `staff_role` ENUM, the removed `profiles.role` column, and tagged "future" area_manager scoping that has since shipped (Auth). Many domains added since (Auth, Production, Finance, Print Agent, Notifications, Trust/QC) are missing entirely.
>
> **Canonical sources for the current schema:**
> 1. `packages/database/src/types/database.types.ts` (regenerated via `pnpm db:types`)
> 2. `supabase/migrations/*.sql` — authored changes (file existence ≠ applied)
> 3. `docs/modules/database.md` — domain groups + source-of-truth ladder
>
> The historical content below is preserved for context on early decisions (RLS pattern, snapshot pricing, state machines) but column lists may be stale.

---

## Core Tables (v0.1.1)

### tenants

Single row — Cơm Tấm Má Tư CTCP.

| Column         | Type        | Notes                        |
| -------------- | ----------- | ---------------------------- |
| id             | BIGINT PK   | GENERATED ALWAYS AS IDENTITY |
| name           | TEXT        | "Cơm Tấm Má Tư"              |
| slug           | TEXT UNIQUE | "comtammatu"                 |
| legal_name     | TEXT        | CTCP legal name              |
| tax_code       | TEXT UNIQUE | MST 10 or 13 digits          |
| legal_address  | TEXT        | Registered address           |
| representative | TEXT        | Legal representative         |
| settings       | JSONB       | Legacy — use system_settings |
| created_at     | TIMESTAMPTZ | default now()                |
| updated_at     | TIMESTAMPTZ | default now(), auto-trigger  |

### branches

| Column          | Type               | Notes                       |
| --------------- | ------------------ | --------------------------- |
| id              | BIGINT PK          |                             |
| tenant_id       | BIGINT FK(tenants) | ON DELETE CASCADE           |
| name            | TEXT               | UNIQUE(name, tenant_id)     |
| address         | TEXT               |                             |
| phone           | TEXT               |                             |
| is_active       | BOOLEAN            | default true                |
| is_headquarters | BOOLEAN            | default false               |
| branch_kind     | TEXT               | branch, headquarters, central_kitchen |
| created_at      | TIMESTAMPTZ        | default now()               |
| updated_at      | TIMESTAMPTZ        | default now(), auto-trigger |

### inventory_locations

> Phase 1 migration drafted in `20260417040000_inventory_locations_phase1.sql`; owner must apply after merge before this is live in DB.

| Column                   | Type               | Notes                                                                |
| ------------------------ | ------------------ | -------------------------------------------------------------------- |
| id                       | BIGINT PK          | GENERATED ALWAYS AS IDENTITY                                         |
| tenant_id                | BIGINT FK(tenants) | ON DELETE CASCADE                                                    |
| branch_id                | BIGINT FK(branches) | ON DELETE CASCADE                                                   |
| code                     | TEXT               | UNIQUE(code, branch_id, tenant_id)                                   |
| name                     | TEXT               | display label                                                        |
| location_kind            | TEXT               | warehouse, kitchen, receiving, production_storage                    |
| is_active                | BOOLEAN            | default true                                                         |
| is_default_receive       | BOOLEAN            | partial unique per active branch location                            |
| is_default_issue         | BOOLEAN            | partial unique per active branch location                            |
| is_default_consumption   | BOOLEAN            | partial unique per active branch location                            |
| sort_order               | INT                | default 0                                                            |
| created_at               | TIMESTAMPTZ        | default now()                                                        |
| updated_at               | TIMESTAMPTZ        | default now(), auto-trigger                                          |

Phase 1 seeds one default location per branch only, to avoid changing inventory behavior before the location-ledger cutover.

> Phase 2A compatibility-columns migration drafted in `20260417050000_inventory_location_compat_columns.sql`. It adds nullable `location_*` columns to `stock_levels`, `stock_movements`, `stock_transfers`, `stock_issues`, and `stocktake_sessions`, but does not backfill or cut over behavior yet.

### profiles (staff)

| Column     | Type                   | Notes                                             |
| ---------- | ---------------------- | ------------------------------------------------- |
| id         | UUID PK FK(auth.users) | ON DELETE CASCADE                                 |
| tenant_id  | BIGINT FK(tenants)     | ON DELETE CASCADE                                 |
| branch_id  | BIGINT FK(branches)    | ON DELETE SET NULL; CHECK: required for ops roles |
| role       | staff_role ENUM        | default 'waiter'                                  |
| full_name  | TEXT                   |                                                   |
| phone      | TEXT                   |                                                   |
| avatar_url | TEXT                   |                                                   |
| is_active  | BOOLEAN                | default true                                      |
| created_at | TIMESTAMPTZ            | default now()                                     |
| updated_at | TIMESTAMPTZ            | default now(), auto-trigger                       |

**Constraint** `chk_branch_required_for_ops`:

- `branch_id IS NOT NULL` required when `role IN ('cashier', 'waiter', 'chef', 'branch_manager')`
- `branch_id` nullable for: `owner`, `super_manager`, `area_manager`, `office`

### staff_role ENUM

```
owner, super_manager, area_manager, branch_manager, cashier, waiter, chef, office
```

> Note: Postgres ENUM only supports `ADD VALUE`, not `DROP`. If roles change >2x/year, migrate to a lookup table.

### Role Scoping Notes

| Role           | Branch required | Scope       | Notes                                             |
| -------------- | --------------- | ----------- | ------------------------------------------------- |
| owner          | No              | Tenant-wide | Unrestricted                                      |
| super_manager  | No              | Tenant-wide | Cannot modify owner                               |
| area_manager   | No              | Area-scoped | Scoped via `areas` + `area_branches` mapping      |
| branch_manager | Yes             | Own branch  | Can manage cashier/waiter/chef in own branch only |
| cashier        | Yes             | Own branch  | Route: `/br/[branchId]/pos`                       |
| waiter         | Yes             | Own branch  | Route: `/br/[branchId]/pos`                       |
| chef           | Yes             | Own branch  | Route: `/br/[branchId]/kds`                       |
| office         | No              | HQ-wide     | Route: `/employee`                                |

### system_settings

Tenant-scoped key/value configuration.

| Column      | Type               | Notes                        |
| ----------- | ------------------ | ---------------------------- |
| id          | BIGINT PK          | GENERATED ALWAYS AS IDENTITY |
| tenant_id   | BIGINT FK(tenants) | ON DELETE CASCADE            |
| key         | TEXT               | UNIQUE(key, tenant_id)       |
| value       | TEXT               |                              |
| description | TEXT               |                              |
| created_at  | TIMESTAMPTZ        | default now()                |
| updated_at  | TIMESTAMPTZ        | default now(), auto-trigger  |

**RLS:** tenant SELECT for all authenticated; INSERT/UPDATE/DELETE for owner + super_manager only.

**Seeded keys:** `vat_rate`, `service_charge`, `currency`, `store_phone`, `store_email`

## Indexes

| Index                      | Columns                          | Purpose                    |
| -------------------------- | -------------------------------- | -------------------------- |
| idx_branches_tenant        | `branches(tenant_id)`            | FK lookup, RLS filter      |
| idx_profiles_tenant_branch | `profiles(tenant_id, branch_id)` | Branch-scoped RLS          |
| idx_profiles_tenant_role   | `profiles(tenant_id, role)`      | Role filtering in admin UI |
| idx_system_settings_tenant | `system_settings(tenant_id)`     | FK lookup, RLS filter      |

## Auth Helper Functions

| Function                          | Returns | Purpose                                             |
| --------------------------------- | ------- | --------------------------------------------------- |
| `auth_tenant_id()`                | BIGINT  | Extract tenant_id from JWT app_metadata             |
| `auth_branch_id()`                | BIGINT  | Extract branch_id from JWT app_metadata             |
| `auth_role()`                     | TEXT    | Extract user_role from JWT app_metadata             |
| `custom_access_token_hook(event)` | JSONB   | Inject claims into JWT (SECURITY DEFINER)           |
| `handle_new_user()`               | TRIGGER | Auto-create profile from `raw_app_meta_data`        |
| `update_my_profile()`             | void    | Self-update safe fields only (SECURITY DEFINER)     |
| `admin_update_profile()`          | void    | Manager update with scope checks (SECURITY DEFINER) |
| `update_updated_at()`             | TRIGGER | Auto-set `updated_at` on row update                 |
| `set_headquarters(p_branch_id)`   | void    | Atomic HQ swap — unset old + set new in one tx      |

### handle_new_user() — Invite-Only Flow

- Reads `tenant_id`, `branch_id`, `role` from `raw_app_meta_data` (admin-controlled, not user-editable)
- **Rejects** signups without `tenant_id` in app_metadata — no self-signup
- Fallback `full_name` from `raw_user_meta_data` if not in app_metadata
- Admin invite flow must set `raw_app_meta_data` via Supabase Admin API

### update_my_profile(full_name, phone, avatar_url)

- Self-service: user can only update `full_name`, `phone`, `avatar_url`
- Cannot modify: `role`, `branch_id`, `tenant_id`, `is_active`
- Column-level GRANT enforced at DB level as defense-in-depth

### admin_update_profile(target_id, role, branch_id, is_active, full_name, phone)

> Note: Old 4-param overload (from v0.1.1) dropped in earlier cleanup migration. Only the 6-param version exists.

Actor scope restrictions:

| Actor          | Can modify                        | Target role limits                          | Branch limits          |
| -------------- | --------------------------------- | ------------------------------------------- | ---------------------- |
| owner          | Anyone in tenant                  | All roles                                   | Any branch             |
| super_manager  | All except owner                  | All except owner                            | Any branch             |
| area_manager   | branch_manager and below          | Cannot set owner/super_manager/area_manager | Any branch (temporary) |
| branch_manager | cashier/waiter/chef in own branch | cashier/waiter/chef only                    | Own branch only        |

Additional checks:

- `branch_manager` cannot modify peer `branch_manager`
- `super_manager` cannot modify/deactivate `owner`
- Operational roles (`cashier`, `waiter`, `chef`, `branch_manager`) require `branch_id`
- `branch_id` must belong to same tenant (cross-tenant check)
- `p_full_name` and `p_phone` use COALESCE — pass NULL to keep existing value

## RLS Policies (v0.1.1)

| Table           | Policy                    | Roles / Scope                                             |
| --------------- | ------------------------- | --------------------------------------------------------- |
| tenants         | SELECT own tenant         | all authenticated                                         |
| branches        | SELECT in tenant          | all authenticated                                         |
| branches        | ALL (manage)              | owner, super_manager                                      |
| profiles        | SELECT branch-scoped      | self + same branch; managers/office see wider (see below) |
| profiles        | UPDATE own safe fields    | self — `full_name`, `phone`, `avatar_url` only            |
| profiles        | (no direct INSERT/DELETE) | All profile mutations go through RPCs only                |
| system_settings | SELECT in tenant          | all authenticated                                         |
| system_settings | INSERT/UPDATE/DELETE      | owner, super_manager only                                 |

### profiles SELECT scope detail

| Viewer role                                | Sees                                 |
| ------------------------------------------ | ------------------------------------ |
| owner, super_manager, area_manager, office | All profiles in tenant               |
| branch_manager                             | Own profile + profiles in own branch |
| cashier, waiter, chef                      | Own profile + profiles in own branch |

> Note: `office` has tenant-wide read access for HR functions (contracts, payroll) per business spec.

> Note: All SELECT results include all columns (`phone`, `avatar_url`). If business requires hiding sensitive fields from peers, implement a dedicated RPC that returns limited columns. Do NOT rely on views as a security boundary in Supabase.

> Note: `INSERT` and `DELETE` are revoked from `authenticated` on `profiles`. All profile creation goes through `handle_new_user()` trigger (SECURITY DEFINER). All mutations go through `update_my_profile()` or `admin_update_profile()` RPCs. No direct hard-delete path exists — use `is_active = false` via RPC.

## Type Boundaries

| Domain      | PostgreSQL Type                       |
| ----------- | ------------------------------------- |
| Money       | `NUMERIC(15,2)`                       |
| Time        | `TIMESTAMPTZ`                         |
| Primary Key | `BIGINT GENERATED ALWAYS AS IDENTITY` |
| Text        | `TEXT` (no VARCHAR)                   |

## Future Work

### area_manager scope

`area_manager` currently has tenant-wide access. If business needs area-level scoping:

- Add `areas` table + `area_branches(area_id, branch_id)` mapping
- Add `area_id` FK to `profiles` for area_manager
- Update RLS and `admin_update_profile()` accordingly

### Invite flow

Admin invite creates auth user via Supabase Admin API with `raw_app_meta_data` containing `tenant_id`, `branch_id`, `role`. No public signup endpoint.

## Menu Tables

### menu_categories

| Column     | Type               | Notes                                       |
| ---------- | ------------------ | ------------------------------------------- |
| id         | BIGINT PK          | GENERATED ALWAYS AS IDENTITY                |
| tenant_id  | BIGINT FK(tenants) | ON DELETE CASCADE                           |
| name       | TEXT NOT NULL      | UNIQUE(name, tenant_id)                     |
| type       | TEXT NOT NULL      | CHECK: main_dish, side_dish, drink, dessert |
| sort_order | INT                | default 0                                   |
| is_active  | BOOLEAN            | default true                                |
| created_at | TIMESTAMPTZ        |                                             |
| updated_at | TIMESTAMPTZ        | auto-trigger                                |

### menu_items

| Column                | Type                       | Notes                        |
| --------------------- | -------------------------- | ---------------------------- |
| id                    | BIGINT PK                  | GENERATED ALWAYS AS IDENTITY |
| tenant_id             | BIGINT FK(tenants)         | ON DELETE CASCADE            |
| category_id           | BIGINT FK(menu_categories) | ON DELETE CASCADE            |
| name                  | TEXT NOT NULL              | UNIQUE(name, tenant_id)      |
| description           | TEXT                       |                              |
| base_price            | NUMERIC(15,2) NOT NULL     |                              |
| image_url             | TEXT                       |                              |
| is_active             | BOOLEAN                    | default true                 |
| sort_order            | INT                        | default 0                    |
| created_at/updated_at | TIMESTAMPTZ                |                              |

### menu_item_variants

| Column           | Type                  | Notes                            |
| ---------------- | --------------------- | -------------------------------- |
| id               | BIGINT PK             |                                  |
| tenant_id        | BIGINT FK             |                                  |
| item_id          | BIGINT FK(menu_items) | ON DELETE CASCADE                |
| name             | TEXT NOT NULL         | UNIQUE(name, item_id, tenant_id) |
| price_adjustment | NUMERIC(15,2)         | default 0, +/- from base_price   |
| is_active        | BOOLEAN               | default true                     |
| sort_order       | INT                   | default 0                        |

### menu_item_modifiers

| Column     | Type                  | Notes                            |
| ---------- | --------------------- | -------------------------------- |
| id         | BIGINT PK             |                                  |
| tenant_id  | BIGINT FK             |                                  |
| item_id    | BIGINT FK(menu_items) | ON DELETE CASCADE                |
| name       | TEXT NOT NULL         | UNIQUE(name, item_id, tenant_id) |
| price      | NUMERIC(15,2)         | default 0, absolute price        |
| is_active  | BOOLEAN               | default true                     |
| sort_order | INT                   | default 0                        |

### menu_item_available_sides

Junction table: which side items can pair with which main items.

| Column                                        | Type                  | Notes             |
| --------------------------------------------- | --------------------- | ----------------- |
| id                                            | BIGINT PK             |                   |
| tenant_id                                     | BIGINT FK             |                   |
| main_item_id                                  | BIGINT FK(menu_items) | ON DELETE CASCADE |
| side_item_id                                  | BIGINT FK(menu_items) | ON DELETE CASCADE |
| is_default                                    | BOOLEAN               | default false     |
| created_at                                    | TIMESTAMPTZ           |                   |
| UNIQUE(main_item_id, side_item_id, tenant_id) |                       |                   |

**RLS for all 5 menu tables:**

- SELECT: all authenticated in tenant
- INSERT/UPDATE/DELETE: owner, super_manager, area_manager, branch_manager

### Menu Indexes

| Index                                | Columns                                 | Purpose          |
| ------------------------------------ | --------------------------------------- | ---------------- |
| idx_menu_categories_tenant           | menu_categories(tenant_id)              | RLS filter       |
| idx_menu_items_tenant                | menu_items(tenant_id)                   | RLS filter       |
| idx_menu_items_category              | menu_items(category_id)                 | Category lookup  |
| idx_menu_item_variants_item          | menu_item_variants(item_id)             | Item lookup      |
| idx_menu_item_modifiers_item         | menu_item_modifiers(item_id)            | Item lookup      |
| idx_menu_item_variants_tenant        | menu_item_variants(tenant_id)           | RLS filter       |
| idx_menu_item_modifiers_tenant       | menu_item_modifiers(tenant_id)          | RLS filter       |
| idx_menu_item_available_sides_main   | menu_item_available_sides(main_item_id) | Main item lookup |
| idx_menu_item_available_sides_side   | menu_item_available_sides(side_item_id) | Side item lookup |
| idx_menu_item_available_sides_tenant | menu_item_available_sides(tenant_id)    | RLS filter       |

## Tables & Zones

### branch_zones

| Column     | Type                | Notes                              |
| ---------- | ------------------- | ---------------------------------- |
| id         | BIGINT PK           | GENERATED ALWAYS AS IDENTITY       |
| branch_id  | BIGINT FK(branches) | ON DELETE CASCADE                  |
| tenant_id  | BIGINT FK(tenants)  | ON DELETE CASCADE                  |
| name       | TEXT NOT NULL       | UNIQUE(branch_id, name, tenant_id) |
| sort_order | INT                 | default 0                          |
| created_at | TIMESTAMPTZ         | default now()                      |

### tables

| Column     | Type                    | Notes                                                                      |
| ---------- | ----------------------- | -------------------------------------------------------------------------- |
| id         | BIGINT PK               | GENERATED ALWAYS AS IDENTITY                                               |
| branch_id  | BIGINT FK(branches)     | ON DELETE CASCADE                                                          |
| zone_id    | BIGINT FK(branch_zones) | ON DELETE SET NULL, nullable                                               |
| tenant_id  | BIGINT FK(tenants)      | ON DELETE CASCADE                                                          |
| number     | INT NOT NULL            | UNIQUE(branch_id, number, tenant_id)                                       |
| capacity   | INT NOT NULL            | default 4, CHECK > 0                                                       |
| status     | TEXT NOT NULL           | default 'available', CHECK IN (available, occupied, reserved, maintenance) |
| created_at | TIMESTAMPTZ             | default now()                                                              |
| updated_at | TIMESTAMPTZ             | default now(), auto-trigger                                                |

**RLS for both tables:**

- SELECT: all authenticated in tenant
- INSERT/UPDATE/DELETE: owner, super_manager, area_manager, branch_manager

### Tables & Zones Indexes

| Index                   | Columns                 | Purpose       |
| ----------------------- | ----------------------- | ------------- |
| idx_branch_zones_tenant | branch_zones(tenant_id) | RLS filter    |
| idx_branch_zones_branch | branch_zones(branch_id) | Branch lookup |
| idx_tables_tenant       | tables(tenant_id)       | RLS filter    |
| idx_tables_branch       | tables(branch_id)       | Branch lookup |
| idx_tables_zone         | tables(zone_id)         | Zone lookup   |

## Order Tables

### orders

| Column          | Type                   | Notes                                                                                    |
| --------------- | ---------------------- | ---------------------------------------------------------------------------------------- |
| id              | BIGINT PK              | GENERATED ALWAYS AS IDENTITY                                                             |
| tenant_id       | BIGINT FK(tenants)     | ON DELETE CASCADE                                                                        |
| branch_id       | BIGINT FK(branches)    | ON DELETE CASCADE                                                                        |
| table_id        | BIGINT FK(tables)      | ON DELETE SET NULL; nullable — NULL for takeaway orders                                  |
| order_number    | TEXT NOT NULL          | UNIQUE(branch_id, order_number, tenant_id); branch-scoped sequential                     |
| order_type      | TEXT NOT NULL          | CHECK IN (dine_in, takeaway)                                                             |
| status          | TEXT NOT NULL          | default 'new'; CHECK IN (new, confirmed, preparing, ready, served, completed, cancelled) |
| subtotal        | NUMERIC(15,2) NOT NULL | Sum of order_items.subtotal                                                              |
| tax_amount      | NUMERIC(15,2) NOT NULL | default 0                                                                                |
| service_charge  | NUMERIC(15,2) NOT NULL | default 0                                                                                |
| discount_amount | NUMERIC(15,2) NOT NULL | default 0                                                                                |
| total_amount    | NUMERIC(15,2) NOT NULL | subtotal + tax_amount + service_charge - discount_amount                                 |
| customer_count  | INT NOT NULL           | default 1, CHECK > 0; guest count for dine-in, bill splitting, revenue-per-head          |
| note            | TEXT                   |                                                                                          |
| created_by      | UUID FK(profiles)      | NOT NULL; staff member who opened the order                                              |
| created_at      | TIMESTAMPTZ            | default now()                                                                            |
| updated_at      | TIMESTAMPTZ            | default now(), auto-trigger                                                              |

### order_items

| Column       | Type                          | Notes                                                                                                 |
| ------------ | ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| id           | BIGINT PK                     | GENERATED ALWAYS AS IDENTITY                                                                          |
| tenant_id    | BIGINT FK(tenants)            | ON DELETE CASCADE                                                                                     |
| order_id     | BIGINT FK(orders)             | ON DELETE CASCADE                                                                                     |
| menu_item_id | BIGINT FK(menu_items)         | NOT NULL; ON DELETE RESTRICT — cannot delete menu item with existing orders                           |
| variant_id   | BIGINT FK(menu_item_variants) | ON DELETE SET NULL; nullable — no variant selected                                                    |
| item_name    | TEXT NOT NULL                 | Snapshot of menu_items.name at time of order                                                          |
| variant_name | TEXT                          | Snapshot of menu_item_variants.name at time of order                                                  |
| quantity     | INT NOT NULL                  | CHECK > 0                                                                                             |
| unit_price   | NUMERIC(15,2) NOT NULL        | Snapshot price (base + variant adjustment) at time of order                                           |
| modifiers    | JSONB NOT NULL                | DEFAULT '[]'; Snapshot: `[{"modifier_id": BIGINT, "name": TEXT, "price": NUMERIC}]`                   |
| sides        | JSONB NOT NULL                | DEFAULT '[]'; Snapshot: `[{"side_item_id": BIGINT, "name": TEXT, "price": NUMERIC, "quantity": INT}]` |
| subtotal     | NUMERIC(15,2) NOT NULL        | quantity x unit_price + modifier/side totals                                                          |
| note         | TEXT                          |                                                                                                       |
| status       | TEXT NOT NULL                 | default 'pending'; CHECK IN (pending, preparing, ready, served, cancelled)                            |
| created_at   | TIMESTAMPTZ                   | default now()                                                                                         |
| updated_at   | TIMESTAMPTZ                   | default now(), auto-trigger                                                                           |

**Snapshot pattern:** `item_name`, `variant_name`, `unit_price`, `modifiers`, and `sides` are captured at order creation time. Menu changes after the order is placed do not retroactively alter order records. `menu_item_id` and `variant_id` are kept as nullable FKs for analytics joins but are not relied on for pricing or display.

### order_status_history

| Column      | Type               | Notes                                       |
| ----------- | ------------------ | ------------------------------------------- |
| id          | BIGINT PK          | GENERATED ALWAYS AS IDENTITY                |
| tenant_id   | BIGINT FK(tenants) | ON DELETE CASCADE                           |
| order_id    | BIGINT FK(orders)  | ON DELETE CASCADE                           |
| from_status | TEXT               | Previous status; NULL for initial creation  |
| to_status   | TEXT NOT NULL      | New status after transition                 |
| changed_by  | UUID FK(profiles)  | NOT NULL                                    |
| note        | TEXT               | Optional reason (e.g., cancellation reason) |
| created_at  | TIMESTAMPTZ        | default now()                               |

**Append-only:** No UPDATE or DELETE is allowed on this table. It is a complete audit trail of every status transition. INSERT is allowed via RLS (branch-scoped) — will move to RPC-only when state machine RPC is built in later sessions.

### Order State Machine

```
new → confirmed → preparing → ready → served → completed
 ↓        ↓           ↓         ↓        ↓
        cancelled (reachable from any state except completed)
```

- `completed` is a terminal state — no further transitions
- Every transition writes one row to `order_status_history`
- Item-level `status` has its own lifecycle: `pending → preparing → ready → served → cancelled`

### Order RLS Policies

| Table                | Policy          | Roles / Scope                                                       |
| -------------------- | --------------- | ------------------------------------------------------------------- |
| orders               | SELECT          | all authenticated in tenant                                         |
| orders               | INSERT          | own branch (via auth_branch_id) OR owner/super_manager/area_manager |
| orders               | UPDATE          | own branch OR owner/super_manager/area_manager                      |
| orders               | DELETE          | NOT GRANTED — use status='cancelled'                                |
| order_items          | SELECT          | all authenticated in tenant                                         |
| order_items          | INSERT          | branch-scoped via parent order EXISTS check                         |
| order_items          | UPDATE          | branch-scoped via parent order EXISTS check                         |
| order_items          | DELETE          | NOT GRANTED — follows parent order lifecycle                        |
| order_status_history | SELECT          | all authenticated in tenant                                         |
| order_status_history | INSERT          | branch-scoped via parent order EXISTS check                         |
| order_status_history | UPDATE / DELETE | NOT GRANTED — append-only audit trail                               |

### Order Indexes

| Index                           | Columns                         | Purpose                       |
| ------------------------------- | ------------------------------- | ----------------------------- |
| idx_orders_tenant               | orders(tenant_id)               | RLS filter                    |
| idx_orders_branch               | orders(branch_id)               | Branch-scoped POS queries     |
| idx_orders_table                | orders(table_id)                | Table status lookup           |
| idx_orders_branch_status        | orders(branch_id, status)       | Filter by status in POS/KDS   |
| idx_orders_created_by           | orders(created_by)              | Staff activity lookup         |
| idx_order_items_tenant          | order_items(tenant_id)          | RLS filter                    |
| idx_order_items_order           | order_items(order_id)           | Items for a given order       |
| idx_order_items_menu_item       | order_items(menu_item_id)       | Analytics: sales by menu item |
| idx_order_status_history_tenant | order_status_history(tenant_id) | RLS filter                    |
| idx_order_status_history_order  | order_status_history(order_id)  | History for a given order     |

## POS Terminals & Sessions

### pos_terminals

One row per physical or virtual POS device at a branch. Terminals are tenant/branch-scoped and must have unique names within a branch.

| Column     | Type                | Notes                              |
| ---------- | ------------------- | ---------------------------------- |
| id         | BIGINT PK           | GENERATED ALWAYS AS IDENTITY       |
| tenant_id  | BIGINT FK(tenants)  | ON DELETE CASCADE                  |
| branch_id  | BIGINT FK(branches) | ON DELETE CASCADE                  |
| name       | TEXT NOT NULL       | UNIQUE(branch_id, name, tenant_id) |
| device_id  | TEXT                | Hardware identifier; nullable      |
| is_active  | BOOLEAN             | default true                       |
| created_at | TIMESTAMPTZ         | default now()                      |
| updated_at | TIMESTAMPTZ         | default now(), auto-trigger        |

### pos_sessions

Records a cashier's shift at a terminal — from the moment they open the till to when they close it. Capturing cash figures at open and close supports end-of-shift cash reconciliation.

| Column          | Type                     | Notes                                                  |
| --------------- | ------------------------ | ------------------------------------------------------ |
| id              | BIGINT PK                | GENERATED ALWAYS AS IDENTITY                           |
| tenant_id       | BIGINT FK(tenants)       | ON DELETE CASCADE                                      |
| branch_id       | BIGINT FK(branches)      | ON DELETE CASCADE                                      |
| terminal_id     | BIGINT FK(pos_terminals) | NOT NULL; ON DELETE CASCADE                            |
| opened_by       | UUID FK(profiles)        | NOT NULL; staff member who opened the session          |
| closed_by       | UUID FK(profiles)        | Nullable; staff member who closed the session          |
| opened_at       | TIMESTAMPTZ              | NOT NULL; default now()                                |
| closed_at       | TIMESTAMPTZ              | Nullable; set when session is closed                   |
| opening_cash    | NUMERIC(15,2) NOT NULL   | default 0; cash in drawer at session open              |
| closing_cash    | NUMERIC(15,2)            | Nullable; actual cash counted at close                 |
| expected_cash   | NUMERIC(15,2)            | Nullable; system-calculated at close (opening + sales) |
| cash_difference | NUMERIC(15,2)            | Nullable; closing_cash - expected_cash                 |
| status          | TEXT NOT NULL            | default 'open'; CHECK IN (open, closed)                |
| note            | TEXT                     | Optional shift note                                    |
| created_at      | TIMESTAMPTZ              | default now()                                          |
| updated_at      | TIMESTAMPTZ              | default now(), auto-trigger                            |

**Partial unique index — one open session per terminal:**

```sql
CREATE UNIQUE INDEX idx_pos_sessions_one_open
  ON pos_sessions(terminal_id)
  WHERE status = 'open';
```

This enforces at the database level that a terminal can have at most one open session at any point in time. A second `INSERT` with `status = 'open'` for the same `terminal_id` will fail with a unique constraint violation before the application layer can produce a conflicting state.

> Note: `DELETE` is not granted on `pos_sessions`. Sessions are permanent business records. Close a session by updating `status = 'closed'` and setting `closed_at`, `closed_by`, and cash reconciliation fields.

### orders (updated)

The `orders` table receives one new nullable column that links a POS transaction to the session in which it was created:

| Column         | New/Changed | Notes                                                                                                                                         |
| -------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| pos_session_id | Added       | BIGINT FK(pos_sessions); ON DELETE SET NULL; nullable — NULL for orders not created through a POS session (e.g. online orders, admin-entered) |

This allows per-session revenue reporting and reconciliation: all orders taken during a session can be summed to derive `expected_cash`.

### POS Terminal & Session RLS Policies

| Table         | Policy | Roles / Scope                                                                 |
| ------------- | ------ | ----------------------------------------------------------------------------- |
| pos_terminals | SELECT | all authenticated in tenant                                                   |
| pos_terminals | INSERT | branch-scoped: branch_manager own branch; owner/super_manager/area_manager    |
| pos_terminals | UPDATE | branch-scoped: branch_manager own branch; owner/super_manager/area_manager    |
| pos_terminals | DELETE | branch-scoped: branch_manager own branch; owner/super_manager/area_manager    |
| pos_sessions  | SELECT | all authenticated in tenant                                                   |
| pos_sessions  | INSERT | branch-scoped: cashier/waiter in own branch; owner/super_manager/area_manager |
| pos_sessions  | UPDATE | branch-scoped: cashier/waiter in own branch; owner/super_manager/area_manager |
| pos_sessions  | DELETE | NOT GRANTED — sessions are permanent business records                         |

### POS Terminals & Sessions Indexes

| Index                     | Columns                                         | Purpose                                        |
| ------------------------- | ----------------------------------------------- | ---------------------------------------------- |
| idx_pos_terminals_tenant  | pos_terminals(tenant_id)                        | RLS filter                                     |
| idx_pos_terminals_branch  | pos_terminals(branch_id)                        | Branch-scoped terminal list                    |
| idx_pos_sessions_tenant   | pos_sessions(tenant_id)                         | RLS filter                                     |
| idx_pos_sessions_branch   | pos_sessions(branch_id)                         | Branch-scoped session queries                  |
| idx_pos_sessions_terminal | pos_sessions(terminal_id)                       | Sessions for a given terminal                  |
| idx_pos_sessions_one_open | pos_sessions(terminal_id) WHERE status = 'open' | Partial unique — one open session per terminal |
| idx_orders_pos_session    | orders(pos_session_id)                          | Orders within a session (reconciliation)       |

## KDS Tables

### kds_stations

One row per kitchen display station at a branch. Stations can be assigned to specific menu categories, or left unassigned to act as a "fallback" station that receives items with no category mapping.

| Column     | Type                | Notes                              |
| ---------- | ------------------- | ---------------------------------- |
| id         | BIGINT PK           | GENERATED ALWAYS AS IDENTITY       |
| tenant_id  | BIGINT FK(tenants)  | ON DELETE CASCADE                  |
| branch_id  | BIGINT FK(branches) | ON DELETE CASCADE                  |
| name       | TEXT NOT NULL       | UNIQUE(name, branch_id, tenant_id) |
| position   | INT NOT NULL        | default 0; display order           |
| is_active  | BOOLEAN NOT NULL    | default true                       |
| created_at | TIMESTAMPTZ         | default now()                      |
| updated_at | TIMESTAMPTZ         | default now(), auto-trigger        |

### kds_station_categories

Junction table: which menu categories route to which KDS station.

| Column      | Type                       | Notes                                      |
| ----------- | -------------------------- | ------------------------------------------ |
| id          | BIGINT PK                  | GENERATED ALWAYS AS IDENTITY               |
| tenant_id   | BIGINT FK(tenants)         | ON DELETE CASCADE                          |
| station_id  | BIGINT FK(kds_stations)    | ON DELETE CASCADE                          |
| category_id | BIGINT FK(menu_categories) | ON DELETE CASCADE                          |
|             |                            | UNIQUE(station_id, category_id, tenant_id) |

### kds_tickets

One ticket per order item per station. Created automatically by `route_order_to_kds` when an order is submitted. Bumped by chef through `bump_kds_ticket` RPC.

| Column        | Type                    | Notes                                                           |
| ------------- | ----------------------- | --------------------------------------------------------------- |
| id            | BIGINT PK               | GENERATED ALWAYS AS IDENTITY                                    |
| tenant_id     | BIGINT FK(tenants)      | ON DELETE CASCADE                                               |
| branch_id     | BIGINT FK(branches)     | ON DELETE CASCADE                                               |
| station_id    | BIGINT FK(kds_stations) | ON DELETE CASCADE                                               |
| order_id      | BIGINT FK(orders)       | ON DELETE CASCADE                                               |
| order_item_id | BIGINT FK(order_items)  | ON DELETE CASCADE                                               |
| status        | TEXT NOT NULL           | default 'pending'; CHECK IN (pending, preparing, ready, served) |
| bumped_at     | TIMESTAMPTZ             | Set when chef bumps                                             |
| bumped_by     | UUID FK(profiles)       | Chef who last bumped                                            |
| created_at    | TIMESTAMPTZ             | default now()                                                   |
| updated_at    | TIMESTAMPTZ             | default now(), auto-trigger                                     |
|               |                         | UNIQUE(order_item_id, station_id, tenant_id)                    |

**Realtime enabled:** `kds_tickets` is added to `supabase_realtime` publication for live KDS updates.

### KDS Ticket State Machine

```
pending → preparing → ready → served
```

- `bump_kds_ticket`: advances pending→preparing→ready
- `recall_kds_ticket`: reverts ready→preparing→pending
- When all tickets for an order reach `ready`, `check_order_ready` auto-transitions the parent order to `ready`

### KDS RLS Policies

| Table                  | Policy               | Roles / Scope                                                          |
| ---------------------- | -------------------- | ---------------------------------------------------------------------- |
| kds_stations           | SELECT               | tenant + branch-scoped (branch roles see own branch, managers see all) |
| kds_stations           | INSERT/UPDATE/DELETE | branch_manager + owner/super_manager/area_manager                      |
| kds_station_categories | SELECT               | tenant + branch-scoped via parent station join                         |
| kds_station_categories | INSERT/UPDATE/DELETE | branch_manager + owner/super_manager/area_manager                      |
| kds_tickets            | SELECT               | tenant + branch-scoped                                                 |
| kds_tickets            | INSERT               | cashier, waiter, branch_manager + management roles                     |
| kds_tickets            | UPDATE               | chef, branch_manager + management roles, branch-scoped                 |

### KDS Indexes

| Index                               | Columns                                    | Purpose                 |
| ----------------------------------- | ------------------------------------------ | ----------------------- |
| idx_kds_stations_branch             | kds_stations(branch_id)                    | Branch lookup           |
| idx_kds_station_categories_station  | kds_station_categories(station_id)         | Station lookup          |
| idx_kds_station_categories_category | kds_station_categories(category_id)        | Category lookup         |
| idx_kds_tickets_branch              | kds_tickets(branch_id)                     | Branch-scoped queries   |
| idx_kds_tickets_station             | kds_tickets(station_id)                    | Station-scoped queries  |
| idx_kds_tickets_order               | kds_tickets(order_id)                      | Order lookup            |
| idx_kds_tickets_status              | kds_tickets(branch_id, station_id, status) | Composite: active queue |

### KDS RPC Functions

| Function                                         | Returns | Purpose                                                               |
| ------------------------------------------------ | ------- | --------------------------------------------------------------------- |
| `route_order_to_kds(p_order_id)`                 | void    | Routes order items to stations by category mapping; fallback station  |
| `bump_kds_ticket(p_ticket_id)`                   | TEXT    | Advances ticket: pending→preparing→ready; auto-checks order readiness |
| `recall_kds_ticket(p_ticket_id)`                 | TEXT    | Reverts ticket: ready→preparing→pending; clears bumped_at/bumped_by   |
| `check_order_ready(p_order_id)`                  | void    | Internal: if all tickets ready, transitions order to 'ready'          |
| `save_station_categories(p_station_id, p_ids[])` | void    | Atomic replace: delete old + insert new category assignments          |

> Note: `check_order_ready` has no public GRANT — internal only, called from `bump_kds_ticket`.

> Note: `create_order` RPC was updated to call `route_order_to_kds` automatically after order creation, and now includes server-side price verification (re-fetches prices from menu tables).

## Stocktake

### stocktake_sessions

| Column       | Type                | Notes                                        |
| ------------ | ------------------- | -------------------------------------------- |
| id           | BIGINT PK           | GENERATED ALWAYS AS IDENTITY                 |
| tenant_id    | BIGINT FK(tenants)  | NOT NULL                                     |
| branch_id    | BIGINT FK(branches) | NOT NULL                                     |
| started_at   | TIMESTAMPTZ         | default now()                                |
| completed_at | TIMESTAMPTZ         | set on completion                            |
| status       | TEXT NOT NULL       | CHECK IN (in_progress, completed, cancelled) |
| notes        | TEXT                |                                              |
| created_by   | UUID FK(auth.users) |                                              |
| created_at   | TIMESTAMPTZ         | default now()                                |

**Partial unique:** `UNIQUE(branch_id, tenant_id) WHERE status = 'in_progress'` — only one active stocktake per branch.

### stocktake_lines

| Column           | Type                          | Notes                                         |
| ---------------- | ----------------------------- | --------------------------------------------- |
| id               | BIGINT PK                     | GENERATED ALWAYS AS IDENTITY                  |
| tenant_id        | BIGINT FK(tenants)            | NOT NULL                                      |
| session_id       | BIGINT FK(stocktake_sessions) | ON DELETE CASCADE                             |
| ingredient_id    | BIGINT FK(ingredients)        | NOT NULL                                      |
| system_quantity  | NUMERIC(15,3) NOT NULL        | Snapshot at session creation                  |
| counted_quantity | NUMERIC(15,3)                 | Filled during counting                        |
| variance         | NUMERIC(15,3) GENERATED       | `counted_quantity - system_quantity` (stored) |
| variance_reason  | TEXT                          | Required when variance > 5%                   |
| created_at       | TIMESTAMPTZ                   | default now()                                 |

**Unique:** `UNIQUE(session_id, ingredient_id, tenant_id)`

### Stocktake RPC

| Function                                  | Returns | Purpose                                                                              |
| ----------------------------------------- | ------- | ------------------------------------------------------------------------------------ |
| `complete_stocktake(p_session_id BIGINT)` | void    | Re-snapshots current stock, computes adjustments, inserts count_adjustment movements |

### Additional columns

| Table             | Column                | Type          | Notes                                                                                      |
| ----------------- | --------------------- | ------------- | ------------------------------------------------------------------------------------------ |
| grn_items         | receiving_temperature | NUMERIC(5,1)  | Nullable; receiving temp for cold/frozen items                                             |
| recipes           | yield_factor          | NUMERIC(5,3)  | NOT NULL DEFAULT 1.000; CHECK > 0. Cooking yield multiplier (e.g. 0.85 = 15% loss)         |
| ingredients       | item_kind             | TEXT          | raw_material or finished_good                                                               |
| stock_movements   | production_order_id   | BIGINT        | Nullable FK to production_orders for production audit trail                                 |
| suppliers         | payment_terms_days    | INT           | Nullable; standard payment terms in days (e.g. 30 = Net 30)                                |
| suppliers         | payment_terms_note    | TEXT          | Nullable; free-text payment terms description                                              |
| supplier_invoices | due_date              | DATE          | Nullable; payment due date (can auto-calc from invoice_date + supplier.payment_terms_days) |
| supplier_invoices | payment_status        | TEXT          | NOT NULL DEFAULT 'unpaid'; CHECK IN (unpaid, partial, paid)                                |
| supplier_invoices | paid_amount           | NUMERIC(15,2) | NOT NULL DEFAULT 0; CHECK >= 0. Total amount paid toward this invoice                      |
| supplier_invoices | paid_at               | TIMESTAMPTZ   | Nullable; timestamp of last/final payment                                                  |
| production_recipes | finished_good_id      | BIGINT        | FK(ingredients), finished_good BOM target                                                   |
| production_recipes | ingredient_id         | BIGINT        | FK(ingredients), raw material input                                                         |
| production_recipes | quantity              | NUMERIC(15,3) | Required raw quantity per output unit                                                       |
| production_recipes | yield_factor          | NUMERIC(5,3)  | Default 1.000; optional yield loss/gain                                                     |
| production_orders  | branch_id             | BIGINT        | FK(branches); must reference central_kitchen                                                |
| production_orders  | production_number     | TEXT          | UNIQUE per tenant                                                                            |
| production_orders  | status                | TEXT          | draft, completed, cancelled                                                                  |
| production_order_items | finished_good_id  | BIGINT        | FK(ingredients), finished_good SKU                                                           |
| production_order_items | quantity           | NUMERIC(15,3) | Produced quantity                                                                            |
| production_order_items | unit_cost_at_production | NUMERIC(15,2) | Snapshot of unit cost at completion                                                         |

### Additional indexes

| Index                          | Columns                                                              | Purpose            |
| ------------------------------ | -------------------------------------------------------------------- | ------------------ |
| idx_grn_items_expiry           | grn_items(expiry_date) WHERE NOT NULL                                | Expiry alert query |
| idx_supplier_invoices_ap_aging | supplier_invoices(tenant_id, payment_status, due_date) WHERE != paid | AP aging queries   |

### consume_stock_for_order — yield_factor fix

The `consume_stock_for_order` RPC now uses `recipes.yield_factor` when calculating raw ingredient needs:

```
need_qty = SUM(order_item.quantity * recipe.quantity / recipe.yield_factor)
```

- `yield_factor = 1.0` (default): no change from previous behavior
- `yield_factor = 0.85`: 15% cooking loss, so 1/0.85 = 1.176x raw ingredient needed
- Existing recipes with default yield_factor behave identically to before

---

## Future Tables (by module)

### Payment

- payments, payment_webhooks, refunds

### Stock (SHIPPED)

- ingredients, recipes, stock_levels, stock_movements, suppliers, purchase_orders, purchase_order_items, goods_received_notes, grn_items, supplier_invoices, stock_transfers, stock_transfer_items, stocktake_sessions, stocktake_lines, production_recipes, production_orders, production_order_items
- future split when needed: `inventory_locations` + location-level ledger per `docs/archive/plan/inventory-location-ledger.md`

### Finance

- tax_invoices, chart_of_accounts, journal_entries, mv_daily_revenue, mv_top_items, mv_food_cost

### Nhân sự & tiền lương

- employees, shifts, attendance_records, payroll_periods, payroll_entries

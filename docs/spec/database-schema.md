# Database Schema Reference

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
| settings       | JSONB       | Tenant-level config          |
| created_at     | TIMESTAMPTZ | default now()                |
| updated_at     | TIMESTAMPTZ | default now(), auto-trigger  |

### branches

| Column          | Type               | Notes                   |
| --------------- | ------------------ | ----------------------- |
| id              | BIGINT PK          |                         |
| tenant_id       | BIGINT FK(tenants)  | ON DELETE CASCADE       |
| name            | TEXT               | UNIQUE(name, tenant_id) |
| address         | TEXT               |                         |
| phone           | TEXT               |                         |
| is_active       | BOOLEAN            | default true            |
| is_headquarters | BOOLEAN            | default false           |
| created_at      | TIMESTAMPTZ        | default now()           |
| updated_at      | TIMESTAMPTZ        | default now(), auto-trigger |

### profiles (staff)

| Column     | Type                   | Notes                                           |
| ---------- | ---------------------- | ----------------------------------------------- |
| id         | UUID PK FK(auth.users) | ON DELETE CASCADE                                |
| tenant_id  | BIGINT FK(tenants)     | ON DELETE CASCADE                                |
| branch_id  | BIGINT FK(branches)    | ON DELETE SET NULL; CHECK: required for ops roles |
| role       | staff_role ENUM        | default 'waiter'                                 |
| full_name  | TEXT                   |                                                  |
| phone      | TEXT                   |                                                  |
| avatar_url | TEXT                   |                                                  |
| is_active  | BOOLEAN                | default true                                     |
| created_at | TIMESTAMPTZ            | default now()                                    |
| updated_at | TIMESTAMPTZ            | default now(), auto-trigger                      |

**Constraint** `chk_branch_required_for_ops`:
- `branch_id IS NOT NULL` required when `role IN ('cashier', 'waiter', 'chef', 'branch_manager')`
- `branch_id` nullable for: `owner`, `super_manager`, `area_manager`, `office`

### staff_role ENUM

```
owner, super_manager, area_manager, branch_manager, cashier, waiter, chef, office
```

> Note: Postgres ENUM only supports `ADD VALUE`, not `DROP`. If roles change >2x/year, migrate to a lookup table.

### Role Scoping Notes

| Role | Branch required | Scope | Notes |
|------|----------------|-------|-------|
| owner | No | Tenant-wide | Unrestricted |
| super_manager | No | Tenant-wide | Cannot modify owner |
| area_manager | No | Tenant-wide (temporary) | No area mapping table yet; see Future Work |
| branch_manager | Yes | Own branch | Can manage cashier/waiter/chef in own branch only |
| cashier | Yes | Own branch | Route: `/br/[branchId]/pos` |
| waiter | Yes | Own branch | Route: `/br/[branchId]/pos` |
| chef | Yes | Own branch | Route: `/br/[branchId]/kds` |
| office | No | HQ-wide | Route: `/employee` |

### system_settings (Sprint 1 S2)

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

| Index | Columns | Purpose |
|-------|---------|---------|
| idx_branches_tenant | `branches(tenant_id)` | FK lookup, RLS filter |
| idx_profiles_tenant_branch | `profiles(tenant_id, branch_id)` | Branch-scoped RLS |
| idx_profiles_tenant_role | `profiles(tenant_id, role)` | Role filtering in admin UI |
| idx_system_settings_tenant | `system_settings(tenant_id)` | FK lookup, RLS filter |

## Auth Helper Functions

| Function                          | Returns | Purpose                                        |
| --------------------------------- | ------- | ---------------------------------------------- |
| `auth_tenant_id()`                | BIGINT  | Extract tenant_id from JWT app_metadata        |
| `auth_branch_id()`                | BIGINT  | Extract branch_id from JWT app_metadata        |
| `auth_role()`                     | TEXT    | Extract user_role from JWT app_metadata        |
| `custom_access_token_hook(event)` | JSONB   | Inject claims into JWT (SECURITY DEFINER)      |
| `handle_new_user()`               | TRIGGER | Auto-create profile from `raw_app_meta_data`   |
| `update_my_profile()`             | void    | Self-update safe fields only (SECURITY DEFINER) |
| `admin_update_profile()`          | void    | Manager update with scope checks (SECURITY DEFINER) |
| `update_updated_at()`             | TRIGGER | Auto-set `updated_at` on row update           |
| `set_headquarters(p_branch_id)`   | void    | Atomic HQ swap — unset old + set new in one tx |

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

Actor scope restrictions:

| Actor | Can modify | Target role limits | Branch limits |
|-------|-----------|-------------------|---------------|
| owner | Anyone in tenant | All roles | Any branch |
| super_manager | All except owner | All except owner | Any branch |
| area_manager | branch_manager and below | Cannot set owner/super_manager/area_manager | Any branch (temporary) |
| branch_manager | cashier/waiter/chef in own branch | cashier/waiter/chef only | Own branch only |

Additional checks:
- `branch_manager` cannot modify peer `branch_manager`
- `super_manager` cannot modify/deactivate `owner`
- Operational roles (`cashier`, `waiter`, `chef`, `branch_manager`) require `branch_id`
- `branch_id` must belong to same tenant (cross-tenant check)
- `p_full_name` and `p_phone` use COALESCE — pass NULL to keep existing value (Sprint 1 S3)

## RLS Policies (v0.1.1)

| Table    | Policy                                  | Roles / Scope                                   |
| -------- | --------------------------------------- | ------------------------------------------------ |
| tenants  | SELECT own tenant                       | all authenticated                                |
| branches | SELECT in tenant                        | all authenticated                                |
| branches | ALL (manage)                            | owner, super_manager                             |
| profiles | SELECT branch-scoped                    | self + same branch; managers/office see wider (see below) |
| profiles | UPDATE own safe fields                  | self — `full_name`, `phone`, `avatar_url` only   |
| profiles | (no direct INSERT/DELETE)               | All profile mutations go through RPCs only        |
| system_settings | SELECT in tenant                 | all authenticated                                |
| system_settings | INSERT/UPDATE/DELETE             | owner, super_manager only                        |

### profiles SELECT scope detail

| Viewer role | Sees |
|------------|------|
| owner, super_manager, area_manager, office | All profiles in tenant |
| branch_manager | Own profile + profiles in own branch |
| cashier, waiter, chef | Own profile + profiles in own branch |

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

## Future Tables (by phase)

### Sprint 1 — Core Management (remaining)

- menu_categories, menu_items, menu_item_variants, menu_item_modifiers, menu_item_available_sides
- branch_zones, tables

### v0.3.0 — Operations

- orders, order_items, payments, tables, pos_terminals, kds_stations, tax_invoices

### v0.4.0 — Supply Chain

- ingredients, suppliers, purchase_orders, goods_received_notes, grn_items, supplier_invoices, stock_levels, stock_movements

### v0.5.0 — Intelligence + CTCP

- customers, loyalty_tiers, loyalty_transactions, employees, shifts, payroll_periods, payroll_entries

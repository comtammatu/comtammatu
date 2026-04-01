# Database Schema Reference

## Core Tables (v0.1.0)

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
| created_at     | TIMESTAMPTZ |                              |
| updated_at     | TIMESTAMPTZ |                              |

### branches

| Column          | Type               | Notes                   |
| --------------- | ------------------ | ----------------------- |
| id              | BIGINT PK          |                         |
| tenant_id       | BIGINT FK(tenants) |                         |
| name            | TEXT               | UNIQUE(name, tenant_id) |
| address         | TEXT               |                         |
| phone           | TEXT               |                         |
| is_active       | BOOLEAN            | default true            |
| is_headquarters | BOOLEAN            | default false           |

### profiles (staff)

| Column     | Type                   | Notes                                 |
| ---------- | ---------------------- | ------------------------------------- |
| id         | UUID PK FK(auth.users) |                                       |
| tenant_id  | BIGINT FK(tenants)     |                                       |
| branch_id  | BIGINT FK(branches)    | nullable — managers may be unassigned |
| role       | staff_role ENUM        | default 'waiter'                      |
| full_name  | TEXT                   |                                       |
| phone      | TEXT                   |                                       |
| avatar_url | TEXT                   |                                       |
| is_active  | BOOLEAN                | default true                          |

### staff_role ENUM

```
owner, super_manager, area_manager, branch_manager, cashier, waiter, chef, office
```

## Auth Helper Functions

| Function                          | Returns | Purpose                                   |
| --------------------------------- | ------- | ----------------------------------------- |
| `auth_tenant_id()`                | BIGINT  | Extract tenant_id from JWT                |
| `auth_branch_id()`                | BIGINT  | Extract branch_id from JWT (nullable)     |
| `auth_role()`                     | TEXT    | Extract user_role from JWT                |
| `custom_access_token_hook(event)` | JSONB   | Inject claims into JWT (SECURITY DEFINER) |
| `handle_new_user()`               | TRIGGER | Auto-create profile on auth.users INSERT  |

## RLS Policies (v0.1.0)

| Table    | Policy            | Roles                |
| -------- | ----------------- | -------------------- |
| tenants  | SELECT own tenant | all authenticated    |
| branches | SELECT in tenant  | all authenticated    |
| branches | ALL (manage)      | owner, super_manager |
| profiles | SELECT in tenant  | all authenticated    |
| profiles | UPDATE own        | self                 |
| profiles | ALL (manage)      | owner, super_manager |

## Type Boundaries

| Domain      | PostgreSQL Type                       |
| ----------- | ------------------------------------- |
| Money       | `NUMERIC(15,2)`                       |
| Time        | `TIMESTAMPTZ`                         |
| Primary Key | `BIGINT GENERATED ALWAYS AS IDENTITY` |
| Text        | `TEXT` (no VARCHAR)                   |

## Future Tables (by phase)

### v0.2.0 — Core Management

- menu_categories, menu_items, menu_item_variants, menu_item_modifiers

### v0.3.0 — Operations

- orders, order_items, payments, tables, pos_terminals, kds_stations, tax_invoices

### v0.4.0 — Supply Chain

- ingredients, suppliers, purchase_orders, goods_received_notes, grn_items, supplier_invoices, stock_levels, stock_movements

### v0.5.0 — Intelligence + CTCP

- customers, loyalty_tiers, loyalty_transactions, employees, shifts, payroll_periods, payroll_entries

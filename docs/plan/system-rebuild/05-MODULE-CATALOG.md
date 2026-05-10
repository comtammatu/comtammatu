# 05 — Module Catalog

> **Vai trò:** Canonical catalog of capabilities, schema, permissions, dependencies, and page contracts per module. Single source of truth that drives wave plan and per-module sign-off.
> **Reads:** `PROGRAM-READINESS.md` (master) §4 (module index), §6 (sign-off table), §9 (Go/No-Go gate).
> **Read by:** `06-WAVE-PLAN.md` (wave gates reference per-module exit criteria); per-wave implementation kickoff.
> **Date:** 2026-05-07
> **Owner:** ngocnghia128@gmail.com

---

## §1. Catalog Index

11 effective modules (12 nominal — Master Data folds into Auth + Admin per §4 note in master).

| # | Module | Wave | ACL key prefix | Status |
|---|---|---|---|---|
| 1 | Auth | W1 | `staff:*` (catalog management); `has_permission(branch,key)` for row-level | DRAFT |
| 2 | Admin | W2 | `settings:*`, `staff:*` | DRAFT |
| 3 | Master Data (folded) | — | folded into Auth (tenants, positions) + Admin (branches, areas) | FOLDED |
| 4 | Employee | W2 (shell) / W4 (data flows) | `employee:*` (route ACL); RLS self-scope | DRAFT |
| 5 | Inventory | W3 | `inventory:*`, `procurement:*`, `supplier_return:*` | DRAFT |
| 6 | Finance / Accounting | W4 | `finance:*`, `accounting:*` | DRAFT |
| 7 | Nhân sự & tiền lương | W4 | `hr:*`, `reports:pit_export` | DRAFT |
| 8 | Orders | W5 | `orders:*` | DRAFT |
| 9 | POS | W5 | `pos:*` | DRAFT |
| 10 | KDS | W5 | `kds:*` | DRAFT |
| 11 | Print | W5 | `printer:*`, `pos:print` | DRAFT |
| 12 | Notifications + Reporting | W6 | `reports:*` (notifications: cross-cutting) | DRAFT |

**Per-module structure** (consistent template):

1. Capabilities — what the module must do
2. Schema needed — tables, views, RPCs (green baseline target; blue artifact may differ)
3. Permission keys — from `packages/shared/src/auth/permissions.ts` catalog
4. Dependencies — depends-on / depended-by
5. Sign-off blockers — module-specific (B22+) plus references to program-level B1–B21
6. Wave assignment — per `PROGRAM-READINESS.md` §4 + this doc's reconciliation
7. Page contracts — route family + ownership

**Permission key catalog total:** 94 keys across 17 prefixes (see `packages/shared/src/auth/permissions.ts:11`).

---

## §2. Auth (Module 1, Wave W1)

### 2.1 Capabilities

- Email/password login với rate limit (Upstash) + fail-open observability
- JWT minting via `custom_access_token_hook` (SECURITY DEFINER): inject `tenant_id`, `branch_id`, `user_role`, `position` vào `app_metadata`
- Position vs Permission separation — Position là HR chức vụ (per tenant), Permission là canonical action key (global catalog)
- Permission grant/revoke với RPC SECURITY DEFINER + audit log; temporal validity (`valid_from`, `valid_until`); branch-scoped + tenant-wide grants
- Role template — preset bundle of permission keys, snapshot apply (edits không propagate)
- RLS helpers: `has_permission(branch_id, key)` (live, immediate revoke), `has_permission_any(key)` (tenant-scope helper)
- Legacy role compat — `user_role` JWT claim derived from `positions.legacy_role_code` cho fast route gate
- Single auth gate — `apps/web/proxy.ts`: session + claims + module ACL + branch scope; layouts/pages trust proxy
- Blocked-state UI — `/access-denied` public route renders reason copy from `blocked-state.ts`; canonical reasons: `insufficient-permission`, `missing-auth-context`, `branch-scope-mismatch`, `warehouse-branch-restricted`
- Login error consolidation — generic Vietnamese copy `"Email hoặc mật khẩu không đúng"` cho mọi post-validation failure (anti-enumeration)
- Tenant identity invariants: `profiles.position_id NOT NULL` + FK `ON DELETE RESTRICT`; `tenants.owner_user_id` follow-up (ADR-0005)

### 2.2 Schema

| Object | Type | Notes |
|---|---|---|
| `permission_keys` | table | Global catalog; 94 rows mirroring TS const |
| `positions` | table | Per tenant; `code`, `legacy_role_code` mapping (per ADR-0004 normalization) |
| `role_templates` | table | Snapshot bundle of permission keys |
| `staff_permissions` | table | `(user_id, branch_id, permission_key, valid_from, valid_until)`; `branch_id IS NULL` ⇒ tenant-wide |
| `permission_audit_log` | table | Append-only grant/revoke history |
| `profiles` | table | Folded from Master Data: `(id, tenant_id, branch_id, position_id, full_name, phone, avatar_url, is_active)`; FK `auth.users` ON DELETE CASCADE |
| `tenants` | table | Folded from Master Data: single row CTCP; `tax_code`, `legal_name`, `legal_address`, `representative` (free-text legal name, NOT user oracle) |
| `custom_access_token_hook(event)` | RPC | SECURITY DEFINER; inject claims vào JWT |
| `handle_new_user()` | trigger | Invite-only signup; reads `raw_app_meta_data`, fails loud on `position_not_resolved` |
| `update_my_profile()` | RPC | Self-update safe fields only |
| `admin_update_profile()` | RPC | Manager update with role-hierarchy scope checks |
| `has_permission(branch_id, key)` | RPC | Live row-level gate; owner bypass; temporal filter |
| `has_permission_any(key)` | RPC | Tenant-scope helper (any branch grant) |
| `grant_permission(target, branch, key, template?, valid_from?, valid_until?)` | RPC | SECURITY DEFINER; requires `staff:assign_permission`; logs to audit |
| `revoke_permission(target, branch, key)` | RPC | Same caller gate; logs to audit |
| `apply_template_to_user(target, branch, template, valid_from?, valid_until?)` | RPC | Bundle apply |
| `auth_tenant_id()`, `auth_branch_id()`, `auth_role()` | RPC | JWT extraction helpers (cached up to ~1h until token refresh) |

### 2.3 Permission keys

- `staff:view`, `staff:manage`, `staff:assign_permission`, `staff:assign_position` (catalog management; ACL on grant/revoke flow)
- `dashboard:view` (auth-anchored landing for managers)
- All other prefixes belong to other modules; Auth provides infrastructure (`has_permission`) for all of them.

### 2.4 Dependencies

- **Depends on:** Master Data (folded — `tenants`, `branches`, `profiles`, `positions` schema must exist)
- **Depended-by:** ALL modules (every request goes through proxy + RLS)
- **External:** Supabase Auth (identity), Upstash (rate limit, fail-open), `@supabase/ssr` (cookie state)

### 2.5 Sign-off blockers

- **B3** Auth user preservation — preserve `auth.users` IDs + emails via Admin API import; force password reset post-cutover (ADR-0001) — APPROVED 2026-05-07
- **B9** Identifier language — English `lower_snake_case` for position codes (ADR-0004) — APPROVED 2026-05-07
- **B12** Auth migration strategy — covered by B3 — APPROVED
- **B18** Position-code casing cleanup — covered by B9 — APPROVED
- **B22 (module-specific)** — Position seed + role_templates seed for green baseline (depends on `05-MODULE-CATALOG` finalization). Owner sign-off required before W1 start.
- **H3a** invariant (`profiles.position_id` NOT NULL) — DRAFTED migration, holds for green apply
- **H3b** invariant (`tenants.owner_user_id`) — ADR-0005 deferred; revisit during W1

### 2.6 Wave assignment

W1 — first module after W0 design foundation. Auth must ship before W2/W3/W4/W5/W6 can persona-test their gates.

### 2.7 Page contracts

| Route | Owner role | Notes |
|---|---|---|
| `/login` | public | Login form + rate limit |
| `/access-denied` | public | Renders blocked-state copy from reason code |
| `/admin/staff` | owner, super_manager | Staff CRUD with hierarchy auth |
| `/admin/staff/audit` | owner, super_manager | Permission audit log viewer |
| `/admin/staff/[id]/permissions` | owner, super_manager | Per-user grant/revoke + template apply |
| `/api/auth/signout` | authenticated | POST logout |
| `/api/debug/claims` | dev only | Gated, not for prod |

---

## §3. Admin (Module 2, Wave W2)

### 3.1 Capabilities

- Foundation controls: tenant-level system settings (`vat_rate`, `service_charge`, `currency`, `store_phone`, `store_email`, integration provider keys)
- Branch CRUD + `set_headquarters` atomic swap (one HQ per tenant invariant)
- Area management + `area_branches` mapping (for `area_manager` scope)
- Branch attendance config per branch (geofence radius, network gate, etc.)
- Branch kind classification (`branch`, `headquarters`, `central_kitchen`, `warehouse`)
- Branch trusted egress IPs + override codes (network gate for POS)
- Executive reporting shell — landing surface for owner/super_manager (`/admin/dashboard`)
- Staff admin shell (delegates row mutations to Auth grant/revoke RPCs)
- Feedback admin (QR phản ánh khách — moderation, settings, telegram dispatch config)
- CRM placeholder — Post-v1.0; route exists but no daily-use content

### 3.2 Schema

| Object | Type | Notes |
|---|---|---|
| `branches` | table | Folded Master Data; `(id, tenant_id, name, address, phone, branch_kind, is_active, is_headquarters)` |
| `areas` | table | Per tenant; for area_manager scope |
| `area_branches` | table | M:N mapping |
| `system_settings` | table | Tenant-scoped key/value; `(key, tenant_id) UNIQUE` |
| `branch_attendance_config` | table | Per-branch HR config |
| `branch_trusted_egress_ips` | table | Network gate seed |
| `branch_override_codes` | table | Hardblock override |
| `branch_override_attempts` | table | Audit |
| `branch_feature_flags` | table | Per-branch feature flag (sparse use; consider DROP per audit) |
| `set_headquarters(p_branch_id)` | RPC | Atomic unset old + set new in one tx |

### 3.3 Permission keys

- `settings:branch`, `settings:tenant`, `settings:integrations`, `settings:branch_network`
- `staff:view`, `staff:manage` (catalog UI; row mutations via Auth RPCs)
- `feedback:view`, `feedback:view_phone`, `feedback:view_report`, `feedback:manage_qr`, `feedback:manage_telegram`, `feedback:manage_settings`, `feedback:moderate`
- `crm:read`, `crm:write`, `crm:campaign_send` (Post-v1.0 — gated but unused)

### 3.4 Dependencies

- **Depends on:** Auth (W1)
- **Depended-by:** Inventory (W3 — needs `branch_kind`), Finance (W4 — fiscal periods scoped), HR (W4 — branch attendance config), POS (W5 — branch_trusted_egress), KDS (W5 — branch scope)

### 3.5 Sign-off blockers

- **B8** Brand authority — Ma Tu Concept 01 design system; no parallel theme layer — APPROVED
- **B11** New Supabase project — covered by B4 — APPROVED
- **B23 (module-specific)** — Tenant seed (single-row CTCP) + initial branch + area + position seeds for green load. Required before W2 implementation start.
- **B24 (module-specific)** — Feedback module scope decision — KEEP/MIGRATE or DROP_ACCEPTED. Currently in `module-acl.ts` but not in §4 master list. Owner to confirm.

### 3.6 Wave assignment

W2 — after Auth (W1). Persona ACL test green = W2 exit gate.

### 3.7 Page contracts

| Route | Owner role | Notes |
|---|---|---|
| `/admin/dashboard` | owner, super_manager | ERP cockpit landing |
| `/admin/settings/general` | owner, super_manager | System settings key/value |
| `/admin/settings/branches` | owner, super_manager | Branch CRUD + set_headquarters |
| `/admin/settings/areas` | owner, super_manager | Area management |
| `/admin/settings/tables` | settings roles (branch-scoped) | Tables & zones |
| `/admin/settings/pos` | settings roles | POS terminal settings |
| `/admin/settings/kds` | settings roles | KDS station settings |
| `/admin/settings/payments` | settings roles | Payment method config |
| `/admin/settings/printers` | settings roles | Printer fleet config + jobs/ |
| `/admin/feedback` | owner, super_manager, area_manager, branch_manager | Feedback admin (per ACL) |
| `/admin/crm` | owner, super_manager | Placeholder Post-v1.0 |

---

## §4. Master Data — FOLDED

Per `PROGRAM-READINESS.md` §4 note: not an independent module. Schema fold:

- **Tenants, positions** → Auth (§2)
- **Branches, areas, area_branches, system_settings, branch_attendance_config** → Admin (§3)
- **Profiles** → Auth (§2) — table itself; row creation via `handle_new_user` trigger; HR data extension via Employee/HR modules

If owner decides to separate: become module 13 with own catalog section + W2 dual-track. **B25 (deferred)** — owner sign-off if separation requested. Current decision: FOLDED (matches §4 master).

---

## §5. Employee (Module 4, Wave W2 shell / W4 data flows)

### 5.1 Capabilities

- Personal profile view + safe-field self-update (`full_name`, `phone`, `avatar_url`)
- Clock in/out (geofence + network gate via `branch_trusted_egress_ips`)
- Attendance history (self-scope read)
- Work schedule view (self-scope read)
- Payslip viewer (self-scope read)
- Notification inbox (cross-cuts §13)
- Mobile-first responsive shell

### 5.2 Schema

| Object | Type | Notes |
|---|---|---|
| `profiles` | table | Already in Auth schema — Employee adds READ access path via RLS self-scope |
| `attendance_records` | table | Owned by HR (W4) — Employee reads self-scope |
| `shift_assignments` | table | Owned by HR (W4) — Employee reads self-scope |
| `payroll_entries` | table | Owned by HR (W4) — Employee reads self-scope payslip |
| `clock_in_out RPC` | RPC | TBD per W4 HR design — geofence + network validation |

### 5.3 Permission keys

- Route ACL: `employee` module accepts ALL `STAFF_ROLES` (per `module-acl.ts:142-146`)
- Row-level: RLS self-scope (no explicit perm key per row read for self data)
- Future: `employee:clock_other` if delegated clock-in needed

### 5.4 Dependencies

- **Depends on:** Auth (W1) for identity + RLS; Admin (W2) for `branch_attendance_config`
- **Depended-by:** HR (W4) — payroll/attendance data sourced from Employee clock flows
- **External:** GPS (browser), branch network gate

### 5.5 Sign-off blockers

- **B26 (module-specific)** — Geofence + network gate policy: when employee mobile data conflicts with branch IP whitelist, fall back to GPS-only? Owner to confirm policy before W2 ship.
- Covered by B3 (auth user preservation — employees survive cutover).

### 5.6 Wave assignment

- **W2 (shell):** Employee shell + profile read/update — depends only on Auth
- **W4 (data flows):** clock/attendance/schedule/payslip — depends on HR data being live
- Per `01-BRAND-SOFTWARE-PROGRAM.md` W4 grouping; reconciles with master `§4` "Employee → W2" by treating shell-only as W2.

### 5.7 Page contracts

| Route | Owner role | Notes |
|---|---|---|
| `/employee` | all staff | Dashboard with quick actions |
| `/employee/profile` | self | Personal profile |
| `/employee/clock` | self | Clock in/out (W4 wires backend) |
| `/employee/attendance` | self | Attendance history (W4) |
| `/employee/schedule` | self | Work schedule (W4) |
| `/employee/payslip` | self | Payslip viewer (W4) |

---

## §6. Inventory (Module 5, Wave W3)

### 6.1 Capabilities

- **Master data:** ingredients (raw + finished good), recipes (sales menu consumption + production BOM), suppliers
- **Stock:** stock levels by `(branch, location, ingredient)`, stock movements ledger (atomic), stock_levels projection
- **Inventory locations:** Phase 1 default-only seeded; Phase 2 location-ledger cutover deferred (per archived `inventory-location-ledger-phase2.md`)
- **GRN flow:** receive against PO, partial receipt, GRN confirm with variance; supplier-invoice match (3-way: PO/GRN/HĐ); express GRN windows (configurable, override-gated)
- **Procurement:** PO draft → sent → partially_received → fully_received state machine; supplier price list management; supplier returns (QC at receiving + post-receipt)
- **Transfers:** intra-branch (`Cấp bếp` via `?create=cap-bep`) and inter-branch state machine (`draft → confirmed_ship → in_transit → confirmed_receive → received`); permission-gated per leg
- **Stocktake:** sessions (`open → counting → completed | cancelled`); blind/recount/escalate retired from daily UI for pilot; `complete_stocktake` re-snapshots + inserts adjustments
- **Production:** BOM (production_recipes), production_orders + items; central_kitchen-only; super_manager / production_manager operator
- **Expiry tracking:** `grn_items.expiry_date` indexed alert query
- **Waste flow:** auto + manual + tier-2 approval; photo evidence (Storage); bypass requires permission
- **Adjust / write-off:** approve-gated mutations
- **Food cost analysis:** delegates to Finance (W4) — Inventory exposes data
- **Dashboard:** task-queue-first by role/site; live-data, NOT stale V1 MVs (per `02-GREEN-BASELINE.md`)
- **Mobile routes:** `/inventory/m/*` — drafts, GRN new/[supplierId], production, stock, transfers/[id]/receive
- **Reports:** stock movement, valuation, food cost, expiry — live queries

### 6.2 Schema

| Object | Type | Notes |
|---|---|---|
| `ingredients` | table | `item_kind` (raw/finished_good); per-tenant catalog |
| `recipes` | table | Sales menu recipe; `yield_factor` (cooking loss multiplier) |
| `inventory_locations` | table | Per branch (Phase 1 default only) |
| `stock_levels` | table | Projection table; per `(branch, location, ingredient)` |
| `stock_movements` | table | Ledger; `production_order_id` FK for production audit |
| `stocktake_sessions` | table | Partial unique: 1 active per branch |
| `stocktake_lines` | table | `system_quantity`, `counted_quantity`, `variance` GENERATED |
| `stock_transfers`, `stock_transfer_items` | table | Inter-branch transfer state machine |
| `stock_issues` | table | Consumption / writeoff / other (NOT `Cấp bếp` — those go through transfers) |
| `suppliers` | table | `payment_terms_days`, `payment_terms_note` |
| `purchase_orders`, `purchase_order_items` | table | PO state machine |
| `goods_received_notes`, `grn_items` | table | GRN with variance support; `receiving_temperature` for cold chain |
| `supplier_invoices` | table | `due_date`, `payment_status`, `paid_amount`, `paid_at` |
| `supplier_returns` | table | QC at receiving + post-receipt |
| `production_recipes`, `production_orders`, `production_order_items` | table | Production module |
| `inventory_qc_settings` | table | QC config per branch |
| `consume_stock_for_order(p_order_id)` | RPC | Uses `recipes.yield_factor`; called from POS/KDS path |
| `complete_stocktake(p_session_id)` | RPC | Re-snapshot + insert count_adjustment movements |
| `grn_confirm(p_grn_id)` | RPC | Atomic GRN finalization |
| Transfer state RPCs | RPC | `confirm_ship`, `in_transit`, `confirm_receive` |
| `is_inventory_production_operator()` | helper | Hard-deny `area_manager`/`branch_manager` from production |

### 6.3 Permission keys

- **inventory:** `inventory:read`, `inventory:write`, `inventory:stocktake_create`, `inventory:stocktake_complete`, `inventory:stocktake_recount`, `inventory:stocktake_unblind`, `inventory:transfer_create`, `inventory:transfer_ship`, `inventory:transfer_receive`, `inventory:writeoff`, `inventory:production_create`, `inventory:production_confirm`, `inventory:waste_approve`, `inventory:waste_bypass_photo`, `inventory:adjust_approve`, `inventory:grn_express_configure`, `inventory:grn_express_extend`, `inventory:grn_hardblock_override`, `inventory:catalog_review_policy_set`, `inventory:item_review_override_set`
- **procurement:** `procurement:read`, `procurement:po_create`, `procurement:po_approve`, `procurement:grn_create`, `procurement:grn_confirm`, `procurement:grn_amend`, `procurement:invoice_create`, `procurement:invoice_match`, `procurement:supplier_manage`, `procurement:price_list_read`, `procurement:price_list_write`, `procurement:override_code_rotate`
- **supplier_return:** `supplier_return:read`, `supplier_return:create`, `supplier_return:confirm`

### 6.4 Dependencies

- **Depends on:** Auth (W1), Master Data + Admin (W2 — `branch_kind` for HQ/central_kitchen/warehouse classification)
- **Depended-by:** Orders / POS (W5 — stock consumption), Finance (W4 — food cost, AP via supplier_invoices), HR (none direct)
- **External:** Storage (waste photos, supplier_return evidence)

### 6.5 Sign-off blockers

- **B16** V1 data classes drop/archive/migrate per audit — APPROVED (sign-off after audit run)
- **B17** AP/supplier invoice scope KEEP — APPROVED 2026-05-07
- **B19** In-place freeze in effect — APPROVED 2026-05-07; inventory plan archive folded per `PROGRAM-READINESS.md §3`
- **B27 (module-specific)** — Location-ledger Phase 2 cutover plan: stay Phase 1 default-only for green pilot, or attempt full location-ledger green? Recommendation: STAY Phase 1, defer Phase 2 to Post-v1.0. Owner to confirm.
- **B28 (module-specific)** — Express GRN windows + hardblock override-code policy: rotate frequency, default window length. Default proposal: 30-day rotation, 4h window. Owner to confirm.
- **B29 (module-specific)** — Supplier returns flow scope for green: full QC + post-receipt return, or QC-only? Recommendation: full. Owner to confirm.
- **B30 (module-specific)** — Catalog review policy default for new ingredients: required vs optional. Recommendation: required for finished_good, optional for raw_material.

### 6.6 Wave assignment

W3 — depends on W2 (branch_kind config). Inventory schema baseline + persona ACL test = W3 exit gate.

### 6.7 Page contracts

| Route | Owner role | Notes |
|---|---|---|
| `/inventory` | inventory roles | Task-queue dashboard by role/site |
| `/inventory/dashboard` | inventory roles | Detailed dashboard view |
| `/inventory/ingredients` | inventory roles | Ingredient master (canonical entry) |
| `/inventory/recipes` | inventory roles | Sales recipe / Định mức món bán |
| `/inventory/stock` | inventory roles | Live stock by site |
| `/inventory/suppliers` | procurement roles | Supplier directory |
| `/inventory/supplier-invoices` | procurement roles | Invoice match (AP handoff to Finance) |
| `/inventory/supplier-returns` | procurement roles | QC + post-receipt returns |
| `/inventory/purchase-orders[/new\|/[id]]` | procurement roles | PO list + detail |
| `/inventory/receiving` | procurement roles | HQ procurement hub |
| `/inventory/grn[/[id]]` | procurement roles | GRN list + detail; confirm wired |
| `/inventory/transfers[/[id]]` | inventory roles | Internal transfer state machine |
| `/inventory/production` | super_manager, production_manager | Central kitchen production |
| `/inventory/stocktake[/new\|/[id]]` | inventory roles | Open/count/complete |
| `/inventory/issues[/[id]]` | inventory roles | Consumption/writeoff/other |
| `/inventory/expiry` | inventory roles | Expiry tracking |
| `/inventory/waste` | inventory roles | Waste flow (auto/new/approval) |
| `/inventory/reports` | inventory roles | Reporting with live data |
| `/inventory/m/*` | inventory roles | Mobile routes |
| `/inventory/settings/{expiry,qc}` | inventory roles | Inventory-specific config |

---

## §7. Finance / Accounting (Module 6, Wave W4)

### 7.1 Capabilities

- **GL chart of accounts:** management, hierarchy, VAS-aligned account codes
- **Journal entries:** double-entry bookkeeping; posting rules engine (`posting_rules` table)
- **Fiscal periods:** open/close/reopen state machine; `accounting:period_reopen` perm-gated
- **Period close guardrails:** `close_fiscal_period` RPC validates balance, journal continuity, draft entries blocking
- **Tax invoices (HĐĐT):** state machine `(draft → issued → archived)`; provider abstraction (Viettel S-invoice canonical, MISA legacy/optional only when explicitly configured, VNPT future); evidence retention via Storage
- **VAS report lines:** monthly VAT GTGT export data (đầu ra + đầu vào khấu trừ)
- **Audit trail:** finance audit logs (cross-cuts §14 audit cross-cutting concern)
- **Food cost analysis:** Inventory data + GL — variance, COGS%, top-cost items
- **Revenue rollups:** by day / branch / cashier / hour; drill-down by date
- **Reconciliation:** POS/subledger ↔ GL — surfacing payment/order desync (per archived `m4-payments-fix.md`)
- **Posting rules:** GL posting per event type (revenue, refund, payroll, AP); pilot uses hardcoded VAS accounts (5111/1111/1121)
- **Financial statements:** P&L, balance sheet (Post-v1.0; pilot exposes raw data + reports)
- **Refund flow integration:** `reverse_payment_and_post` RPC — atomic GL reversal + stock restore + payment+order status flip + audit
- **Supplier payment / AP:** `create_supplier_payment` RPC; per B17 AP scope KEEP
- **Payroll journal:** `post_payroll_journal` RPC — cross-cut HR (W4)

### 7.2 Schema

| Object | Type | Notes |
|---|---|---|
| `chart_of_accounts` | table | Hierarchical; VAS-aligned codes |
| `journal_entries` | table | Header (period_id, posted_at, source_event) |
| `journal_entry_lines` | table | Debit/credit lines |
| `fiscal_periods` | table | `(year, month, status)`; `closed_at`, `closed_by` |
| `tax_invoices` | table | HĐĐT state machine; `provider`, `provider_invoice_id`, `pdf_storage_path` |
| `vas_report_lines` | table | Monthly VAT export rows |
| `audit_logs` | table | Finance + cross-module audit; `(tenant_id, entity, entity_id, created_at)` indexed |
| `posting_rules` | table | Event → debit/credit account mapping |
| `payments`, `payment_webhooks`, `refunds` | table | Owned by POS but Finance integrates via reconciliation + journal |
| `webhook_events` | table | Idempotency key `(provider, request_id)` UNIQUE |
| `close_fiscal_period(p_period_id)` | RPC | Permission-gated `accounting:period_reopen` for reopen |
| `gl_reconciliation()` | RPC | POS↔GL invariant check |
| `recompute_total(p_order_id)` | RPC | Server-side `total_amount` (anti-tamper) |
| `reverse_payment_and_post()` | RPC | Atomic refund + GL reversal + audit |
| `create_supplier_payment()` | RPC | AP payment posting |
| `post_payroll_journal()` | RPC | Cross-cut HR |
| `confirm_cash_payment()` | RPC | POS cash close + GL post |
| `complete_payment_and_consume_stock()` | RPC | Atomic payment + stock consumption + finance event |

### 7.3 Permission keys

- **finance:** `finance:view`, `finance:expense_create`, `finance:expense_approve`, `finance:payroll_calculate`, `finance:payroll_approve`, `finance:ap_pay`
- **accounting:** `accounting:period_reopen`
- **reports:** `reports:view_branch`, `reports:view_tenant`, `reports:export` (cross-cut Reporting)

### 7.4 Dependencies

- **Depends on:** Auth (W1), Admin (W2), Inventory (W3 — food cost, supplier_invoices for AP)
- **Depended-by:** Orders/POS (W5 — revenue posting), HR (W4 — payroll journal), Reporting (W6 — financial statements)
- **External:** Viettel S-invoice API, MISA meInvoice (legacy/optional explicit config only), VNPT (future); MoMo provider for refund webhook

### 7.5 Sign-off blockers

- **B17** AP/supplier invoice scope KEEP — APPROVED
- **B19** In-place freeze of finance-redesign 2-week sprint — APPROVED 2026-05-07; capabilities ported (8 KPI cards, filter bar, 4 chart types, reconciliation tolerance) → re-build trên green W4
- **B31 (module-specific)** — HĐĐT provider seed for green: Viettel S-invoice credentials; MISA config only if owner explicitly keeps the legacy provider available. Owner to provide.
- **B32 (module-specific)** — Posting rules table seed for green: revenue, refund, payroll, AP, food cost events. Pilot uses hardcoded VAS (5111/1111/1121); post-pilot move to data-driven.
- **B33 (module-specific)** — Reconciliation tolerance threshold (default 1,000 VND? per archived finance-redesign).
- **B34 (module-specific)** — Period close window: monthly close on day-X of next month; currently no policy.
- **M4 P0 hangovers** (per archived `m4-payments-fix.md`): MoMo webhook tenant binding, server recompute total, stock consumption fail-soft check, POS calls provider before DB lock — re-implement on green per `02-GREEN-BASELINE.md` "do not port" list.

### 7.6 Wave assignment

W4 — depends on Inventory (W3) for food cost + AP. Period/payroll invariants verified = W4 exit gate.

### 7.7 Page contracts

| Route | Owner role | Notes |
|---|---|---|
| `/finance` | owner, super_manager | Revenue + invoice overview |
| `/finance/revenue[/[date]]` | finance roles | Revenue rollups + drilldown |
| `/finance/reconciliation` | finance roles | POS↔GL recon |
| `/finance/chart-of-accounts` | finance roles | COA management |
| `/finance/journal` | finance roles | Journal entries |
| `/finance/posting-rules` | finance roles | GL posting rules |
| `/finance/food-cost` | finance roles | Food cost analysis |
| `/finance/periods` | finance roles | Fiscal period management |
| `/finance/audit-trail` | finance roles | Audit log |
| `/finance/statements` | finance roles | Financial statements (Post-v1.0) |
| `/admin/accounting/periods` | owner, super_manager | Period close/reopen (`accounting:period_reopen` gate) |
| `/admin/finance` | redirect | → `/finance/*` (compat) |

---

## §8. Nhân sự & tiền lương (Module 7, Wave W4)

### 8.1 Capabilities

- **Employee records:** beyond `profiles` (HR-specific PII: ID, address, tax code, dependents, bank info)
- **Employment contracts:** create / sign / terminate state machine; per BLLĐ 2019 contract types
- **Shifts:** definition (start/end, days of week, branch); shift assignments per employee
- **Attendance records:** clock in/out with geofence + network gate evidence; reconciliation against shift assignments
- **Payroll periods:** monthly close cycle; calculate (gross + BHXH/BHYT/BHTN + PIT lũy tiến + net); approve gate
- **Payroll entries:** per (period, employee); audit trail; `post_payroll_journal` cross-cut Finance
- **Dependent management:** PIT giảm trừ gia cảnh per dependent (BHXH form data)
- **PIT export:** quyết toán năm format aligned with eTax / HTKK; per `docs/ref/payroll-pit.md`
- **BHXH export:** monthly export format aligned with iBHXH / VNPT-BHXH (per `docs/ref/third-party-integrations.md`)
- **Termination:** clear flow + evidence retention per labor law

### 8.2 Schema

| Object | Type | Notes |
|---|---|---|
| `employees` | table | Extended HR PII; FK `profiles` |
| `employment_contracts` | table | State machine; `signed_at`, `terminated_at` |
| `shifts` | table | Definition |
| `shift_assignments` | table | Per-employee assignment |
| `attendance_records` | table | Clock evidence |
| `payroll_periods` | table | Monthly cycle |
| `payroll_entries` | table | Per-employee per-period; gross/BHXH/PIT/net |
| `employee_dependents` | table | PIT giảm trừ |
| `payroll_calculate(p_period_id)` | RPC | Compute gross + BHXH + PIT + net |
| `payroll_approve(p_period_id)` | RPC | Permission-gated; freeze entries |
| `terminate_employee(p_employee_id, p_terminated_at, p_reason)` | RPC | State machine; evidence required |
| `post_payroll_journal(p_period_id)` | RPC | Cross-cut Finance |
| `pit_export(p_year)` | RPC / view | Year-end quyết toán format |
| `bhxh_export(p_period_id)` | RPC / view | Monthly BHXH format |

### 8.3 Permission keys

- **hr:** `hr:view_employee`, `hr:manage_employee`, `hr:contract_create`, `hr:contract_sign`, `hr:terminate`, `hr:dependent_manage`
- **finance (cross):** `finance:payroll_calculate`, `finance:payroll_approve`
- **reports:** `reports:pit_export`

### 8.4 Dependencies

- **Depends on:** Auth (W1), Admin (W2 — branch_attendance_config), Employee (W2 — clock data flows)
- **Depended-by:** Finance (W4 — payroll journal posting), Reporting (W6)
- **External:** iBHXH (TS24) format, eTax / HTKK format, BHXH portal

### 8.5 Sign-off blockers

- **B35 (module-specific)** — BHXH/BHYT/BHTN tỷ lệ seed: current 2026 rates (employee 10.5% + employer 21.5% per BLLĐ). Owner to confirm rate config approach (system_settings vs hardcoded).
- **B36 (module-specific)** — PIT lũy tiến brackets seed: 7-bracket progressive tax. Owner confirms format.
- **B37 (module-specific)** — Contract template per type (HĐLĐ xác định thời hạn, không xác định thời hạn, học việc, thử việc): per BLLĐ 2019. Owner confirms templates for green seed.
- **B38 (module-specific)** — Termination evidence retention: 5 years per labor law (or longer)? Owner confirms.

### 8.6 Wave assignment

W4 — same wave as Finance. Cross-module dependency: payroll_journal posts to Finance ledger.

### 8.7 Page contracts

| Route | Owner role | Notes |
|---|---|---|
| `/hr` | owner, super_manager | HR dashboard |
| `/hr/payroll[/[periodId]]` | hr roles | Payroll periods list + detail |
| `/admin/hr/payroll[/[periodId]]` | owner, super_manager | Admin-side payroll mirror |

---

## §9. Orders (Module 8, Wave W5)

### 9.1 Capabilities

- Cross-branch order list (filter by branch, status, date, cashier)
- Order detail view (snapshot pricing, items, modifiers, sides, status history)
- Order status state machine (`new → confirmed → preparing → ready → served → completed`; `cancelled` reachable except from completed)
- Refund flow: `create_refund` RPC + `approveRefund` action + `reverse_payment_and_post` (cross-cut Finance)
- Refund cap enforcement (cumulative ≤ payment amount)
- Refund approval gate (`orders:refund_approve` — H2a closed 1h stale-revoke window via `has_permission`)

### 9.2 Schema

| Object | Type | Notes |
|---|---|---|
| `orders` | table | Includes `pos_session_id` FK; snapshot pricing pattern |
| `order_items` | table | Snapshot fields: `item_name`, `variant_name`, `unit_price`, `modifiers`, `sides` JSONB |
| `order_status_history` | table | Append-only audit; INSERT-only RLS |
| `refunds` | table | Refund records; cumulative cap enforced |
| `create_order(...)` | RPC | Server-side price verification; routes to KDS via `route_order_to_kds` |
| `create_refund(...)` | RPC | Rejects non-`completed` payments; enforces cap |
| `reverse_payment_and_post(...)` | RPC | Cross-cut Finance — atomic |

### 9.3 Permission keys

- **orders:** `orders:read`, `orders:write`, `orders:void`, `orders:refund`, `orders:refund_approve`
- **POS (cross):** `pos:void_order`, `pos:apply_discount`

### 9.4 Dependencies

- **Depends on:** Auth (W1), Admin (W2), Inventory (W3 — stock consumption), Finance (W4 — refund GL reversal); but Orders runtime ships in W5 with all upstream live
- **Depended-by:** POS (W5 — order entry), KDS (W5 — kitchen routing), Reporting (W6)
- **External:** MoMo webhook (refund), VietQR

### 9.5 Sign-off blockers

- **B19** In-place freeze of `m4-payments-fix` — APPROVED; refund logic re-implements per `02-GREEN-BASELINE.md`
- **B39 (module-specific)** — Refund approval workflow: which roles can approve self-refund? Currently `orders:refund_approve` (manager+); cashier can request. Owner to confirm.
- **B40 (module-specific)** — Order cancellation policy: how long after `served` can a refund be initiated? Default proposal: 24h soft, manager override.
- **M4 P0 hangovers** (per archived `m4-payments-fix.md`):
  - MoMo webhook tenant binding — must re-implement; partnerCode + tenant verify
  - Server recompute total — must re-implement (anti-tamper)
  - Stock consumption fail-soft — re-implement check on `result.stock_consumed`

### 9.6 Wave assignment

W5 — alongside POS, KDS. Revenue parity confirmed = W5 exit gate.

### 9.7 Page contracts

| Route | Owner role | Notes |
|---|---|---|
| `/orders` | order roles | Cross-branch list |
| `/orders/[id]` | order roles | Detail + refund actions |

---

## §10. POS (Module 9, Wave W5)

### 10.1 Capabilities

- **Order entry:** browse menu, add items + variants + modifiers + sides, dine-in (table) vs takeaway, customer count
- **Table management:** zone/table grid, status (available, occupied, reserved, maintenance)
- **Session lifecycle:** open session (opening_cash) → operations → close session (closing_cash, expected_cash, cash_difference); partial unique 1 open per terminal
- **Cashbox:** opening/closing cash; reconciliation report
- **Payment:**
  - Cash → `confirm_cash_payment` RPC (atomic)
  - VietQR → polling-based (no push webhook)
  - MoMo → webhook idempotent via `webhook_events(provider, request_id)`; HMAC verify
  - Multi-method split — Post-v1.0
- **Daily limits:** `branch_menu_item_daily_limits` enforced server-side; cashier + chef + branch_manager can adjust per scope
- **Discount:** apply discount (perm-gated `pos:apply_discount`); server-recomputed total
- **Receipt printing:** `pos:print` after payment; reprint via `pos:reprint_receipt`
- **Send to kitchen:** `pos:send_kitchen` triggers `route_order_to_kds`
- **Void order:** `pos:void_order` (perm-gated)
- **Network gate:** `branch_trusted_egress_ips` validation (POS heartbeats via `/api/branch-presence`)
- **PWA / offline:** service worker precache; offline mode Post-v1.0

### 10.2 Schema

| Object | Type | Notes |
|---|---|---|
| `pos_terminals` | table | Per branch; UNIQUE name |
| `pos_sessions` | table | Cashier shift; partial unique 1 open per terminal |
| `branch_zones`, `tables` | table | Already in Admin schema; POS reads |
| `payments` | table | Provider-agnostic; `provider`, `provider_ref`, `stock_consumed_status` |
| `payment_webhooks` | table | Webhook event logs |
| `webhook_events` | table | Idempotency key (provider, request_id) |
| `branch_menu_item_daily_limits` | table | Per (branch, menu_item, day); has intentional auth_role fast-path RLS |
| `branch_trusted_egress_ips` | table | Already in Admin |
| `branch_presence` table | table | Heartbeat from terminals (TBD if `branch_trusted_egress_ips` is enough) |
| `confirm_cash_payment(...)` | RPC | Atomic; recompute_total guard |
| `complete_payment_and_consume_stock(...)` | RPC | Atomic — payment state + order state + stock consumption + finance event; M4 P0 fix path |
| `recompute_total(p_order_id)` | RPC | Server-side total — anti-tamper |
| `open_session(...)`, `close_session(...)` | RPC | Session lifecycle |

### 10.3 Permission keys

- **pos:** `pos:use`, `pos:void_order`, `pos:apply_discount`, `pos:open_cashbox`, `pos:close_shift`, `pos:close_shift_variance_override`, `pos:reprint_receipt`, `pos:send_kitchen`, `pos:print`, `pos:confirm_payment`

### 10.4 Dependencies

- **Depends on:** Auth (W1), Admin (W2 — branches, terminals config), Inventory (W3 — stock), Finance (W4 — revenue/refund/posting), Print (W5 — receipt)
- **Depended-by:** Orders (W5), KDS (W5), Reporting (W6)
- **External:** MoMo gateway, VietQR, printer agent

### 10.5 Sign-off blockers

- **B41 (module-specific)** — Daily limit RLS: keep `auth_role` fast-path or migrate to `has_permission`? Current decision: KEEP per `BMIDL-RLS-INTENTIONAL-ROLE-FASTPATH` regression rule.
- **B42 (module-specific)** — POS network gate: `branch_trusted_egress_ips` mandatory for cash payment, or warn-only? Default proposal: mandatory for cash close-shift, warn for order entry.
- **B43 (module-specific)** — VietQR partner bank seed (Vietcombank / VPBank / MB): owner picks; merchant ID required.
- **B44 (module-specific)** — Variance threshold for `pos:close_shift_variance_override`: amount + permission gate. Owner confirms.
- **M4 P0 hangovers** (cross-cut Orders §9.5):
  - Webhook tenant binding hole
  - Server-recompute total
  - Stock consumption fail-soft check
  - Webhook idempotency apply (DRAFTED, awaits owner apply)
  - POS calls provider before DB lock (DEFER-WITH-MITIGATION per m4 plan)

### 10.6 Wave assignment

W5 — alongside Orders, KDS, Print. POS first viewport must remain task-dominant (per `01-BRAND-SOFTWARE-PROGRAM.md` UX principle 5).

### 10.7 Page contracts

| Route | Owner role | Notes |
|---|---|---|
| `/br/[branchId]/pos` | cashier, waiter, branch_manager | POS terminal UI |
| `/br/[branchId]/menu-limits` | settings roles + cashier + chef | Daily sales limit config |
| `/br/[branchId]/settings/{pos,pos-sessions,printers,tables,kds}` | settings roles | Branch-scoped config |
| `/api/webhooks/momo` | public + HMAC | MoMo webhook handler |
| `/payment/momo/return` | public | MoMo redirect after gateway flow |

---

## §11. KDS (Module 10, Wave W5)

### 11.1 Capabilities

- **Realtime kitchen queue:** Supabase realtime subscription on `kds_tickets`; bump/recall propagate live
- **Station management:** stations per branch (UNIQUE name + position); station-category mapping
- **Ticket routing:** `route_order_to_kds` RPC — by category mapping; fallback station for uncategorized
- **Bump flow:** `bump_kds_ticket` advances `pending → preparing → ready`
- **Recall flow:** `recall_kds_ticket` reverts `ready → preparing → pending`; clears `bumped_at`/`bumped_by`
- **Order ready auto:** when all tickets reach `ready`, `check_order_ready` auto-transitions parent order to `ready`
- **Station category save:** `save_station_categories` atomic replace (delete old + insert new)
- **Branch scope:** chef sees only own branch tickets

### 11.2 Schema

| Object | Type | Notes |
|---|---|---|
| `kds_stations` | table | Per branch; UNIQUE `(name, branch_id, tenant_id)` |
| `kds_station_categories` | table | M:N station-category mapping |
| `kds_tickets` | table | One per (order_item, station); realtime-published |
| `route_order_to_kds(p_order_id)` | RPC | Routes by category mapping; fallback support |
| `bump_kds_ticket(p_ticket_id)` | RPC | State machine advance; auto-checks order readiness |
| `recall_kds_ticket(p_ticket_id)` | RPC | State machine revert |
| `check_order_ready(p_order_id)` | RPC | Internal; called from bump |
| `save_station_categories(p_station_id, p_ids[])` | RPC | Atomic replace |

### 11.3 Permission keys

- **kds:** `kds:use`, `kds:mark_ready`, `kds:recall`

### 11.4 Dependencies

- **Depends on:** Auth (W1), Admin (W2 — branches, KDS station config), Orders (W5 — order routing), Inventory (W3 — recipe-driven categorization)
- **Depended-by:** POS (W5 — sends to kitchen), Reporting (W6 — kitchen throughput)
- **External:** Supabase realtime (publication on `kds_tickets`)

### 11.5 Sign-off blockers

- **B45 (module-specific)** — Realtime room scope: per-branch publication or tenant-wide with branch filter? Recommendation: tenant-wide pub + client-side branch filter (simpler).
- **B46 (module-specific)** — KDS audio alert (chuông bếp): include in green pilot or Post-v1.0? Per `competitive-analysis.md` §2.2, gap vs MISA CukCuk. Recommendation: Post-v1.0.
- **B47 (module-specific)** — Cooking time tracking (per ticket prep duration): in green or Post-v1.0? Per `competitive-analysis.md` gap. Recommendation: instrument now, dashboard Post-v1.0.

### 11.6 Wave assignment

W5 — alongside POS, Orders, Print. Queue clarity above all (per brand rule).

### 11.7 Page contracts

| Route | Owner role | Notes |
|---|---|---|
| `/br/[branchId]/kds` | chef, branch_manager | KDS board with station tabs + realtime |
| `/br/[branchId]/settings/kds` | settings roles | KDS station config |

---

## §12. Print (Module 11, Wave W5)

### 12.1 Capabilities

- **Print job queue:** `print_jobs` table — claim / complete / expire RPCs for separate print agent process
- **Printer fleet config:** `printer_configs` per branch (network printer IPs, kitchen vs cashier printers, kitchen-station mapping)
- **Receipt template:** brand header + bill template per `01-BRAND-SOFTWARE-PROGRAM.md` brand rules
- **HĐĐT print:** PDF print of issued tax invoices (cross-cut Finance)
- **KDS print:** kitchen ticket print (optional alternative to KDS screen — pilot uses screen-first)
- **Reprint:** `pos:reprint_receipt` — perm-gated reissue
- **Job lifecycle:** queued → claimed (by agent) → completed | expired
- **Agent process:** out-of-band Node.js process polling `claim_print_job` RPC; not part of Next.js runtime

### 12.2 Schema

| Object | Type | Notes |
|---|---|---|
| `print_jobs` | table | `(id, tenant_id, branch_id, printer_id, payload, status, claimed_at, completed_at, expires_at)` |
| `printer_configs` | table | Per branch; `(name, ip, kind: cashier\|kitchen, kitchen_station_id?)` |
| `claim_print_job(...)` | RPC | Agent polls; atomic claim |
| `complete_print_job(...)` | RPC | Agent reports success |
| `expire_print_job(...)` | RPC | Cron-scheduled cleanup |
| `enqueue_print_job(...)` | RPC | Called from POS/Finance after payment/HĐĐT issue |

### 12.3 Permission keys

- **printer:** `printer:manage`
- **pos (cross):** `pos:print`, `pos:reprint_receipt`

### 12.4 Dependencies

- **Depends on:** Auth (W1), Admin (W2 — printer config), POS (W5 — initiates jobs), Finance (W4 — HĐĐT prints)
- **Depended-by:** Notifications (W6 — print failure surfacing)
- **External:** Print agent (separate runtime, deployable per branch); Storage (PDF templates if templated rendering)

### 12.5 Sign-off blockers

- **B48 (module-specific)** — Print agent process model: per-branch Raspberry Pi vs Cloudflare Tunnel + cloud agent vs Windows service? Owner confirms deployment topology.
- **B49 (module-specific)** — Printer model + ESC/POS profile per branch (Epson TM-T82 / Star vs other). Owner provides hardware inventory.
- **B50 (module-specific)** — Failure surfacing: print job stuck → notification (cross-cut §13). Default proposal: `expires_at = claimed_at + 5min`; expired triggers notification.

### 12.6 Wave assignment

W5 — receipt printing must be live for POS cutover. Real printer smoke test (per `04-CUTOVER-QA-RUNBOOK.md` Device Matrix).

### 12.7 Page contracts

| Route | Owner role | Notes |
|---|---|---|
| `/admin/settings/printers[/jobs]` | settings roles | Printer fleet + queue inspection |
| `/br/[branchId]/settings/printers` | settings roles | Branch-scoped printer config |

---

## §13. Notifications + Reporting (Module 12, Wave W6)

### 13.1 Capabilities

**Notifications:**
- In-app notification inbox `/notifications` (all staff)
- Dispatch from system events: HR (payroll approve, contract sign), Finance (period close), Inventory (waste approve, GRN hardblock override), POS (refund approved), Print (job stuck)
- External providers — Post-v1.0: Zalo ZNS (primary, 300 VND/tin), SpeedSMS (fallback), Resend.com (transactional email for HĐĐT PDF)
- Notification preferences per user (Post-v1.0)
- Branch feature flags (currently sparse use; consider DROP per audit)

**Reporting:**
- Dashboard rollups: revenue, KPIs, alerts
- Revenue reports: by day/branch/cashier/hour with drilldown
- Inventory valuation reports
- Stock movement reports
- Food cost analysis (cross-cut Finance §7 — Reporting renders, Finance owns logic)
- VAS reporting (đầu ra + đầu vào khấu trừ)
- PIT export (cross-cut HR §8)
- Materialized views — `mv_daily_revenue`, `mv_top_items`, `mv_food_cost` per archived `database-schema.md`; per `02-GREEN-BASELINE.md` "do not port" rule, these are REBUILD_FROM_SOURCE — recompute on cutover, not migrate

### 13.2 Schema

| Object | Type | Notes |
|---|---|---|
| `notifications` | table | `(id, user_id, kind, payload, read_at, created_at)` |
| `branch_feature_flags` | table | DEFER_DECISION per audit |
| `mv_daily_revenue` | MV | REBUILD_FROM_SOURCE; refresh schedule TBD |
| `mv_top_items` | MV | Same |
| `mv_food_cost` | MV | Same; depends on Inventory + Finance |

### 13.3 Permission keys

- **reports:** `reports:view_branch`, `reports:view_tenant`, `reports:export`, `reports:pit_export` (cross-cut HR)
- Notifications: route ACL accepts ALL `STAFF_ROLES`; row-level via RLS self-scope

### 13.4 Dependencies

- **Depends on:** ALL prior waves (W1–W5)
- **Depended-by:** none (terminal module)
- **External:** Zalo ZNS (Post-v1.0), SpeedSMS, Resend, Viettel S-invoice for tax exports

### 13.5 Sign-off blockers

- **B51 (module-specific)** — Notification dispatch policy per event class: in-app only for green pilot, defer Zalo/SMS to Post-v1.0? Recommendation: in-app only for green; provider integration Post-v1.0.
- **B52 (module-specific)** — MV refresh schedule: nightly cron, or on-demand from dashboard? Recommendation: nightly + dashboard show "as of X" timestamp.
- **B53 (module-specific)** — `branch_feature_flags` DEFER_DECISION: KEEP, ARCHIVE, or DROP per audit. Currently sparse use.

### 13.6 Wave assignment

W6 — final wave + brand pass. Smoke suite green = W6 exit gate (per `PROGRAM-READINESS.md` §7).

### 13.7 Page contracts

| Route | Owner role | Notes |
|---|---|---|
| `/notifications` | all staff | Inbox |
| `/admin/dashboard` | owner, super_manager | ERP cockpit (cross-cut Admin §3 — content owned by Reporting) |
| `/admin/reports/revenue` | reports roles | Revenue reports |
| `/admin/reports/inventory-value` | reports roles | Valuation |
| `/admin/reports/stock-movement` | reports roles | Stock movement |

---

## §14. Cross-Cutting Concerns

These are infrastructure surfaces consumed by multiple modules. Not standalone modules but must be designed coherently.

### 14.1 Audit Logs

- Single `audit_logs` table, indexed `(tenant_id, entity, entity_id, created_at)`
- Append-only (no UPDATE/DELETE GRANT)
- Producers: Finance (period close, journal post), HR (contract sign, terminate), Inventory (waste approve, GRN hardblock override, stocktake complete), Auth (grant/revoke via `permission_audit_log` separately), Orders (refund), POS (cash variance override)
- Consumer: `/finance/audit-trail`, `/admin/staff/audit`, owner investigation flows
- Retention: 12 months per blue retention policy (B6)

### 14.2 Realtime

- Currently: KDS (`kds_tickets` publication)
- Potential: Notifications inbox (per-user push), POS terminal status (heartbeat), Inventory stock alerts (sparse)
- Pattern: Supabase realtime publication; client-side filter by branch/user
- Failure mode: realtime down → fall back to polling (POS heartbeat 30s)

### 14.3 Storage / Evidence

- Buckets: `waste-photos` (Inventory), `supplier-return-evidence` (Inventory), `hdt-pdf` (Finance HĐĐT), `audit-attachments` (cross-cut), `payslip-pdf` (HR — Post-v1.0)
- Manifest + checksum per `04-CUTOVER-QA-RUNBOOK.md` Pre-Rehearsal step
- Per B6: storage retention 12 months read-only post-cutover

### 14.4 Print Agent

- Out-of-band Node.js process; consumes `print_jobs` queue via `claim_print_job` RPC
- Per-branch deployment (Raspberry Pi or Windows service per B48)
- Cross-cuts POS (receipt), Finance (HĐĐT PDF), KDS (kitchen ticket — optional)

### 14.5 Brand / Design Tokens (W0 Foundation)

- Locked per `01-BRAND-SOFTWARE-PROGRAM.md` (Ma Tu Concept 01)
- Tokens, typography (Inter / Montserrat / JetBrains Mono), logo, icons, spacing
- App shells: AdminShell, InventoryShell, EmployeeShell, FinanceShell, HRShell, POSShell, KDSShell
- Constraint: NO per-route theme files; NO parallel theme layer (per CLAUDE.md UI rule)
- Primitives: shadcn preset `b6G3vbGue` / `radix-lyra` (per `docs/spec/design-system.md`)

### 14.6 Webhook + External API Gateway

- Inbound webhooks: MoMo (`/api/webhooks/momo`); HMAC-validated
- Idempotency: `webhook_events(provider, request_id) UNIQUE`
- Outbound: Viettel S-invoice REST, VietQR API polling, MISA legacy explicit option / VNPT future option (Finance §7)
- Resend.com (Post-v1.0), Zalo ZNS (Post-v1.0), SpeedSMS (Post-v1.0)

---

## §15. Out-of-Scope (Post-v1.0 / DROP / DEFER)

Per `02-GREEN-BASELINE.md` "Do Not Port" + `competitive-analysis.md` Post-v1.0 list + audit hygiene.

| Item | Class | Rationale |
|---|---|---|
| CRM (loyalty, voucher, tier, marketing automation) | Post-v1.0 | `module-acl.ts` keeps placeholder; no daily-use surface in green |
| Feedback module (`feedback:*` permissions, `/admin/feedback`) | DEFER_DECISION (B24) | In `module-acl.ts` but not in master §4. Owner to confirm KEEP/MIGRATE or DROP_ACCEPTED |
| `inventory_admin` module (`/admin/inventory/{cold-chain,express-windows,feature-flags,trust}`) | RETIRED | `allowedRoles: []` — pages exist but unreachable. Drop in green per `02-GREEN-BASELINE.md` "do not port" rule |
| Loyalty / hạng thành viên / voucher | Post-v1.0 | Per `competitive-analysis.md` §2.6 |
| Marketing automation campaign | Post-v1.0 | Per `competitive-analysis.md` §2.6 |
| QR self-order | Post-v1.0 | Per `competitive-analysis.md` §2.1 |
| Offline mode (PWA + IndexedDB) | Post-v1.0 | Per `competitive-analysis.md` §5 + bePOS comparison |
| GrabFood / ShopeeFood / Baemin integration | Post-v1.0 | Per `competitive-analysis.md` §2.1 |
| Audio alert KDS | Post-v1.0 (B46) | Per `competitive-analysis.md` §2.2 gap |
| Cooking time tracking dashboard | Post-v1.0 (B47) | Instrument now, dashboard later |
| Visa/Mastercard via VNPay | Post-v1.0 | Per `competitive-analysis.md` §2.3 + `third-party-integrations.md` §1.4 |
| ZaloPay e-wallet #2 | Post-v1.0 | Per `third-party-integrations.md` §1.3 |
| Native mobile app (Flutter) | Dropped 2026-05-06 | Fork strategy abandoned; PWA-only |
| Multi-method split payment | Post-v1.0 | Per `competitive-analysis.md` §2.3 |
| Tách / gộp bill | Post-v1.0 | Per `competitive-analysis.md` §2.1 |
| Loyalty tier / chiến dịch / phân tích hành vi khách hàng | Post-v1.0 | Per `competitive-analysis.md` §2.6 |

**DROP candidates from blue (per audit):**

- V1 Inventory permission keys (per archived inventory plan — superseded by greenfield)
- Retired waste-tier-2 trust-score history → ARCHIVE_ONLY
- Old hardblock override evidence → ARCHIVE_ONLY (audit value)
- Retired trust-score engine → DROP_ACCEPTED (after sign-off)
- Stale feature flag rows → DEFER_DECISION (B53)
- Derived MVs → REBUILD_FROM_SOURCE (per §14)

---

## §16. Cross-References

- **Master:** `PROGRAM-READINESS.md` §4 (module index), §6 (sign-off table), §9 (Go/No-Go gate)
- **Strategy:** `00-DEBATE-SYNTHESIS.md`, `01-BRAND-SOFTWARE-PROGRAM.md`, `02-GREEN-BASELINE.md`, `03-DATA-MIGRATION-POLICY.md`, `04-CUTOVER-QA-RUNBOOK.md`
- **Wave plan:** `06-WAVE-PLAN.md` (W0–W6 detailed; references this catalog per-wave)
- **ADRs:** `adr/0001-auth-migration.md`, `adr/0002-database-provider.md`, `adr/0003-cutover-rollback.md`, `adr/0004-position-code-normalization.md`, `adr/0005-tenants-owner-user-id.md` (deferred)
- **Existing canonical surfaces:** `docs/modules/{auth,database,web-app,ui,security,infrastructure}.md`
- **Permission catalog:** `packages/shared/src/auth/permissions.ts` (94 keys); route ACL: `packages/shared/src/auth/module-acl.ts`
- **Schema reference:** `docs/modules/database.md` (canonical); `docs/spec/database-schema.md` (FROZEN at early-2026)
- **Business reference:** `docs/ref/{business-context,inventory,einvoice-tax,payroll-pit,labor-contracts,competitive-analysis,third-party-integrations,glossary}.md`
- **Decisions:** `decisions.md`
- **Operational:** `tasks/{regressions,lessons,todo}.md`

---

## §17. Sign-off Block (Module Catalog)

This catalog feeds the consolidated owner sign-off table at `PROGRAM-READINESS.md §6`. New blockers introduced here are B22–B53.

| Role | Decision (catalog draft + B22–B53) | Date |
|---|---|---|
| Owner | ☐ approve / ☐ revise | _____________ |
| Lead Dev | ☐ feasible / ☐ revise | _____________ |
| Architect | ☐ baseline alignment / ☐ revise | _____________ |
| QA Lead | ☐ verifiable / ☐ revise | _____________ |
| Ops | ☐ provisionable / ☐ revise | _____________ |

---

**End of module catalog.** Update when: (a) module scope changes, (b) sign-off blocker resolved/added, (c) wave reassignment, (d) page contract added/retired, (e) per-module ADR landed.

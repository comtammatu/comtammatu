# Inventory Operations Expansion & Shift Cockpit Blueprint

> **Architecture, Data Contracts, and Operational Blueprint (Revision 4.0)**  
> Technical plan for standardizing the Inventory Control Surface (`/inventory/*`), Branch Stock Surface (`/br/[branchId]/stock/*`), Control Home coordination plane (`/`), and multi-site inventory pipeline across the multi-branch chain "Cơm Tấm Má Tư" (CTCP Chén Sứ). In strict adherence to ADR 0012, ADR 0025, ADR 0026, ADR 0028, ADR 0037, ADR 0040, ADR 0044, ADR 0045, and ADR 0048.

---

## Architecture Status Matrix

This matrix describes the planning baseline, not proof of deployment. Reconcile
each entry with current migrations and runtime contracts before its phase starts.
The first Phase 0 slice lives in
`apps/web/lib/inventory/replenishment-contract.ts`, with executable examples in
`apps/web/tests/inventory-replenishment-contract.test.ts`. It defines threshold
resolution and demand projection only; no production loader or mutation uses it
yet. The private SQL resolver is prepared in
`supabase/migrations/20260908074549_effective_stock_threshold_resolver.sql`.
Its shared SQL/TypeScript examples live in
`supabase/tests/fixtures/effective_stock_threshold_cases.sql`. On 2026-09-08,
`supabase/tests/effective_stock_threshold_resolver_test.sql` passed on an
owner-approved ephemeral Preview: 30 shared cases, 18 native nonfinite inputs,
trailing-zero acceptance, function attributes, PUBLIC ACL, and actual denied
calls by anon/authenticated/service_role. The identical harness first failed
with SQLSTATE 42883 before the helper existed, then returned
`threshold_sql_assertions_passed` after the migration. Only the known psql
setting/include were adapted for MCP; the fixture, transaction, and assertions
were preserved. The large-quantity case `999999999999.0021` also reproduces the
TypeScript precision boundary: milliunit round-trip validation rejects the
fourth decimal without silently rounding demand.
The helper has no direct application-role grants, reads no operational data, and
does not change existing callers. Database views, authorized RPC enforcement,
and their integration proofs remain open; the migration is not applied to
Production and no runtime loader uses the helper.

The rehearsal used an ephemeral, schema-only Preview `dckhofghteosdutcewdo`, parent
`enloyfnuerqgaqderbwb`, from 06:30:24 to 06:45:01 UTC. Its initial 46 migrations
matched the active baseline and forwards exactly; the complete guarded dry-run
listed only `20260908074549_effective_stock_threshold_resolver.sql`, with no
seeds or roles. The explicit MCP rehearsal recorded that file's SQL under the
Preview-only version `20260908063754`; this is not the Production migration
ledger. Supabase confirmed branch deletion, and fresh validated parent-snapshot
probes verified both branch ID `db2fe9f3-e00f-4816-be3f-9cb0565b7959` and project
ref absent. The temporary fee-confirmation exception was removed immediately
after token issuance; no standing confirmation authority remains. Production
catalog inspection still found zero copies of the new resolver, so the
repository type source and generated types remain unchanged.

Preview security advisors reported 357 notices on existing objects (one RLS
information notice, two materialized-view warnings, 25 anon and 329 authenticated
DEFINER execution warnings), with none naming the new resolver. These notices
require interpretation against the existing RPC authorization contracts; this
rehearsal is not a clean-schema security certification. Guidance:
[Supabase database linter](https://supabase.com/docs/guides/database/database-linter).

The pure split and production-output planners live in
`apps/web/lib/inventory/fulfillment-contract.ts`, with executable cases in
`apps/web/tests/inventory-fulfillment-contract.test.ts`. They define reservation
coverage, batch commitments, exact milliunit apportionment, and surplus handling.
No runtime loader or mutation consumes these planners yet; they neither reserve
stock nor create transfers, batches, or allocations.
Verification of this contract slice passed 55 targeted tests, including 3,888
small-grid conservation/permutation cases. After the SQL rehearsal and cleanup,
`corepack pnpm verify` exited 0 on the isolated checkout at `d1638a825` plus the
cockpit, threshold, fulfillment, and Preview guard changes. All 542 guard
fixtures ran fresh, including exact cost scope, dry-run flags, ambiguous/default
deletion IDs, and failed-lookup versus validated-absence diagnostics. Independent
T3 review passed after the deletion name/ID collision was reproduced RED and
fixed. Web/shared tests ran fresh: 3,058 and 391 passed, with 10 existing web
skips. The 35 print tests and unchanged package typecheck/lint/build tasks reused
caches; operational-tool checks passed. Final guard/rule/runbook sources matched
the verification checkout. This evidence excludes unrelated shared-workspace
edits; runtime adoption and Production deployment remain pending.

### Current implementation boundary

- Navigation has the three role-filtered groups and URL branch scope. Categories,
  units, thresholds, and waste settings exist; readiness remains an ingredient-list
  filter rather than a dedicated settings route.
- Ingredient images have the released schema, UI, and cleanup lifecycle described
  in section 8.4.
- `/inventory` publishes only permission-checked receipt, missing-price, transfer,
  and waste-approval counts. An exact zero stays zero; failed, missing, or truncated
  reads are unavailable, and denied rows are omitted. Recovery reloads the current
  URL. It does not publish sample stock, batches, shipments, POS deductions, or
  realtime health claims. Replenishment and daily production summaries remain
  unavailable with links to their existing workspaces.
- `production_daily_batches`, `stock_demand_allocations`, allocation locking,
  payload-hash replay protection, and pro-rata mutation remain unimplemented.
  Existing individual production runs are not the proposed daily container.
- Store PO/GRN remains blocked by the central-site contract. Direct store receipt,
  its cost-free projection, and integration proof are still required before Phase 6.
- Control Home has Mine, Coordinate, and a Work pulse. The full module pulses and
  independent regional unavailable/retry states in section 4 remain open.

The cockpit regression suite is `apps/web/tests/inventory-cockpit-data-truth.test.ts`.
This implementation boundary is not a deployment claim. Sections below retain the
target workflow; they do not imply that the full blueprint is running.

Every entity and RPC is explicitly classified:
- `[EXISTS]`: Already present in the active schema or codebase.
- `[PROPOSED]`: New architectural entity or table introduced in this plan.
- `[REVISE]`: Existing entity or function requiring contract relaxation or enhancement.

| Subsystem | Architectural Entity | Current State | Target State | Alignment Notes |
| :--- | :--- | :---: | :---: | :--- |
| **Data Schema** | `public.ingredients` | `[EXISTS]` | `[REVISE]` | Add nullable `image_url text` column for WebP images. |
| | `public.inventory_locations` | `[EXISTS]` | `[EXISTS]` | Existing `location_kind IN ('warehouse', 'kitchen'...)`. |
| | `public.branch_ingredient_thresholds` | `[EXISTS]` | `[REVISE]` | Existing `min_stock_level`, `target_stock_level`. Standardize fallback resolution. |
| | `public.production_daily_batches` | `[PROPOSED]` | `[DESIGNED]` | Daily container tracking parent batch metadata across child runs. |
| | `public.stock_demand_allocations` | `[PROPOSED]` | `[DESIGNED]` | Closed-loop lifecycle tracking table preventing double-batching. |
| | `public.idempotency_keys` | `[PROPOSED]` | `[DESIGNED]` | Replay protection with request `payload_hash` verification. |
| **RPC & Triggers** | `save_ingredient_catalog` | `[EXISTS]` | `[REVISE]` | Add `p_image_url` & `p_image_url_set` for atomic image persistence. |
| | `create_purchase_order` | `[EXISTS]` | `[REVISE]` | Allow `p_branch_id` for branch-level local purchase orders. |
| | `enforce_grn_central_site_only` | `[EXISTS]` | `[REVISE]` | Trigger relaxed for valid branch purchase orders (`po.branch_id = grn.branch_id`). |
| | `confirm_goods_receipt_note` | `[EXISTS]` | `[EXISTS]` | Preserve invariant: positive `unit_cost > 0` and branch matching. |
| | `stock_issue_items_compute_waste_tier`| `[EXISTS]`| `[EXISTS]` | Retain dynamic settings lookup; Tier 0 auto-clear; Tier 2 4-eyes approval. |
| **UI & Navigation**| Sidebar Navigation (`inventory-nav.ts`)| `[EXISTS]`| `[REVISE]` | Synchronize into 3 groups: Operations · Documents · Master Data & Settings. |
| | L0 Cockpit (`/inventory`) | `[EXISTS]` | `[REVISE]` | Unified operational shift layout without mutually exclusive tabs. |
| | Control Home (`/`) | `[EXISTS]` | `[REVISE]` | Complete 3-region implementation: Mine · Coordinate · Modules (ADR 0037). |
| | Branch Surface (`/br/[branchId]/stock/*`)| `[EXISTS]`| `[REVISE]` | Open direct branch GRN, blind shift counting, count slips, and ingredient photos. |

---

## 1. Unified Operational Shift Cockpit (`/inventory`)

### 1.1. Core Operational Value Chain
F&B inventory operations follow a single continuous daily reactive loop:
$$\text{Deficit Detection} \longrightarrow \text{Replenishment} \longrightarrow \text{Production} \longrightarrow \text{Pending Dispatch} \longrightarrow \text{In Transit} \longrightarrow \text{Store Receiving} \longrightarrow \text{POS Consumption / Exceptions}$$

> [!IMPORTANT]
> **Layout Invariant (Class A Cockpit):**  
> On desktop viewports, the inventory controller **must view the entire operational shift on a single unified canvas**. The core pipeline components (Chain Deficit Radar, Today's Production Batch, and Fulfillment Queue) must never be hidden behind mutually exclusive tabs.

### 1.2. Desktop Cockpit Blueprint (`/inventory`)

```text
┌───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ SIDEBAR      INVENTORY CONTROL · SHIFT COMMAND COCKPIT       [Scope: All Branches v] [Date: Today v] [Refresh: 30s]   │
│              ───────────────────────────────────────────────────────────────────────────────────────────────────────  │
│              [KPI PULSE STRIP: REALTIME SHIFT HEALTH]                                                                 │
│              🔴 4 Branches Deficit  │ 🍲 1 Daily Batch (3/6 Done)  │ 🚚 3 Transfers (1 Ready / 2 Transit) │ ⚠️ 2 Excp │
│              ───────────────────────────────────────────────────────┬───────────────────────────────────────────────  │
│              [CHAIN DEFICIT RADAR & REPLENISHMENT MATRIX (60% W)]   │ [CENTRAL KITCHEN: DAILY BATCH CONTAINER (40%)] │
│              • Filter: Below Min / Sched Deficit / All Ingredients  │ • Daily Batch #BATCH-0609-01 (Morning Shift):  │
│              ┌────────────────────────────────────────────────────┐ │ ┌─────────────────────────────────────────────┐ │
│              │ PHOTO / ITEM & SKU       SOURCE   AVAIL ALLOC DEF  │ │ │ Item         Target  Actual  Status           │ │
│              │ ────────────────────────────────────────────────── │ │ │ ───────────────────────────────────────────   │ │
│              │ 🖼️ "Chả trứng hấp"       Kitchen  45     30    15  │ │ │ "Chả trứng"  45 pcs  45 pcs  🟢 Completed    │ │
│              │    Source: Kitchen [⚡ Replenish -> Create Transfer]│ │ │ "Xíu mại"    105 pcs --      🟡 In Cooking... │ │
│              │ ────────────────────────────────────────────────── │ │ │ "Sườn ướp"   80 kg   --      ⚪ Scheduled     │ │
│              │ 🖼️ "Xíu mại sốt cà"      Kitchen  0      0     105 │ │ └─────────────────────────────────────────────┘ │
│              │    Source: Kitchen [⚡ Replenish -> Add to Batch]  │ │ [Add Item to Batch]       [Complete Batch Line] │
│              │ ────────────────────────────────────────────────── │ ├───────────────────────────────────────────────┤
│              │ 🖼️ "Gạo ST25 (Bao 50kg)" Supply   1,500  165   165 │ │ [FULFILLMENT & DISPATCH QUEUE (40% BOTTOM)]   │
│              │    Source: Supply [⚡ Replenish -> Stock Transfer] │ │ • Transfer DC-0609-002: Kitchen -> Q.1 (Transit)│
│              │ ────────────────────────────────────────────────── │ │ • Transfer DC-0609-003: Supply -> LVS (Loading) │
│              │ 🖼️ "Đá bi 20kg (Bao)"    Vendor   0      --    8   │ │ • Request DC-0609-004: TB Branch (Pending Appr)│
│              │    Source: Local Vendor [⚡ Direct Store GRN]      │ │ ───────────────────────────────────────────── │
│              └────────────────────────────────────────────────────┘ │ [Create Dispatch Trip]     [View All Queue (5)] │
│              ───────────────────────────────────────────────────────┴───────────────────────────────────────────────  │
│              [REALTIME POS CONSUMPTION & EXCEPTION AUDIT (FULL WIDTH BOTTOM)]                                         │
│              • POS Sales Posting (KDS Delta Stream): 1,240 meals sold | Deducted: 85kg Pork Chop, 42kg ST25 Rice      │
│              • Operational Exceptions: ⚠️ 1 Tier-2 Waste Slip (Burnt Ribs 2.1M VND) at PN Branch awaiting 4-eye appr  │
│                                        ⚠️ 1 Transfer Variance DC-0609-001 (2 "Chả trứng" lost in transit) logged      │
└───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 1.3. Mobile Responsive Adaptations
On mobile screens (`< 1024px`), the canvas stacks into a vertical workflow order without feature reduction:
1. **Horizontal Pulse Strip:** Scrollable KPIs summarizing pipeline stages.
2. **Deficit Cards:** Interactive cards displaying item name, photo, net deficit, and an action sheet trigger for replenishment.
3. **Daily Batch Summary:** Collapsible progress card for kitchen completion.
4. **Dispatch Queue:** High-priority cards for loading and in-transit trucks.
5. **Exceptions:** Floating alert cards for pending approvals.

> [!NOTE]
> `/inventory/stock` remains the **Complete Master Matrix** for searching, filtering, and auditing every SKU across all warehouse and kitchen locations. The `/inventory` Cockpit is the **Action-Focused Shift Command Plane** strictly dedicated to active daily operations.

---

## 2. Catalog Workspace & Settings Architecture (`/inventory/settings/*`)

### 2.1. Separation of Storage Scope vs. Fulfillment Source
A core architectural invariant is the decoupling of where items reside from where replenishment originates:
1. **Storage Scope (`storage_scope`) — Where can the item physically reside?**:
   - Explicit pairing of site (`tenant_id`, `branch_id`) and location (`inventory_locations.id` with `location_kind IN ('warehouse', 'kitchen')`).
   - Example: Marinated pork chops (`Cốt sườn ướp`) can only reside in the Central Kitchen and Store Kitchen locations; they are forbidden in ambient warehouse shelves.
2. **Fulfillment Source (`fulfillment_source`) — Where is replenishment sourced from?**:
   - **Primary Source (`primary_fulfill_source`)**:
     - `central_supply`: Supply warehouse transfers (rice, sugar, dry spices, packaging).
     - `central_kitchen`: Central production runs (egg meatloaf, meatballs, marinated meat).
     - `local_supplier`: Direct vendor delivery to store (ice cubes, fresh herbs, cooking gas).
   - **Fallback Source (`fallback_fulfill_source`)**: Backup fulfillment routing when the primary source is exhausted or down.

### 2.2. Master Data Configuration Matrix

| Entity | Functional Specification | Schema Implementation | Operational Rules & Guards |
| :--- | :--- | :--- | :--- |
| **Ingredients** | SKU, Name, WebP Photo, Type (`item_kind`), Category, Base Unit, Conversion Ladder, Status. | `public.ingredients`<br>`public.ingredient_units` | • `item_kind`: `raw_material` or `finished_good`.<br>• Saved atomically via RPC `save_ingredient_catalog` (ADR 0045). |
| **Suppliers** | Vendor Name, Tax ID, Supplied Items, Purchasing Unit, Assigned Delivery Branches, Status. | `public.suppliers`<br>`public.supplier_items` | • `is_preferred`: At most 1 preferred vendor per ingredient.<br>• Separates central bulk vendors from local store vendors. |
| **Units of Measure** | Shared Unit Registry; Item-specific unit conversion ladders. | `public.units`<br>`public.ingredient_units` | • Registry: standard mass/volume units.<br>• Ladder: Cycle check (`wouldCreateUnitCycle`), max 20 units per SKU. |
| **Categories** | Operational Groups (Meats, Veggies, Spices, Packaging, Semi-Finished), Sort Order, Tone. | `public.ingredient_categories` | • Maps counting frequency (daily fresh vs weekly dry goods). |
| **Fulfillment** | Central Supply, Central Kitchen, Local Vendor. | `default_fulfill_site_kind`<br>and fulfill flags on `ingredients` | • Governs Radar 1-tap action: Transfer vs Batch vs Direct GRN. |
| **Storage Scope** | Permitted site kinds and locations (`warehouse` vs `kitchen`). | `public.inventory_locations`<br>`public.stock_levels` | • Enforces physical hygiene and cross-contamination rules. |
| **Thresholds** | Minimum Stock (Min), Target Stock (Target), Physical Capacity (Capacity). | `ingredients` (L0 default)<br>`branch_ingredient_thresholds` (L1 override) | • Disambiguates Min, Target, Capacity.<br>• `NULL` indicates inheritance; `0` indicates zero threshold.<br>• Branch Managers modify only L1. |
| **Waste Tiering** | Tier Toggles, Photo Requirements, 4-Eyes Approval, Shift Caps, Ratio Alerts. | `system_settings`<br>`branch_settings` | • Read dynamically by trigger `stock_issue_items_compute_waste_tier()`.<br>• Tier 0 auto-clears; Tier 2 enforces `created_by != approver`. |
| **Readiness** | Catalog Readiness: Multi-point verification before activating an ingredient. | Engine: `resolveCatalogReadiness` | • Audits 6 criteria: Active vendor, Source, Unit ladder, BOM, Cost, Thresholds. |

### 2.3. Effective Thresholds Engine
The system resolves effective operational thresholds deterministically, treating `NULL` as unset and `0` as zero:
- **Minimum Stock Level:** The reorder and red-alert trigger point on the Radar.
  $$\text{Effective Min} = \text{COALESCE}(\text{branch\_threshold.min\_stock\_level}, \text{ingredient.min\_stock\_level}, 0)$$
- **Target Stock Level:** The optimal target level to replenish up to for daily operations.
  $$\text{Effective Target} = \text{COALESCE}(\text{branch\_threshold.target\_stock\_level}, \text{ingredient.target\_stock\_level}, \text{Effective Min} \times 2)$$
- **Physical Capacity Limit:** Maximum holding volume of physical refrigerators or storage racks.
  $$\text{Effective Capacity} = \text{COALESCE}(\text{branch\_threshold.capacity\_limit}, \text{ingredient.capacity\_limit}, \infty)$$
- **Structural Invariant:** $\text{Effective Min} \le \text{Effective Target} \le \text{Effective Capacity}$.
- All surfaces (Cockpit, Stock Matrix, Store Count, Requisition) must utilize the single shared helper `resolveEffectiveThresholds()`.
- The TypeScript contract encodes unbounded capacity as `null`, not JSON-unsafe
  infinity. Invalid effective ordering fails validation; it is never silently
  clamped. Location overrides are resolved independently for each field.
- Adoption requires matching SQL semantics first. Existing `reorder_quantity`
  fallbacks and INV-10 minimum-based PO suggestions keep their current behavior
  until the corresponding runtime contract and migration are revised together.

The current schema has no ingredient-level `target_stock_level` or
`capacity_limit`, and location minimum/target values are non-null. The existing
write RPC normalizes null minimum to zero and null target to twice that minimum;
dropping nullability constraints alone would not implement inheritance. The
private scalar resolver establishes the target arithmetic without adding an
incomplete writable schema or adopting the legacy smart-reorder fallback.

Before persisting the new fields, coordinate nullable columns, authorized writes,
all affected effective overrides, and base-unit rebasing in one contract change.
The catalog rebase must scale location thresholds and new global target/capacity
alongside stock quantities. A future replenishment reader needs a coherent,
authorized location snapshot; absent allocation storage is unavailable coverage,
not an empty allocation list proving that net deficit equals gross deficit.

---

## 3. Synchronized AppShell Sidebar Hierarchy

The management and operational planes maintain a single unified navigation tree across desktop sidebar and mobile drawer:

`resolveInventoryNav()` supplies the three groups to the landing page and shared
shell. The primary module entry opens `/inventory`; it is not duplicated inside
its own landing links. Accountant navigation remains limited to PO and GRN.
The four mobile work slots remain stock, GRN, transfers, and production, with
the active route replacing the last slot when necessary.

UI Advisor Gate: `plane=control_surface`; `archetype=LANDING`;
`block=none` (existing shell navigation data, no new composition);
`exemplar=apps/web/app/(protected)/inventory/page.tsx` and
`apps/web/app/components/app-shell.tsx`. Actor/job: owner and central operators
choose the next inventory workflow. Verify role-filtered groups, branch scope,
active-route recovery, and authenticated rendering at 390/768/1280px.

```text
INVENTORY ("Kho Hàng")
├─ 1 · OPERATIONS ("Điều hành")
│  ├─ Stock Matrix          (/inventory/stock)           [Comprehensive multi-site on-hand ledger]
│  ├─ Daily Production      (/inventory/production)      [Central kitchen daily batch container]
│  └─ Stock Transfers       (/inventory/transfers)       [Inter-site transfers & dispatch queue]
├─ 2 · DOCUMENTS ("Chứng từ")
│  ├─ Purchase Orders (PO)  (/inventory/purchase-orders) [Central and branch vendor purchase orders]
│  ├─ Goods Receipts (GRN)  (/inventory/grn)             [Receiving slips matched against POs]
│  ├─ Stocktaking           (/inventory/stocktake)       [Periodic audit sessions & count slips]
│  └─ Consumption & Waste  (/inventory/consumption)      [Consumption list and waste view]
└─ 3 · MASTER DATA & SETTINGS ("Danh mục & thiết lập")
   ├─ Ingredients           (/inventory/ingredients)     [Item catalog, photos, unit ladders]
   ├─ Suppliers             (/inventory/suppliers)       [Vendor profiles & item mapping]
   ├─ Menu Recipes (BOM)    (/inventory/menu-recipes)    [Sales consumption bill of materials]
   └─ Inventory Settings    (/inventory/settings)        [Configuration hub]
      ├─ Categories         (/inventory/settings/categories)
      ├─ Units of Measure   (/inventory/settings/units)
      ├─ Stock Thresholds   (/inventory/settings/thresholds)
      ├─ Waste Governance   (/inventory/settings/waste)
      └─ Catalog Readiness  (/inventory/settings/readiness)
```

### URL Scope Preservation
`withInventoryBranchNavScope()` preserves the canonical `?branch=<id|all>` on
shell and landing links without changing the route used for active matching.
Date and site-kind propagation remains a later contract change; the current
navigation does not promise to carry those page-specific filters.

---

## 4. Control Home Root (`/`) Three-Region Architecture (ADR 0037)

In strict accordance with ADR 0037 (amended 2026-09-05), the L0 Control Home (`/`) functions as the company-wide coordination surface. It is structured into three ordered regions:

### 4.1. Region 1: Mine ("Của tôi")
- **Office Command Bar:** Instant office clock-in affordance (`/me/clock`).
- **My Due Work:** Personal actionable tasks assigned from the Work module due today.
- **Unread Notifications:** High-priority alerts targeted to the current actor.

### 4.2. Region 2: Coordinate ("Điều phối")
- **Cross-Module Exceptions Requiring Human Intervention:**
  - Tier-2 waste exception approvals (Warehouse $\leftrightarrow$ Executive).
  - Overdue refrigerated transit trucks (Warehouse $\leftrightarrow$ Logistics).
  - Severe shift count variances exceeding cash thresholds (Warehouse $\leftrightarrow$ Accounting).
  - Supplier AP invoices requiring GRN matching (Warehouse $\leftrightarrow$ Finance).
- Each coordination row exposes: **Issue Summary** · **Responsible Site / Staff** · **Next Action Trigger**.

### 4.3. Region 3: Modules ("Theo mô-đun")
One pulse card per authorized module (Inventory, Finance, HR, Sales, Work):
- **Inventory Pulse:** Stores below min · Daily batch completion · In-transit trucks. Direct action: `[Open Inventory Cockpit ->]`.
- **Finance Pulse:** Today cash flow · Pending invoice approvals.
- **HR Pulse:** Chain-wide attendance rate · Open shifts.
- **Sales Pulse:** Realtime net revenue · POS completed orders.

### 4.4. Isolated Data Loaders & Error Resilience
- Three parallel server loaders: `loadMineRegionData()`, `loadCoordinateRegionData()`, `loadModulesRegionData()`.
- **Error Contract:** If a regional loader fails, that region displays an **Unavailable Fallback State** with a retry affordance. Load errors must **never be converted into false zeroes**.

---

## 5. Direct Store GRN, Cost Governance & Projection Security

### 5.1. Direct Store Procurement Workflow (v1)
- **Standard Branch Purchase Orders (`po.branch_id = grn.branch_id`):**
  - Standard POs created for specific store branches (`po.branch_id = branch.id`).
  - Central procurement (`procurement:po_create`) sets contracted net unit prices with local suppliers (ice cubes, fresh veggies, gas).
- **Two-Step Physical Receipt & Central Costing:**
  1. **Step 1: Store Physical QC Receipt:**
     - Store manager selects the valid PO for their branch, creates a GRN draft, enters `received_quantity`, `rejected_quantity`, rejection reason, and mandatory camera photo.
     - **Store staff never enter nor view cost amounts**. The GRN is saved in `status = 'draft'` or `status = 'pending_unit_cost'`.
  2. **Step 2: Central Invoice Matching & Final Confirmation:**
     - Central accounting/procurement reviews the vendor invoice and confirms positive net cost (`unit_cost > 0`).
     - Once verified, `confirm_goods_receipt_note` executes atomically, updating stock levels and Company WAC.
- **Retraction of WAC Fallback:** WAC or catalog prices must **never be substituted as purchase costs**. Physical stock entries require verified vendor acquisition pricing.
- **Provisional Receiving:** Emergency local receipts (e.g. ice urgently needed for service) use a provisional receipt holding pattern, keeping inventory un-costed until the final invoice is recorded.

### 5.2. Data Layer Projection Security
- Postgres RLS filters table rows, not columns. Client queries on `grn_items` could leak unit costs over network inspection.
- **Security Projection DTO:**
  ```typescript
  export type BranchGrnItemView = {
    id: number;
    grn_id: number;
    ingredient_id: number;
    ingredient_name: string;
    image_url: string | null;
    received_quantity: number;
    rejected_quantity: number;
    rejection_reason: string | null;
    rejected_photo_url: string | null;
    status: string;
  }; // unit_cost and total amounts are strictly omitted
  ```
- Required verification: automated projection and database integration tests using
  branch manager JWTs must prove that cost fields cannot be read. The proposed
  `tests/branch-grn-cost-leak-prevention.test.ts` does not exist yet.

---

## 6. Closed-Loop Demand Allocation & Pro-Rata Engine

### 6.1. Demand Lifecycle State Machine
Each unit of deficit is tracked through an unbroken state transition chain, ensuring **each quantity is accounted for exactly once without double-counting**:

The Phase 0 projection consumes one consistent stock/allocation snapshot for an
explicit tenant, destination branch, destination location, ingredient, and base
unit. Every open stage covers demand; `fulfilled` no longer covers it because
receipt is already reflected in on-hand stock. Duplicate allocation IDs, mixed
scopes, non-finite quantities, and precision beyond three decimal places fail
closed. Arithmetic uses integer milliunits. Net deficit is
`max(0, target - on_hand - open_allocations)`; negative on-hand is preserved.
This pure projection neither reserves stock nor authorizes a mutation. The
later allocation RPC must enforce locking, authorization, transitions, and
atomic receipt reconciliation. Cancellation and partial-receipt transitions
must be specified before that RPC is implemented.

```text
[Deficit Detected on Radar]
            │
            ▼
   [in_batch_draft]       ──► Grouped into Daily Production Sheet Container
            │
            ▼
    [in_production]       ──► Chef starts cooking (child run status = 'in_progress')
            │
            ▼
[produced_pending_transfer] ──► Output complete (complete_production_run), goods held at Kitchen
            │
            ▼
    [transfer_draft]      ──► Transfer requisition created (transfers.status = 'draft')
            │
            ▼
      [in_transit]        ──► Truck departed (transfers.status = 'in_transit')
            │
            ▼
      [fulfilled]         ──► Received at Store On-Hand (transfers.status = 'completed')
```

### 6.2. Table Schema: `stock_demand_allocations` [PROPOSED]
```sql
CREATE TABLE public.stock_demand_allocations (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id bigint NOT NULL,
    source_branch_id bigint NOT NULL,
    dest_branch_id bigint NOT NULL,
    dest_location_id bigint NOT NULL,
    ingredient_id bigint NOT NULL,
    base_unit_id bigint NOT NULL,
    allocated_quantity numeric(15,3) NOT NULL,
    stage text NOT NULL CHECK (stage IN (
      'in_batch_draft',
      'in_production',
      'produced_pending_transfer',
      'transfer_draft',
      'in_transit',
      'fulfilled'
    )),
    batch_id bigint REFERENCES public.production_daily_batches(id),
    production_run_id bigint REFERENCES public.production_runs(id),
    transfer_id bigint REFERENCES public.stock_transfers(id),
    transfer_item_id bigint REFERENCES public.stock_transfer_items(id),
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);
```

### 6.3. Split Fulfillment & Concurrency Controls
When a branch requires 10 units and Central Kitchen has 6 units on hand:
1. **Automated Split:**
   - 6 units allocated from on-hand $\longrightarrow$ Instant transfer draft (`stage = 'transfer_draft'`).
   - 4 remaining units allocated to production $\longrightarrow$ Daily batch container (`stage = 'in_batch_draft'`).
   - This example assumes no existing source reservations. The pure contract
     computes `available = max(0, source_on_hand - reserved_on_hand)`, then
     `transfer = min(net_deficit, available)` and `production = net_deficit - transfer`.
     With 6 on hand and 4 already reserved, the split is 2 transfer / 8 production.
   - `reservedOnHandQuantity` is required and covers only reservations still held
     against this source location's on-hand. Exclude pre-production commitments
     and in-transit stock already deducted from source on-hand. Missing stock or
     reservation coverage cannot become zero. Negative on-hand is valid but
     provides no transferable stock.
   - `netDeficit` comes from the coherent demand snapshot before this new
     reservation. Source and destination require matching tenant, ingredient and
     base unit, and different locations; same-site warehouse-to-kitchen is valid.
     Each planned line must fit numeric(15,3); oversized demand fails validation
     instead of being silently clamped or rounded.
2. **Atomic Row-Level Locking:**
   - Allocation transactions execute with row locks on source stock:
     ```sql
     SELECT current_quantity FROM public.stock_levels
     WHERE tenant_id = v_tenant_id
       AND branch_id = v_source_branch_id
       AND location_id = v_source_location_id
       AND ingredient_id = v_ingredient_id
     FOR UPDATE;
     ```
   - Prevents race conditions and double-allocation between concurrent controllers.

### 6.4. Under-Yield Governance & Pro-Rata Distribution
- **Under-Yield Scenario:** Target was 10 units; cooking yielded only 8 units due to kitchen shrinkage.
- **Hamilton Method (Largest Remainder Pro-Rata):**
  The input `requestedQuantity` is each destination's outstanding commitment for
  the batch being distributed. Do not substitute radar net demand, which already
  subtracts that same batch allocation. The later RPC must update or replace the
  existing commitment rather than adding a second coverage record.
  Convert quantities to integer milliunits, and set distributable output to the
  smaller of actual output and total outstanding commitments:
  $$\text{Base Quota}_i = \left\lfloor \frac{\text{Requested Milliunits}_i \times \text{Distributable Milliunits}}{\text{Total Requested Milliunits}} \right\rfloor$$
  Award residual milliunits by largest fractional remainder first. On an exact
  remainder tie, prefer lower on-hand after the base quota, then ascending
  destination branch ID and location ID. IDs only break ties; they never supply
  missing scope. Return rows in that same canonical ID order, independently of
  input order. Zero commitments never receive a residual unit.
- Use BigInt for intermediate products, aggregate commitments and projected
  stock comparisons. Serialized quantities remain finite numeric(15,3) numbers;
  no BigInt crosses the application boundary. Reject duplicate destination
  locations or mixed tenant/ingredient/base-unit scope, including zero-demand rows.
- Each destination preserves `allocated + unfulfilled = requested`. Across the
  batch, `sum(allocated) + unallocated = actual_output`; over-yield stays explicit
  source surplus and never inflates a destination commitment. Empty or all-zero
  commitments leave the entire output unallocated.
- The 2 missing units remain on the Deficit Radar for subsequent batching.
- **Idempotency Verification:** `idempotency_keys` table stores `(idempotency_key, action_name, payload_hash)`. Requests sharing a key but differing in payload hash are rejected with `idempotency_payload_mismatch`.

---

## 7. Waste Governance & Dynamic Ratio Alerts

### 7.1. Operational Waste Tier Behavior
- **Tier 0 (< Tier 1 Threshold):** Normal operational waste (e.g. broken packaging, trim loss) is **recorded and written off immediately** (`approval_status = 'not_required'`) without photo or approval. Preserves kitchen speed.
- **Tier 1 (Tier 1 to Tier 2 Threshold):** Mandatory camera evidence (`photo_required = true`), written off immediately without approval bottleneck (`approval_required = false`).
- **Tier 2 (> Tier 2 Threshold or sensitive reasons):** Mandatory 4-eyes approval (`approval_required = true`). RPC `approve_stock_issue` strictly enforces `created_by != auth.uid()`.

### 7.2. Waste Ratio Alert Specification
$$\text{Waste Ratio} = \frac{\sum \text{Total Waste Value in Period}}{\text{Denominator}}$$
- **Denominator Standard:** Total actual inventory issues in the period (POS sales issues + kitchen production issues).
- **Zero-Denominator Guard:** If zero sales issues have occurred at start of shift and waste is logged, division by zero is avoided; an alert triggers directly if absolute waste exceeds the Tier 1 threshold.
- **Deduplication:** Rate-limited by `waste_alert:{branch_id}:{date}:{shift_key}` to prevent alert spamming.

---

## 8. Ingredient Image Lifecycle & Storage Security

### 8.1. Bucket Architecture & Separation
- **Public Catalog Bucket (`inventory-attachments/{tenant_id}/ingredients/**`):**
  - Publicly accessible WebP thumbnails compressed before upload and rendered with Next.js `<Image unoptimized>`.
  - Storage RLS: restricted to actors with `inventory:catalog_write` or the `central_supply_ops` position adapter, within their live tenant scope.
- **Private QC Bucket (`grn-evidence`):**
  - Private storage holding rejection proof and damage evidence.

### 8.2. Client-Side WebP Compression
- Input images resized client-side via `createImageBitmap` and `canvas.toBlob("image/webp", 0.82)`.
- Maximum dimension: 800px.
- Accept JPEG, PNG, or WebP inputs up to 10 MiB; reduce WebP quality when needed to enforce a 512 KiB upload limit. Actual compression depends on image content.

### 8.3. Transactional Mismatch Handling
1. **Client Cleanup on RPC Failure:** If upload succeeds but catalog save fails, attempt deletion of the uploaded object. A referenced image remains protected even when a network failure obscures a successful save.
2. **Delete-on-Replace:** After catalog save succeeds, attempt deletion of the superseded storage object. Referenced objects remain protected by Storage RLS.
3. **Orphan Cleanup Cron:** `/api/cron/ingredient-image-cleanup` runs hourly at minute 17, with Bearer `CRON_SECRET` authentication. Each run claims up to 50 unreferenced catalog objects older than 24 hours, deletes through Storage API, and confirms metadata removal. Service-role-only RPCs derive tenant identity from stored paths joined to live tenants. Claims block new publication under the same object lock and remain retryable after failure; recent images and other namespaces are excluded.

### 8.4. Implementation and Release Boundary

- The existing ingredient dialog selects and previews locally; upload starts only on submit. Canceling before submit creates no Storage object.
- Immutable object paths include the authenticated tenant, uploader UUID, and a random UUID. Server Actions validate inputs and keep Storage errors private.
- Migration `20260907144730_ingredient_images.sql` extends the catalog RPC, authorizes the Storage namespace, revokes anonymous execution, and provides bounded cleanup claims. Image publication and deletion take the same object advisory lock; failed image validation rolls back the entire catalog save.
- UI Advisor Gate: `plane=control_surface`, `archetype=DOC-WORKFLOW`; exemplar: existing ingredient dialog; registered `Field`, `Input`, and `Button`; no new page pattern. Verify selection, removal, cancel, submit failure, and populated edit on touch and desktop viewports.
- The owner-delegated Production apply of `20260907144730_ingredient_images.sql` completed on 2026-09-07 through the registered Session Pooler wrapper. All 30 ledger statements match the reviewed source, the post-apply dry-run has no pending migration, and `corepack pnpm db:types` regenerated the Production types. Catalog reads may now release against the verified schema.
- Evidence: image unit tests and `supabase/tests/ingredient_image_*_test.sql` scripts cover scope, atomic rollback, age limits, cleanup retries, and system-only execution. Browser compression produced a valid 800x400 WebP from a 2400x1200 source. Preview tests proved Storage access and publication/deletion races. The real cron endpoint rejected missing credentials, deleted one old orphan, retained recent/referenced images, and removed zero objects on retry. All disposable Preview branches were deleted and absence verified.
- Security review: anonymous execution is revoked; authenticated SECURITY DEFINER execution is intentional because the RPC enforces live tenant and catalog authorization. See the [Supabase advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
- The authenticated Next.js dialog passed cancel without upload, invalid-file recovery, save, replacement, and removal at 390, 768, and 1280 pixels with live Storage verification and no browser errors. The isolated input harness also covered dark theme, touch size, and overflow.
- Cleanup claims intentionally have RLS enabled with no direct table policies: all access is through service-role-only SECURITY DEFINER RPCs. See the [RLS advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- `corepack pnpm verify` passed after Production type generation with Turbo cache disabled, including 2,959 web tests (10 existing skips), 423 shared/print tests, and Android operational checks; it passed again after deployment exclusions were added. The Git-hook reader asks Git for effective configuration so verification works in linked worktrees.
- The release worktree includes the exact already-applied `absorb_origin_allocation_rounding_residual` source, verified against the Production ledger. Only the image migration appeared in the apply batch. Production deployment `dpl_HgNqj2d5HJjPKVt5kVKcxZhDK7jE` was promoted on 2026-09-07; `web.comtammatu.com` resolves to that READY deployment, and all four cron schedules are registered. Deployment-scoped error/fatal logs were empty at release verification.

---

## 9. Implementation Roadmap & Verification Harness (7 Phases)

### Sequence
$$\text{Contracts} \longrightarrow \text{Sidebar/Catalog} \longrightarrow \text{Migrations/RPC} \longrightarrow \text{Daily Batch} \longrightarrow \text{Allocations} \longrightarrow \text{Cockpit/Home} \longrightarrow \text{Branch Surface/Verify}$$

1. **Phase 0: Data Contracts, Types & Verification Setup:** Lock TypeScript types, Zod schemas, projection views, and test harnesses.
2. **Phase 1: Synchronize Sidebar & Catalog Workspace:** Refactor `inventory-nav.ts`, build `/inventory/settings/*` tabs, implement `IngredientImageInput`.
3. **Phase 2: Database Migrations & Atomic RPCs:** Branch PO support, `production_daily_batches`, `stock_demand_allocations`, `image_url` migration, Storage RLS policies, run `corepack pnpm db:types`.
4. **Phase 3: Daily Production Batch Container:** Build container management tracking independent child runs (preserving ADR 0044).
5. **Phase 4: Demand Allocation Engine & Pro-Rata:** State machine implementation, concurrency locking, Largest Remainder Pro-Rata logic.
6. **Phase 5: Shift Cockpit (`/inventory`) & Control Home (`/`):** Unified shift canvas on `/inventory`; 3-region implementation on `/` with isolated loaders and unavailable fallbacks.
7. **Phase 6: Branch Stock Surface & Final Verification:** Direct branch GRN with cost omission, blind counting, photo evidence, and full Four-Tier verification via `corepack pnpm verify`.

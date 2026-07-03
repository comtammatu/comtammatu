# Inventory Audit — bugs, flow fragmentation, matu-platform reference (2026-07-03)

> Reconciled-through b1b90967
> Owner directives: Inventory "rất khó dùng", tools "không hoạt động đúng", flow "quá rời rạc"; reference matu-platform's good points. Read-only investigation (3 lanes); fixes tracked separately (PR family below). Under D058/D059 (one implementation two roots — coherence via presentation contract, never forks).

## A. Verified functional defects (ranked)

| # | Sev | Status | Defect | Root cause (file:line) | Fix |
| --- | --- | --- | --- | --- | --- |
| 1 | HIGH | VERIFIED | Transfer detail line total + transfer total wrong for multi-unit ingredients — entry-unit qty × per-base-unit cost, off by the conversion factor (2 thùng × 12kg × 10.000đ shows ~20.000đ not 240.000đ) | `inventory/transfers/[id]/page.tsx:82,90` — qty=entry-unit, cost=`unit_cost_at_ship` per base (set by baseline.sql `stock_transfer_confirm_ship`) | S — **inventory PR1 (in flight)** |
| 2 | MED | VERIFIED | GRN confirm & create-from-PO recompute historical base qty with the CURRENT conversion factor, not a frozen one — editing an ingredient's `to_base_factor` between PO and GRN silently shifts "remaining to receive" + PO fulfillment status | baseline.sql `create_grn_from_po:7539-7541`, `confirm_goods_receipt_note:5981-5999`; `inv_to_base:14598-14624` reads live factor; no frozen `*_base_quantity` column | M — **owner-gated** (schema + RPC + backfill, migration → file→PR→owner applies). matu-platform reference point #1. |
| 3 | MED | SUSPECT | GRN create-from-supplier can only receive in BASE units (no purchase-unit picker) unlike PO/transfer/waste/stocktake | `grn/new/[supplierId]/grn-create-client.tsx:~210` hardcodes `unit: edit.ingredient.unit`, omits `entryUnitId` | S — port UnitField from new-po-client |
| 4 | LOW-MED | SUSPECT | Supplier-invoice VAT default 8% wrong for HKD F&B (GTGT ăn uống 3%, tạm 2.4% đến 31/12/2026) | `supplier-invoice-actions.ts:23` `vatRate.default(8)` | S — **verify via tax-vn skill first, not from memory** |
| 5 | LOW | SUSPECT | `fetchBranchWacMap` uses unweighted mean of per-branch WAC → recipe food-cost mispriced when branches differ | `recipe-actions.ts:89-102` | S — quantity-weight |
| 6 | LOW | VERIFIED | Transfer/PO/issue mutations omit `revalidatePath` (latent — no live bug; lists are dynamic + `router.refresh()`) diverges from grn/waste/stocktake | `transfer-actions.ts`, `issue-actions.ts`, `purchase-order-actions.ts` | S — **inventory PR1 (in flight)** |

**Ruled NOT a defect:** count-slip unit view model (commit 28a9dc08) is internally correct — only its commit message wording was inaccurate. Auth/scope guards + error mapping mostly sound.

## B. Flow fragmentation (the "rời rạc" is structural)

3 contract flows traced; breaks by class:

**Branch-breaking hardcodes (D059 violations — fix first):**
- `transfers/[id]/receive/` sub-route: ORPHAN (nothing links to it; receive is inline on detail) + hardcodes `/inventory/transfers` (`:168,177`) → **inventory PR1 (in flight)**.
- `drafts/page-client.tsx:53` hardcodes `/inventory/grn/new/[supplierId]` → **inventory PR1 (in flight)**.

**Status blindness (both directions, nearly every hop) — cheap S batch:**
- PO detail never lists its GRNs (one-way trip). GRN-list `poCode` = text not link (`grn-list-client.tsx:97`). Supplier-invoice's linked GRN = text (`:609/916`), price-variance banner has no link back to GRN/PO line. On-hand movement `transferRef` = text (`stock/[ingredientId]/page.tsx:175`).
- No PO/GRN → invoice affordance at all → operator re-selects GRN from a dropdown (`supplier-invoices-client.tsx:233-259`).

**Nav / duplicate entry (M restructure):**
- Sidebar group "Kiểm soát tồn" OMITS on-hand `/stock` + `/stocktake`; Transfers ABSENT from all groups (`inventory-nav.ts:61-108`) — reachable only via dashboard cards.
- GRN has 4 divergent entry points (PO button / GRN-list→PO-list / `/grn/new` / `/drafts`).
- `/issues` ("Xuất kho nội bộ") and `/consumption` ("Tiêu hao") listed as 2 nav items but `issues-client` routes into `consumptionBasePath` — one surface, two doors.
- `completeStocktake` strands the user (no next-action toward waste/adjustment).

## C. matu-platform reference points (adopt verdicts)

Reverse-engineered from `scripts/inventory-matu-platform-*.mjs` (~5,600 lines). 5 of 10 worth adopting:
1. **Freeze base qty+cost on document lines at confirm** (= defect #2 fix) — the one genuine data-correctness gap. **ADOPT**, owner-gated (migration).
2. **Ledger-consistency invariants as an RPC** `verify_inventory_ledger()` + scheduled job (net-ledger==on-hand, no negative stock, no orphan items, branch/location coherence, consumption missing unit_cost) — from the reconcile script. **ADOPT** as a guard.
3. Per-location reorder-level override — **ADAPT only after a Phước Hải pilot confirms per-branch alerting is a real workflow** (don't add a table before need).
4. Kitchen-drift check (central-kitchen yield vs recipe) — fold into #2's verify RPC. **ADOPT**.
5. Structured-key tagging + guarded revert SQL for bulk backfills — **CODIFY into database.md** (pattern already proven in operational-import.mjs:1436-1512).
Skipped 5 points as novelty-not-fixing-a-real-weakness.

## D. Proposed program (owner picks priority)

- **PR1 (in flight):** defect #1 (transfer total) + #6 (revalidate) + branch hardcodes (receive orphan, drafts). Pure execution, T3.
- **PR2 (S batch):** status-blindness links + PO/GRN→invoice CTA. Serves branch wrappers too (basePath already threaded). Pure execution.
- **PR3 (M):** nav restructure (add on-hand/stocktake/transfers to groups; dedup GRN entry, fold issues/consumption door) + `completeStocktake` next-action. Touches inventory-nav → mirror to operator tiles.
- **Owner-gated slice:** defect #2 frozen-base-qty (migration) + matu-platform #1/#2/#4 (verify RPC). Needs owner apply.
- **Verify-first slice:** defect #4 VAT default via tax-vn skill.

## Open owner decisions
1. Priority order of PR2/PR3 vs the branch-complete wrapper backlog (supplier-returns, HR approvals seam, production).
2. Approve the frozen-base-qty migration + `verify_inventory_ledger()` RPC (owner-applies).
3. WM/PM permission grant for the team board (`hr:view_employee` — see PR #197 note) — orthogonal but pending.

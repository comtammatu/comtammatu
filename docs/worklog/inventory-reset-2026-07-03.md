# Inventory reset + opening-balance (2026-07-03)

> Reconciled-through main @ merge #225 (2026-07-03). Owner-driven reset of Phước Hải inventory.
> Owner decisions: wipe ledger+documents KEEP catalog; land unit-system Phase A + ledger-fix BEFORE re-entry (D060 §5 window). Stock deduction Phước Hải already OFF; POS unlock migration applied (#223).

## Pre-wipe snapshot (stock_levels @ 2026-07-03, PROD)

All 19 rows are Phước Hải (branch_id 3); avg_unit_cost mostly NULL (data known-wrong → reason for reset). Reference only.

| ingredient (sku) | qty | purchase_unit | avg_unit_cost |
| --- | --- | --- | --- |
| Bì-TP (TP-BI) | 1.632 | khay | null |
| Cam-TP (TP-CAM) | 100.500 | kg | null |
| Canh Khổ Qua-TP | 98.000 | trai | null |
| Chả-TP (TP-CHA) | 100.011 | khay | null |
| Cơm Thêm-TP | 196.600 | kg | null |
| Fanta Cam-TP | 1.874 | thung | null |
| Fanta Xá Xị-TP | 2.375 | thung | null |
| Khăn Lạnh-TP | 9.920 | bich | null |
| Nước Sâm-TP | 4300.000 | ml | null |
| Nước Suối-TP | 2.249 | thung | null |
| Rau Má-TP | 7650.000 | ml | null |
| Sprite-TP | 1.750 | thung | null |
| Sườn Cọng-TP | 2.450 | thung | null |
| Sườn Cốt Lết-TP | 6.344 | thung | null |
| Sườn Một Gang-TP | 1.040 | thung | null |
| Tóp Mỡ-TP | 10.100 | kg | null |
| Trà Lài Thu Thảo (TR01) | 4.974 | goi | null |
| Trà Tắc-TP | 6000.000 | ml | null |
| Trứng-TP | 11.140 | vi | 64487.10 |

Other counts: stock_movements 318, GRN 2, PO 2, stocktake 1, count_slips 2. KEEP: ingredients 114, suppliers 1, recipes 22, ingredient_units 40.

## Reset sequence

1. ✅ Deduction OFF (Phước Hải) + POS unlock (#223 applied).
2. ✅ Snapshot (above).
3. ✅ Unit-system Phase A — migration `20260703160000_inventory_unit_system_phase_a` merged (#225) and **APPLIED to PROD 2026-07-03** (owner-delegated; guard temporarily toggled + restored + guard-sync verified). Verified: units.dimension/is_standard/standard_factor + ingredient_units.anchor_* columns, 4 constraints, index, `inv_derive_to_base_factor` fn, 6 standard units seeded (g=1/kg=1000/mg=0.001/ml=1/l=1000/cl=10), packaging seed, renames (piece→cái, bich→túi), backfill 20/20 non-base rows, permission `inventory:units_master`. CI needed 2 fixes before merge (replay idempotency + backfill 42P01 illegal `iu` FROM-ref) — migration had never run outside CI (no local Docker).
4. ⟳ Ledger-fix — REVISED to option A: `verify_inventory_ledger` RPC deferred to AFTER re-entry (diagnostic validates the clean state); "freeze base qty/cost at confirm" folded into Phase B's 11-RPC rewrite (avoids double-touching confirm RPCs). No standalone ledger-fix migration.
5. ✅ WIPE ledger + documents (keep catalog) — **APPLIED to PROD 2026-07-03** (owner-confirmed scope + delegated; guard-toggle; one-off SQL, NOT a repo migration so fresh-env seeds stay intact). Cleared via FK-safe atomic DO block (children→parents; stock_movements first, supplier_payments before invoices, stock_levels late): stock_movements(322), stock_levels(19), goods_received_notes(2)+grn_items(3), purchase_orders(2)+items(3), stocktake_sessions(1)+lines(17)+drafts/conflicts/zone_locks, inventory_count_slips(3)+lines(3)+assignments(4), stock_issues/items, stock_transfers/items, supplier_invoices/credit_notes/returns/return_items/payments, grn_baseline_pause/express_extend_audit/hardblock_overrides, ingredient_abc_class(123). MVs refreshed empty (mv_inventory_stock_current, mv_grn_price_baseline, mv_inventory_value_ranking). KEPT intact: ingredients(114), ingredient_units(40, anchor-complete), units(24), recipes(22), suppliers(1), supplier_price_list(1), branch_daily_waste_cap(3). NOT touched (POS-side): branch_menu_item_daily_holds, kitchen_send_batches.
6. ⬜ Re-enter opening balance via GRN per branch (qty + cost) — OWNER, in-app. Then turn deduction back ON (feature flag `pos_stock_outcome_posting`) once data is clean.
7. ⬜ Post-re-entry: author + apply `verify_inventory_ledger` RPC (option A) to confirm net-ledger==on-hand, no negatives, no orphans.

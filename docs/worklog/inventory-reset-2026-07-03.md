# Inventory reset + opening-balance (2026-07-03)

> Reconciled-through main @ merge #223. Owner-driven reset of Phước Hải inventory.
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
3. ⬜ Unit-system Phase A (docs/plan/inventory-unit-system-2026-07-03.md) — additive migration + catalog + seed + derivation. Owner applies.
4. ⬜ Ledger-fix (freeze base qty/cost at confirm + verify_inventory_ledger RPC). Owner applies.
5. ⬜ WIPE ledger + documents (keep catalog): stock_levels, stock_movements, GRN/PO/transfer/stocktake/issue/waste/count/supplier-invoice + holds/reservations. Migration → owner applies.
6. ⬜ Re-enter opening balance via GRN per branch (qty + cost, on 2-tier units + frozen base).

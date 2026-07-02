# Canh Kho Qua Finished Good Stock

Reconciled-through 20ef5abd

Review-Tier: T3

Skill plan: repo rules = engineering + skills + database + workflow; external skills = supabase; runtime tools = Supabase MCP + CLI + CodeGraph; skipped = UI/browser because this is a data-only migration.

PM: Scope is additive inventory master data for Canh Kho Qua, with Phuoc Hai stock seeded now. Acceptance is a finished-good item with `trai` as base purchase/storage unit, `piece` as sellable unit, and 100 base units in PH main warehouse.

BA: Business rule is `1 trai = 2 phan`; therefore `stock_levels.current_quantity = 100` stores base units and sellable capacity is 200 portions when a matching menu recipe exists. Existing raw material `Kho Qua` is not reused because the owner asked for a new finished good.

Senior Dev: Implement as one idempotent SQL migration that creates/reactivates unit `trai`, creates/reactivates `Canh Kho Qua - Thanh Pham` SKU `TP-CANH-KHO-QUA`, replaces its unit rows, resets stock for this item, and inserts the PH/main_warehouse stock row. If an active `Canh Khổ Qua` menu item exists, attach one recipe line; otherwise do not fabricate menu price/category data.

QA/QC: Verify production ledger by migration name, finished-good fields, ingredient units (`trai` factor 1, `piece` factor 0.5), PH stock row quantity 100, no non-PH stock rows for the item, and recipe/capacity behavior. Run CodeGraph refresh and repo hard gate after the migration file is final.

## Menu Recipe Follow-Up

Review-Tier: T3

Skill plan: repo rules = engineering + skills + database + workflow; external skills = supabase; runtime tools = Supabase MCP + CLI + CodeGraph; skipped = UI/browser because this is a data-only recipe mapping.

PM: Scope is to connect the owner-created `Com Kho Qua` menu item to the finished-good stock item. Acceptance is that POS/menu stock logic sees the item as sellable from the seeded Phuoc Hai stock.

BA: The active menu item is named `Cơm Khổ Qua`, while the stock item remains `Canh Khổ Qua - Thành Phẩm`. One sold menu portion consumes exactly `1 phần` of the finished good, which is `0.5 trái` through the item unit conversion.

Senior Dev: Implement a narrow migration that requires the active menu item, requires SKU `TP-CANH-KHO-QUA`, replaces recipe rows for that menu item with one canonical line, and refreshes branch stock capacity.

QA/QC: Verify recipe row, production ledger, PH daily capacity row, live capacity, and unchanged stock quantity (`100 trái = 200 phần`). No generated DB types are needed because the schema shape is unchanged.

# Inventory Finished Goods Reset

Owner: current inventory cleanup task.
Reconciled-through 0a85386e.

Skill plan: repo rules = engineering + database + workflow + database schema; external skills = supabase + supabase-postgres-best-practices; runtime tools = CodeGraph + SELECT-only Supabase snapshot + migration file; skipped = production apply.

PM: Scope is inventory operational reset plus 18 target finished goods and menu recipe drivers. Done means the SQL is tenant-guarded, does not apply to production automatically, and leaves stock quantities to ledger flows.

BA: The target list is the owner-supplied menu stock-control set. Active menu aliases `Sườn Cây`, `Cơm Tấm Bì`, `Cơm Tấm Chả`, and `Cơm Tấm Trứng` reuse the corresponding target finished goods. `units` is one shared dictionary; `ĐVT`, `ĐVN`, and `ĐVB` are references to that dictionary, not separate unit classes. For this reset, the supplied `ĐV Tính` is the base stock unit, the supplied `ĐV Bán` is the recipe/POS unit, non-target unit codes are removed from `units`, non-target ingredients are hidden, `Nước Suối` normalizes the pack conversion to `1 thùng = 24 chai`, and `Tóp Mỡ` keeps `1 kg = 10 phần` until the owner supplies a factor. Initial stock seeds include matu-prod PH `KHO-PH` direct/converted quantities, with meat boxes converted at `1 thùng = 5 kg`: `Sườn Cốt Lết` 7 thùng, `Sườn Cọng` 3.6 thùng, `Sườn Một Gang` 1.92 thùng, `Bì` 1 khay from 4000 g, `Chả` 1.5 khay, `Trứng` 0.1 vỉ, `Cam` 5.5 kg, `Trà Tắc` 8600 ml, `Fanta Xá Xị` 2.375 thùng, `Sprite` 1.75 thùng, `Nước Suối` 2.417 thùng, `Khăn Lạnh` 10 bịch. Extra seeds use matu-prod all-warehouse findings: `Rau Má` 10050 ml and `Fanta Cam` 2 thùng from `BEP-PH` into comtammatu `PH/main_warehouse`, `Nước Sâm` 6100 ml from `KHO-TT` into `BTT/main_warehouse`, and `Tóp Mỡ` uses matu-prod `Mỡ` 0.6 kg from `KHO-TT` into `BTT/main_warehouse`. `Cơm Thêm` uses `Gạo Tấm Tài Nguyên` 200 kg from matu-prod `KHO-TONG` into comtammatu `KT/main_warehouse`.

Senior Dev: Use direct SQL in one migration instead of auth-bound catalog RPCs. Reset operational inventory tables first, replace tenant recipes, upsert units/categories/ingredients/ingredient_units, delete obsolete ingredient-unit links, then recreate recipe drivers for the target active menu items.

QA: Verify with SELECT-only snapshot before writing, SQL parse checks, dry-run planner self-test, and no production apply. After owner applies, verify 18 active target ingredients, 10 canonical unit codes, recipe coverage, and zero operational inventory rows in the reset tables.

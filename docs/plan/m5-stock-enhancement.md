# M5-Ext: Stock Enhancement — Kho Hàng Nâng Cao

> Status: APPROVED | Depends: M5 (SHIPPED)
> Input: `quy-trinh-kho-hang-chi-tiet.md` — SOP doanh nghiệp cho chuỗi nhà hàng
> Reviewed by: CEO Review + Eng Review + Design Review (3-agent parallel, 2026-04-09)
> Founder input: 2026-04-09
> Ref: `docs/ref/inventory.md`

## Product Direction

**One-liner:** "Không bao giờ hết sườn, không bao giờ mua đắt."

M5 Stock MVP đã ship: ingredients, stock levels, PO→GRN→Invoice, transfers, recipes, WAC.
Quy trình SOP chi tiết yêu cầu enterprise WMS. Nhưng Cơm Tấm Má Tư là chuỗi 3-5 chi nhánh với ~50 SKU — cần software giải quyết bài toán thực tế, không phải SAP.

**CEO verdict:** Stop building a warehouse management system. Build a "never run out, never overpay" system.

### Founder Context (2026-04-09)

| Input              | Answer                         | Plan impact                                                    |
| ------------------ | ------------------------------ | -------------------------------------------------------------- |
| SKU count          | **30-50 SKU**                  | Auto-suggest PO sẽ rất chính xác                               |
| Ordering method    | **1 người, qua Zalo**          | PR workflow = KILL confirmed. PO suggest → Zalo-ready message  |
| Stocktake hiện tại | **Chưa bao giờ**               | **#1 priority.** Tồn kho hệ thống = lý thuyết, chưa đối chiếu. |
| Food cost %        | **Biết sơ bộ, chưa chính xác** | Phase 1: connect consumption → revenue per branch              |
| Sự cố ATTP         | **Chưa bao giờ**               | Batch tracking = HOLD, không urgent                            |

---

## What's Already Good (ALIGNED)

| Feature                | Codebase                                               | SOP Doc                          |
| ---------------------- | ------------------------------------------------------ | -------------------------------- |
| HQ-only procurement    | PO/GRN chỉ tại `is_headquarters=true`                  | Kho Trụ sở là điểm nhập duy nhất |
| WAC costing            | `confirm_goods_receipt_note` RPC                       | Giá bình quân gia quyền          |
| Transfer state machine | draft→confirmed_ship→in_transit→received               | 5 trạng thái                     |
| Transfer directions    | TS↔CN, CN↔CN, block TS↔TS                              | Đúng quy định                    |
| 3-Way matching         | PO↔GRN↔Invoice, matching_status                        | ±5% SL, ±2% giá                  |
| Auto consumption       | Recipe × order → stock deduction                       | Xuất theo recipe khi completed   |
| Append-only movements  | No UPDATE/DELETE on stock_movements                    | Audit trail                      |
| Supplier invoices      | `supplier_invoices` + UNIQUE(inv_no, supplier, tenant) | Nhận HĐ, đối chiếu               |
| Duplicate prevention   | UNIQUE constraint blocks same invoice_number per NCC   | §8.2.3                           |
| Recipe/BOM level 1     | `recipes` (menu_item → ingredient × qty)               | §9.2 single-level BOM            |
| COGS per dish          | `mv_food_cost` materialized view (M6)                  | §9.5 Food cost % tự động         |

---

## KILL LIST — Không bao giờ build

| Feature                             | Lý do                                                                            |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| Bin Location (zone/kệ/ngăn)         | Đây là kho nhà hàng, không phải warehouse. 1 tủ lạnh, 1 tủ đông, 1 kệ khô.       |
| Purchase Request 7-status workflow  | 1 người mua (super_manager). PR = tự duyệt chính mình. Chỉ cần khi >8 chi nhánh. |
| Full QC checklist per food category | Checklist giấy tại bến nhận hàng. Software thêm friction, không thêm value.      |
| FIFO/FEFO costing engine            | WAC đúng cho quy mô này. FIFO thêm complexity khổng lồ cho accuracy marginal.    |
| Stock states (Reserved/QC Hold)     | Bếp nhà hàng xuất tuyến tính, không concurrent. Reserved = 0 benefit.            |
| Formal Phiếu Xuất Kho (PX)          | Auto-consumption từ recipe đã cover 95%. Adjustment cho phần còn lại.            |
| Blanket PO / Emergency PO types     | 3-5 NCC. Gọi điện.                                                               |
| Label printing / barcode            | 50 SKU. Biết thịt bò trông như thế nào.                                          |
| Offline mode                        | Đây là architecture decision (Local-First), không phải inventory feature.        |
| Payment Run (batch payment)         | 3-5 NCC, thanh toán thủ công qua banking app. Batch payment = overkill.          |
| Phê duyệt thanh toán theo ngưỡng    | 1 người quyết định (owner). Multi-level approval khi >8 chi nhánh.               |
| Multi-level BOM (bán thành phẩm)    | Cơm tấm không có sub-recipe. Nếu cần → add parent_recipe_id sau.                 |
| ABC Analysis auto-compute           | 30-50 SKU — owner biết item nào quan trọng. Auto-classify khi >100 SKU.          |

---

## Gap Analysis — SOP §8 (HĐ NCC & AP) + §9 (Nguyên liệu & Báo cáo)

### §8 Gaps — Accounts Payable

| SOP yêu cầu                              | Codebase hiện tại                                   | Quyết định                                   |
| ---------------------------------------- | --------------------------------------------------- | -------------------------------------------- |
| Payment terms trên supplier (NET7/14/30) | **Thiếu** — `suppliers` không có `payment_terms`    | **Phase 1 S6** — ALTER thêm cột              |
| Due date = invoice_date + payment_terms  | **Thiếu** — `supplier_invoices` không có `due_date` | **Phase 1 S6** — ALTER thêm cột              |
| Payment status (Paid/Unpaid/Partial)     | **Thiếu** — không track thanh toán                  | **Phase 1 S6** — ALTER thêm `payment_status` |
| AP aging report (tuổi nợ theo NCC)       | **Thiếu** — cần query                               | **Phase 1 S7** — query-only, no new table    |
| Debit Note / Credit Note                 | **Thiếu**                                           | **Phase 2 HOLD** — khi scale                 |
| Duplicate invoice prevention             | UNIQUE(invoice_number, supplier_id, tenant_id) ✅   | Đã có                                        |
| Hạch toán kế toán                        | M6 `journal_entries` ✅                             | **M6 scope**, không phải M5                  |

### §9 Gaps — Nguyên liệu & Báo cáo

| SOP yêu cầu                          | Codebase hiện tại                                | Quyết định                            |
| ------------------------------------ | ------------------------------------------------ | ------------------------------------- |
| Yield factor (hệ số hao hụt sơ chế)  | **Thiếu** — `recipes` không có `yield_factor`    | **Phase 1 S5** — ALTER thêm cột       |
| Gross quantity = net / (1 - yield%)  | **Thiếu** — consumption dùng net quantity        | **Phase 1 S5** — app logic tính gross |
| Theoretical vs Actual variance       | stock_movements (consumption) + recipes ✅       | **Phase 1 S7** — report query         |
| Consumption variance alerts (>±7%)   | **Thiếu** dashboard                              | **Phase 1 S7** — alert card           |
| Waste log (distinct from adjustment) | `adjustment` type tồn tại, không phân biệt waste | **Phase 0 S3** — thêm reason `waste`  |
| Food cost % report                   | `mv_food_cost` (M6) ✅                           | Đã có — link từ inventory dashboard   |
| Supplier performance metrics         | **Thiếu**                                        | **Phase 2 HOLD**                      |

---

## Phased Roadmap (Post-Review)

### Phase 0: "Tin Được Con Số" — Trust the Numbers

> **North Star:** Thủ kho mở app lúc 5h sáng — biết tồn kho THẬT, biết cần đặt GÌ, biết hàng nào sắp hết hạn.
> **Estimate:** 4 sessions | **Priority:** DO FIRST

#### S1: Stocktake — Migration + RPC

**Scope:** Schema + RPC `complete_stocktake`

```sql
-- New tables
CREATE TABLE stocktake_sessions (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       BIGINT NOT NULL REFERENCES tenants(id),
  branch_id       BIGINT NOT NULL REFERENCES branches(id),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'in_progress'
                  CHECK (status IN ('in_progress', 'completed', 'cancelled')),
  notes           TEXT,
  created_by      UUID REFERENCES auth.users(id)
);
-- Partial unique: only one active stocktake per branch
CREATE UNIQUE INDEX idx_one_active_stocktake_per_branch
  ON stocktake_sessions(branch_id, tenant_id)
  WHERE status = 'in_progress';

CREATE TABLE stocktake_lines (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       BIGINT NOT NULL REFERENCES tenants(id),
  session_id      BIGINT NOT NULL REFERENCES stocktake_sessions(id) ON DELETE CASCADE,
  ingredient_id   BIGINT NOT NULL REFERENCES ingredients(id),
  system_quantity NUMERIC(15,3) NOT NULL,
  counted_quantity NUMERIC(15,3),
  variance        NUMERIC(15,3) GENERATED ALWAYS AS (counted_quantity - system_quantity) STORED,
  variance_reason TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, ingredient_id, tenant_id)
);
```

**RPC `complete_stocktake(p_session_id)`:**

1. Lock session FOR UPDATE, verify `status = 'in_progress'`
2. Verify all lines have `counted_quantity` filled
3. **Re-snapshot:** For each line, read FRESH `stock_levels.current_quantity` (not stale snapshot) — handles concurrent movements during counting
4. Compute adjustment = `counted_quantity - fresh_current_quantity`
5. INSERT `stock_movements` (type=`count_adjustment`) for each non-zero adjustment
6. Existing trigger `trg_update_stock_on_movement` auto-updates `stock_levels` + `last_counted_at`
7. UPDATE session → `completed`

**Key edge case (Eng review):** Concurrent stock adjustment during stocktake → solved by re-snapshot at completion time. `system_quantity` column stores ORIGINAL snapshot for audit, but adjustment uses fresh value.

**ACL:** branch_manager creates + completes stocktake (own branch). No approval workflow in Phase 0 — super_manager reviews via dashboard.

**GRANT + RLS:** Per existing patterns. `SELECT, INSERT, UPDATE TO authenticated`. RLS by tenant_id + branch scoping.

#### S2: Stocktake — UI + Reorder Alerts

**Scope:** Stocktake pages + Reorder alert dashboard

**Stocktake UI (Design review input):**

- `/admin/inventory/stocktake` — session list + create
- `/admin/inventory/stocktake/[id]` — counting interface
- **Mobile pattern (P0 UX decision):** Single-item card mode on phone — ingredient name + unit in large text, big numeric input, swipe next. Progress bar at top (15/50). Auto-save per line.
- Desktop: table with inline inputs (existing pattern)
- System quantity HIDDEN during counting (prevent bias)
- Variance display after completion: green (<1%), yellow (1-5%), red (>5% + required reason)
- Session resume: partially counted sessions stay `in_progress`, reopen to continue

**Reorder Alerts (CEO review — promoted to P0):**

- Dashboard widget on `/admin/inventory` Tổng Quan
- Compare `stock_levels.current_quantity` vs `ingredients.reorder_point` (field already exists!)
- Show: "Cần đặt hàng" list grouped by supplier
- Calculate suggested quantity: `ingredients.max_stock_level - current_quantity`
- One-click: "Tạo PO" from suggestion → prefill PO form

**Navigation (Design review):** Add "Kiểm kê" to sub-nav. Keep flat nav for now (9 items with scroll indicators). Restructure to 2-tier when hitting 11+ items.

#### S3: Expiry Alerts + GRN QC Lite

**Expiry (simplified per CEO review — alert + write-off, NOT block):**

**CRITICAL (Eng review):** "Block xuất kho hàng hết HSD" is IMPOSSIBLE without batch tracking. WAC model has no concept of which units are expired. Reframe as alert + write-off.

- Query `grn_items.expiry_date` (field already exists) joined to `stock_levels`
- Dashboard: alert summary cards at top of Tổng Quan (Design review)
  - Badge: "3 items hết hạn trong 3 ngày" (red), "5 items hết hạn trong 7 ngày" (yellow)
  - Tappable → filtered list
- Write-off action: create `adjustment` movement with reason `expired` — uses existing `adjustStock` action with new reason option
- Waste log: extend `adjustStock` to accept reason `waste` (§9.4) — distinct from `expired` and generic `adjustment`
- Separate route: `/admin/inventory/expiry` for full filterable list

```sql
-- Index for expiry queries (Eng review)
CREATE INDEX idx_grn_items_expiry
  ON grn_items(expiry_date)
  WHERE expiry_date IS NOT NULL;
```

**GRN QC Lite (minimal — CEO says defer photos):**

```sql
ALTER TABLE grn_items ADD COLUMN receiving_temperature NUMERIC(5,1);
-- Temperature only shown for cold/frozen items (Design review: conditional field)
```

Photo upload → defer to Phase 1. Temperature field = 10 min work, real value for cold chain.

#### S4: Polish + Verify

- Integration test: full stocktake flow end-to-end
- Verify reorder alerts accuracy (edge: new ingredient with no movements)
- Verify expiry alerts across branches
- `/verify` + `/review` passes
- Update `docs/ref/inventory.md` with new features

---

### Phase 1: "Mua Hàng Thông Minh" — Buy Smarter

> **North Star:** Auto-suggest PO — thủ kho thấy "cần đặt 50kg sườn, 30kg trứng" dựa trên tiêu thụ 7 ngày qua.
> **Estimate:** 3 sessions | **Priority:** DO SECOND

#### S5: Auto-Suggest PO + Recipe Yield (§9.2)

- Calculate: avg daily consumption (from `stock_movements` type=`consumption`, last 7/14/30 days) × lead time = suggested order qty
- Factor in current stock: `suggested = max_stock - current_quantity`
- Show on PO creation page: "Gợi ý đặt hàng" panel
- One-click add suggested items to PO draft
- **§9.2 Yield factor (hao hụt sơ chế):**

```sql
ALTER TABLE recipes ADD COLUMN yield_factor NUMERIC(5,3) DEFAULT 1.0
  CHECK (yield_factor > 0 AND yield_factor <= 1);
-- yield_factor = 0.85 means 15% hao hụt → gross = net / 0.85
-- Default 1.0 = no waste (backward-compatible)
```

- App logic: `gross_quantity = recipe.quantity / recipe.yield_factor`
- Auto-suggest PO uses gross quantity (not net) for accurate ordering
- UI: show yield % on recipe form, tooltip giải thích

#### S6: Price Intelligence + AP Tracking (§8)

- PO price alert: flag when `unit_price_est` deviates >5% from average of last 3 POs for same ingredient+supplier
- Supplier price history: simple line chart — price per unit over time per ingredient per supplier
- Give owner data for negotiation
- **§8 Supplier payment terms + Invoice tracking:**

```sql
ALTER TABLE suppliers ADD COLUMN payment_terms TEXT DEFAULT 'COD'
  CHECK (payment_terms IN ('COD', 'NET7', 'NET14', 'NET30'));

ALTER TABLE supplier_invoices ADD COLUMN due_date DATE;
ALTER TABLE supplier_invoices ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'unpaid'
  CHECK (payment_status IN ('unpaid', 'partial', 'paid'));
ALTER TABLE supplier_invoices ADD COLUMN paid_at TIMESTAMPTZ;
ALTER TABLE supplier_invoices ADD COLUMN paid_amount NUMERIC(15,2) DEFAULT 0;
```

- Auto-compute due_date = invoice_date + payment_terms days (app logic on create)
- Invoice list: show payment_status column + overdue highlight (due_date < today & unpaid)
- Mark paid action: update payment_status + paid_at + paid_amount

#### S7: Reports + In-Transit + Variance (§8 + §9)

- **4 reports (expanded from 2, incorporating §8 AP + §9 consumption):**
  1. Biến động tồn kho (period-based: opening + receipts + transfers - consumption - adjustments = closing)
  2. Stock movement summary by branch
  3. **§8 AP Aging** — công nợ NCC theo tuổi nợ (current / 1-30d / 31-60d / 61-90d / >90d). Query `supplier_invoices` WHERE payment_status != 'paid', grouped by supplier
  4. **§9 Consumption variance** — lý thuyết (orders × recipes × yield) vs thực tế (stock_movements type=consumption). Alert khi |variance| > 7%
- In-transit visibility: show transfers at `in_transit` status on stock dashboard
- Transfer note print template (simple PDF)
- Reports on desktop-first (Design review: charts don't work on phone)
- Link to M6 `mv_food_cost` for food cost % per branch (§9.5 — already exists)

---

### Phase 2: Scale When Needed (HOLD — trigger-based)

> Only start when specific trigger fires. Not on roadmap timeline.

| Feature                           | Trigger to start                                       | Sessions |
| --------------------------------- | ------------------------------------------------------ | -------- |
| Batch/Lot tracking                | Regulatory requirement OR food safety incident         | 4-6      |
| Purchase Request workflow         | >8 branches with distributed procurement               | 3-4      |
| Supplier performance scoring      | Owner asks for NCC evaluation data                     | 1-2      |
| GRN photo upload                  | Staff requests or audit requirement                    | 1        |
| Stock states (Reserved/Available) | Concurrent warehouse operations become a problem       | 2-3      |
| Debit Note / Credit Note (§8.6)   | NCC trả hàng thường xuyên hoặc cần đối soát chính thức | 2        |
| Multi-level BOM (§9.2)            | Menu có bán thành phẩm (sub-recipe) cần track          | 2        |
| Waste dashboard chi tiết (§9.4)   | Owner muốn phân tích waste theo loại + trend           | 1        |
| ABC Analysis auto (§9.7)          | >100 SKU cần phân loại tự động                         | 1        |

---

## Technical Decisions (Eng Review)

### Migration Safety

| Change                                            | Type                      | Safe? | Notes                                                        |
| ------------------------------------------------- | ------------------------- | ----- | ------------------------------------------------------------ |
| `CREATE TABLE stocktake_sessions`                 | New table                 | Yes   | + GRANT + RLS + partial unique index                         |
| `CREATE TABLE stocktake_lines`                    | New table                 | Yes   | + GRANT + RLS + UNIQUE(session_id, ingredient_id, tenant_id) |
| `ALTER grn_items ADD receiving_temperature`       | Nullable column           | Yes   | Non-blocking                                                 |
| `CREATE INDEX idx_grn_items_expiry`               | Partial index             | Yes   | Non-blocking                                                 |
| `ALTER recipes ADD yield_factor` (§9)             | Nullable + DEFAULT 1.0    | Yes   | Non-blocking, backward-compatible                            |
| `ALTER suppliers ADD payment_terms` (§8)          | Nullable + DEFAULT 'COD'  | Yes   | Non-blocking                                                 |
| `ALTER supplier_invoices ADD due_date` (§8)       | Nullable column           | Yes   | Non-blocking                                                 |
| `ALTER supplier_invoices ADD payment_status` (§8) | NOT NULL DEFAULT 'unpaid' | Yes   | Existing rows get 'unpaid'                                   |
| `ALTER supplier_invoices ADD paid_at` (§8)        | Nullable column           | Yes   | Non-blocking                                                 |
| `ALTER supplier_invoices ADD paid_amount` (§8)    | DEFAULT 0                 | Yes   | Non-blocking                                                 |

### Edge Cases Resolved

| Edge case                            | Resolution                                                                              |
| ------------------------------------ | --------------------------------------------------------------------------------------- |
| Concurrent stocktake + movement      | Re-snapshot at completion time (fresh `stock_levels.current_quantity`)                  |
| Transfer in-transit during stocktake | No race — in-transit stock not in either branch's `stock_levels`                        |
| Expiry block on auto-consumption     | NOT blocking in Phase 0. Alert + write-off only. Blocking requires batch tracking.      |
| WAC during stocktake adjustment      | `count_adjustment` does NOT change WAC — correct (physical correction, not cost change) |
| Stocktake RPC atomicity              | All movements in single transaction via RPC. Do NOT use `adjustStock` Server Action.    |

### New RPC

| Function                                  | SECURITY DEFINER | Notes                                        |
| ----------------------------------------- | ---------------- | -------------------------------------------- |
| `complete_stocktake(p_session_id BIGINT)` | Yes              | Writes count_adjustment movements atomically |

---

## ACL Impact

| Feature                   | Who can do                                | Role mapping        |
| ------------------------- | ----------------------------------------- | ------------------- |
| View reorder alerts       | branch_manager+                           | INVENTORY_OPS_ROLES |
| View expiry alerts        | branch_manager+                           | INVENTORY_OPS_ROLES |
| Create/complete stocktake | branch_manager (own branch)               | INVENTORY_OPS_ROLES |
| View stocktake history    | super_manager (all), branch_manager (own) | INVENTORY_OPS_ROLES |
| PO auto-suggest           | super_manager                             | PROCUREMENT_ROLES   |
| Price alerts              | super_manager                             | PROCUREMENT_ROLES   |
| Edit yield_factor (§9)    | super_manager                             | PROCUREMENT_ROLES   |
| Mark invoice paid (§8)    | super_manager                             | PROCUREMENT_ROLES   |
| View AP aging (§8)        | super_manager, owner                      | PROCUREMENT_ROLES   |
| View consumption var (§9) | branch_manager+ (own branch)              | INVENTORY_OPS_ROLES |
| Reports                   | branch_manager+ (own branch)              | INVENTORY_OPS_ROLES |

---

## UX Decisions (Design Review)

### P0 Must-Resolve Before Code

1. **Stocktake mobile input:** Single-item card mode on phone (new pattern). Ingredient name + unit large, big numeric input, next/previous, progress bar. Desktop: table with inline inputs.

2. **Alert entry point:** Summary cards at top of Tổng Quan page — "3 items hết hạn", "5 items cần đặt hàng". Tappable to filtered list. Replace/augment current InventoryValuePanel.

3. **Navigation:** Add "Kiểm kê" to sub-nav. Keep flat nav + scroll indicators. Total 9 items.

### New UI Patterns Needed

| Pattern                  | Where             | Description                                               |
| ------------------------ | ----------------- | --------------------------------------------------------- |
| Alert summary card       | Tổng Quan top     | Colored card: count + status. Red/yellow/green. Tappable. |
| Session progress tracker | Stocktake         | "15/50 items" linear progress bar                         |
| Single-item input mode   | Stocktake mobile  | Full-screen card, one ingredient at a time                |
| Variance indicator       | Stocktake results | System vs counted, color-coded by threshold               |
| Conditional form field   | GRN temperature   | Show only for cold/frozen storage_type                    |

### Empty States

| Screen             | Message                               | Action                      |
| ------------------ | ------------------------------------- | --------------------------- |
| Expiry alerts      | "Không có hàng sắp hết hạn"           | Green check — success state |
| Below ROP          | "Tồn kho đủ cho tất cả nguyên liệu"   | Green check                 |
| Stocktake list     | "Chưa có phiên kiểm kê nào"           | Button: "Tạo phiên kiểm kê" |
| Stocktake counting | "Bắt đầu đếm từ nguyên liệu đầu tiên" | Auto-focus first input      |

---

## Success Metrics

| Phase | Metric                                          | Target                            |
| ----- | ----------------------------------------------- | --------------------------------- | --- | ---- |
| 0     | Stocktake variance (monthly)                    | <2% by value                      |
| 0     | Reorder alerts → PO created before stockout     | >90%                              |
| 0     | Expiring items caught before serving            | >95%                              |
| 1     | PO quantity accuracy (suggested vs actual need) | >80%                              |
| 1     | Food cost trend visibility                      | Owner can see in <10 seconds      |
| 1     | Invoices overdue visibility (§8)                | 100% — no invoice misses due date |
| 1     | Consumption variance detected (§9)              | Alert when                        | var | > 7% |

---

## Session Summary

| Session | Scope                                                    | Status                                                       |
| ------- | -------------------------------------------------------- | ------------------------------------------------------------ |
| **S1**  | Stocktake migration + RPC                                | ✅                                                           |
| **S2**  | Stocktake UI + Reorder alerts dashboard                  | ✅                                                           |
| **S3**  | Expiry alerts + GRN temperature + write-off              | ✅                                                           |
| **S4**  | Polish + integration test + verify                       | ✅                                                           |
| **S5**  | Auto-suggest PO (actions + UI)                           | ✅ partial — yield_factor chưa có                            |
| **S6**  | Price intelligence (actions + PO detail UI)              | ✅ partial — AP tracking chưa có                             |
| **S7**  | Reports (movement + branch summary + in-transit actions) | ✅ partial — AP aging, consumption var, reports page chưa có |
| **S8**  | §8/§9 completion: yield + AP + reports page + RPC fix    | TODO                                                         |

---

## S8: §8/§9 Completion Session (NEW)

> **Why:** S5-S7 đã ship core features nhưng §8 AP tracking + §9 yield factor + reports UI chưa xong.
> **Estimate:** 1 session

### S8 Scope — Migration

```sql
-- File: supabase/migrations/2026XXXX_m5ext_ap_yield.sql

-- §9: Recipe yield factor
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS yield_factor NUMERIC(5,3) DEFAULT 1.0
  CHECK (yield_factor > 0 AND yield_factor <= 1);
COMMENT ON COLUMN recipes.yield_factor IS 'Yield factor (1.0 = no waste, 0.85 = 15% waste). Gross = quantity / yield_factor.';

-- §8: Supplier payment terms
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS payment_terms TEXT DEFAULT 'COD'
  CHECK (payment_terms IN ('COD', 'NET7', 'NET14', 'NET30'));

-- §8: Invoice payment tracking
ALTER TABLE supplier_invoices ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE supplier_invoices ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid'
  CHECK (payment_status IN ('unpaid', 'partial', 'paid'));
ALTER TABLE supplier_invoices ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE supplier_invoices ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(15,2) DEFAULT 0;

-- §9 CRITICAL: Fix consume_stock_for_order to use yield_factor
-- Must update the RPC to compute gross: quantity / COALESCE(yield_factor, 1.0)
CREATE OR REPLACE FUNCTION public.consume_stock_for_order(p_order_id BIGINT)
-- ... (replace existing RPC, change line:
--   SUM(oi.quantity::numeric * r.quantity) AS need_qty
-- to:
--   SUM(oi.quantity::numeric * r.quantity / COALESCE(r.yield_factor, 1.0)) AS need_qty
-- )
```

### S8 Scope — Server Actions

**New in procurement-actions.ts:**

- `markInvoicePaid(invoiceId, amount, paidAt?)` — update payment_status + paid_at + paid_amount
- `fetchApAging(supplierId?)` — group unpaid invoices by age buckets (current/1-30d/31-60d/61-90d/>90d)

**Update in procurement-actions.ts:**

- `createSupplierInvoice` — auto-compute `due_date` from supplier.payment_terms + invoice_date
- `upsertRecipe` — add yield_factor field (optional, default 1.0)

**New in report-actions.ts:**

- `fetchConsumptionVariance(branchId, periodDays)` — theoretical (orders × recipes × yield) vs actual (stock_movements consumption), variance %, alert threshold

### S8 Scope — UI

- `/admin/inventory/reports/` page — 4 reports dashboard (movement, branch summary, AP aging, consumption variance)
- Add "Báo cáo" to sub-nav
- Supplier invoice list: show payment_status + due_date + overdue highlight
- Recipe form: add yield_factor % input

### S8 Critical Fix

**`consume_stock_for_order` RPC — MUST update when adding yield_factor.**
Current: `SUM(oi.quantity * r.quantity)` — chỉ dùng net quantity.
Need: `SUM(oi.quantity * r.quantity / COALESCE(r.yield_factor, 1.0))` — dùng gross quantity.

Nếu không fix: mỗi order sẽ trừ kho THIẾU so với thực tế bếp dùng → tồn kho hệ thống > thực tế → variance tăng dần.

### S8 Completion Criteria

- [ ] Migration: yield_factor + AP columns + RPC fix
- [ ] Actions: markInvoicePaid, fetchApAging, fetchConsumptionVariance, update createSupplierInvoice, update upsertRecipe
- [ ] UI: Reports page + sub-nav + invoice payment status + recipe yield field
- [ ] `pnpm typecheck && pnpm lint && pnpm build` passes

---

## Open Questions (Answered)

| #   | Question              | Answer (2026-04-09)   |
| --- | --------------------- | --------------------- |
| 1   | Bao nhiêu SKU?        | 30-50                 |
| 2   | Ai đặt hàng, bằng gì? | 1 người, Zalo         |
| 3   | Tần suất kiểm kê?     | Chưa bao giờ          |
| 4   | Biết food cost %?     | Sơ bộ, chưa chính xác |
| 5   | Sự cố ATTP?           | Chưa bao giờ          |

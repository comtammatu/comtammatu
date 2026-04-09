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

| Feature                | Codebase                                 | SOP Doc                          |
| ---------------------- | ---------------------------------------- | -------------------------------- |
| HQ-only procurement    | PO/GRN chỉ tại `is_headquarters=true`    | Kho Trụ sở là điểm nhập duy nhất |
| WAC costing            | `confirm_goods_receipt_note` RPC         | Giá bình quân gia quyền          |
| Transfer state machine | draft→confirmed_ship→in_transit→received | 5 trạng thái                     |
| Transfer directions    | TS↔CN, CN↔CN, block TS↔TS                | Đúng quy định                    |
| 3-Way matching         | PO↔GRN↔Invoice, matching_status          | ±5% SL, ±2% giá                  |
| Auto consumption       | Recipe × order → stock deduction         | Xuất theo recipe khi completed   |
| Append-only movements  | No UPDATE/DELETE on stock_movements      | Audit trail                      |

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

#### S5: Auto-Suggest PO Quantities

- Calculate: avg daily consumption (from `stock_movements` type=`consumption`, last 7/14/30 days) × lead time = suggested order qty
- Factor in current stock: `suggested = max_stock - current_quantity`
- Show on PO creation page: "Gợi ý đặt hàng" panel
- One-click add suggested items to PO draft

#### S6: Price Intelligence

- PO price alert: flag when `unit_price_est` deviates >5% from average of last 3 POs for same ingredient+supplier
- Supplier price history: simple line chart — price per unit over time per ingredient per supplier
- Give owner data for negotiation

#### S7: Reports + In-Transit

- **2 reports only (CEO review — kill the other 4):**
  1. Biến động tồn kho (period-based: opening + receipts + transfers - consumption - adjustments = closing)
  2. Stock movement summary by branch
- In-transit visibility: show transfers at `in_transit` status on stock dashboard
- Transfer note print template (simple PDF)
- Reports on desktop-first (Design review: charts don't work on phone)

---

### Phase 2: Scale When Needed (HOLD — trigger-based)

> Only start when specific trigger fires. Not on roadmap timeline.

| Feature                           | Trigger to start                                 | Sessions |
| --------------------------------- | ------------------------------------------------ | -------- |
| Batch/Lot tracking                | Regulatory requirement OR food safety incident   | 4-6      |
| Purchase Request workflow         | >8 branches with distributed procurement         | 3-4      |
| Supplier performance scoring      | Owner asks for NCC evaluation data               | 1-2      |
| GRN photo upload                  | Staff requests or audit requirement              | 1        |
| Stock states (Reserved/Available) | Concurrent warehouse operations become a problem | 2-3      |

---

## Technical Decisions (Eng Review)

### Migration Safety

| Change                                      | Type            | Safe? | Notes                                                        |
| ------------------------------------------- | --------------- | ----- | ------------------------------------------------------------ |
| `CREATE TABLE stocktake_sessions`           | New table       | Yes   | + GRANT + RLS + partial unique index                         |
| `CREATE TABLE stocktake_lines`              | New table       | Yes   | + GRANT + RLS + UNIQUE(session_id, ingredient_id, tenant_id) |
| `ALTER grn_items ADD receiving_temperature` | Nullable column | Yes   | Non-blocking                                                 |
| `CREATE INDEX idx_grn_items_expiry`         | Partial index   | Yes   | Non-blocking                                                 |

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

| Phase | Metric                                          | Target                       |
| ----- | ----------------------------------------------- | ---------------------------- |
| 0     | Stocktake variance (monthly)                    | <2% by value                 |
| 0     | Reorder alerts → PO created before stockout     | >90%                         |
| 0     | Expiring items caught before serving            | >95%                         |
| 1     | PO quantity accuracy (suggested vs actual need) | >80%                         |
| 1     | Food cost trend visibility                      | Owner can see in <10 seconds |

---

## Session Summary

| Session | Scope                                             | Est.      |
| ------- | ------------------------------------------------- | --------- |
| **S1**  | Stocktake migration + RPC                         | 1 session |
| **S2**  | Stocktake UI + Reorder alerts dashboard           | 1 session |
| **S3**  | Expiry alerts + GRN temperature + write-off       | 1 session |
| **S4**  | Polish + integration test + verify                | 1 session |
| **S5**  | Auto-suggest PO quantities                        | 1 session |
| **S6**  | Price intelligence (alerts + history)             | 1 session |
| **S7**  | Reports (2 reports) + in-transit + transfer print | 1 session |

**Total: 7 sessions** (down from 16-20 in original plan)

---

## Open Questions for Founder

1. **Bao nhiêu SKU thực tế quản lý?** Nếu 30-40 thì auto-suggest PO rất chính xác. Nếu 100+ cần category-based ordering.
2. **Ai đặt hàng NCC hiện tại, bằng gì?** Điện thoại? Zalo? Nếu Zalo → "tạo PO" nên generate Zalo message.
3. **Tần suất kiểm kê hiện tại?** Hàng ngày (hàng tươi)? Hàng tuần? Chưa bao giờ?
4. **Food cost % hiện tại biết không?** Nếu không → feature #1 là connect consumption data với revenue.
5. **Đã có sự cố ATTP cần trace NCC chưa?** Nếu chưa → batch tracking đợi được. Nếu có → promote lên Phase 1.

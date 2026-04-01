# Sprint 2b: Stock + Dashboard + Printer + Audit

> Depends on: Sprint 2a (orders + POS + KDS + payments)
> Enables: Sprint 3 (procurement extends stock)
> Sessions: 5 | Estimate: 4-5 ngày

---

## Goal

Hoàn thiện operations: stock management (ingredients + auto-deduct), dashboard doanh thu cho owner, in bill, audit trail. Sau sprint này, POS flow hoàn chỉnh end-to-end.

---

## Schema

Dùng tables đã define trong Sprint 2a:

- `ingredients`, `recipes`, `stock_levels`, `stock_movements` — stock
- `order_status_history` — order audit trail
- `audit_logs` — general audit
- `printer_configs` — printer management

Xem Sprint 2a (`sprint-2.md`) cho full schema definitions.

---

## Sessions

### S1: Ingredients + Stock Levels

**Migration:** `20260406000000_ingredients_stock.sql`

**Files:**

- `apps/web/app/(admin)/inventory/page.tsx` — ingredient list + stock levels
- `apps/web/app/(admin)/inventory/actions.ts` — CRUD + adjust stock

**Acceptance Criteria:**

- [ ] CRUD ingredients (name, unit, cost_price, min_stock)
- [ ] View stock levels per branch
- [ ] Manual stock adjustment (kiểm kê)
- [ ] Low stock warning (quantity < min_stock)
- [ ] Stock auto-deduct khi order confirmed (trigger từ Sprint 2a S1)
- [ ] Recipes: link menu_item → ingredients + quantity

### S2: Dashboard — Basic Revenue

**Files:**

- `apps/web/app/(admin)/dashboard/page.tsx` — rewrite with real data
- `apps/web/app/(admin)/dashboard/actions.ts` — revenue queries

**Acceptance Criteria:**

- [ ] Doanh thu hôm nay (total completed orders)
- [ ] Số đơn hàng hôm nay
- [ ] Top 5 items bán chạy nhất
- [ ] Doanh thu per branch (cho owner quản lý multi-branch)
- [ ] So sánh vs hôm qua (% change)

### S3: Printer Config + Bill Printing

**Files:**

- `apps/web/app/(admin)/settings/printers/page.tsx`
- `apps/web/app/(admin)/settings/printers/actions.ts`
- `apps/web/app/br/[branchId]/pos/components/receipt-preview.tsx`

**Acceptance Criteria:**

- [ ] CRUD printer configs per branch (receipt, kitchen)
- [ ] Receipt preview (HTML → thermal printer format)
- [ ] Print bill from POS after payment
- [ ] Print KDS ticket (optional — gửi bếp)
- [ ] Include: order number, items, total, VAT, store info from system_settings

### S4: Audit Logging

**Files:**

- `apps/web/lib/audit.ts` — audit helper function

**Acceptance Criteria:**

- [ ] audit_logs table + RLS (owner/super_manager read-only)
- [ ] Trigger hoặc helper function log: create/update/delete on orders, payments, menu_items, stock
- [ ] Audit log viewer in admin (filter by entity, user, date)
- [ ] Log includes: user, action, entity, old/new values

### S5: Integration Test — Full Flow

**Test flow:**

```
Login (cashier) → Mở POS → Chọn bàn → Gọi món → Submit order
  → KDS nhận ticket → Chef bump → Ready → Served
  → Cashier mở payment → VietQR → Confirm
  → Order completed → Stock deducted → Dashboard cập nhật → Bill printed
```

**Acceptance Criteria:**

- [ ] Full flow chạy end-to-end không lỗi
- [ ] Stock deduction chính xác (check ingredients.quantity)
- [ ] Dashboard phản ánh đúng revenue
- [ ] Realtime KDS nhận ticket < 2 giây
- [ ] Bill printable
- [ ] Audit log có records cho order lifecycle
- [ ] `/review` pass
- [ ] `/cso` pass (payment code)

---

## Definition of Done

- [ ] Full order → pay → stock deduct → dashboard → print flow
- [ ] KDS realtime < 2s latency
- [ ] Dashboard hiển thị doanh thu
- [ ] Audit trail cho mọi thao tác quan trọng
- [ ] `pnpm typecheck && pnpm build` pass
- [ ] `/review` + `/cso` pass
- [ ] North Star tested: order → pay < 2 phút

# Sprint 2a: POS + KDS + Payments

> **Module mapping:** M2 (POS) + M3 (KDS) + M4 (Payment) — see `roadmap.md`
> **Follow-up spec:** [M2-Ext: POS Order Lifecycle](m2-order-lifecycle.md) — thêm món / void / cancel sau khi flow sprint này ổn (PLANNED)
> Depends on: M0+M1 (Admin Shell + Menu)
> Sessions: 6 | Estimate: 5-7 ngày
> North Star: "Order → thanh toán — dưới 2 phút"

---

## Goal

Hệ thống bán hàng hoàn chỉnh: waiter gọi món trên POS → KDS hiện real-time → chef bump → cashier thu tiền → stock tự trừ → owner thấy doanh thu. Đây là sprint lớn nhất và quan trọng nhất — nếu flow này smooth, mọi thứ khác build on top.

---

## Schema

### pos_terminals

```sql
CREATE TABLE public.pos_terminals (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  branch_id BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                    -- "POS 1", "Quầy thu ngân"
  type TEXT NOT NULL DEFAULT 'cashier_station'
    CHECK (type IN ('cashier_station', 'mobile_order')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  approved_at TIMESTAMPTZ,              -- NULL = chưa duyệt
  approved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(branch_id, name)
);
```

### pos_sessions

```sql
CREATE TABLE public.pos_sessions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  terminal_id BIGINT NOT NULL REFERENCES public.pos_terminals(id),
  branch_id BIGINT NOT NULL REFERENCES public.branches(id),
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  opened_by UUID NOT NULL REFERENCES auth.users(id),
  closed_by UUID REFERENCES auth.users(id),
  opening_cash NUMERIC(15,2) NOT NULL DEFAULT 0,
  closing_cash NUMERIC(15,2),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'closed')),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  UNIQUE(terminal_id, opened_at)
);
```

### orders

```sql
CREATE TABLE public.orders (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_number TEXT NOT NULL,            -- Auto-generated: "CTM-Q1-0001"
  branch_id BIGINT NOT NULL REFERENCES public.branches(id),
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  table_id BIGINT REFERENCES public.tables(id) ON DELETE SET NULL,
  terminal_id BIGINT NOT NULL REFERENCES public.pos_terminals(id),
  pos_session_id BIGINT REFERENCES public.pos_sessions(id),
  type TEXT NOT NULL DEFAULT 'dine_in'
    CHECK (type IN ('dine_in', 'takeaway')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','confirmed','preparing','ready','served','completed','cancelled')),
  subtotal NUMERIC(15,2) NOT NULL DEFAULT 0,
  discount_total NUMERIC(15,2) NOT NULL DEFAULT 0,
  tax NUMERIC(15,2) NOT NULL DEFAULT 0,
  service_charge NUMERIC(15,2) NOT NULL DEFAULT 0,
  total NUMERIC(15,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  idempotency_key UUID NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_orders_branch_status ON orders(branch_id, status);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);
```

### order_items

```sql
CREATE TABLE public.order_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  menu_item_id BIGINT NOT NULL REFERENCES public.menu_items(id),
  variant_id BIGINT REFERENCES public.menu_item_variants(id),
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  quantity INT NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(15,2) NOT NULL,
  item_total NUMERIC(15,2) NOT NULL,
  modifiers JSONB,                       -- [{id, name, price}]
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent_to_kds','preparing','ready','served','cancelled')),
  kds_station_id BIGINT,
  sent_to_kds_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### payments

```sql
CREATE TABLE public.payments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES public.orders(id),
  pos_session_id BIGINT NOT NULL REFERENCES public.pos_sessions(id),
  terminal_id BIGINT NOT NULL REFERENCES public.pos_terminals(id),
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  method TEXT NOT NULL CHECK (method IN ('cash', 'vietqr', 'momo', 'transfer')),
  provider TEXT,                         -- 'vietcombank', 'momo', null for cash
  amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  tip NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (tip >= 0),
  reference_no TEXT,                     -- Transaction reference
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','completed','failed','refunded')),
  paid_at TIMESTAMPTZ,
  idempotency_key UUID NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### kds_stations

```sql
CREATE TABLE public.kds_stations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  branch_id BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  name TEXT NOT NULL,                    -- "Bếp chính", "Bếp nướng"
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(branch_id, name)
);
```

### kds_station_categories (assigns menu categories to KDS stations)

```sql
CREATE TABLE public.kds_station_categories (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kds_station_id BIGINT NOT NULL REFERENCES public.kds_stations(id) ON DELETE CASCADE,
  category_id BIGINT NOT NULL REFERENCES public.menu_categories(id) ON DELETE CASCADE,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  UNIQUE(kds_station_id, category_id)
);
```

### kds_tickets

```sql
CREATE TABLE public.kds_tickets (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  kds_station_id BIGINT NOT NULL REFERENCES public.kds_stations(id),
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','preparing','ready','served')),
  bumped_at TIMESTAMPTZ,
  bumped_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_kds_tickets_station_status ON kds_tickets(kds_station_id, status);
```

### order_status_history

```sql
CREATE TABLE public.order_status_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by UUID NOT NULL REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_order_status_history_order ON order_status_history(order_id, created_at);
```

### audit_logs

```sql
CREATE TABLE public.audit_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  action TEXT NOT NULL,                  -- 'create', 'update', 'delete', 'cancel'
  entity_type TEXT NOT NULL,             -- 'order', 'menu_item', 'payment', 'stock'
  entity_id BIGINT NOT NULL,
  details JSONB,                         -- Changed fields, old/new values
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id, created_at DESC);
```

### printer_configs

```sql
CREATE TABLE public.printer_configs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  branch_id BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  name TEXT NOT NULL,                    -- "Máy in bill", "Máy in bếp"
  type TEXT NOT NULL CHECK (type IN ('receipt', 'kitchen', 'label')),
  connection_type TEXT NOT NULL CHECK (connection_type IN ('usb', 'network', 'bluetooth')),
  address TEXT,                          -- IP address or device path
  is_active BOOLEAN NOT NULL DEFAULT true,
  settings JSONB DEFAULT '{}'::jsonb,    -- Paper width, encoding, etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(branch_id, name)
);
```

### ingredients

```sql
CREATE TABLE public.ingredients (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  name TEXT NOT NULL,
  unit TEXT NOT NULL,                    -- "kg", "lít", "cái", "gói"
  cost_price NUMERIC(15,2) NOT NULL DEFAULT 0,  -- Weighted avg from GRN
  min_stock NUMERIC(15,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(name, tenant_id)
);
```

### recipes (link menu_item → ingredients)

```sql
CREATE TABLE public.recipes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  menu_item_id BIGINT NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  ingredient_id BIGINT NOT NULL REFERENCES public.ingredients(id),
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  quantity NUMERIC(15,4) NOT NULL CHECK (quantity > 0),  -- Lượng nguyên liệu cần
  UNIQUE(menu_item_id, ingredient_id)
);
```

### stock_levels

```sql
CREATE TABLE public.stock_levels (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ingredient_id BIGINT NOT NULL REFERENCES public.ingredients(id),
  branch_id BIGINT NOT NULL REFERENCES public.branches(id),
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  quantity NUMERIC(15,4) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(ingredient_id, branch_id)
);
```

### stock_movements

```sql
CREATE TABLE public.stock_movements (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ingredient_id BIGINT NOT NULL REFERENCES public.ingredients(id),
  branch_id BIGINT NOT NULL REFERENCES public.branches(id),
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  type TEXT NOT NULL CHECK (type IN ('sale','purchase','adjust','waste','transfer')),
  quantity NUMERIC(15,4) NOT NULL,       -- Negative for deductions
  reference_id BIGINT,                   -- order_id, grn_id, etc.
  reference_type TEXT,                   -- 'order', 'grn', 'adjustment'
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_stock_movements_ingredient ON stock_movements(ingredient_id, created_at DESC);
```

### order_number generation (RPC)

```sql
CREATE OR REPLACE FUNCTION public.generate_order_number(p_branch_id BIGINT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  branch_code TEXT;
  seq_num INT;
BEGIN
  SELECT SUBSTRING(name FROM 1 FOR 2) INTO branch_code
  FROM public.branches WHERE id = p_branch_id;

  SELECT COUNT(*) + 1 INTO seq_num
  FROM public.orders
  WHERE branch_id = p_branch_id
    AND created_at::date = CURRENT_DATE;

  RETURN 'CTM-' || UPPER(branch_code) || '-' || LPAD(seq_num::text, 4, '0');
END;
$$;
```

### stock_deduction trigger (on order confirm)

```sql
CREATE OR REPLACE FUNCTION public.deduct_stock_on_order()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.status = 'confirmed' AND OLD.status = 'draft' THEN
    INSERT INTO public.stock_movements (ingredient_id, branch_id, tenant_id, type, quantity, reference_id, reference_type)
    SELECT r.ingredient_id, NEW.branch_id, NEW.tenant_id, 'sale',
           -(r.quantity * oi.quantity), NEW.id, 'order'
    FROM public.order_items oi
    JOIN public.recipes r ON r.menu_item_id = oi.menu_item_id
    WHERE oi.order_id = NEW.id;

    -- Update stock_levels
    UPDATE public.stock_levels sl
    SET quantity = sl.quantity + sm.total_qty, updated_at = now()
    FROM (
      SELECT ingredient_id, SUM(quantity) as total_qty
      FROM public.stock_movements
      WHERE reference_id = NEW.id AND reference_type = 'order'
      GROUP BY ingredient_id
    ) sm
    WHERE sl.ingredient_id = sm.ingredient_id
      AND sl.branch_id = NEW.branch_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_deduct_stock_on_order
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  WHEN (NEW.status = 'confirmed' AND OLD.status = 'draft')
  EXECUTE FUNCTION public.deduct_stock_on_order();
```

---

## Sessions

### S1: Order Schema + State Machine

**Migration:** `20260405000000_orders_payments.sql`

**State Machine:**

```
                  ┌──────────┐
                  │  draft    │ ← Waiter chọn món
                  └────┬─────┘
                       │ confirm
                  ┌────▼─────┐
                  │confirmed │ ← Stock deducted (trigger)
                  └────┬─────┘
                       │ send_to_kds
                  ┌────▼─────┐
                  │preparing │ ← KDS received
                  └────┬─────┘
                       │ bump
                  ┌────▼─────┐
                  │  ready   │ ← Chef done
                  └────┬─────┘
                       │ serve
                  ┌────▼─────┐
                  │  served  │ ← Waiter delivered
                  └────┬─────┘
                       │ pay
                  ┌────▼─────┐
                  │completed │ ← Payment received
                  └──────────┘

  Any state → cancelled (with reason)
```

**Acceptance Criteria:**

- [ ] Tất cả tables created with RLS + GRANT
- [ ] Order number generation RPC hoạt động
- [ ] Stock deduction trigger hoạt động khi confirm
- [ ] order_status_history trigger: auto-log mọi status change
- [ ] `pnpm db:types` regenerated

### S2: POS — Menu Browse + Cart

**Files:**

- `apps/web/app/br/[branchId]/pos/page.tsx`
- `apps/web/app/br/[branchId]/pos/components/menu-grid.tsx`
- `apps/web/app/br/[branchId]/pos/components/cart.tsx`
- `apps/web/app/br/[branchId]/pos/components/category-tabs.tsx`

**Acceptance Criteria:**

- [ ] Hiển thị menu items theo category (tabs)
- [ ] Click item → add to cart (quantity, variants, modifiers, notes)
- [ ] Cart: edit quantity, remove item, xem total
- [ ] Search items by name
- [ ] Branch-scoped: chỉ hiện items available tại branch

### S3: POS — Table Assignment + Order Submit

**Files:**

- `apps/web/app/br/[branchId]/pos/components/table-picker.tsx`
- `apps/web/app/br/[branchId]/pos/actions.ts` — createOrder, confirmOrder

**Acceptance Criteria:**

- [ ] Chọn bàn (hiện status: available/occupied)
- [ ] Chọn loại: dine_in / takeaway
- [ ] Submit order → tạo order (draft) → confirm → stock deducted
- [ ] Idempotency key prevent double-submit
- [ ] Order number auto-generated

### S4: KDS — Realtime Order Queue

**Files:**

- `apps/web/app/br/[branchId]/kds/page.tsx`
- `apps/web/app/br/[branchId]/kds/components/ticket-board.tsx`
- `apps/web/app/br/[branchId]/kds/components/ticket-card.tsx`

**Tech:** Supabase Realtime `postgres_changes` trên orders + kds_tickets

**Acceptance Criteria:**

- [ ] Realtime board: tickets hiện ngay khi POS submit
- [ ] Tickets grouped by station (nếu có nhiều station)
- [ ] Hiển thị: order number, items, table number, elapsed time
- [ ] Color coding: pending (white) → preparing (yellow) → ready (green)

### S5: KDS — Bump/Complete

**Files:**

- `apps/web/app/br/[branchId]/kds/actions.ts` — bumpTicket, markReady

**Acceptance Criteria:**

- [ ] Chef click ticket → status: preparing
- [ ] Chef click "Xong" → status: ready
- [ ] Ready tickets move to "Sẵn phục vụ" column
- [ ] Realtime update hiện trên tất cả KDS clients
- [ ] Timer hiển thị thời gian chờ (warn nếu > prep_time_min)

### S6: Payments — Cash + VietQR

**Files:**

- `apps/web/app/br/[branchId]/pos/components/payment-dialog.tsx`
- `apps/web/app/br/[branchId]/pos/actions/payment.ts`

**VietQR flow:**

```
Cashier chọn "VietQR" → generate QR code (VietQR API format)
  → Khách scan → chuyển khoản → cashier confirm nhận tiền
  → Payment completed → Order completed
```

**Acceptance Criteria:**

- [ ] Payment dialog: chọn method (cash / vietqr)
- [ ] Cash: nhập số tiền nhận → tính tiền thối
- [ ] VietQR: generate QR image theo chuẩn VietQR
- [ ] Mark payment completed → order status → completed
- [ ] Table status → available (auto-release)
- [ ] POS session tracking: tổng cash in/out

---

## Definition of Done

- [ ] Order state machine: draft → confirmed → preparing → ready → served → completed
- [ ] POS: chọn bàn → gọi món → submit → KDS nhận
- [ ] KDS: realtime < 2s, bump/complete flow
- [ ] Payments: cash + VietQR hoạt động
- [ ] order_status_history tự log mọi status change
- [ ] Tất cả RLS policies đúng
- [ ] `pnpm typecheck && pnpm build` pass
- [ ] `/review` + `/cso` pass

> **Tiếp:** M5 (Stock) + M6 (Finance/Dashboard) → `sprint-2b.md`

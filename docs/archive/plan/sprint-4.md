# Sprint 4: Loyalty + Vouchers (Post-v1.0)

> **Module mapping:** Post-v1.0 (Loyalty/Vouchers) — see `roadmap.md`
> **Note:** CRM core được tách sang Sprint 8. Sprint này chỉ giữ Loyalty/Vouchers thuần túy.
> Depends on: M2 (POS/orders data cho loyalty earn)
> Sessions: 6 | Estimate: 5-6 ngày

---

## Goal

Quản lý khách hàng + chương trình tích điểm. Khách mua hàng → tích điểm → đổi voucher. Tăng retention và repeat purchase.

---

## Schema

### customers

```sql
CREATE TABLE public.customers (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  date_of_birth DATE,
  total_spent NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_orders INT NOT NULL DEFAULT 0,
  loyalty_points INT NOT NULL DEFAULT 0,
  tier_id BIGINT REFERENCES public.loyalty_tiers(id),
  last_order_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(phone, tenant_id)
);
```

### loyalty_tiers

```sql
CREATE TABLE public.loyalty_tiers (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  name TEXT NOT NULL,                    -- "Thành viên", "Bạc", "Vàng", "Kim cương"
  min_points INT NOT NULL DEFAULT 0,     -- Điểm tối thiểu để đạt tier
  earn_multiplier NUMERIC(5,2) NOT NULL DEFAULT 1.0,  -- 1.0x, 1.5x, 2.0x
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(name, tenant_id)
);
```

### loyalty_earn_rules

```sql
CREATE TABLE public.loyalty_earn_rules (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  name TEXT NOT NULL,                    -- "1 điểm per 10,000đ"
  points_per_amount NUMERIC(15,2) NOT NULL,  -- 10000 → 1 điểm per 10k spent
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### loyalty_transactions

```sql
CREATE TABLE public.loyalty_transactions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES public.customers(id),
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  type TEXT NOT NULL CHECK (type IN ('earn','redeem','expire','adjust')),
  points INT NOT NULL,                   -- Positive for earn, negative for redeem
  balance_after INT NOT NULL,
  reference_id BIGINT,                   -- order_id, voucher_id
  reference_type TEXT,                   -- 'order', 'voucher'
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### vouchers

```sql
CREATE TABLE public.vouchers (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('percentage','fixed_amount','free_item')),
  value NUMERIC(15,2) NOT NULL,          -- 10 (%), 20000 (đ), menu_item_id
  min_order_amount NUMERIC(15,2) DEFAULT 0,
  points_required INT DEFAULT 0,         -- 0 = free voucher (campaign)
  max_uses INT,                          -- NULL = unlimited
  used_count INT NOT NULL DEFAULT 0,
  valid_from TIMESTAMPTZ NOT NULL,
  valid_to TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(code, tenant_id)
);
```

### redemptions

```sql
CREATE TABLE public.redemptions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  voucher_id BIGINT NOT NULL REFERENCES public.vouchers(id),
  customer_id BIGINT NOT NULL REFERENCES public.customers(id),
  order_id BIGINT REFERENCES public.orders(id),
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  points_spent INT NOT NULL DEFAULT 0,
  discount_amount NUMERIC(15,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### order_discounts

```sql
CREATE TABLE public.order_discounts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  type TEXT NOT NULL CHECK (type IN ('percentage','fixed_amount','voucher')),
  value NUMERIC(15,2) NOT NULL,          -- 10 (%) or 20000 (đ)
  amount NUMERIC(15,2) NOT NULL,         -- Calculated discount amount
  reason TEXT,                           -- "VIP", "Khuyến mãi", voucher code
  voucher_id BIGINT REFERENCES public.vouchers(id),
  applied_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## Sessions

### S1: Customer Database

**Acceptance Criteria:**

- [ ] CRUD customers (name, phone, email, DOB)
- [ ] Search by phone/name
- [ ] Customer profile: total spent, total orders, loyalty points, tier
- [ ] Link customer to order at POS (optional — tìm by phone)

### S2: Loyalty Tiers + Earn Rules

**Acceptance Criteria:**

- [ ] CRUD loyalty tiers (name, min_points, earn_multiplier)
- [ ] CRUD earn rules (points per amount spent)
- [ ] Auto tier upgrade khi đạt min_points

### S3: Points Accumulation on Orders

**Acceptance Criteria:**

- [ ] Khi order completed + có customer → auto earn points
- [ ] Points = (order.total / earn_rule.points_per_amount) \* tier.earn_multiplier
- [ ] Loyalty transaction log
- [ ] Customer balance updated

### S4: Vouchers + Redemption

**Acceptance Criteria:**

- [ ] CRUD vouchers (code, type, value, validity, points_required)
- [ ] POS: apply voucher code → calculate discount
- [ ] POS: redeem points for voucher
- [ ] Voucher usage tracking (max_uses, used_count)

### S5b: Manual Discounts (order_discounts)

**Acceptance Criteria:**

- [ ] POS: manager can apply % or fixed discount to order
- [ ] Discount reason required
- [ ] order_discounts table records all discounts
- [ ] orders.discount_total updated
- [ ] Audit log entry for every discount applied

### S5: Loyalty Dashboard

**Acceptance Criteria:**

- [ ] Top customers by spending
- [ ] Customer acquisition chart (new customers per week)
- [ ] Loyalty tier distribution
- [ ] Points issued vs redeemed

---

## Definition of Done

- [ ] Customer linked to orders at POS
- [ ] Auto earn points on order completion
- [ ] Voucher apply + redeem flow works
- [ ] Loyalty dashboard shows customer analytics

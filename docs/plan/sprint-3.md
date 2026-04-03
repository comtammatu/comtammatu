# Sprint 3: HĐĐT + Momo + Procurement

> **Module mapping:** M4 (Payment/Momo) + M5 (Stock/Procurement) + M6 (Finance/HĐĐT) — see `roadmap.md`
> Depends on: M2+M3+M4 (POS + KDS + Payment) + M5 (Stock)
> Enables: v1.0.0 Pilot Launch (CTCP compliant)
> Sessions: 7 | Estimate: 6-8 ngày

---

## Goal

CTCP compliance: mỗi giao dịch có hóa đơn điện tử. Momo payment cho khách không có banking app. Procurement flow hoàn chỉnh: PO → GRN → Supplier Invoice → food cost thực tế.

---

## Schema

### tax_invoices

```sql
CREATE TABLE public.tax_invoices (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES public.orders(id),
  branch_id BIGINT NOT NULL REFERENCES public.branches(id),
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  invoice_number TEXT,                   -- Số hóa đơn từ provider
  provider TEXT NOT NULL,                -- 'viettel', 'vnpt', 'bkav'
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','submitted','issued','error','cancelled')),
  buyer_name TEXT,
  buyer_tax_code TEXT,                   -- MST khách (nếu B2B)
  buyer_address TEXT,
  subtotal NUMERIC(15,2) NOT NULL,
  vat_rate NUMERIC(5,2) NOT NULL DEFAULT 8,  -- VAT 8%
  vat_amount NUMERIC(15,2) NOT NULL,
  total NUMERIC(15,2) NOT NULL,
  provider_response JSONB,               -- Raw response from e-invoice provider
  issued_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### payment_webhooks (for Momo IPN)

```sql
CREATE TABLE public.payment_webhooks (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider TEXT NOT NULL,                -- 'momo'
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  signature TEXT NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT false,
  processed BOOLEAN NOT NULL DEFAULT false,
  payment_id BIGINT REFERENCES public.payments(id),
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### refunds

```sql
CREATE TABLE public.refunds (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  payment_id BIGINT NOT NULL REFERENCES public.payments(id),
  order_id BIGINT NOT NULL REFERENCES public.orders(id),
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('cash', 'vietqr', 'momo', 'transfer')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','completed','failed')),
  refunded_by UUID NOT NULL REFERENCES auth.users(id),
  refunded_at TIMESTAMPTZ,
  provider_reference TEXT,               -- Momo refund transaction ID
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### suppliers

```sql
CREATE TABLE public.suppliers (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  name TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  tax_code TEXT,                         -- MST nhà cung cấp (cho HĐĐT đầu vào)
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(name, tenant_id)
);
```

### purchase_orders

```sql
CREATE TABLE public.purchase_orders (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  branch_id BIGINT NOT NULL REFERENCES public.branches(id),
  supplier_id BIGINT REFERENCES public.suppliers(id),
  po_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','partial_received','received','cancelled')),
  total NUMERIC(15,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(po_number, tenant_id)
);
```

### purchase_order_items

```sql
CREATE TABLE public.purchase_order_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  po_id BIGINT NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  ingredient_id BIGINT NOT NULL REFERENCES public.ingredients(id),
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  quantity NUMERIC(15,4) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(15,2) NOT NULL CHECK (unit_price >= 0),
  line_total NUMERIC(15,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### goods_received_notes

```sql
CREATE TABLE public.goods_received_notes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  po_id BIGINT REFERENCES public.purchase_orders(id),
  branch_id BIGINT NOT NULL REFERENCES public.branches(id),
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  supplier_id BIGINT REFERENCES public.suppliers(id),
  grn_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','confirmed','cancelled')),
  total NUMERIC(15,2) NOT NULL DEFAULT 0,
  received_by UUID NOT NULL REFERENCES auth.users(id),
  confirmed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(grn_number, tenant_id)
);
```

### grn_items

```sql
CREATE TABLE public.grn_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  grn_id BIGINT NOT NULL REFERENCES public.goods_received_notes(id) ON DELETE CASCADE,
  ingredient_id BIGINT NOT NULL REFERENCES public.ingredients(id),
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  quantity_ordered NUMERIC(15,4),        -- From PO (reference)
  quantity_received NUMERIC(15,4) NOT NULL CHECK (quantity_received >= 0),
  unit_price NUMERIC(15,2) NOT NULL CHECK (unit_price >= 0),
  line_total NUMERIC(15,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### supplier_invoices

```sql
CREATE TABLE public.supplier_invoices (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  grn_id BIGINT REFERENCES public.goods_received_notes(id),
  po_id BIGINT REFERENCES public.purchase_orders(id),
  supplier_id BIGINT NOT NULL REFERENCES public.suppliers(id),
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  invoice_number TEXT NOT NULL,          -- Số HĐĐT đầu vào
  invoice_date TIMESTAMPTZ NOT NULL,
  subtotal NUMERIC(15,2) NOT NULL,
  vat_rate NUMERIC(5,2) NOT NULL DEFAULT 8,
  vat_amount NUMERIC(15,2) NOT NULL,
  total NUMERIC(15,2) NOT NULL,
  matching_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (matching_status IN ('pending','matched','partial_match','disputed','approved')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(invoice_number, supplier_id)
);
```

### GRN confirmed → auto stock update (RPC)

```sql
-- GRN confirm = Postgres RPC (atomic: stock_movements + stock_levels + cost_price update)
-- KHÔNG dùng trigger vì cần weighted avg cost calculation
CREATE OR REPLACE FUNCTION public.confirm_grn(p_grn_id BIGINT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
  -- 1. Insert stock_movements (type='purchase')
  -- 2. Upsert stock_levels
  -- 3. Update ingredients.cost_price (weighted average)
  -- 4. Update GRN status = 'confirmed'
$$;
```

---

## Sessions

### S1: HĐĐT Schema + Edge Function

**Migration + Edge Function:** `einvoice-submit`

**Flow:**

```
Payment completed → Server Action calls Edge Function
  → Edge Function calls provider API (Viettel/VNPT/BKAV)
  → Store response in tax_invoices
  → Return invoice number to POS
```

**Acceptance Criteria:**

- [ ] tax_invoices table + RLS
- [ ] Edge Function `einvoice-submit` (multi-provider interface)
- [ ] Mock provider cho development
- [ ] Auto-trigger sau payment completed
- [ ] Error handling: provider down → queue retry

### S2: HĐĐT UI + Provider Config

**Files:**

- `apps/web/app/(admin)/finance/invoices/page.tsx` — invoice list
- `apps/web/app/(admin)/settings/einvoice/page.tsx` — provider config

**Acceptance Criteria:**

- [ ] Liệt kê hóa đơn (status, buyer, amount)
- [ ] Retry failed invoices
- [ ] Config provider credentials (per tenant)
- [ ] B2B invoice: nhập MST + tên khách

### S3: Momo Payment

**Files:**

- `apps/web/app/api/webhooks/momo/route.ts` — IPN handler
- `apps/web/app/br/[branchId]/pos/actions/momo.ts`

**Momo flow:**

```
Cashier chọn "Momo" → create payment request (Momo API)
  → QR code hiện cho khách scan
  → Khách thanh toán trên Momo app
  → Momo gửi IPN webhook → verify signature (accessKey!)
  → Update payment status → order completed
```

**Acceptance Criteria:**

- [ ] Momo payment request creation
- [ ] QR code display
- [ ] IPN webhook handler (signature verification — accessKey injection)
- [ ] Payment status update
- [ ] Timeout handling (khách không thanh toán)
- [ ] `/cso` pass (payment + webhook security)

### S4: Suppliers + Purchase Orders

**Migration:** `20260410000000_procurement.sql`

**Files:**

- `apps/web/app/(admin)/inventory/suppliers/page.tsx`
- `apps/web/app/(admin)/inventory/purchase-orders/page.tsx`
- `apps/web/app/(admin)/inventory/purchase-orders/[poId]/page.tsx`

**Acceptance Criteria:**

- [ ] CRUD suppliers
- [ ] Create PO (chọn supplier, thêm items from ingredients)
- [ ] PO status management (draft → submitted → received)
- [ ] PO total auto-calculated

### S5: GRN + Auto Stock Update

**Files:**

- `apps/web/app/(admin)/inventory/grn/page.tsx`
- `apps/web/app/(admin)/inventory/grn/[grnId]/page.tsx`
- `apps/web/app/(admin)/inventory/grn/actions.ts`

**Acceptance Criteria:**

- [ ] Create GRN from PO (pre-fill items)
- [ ] Create GRN without PO (walk-in purchase)
- [ ] Edit quantity_received per item
- [ ] Confirm GRN → RPC: stock_movements + stock_levels + cost_price update
- [ ] GRN confirmed → PO status updated (partial_received / received)
- [ ] Weighted avg cost_price calculation

### S6: Supplier Invoices + 3-Way Matching

**Files:**

- `apps/web/app/(admin)/inventory/invoices/page.tsx`
- `apps/web/app/(admin)/inventory/invoices/actions.ts`

**Acceptance Criteria:**

- [ ] Create supplier invoice (link to GRN + PO)
- [ ] 3-way matching: PO amount ↔ GRN amount ↔ Invoice amount
- [ ] Matching status: matched / partial_match / disputed
- [ ] Approve invoice → eligible for VAT deduction
- [ ] Food cost report: actual cost from GRN (not PO)

### S7: Refunds

**Files:**

- `apps/web/app/br/[branchId]/pos/components/refund-dialog.tsx`
- `apps/web/app/br/[branchId]/pos/actions/refund.ts`
- `apps/web/app/(admin)/orders/[orderId]/page.tsx` — refund history

**Acceptance Criteria:**

- [ ] Cash refund: manager approves → record refund → adjust POS session cash
- [ ] VietQR refund: manual transfer + record reference
- [ ] Momo refund: call Momo refund API → webhook confirm
- [ ] Partial refund (1 item, not full order)
- [ ] Refund reason required
- [ ] Only manager+ can approve refunds
- [ ] Stock reversal on refunded items (optional — configurable)
- [ ] `/cso` pass (refund security)

---

## Definition of Done

- [ ] HĐĐT: mọi payment → auto invoice (hoặc queue nếu provider down)
- [ ] Momo: full payment flow + refund qua webhook
- [ ] Procurement: PO → GRN → Invoice → 3-way match
- [ ] Refunds: cash + VietQR + Momo with audit trail
- [ ] Stock auto-update khi GRN confirmed
- [ ] Food cost = from GRN items (regression: FOOD_COST_FROM_GRN)
- [ ] `/cso` pass (payments + webhooks + e-invoicing + refunds)
- [ ] **>>> v1.0.0 PILOT READY <<<**

# Sprint 7: QR Self-Order

> Depends on: Sprint 2 (POS + orders + payments)
> Sessions: 4 | Estimate: 3-4 ngày
> Delight feature: post-pilot

---

## Goal

Khách scan QR code tại bàn → gọi món trên phone (web, không cần app) → KDS nhận real-time → thanh toán VietQR tại bàn. Giảm tải waiter, tăng tốc order, trải nghiệm khách hàng vượt trội.

---

## Schema

### table_qr_codes

```sql
CREATE TABLE public.table_qr_codes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  table_id BIGINT NOT NULL REFERENCES public.tables(id) ON DELETE CASCADE,
  branch_id BIGINT NOT NULL REFERENCES public.branches(id),
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  qr_token TEXT NOT NULL UNIQUE,         -- Random token → URL
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## Sessions

### S1: QR Code Generation

**URL format:** `https://comtammatu.com/order/{qr_token}`

**Acceptance Criteria:**

- [ ] Generate unique QR token per table
- [ ] QR code image generation (SVG/PNG)
- [ ] Print-friendly QR cards (for table display)
- [ ] Regenerate token (invalidate old QR)
- [ ] Admin UI: manage QR codes per branch/table

### S2: Customer-Facing Menu Page

**Route:** `apps/web/app/order/[token]/page.tsx` (public, no auth)

**Acceptance Criteria:**

- [ ] Validate token → resolve branch + table
- [ ] Display menu (categories, items, variants, modifiers)
- [ ] Item images + prices
- [ ] Responsive mobile-first design
- [ ] Vietnamese UI
- [ ] Invalid/expired token → friendly error

### S3: Self-Order Flow

**Acceptance Criteria:**

- [ ] Add items to cart (quantity, variants, modifiers, notes)
- [ ] Review cart → submit order
- [ ] Order created via same pipeline as POS (orders table)
- [ ] order.type = 'dine_in', order.terminal_id = null (self-order)
- [ ] KDS receives ticket real-time (same as POS orders)
- [ ] Supabase Realtime: customer sees order status updates

### S4: Self-Checkout (VietQR at table)

**Acceptance Criteria:**

- [ ] After order ready/served → customer can pay
- [ ] VietQR code displayed on phone
- [ ] Staff confirms payment received → order completed
- [ ] Table status auto-release
- [ ] Optional: link customer phone → loyalty (Sprint 4)

---

## Definition of Done

- [ ] Full flow: scan QR → browse menu → order → KDS → pay
- [ ] No app install required (web only)
- [ ] Mobile responsive
- [ ] Works alongside POS orders (same KDS queue)
- [ ] Token security: expired/invalid tokens rejected

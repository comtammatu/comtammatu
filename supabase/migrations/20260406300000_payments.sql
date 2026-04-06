-- =============================================================
-- M4 Payment: payments table
-- Supports cash, VietQR, MoMo. Partial unique on order_id
-- to allow retry after failed payment.
-- =============================================================

CREATE TABLE public.payments (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id     BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id     BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  order_id      BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  method        TEXT NOT NULL CHECK (method IN ('cash', 'vietqr', 'momo')),
  amount        NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  provider_ref  TEXT,
  provider_data JSONB,
  paid_at       TIMESTAMPTZ,
  created_by    UUID NOT NULL REFERENCES public.profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partial unique: only one non-failed payment per order
CREATE UNIQUE INDEX idx_payments_order_active
  ON public.payments(order_id)
  WHERE status != 'failed';

-- Auto-update updated_at
CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Indexes
CREATE INDEX idx_payments_tenant ON public.payments(tenant_id);
CREATE INDEX idx_payments_branch ON public.payments(branch_id);
CREATE INDEX idx_payments_order ON public.payments(order_id);
CREATE INDEX idx_payments_status ON public.payments(branch_id, status);
CREATE INDEX idx_payments_method ON public.payments(branch_id, method);

-- RLS
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payments_select" ON public.payments
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

CREATE POLICY "payments_insert" ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (
      public.auth_role() IN ('owner', 'super_manager', 'area_manager')
      OR (public.auth_role() IN ('branch_manager', 'cashier', 'waiter')
          AND branch_id = public.auth_branch_id())
    )
  );

CREATE POLICY "payments_update" ON public.payments
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.auth_role() IN ('owner', 'super_manager', 'area_manager')
      OR (public.auth_role() IN ('branch_manager', 'cashier', 'waiter')
          AND branch_id = public.auth_branch_id())
    )
  );

-- No DELETE — payments are permanent business records
GRANT SELECT, INSERT, UPDATE ON TABLE public.payments TO authenticated;


-- =============================================================
-- Update orders: add payment_method + payment_status columns
-- for quick POS display without joining payments table
-- =============================================================

ALTER TABLE public.orders
  ADD COLUMN payment_method TEXT,
  ADD COLUMN payment_status TEXT DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'pending', 'paid'));

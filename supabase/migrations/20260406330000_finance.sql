-- =============================================================
-- M6 Finance MVP: tax_invoices + materialized views
-- HĐĐT via MISA meInvoice API. Revenue dashboard.
-- =============================================================

-- ─── tax_invoices ───

CREATE TABLE public.tax_invoices (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id       BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  order_id        BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  invoice_number  TEXT,
  status          TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'signing', 'submitted', 'issued', 'cancelled', 'replaced')),
  buyer_name      TEXT,
  buyer_tax_code  TEXT,
  buyer_address   TEXT,
  subtotal        NUMERIC(15,2) NOT NULL,
  vat_rate        NUMERIC(5,2) NOT NULL DEFAULT 8.00,
  vat_amount      NUMERIC(15,2) NOT NULL,
  total_amount    NUMERIC(15,2) NOT NULL,
  provider        TEXT NOT NULL DEFAULT 'misa',
  provider_ref    TEXT,
  provider_data   JSONB,
  issued_at       TIMESTAMPTZ,
  cancelled_at    TIMESTAMPTZ,
  replaced_by     BIGINT REFERENCES public.tax_invoices(id),
  created_by      UUID NOT NULL REFERENCES public.profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_tax_invoices_updated_at
  BEFORE UPDATE ON public.tax_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX idx_tax_invoices_tenant ON public.tax_invoices(tenant_id);
CREATE INDEX idx_tax_invoices_branch ON public.tax_invoices(branch_id);
CREATE INDEX idx_tax_invoices_order ON public.tax_invoices(order_id);
CREATE INDEX idx_tax_invoices_status ON public.tax_invoices(tenant_id, status);

ALTER TABLE public.tax_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tax_invoices_select" ON public.tax_invoices
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager', 'cashier', 'waiter')
  );

CREATE POLICY "tax_invoices_insert" ON public.tax_invoices
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (
      public.auth_role() IN ('owner', 'super_manager', 'area_manager')
      OR (public.auth_role() IN ('branch_manager', 'cashier', 'waiter')
          AND branch_id = public.auth_branch_id())
    )
  );

CREATE POLICY "tax_invoices_update" ON public.tax_invoices
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager')
  );

-- No DELETE — tax invoices are legal records
GRANT SELECT, INSERT, UPDATE ON TABLE public.tax_invoices TO authenticated;


-- ─── Materialized Views: Revenue Dashboard ───

CREATE MATERIALIZED VIEW public.mv_daily_revenue AS
SELECT
  o.created_at::date AS date,
  o.branch_id,
  o.tenant_id,
  COUNT(*) AS order_count,
  SUM(o.total_amount) FILTER (WHERE o.status NOT IN ('cancelled')) AS total_revenue,
  SUM(o.tax_amount) FILTER (WHERE o.status NOT IN ('cancelled')) AS total_tax,
  SUM(o.total_amount) FILTER (WHERE o.status NOT IN ('cancelled') AND o.payment_method = 'cash') AS cash_revenue,
  SUM(o.total_amount) FILTER (WHERE o.status NOT IN ('cancelled') AND o.payment_method = 'vietqr') AS vietqr_revenue,
  SUM(o.total_amount) FILTER (WHERE o.status NOT IN ('cancelled') AND o.payment_method = 'momo') AS momo_revenue
FROM public.orders o
GROUP BY o.created_at::date, o.branch_id, o.tenant_id;

CREATE UNIQUE INDEX idx_mv_daily_revenue_pk
  ON public.mv_daily_revenue(date, branch_id, tenant_id);

GRANT SELECT ON public.mv_daily_revenue TO authenticated;


CREATE MATERIALIZED VIEW public.mv_top_items AS
SELECT
  date_trunc('week', o.created_at)::date AS period_start,
  (date_trunc('week', o.created_at) + interval '6 days')::date AS period_end,
  o.branch_id,
  o.tenant_id,
  oi.menu_item_id,
  oi.item_name,
  SUM(oi.quantity) AS quantity_sold,
  SUM(oi.subtotal) AS revenue
FROM public.order_items oi
JOIN public.orders o ON oi.order_id = o.id
WHERE o.status NOT IN ('cancelled')
  AND oi.status NOT IN ('cancelled')
GROUP BY period_start, period_end, o.branch_id, o.tenant_id, oi.menu_item_id, oi.item_name;

CREATE UNIQUE INDEX idx_mv_top_items_pk
  ON public.mv_top_items(period_start, branch_id, tenant_id, menu_item_id);

GRANT SELECT ON public.mv_top_items TO authenticated;

-- =========================================================================
-- Operating expense ledger (sổ chi phí đơn — D028 / blueprint P0-2)
--
-- Single-entry operating-expense capture for the HKD: rent, utilities, gas,
-- interim salary, manual COGS, etc. This is NOT a general ledger (D020 retired
-- the enterprise GL). Supplier costs stay in supplier_invoices; this table is
-- for operating spend outside procurement.
--
-- Permission keys finance:expense_create / finance:expense_approve already
-- exist in the catalog (verified on prod) — no backfill. v1 is owner-only:
-- finance:expense_create is granted to the owner role template; branch
-- managers do not hold it.
-- =========================================================================

-- ─── 1. Table ───────────────────────────────────────────────────────────

CREATE TABLE public.expenses (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id       BIGINT REFERENCES public.branches(id) ON DELETE SET NULL,

  expense_date    DATE NOT NULL,
  category        TEXT NOT NULL,
  amount          NUMERIC(14,2) NOT NULL,
  payment_method  TEXT NOT NULL DEFAULT 'cash',
  paid_at         TIMESTAMPTZ,
  vendor_name     TEXT,
  note            TEXT,

  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT expenses_amount_positive_check CHECK (amount > 0),
  CONSTRAINT expenses_category_check CHECK (
    category = ANY (ARRAY[
      'rent', 'utilities', 'gas_fuel', 'salary', 'cogs_manual',
      'supplies', 'repair', 'marketing', 'fees_tax', 'other'
    ])
  ),
  CONSTRAINT expenses_payment_method_check CHECK (
    payment_method = ANY (ARRAY['cash', 'transfer', 'unpaid'])
  ),
  CONSTRAINT expenses_paid_at_unpaid_check CHECK (
    payment_method <> 'unpaid' OR paid_at IS NULL
  ),
  CONSTRAINT expenses_vendor_name_length_check CHECK (
    vendor_name IS NULL OR char_length(vendor_name) <= 200
  ),
  CONSTRAINT expenses_note_length_check CHECK (
    note IS NULL OR char_length(note) <= 500
  )
);

CREATE INDEX idx_expenses_tenant_date
  ON public.expenses(tenant_id, expense_date);

CREATE INDEX idx_expenses_tenant_branch_date
  ON public.expenses(tenant_id, branch_id, expense_date);

CREATE INDEX idx_expenses_tenant_category_date
  ON public.expenses(tenant_id, category, expense_date);

CREATE TRIGGER trg_expenses_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- ─── 2. RLS + Data API grants ───────────────────────────────────────────
-- Reads: any finance viewer (the cockpit sums this for operating expense).
-- Writes: finance:expense_create holders only (owner in v1). Branch scope is
-- carried on the row; v1 owner-only so has_permission_any is sufficient,
-- mirroring the retired journal_entries policy shape.

CREATE POLICY expenses_select ON public.expenses
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('finance:view')
  );

CREATE POLICY expenses_insert ON public.expenses
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('finance:expense_create')
  );

CREATE POLICY expenses_update ON public.expenses
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('finance:expense_create')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('finance:expense_create')
  );

CREATE POLICY expenses_delete ON public.expenses
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('finance:expense_create')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.expenses TO authenticated;
GRANT ALL ON TABLE public.expenses TO service_role;
GRANT ALL ON SEQUENCE public.expenses_id_seq TO service_role;

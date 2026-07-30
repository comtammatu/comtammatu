-- Append-only inventory valuation subledger for moving-WAC cost settlement.

DROP MATERIALIZED VIEW public.mv_inventory_value_ranking;
DROP MATERIALIZED VIEW public.mv_inventory_stock_current;

ALTER TABLE public.stock_levels
  ALTER COLUMN avg_unit_cost TYPE numeric(24,8)
  USING avg_unit_cost::numeric(24,8);

CREATE MATERIALIZED VIEW public.mv_inventory_stock_current AS
SELECT
  stock.tenant_id,
  stock.branch_id,
  stock.location_id,
  location.name AS location_name,
  location.location_kind,
  stock.ingredient_id,
  ingredient.name AS ingredient_name,
  ingredient.category AS ingredient_category,
  ingredient.is_active AS ingredient_is_active,
  ingredient.item_kind,
  stock.current_quantity,
  stock.avg_unit_cost,
  (stock.current_quantity * coalesce(stock.avg_unit_cost, 0))::numeric(20,2)
    AS stock_value,
  ingredient.reorder_point,
  ingredient.min_stock_level,
  ingredient.max_stock_level,
  ingredient.shelf_life_days,
  stock.updated_at,
  stock.last_counted_at
FROM public.stock_levels AS stock
JOIN public.inventory_locations AS location
  ON location.id = stock.location_id
JOIN public.ingredients AS ingredient
  ON ingredient.id = stock.ingredient_id
WHERE location.is_active = TRUE
  AND ingredient.is_active = TRUE
WITH DATA;

CREATE UNIQUE INDEX uq_mv_inv_stock_current
  ON public.mv_inventory_stock_current (
    tenant_id,
    branch_id,
    location_id,
    ingredient_id
  );
CREATE INDEX idx_mv_inv_stock_alerts
  ON public.mv_inventory_stock_current (branch_id, location_id)
  WHERE reorder_point IS NOT NULL;
GRANT ALL ON public.mv_inventory_stock_current TO service_role;

CREATE MATERIALIZED VIEW public.mv_inventory_value_ranking AS
SELECT
  stock.tenant_id,
  stock.branch_id,
  stock.ingredient_id,
  pg_catalog.sum(stock.stock_value) AS total_value
FROM public.mv_inventory_stock_current AS stock
GROUP BY stock.tenant_id, stock.branch_id, stock.ingredient_id
WITH DATA;
CREATE UNIQUE INDEX uq_mv_inv_value_ranking
  ON public.mv_inventory_value_ranking (
    tenant_id,
    branch_id,
    ingredient_id
  );
GRANT ALL ON public.mv_inventory_value_ranking TO service_role;

ALTER TABLE public.stock_movements
  ALTER COLUMN unit_cost TYPE numeric(24,8)
  USING unit_cost::numeric(24,8),
  ADD COLUMN IF NOT EXISTS grn_item_id bigint
    REFERENCES public.grn_items(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS stock_movements_grn_item_idx
  ON public.stock_movements (tenant_id, grn_item_id)
  WHERE grn_item_id IS NOT NULL;

ALTER TABLE public.supplier_invoice_receipt_allocations
  ADD COLUMN IF NOT EXISTS grn_item_id bigint
    REFERENCES public.grn_items(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS confirmed_net_inventory_amount numeric(20,2),
  ADD COLUMN IF NOT EXISTS valuation_event_id bigint,
  ADD COLUMN IF NOT EXISTS valuation_status text NOT NULL DEFAULT 'pending',
  DROP CONSTRAINT IF EXISTS supplier_invoice_receipt_allocations_valuation_status_check,
  ADD CONSTRAINT supplier_invoice_receipt_allocations_valuation_status_check
    CHECK (
      valuation_status IN (
        'pending',
        'not_applicable',
        'settled',
        'settled_current_period'
      )
    ),
  DROP CONSTRAINT IF EXISTS supplier_invoice_receipt_allocations_confirmed_net_check,
  ADD CONSTRAINT supplier_invoice_receipt_allocations_confirmed_net_check
    CHECK (
      confirmed_net_inventory_amount IS NULL
      OR confirmed_net_inventory_amount >= 0
    );

WITH allocation_candidates AS (
  SELECT
    allocation.id AS allocation_id,
    pg_catalog.min(item.id) AS grn_item_id,
    pg_catalog.count(*) AS candidate_count
  FROM public.supplier_invoice_receipt_allocations AS allocation
  JOIN public.grn_items AS item
    ON item.tenant_id = allocation.tenant_id
   AND item.grn_id = allocation.grn_id
   AND item.purchase_order_item_id IS NOT DISTINCT FROM
     allocation.purchase_order_item_id
  WHERE allocation.grn_item_id IS NULL
  GROUP BY allocation.id
)
UPDATE public.supplier_invoice_receipt_allocations AS allocation
SET grn_item_id = candidate.grn_item_id
FROM allocation_candidates AS candidate
WHERE allocation.id = candidate.allocation_id
  AND candidate.candidate_count = 1;

ALTER TABLE public.supplier_ingredient_price_history
  ADD COLUMN IF NOT EXISTS effective_net_unit_price numeric(24,8);

UPDATE public.supplier_ingredient_price_history
SET effective_net_unit_price = unit_price
WHERE effective_net_unit_price IS NULL;

ALTER TABLE public.supplier_ingredient_price_history
  ALTER COLUMN effective_net_unit_price SET NOT NULL;

ALTER TABLE public.inventory_locations
  ADD CONSTRAINT inventory_locations_id_tenant_unique
  UNIQUE (id, tenant_id);

CREATE TABLE public.inventory_valuation_settings (
  tenant_id bigint PRIMARY KEY
    REFERENCES public.tenants(id) ON DELETE CASCADE,
  variance_warning_percent numeric(7,4) NOT NULL DEFAULT 10
    CHECK (variance_warning_percent >= 0),
  variance_warning_amount numeric(20,2) NOT NULL DEFAULT 500000
    CHECK (variance_warning_amount >= 0),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

CREATE TABLE public.inventory_valuation_cutovers (
  tenant_id bigint PRIMARY KEY
    REFERENCES public.tenants(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'inactive'
    CHECK (status IN ('inactive', 'shadow', 'active')),
  cutoff_at timestamptz,
  prepared_at timestamptz,
  prepared_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  activated_at timestamptz,
  activated_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  opening_quantity numeric(20,3) NOT NULL DEFAULT 0,
  opening_value numeric(20,2) NOT NULL DEFAULT 0,
  reconciliation_hash text,
  idempotency_key uuid,
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE TABLE public.inventory_valuation_accounts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL
    REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id bigint NOT NULL,
  location_id bigint NOT NULL,
  ingredient_id bigint NOT NULL,
  quantity numeric(20,3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  book_value numeric(20,2) NOT NULL DEFAULT 0 CHECK (book_value >= 0),
  valuation_version bigint NOT NULL DEFAULT 0 CHECK (valuation_version >= 0),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  UNIQUE (id, tenant_id),
  UNIQUE (tenant_id, branch_id, location_id, ingredient_id),
  FOREIGN KEY (branch_id, tenant_id)
    REFERENCES public.branches(id, tenant_id) ON DELETE CASCADE,
  FOREIGN KEY (location_id, tenant_id)
    REFERENCES public.inventory_locations(id, tenant_id) ON DELETE CASCADE,
  FOREIGN KEY (ingredient_id, tenant_id)
    REFERENCES public.ingredients(id, tenant_id) ON DELETE RESTRICT
);

CREATE TABLE public.inventory_cost_origins (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL
    REFERENCES public.tenants(id) ON DELETE CASCADE,
  ingredient_id bigint NOT NULL,
  source_kind text NOT NULL
    CHECK (
      source_kind IN (
        'opening',
        'grn_receipt',
        'stocktake_found',
        'production_output'
      )
    ),
  source_id bigint NOT NULL,
  grn_item_id bigint REFERENCES public.grn_items(id) ON DELETE RESTRICT,
  original_quantity numeric(20,3) NOT NULL CHECK (original_quantity >= 0),
  provisional_value numeric(20,2) NOT NULL CHECK (provisional_value >= 0),
  finalized_quantity numeric(20,3) NOT NULL DEFAULT 0
    CHECK (finalized_quantity >= 0),
  finalized_value numeric(20,2) NOT NULL DEFAULT 0
    CHECK (finalized_value >= 0),
  cost_status text NOT NULL DEFAULT 'provisional'
    CHECK (cost_status IN ('pending', 'provisional', 'partial', 'finalized')),
  effective_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  UNIQUE (id, tenant_id),
  UNIQUE (tenant_id, source_kind, source_id),
  FOREIGN KEY (ingredient_id, tenant_id)
    REFERENCES public.ingredients(id, tenant_id) ON DELETE RESTRICT,
  CHECK (finalized_quantity <= original_quantity)
);

CREATE TABLE public.inventory_origin_balances (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL
    REFERENCES public.tenants(id) ON DELETE CASCADE,
  origin_id bigint NOT NULL,
  holder_kind text NOT NULL
    CHECK (holder_kind IN ('stock_pool', 'transfer_item', 'production_run')),
  valuation_account_id bigint,
  holder_id bigint,
  quantity numeric(20,3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  book_value numeric(20,2) NOT NULL DEFAULT 0 CHECK (book_value >= 0),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  UNIQUE (id, tenant_id),
  UNIQUE (
    tenant_id,
    origin_id,
    holder_kind,
    valuation_account_id,
    holder_id
  ),
  FOREIGN KEY (origin_id, tenant_id)
    REFERENCES public.inventory_cost_origins(id, tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (valuation_account_id, tenant_id)
    REFERENCES public.inventory_valuation_accounts(id, tenant_id)
    ON DELETE RESTRICT,
  CHECK (
    (
      holder_kind = 'stock_pool'
      AND valuation_account_id IS NOT NULL
      AND holder_id IS NULL
    )
    OR (
      holder_kind IN ('transfer_item', 'production_run')
      AND valuation_account_id IS NULL
      AND holder_id IS NOT NULL
    )
  )
);

CREATE TABLE public.inventory_valuation_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL
    REFERENCES public.tenants(id) ON DELETE CASCADE,
  ingredient_id bigint NOT NULL,
  event_type text NOT NULL
    CHECK (
      event_type IN (
        'opening',
        'receipt',
        'issue',
        'issue_restore',
        'transfer_out',
        'transfer_in',
        'transfer_loss',
        'production_input',
        'production_output',
        'stocktake_gain',
        'stocktake_loss',
        'supplier_return',
        'invoice_reprice',
        'credit_reprice',
        'rounding'
      )
    ),
  terminal_bucket text
    CHECK (
      terminal_bucket IS NULL
      OR terminal_bucket IN (
        'food_cost',
        'waste',
        'stocktake_loss',
        'transfer_loss',
        'supplier_return',
        'legacy_purchase_price_variance',
        'rounding'
      )
    ),
  stock_movement_id bigint
    REFERENCES public.stock_movements(id) ON DELETE RESTRICT,
  source_invoice_id bigint
    REFERENCES public.supplier_invoices(id) ON DELETE RESTRICT,
  source_invoice_line_id bigint
    REFERENCES public.supplier_invoice_lines(id) ON DELETE RESTRICT,
  grn_item_id bigint REFERENCES public.grn_items(id) ON DELETE RESTRICT,
  from_account_id bigint,
  to_account_id bigint,
  quantity_delta numeric(20,3) NOT NULL DEFAULT 0,
  value_delta numeric(20,2) NOT NULL DEFAULT 0,
  effective_at timestamptz NOT NULL,
  posted_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  posting_year integer NOT NULL,
  posting_month integer NOT NULL CHECK (posting_month BETWEEN 1 AND 12),
  reversal_of_event_id bigint
    REFERENCES public.inventory_valuation_events(id) ON DELETE RESTRICT,
  idempotency_key uuid NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  UNIQUE (id, tenant_id),
  UNIQUE (tenant_id, idempotency_key),
  FOREIGN KEY (ingredient_id, tenant_id)
    REFERENCES public.ingredients(id, tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (from_account_id, tenant_id)
    REFERENCES public.inventory_valuation_accounts(id, tenant_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (to_account_id, tenant_id)
    REFERENCES public.inventory_valuation_accounts(id, tenant_id)
    ON DELETE RESTRICT,
  CHECK (reversal_of_event_id IS NULL OR event_type IN ('credit_reprice', 'rounding'))
);

ALTER TABLE public.supplier_invoice_receipt_allocations
  ADD CONSTRAINT supplier_invoice_receipt_allocations_valuation_event_fkey
  FOREIGN KEY (valuation_event_id)
  REFERENCES public.inventory_valuation_events(id) ON DELETE RESTRICT;

CREATE TABLE public.inventory_value_allocations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL
    REFERENCES public.tenants(id) ON DELETE CASCADE,
  valuation_event_id bigint NOT NULL,
  source_origin_id bigint,
  derived_origin_id bigint,
  from_balance_id bigint,
  to_balance_id bigint,
  allocation_bucket text NOT NULL DEFAULT 'inventory'
    CHECK (
      allocation_bucket IN (
        'inventory',
        'production_inventory',
        'transfer_holder',
        'food_cost',
        'waste',
        'stocktake_loss',
        'transfer_loss',
        'supplier_return',
        'legacy_purchase_price_variance',
        'rounding'
      )
    ),
  allocated_quantity numeric(20,3) NOT NULL DEFAULT 0,
  allocated_value numeric(20,2) NOT NULL DEFAULT 0,
  allocation_fraction numeric(24,12)
    CHECK (
      allocation_fraction IS NULL
      OR allocation_fraction BETWEEN 0 AND 1
    ),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  UNIQUE (id, tenant_id),
  UNIQUE (
    tenant_id,
    valuation_event_id,
    source_origin_id,
    derived_origin_id,
    from_balance_id,
    to_balance_id
  ),
  FOREIGN KEY (valuation_event_id, tenant_id)
    REFERENCES public.inventory_valuation_events(id, tenant_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (source_origin_id, tenant_id)
    REFERENCES public.inventory_cost_origins(id, tenant_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (derived_origin_id, tenant_id)
    REFERENCES public.inventory_cost_origins(id, tenant_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (from_balance_id, tenant_id)
    REFERENCES public.inventory_origin_balances(id, tenant_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (to_balance_id, tenant_id)
    REFERENCES public.inventory_origin_balances(id, tenant_id)
    ON DELETE RESTRICT,
  CHECK (derived_origin_id IS NULL OR derived_origin_id <> source_origin_id),
  CHECK (
    source_origin_id IS NOT NULL
    OR allocation_bucket IN ('legacy_purchase_price_variance', 'rounding')
  )
);

CREATE INDEX inventory_valuation_events_period_idx
  ON public.inventory_valuation_events (
    tenant_id,
    posting_year,
    posting_month,
    event_type
  );

CREATE INDEX inventory_valuation_events_invoice_idx
  ON public.inventory_valuation_events (tenant_id, source_invoice_id)
  WHERE source_invoice_id IS NOT NULL;

CREATE INDEX inventory_value_allocations_source_idx
  ON public.inventory_value_allocations (tenant_id, source_origin_id);

CREATE INDEX inventory_value_allocations_derived_idx
  ON public.inventory_value_allocations (tenant_id, derived_origin_id)
  WHERE derived_origin_id IS NOT NULL;

CREATE UNIQUE INDEX inventory_origin_balances_stock_pool_uidx
  ON public.inventory_origin_balances (
    tenant_id,
    origin_id,
    valuation_account_id
  )
  WHERE holder_kind = 'stock_pool';

CREATE UNIQUE INDEX inventory_origin_balances_holder_uidx
  ON public.inventory_origin_balances (
    tenant_id,
    origin_id,
    holder_kind,
    holder_id
  )
  WHERE holder_kind IN ('transfer_item', 'production_run');

CREATE OR REPLACE FUNCTION private.prevent_inventory_valuation_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  RAISE EXCEPTION 'inventory_valuation_ledger_is_append_only'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER inventory_valuation_events_immutable
BEFORE UPDATE OR DELETE ON public.inventory_valuation_events
FOR EACH ROW
EXECUTE FUNCTION private.prevent_inventory_valuation_ledger_mutation();

CREATE TRIGGER inventory_value_allocations_immutable
BEFORE UPDATE OR DELETE ON public.inventory_value_allocations
FOR EACH ROW
EXECUTE FUNCTION private.prevent_inventory_valuation_ledger_mutation();

CREATE OR REPLACE FUNCTION private.inventory_valuation_mode(p_tenant_id bigint)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT coalesce(
    (
      SELECT cutover.status
      FROM public.inventory_valuation_cutovers AS cutover
      WHERE cutover.tenant_id = p_tenant_id
    ),
    'inactive'
  );
$$;

CREATE OR REPLACE FUNCTION private.lock_inventory_valuation_pool(
  p_tenant_id bigint,
  p_branch_id bigint,
  p_location_id bigint,
  p_ingredient_id bigint
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'inventory-valuation:'
        || p_tenant_id::text || ':'
        || p_branch_id::text || ':'
        || p_location_id::text || ':'
        || p_ingredient_id::text,
      0
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_inventory_valuation_reconciliation(
  p_year integer,
  p_month integer,
  p_branch_id bigint DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_quantity_mismatches integer;
  v_value_mismatches integer;
  v_origin_mismatches integer;
  v_total_quantity numeric(20,3);
  v_total_value numeric(20,2);
BEGIN
  IF v_tenant IS NULL OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission_any('inventory:valuation_read') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_year < 2000 OR p_month NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'inventory_valuation_period_invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    pg_catalog.count(*) FILTER (
      WHERE account.quantity IS DISTINCT FROM stock.current_quantity
    ),
    coalesce(pg_catalog.sum(account.quantity), 0),
    coalesce(pg_catalog.sum(account.book_value), 0)
  INTO v_quantity_mismatches, v_total_quantity, v_total_value
  FROM public.inventory_valuation_accounts AS account
  FULL JOIN public.stock_levels AS stock
    ON stock.tenant_id = account.tenant_id
   AND stock.branch_id = account.branch_id
   AND stock.location_id = account.location_id
   AND stock.ingredient_id = account.ingredient_id
  WHERE coalesce(account.tenant_id, stock.tenant_id) = v_tenant
    AND (
      p_branch_id IS NULL
      OR coalesce(account.branch_id, stock.branch_id) = p_branch_id
    );

  SELECT pg_catalog.count(*)
  INTO v_value_mismatches
  FROM public.inventory_valuation_accounts AS account
  LEFT JOIN LATERAL (
    SELECT coalesce(pg_catalog.sum(balance.book_value), 0) AS value
    FROM public.inventory_origin_balances AS balance
    WHERE balance.tenant_id = account.tenant_id
      AND balance.valuation_account_id = account.id
      AND balance.holder_kind = 'stock_pool'
  ) AS origin_value ON TRUE
  WHERE account.tenant_id = v_tenant
    AND (p_branch_id IS NULL OR account.branch_id = p_branch_id)
    AND account.book_value IS DISTINCT FROM origin_value.value;

  SELECT pg_catalog.count(*)
  INTO v_origin_mismatches
  FROM public.inventory_valuation_accounts AS account
  LEFT JOIN LATERAL (
    SELECT coalesce(pg_catalog.sum(balance.quantity), 0) AS quantity
    FROM public.inventory_origin_balances AS balance
    WHERE balance.tenant_id = account.tenant_id
      AND balance.valuation_account_id = account.id
      AND balance.holder_kind = 'stock_pool'
  ) AS origin_quantity ON TRUE
  WHERE account.tenant_id = v_tenant
    AND (p_branch_id IS NULL OR account.branch_id = p_branch_id)
    AND account.quantity IS DISTINCT FROM origin_quantity.quantity;

  RETURN pg_catalog.jsonb_build_object(
    'year', p_year,
    'month', p_month,
    'branch_id', p_branch_id,
    'quantity_mismatches', v_quantity_mismatches,
    'value_mismatches', v_value_mismatches,
    'origin_mismatches', v_origin_mismatches,
    'total_quantity', v_total_quantity,
    'total_value', v_total_value,
    'is_reconciled',
      v_quantity_mismatches = 0
      AND v_value_mismatches = 0
      AND v_origin_mismatches = 0
  );
END;
$$;

ALTER TABLE public.inventory_valuation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_valuation_cutovers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_valuation_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_cost_origins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_origin_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_valuation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_value_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY inventory_valuation_settings_read
ON public.inventory_valuation_settings
FOR SELECT TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND public.has_permission_any('inventory:valuation_read')
);

CREATE POLICY inventory_valuation_cutovers_read
ON public.inventory_valuation_cutovers
FOR SELECT TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND public.has_permission_any('inventory:valuation_read')
);

CREATE POLICY inventory_valuation_accounts_read
ON public.inventory_valuation_accounts
FOR SELECT TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND public.has_permission_any('inventory:valuation_read')
);

CREATE POLICY inventory_cost_origins_read
ON public.inventory_cost_origins
FOR SELECT TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND public.has_permission_any('inventory:valuation_read')
);

CREATE POLICY inventory_origin_balances_read
ON public.inventory_origin_balances
FOR SELECT TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND public.has_permission_any('inventory:valuation_read')
);

CREATE POLICY inventory_valuation_events_read
ON public.inventory_valuation_events
FOR SELECT TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND public.has_permission_any('inventory:valuation_read')
);

CREATE POLICY inventory_value_allocations_read
ON public.inventory_value_allocations
FOR SELECT TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND public.has_permission_any('inventory:valuation_read')
);

REVOKE ALL ON TABLE
  public.inventory_valuation_settings,
  public.inventory_valuation_cutovers,
  public.inventory_valuation_accounts,
  public.inventory_cost_origins,
  public.inventory_origin_balances,
  public.inventory_valuation_events,
  public.inventory_value_allocations
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE
  public.inventory_valuation_settings,
  public.inventory_valuation_cutovers,
  public.inventory_valuation_accounts,
  public.inventory_cost_origins,
  public.inventory_origin_balances,
  public.inventory_valuation_events,
  public.inventory_value_allocations
TO authenticated;

GRANT ALL ON TABLE
  public.inventory_valuation_settings,
  public.inventory_valuation_cutovers,
  public.inventory_valuation_accounts,
  public.inventory_cost_origins,
  public.inventory_origin_balances,
  public.inventory_valuation_events,
  public.inventory_value_allocations
TO service_role;

REVOKE ALL ON SEQUENCE
  public.inventory_valuation_accounts_id_seq,
  public.inventory_cost_origins_id_seq,
  public.inventory_origin_balances_id_seq,
  public.inventory_valuation_events_id_seq,
  public.inventory_value_allocations_id_seq
FROM PUBLIC, anon, authenticated;
GRANT ALL ON SEQUENCE
  public.inventory_valuation_accounts_id_seq,
  public.inventory_cost_origins_id_seq,
  public.inventory_origin_balances_id_seq,
  public.inventory_valuation_events_id_seq,
  public.inventory_value_allocations_id_seq
TO service_role;

REVOKE ALL ON FUNCTION
  private.prevent_inventory_valuation_ledger_mutation(),
  private.inventory_valuation_mode(bigint),
  private.lock_inventory_valuation_pool(bigint, bigint, bigint, bigint)
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION
  public.get_inventory_valuation_reconciliation(integer, integer, bigint)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.get_inventory_valuation_reconciliation(integer, integer, bigint)
TO authenticated, service_role;

COMMENT ON TABLE public.inventory_valuation_events IS
  'Append-only value ledger. Quantity truth remains in stock_movements.';
COMMENT ON TABLE public.inventory_value_allocations IS
  'Append-only WAC origin allocations and production lineage.';

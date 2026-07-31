BEGIN;

ALTER TABLE public.grn_items
  DROP CONSTRAINT IF EXISTS grn_items_provisional_cost_source_check,
  ADD CONSTRAINT grn_items_provisional_cost_source_check CHECK (
    provisional_cost_source IS NULL
    OR provisional_cost_source IN ('wac', 'reference', 'pending', 'invoice')
  );

CREATE OR REPLACE FUNCTION private.apply_latest_supplier_price_to_grn_line()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_supplier_id bigint;
  v_unit_price numeric(24,8);
BEGIN
  SELECT grn.supplier_id
  INTO v_supplier_id
  FROM public.goods_received_notes AS grn
  WHERE grn.id = NEW.grn_id
    AND grn.tenant_id = NEW.tenant_id
    AND grn.po_id IS NOT NULL;

  IF v_supplier_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT history.effective_net_unit_price
  INTO v_unit_price
  FROM public.supplier_ingredient_price_history AS history
  WHERE history.tenant_id = NEW.tenant_id
    AND history.supplier_id = v_supplier_id
    AND history.ingredient_id = NEW.ingredient_id
    AND history.unit_id = NEW.entry_unit_id
  ORDER BY history.confirmed_at DESC, history.id DESC
  LIMIT 1;

  NEW.unit_cost := coalesce(v_unit_price, 0);
  NEW.cost_pending := v_unit_price IS NULL;
  NEW.provisional_cost_source := CASE
    WHEN v_unit_price IS NULL THEN 'pending'
    ELSE 'invoice'
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS aaa_grn_items_latest_supplier_price
ON public.grn_items;
CREATE TRIGGER aaa_grn_items_latest_supplier_price
BEFORE INSERT ON public.grn_items
FOR EACH ROW
EXECUTE FUNCTION private.apply_latest_supplier_price_to_grn_line();

CREATE OR REPLACE FUNCTION private.zero_pending_grn_receipt_valuation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_cost_pending boolean;
BEGIN
  IF NEW.type <> 'grn_receipt' OR NEW.grn_item_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT item.cost_pending
  INTO v_cost_pending
  FROM public.grn_items AS item
  WHERE item.id = NEW.grn_item_id
    AND item.tenant_id = NEW.tenant_id;

  IF coalesce(v_cost_pending, FALSE) THEN
    NEW.unit_cost := 0;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zzzz_zero_pending_grn_receipt_valuation
ON public.stock_movements;
CREATE TRIGGER zzzz_zero_pending_grn_receipt_valuation
BEFORE INSERT ON public.stock_movements
FOR EACH ROW
EXECUTE FUNCTION private.zero_pending_grn_receipt_valuation();

CREATE OR REPLACE FUNCTION private.sync_pending_grn_value_from_invoice_allocation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_confirmed_value numeric(20,2);
  v_billed_base numeric(20,3);
  v_accepted_quantity numeric(20,3);
  v_accepted_base numeric(20,3);
BEGIN
  IF NEW.valuation_status NOT IN ('settled', 'settled_current_period') THEN
    RETURN NEW;
  END IF;

  SELECT
    coalesce(pg_catalog.sum(allocation.confirmed_net_inventory_amount), 0),
    coalesce(pg_catalog.sum(public.inv_to_base_for_tenant(
      allocation.tenant_id,
      line.ingredient_id,
      line.unit_id,
      allocation.billed_quantity
    )), 0)
  INTO v_confirmed_value, v_billed_base
  FROM public.supplier_invoice_receipt_allocations AS allocation
  JOIN public.supplier_invoice_lines AS line
    ON line.id = allocation.invoice_line_id
   AND line.tenant_id = allocation.tenant_id
  WHERE allocation.tenant_id = NEW.tenant_id
    AND allocation.grn_item_id = NEW.grn_item_id
    AND allocation.valuation_status IN ('settled', 'settled_current_period');

  SELECT
    item.received_quantity - item.rejected_quantity,
    public.inv_to_base_for_tenant(
      item.tenant_id,
      item.ingredient_id,
      item.entry_unit_id,
      item.received_quantity - item.rejected_quantity
    )
  INTO v_accepted_quantity, v_accepted_base
  FROM public.grn_items AS item
  WHERE item.id = NEW.grn_item_id
    AND item.tenant_id = NEW.tenant_id
  FOR UPDATE;

  IF v_accepted_quantity <= 0 OR v_billed_base <> v_accepted_base THEN
    RETURN NEW;
  END IF;

  PERFORM pg_catalog.set_config('comtammatu.grn_confirm', 'true', TRUE);
  UPDATE public.grn_items
  SET unit_cost = pg_catalog.round(
        v_confirmed_value / v_accepted_quantity,
        8
      ),
      total_cost = v_confirmed_value,
      cost_pending = FALSE,
      provisional_cost_source = 'invoice'
  WHERE id = NEW.grn_item_id
    AND tenant_id = NEW.tenant_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zzz_sync_pending_grn_value_from_invoice_allocation
ON public.supplier_invoice_receipt_allocations;
CREATE TRIGGER zzz_sync_pending_grn_value_from_invoice_allocation
AFTER UPDATE OF valuation_status ON public.supplier_invoice_receipt_allocations
FOR EACH ROW
EXECUTE FUNCTION private.sync_pending_grn_value_from_invoice_allocation();

CREATE OR REPLACE FUNCTION private.sync_grn_wac_from_valuation_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF OLD.status <> 'draft' OR NEW.status <> 'confirmed' THEN
    RETURN NEW;
  END IF;

  PERFORM pg_catalog.set_config('comtammatu.grn_confirm', 'true', TRUE);

  UPDATE public.grn_items AS item
  SET unit_cost = 0,
      total_cost = 0
  WHERE item.tenant_id = NEW.tenant_id
    AND item.grn_id = NEW.id
    AND item.cost_pending;

  UPDATE public.stock_levels AS stock
  SET avg_unit_cost = CASE
        WHEN account.quantity > 0
          THEN pg_catalog.round(account.book_value / account.quantity, 8)
        ELSE 0
      END,
      updated_at = pg_catalog.now()
  FROM public.inventory_valuation_accounts AS account
  JOIN public.grn_items AS item
    ON item.tenant_id = account.tenant_id
   AND item.ingredient_id = account.ingredient_id
  WHERE item.tenant_id = NEW.tenant_id
    AND item.grn_id = NEW.id
    AND account.branch_id = NEW.branch_id
    AND account.location_id = NEW.location_id
    AND stock.tenant_id = account.tenant_id
    AND stock.branch_id = account.branch_id
    AND stock.location_id = account.location_id
    AND stock.ingredient_id = account.ingredient_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zzz_sync_grn_wac_from_valuation_account
ON public.goods_received_notes;
CREATE TRIGGER zzz_sync_grn_wac_from_valuation_account
AFTER UPDATE OF status ON public.goods_received_notes
FOR EACH ROW
EXECUTE FUNCTION private.sync_grn_wac_from_valuation_account();

REVOKE ALL ON FUNCTION
  private.apply_latest_supplier_price_to_grn_line(),
  private.zero_pending_grn_receipt_valuation(),
  private.sync_pending_grn_value_from_invoice_allocation(),
  private.sync_grn_wac_from_valuation_account()
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION
  public.create_purchase_order_from_grn(bigint),
  public.create_purchase_order_from_request(bigint, bigint, date, text, jsonb),
  public.create_purchase_orders_from_request(bigint, jsonb),
  public.save_purchase_orders_from_request(bigint, jsonb, boolean, uuid),
  public.save_purchase_order(bigint, date, text, jsonb, boolean),
  public.update_purchase_order_prices(bigint, jsonb),
  public.update_purchase_order_prices_protected(bigint, jsonb),
  public.approve_purchase_order(bigint)
FROM PUBLIC, anon, authenticated, service_role;

COMMIT;

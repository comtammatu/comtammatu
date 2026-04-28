-- =============================================================
-- M6 Finance Phase 1.5 — VAT-per-line schema
-- =============================================================
-- Captures vat_rate per menu item (config) and per order_item
-- (snapshot at order time). Implements rule
-- VAT-PER-LINE-NOT-PER-INVOICE (regression rule 2026-04-28):
-- VAT MUST be stored and recomputed PER LINE, never recomputed at
-- invoice level via total / (1 + invoice_vat_rate).
--
-- Pilot menu is uniform 8% (Nghị định 15/2022 reduced food rate)
-- so the math is mathematically equivalent today, but the schema
-- is now correct for the first 10% beverage that gets added —
-- without touching any of the 17 RPCs / app paths that INSERT
-- into order_items. A BEFORE INSERT trigger fills vat_rate from
-- menu_items.vat_rate when the caller doesn't set it, so existing
-- code continues to work unchanged.
--
-- After this migration, app code can issue mixed-VAT HĐĐT correctly
-- by aggregating order_items.vat_rate into per-rate buckets.
-- =============================================================

-- ─── 1. menu_items.vat_rate (per-item config) ───

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2) NOT NULL DEFAULT 8.00
    CHECK (vat_rate >= 0 AND vat_rate <= 100);

COMMENT ON COLUMN public.menu_items.vat_rate IS
  'VAT rate (%) snapshotted onto order_items at order creation. '
  'Default 8.00 = Nghị định 15/2022 reduced rate for food. '
  'F&B beverages typically 10%; non-VAT exempt items 0%.';

-- ─── 2. order_items.vat_rate (snapshot, nullable until backfill) ───

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2)
    CHECK (vat_rate IS NULL OR (vat_rate >= 0 AND vat_rate <= 100));

-- ─── 3. BEFORE INSERT trigger — populate from menu_items if NULL ───

CREATE OR REPLACE FUNCTION public.populate_order_item_vat_rate()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Only fill when caller didn't explicitly set it. Treats 0.00 as
  -- a legitimate value (VAT-exempt item) so we don't overwrite it.
  IF NEW.vat_rate IS NULL THEN
    SELECT mi.vat_rate INTO NEW.vat_rate
    FROM public.menu_items mi
    WHERE mi.id = NEW.menu_item_id;

    -- Fallback when menu_item is missing (e.g. orphaned reference,
    -- legacy data, or NULL menu_item_id). Default 8% matches the
    -- system-wide default for food.
    IF NEW.vat_rate IS NULL THEN
      NEW.vat_rate := 8.00;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_items_populate_vat_rate ON public.order_items;
CREATE TRIGGER trg_order_items_populate_vat_rate
  BEFORE INSERT ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.populate_order_item_vat_rate();

COMMENT ON FUNCTION public.populate_order_item_vat_rate() IS
  'Fills order_items.vat_rate from menu_items.vat_rate at INSERT time. '
  'Rule VAT-PER-LINE-NOT-PER-INVOICE — every order line carries its own '
  'VAT rate snapshot so invoice issuance can aggregate correctly even '
  'for mixed-rate orders.';

-- ─── 4. Backfill historical order_items ───

UPDATE public.order_items oi
SET vat_rate = COALESCE(
  (SELECT mi.vat_rate FROM public.menu_items mi WHERE mi.id = oi.menu_item_id),
  8.00
)
WHERE oi.vat_rate IS NULL;

-- ─── 5. Lock NOT NULL once backfilled ───

ALTER TABLE public.order_items
  ALTER COLUMN vat_rate SET DEFAULT 8.00;

ALTER TABLE public.order_items
  ALTER COLUMN vat_rate SET NOT NULL;

-- =============================================================
-- Regression test: payment bill merges same-dish lines, notes excluded,
-- but never merges across add-ons (sides/modifiers)
--
-- Same dish added twice as two order_items — one with an item note — must
-- print as ONE bill line with the quantity summed, not two lines (item notes
-- are hidden on bills, so they are not part of the line identity). But a
-- portion that carries an add-on side (e.g. "Suon Cot Let + Trung", stored as
-- a side on the row) must stay its OWN line and keep the side attached — it
-- must NOT collapse the base dish with plain portions and orphan the add-on.
--
-- Usage:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/bill_line_items_merge_notes_test.sql
--   supabase db query --linked --file supabase/tests/bill_line_items_merge_notes_test.sql
-- =============================================================

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_helper_def TEXT;
  v_prov_def   TEXT;
  v_recv_def   TEXT;
  v_tenant     BIGINT;
  v_branch     BIGINT;
  v_category   BIGINT;
  v_menu_item  BIGINT;
  v_egg_menu_item BIGINT;
  v_creator    UUID;
  v_order_id   BIGINT;
  v_items      JSONB;
  v_merged_qty INT;
  v_line_count INT;
  v_egg_qty    INT;
  v_egg_sides  JSONB;
BEGIN
  -- 1. Definitional guards: both bill RPCs delegate to the shared builder, and
  --    the builder never keys on the item note.
  SELECT pg_get_functiondef('public.bill_line_items(bigint)'::regprocedure)
    INTO v_helper_def;
  SELECT pg_get_functiondef(
    'public.enqueue_provisional_bill(bigint,text,text)'::regprocedure)
    INTO v_prov_def;
  SELECT pg_get_functiondef(
    'public.enqueue_receipt_print(bigint,numeric,numeric)'::regprocedure)
    INTO v_recv_def;

  IF v_helper_def NOT ILIKE '%GROUP BY%' THEN
    RAISE EXCEPTION 'TEST FAILED: bill_line_items does not aggregate (no GROUP BY)';
  END IF;
  IF v_helper_def ILIKE '%oi.note%' THEN
    RAISE EXCEPTION 'TEST FAILED: bill_line_items keys on item note (should be excluded)';
  END IF;
  IF v_prov_def NOT ILIKE '%bill_line_items%' THEN
    RAISE EXCEPTION 'TEST FAILED: enqueue_provisional_bill does not use bill_line_items';
  END IF;
  IF v_recv_def NOT ILIKE '%bill_line_items%' THEN
    RAISE EXCEPTION 'TEST FAILED: enqueue_receipt_print does not use bill_line_items';
  END IF;

  -- 2. Behavioral guard: seed an order with two identical plain portions (one
  --    noted, one not) plus a third portion carrying an add-on egg side, then
  --    merge. Self-seeds its own category + menu_item so the assertion runs
  --    regardless of menu fixtures; only tenant/branch/profile (bootstrap-level)
  --    are taken from the env.
  SELECT id INTO v_tenant FROM public.tenants ORDER BY id LIMIT 1;
  IF v_tenant IS NULL THEN
    RAISE NOTICE 'TEST SKIPPED: no tenant fixture in this environment';
    RETURN;
  END IF;

  SELECT id INTO v_branch FROM public.branches
  WHERE tenant_id = v_tenant ORDER BY id LIMIT 1;
  SELECT id INTO v_creator FROM public.profiles
  WHERE tenant_id = v_tenant ORDER BY id LIMIT 1;

  IF v_branch IS NULL OR v_creator IS NULL THEN
    RAISE NOTICE 'TEST SKIPPED: no branch/profile fixture for tenant %', v_tenant;
    RETURN;
  END IF;

  INSERT INTO public.menu_categories (tenant_id, name)
    VALUES (v_tenant, 'ZZTEST-BILLMERGE') RETURNING id INTO v_category;
  INSERT INTO public.menu_items (tenant_id, category_id, name, base_price, vat_rate)
    VALUES (v_tenant, v_category, 'Suon Cot Let', 50000, 0) RETURNING id INTO v_menu_item;
  INSERT INTO public.menu_items (tenant_id, category_id, name, base_price, vat_rate)
    VALUES (v_tenant, v_category, 'Trung', 5000, 0) RETURNING id INTO v_egg_menu_item;

  INSERT INTO public.orders (
    tenant_id, branch_id, order_number, order_type, status, created_by
  )
  VALUES (
    v_tenant, v_branch, 'ZZ-TEST-BILLMERGE', 'dine_in', 'new', v_creator
  )
  RETURNING id INTO v_order_id;

  INSERT INTO public.order_items (
    tenant_id, order_id, menu_item_id, item_name, quantity, unit_price,
    modifiers, sides, subtotal, note, status, vat_rate
  ) VALUES
    -- Two plain portions, differing only by note → must merge to qty 2.
    (v_tenant, v_order_id, v_menu_item, 'Suon Cot Let', 1, 50000,
     '[]'::jsonb, '[]'::jsonb, 50000, 'it mo hanh', 'pending', 0),
    (v_tenant, v_order_id, v_menu_item, 'Suon Cot Let', 1, 50000,
     '[]'::jsonb, '[]'::jsonb, 50000, NULL, 'pending', 0),
    -- Same dish but carrying an egg side → distinct line, side must stay attached.
    (v_tenant, v_order_id, v_menu_item, 'Suon Cot Let', 1, 55000, '[]'::jsonb,
     jsonb_build_array(jsonb_build_object('name', 'Trung', 'price', 5000, 'quantity', 1, 'is_default', false, 'side_item_id', v_egg_menu_item)),
     55000, NULL, 'pending', 0);

  v_items := public.bill_line_items(v_order_id);

  SELECT jsonb_array_length(v_items) INTO v_line_count;
  IF v_line_count <> 2 THEN
    RAISE EXCEPTION
      'TEST FAILED: expected 2 bill lines (1 merged plain + 1 with side), got %', v_line_count;
  END IF;

  -- Plain portions (no side) merge across the note.
  SELECT (line->>'quantity')::INT INTO v_merged_qty
  FROM jsonb_array_elements(v_items) line
  WHERE line->'sides' = '[]'::jsonb;
  IF v_merged_qty IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION
      'TEST FAILED: noted + un-noted plain dish did not merge to qty 2 (got %)', v_merged_qty;
  END IF;

  -- The portion with the egg side stays its own line and keeps the side.
  SELECT (line->>'quantity')::INT, line->'sides' INTO v_egg_qty, v_egg_sides
  FROM jsonb_array_elements(v_items) line
  WHERE line->'sides' <> '[]'::jsonb;
  IF v_egg_qty IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION
      'TEST FAILED: add-on portion over-merged (qty %)', v_egg_qty;
  END IF;
  IF v_egg_sides::text NOT ILIKE '%Trung%' THEN
    RAISE EXCEPTION
      'TEST FAILED: add-on side orphaned from its portion';
  END IF;

  RAISE NOTICE
    'TEST PASSED: plain dishes merge across notes; add-on portion stays separate with side intact';
END;
$$;

ROLLBACK;

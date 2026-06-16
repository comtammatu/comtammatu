BEGIN;

-- get_revenue_kpis (T3 finance RPC) reads order_items + payments through covering
-- index-only scans (idx_order_items_finance_live_order, idx_payments_live_revenue).
-- Both showed heavy Heap Fetches under EXPLAIN ANALYZE (order_items ~46% of scanned
-- rows, payments ~1.6k/call) because the visibility map is stale: at the default
-- autovacuum_vacuum_scale_factor=0.2 these small hot tables (<15k live rows) rarely
-- autovacuum, so pages are not marked all-visible and index-only scans fall to the
-- heap. Tightening the per-table scale factors makes autovacuum/analyze run more
-- often -> more all-visible pages -> fewer heap fetches, with no behavior change to
-- any reader. Values are conservative for sub-15k-row tables where a vacuum is
-- sub-second; thresholds add a small floor so tiny churn does not trigger churn.
--
-- NOTE: a companion single-pass window-function rewrite of the get_revenue_kpis VAT
-- block was drafted and proven output-equal on PROD data (vat_by_rate + vat_total
-- byte-identical, incl. the zero-subtotal ELSE-1 branch), but EXPLAIN (ANALYZE,
-- BUFFERS) showed it loses the Index-Only Scan on idx_order_items_finance_live_order
-- (falls to a plain Index Scan on idx_order_items_order + sort) and is net-neutral on
-- buffers, so it is intentionally NOT applied here.
--
-- ALTER TABLE ... SET (...) overwrites in place, so this migration is safe to re-run.

ALTER TABLE public.order_items SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_vacuum_threshold = 200,
  autovacuum_analyze_scale_factor = 0.02,
  autovacuum_analyze_threshold = 100
);

ALTER TABLE public.payments SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_vacuum_threshold = 200,
  autovacuum_analyze_scale_factor = 0.02,
  autovacuum_analyze_threshold = 100
);

DO $$
DECLARE
  v_expected CONSTANT jsonb := jsonb_build_object(
    'autovacuum_vacuum_scale_factor', '0.05',
    'autovacuum_vacuum_threshold', '200',
    'autovacuum_analyze_scale_factor', '0.02',
    'autovacuum_analyze_threshold', '100'
  );
  v_tbl text;
  v_key text;
  v_actual text;
BEGIN
  FOREACH v_tbl IN ARRAY ARRAY['order_items', 'payments'] LOOP
    FOR v_key IN SELECT jsonb_object_keys(v_expected) LOOP
      SELECT o.option_value
        INTO v_actual
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      CROSS JOIN LATERAL pg_options_to_table(c.reloptions) o
      WHERE c.relname = v_tbl
        AND o.option_name = v_key;

      IF v_actual IS DISTINCT FROM (v_expected ->> v_key) THEN
        RAISE EXCEPTION 'autovacuum tuning not applied: public.% missing % (got %, expected %)',
          v_tbl, v_key, COALESCE(v_actual, '<null>'), v_expected ->> v_key;
      END IF;
    END LOOP;
  END LOOP;
END $$;

COMMIT;

-- =============================================================================
-- migrate-data.sql — Option-B ETL: prod (CTCP) → lean HKD project (DATA copy)
-- =============================================================================
-- ⚠️ OWNER-GATED. Runs ON THE NEW LEAN TARGET project. Reads prod over a
-- READ-ONLY postgres_fdw link. The agent NEVER mutates prod — prod is touched
-- SELECT-only, through a read-only role you create (see runbook). Rollback =
-- old prod left fully intact.
--
-- PRECONDITIONS (see docs/runbooks/greenfield-prod-cutover.md):
--   1. Lean target project already has: baseline.sql + managed-surfaces +
--      seed.sql (so public.permission_keys is populated — the staff_permissions
--      filter depends on it) AND auth.users rows for every profile id you copy
--      (profiles.id FKs auth.users; mint them first, see runbook §2).
--   2. A read-only prod role + a reachable prod connection string.
--   3. Business freeze window in effect (POS closed; no new orders/payments).
--   The Section-C guard enforces (1)+(3) and an empty target fail-loud before
--   any copy.
--
-- RUN: via migrate-data.sh (exports PROD_* to the env; ON_ERROR_STOP). Then
--   run reconcile.sql — it FAILS LOUD on any count/sum/invariant mismatch.
--
-- DESIGN: copy is intersection-based — for each table it copies exactly the
--   columns present in BOTH lean and prod. So prod's dropped columns
--   (journal_entry_id, stock_consumed_status, matching_status,
--   credit_applied_amount, profiles.area_id …) are auto-excluded, and lean-only
--   columns fall back to their DEFAULT. The only hand-written reshapes are the
--   few value transforms in Section C. PKs are preserved (OVERRIDING SYSTEM
--   VALUE) so every FK + every issued-HĐĐT id stays stable.
-- =============================================================================

\set ON_ERROR_STOP on

-- Prod connection comes from the ENVIRONMENT (keeps the password out of argv /
-- ps / shell history). Requires psql >= 16. The runner exports PROD_*.
\getenv prod_host PROD_HOST
\getenv prod_port PROD_PORT
\getenv prod_db PROD_DB
\getenv prod_user PROD_USER
\getenv prod_password PROD_PASSWORD

-- ---------------------------------------------------------------------------
-- Section A — postgres_fdw link to prod (READ-ONLY). Idempotent.
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS postgres_fdw;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_foreign_server WHERE srvname = 'prod_src') THEN
    EXECUTE format(
      'CREATE SERVER prod_src FOREIGN DATA WRAPPER postgres_fdw OPTIONS (host %L, port %L, dbname %L)',
      :'prod_host', :'prod_port', :'prod_db');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_user_mappings WHERE srvname = 'prod_src'
      AND usename = current_user
  ) THEN
    EXECUTE format(
      'CREATE USER MAPPING FOR CURRENT_USER SERVER prod_src OPTIONS (user %L, password %L)',
      :'prod_user', :'prod_password');
  END IF;
END $$;

DROP SCHEMA IF EXISTS prod_src CASCADE;
CREATE SCHEMA prod_src;
-- Import only what we read (lean table names). Extra prod tables are ignored.
IMPORT FOREIGN SCHEMA public
  LIMIT TO (
    tenants, branches, ingredients, menu_categories, payroll_periods, positions,
    suppliers, system_settings, branch_attendance_config, branch_feature_flags,
    branch_zones, kds_stations, order_daily_counters, pos_terminals,
    printer_agents, printers, shifts, staff_permissions, stocktake_sessions,
    stock_levels, menu_items, profiles, tables, kds_station_categories,
    stocktake_lines, branch_menu_item_daily_limits, menu_item_available_sides,
    menu_item_modifiers, menu_item_variants, employees, goods_received_notes,
    attendance_records, payroll_entries, shift_assignments, grn_items,
    supplier_invoices, orders, shift_requests, supplier_payments, order_items,
    order_status_history, payments, stock_movements, tax_invoices, refunds,
    tax_invoice_events, tax_invoice_orders, permission_keys,
    pos_sessions  -- NOT copied; imported only for the freeze-window guard below
  )
  FROM SERVER prod_src INTO prod_src;

-- ---------------------------------------------------------------------------
-- Section B — intersection copy helper. Preserves PKs; auto-excludes columns
-- that don't exist on both sides; applies per-column reshape overrides.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._etl_copy(
  p_table     text,
  p_overrides jsonb DEFAULT '{}'::jsonb,  -- {"col":"<sql expr over alias s>"}
  p_where     text  DEFAULT 'true'
) RETURNS bigint
LANGUAGE plpgsql AS $fn$
DECLARE
  v_cols      text[];
  v_insert    text;
  v_select    text;
  v_always    boolean;
  v_overriding text := '';
  v_sql       text;
  v_n         bigint;
BEGIN
  -- common columns = lean(public) ∩ prod(prod_src), in lean column order
  SELECT array_agg(l.column_name ORDER BY l.ordinal_position)
    INTO v_cols
  FROM information_schema.columns l
  JOIN information_schema.columns f
    ON f.table_schema = 'prod_src'
   AND f.table_name   = p_table
   AND f.column_name  = l.column_name
  WHERE l.table_schema = 'public'
    AND l.table_name   = p_table;

  IF v_cols IS NULL OR cardinality(v_cols) = 0 THEN
    RAISE EXCEPTION '_etl_copy: no common columns for %', p_table;
  END IF;

  SELECT
    string_agg(quote_ident(c), ', '),
    string_agg(
      CASE WHEN p_overrides ? c
           THEN '(' || (p_overrides->>c) || ')'
           ELSE 's.' || quote_ident(c) END, ', ')
    INTO v_insert, v_select
  FROM unnest(v_cols) AS c;

  -- OVERRIDING SYSTEM VALUE only when the target has a GENERATED ALWAYS identity
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name=p_table
      AND identity_generation='ALWAYS'
  ) INTO v_always;
  IF v_always THEN v_overriding := 'OVERRIDING SYSTEM VALUE'; END IF;

  v_sql := format(
    'INSERT INTO public.%I (%s) %s SELECT %s FROM prod_src.%I s WHERE %s',
    p_table, v_insert, v_overriding, v_select, p_table, p_where);
  EXECUTE v_sql;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE '  copied % -> % rows', p_table, v_n;
  RETURN v_n;
END
$fn$;

-- ---------------------------------------------------------------------------
-- Section C — copy KEEP-set in FK dependency order (one transaction = all or
-- nothing; a failure rolls the lean project back to empty).
-- ---------------------------------------------------------------------------
BEGIN;

-- Preconditions (fail-loud BEFORE any copy):
DO $$
DECLARE v_n bigint; v_bad text;
BEGIN
  -- (a) must be the LEAN target (cash_entries only exists post-baseline)
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='cash_entries') THEN
    RAISE EXCEPTION 'Not the lean target (cash_entries missing). Refusing to run.';
  END IF;

  -- (b) prod reachable through the FDW
  PERFORM 1 FROM prod_src.tenants LIMIT 1;

  -- (c) lean permission_keys seeded — the staff_permissions filter needs it
  SELECT count(*) INTO v_n FROM public.permission_keys;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'permission_keys is empty — seed the lean key catalog before ETL (runbook §1).';
  END IF;

  -- (d) target COPY tables must be EMPTY — blocks demo-seed contamination AND a
  --     partial re-run (this ETL is not idempotent; re-run requires a clean target).
  FOREACH v_bad IN ARRAY ARRAY['tenants','branches','profiles','orders','payments',
                               'tax_invoices','suppliers','ingredients','system_settings']
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', v_bad) INTO v_n;
    IF v_n > 0 THEN
      RAISE EXCEPTION 'Lean target % already has % rows — start from an empty target (clear demo seed or a previous partial run).', v_bad, v_n;
    END IF;
  END LOOP;

  -- (e) auth.users prerequisite — every prod profile needs a matching auth.users
  --     row already on the lean project (profiles.id FKs auth.users). Runbook §2.
  SELECT count(*) INTO v_n FROM prod_src.profiles p
  WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id);
  IF v_n > 0 THEN
    RAISE EXCEPTION '% prod profiles have no matching auth.users on the lean project — migrate auth.users first (runbook §2).', v_n;
  END IF;

  -- (f) freeze window — no OPEN pos_sessions on prod (in-flight cash would be lost)
  SELECT count(*) INTO v_n FROM prod_src.pos_sessions WHERE closed_at IS NULL;
  IF v_n > 0 THEN
    RAISE EXCEPTION '% open pos_sessions on prod — close all POS sessions (freeze window) before ETL.', v_n;
  END IF;

  -- (g) branch_kind domain — fail on unexpected kinds so containers are not
  --     silently miscopied as 'branch'. Known kinds: branch/tenant/area/central*.
  SELECT string_agg(DISTINCT branch_kind, ', ') INTO v_bad
  FROM prod_src.branches
  WHERE branch_kind NOT IN ('branch','tenant','area','central_warehouse','central_kitchen');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Unexpected prod branch_kind value(s): % — review the branches reshape (migrate-data.sql §C, runbook §9) before running.', v_bad;
  END IF;
END $$;

-- permission_keys: NOT copied — the lean catalog comes from seed.sql (prod's
-- old superset would re-introduce dropped keys). staff_permissions is filtered
-- against this lean catalog below.

SELECT public._etl_copy('tenants');

-- branches: collapse to flat 'branch'; exclude logical container rows.
-- ⚠️ VERIFY prod's branch_kind domain before the real run — adjust the WHERE
--    if prod stores containers under other kinds (or none).
SELECT public._etl_copy(
  'branches',
  '{"branch_kind":"''branch''"}'::jsonb,
  $w$ branch_kind NOT IN ('tenant','area') $w$);

SELECT public._etl_copy('ingredients');
SELECT public._etl_copy('menu_categories');
SELECT public._etl_copy('payroll_periods');     -- journal_entry_id auto-excluded
SELECT public._etl_copy('positions');           -- codes kept verbatim; role
                                                -- bucketing is done at JWT time
                                                -- by staff_role_from_position_code
SELECT public._etl_copy('suppliers');
SELECT public._etl_copy('system_settings');     -- tax code / HĐĐT / seller name
SELECT public._etl_copy('branch_attendance_config');
SELECT public._etl_copy('branch_feature_flags');
SELECT public._etl_copy('branch_zones');
SELECT public._etl_copy('kds_stations');
SELECT public._etl_copy('order_daily_counters'); -- preserve order numbering
SELECT public._etl_copy('pos_terminals');
SELECT public._etl_copy('printer_agents');
SELECT public._etl_copy('printers');
SELECT public._etl_copy('shifts');

-- staff_permissions: drop grants for permission keys that no longer exist lean.
SELECT public._etl_copy(
  'staff_permissions',
  '{}'::jsonb,
  $w$ permission_key IN (SELECT key FROM public.permission_keys) $w$);

SELECT public._etl_copy('stocktake_sessions');
SELECT public._etl_copy('stock_levels');
SELECT public._etl_copy('menu_items');
SELECT public._etl_copy('profiles');            -- area_id auto-excluded
SELECT public._etl_copy('tables');
SELECT public._etl_copy('kds_station_categories');
SELECT public._etl_copy('stocktake_lines');
SELECT public._etl_copy('branch_menu_item_daily_limits');
SELECT public._etl_copy('menu_item_available_sides');
SELECT public._etl_copy('menu_item_modifiers');
SELECT public._etl_copy('menu_item_variants');
SELECT public._etl_copy('employees');
SELECT public._etl_copy('goods_received_notes'); -- journal_entry_id auto-excluded
SELECT public._etl_copy('attendance_records');
SELECT public._etl_copy('payroll_entries');
SELECT public._etl_copy('shift_assignments');
SELECT public._etl_copy('grn_items');
SELECT public._etl_copy('supplier_invoices');    -- journal_entry_id / matching_status
                                                -- / credit_applied_amount auto-excluded

-- orders: pos_sessions are not migrated (transient, closed pre-cutover) → NULL
-- the link. The FK is nullable so this is safe.
SELECT public._etl_copy('orders', '{"pos_session_id":"NULL"}'::jsonb);

SELECT public._etl_copy('shift_requests');
SELECT public._etl_copy('supplier_payments');    -- journal_entry_id auto-excluded
SELECT public._etl_copy('order_items');
SELECT public._etl_copy('order_status_history');
SELECT public._etl_copy('payments');             -- journal_entry_id /
                                                -- stock_consumed_status auto-excluded
SELECT public._etl_copy('stock_movements');
SELECT public._etl_copy('tax_invoices');         -- immutable HĐĐT — full history
SELECT public._etl_copy('refunds');
SELECT public._etl_copy('tax_invoice_events');   -- HĐĐT audit trail
SELECT public._etl_copy('tax_invoice_orders');   -- junction

-- INTENTIONALLY EMPTY (transient / new / no prod source) — copied as nothing:
--   cash_entries (new sổ quỹ — owner records going forward)
--   pos_sessions (open ca closed pre-cutover; orders.pos_session_id NULLed)
--   kds_tickets, kitchen_send_batches, print_jobs (in-flight kitchen/print)
--   webhook_events, notifications (transient)
--   archive_run_log, reconcile_run_log, summary_run_queue (job logs)
--   audit_logs (operational log — optional; left empty to avoid FK churn)

-- ---------------------------------------------------------------------------
-- Section D — re-sync identity sequences so new inserts continue past max(id).
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record; v_max bigint;
BEGIN
  FOR r IN
    SELECT c.table_name, c.column_name,
           pg_get_serial_sequence('public.'||c.table_name, c.column_name) AS seq
    FROM information_schema.columns c
    WHERE c.table_schema='public' AND c.is_identity='YES'
  LOOP
    IF r.seq IS NULL THEN CONTINUE; END IF;
    EXECUTE format('SELECT COALESCE(max(%I),0) FROM public.%I', r.column_name, r.table_name)
      INTO v_max;
    PERFORM setval(r.seq, GREATEST(v_max, 1), v_max > 0);
  END LOOP;
END $$;

COMMIT;

-- ---------------------------------------------------------------------------
-- Section E — refresh materialized views the app reads (must run after data).
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT schemaname, matviewname FROM pg_matviews WHERE schemaname='public'
  LOOP
    EXECUTE format('REFRESH MATERIALIZED VIEW public.%I', r.matviewname);
  END LOOP;
END $$;

\echo 'migrate-data.sql complete — now run reconcile.sql (fails loud on mismatch).'

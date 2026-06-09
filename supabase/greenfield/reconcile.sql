-- =============================================================================
-- reconcile.sql — post-ETL parity gate (run AFTER migrate-data.sql)
-- =============================================================================
-- Runs on the lean target with the prod_src FDW still attached. FAILS LOUD:
-- RAISE EXCEPTION on the first batch of mismatches (rolls nothing — it is
-- read-only) so the cutover STOPS before you repoint the app. Zero drift is the
-- bar: any row-count or money-sum difference blocks go-live.
--
-- The filters here MUST match migrate-data.sql exactly (branches container
-- exclude; staff_permissions key filter), or counts will falsely differ.
-- =============================================================================

\set ON_ERROR_STOP on

DO $$
DECLARE
  v_fail    text[] := '{}';
  r         record;
  v_lean    bigint;
  v_prod    bigint;
  v_lean_m  numeric;
  v_prod_m  numeric;

  -- (table, prod-side WHERE) — same filters as the ETL. Empty = 'true'.
  v_count_checks text[][] := ARRAY[
    ['tenants',''], ['ingredients',''], ['menu_categories',''],
    ['payroll_periods',''], ['positions',''], ['suppliers',''],
    ['system_settings',''], ['branch_attendance_config',''],
    ['branch_feature_flags',''], ['branch_zones',''], ['kds_stations',''],
    ['order_daily_counters',''], ['pos_terminals',''], ['printer_agents',''],
    ['printers',''], ['shifts',''], ['stocktake_sessions',''],
    ['stock_levels',''], ['menu_items',''], ['profiles',''], ['tables',''],
    ['kds_station_categories',''], ['stocktake_lines',''],
    ['branch_menu_item_daily_limits',''], ['menu_item_available_sides',''],
    ['menu_item_modifiers',''], ['menu_item_variants',''], ['employees',''],
    ['goods_received_notes',''], ['attendance_records',''], ['payroll_entries',''],
    ['shift_assignments',''], ['grn_items',''], ['supplier_invoices',''],
    ['orders',''], ['shift_requests',''], ['supplier_payments',''],
    ['order_items',''], ['order_status_history',''], ['payments',''],
    ['stock_movements',''], ['tax_invoices',''], ['refunds',''],
    ['tax_invoice_events',''], ['tax_invoice_orders',''],
    ['branches', $flt$branch_kind NOT IN ('tenant','area')$flt$],
    ['staff_permissions', $flt$permission_key IN (SELECT key FROM public.permission_keys)$flt$]
  ];

  -- (table, money-column) — sums must match to the cent. Header totals AND the
  -- line-item / tax-component columns (so a VAT or line error can't net to zero
  -- against an offsetting mistake in the header).
  v_money_checks text[][] := ARRAY[
    ['orders','total_amount'], ['order_items','subtotal'],
    ['payments','amount'], ['refunds','amount'],
    ['tax_invoices','total_amount'], ['tax_invoices','vat_amount'],
    ['tax_invoices','subtotal'],
    ['supplier_invoices','total_amount'], ['supplier_invoices','subtotal'],
    ['supplier_invoices','vat_amount'], ['supplier_invoices','paid_amount'],
    ['supplier_payments','amount'], ['grn_items','total_cost']
  ];
  v_filter text;
BEGIN
  -- 1) row-count parity ------------------------------------------------------
  FOR i IN 1 .. array_length(v_count_checks, 1) LOOP
    v_filter := COALESCE(NULLIF(v_count_checks[i][2], ''), 'true');
    EXECUTE format('SELECT count(*) FROM public.%I',    v_count_checks[i][1]) INTO v_lean;
    EXECUTE format('SELECT count(*) FROM prod_src.%I WHERE %s',
                   v_count_checks[i][1], v_filter) INTO v_prod;
    IF v_lean <> v_prod THEN
      v_fail := v_fail || format('COUNT %s: lean=%s prod=%s',
                                 v_count_checks[i][1], v_lean, v_prod);
    END IF;
  END LOOP;

  -- 2) money-sum parity (to the cent) ---------------------------------------
  FOR i IN 1 .. array_length(v_money_checks, 1) LOOP
    EXECUTE format('SELECT COALESCE(sum(%I),0) FROM public.%I',
                   v_money_checks[i][2], v_money_checks[i][1]) INTO v_lean_m;
    EXECUTE format('SELECT COALESCE(sum(%I),0) FROM prod_src.%I',
                   v_money_checks[i][2], v_money_checks[i][1]) INTO v_prod_m;
    IF round(v_lean_m, 2) <> round(v_prod_m, 2) THEN
      v_fail := v_fail || format('SUM %s.%s: lean=%s prod=%s',
                  v_money_checks[i][1], v_money_checks[i][2], v_lean_m, v_prod_m);
    END IF;
  END LOOP;

  -- 3) cut-value invariants --------------------------------------------------
  SELECT count(*) INTO v_lean FROM public.branches WHERE branch_kind <> 'branch';
  IF v_lean <> 0 THEN
    v_fail := v_fail || format('branches with non-branch branch_kind: %s', v_lean);
  END IF;

  SELECT count(*) INTO v_lean
  FROM public.positions
  WHERE private.staff_role_from_position_code(code) IS NULL;
  IF v_lean <> 0 THEN
    v_fail := v_fail || format('positions whose code maps to NO lean role: %s', v_lean);
  END IF;

  -- 4) HĐĐT integrity: no duplicate (branch, invoice_number) among numbered ---
  SELECT count(*) INTO v_lean FROM (
    SELECT branch_id, invoice_number
    FROM public.tax_invoices
    WHERE invoice_number IS NOT NULL
    GROUP BY branch_id, invoice_number
    HAVING count(*) > 1
  ) dups;
  IF v_lean <> 0 THEN
    v_fail := v_fail || format('duplicate tax_invoices (branch, invoice_number): %s groups', v_lean);
  END IF;

  -- 5) HĐĐT immutability anchors: a provider-submitted invoice must carry its
  --    external reference (provider_ref) — the legal immutability handle.
  SELECT count(*) INTO v_lean
  FROM public.tax_invoices
  WHERE status IN ('issued','submitted','signing') AND provider_ref IS NULL;
  IF v_lean <> 0 THEN
    v_fail := v_fail || format('issued/submitted tax_invoices missing provider_ref: %s', v_lean);
  END IF;

  -- 6) HĐĐT audit trail present: every issued invoice has at least one event.
  SELECT count(*) INTO v_lean
  FROM public.tax_invoices ti
  WHERE ti.status = 'issued'
    AND NOT EXISTS (SELECT 1 FROM public.tax_invoice_events e
                    WHERE e.tax_invoice_id = ti.id);
  IF v_lean <> 0 THEN
    v_fail := v_fail || format('issued tax_invoices with no event-trail row: %s', v_lean);
  END IF;

  -- verdict ------------------------------------------------------------------
  IF cardinality(v_fail) > 0 THEN
    RAISE EXCEPTION E'RECONCILE FAILED — DO NOT CUT OVER:\n  %',
      array_to_string(v_fail, E'\n  ');
  END IF;

  RAISE NOTICE 'RECONCILE OK — all counts, money sums and invariants match prod.';
END $$;

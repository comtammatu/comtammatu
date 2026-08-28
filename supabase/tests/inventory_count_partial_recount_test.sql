\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_request text;
  v_blind text;
  v_resubmit text;
  v_approve text;
BEGIN
  SELECT pg_get_functiondef(
    'public.request_inventory_count_line_recount(bigint,text,bigint[])'::regprocedure
  ) INTO v_request;
  SELECT pg_get_functiondef(
    'public.get_my_count_slip_recount(bigint)'::regprocedure
  ) INTO v_blind;
  SELECT pg_get_functiondef(
    'public.resubmit_inventory_count_slip_lines(bigint,integer,jsonb)'::regprocedure
  ) INTO v_resubmit;
  SELECT pg_get_functiondef(
    'private.execute_approve_inventory_count_slip(bigint)'::regprocedure
  ) INTO v_approve;

  IF v_request NOT LIKE '%FOR UPDATE%'
     OR v_request NOT LIKE '%recount_required = TRUE%'
     OR v_request NOT LIKE '%request_recount%' THEN
    RAISE EXCEPTION 'COUNT RECOUNT: request RPC misses lock, selected flags, or audit';
  END IF;

  IF v_blind ~ 'system_quantity|variance' THEN
    RAISE EXCEPTION 'COUNT RECOUNT: blind RPC leaks system quantity or variance';
  END IF;

  IF v_resubmit NOT LIKE '%recount_payload_set_mismatch%'
     OR v_resubmit NOT LIKE '%already_resubmitted%'
     OR v_resubmit NOT LIKE '%resubmit_recount%' THEN
    RAISE EXCEPTION 'COUNT RECOUNT: resubmit exact-set, retry, or audit guard missing';
  END IF;

  IF v_approve NOT LIKE '%recount_required%' THEN
    RAISE EXCEPTION 'COUNT RECOUNT: approval does not reject outstanding lines';
  END IF;
END;
$$;

DO $$
DECLARE
  v_tenant bigint;
  v_owner uuid;
  v_employee bigint;
  v_employee_profile uuid;
  v_employee_position text;
  v_branch bigint;
  v_location bigint;
  v_base_unit bigint;
  v_pack_unit bigint;
  v_ingredient_one bigint;
  v_ingredient_two bigint;
  v_slip bigint;
  v_line_one bigint;
  v_line_two bigint;
  v_system_one numeric;
  v_result jsonb;
  v_rejected boolean;
  v_audit_count integer;
BEGIN
  SELECT profile.tenant_id, profile.id
  INTO v_tenant, v_owner
  FROM public.profiles AS profile
  JOIN public.positions AS position
    ON position.id = profile.position_id
   AND position.tenant_id = profile.tenant_id
  WHERE position.code = 'owner'
    AND coalesce(profile.is_active, TRUE)
  ORDER BY profile.id
  LIMIT 1;

  SELECT employee.id, profile.id, position.code, profile.branch_id
  INTO v_employee, v_employee_profile, v_employee_position, v_branch
  FROM public.employees AS employee
  JOIN public.profiles AS profile
    ON profile.id = employee.profile_id
   AND profile.tenant_id = employee.tenant_id
  LEFT JOIN public.positions AS position
    ON position.id = profile.position_id
   AND position.tenant_id = profile.tenant_id
  WHERE employee.tenant_id = v_tenant
    AND employee.is_active IS TRUE
    AND profile.id <> v_owner
    AND profile.branch_id IS NOT NULL
  ORDER BY employee.id DESC
  LIMIT 1;

  SELECT location.id
  INTO v_location
  FROM public.inventory_locations AS location
  WHERE location.tenant_id = v_tenant
    AND location.branch_id = v_branch
    AND location.location_kind = 'warehouse'
    AND location.is_active IS TRUE
  ORDER BY location.id DESC
  LIMIT 1;

  IF v_owner IS NULL OR v_employee IS NULL OR v_location IS NULL THEN
    RAISE EXCEPTION 'COUNT RECOUNT: owner/employee/warehouse fixture required';
  END IF;

  INSERT INTO public.units (tenant_id, code, name)
  VALUES (
    v_tenant,
    '__recount_base_' || substr(gen_random_uuid()::text, 1, 8),
    'Recount base'
  ) RETURNING id INTO v_base_unit;

  INSERT INTO public.units (tenant_id, code, name)
  VALUES (
    v_tenant,
    '__recount_pack_' || substr(gen_random_uuid()::text, 1, 8),
    'Recount pack'
  ) RETURNING id INTO v_pack_unit;

  INSERT INTO public.ingredients (
    tenant_id, name, sku, item_kind, is_active,
    receipt_unit_id, issue_unit_id, production_unit_id
  ) VALUES (
    v_tenant,
    '__partial_recount_one__',
    '__rc1_' || substr(gen_random_uuid()::text, 1, 8),
    'raw_material',
    TRUE,
    v_base_unit,
    v_base_unit,
    v_base_unit
  ) RETURNING id INTO v_ingredient_one;

  INSERT INTO public.ingredients (
    tenant_id, name, sku, item_kind, is_active,
    receipt_unit_id, issue_unit_id, production_unit_id
  ) VALUES (
    v_tenant,
    '__partial_recount_two__',
    '__rc2_' || substr(gen_random_uuid()::text, 1, 8),
    'raw_material',
    TRUE,
    v_base_unit,
    v_base_unit,
    v_base_unit
  ) RETURNING id INTO v_ingredient_two;

  INSERT INTO public.ingredient_units (
    tenant_id, ingredient_id, unit_id, to_base_factor,
    is_base, is_active, sort_order
  ) VALUES
    (v_tenant, v_ingredient_one, v_base_unit, 1, TRUE, TRUE, 0),
    (v_tenant, v_ingredient_one, v_pack_unit, 5, FALSE, TRUE, 1),
    (v_tenant, v_ingredient_two, v_base_unit, 1, TRUE, TRUE, 0);

  INSERT INTO public.inventory_count_slips (
    tenant_id, branch_id, location_id, employee_id, count_date,
    status, submitted_by, submitted_at, slip_number
  ) VALUES (
    v_tenant, v_branch, v_location, v_employee, DATE '2099-08-28',
    'submitted', v_employee_profile, now(),
    '__PD-RECOUNT-' || substr(gen_random_uuid()::text, 1, 8)
  ) RETURNING id INTO v_slip;

  INSERT INTO public.inventory_count_slip_lines (
    tenant_id, slip_id, ingredient_id, system_quantity,
    counted_quantity, entry_unit_id, entry_to_base_factor,
    counted_base_quantity, note
  ) VALUES (
    v_tenant, v_slip, v_ingredient_one, 20, 18,
    v_base_unit, 1, 18, 'first original'
  ) RETURNING id, system_quantity INTO v_line_one, v_system_one;

  INSERT INTO public.inventory_count_slip_lines (
    tenant_id, slip_id, ingredient_id, system_quantity,
    counted_quantity, entry_unit_id, entry_to_base_factor,
    counted_base_quantity, note
  ) VALUES (
    v_tenant, v_slip, v_ingredient_two, 30, 30,
    v_base_unit, 1, 30, 'accepted original'
  ) RETURNING id INTO v_line_two;

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, TRUE);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', TRUE);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_owner::text,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object(
        'tenant_id', v_tenant,
        'user_role', 'owner',
        'position_code', 'owner'
      )
    )::text,
    TRUE
  );

  v_result := public.request_inventory_count_line_recount(
    v_slip,
    'Verify only the shortage line',
    ARRAY[v_line_one]
  );

  IF (v_result ->> 'recount_round')::integer <> 1
     OR NOT EXISTS (
       SELECT 1
       FROM public.inventory_count_slip_lines AS line
       WHERE line.id = v_line_one AND line.recount_required IS TRUE
     )
     OR EXISTS (
       SELECT 1
       FROM public.inventory_count_slip_lines AS line
       WHERE line.id = v_line_two AND line.recount_required IS TRUE
     ) THEN
    RAISE EXCEPTION 'COUNT RECOUNT: selected-line flags are incorrect';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_employee_profile::text, TRUE);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_employee_profile::text,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object(
        'tenant_id', v_tenant,
        'user_role', coalesce(v_employee_position, 'staff'),
        'position_code', coalesce(v_employee_position, 'staff')
      )
    )::text,
    TRUE
  );

  IF (SELECT count(*) FROM public.get_my_count_slip_recount(v_slip)) <> 2 THEN
    RAISE EXCEPTION 'COUNT RECOUNT: blind RPC did not return the full slip context';
  END IF;

  v_rejected := FALSE;
  BEGIN
    PERFORM public.resubmit_inventory_count_slip_lines(
      v_slip,
      1,
      jsonb_build_array(
        jsonb_build_object(
          'line_id', v_line_one,
          'counted_quantity', 4,
          'entry_unit_id', v_pack_unit
        ),
        jsonb_build_object(
          'line_id', v_line_two,
          'counted_quantity', 30,
          'entry_unit_id', v_base_unit
        )
      )
    );
  EXCEPTION WHEN SQLSTATE '22023' THEN
    v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'COUNT RECOUNT: extra payload line was accepted';
  END IF;

  v_result := public.resubmit_inventory_count_slip_lines(
    v_slip,
    1,
    jsonb_build_array(
      jsonb_build_object(
        'line_id', v_line_one,
        'counted_quantity', 4,
        'entry_unit_id', v_pack_unit,
        'note', 'four packs'
      )
    )
  );

  IF (v_result ->> 'already_resubmitted')::boolean IS TRUE
     OR NOT EXISTS (
       SELECT 1
       FROM public.inventory_count_slips AS slip
       WHERE slip.id = v_slip
         AND slip.status = 'submitted'
         AND slip.last_resubmitted_round = 1
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.inventory_count_slip_lines AS line
       WHERE line.id = v_line_one
         AND line.system_quantity = v_system_one
         AND line.counted_quantity = 4
         AND line.entry_unit_id = v_pack_unit
         AND line.entry_to_base_factor = 5
         AND line.counted_base_quantity = 20
         AND line.last_recount_round = 1
         AND line.recount_required IS FALSE
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.inventory_count_slip_lines AS line
       WHERE line.id = v_line_two
         AND line.system_quantity = 30
         AND line.counted_quantity = 30
         AND line.note = 'accepted original'
         AND line.last_recount_round = 0
     ) THEN
    RAISE EXCEPTION 'COUNT RECOUNT: resubmit mutated the snapshot or accepted line';
  END IF;

  v_result := public.resubmit_inventory_count_slip_lines(
    v_slip,
    1,
    jsonb_build_array(
      jsonb_build_object(
        'line_id', v_line_one,
        'counted_quantity', 999,
        'entry_unit_id', v_base_unit
      )
    )
  );
  IF (v_result ->> 'already_resubmitted')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'COUNT RECOUNT: successful round retry was not idempotent';
  END IF;

  SELECT count(*)::integer
  INTO v_audit_count
  FROM public.audit_logs AS audit
  WHERE audit.tenant_id = v_tenant
    AND audit.entity_type = 'inventory_count_slip'
    AND audit.entity_id = v_slip
    AND audit.action = 'resubmit_recount';
  IF v_audit_count <> 1 THEN
    RAISE EXCEPTION 'COUNT RECOUNT: retry duplicated audit rows';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, TRUE);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_owner::text,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object(
        'tenant_id', v_tenant,
        'user_role', 'owner',
        'position_code', 'owner'
      )
    )::text,
    TRUE
  );
  PERFORM public.request_inventory_count_line_recount(
    v_slip,
    'Second round for approval guard',
    ARRAY[v_line_two]
  );

  v_rejected := FALSE;
  BEGIN
    PERFORM private.execute_approve_inventory_count_slip(v_slip);
  EXCEPTION WHEN SQLSTATE '22023' THEN
    v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'COUNT RECOUNT: approval accepted an outstanding line';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_employee_profile::text, TRUE);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_employee_profile::text,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object(
        'tenant_id', v_tenant,
        'user_role', coalesce(v_employee_position, 'staff'),
        'position_code', coalesce(v_employee_position, 'staff')
      )
    )::text,
    TRUE
  );

  PERFORM public.resubmit_inventory_count_slip_lines(
    v_slip,
    2,
    jsonb_build_array(
      jsonb_build_object(
        'line_id', v_line_two,
        'counted_quantity', 29,
        'entry_unit_id', v_base_unit
      )
    )
  );

  v_rejected := FALSE;
  BEGIN
    PERFORM public.request_inventory_count_line_recount(
      v_slip,
      'Employee cannot review own slip',
      ARRAY[v_line_two]
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN
    v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'COUNT RECOUNT: employee requested own recount';
  END IF;
END;
$$;

ROLLBACK;

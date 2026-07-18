-- Cloud DEV only: minimal inventory and HR master fixture for G3c.
-- Apply only to Environment Registry ref xrsantkidwknjhcgcfmi.
-- Operational documents remain empty so browser flows create the evidence.

BEGIN;

DO $$
DECLARE
  v_tenant_id bigint;
  v_branch_id bigint;
  v_owner_id uuid;
  v_employee_id bigint;
  v_unit_id bigint;
  v_raw_ingredient_id bigint;
  v_finished_good_id bigint;
  v_location_id bigint;
  v_shift_id bigint;
BEGIN
  SELECT
    tenant.id,
    branch.id,
    profile.id,
    employee.id,
    unit.id,
    raw_ingredient.id,
    stock.location_id
  INTO STRICT
    v_tenant_id,
    v_branch_id,
    v_owner_id,
    v_employee_id,
    v_unit_id,
    v_raw_ingredient_id,
    v_location_id
  FROM public.tenants tenant
  JOIN public.branches branch
    ON branch.tenant_id = tenant.id
   AND branch.code = 'GF'
   AND branch.branch_kind = 'branch'
   AND branch.is_active = true
  JOIN public.profiles profile
    ON profile.tenant_id = tenant.id
   AND profile.branch_id = branch.id
   AND profile.is_active = true
  JOIN public.positions position
    ON position.id = profile.position_id
   AND position.tenant_id = tenant.id
   AND position.code = 'owner'
  JOIN public.employees employee
    ON employee.tenant_id = tenant.id
   AND employee.profile_id = profile.id
   AND employee.employee_code = 'GF-OWNER-001'
   AND employee.is_active = true
  JOIN public.ingredients raw_ingredient
    ON raw_ingredient.tenant_id = tenant.id
   AND raw_ingredient.sku = 'GF-QA-PORTION'
   AND raw_ingredient.item_kind = 'raw_material'
   AND raw_ingredient.is_active = true
  JOIN public.ingredient_units raw_unit
    ON raw_unit.tenant_id = tenant.id
   AND raw_unit.ingredient_id = raw_ingredient.id
   AND raw_unit.is_base = true
   AND raw_unit.is_active = true
  JOIN public.units unit
    ON unit.id = raw_unit.unit_id
   AND unit.tenant_id = tenant.id
   AND unit.code = 'portion'
  JOIN public.stock_levels stock
    ON stock.tenant_id = tenant.id
   AND stock.branch_id = branch.id
   AND stock.ingredient_id = raw_ingredient.id
   AND stock.current_quantity = 9
  JOIN public.inventory_locations location
    ON location.id = stock.location_id
   AND location.tenant_id = tenant.id
   AND location.branch_id = branch.id
   AND location.code = 'main_warehouse'
   AND location.is_active = true
  WHERE tenant.slug = 'comtammatu';

  IF EXISTS (SELECT 1 FROM public.suppliers)
     OR EXISTS (
       SELECT 1
       FROM public.branch_feature_flags
       WHERE branch_id = v_branch_id
         AND flag_key = 'inv_stocktake_redesigned'
     )
     OR EXISTS (SELECT 1 FROM public.goods_received_notes)
     OR EXISTS (SELECT 1 FROM public.production_recipes)
     OR EXISTS (SELECT 1 FROM public.production_runs)
     OR EXISTS (SELECT 1 FROM public.stocktake_sessions)
     OR EXISTS (SELECT 1 FROM public.employment_contracts)
     OR EXISTS (SELECT 1 FROM public.shifts)
     OR EXISTS (SELECT 1 FROM public.attendance_records)
     OR EXISTS (SELECT 1 FROM public.payroll_periods)
     OR EXISTS (SELECT 1 FROM public.payroll_entries) THEN
    RAISE EXCEPTION 'g3c_operating_spine_seed_requires_clean_slice';
  END IF;

  IF EXISTS (SELECT 1 FROM public.pos_sessions WHERE status = 'open')
     OR NOT EXISTS (
       SELECT 1
       FROM public.orders
       WHERE id = 1
         AND status = 'completed'
         AND payment_status = 'paid'
     ) THEN
    RAISE EXCEPTION 'g3c_operating_spine_seed_requires_g3b_attestation_state';
  END IF;

  INSERT INTO public.suppliers (
    tenant_id,
    name,
    notes,
    payment_terms_days,
    is_active
  )
  VALUES (
    v_tenant_id,
    'Greenfield G3c Supplier',
    'Cloud DEV G3c fixture',
    0,
    true
  );

  INSERT INTO public.branch_feature_flags (
    branch_id,
    flag_key,
    enabled,
    enabled_by,
    enabled_at,
    disabled_at,
    notes
  )
  VALUES (
    v_branch_id,
    'inv_stocktake_redesigned',
    true,
    v_owner_id,
    now(),
    null,
    'Cloud DEV G3c stocktake runtime fixture'
  );

  INSERT INTO public.ingredients (
    tenant_id,
    name,
    sku,
    unit_cost,
    category,
    min_stock_level,
    storage_type,
    is_active,
    item_kind
  )
  VALUES (
    v_tenant_id,
    'Greenfield G3c Finished Portion',
    'GF-G3C-FINISHED',
    20000,
    'greenfield_qa',
    0,
    'ambient',
    true,
    'finished_good'
  )
  RETURNING id INTO v_finished_good_id;

  INSERT INTO public.ingredient_units (
    tenant_id,
    ingredient_id,
    unit_id,
    to_base_factor,
    is_base,
    sort_order,
    is_active
  )
  VALUES (
    v_tenant_id,
    v_finished_good_id,
    v_unit_id,
    1,
    true,
    1,
    true
  );

  INSERT INTO public.production_recipes (
    tenant_id,
    finished_good_id,
    ingredient_id,
    quantity,
    yield_factor,
    entry_unit_id,
    note
  )
  VALUES (
    v_tenant_id,
    v_finished_good_id,
    v_raw_ingredient_id,
    2,
    1,
    v_unit_id,
    'Cloud DEV G3c two raw portions per finished portion'
  );

  INSERT INTO public.stock_levels (
    tenant_id,
    branch_id,
    ingredient_id,
    current_quantity,
    avg_unit_cost,
    location_id
  )
  VALUES (
    v_tenant_id,
    v_branch_id,
    v_finished_good_id,
    0,
    20000,
    v_location_id
  );

  INSERT INTO public.employment_contracts (
    tenant_id,
    employee_id,
    contract_type,
    contract_number,
    signed_date,
    start_date,
    gross_salary,
    insurance_base_salary,
    position,
    work_location,
    status
  )
  VALUES (
    v_tenant_id,
    v_employee_id,
    'indefinite',
    'GF-G3C-CONTRACT-001',
    DATE '2026-07-01',
    DATE '2026-07-01',
    26000000,
    0,
    'Greenfield Owner QA',
    'Greenfield Branch QA',
    'active'
  );

  INSERT INTO public.shifts (
    tenant_id,
    branch_id,
    name,
    start_time,
    end_time,
    is_active
  )
  VALUES (
    v_tenant_id,
    NULL,
    'Greenfield G3c Day Shift',
    TIME '08:00',
    TIME '17:00',
    true
  )
  RETURNING id INTO v_shift_id;

  INSERT INTO public.attendance_records (
    tenant_id,
    branch_id,
    employee_id,
    shift_id,
    date,
    check_in,
    check_out,
    status,
    method,
    code_verified,
    check_out_code_verified,
    note
  )
  VALUES (
    v_tenant_id,
    v_branch_id,
    v_employee_id,
    v_shift_id,
    DATE '2026-07-17',
    TIMESTAMPTZ '2026-07-17 08:00:00+07',
    TIMESTAMPTZ '2026-07-17 17:00:00+07',
    'present',
    'admin',
    true,
    true,
    'Cloud DEV G3c completed attendance fixture'
  );

  IF (SELECT count(*) FROM public.suppliers) <> 1
     OR NOT EXISTS (
       SELECT 1
       FROM public.branch_feature_flags
       WHERE branch_id = v_branch_id
         AND flag_key = 'inv_stocktake_redesigned'
         AND enabled = true
     )
     OR (SELECT count(*) FROM public.ingredients) <> 2
     OR (SELECT count(*) FROM public.production_recipes) <> 1
     OR (SELECT count(*) FROM public.stock_levels) <> 2
     OR (SELECT count(*) FROM public.employment_contracts) <> 1
     OR (SELECT count(*) FROM public.shifts WHERE branch_id IS NULL) <> 1
     OR (SELECT count(*) FROM public.attendance_records) <> 1
     OR EXISTS (SELECT 1 FROM public.goods_received_notes)
     OR EXISTS (SELECT 1 FROM public.production_runs)
     OR EXISTS (SELECT 1 FROM public.stocktake_sessions)
     OR EXISTS (SELECT 1 FROM public.payroll_periods)
     OR EXISTS (SELECT 1 FROM public.payroll_entries) THEN
    RAISE EXCEPTION 'g3c_operating_spine_seed_postcondition_failed';
  END IF;
END;
$$;

COMMIT;

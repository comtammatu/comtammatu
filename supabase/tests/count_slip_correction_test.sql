\set ON_ERROR_STOP on
BEGIN;

-- Bootstrap an isolated synthetic tenant; application triggers are restored
-- before every movement and correction under test. All fixture data rolls back.
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users(id) VALUES ('c7310000-0000-4000-8000-000000000001');
INSERT INTO public.tenants(id,name,slug,owner_user_id) OVERRIDING SYSTEM VALUE
VALUES (9731,'Correction fixture','correction-fixture','c7310000-0000-4000-8000-000000000001');
INSERT INTO public.branches(id,tenant_id,name,code) OVERRIDING SYSTEM VALUE
VALUES (9749,9731,'Correction branch','CRCT');
INSERT INTO public.positions(id,tenant_id,code,label_vi) OVERRIDING SYSTEM VALUE
VALUES (9761,9731,'owner','Chủ sở hữu');
INSERT INTO public.profiles(id,tenant_id,branch_id,full_name,position_id)
VALUES ('c7310000-0000-4000-8000-000000000001',9731,9749,'Correction fixture',9761);
INSERT INTO public.auth_role_bindings(tenant_id,user_id,role_code,scope_type)
VALUES (9731,'c7310000-0000-4000-8000-000000000001','tenant_owner','tenant');
INSERT INTO public.employees(id,tenant_id,profile_id) OVERRIDING SYSTEM VALUE
VALUES (9773,9731,'c7310000-0000-4000-8000-000000000001');
INSERT INTO public.inventory_locations(id,tenant_id,branch_id,code,name,location_kind) OVERRIDING SYSTEM VALUE
VALUES (9787,9731,9749,'correction-kitchen','Bếp','kitchen'),
       (9791,9731,9749,'correction-warehouse','Kho','warehouse');
INSERT INTO public.units(id,tenant_id,code,name) OVERRIDING SYSTEM VALUE
VALUES (9803,9731,'cái','Cái'),(9811,9731,'bao','Bao');
INSERT INTO public.ingredients(id,tenant_id,name,receipt_unit_id,issue_unit_id,unit_cost) OVERRIDING SYSTEM VALUE
VALUES (9829,9731,'Correction towel',9803,9803,500);
INSERT INTO public.ingredient_units(tenant_id,ingredient_id,unit_id,to_base_factor,is_base)
VALUES (9731,9829,9803,1,true),(9731,9829,9811,2500,false);
INSERT INTO public.stock_levels(tenant_id,branch_id,location_id,ingredient_id,current_quantity,avg_unit_cost)
VALUES (9731,9749,9787,9829,0,500),(9731,9749,9791,9829,100,500);
INSERT INTO public.inventory_count_slips(id,tenant_id,branch_id,location_id,employee_id,count_date,status,slip_number)
OVERRIDING SYSTEM VALUE VALUES (9839,9731,9749,9787,9773,current_date,'approved','PD-CORRECTION-FIXTURE');
INSERT INTO public.inventory_count_slip_lines(id,tenant_id,slip_id,ingredient_id,system_quantity,
  counted_quantity,entry_unit_id,entry_to_base_factor,counted_base_quantity)
OVERRIDING SYSTEM VALUE VALUES (9851,9731,9839,9829,4131,4067,9811,2500,10167500);
INSERT INTO public.inventory_valuation_cutovers(tenant_id,status,cutoff_at)
VALUES (9731,'active',now() - interval '1 day');
SET LOCAL session_replication_role = origin;

DO $$
DECLARE
  v_source bigint;
  v_consumption bigint;
  v_result bigint;
  v_retry bigint;
  v_quantity numeric;
  v_value numeric;
  v_claims text := '{"sub":"c7310000-0000-4000-8000-000000000001","app_metadata":{"tenant_id":9731,"branch_id":9749,"user_role":"owner","position_code":"owner"}}';
BEGIN
  INSERT INTO public.stock_movements(tenant_id,branch_id,location_id,ingredient_id,type,
    quantity_change,entry_quantity,entry_unit_id,unit_cost,reason,created_by)
  VALUES (9731,9749,9787,9829,'adjustment',4131,4131,9803,500,'Fixture opening','c7310000-0000-4000-8000-000000000001');
  INSERT INTO public.stock_movements(tenant_id,branch_id,location_id,ingredient_id,type,
    quantity_change,entry_quantity,entry_unit_id,unit_cost,reason,created_by)
  VALUES (9731,9749,9787,9829,'count_adjustment',10163369,10163369,9803,500,
    'Điều chỉnh tồn dương phiếu đếm #PD-CORRECTION-FIXTURE (discrepancy)','c7310000-0000-4000-8000-000000000001') RETURNING id INTO v_source;
  INSERT INTO public.stock_movements(tenant_id,branch_id,location_id,ingredient_id,type,
    quantity_change,entry_quantity,entry_unit_id,unit_cost,reason,created_by)
  VALUES (9731,9749,9787,9829,'consumption',-8,8,9803,500,'Fixture consumption','c7310000-0000-4000-8000-000000000001') RETURNING id INTO v_consumption;

  -- An unauthenticated batch cannot mutate the fixture.
  BEGIN
    PERFORM public.correct_posted_count_lines('[]','Correct count fixture');
    RAISE EXCEPTION 'TEST unauthenticated correction accepted';
  EXCEPTION WHEN invalid_authorization_specification THEN NULL;
  END;
  IF has_function_privilege('anon','public.correct_posted_count_lines(jsonb,text)','EXECUTE')
     OR has_function_privilege('authenticated','private.correct_posted_count_line(bigint,bigint,numeric,numeric,bigint,text,uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'TEST correction grants leak';
  END IF;
  BEGIN
    PERFORM private.correct_posted_count_line(9851,v_source,1,4067,9803,
      'Correct count fixture','c7310000-0000-4000-8000-000000000002','c7310000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'TEST stale source accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  PERFORM set_config('request.jwt.claims',v_claims,true);
  -- A later invalid line rolls back the first correction in the same batch.
  BEGIN
    PERFORM public.correct_posted_count_lines(jsonb_build_array(
      jsonb_build_object('line_id',9851,'source_movement_id',v_source,
        'expected_base_quantity',10167500,'quantity',4067,'unit_id',9803,
        'idempotency_key','c7310000-0000-4000-8000-000000000002'),
      jsonb_build_object('line_id',999999,'source_movement_id',v_source)
    ),'Correct count fixture');
    RAISE EXCEPTION 'TEST partial batch accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF EXISTS (SELECT 1 FROM private.count_slip_corrections WHERE tenant_id=9731) THEN
    RAISE EXCEPTION 'TEST failed batch was not atomic';
  END IF;

  v_result := (public.correct_posted_count_lines(jsonb_build_array(
    jsonb_build_object('line_id',9851,'source_movement_id',v_source,
      'expected_base_quantity',10167500,'quantity',4067,'unit_id',9803,
      'idempotency_key','c7310000-0000-4000-8000-000000000002')
  ),'Correct count fixture') -> 'movement_ids' ->> 0)::bigint;
  SELECT current_quantity INTO v_quantity FROM public.stock_levels
    WHERE tenant_id=9731 AND location_id=9787 AND ingredient_id=9829;
  IF v_quantity <> 4059 THEN RAISE EXCEPTION 'TEST consumed stock lost: %',v_quantity; END IF;
  IF (SELECT current_quantity FROM public.stock_levels WHERE tenant_id=9731 AND location_id=9791 AND ingredient_id=9829) <> 100 THEN
    RAISE EXCEPTION 'TEST wrong warehouse changed';
  END IF;
  SELECT quantity,book_value INTO v_quantity,v_value FROM public.inventory_valuation_accounts
    WHERE tenant_id=9731 AND location_id=9787 AND ingredient_id=9829;
  IF v_quantity <> 4059 OR v_value <> 2029500 THEN
    RAISE EXCEPTION 'TEST valuation mismatch: % / %',v_quantity,v_value;
  END IF;
  IF EXISTS (SELECT 1 FROM public.inventory_value_allocations a
      JOIN public.inventory_valuation_events e ON e.id=a.valuation_event_id
      WHERE e.stock_movement_id=v_result AND a.allocation_bucket IN ('food_cost','waste')) THEN
    RAISE EXCEPTION 'TEST correction classified as consumption';
  END IF;
  IF (SELECT quantity_change FROM public.stock_movements WHERE id=v_consumption) <> -8 THEN
    RAISE EXCEPTION 'TEST historical consumption changed';
  END IF;
  v_retry := private.correct_posted_count_line(9851,v_source,10167500,4067,9803,
    'Correct count fixture','c7310000-0000-4000-8000-000000000002','c7310000-0000-4000-8000-000000000001');
  IF v_retry <> v_result THEN RAISE EXCEPTION 'TEST retry duplicated correction'; END IF;
  BEGIN
    PERFORM private.correct_posted_count_line(9851,v_source,10167500,4066,9803,
      'Correct count fixture','c7310000-0000-4000-8000-000000000002','c7310000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'TEST mismatched retry accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END;
$$;
ROLLBACK;

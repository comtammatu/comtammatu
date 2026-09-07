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
VALUES (9829,9731,'Khăn lạnh vải Alex',9803,9803,500);
INSERT INTO public.ingredient_units(tenant_id,ingredient_id,unit_id,to_base_factor,is_base)
VALUES (9731,9829,9803,1,true),(9731,9829,9811,2500,false);
INSERT INTO public.stock_levels(tenant_id,branch_id,location_id,ingredient_id,current_quantity,avg_unit_cost)
VALUES (9731,9749,9787,9829,0,500),(9731,9749,9791,9829,100,500);
INSERT INTO public.inventory_count_slips(id,tenant_id,branch_id,location_id,employee_id,count_date,status,slip_number)
OVERRIDING SYSTEM VALUE VALUES (9839,9731,9749,9787,9773,current_date,'approved','PD-06092026-0134');
INSERT INTO public.inventory_count_slip_lines(id,tenant_id,slip_id,ingredient_id,system_quantity,
  counted_quantity,entry_unit_id,entry_to_base_factor,counted_base_quantity)
OVERRIDING SYSTEM VALUE VALUES (9851,9731,9839,9829,4131,4067,9811,2500,10167500);
INSERT INTO public.inventory_valuation_cutovers(tenant_id,status,cutoff_at)
VALUES (9731,'active',now() - interval '1 day');


INSERT INTO public.units(id,tenant_id,code,name) OVERRIDING SYSTEM VALUE
VALUES (9869,9731,'g','Gram'),(9871,9731,'kg','Kilogram'),(9877,9731,'ml','Mililit'),(9883,9731,'l','Lít');
INSERT INTO public.ingredients(id,tenant_id,name,receipt_unit_id,issue_unit_id,unit_cost) OVERRIDING SYSTEM VALUE
VALUES (9901,9731,'Trái cam',9869,9869,18),(9907,9731,'Nước đường',9877,9877,7.5460075),
       (9923,9731,'Trái tắc',9871,9871,16000);
INSERT INTO public.ingredient_units(tenant_id,ingredient_id,unit_id,to_base_factor,is_base)
VALUES (9731,9901,9869,1,true),(9731,9901,9871,1000,false),
       (9731,9907,9877,1,true),(9731,9907,9883,1000,false),(9731,9923,9871,1,true);
INSERT INTO public.inventory_count_slips(id,tenant_id,branch_id,location_id,employee_id,count_date,status,slip_number)
OVERRIDING SYSTEM VALUE VALUES (9847,9731,9749,9787,9773,current_date-1,'approved','PD-06092026-0136');
INSERT INTO public.inventory_count_slip_lines(id,tenant_id,slip_id,ingredient_id,system_quantity,
  counted_quantity,entry_unit_id,entry_to_base_factor,counted_base_quantity)
OVERRIDING SYSTEM VALUE VALUES (9951,9731,9847,9901,1200,3542,9871,1000,3542000),
  (9953,9731,9847,9907,3700,2520,9883,1000,2520000),(9959,9731,9847,9923,4.4,1050,9871,1,1050);
SET LOCAL session_replication_role = origin;
DO $fixture$
DECLARE v record;
BEGIN
  FOR v IN SELECT * FROM (VALUES
    (9829,9803,4131::numeric,10163369::numeric,8::numeric,500::numeric,'PD-06092026-0134'),
    (9901,9869,1200::numeric,3540800::numeric,1500::numeric,18::numeric,'PD-06092026-0136'),
    (9907,9877,3700::numeric,2516300::numeric,0::numeric,7.5460075::numeric,'PD-06092026-0136'),
    (9923,9871,4.4::numeric,1045.6::numeric,0::numeric,16000::numeric,'PD-06092026-0136')
  ) x(ingredient_id,unit_id,opening,surplus,consumed,unit_cost,slip_number)
  LOOP
    INSERT INTO public.stock_movements(tenant_id,branch_id,location_id,ingredient_id,type,quantity_change,
      entry_unit_id,entry_quantity,unit_cost,reason,created_by)
    VALUES (9731,9749,9787,v.ingredient_id,'adjustment',v.opening,v.unit_id,v.opening,v.unit_cost,
      'Fixture opening','c7310000-0000-4000-8000-000000000001'),
      (9731,9749,9787,v.ingredient_id,'count_adjustment',v.surplus,v.unit_id,v.surplus,v.unit_cost,
      'Điều chỉnh tồn dương phiếu đếm #' || v.slip_number || ' (discrepancy)','c7310000-0000-4000-8000-000000000001');
    IF v.consumed > 0 THEN
      INSERT INTO public.stock_movements(tenant_id,branch_id,location_id,ingredient_id,type,quantity_change,
        entry_unit_id,entry_quantity,unit_cost,reason,created_by)
      VALUES (9731,9749,9787,v.ingredient_id,'consumption',-v.consumed,v.unit_id,v.consumed,v.unit_cost,
        'Fixture subsequent consumption','c7310000-0000-4000-8000-000000000001');
    END IF;
  END LOOP;
END;
$fixture$;

\ir ../migrations/20260907112924_repair_count_slip_entry_quantities.sql
\ir ../migrations/20260907112924_repair_count_slip_entry_quantities.sql

DO $assert$
BEGIN
  IF (SELECT count(*) FROM private.count_slip_corrections WHERE tenant_id=9731) <> 4 THEN
    RAISE EXCEPTION 'TEST four corrections required';
  END IF;
  IF EXISTS (
    SELECT 1 FROM (VALUES (9829,4059::numeric),(9901,2042::numeric),(9907,2520::numeric),(9923,1.05::numeric)) x(id,expected)
    LEFT JOIN public.stock_levels s ON s.tenant_id=9731 AND s.location_id=9787 AND s.ingredient_id=x.id
    WHERE s.current_quantity IS DISTINCT FROM x.expected
  ) THEN RAISE EXCEPTION 'TEST corrected quantities do not preserve consumption'; END IF;
END;
$assert$;
ROLLBACK;

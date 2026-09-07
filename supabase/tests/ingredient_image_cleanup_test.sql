-- Disposable Preview only; fixtures are rolled back with the test transaction.
BEGIN;
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
VALUES ('6e5c32a2-aa22-4519-8218-714d45493351','authenticated','authenticated','cleanup@example.invalid','{}','{}');
INSERT INTO public.tenants(id,name,slug,owner_user_id) OVERRIDING SYSTEM VALUE
VALUES (947,'Cleanup fixture','cleanup-fixture-947','6e5c32a2-aa22-4519-8218-714d45493351');
INSERT INTO public.positions(id,tenant_id,code,label_vi) OVERRIDING SYSTEM VALUE
VALUES (952,947,'central_supply_ops','Kiểm thử');
INSERT INTO public.profiles(id,tenant_id,position_id,full_name)
VALUES ('6e5c32a2-aa22-4519-8218-714d45493351',947,952,'Cleanup fixture');
INSERT INTO public.units(id,tenant_id,code,name) OVERRIDING SYSTEM VALUE
VALUES (961,947,'cleanup_each','Kiểm thử');
SET LOCAL session_replication_role = origin;

INSERT INTO storage.objects(bucket_id,name,metadata,created_at) VALUES
('inventory-attachments','947/ingredients/6e5c32a2-aa22-4519-8218-714d45493351/4558b8a8-17f5-4c47-bc7b-6e02e179aad1.webp','{"mimetype":"image/webp","size":1136}',now()-interval '25 hours'),
('inventory-attachments','947/ingredients/6e5c32a2-aa22-4519-8218-714d45493351/4558b8a8-17f5-4c47-bc7b-6e02e179aad2.webp','{"mimetype":"image/webp","size":1136}',now()-interval '23 hours'),
('inventory-attachments','947/grn/old-evidence.webp','{"mimetype":"image/webp","size":1136}',now()-interval '25 hours');

SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
DO $$
DECLARE v_paths text[];
BEGIN
  SELECT array_agg(object_name) INTO v_paths FROM public.claim_ingredient_image_cleanup(50);
  IF v_paths IS DISTINCT FROM ARRAY['947/ingredients/6e5c32a2-aa22-4519-8218-714d45493351/4558b8a8-17f5-4c47-bc7b-6e02e179aad1.webp'] THEN
    RAISE EXCEPTION 'Cleanup must select only old catalog orphans';
  END IF;
  IF public.finish_ingredient_image_cleanup(v_paths) <> 0 THEN
    RAISE EXCEPTION 'Cleanup cannot acknowledge an object that still exists';
  END IF;
  IF (SELECT count(*) FROM public.claim_ingredient_image_cleanup(50)) <> 1 THEN
    RAISE EXCEPTION 'Failed deletion must remain retryable';
  END IF;
  BEGIN
    PERFORM public.claim_ingredient_image_cleanup(101);
    RAISE EXCEPTION 'Unbounded cleanup accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END;
$$;
RESET ROLE;

SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"6e5c32a2-aa22-4519-8218-714d45493351","iss":"https://cleanup-fixture.supabase.co/auth/v1"}',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.claim_ingredient_image_cleanup(50);
    RAISE EXCEPTION 'Catalog actor ran system cleanup';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.save_ingredient_catalog(NULL,'Retired image',NULL,NULL,'raw_material','ambient',0,NULL,NULL,NULL,
      '[{"unit_id":961,"to_base_factor":1,"is_base":true}]',NULL,961,961,NULL,false,false,
      'https://cleanup-fixture.supabase.co/storage/v1/object/public/inventory-attachments/947/ingredients/6e5c32a2-aa22-4519-8218-714d45493351/4558b8a8-17f5-4c47-bc7b-6e02e179aad1.webp',true);
    RAISE EXCEPTION 'Claimed image was published';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END;
$$;
RESET ROLE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.ingredients WHERE tenant_id=947) THEN
    RAISE EXCEPTION 'Retired image failure did not roll back catalog creation';
  END IF;
  IF has_function_privilege('anon','public.claim_ingredient_image_cleanup(integer)','EXECUTE')
    OR has_function_privilege('authenticated','public.finish_ingredient_image_cleanup(text[])','EXECUTE') THEN
    RAISE EXCEPTION 'Cleanup execution leaked to public callers';
  END IF;
END;
$$;
ROLLBACK;

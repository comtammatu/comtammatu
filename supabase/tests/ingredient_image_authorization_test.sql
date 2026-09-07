-- Disposable Preview only. Independent synthetic identities; all data rolls back.
BEGIN;
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
VALUES
('3a1d2c40-9f22-40b6-8bc3-7c3db8f19461', 'authenticated', 'authenticated', 'catalog-image@example.invalid', '{}', '{}'),
('5cb72dbe-883d-49b1-968b-8b598d556f40', 'authenticated', 'authenticated', 'denied-image@example.invalid', '{}', '{}'),
('8bea7539-7fbd-47ab-a26d-45104702b9bb', 'authenticated', 'authenticated', 'foreign-image@example.invalid', '{}', '{}');
INSERT INTO public.tenants (id, name, slug, owner_user_id) OVERRIDING SYSTEM VALUE VALUES
(419, 'Image fixture', 'image-fixture-419', '3a1d2c40-9f22-40b6-8bc3-7c3db8f19461'),
(823, 'Foreign fixture', 'image-fixture-823', '8bea7539-7fbd-47ab-a26d-45104702b9bb');
INSERT INTO public.positions (id, tenant_id, code, label_vi) OVERRIDING SYSTEM VALUE VALUES
(617,419,'central_supply_ops','Kiểm thử'), (618,419,'image_denied','Kiểm thử'), (619,823,'central_supply_ops','Kiểm thử');
INSERT INTO public.profiles (id,tenant_id,position_id,full_name) VALUES
('3a1d2c40-9f22-40b6-8bc3-7c3db8f19461',419,617,'Catalog fixture'),
('5cb72dbe-883d-49b1-968b-8b598d556f40',419,618,'Denied fixture'),
('8bea7539-7fbd-47ab-a26d-45104702b9bb',823,619,'Foreign fixture');
INSERT INTO public.units (id,tenant_id,code,name) OVERRIDING SYSTEM VALUE VALUES (719,419,'image_each','Kiểm thử');
SET LOCAL session_replication_role = origin;
SELECT set_config('request.jwt.claims', '{"sub":"3a1d2c40-9f22-40b6-8bc3-7c3db8f19461","role":"authenticated","iss":"https://image-fixture.supabase.co/auth/v1"}', true);
SET LOCAL ROLE authenticated;
INSERT INTO storage.objects (bucket_id,name,metadata) VALUES
('inventory-attachments','419/ingredients/3a1d2c40-9f22-40b6-8bc3-7c3db8f19461/6ac71c37-d35d-4471-bce0-978b53724e12.webp','{"mimetype":"image/webp","size":1136}');
DO $$
DECLARE
  v_id bigint;
  v_count integer;
  v_path text := '419/ingredients/3a1d2c40-9f22-40b6-8bc3-7c3db8f19461/6ac71c37-d35d-4471-bce0-978b53724e12.webp';
  v_units jsonb := '[{"unit_id":719,"to_base_factor":1,"is_base":true}]';
BEGIN
  IF (SELECT count(*) FROM storage.objects WHERE name=v_path) <> 1 THEN
    RAISE EXCEPTION 'Uploader must see cleanup target';
  END IF;
  v_id := public.save_ingredient_catalog(NULL,'Image original',NULL,NULL,'raw_material','ambient',0,NULL,NULL,NULL,v_units,NULL,719,719,NULL,false,false,
    'https://image-fixture.supabase.co/storage/v1/object/public/inventory-attachments/' || v_path,true);
  PERFORM set_config('image_test.ingredient_id', v_id::text, true);
  BEGIN
    PERFORM public.save_ingredient_catalog(v_id,'Invalid replacement',NULL,NULL,'raw_material','ambient',0,NULL,NULL,NULL,v_units,NULL,719,719,NULL,false,false,
      'https://foreign.supabase.co/storage/v1/object/public/inventory-attachments/' || v_path,true);
    RAISE EXCEPTION 'Foreign origin publication unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF private.ingredient_image_delete_allowed(v_path) THEN RAISE EXCEPTION 'Referenced image allowed cleanup'; END IF;
  UPDATE storage.objects SET metadata='{"mimetype":"image/webp","size":10}' WHERE name=v_path;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN RAISE EXCEPTION 'Immutable image was overwritten'; END IF;
END;
$$;
RESET ROLE;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.ingredients WHERE id=current_setting('image_test.ingredient_id')::bigint AND name='Image original' AND image_url IS NOT NULL) THEN
    RAISE EXCEPTION 'Failed image publication must roll back catalog edits';
  END IF;
END;
$$;
SELECT set_config('request.jwt.claims', '{"sub":"5cb72dbe-883d-49b1-968b-8b598d556f40","role":"authenticated","iss":"https://image-fixture.supabase.co/auth/v1"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    INSERT INTO storage.objects(bucket_id,name,metadata) VALUES ('inventory-attachments','419/ingredients/5cb72dbe-883d-49b1-968b-8b598d556f40/6ac71c37-d35d-4471-bce0-978b53724e12.webp','{"mimetype":"image/webp","size":1136}');
    RAISE EXCEPTION 'Actor without catalog permission uploaded an image';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='inventory-attachments') THEN
    RAISE EXCEPTION 'Actor without catalog permission listed images';
  END IF;
END;
$$;
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"8bea7539-7fbd-47ab-a26d-45104702b9bb","role":"authenticated","iss":"https://image-fixture.supabase.co/auth/v1"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    INSERT INTO storage.objects(bucket_id,name,metadata) VALUES ('inventory-attachments','419/ingredients/8bea7539-7fbd-47ab-a26d-45104702b9bb/6ac71c37-d35d-4471-bce0-978b53724e12.webp','{"mimetype":"image/webp","size":1136}');
    RAISE EXCEPTION 'Foreign tenant uploaded into the catalog tenant';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='inventory-attachments') THEN
    RAISE EXCEPTION 'Foreign tenant listed catalog images';
  END IF;
END;
$$;
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"3a1d2c40-9f22-40b6-8bc3-7c3db8f19461","role":"authenticated","iss":"https://image-fixture.supabase.co/auth/v1"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_count integer;
BEGIN
  PERFORM public.save_ingredient_catalog(current_setting('image_test.ingredient_id')::bigint,'Image cleared',NULL,NULL,'raw_material','ambient',0,NULL,NULL,NULL,
    '[{"unit_id":719,"to_base_factor":1,"is_base":true}]',NULL,719,719,NULL,false,false,NULL,true);
  IF NOT private.ingredient_image_delete_allowed('419/ingredients/3a1d2c40-9f22-40b6-8bc3-7c3db8f19461/6ac71c37-d35d-4471-bce0-978b53724e12.webp') THEN RAISE EXCEPTION 'Unreferenced image cleanup denied'; END IF;
END;
$$;
RESET ROLE;
ROLLBACK;

-- Compact Greenfield branch identity gap burned by INSERT … ON CONFLICT seed:
-- Kho Tổng stayed id=1; conflict still consumed seq 2; Bếp Trung Tâm got id=3;
-- Nguyễn Hữu Thọ later got id=4. Target shape: 1 Kho Tổng, 2 Bếp TT, 3 NHT.
-- Idempotent: no-op when id=2 already exists or sites are not in the gap pattern.
-- branches.id is GENERATED ALWAYS, so rekey via park + OVERRIDING SYSTEM VALUE insert.

DO $$
DECLARE
  v_kitchen_id bigint;
  v_nht_id bigint;
  v_tmp constant bigint := 900001;
  v_tmp2 constant bigint := 900002;
  v_tenant_id bigint;
  v_kitchen_code text;
BEGIN
  SELECT b.id, b.tenant_id, b.code
  INTO v_kitchen_id, v_tenant_id, v_kitchen_code
  FROM public.branches AS b
  WHERE b.name = 'Bếp Trung Tâm'
    AND b.branch_kind = 'central_kitchen'
  LIMIT 1;

  IF v_kitchen_id = 3
     AND NOT EXISTS (SELECT 1 FROM public.branches WHERE id = 2) THEN
    INSERT INTO public.branches (id, tenant_id, name, branch_kind, is_active, code)
    OVERRIDING SYSTEM VALUE
    VALUES (v_tmp, v_tenant_id, '__tmp_branch_rekey_kitchen__', 'branch', FALSE, 'TMPK');

    DELETE FROM public.inventory_locations WHERE branch_id = v_tmp;
    DELETE FROM public.branch_feature_flags WHERE branch_id = v_tmp;

    UPDATE public.inventory_locations
    SET branch_id = v_tmp
    WHERE branch_id = 3;

    UPDATE public.branch_feature_flags
    SET branch_id = v_tmp
    WHERE branch_id = 3;

    UPDATE public.branches
    SET name = '__old_bep_tt__',
        code = CASE
          WHEN code IS NULL THEN NULL
          ELSE 'OLDB'
        END
    WHERE id = 3;

    INSERT INTO public.branches (
      id,
      tenant_id,
      name,
      address,
      phone,
      is_active,
      created_at,
      updated_at,
      branch_kind,
      latitude,
      longitude,
      timezone,
      code
    )
    OVERRIDING SYSTEM VALUE
    SELECT
      2,
      tenant_id,
      'Bếp Trung Tâm',
      address,
      phone,
      is_active,
      created_at,
      updated_at,
      branch_kind,
      latitude,
      longitude,
      timezone,
      v_kitchen_code
    FROM public.branches
    WHERE id = 3;

    DELETE FROM public.inventory_locations WHERE branch_id = 2;
    DELETE FROM public.branch_feature_flags WHERE branch_id = 2;

    UPDATE public.inventory_locations
    SET branch_id = 2
    WHERE branch_id = v_tmp;

    UPDATE public.branch_feature_flags
    SET branch_id = 2
    WHERE branch_id = v_tmp;

    DELETE FROM public.branches WHERE id = 3;
    DELETE FROM public.branches WHERE id = v_tmp;
  END IF;

  SELECT b.id, b.tenant_id
  INTO v_nht_id, v_tenant_id
  FROM public.branches AS b
  WHERE b.name = 'Nguyễn Hữu Thọ'
    AND b.branch_kind = 'branch'
  LIMIT 1;

  IF v_nht_id = 4
     AND NOT EXISTS (SELECT 1 FROM public.branches WHERE id = 3) THEN
    INSERT INTO public.branches (id, tenant_id, name, branch_kind, is_active, code)
    OVERRIDING SYSTEM VALUE
    VALUES (v_tmp2, v_tenant_id, '__tmp_branch_rekey_nht__', 'branch', FALSE, 'TMPN');

    DELETE FROM public.inventory_locations WHERE branch_id = v_tmp2;
    DELETE FROM public.branch_feature_flags WHERE branch_id = v_tmp2;

    UPDATE public.inventory_locations
    SET branch_id = v_tmp2
    WHERE branch_id = 4;

    UPDATE public.branch_feature_flags
    SET branch_id = v_tmp2
    WHERE branch_id = 4;

    UPDATE public.branches
    SET name = '__old_nht__',
        code = 'OLDN'
    WHERE id = 4;

    INSERT INTO public.branches (
      id,
      tenant_id,
      name,
      address,
      phone,
      is_active,
      created_at,
      updated_at,
      branch_kind,
      latitude,
      longitude,
      timezone,
      code
    )
    OVERRIDING SYSTEM VALUE
    SELECT
      3,
      tenant_id,
      'Nguyễn Hữu Thọ',
      address,
      phone,
      is_active,
      created_at,
      updated_at,
      branch_kind,
      latitude,
      longitude,
      timezone,
      'NHT'
    FROM public.branches
    WHERE id = 4;

    DELETE FROM public.inventory_locations WHERE branch_id = 3;
    DELETE FROM public.branch_feature_flags WHERE branch_id = 3;

    UPDATE public.inventory_locations
    SET branch_id = 3
    WHERE branch_id = v_tmp2;

    UPDATE public.branch_feature_flags
    SET branch_id = 3
    WHERE branch_id = v_tmp2;

    DELETE FROM public.branches WHERE id = 4;
    DELETE FROM public.branches WHERE id = v_tmp2;
  END IF;

  PERFORM setval(
    pg_get_serial_sequence('public.branches', 'id'),
    GREATEST((SELECT COALESCE(MAX(id), 1) FROM public.branches), 1),
    true
  );
END;
$$;

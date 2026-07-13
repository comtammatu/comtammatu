-- Merge duplicate HR position records (canonicalize aliases).
--
-- Canonical targets:
-- - central_kitchen_manager -> production_manager
-- - central_supply_manager -> warehouse_manager
-- - cashier_server -> cashier
-- - waiter -> cashier
--
-- Why:
-- - Some tenants still have legacy alias rows for the same role.
-- - This causes duplicate rows in HR lists and fragments task assignment.

CREATE TEMP TABLE duplicate_position_map (
  tenant_id bigint NOT NULL,
  old_code text NOT NULL,
  canonical_code text NOT NULL,
  old_position_id bigint NOT NULL,
  canonical_position_id bigint NOT NULL
) ON COMMIT DROP;

INSERT INTO duplicate_position_map (tenant_id, old_code, canonical_code, old_position_id, canonical_position_id)
SELECT
  old_pos.tenant_id,
  old_pos.code,
  canonical_pos.code,
  old_pos.id,
  canonical_pos.id
FROM public.positions old_pos
JOIN public.positions canonical_pos
  ON canonical_pos.tenant_id = old_pos.tenant_id
JOIN (
  VALUES
    ('central_kitchen_manager', 'production_manager'),
    ('central_supply_manager', 'warehouse_manager'),
    ('cashier_server', 'cashier'),
    ('waiter', 'cashier')
) m(old_code, canonical_code)
  ON old_pos.code = m.old_code
 AND canonical_pos.code = m.canonical_code;

-- Fail fast if an alias position exists without its canonical target.
DO $$
DECLARE
  missing_canonical bigint;
BEGIN
  SELECT COUNT(*) INTO missing_canonical
  FROM public.positions old_pos
  JOIN (
    VALUES
      ('central_kitchen_manager', 'production_manager'),
      ('central_supply_manager', 'warehouse_manager'),
    ('cashier_server', 'cashier'),
    ('waiter', 'cashier')
  ) m(old_code, canonical_code)
    ON old_pos.code = m.old_code
  LEFT JOIN public.positions canonical_pos
    ON canonical_pos.tenant_id = old_pos.tenant_id
   AND canonical_pos.code = m.canonical_code
  WHERE canonical_pos.id IS NULL;

  IF missing_canonical > 0 THEN
    RAISE EXCEPTION 'position merge blocked: % legacy alias position(s) have no canonical target', missing_canonical;
  END IF;
END;
$$;

-- 1) Repoint profiles to canonical positions.
UPDATE public.profiles p
SET position_id = m.canonical_position_id,
    updated_at = now()
FROM duplicate_position_map m
WHERE p.tenant_id = m.tenant_id
  AND p.position_id = m.old_position_id;

-- 2) Repoint position tasks to canonical positions, preserving existing canonical rows.
DELETE FROM public.position_shift_tasks old_task
USING public.position_shift_tasks canonical_task
JOIN duplicate_position_map m
  ON canonical_task.position_id = m.canonical_position_id
 AND canonical_task.tenant_id = m.tenant_id
WHERE old_task.tenant_id = m.tenant_id
  AND old_task.position_id = m.old_position_id
  AND old_task.sort_order = canonical_task.sort_order;

UPDATE public.position_shift_tasks old_task
SET position_id = m.canonical_position_id,
    updated_at = now()
FROM duplicate_position_map m
WHERE old_task.tenant_id = m.tenant_id
  AND old_task.position_id = m.old_position_id;

-- 3) Align role template metadata to avoid future alias reintroduction.
UPDATE public.role_templates rt
SET position_code = m.canonical_code,
    updated_at = now()
FROM duplicate_position_map m
WHERE rt.tenant_id = m.tenant_id
  AND rt.position_code = m.old_code;

-- 4) Normalize auth metadata for users that still carry legacy alias codes.
UPDATE auth.users au
SET raw_app_meta_data =
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          COALESCE(au.raw_app_meta_data, '{}'::jsonb),
          '{position}',
          to_jsonb(m.canonical_code),
          true
        ),
        '{position_code}',
        to_jsonb(m.canonical_code),
        true
      ),
      '{role}',
      to_jsonb(m.canonical_code),
      true
    ),
    '{access_bucket}',
    to_jsonb(CASE m.canonical_code
      WHEN 'cashier' THEN 'cashier'
      WHEN 'production_manager' THEN 'production_manager'
      WHEN 'warehouse_manager' THEN 'warehouse_manager'
      ELSE m.canonical_code
    END),
    true
  )
FROM duplicate_position_map m
WHERE au.raw_app_meta_data ->> 'position' = m.old_code
   OR au.raw_app_meta_data ->> 'position_code' = m.old_code
   OR au.raw_app_meta_data ->> 'role' = m.old_code
   OR au.raw_app_meta_data ->> 'access_bucket' = m.old_code;

-- 5) Remove legacy duplicate rows.
DELETE FROM public.positions po
USING duplicate_position_map m
WHERE po.id = m.old_position_id
  AND po.tenant_id = m.tenant_id;

DO $$
DECLARE
  remaining integer;
BEGIN
  SELECT COUNT(*) INTO remaining
  FROM public.positions p
  WHERE p.code IN ('central_kitchen_manager', 'central_supply_manager', 'cashier_server', 'waiter');

  IF remaining > 0 THEN
    RAISE EXCEPTION 'position merge incomplete: % legacy duplicate position row(s) remain', remaining;
  END IF;
END;
$$;

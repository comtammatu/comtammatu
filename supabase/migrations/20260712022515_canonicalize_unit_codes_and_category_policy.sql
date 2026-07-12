-- Keep machine identifiers stable and English while preserving Vietnamese
-- operator labels in the existing display-name column.
CREATE TEMP TABLE unit_canonical_updates (
  unit_id bigint PRIMARY KEY,
  new_code text NOT NULL,
  display_name text NOT NULL
) ON COMMIT DROP;

WITH mapping(old_code, new_code, display_name) AS (
  VALUES
    ('bao', 'sack', 'bao'),
    ('bịch', 'pouch', 'bịch'),
    ('bich', 'pouch', 'bịch'),
    ('cái', 'piece', 'cái'),
    ('cai', 'piece', 'cái'),
    ('can', 'jerrycan', 'can'),
    ('cây', 'stick', 'cây'),
    ('cay', 'stick', 'cây'),
    ('chai', 'bottle', 'chai'),
    ('gói', 'packet', 'gói'),
    ('goi', 'packet', 'gói'),
    ('hộp', 'box', 'hộp'),
    ('hop', 'box', 'hộp'),
    ('hũ', 'jar', 'hũ'),
    ('hu', 'jar', 'hũ'),
    ('khay', 'tray', 'khay'),
    ('lốc', 'multipack', 'lốc'),
    ('loc', 'multipack', 'lốc'),
    ('lon', 'tin_can', 'lon'),
    ('ly', 'cup', 'ly'),
    ('phần', 'portion', 'phần'),
    ('phan', 'portion', 'phần'),
    ('thùng', 'case', 'thùng'),
    ('thung', 'case', 'thùng'),
    ('trái', 'fruit', 'trái'),
    ('trai', 'fruit', 'trái'),
    ('túi', 'bag', 'túi'),
    ('tui', 'bag', 'túi'),
    ('vỉ', 'blister_pack', 'vỉ'),
    ('vi', 'blister_pack', 'vỉ')
)
INSERT INTO unit_canonical_updates (unit_id, new_code, display_name)
SELECT u.id, mapping.new_code, mapping.display_name
FROM public.units u
JOIN mapping ON mapping.old_code = u.code;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM unit_canonical_updates target
    JOIN public.units source ON source.id = target.unit_id
    GROUP BY source.tenant_id, target.new_code
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'unit_canonical_duplicate_source_codes';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unit_canonical_updates target
    JOIN public.units source ON source.id = target.unit_id
    JOIN public.units existing
      ON existing.tenant_id = source.tenant_id
     AND existing.code = target.new_code
     AND existing.id <> source.id
    LEFT JOIN unit_canonical_updates moving ON moving.unit_id = existing.id
    WHERE moving.unit_id IS NULL
  ) THEN
    RAISE EXCEPTION 'unit_canonical_code_collision';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unit_canonical_updates target
    JOIN public.units source ON source.id = target.unit_id
    JOIN public.units existing
      ON existing.tenant_id = source.tenant_id
     AND existing.code = 'zz_canonical_unit_20260712_' || target.unit_id::text
     AND existing.id <> source.id
  ) THEN
    RAISE EXCEPTION 'unit_canonical_temporary_code_collision';
  END IF;
END;
$$;

-- Move every affected row out of the unique-key namespace before assigning
-- final codes. This also handles swaps between ambiguous source code names.
UPDATE public.units u
SET code = 'zz_canonical_unit_20260712_' || u.id::text
FROM unit_canonical_updates target
WHERE target.unit_id = u.id;

UPDATE public.units u
SET code = target.new_code,
    name = target.display_name
FROM unit_canonical_updates target
WHERE target.unit_id = u.id;

UPDATE public.units
SET name = CASE code
  WHEN 'g' THEN 'Gam'
  WHEN 'kg' THEN 'Ki-lô-gam'
  WHEN 'mg' THEN 'Mi-li-gam'
  WHEN 'ml' THEN 'Mi-li-lít'
  WHEN 'l' THEN 'Lít'
  WHEN 'cl' THEN 'Xen-ti-lít'
  ELSE name
END
WHERE code IN ('g', 'kg', 'mg', 'ml', 'l', 'cl');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.units
    WHERE code !~ '^[a-z][a-z0-9_]*$'
  ) THEN
    RAISE EXCEPTION 'unit_machine_code_residue';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.units'::regclass
      AND conname = 'units_code_machine_chk'
  ) THEN
    ALTER TABLE public.units
      ADD CONSTRAINT units_code_machine_chk
      CHECK (code ~ '^[a-z][a-z0-9_]*$');
  END IF;
END;
$$;

COMMENT ON COLUMN public.units.code IS
  'Stable English machine identifier. Lowercase snake_case only.';
COMMENT ON COLUMN public.units.name IS
  'Vietnamese operator-facing display label.';

-- Category review policy must follow the category identity, not its mutable
-- display name.
ALTER TABLE public.ingredient_category_review_policy
  ADD COLUMN category_id bigint;

UPDATE public.ingredient_category_review_policy policy
SET category_id = category.id
FROM public.ingredient_categories category
WHERE category.tenant_id = policy.tenant_id
  AND category.name = policy.category;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.ingredient_category_review_policy
    WHERE category_id IS NULL
  ) THEN
    RAISE EXCEPTION 'ingredient_category_review_policy_unmapped_category';
  END IF;
END;
$$;

ALTER TABLE public.ingredient_category_review_policy
  ALTER COLUMN category_id SET NOT NULL,
  DROP CONSTRAINT ingredient_category_review_policy_pkey,
  ADD CONSTRAINT ingredient_category_review_policy_pkey
    PRIMARY KEY (tenant_id, category_id),
  ADD CONSTRAINT ingredient_category_review_policy_category_tenant_fkey
    FOREIGN KEY (category_id, tenant_id)
    REFERENCES public.ingredient_categories (id, tenant_id)
    ON DELETE CASCADE
    NOT VALID;

ALTER TABLE public.ingredient_category_review_policy
  VALIDATE CONSTRAINT ingredient_category_review_policy_category_tenant_fkey;

ALTER TABLE public.ingredient_category_review_policy
  DROP COLUMN category;

COMMENT ON TABLE public.ingredient_category_review_policy IS
  'Per-tenant, per-category-id default for the GRN manual-review decision.';

CREATE OR REPLACE FUNCTION public.inventory_requires_manual_review(
  p_ingredient_id bigint
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH ing AS (
    SELECT tenant_id, category_id, review_override
    FROM public.ingredients
    WHERE id = p_ingredient_id
  )
  SELECT COALESCE(
    (SELECT review_override FROM ing),
    (SELECT policy.requires_manual_review
     FROM ing
     LEFT JOIN public.ingredient_category_review_policy policy
       ON policy.tenant_id = ing.tenant_id
      AND policy.category_id = ing.category_id),
    false
  );
$function$;

COMMENT ON FUNCTION public.inventory_requires_manual_review(bigint) IS
  'Effective manual-review flag: item override, then category-id policy, then false.';

REVOKE ALL ON FUNCTION public.inventory_requires_manual_review(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inventory_requires_manual_review(bigint)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_requires_manual_review(bigint)
  TO service_role;

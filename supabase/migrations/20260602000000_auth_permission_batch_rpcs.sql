-- =============================================================
-- Auth v2 hot path: batch permission probes
--
-- These RPCs preserve has_permission()/has_permission_any() semantics while
-- collapsing common "does this user have any/all of these keys?" checks from
-- N PostgREST roundtrips into one database call.
-- =============================================================

CREATE OR REPLACE FUNCTION public.has_any_permissions_any(p_keys TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH actor AS (
    SELECT auth.uid() AS uid
  ),
  input AS (
    SELECT COALESCE(
      array_agg(DISTINCT t.key) FILTER (WHERE t.key IS NOT NULL AND t.key <> ''),
      ARRAY[]::TEXT[]
    ) AS keys
    FROM unnest(COALESCE(p_keys, ARRAY[]::TEXT[])) AS t(key)
  )
  SELECT
    cardinality(i.keys) > 0
    AND (
      public._auth_v2_is_owner(a.uid)
      OR EXISTS (
        SELECT 1
        FROM public.staff_permissions sp
        WHERE sp.user_id = a.uid
          AND sp.permission_key = ANY(i.keys)
          AND sp.valid_from <= now()
          AND (sp.valid_until IS NULL OR sp.valid_until > now())
      )
    )
  FROM actor a, input i;
$$;

CREATE OR REPLACE FUNCTION public.has_all_permissions_any(p_keys TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH actor AS (
    SELECT auth.uid() AS uid
  ),
  input AS (
    SELECT COALESCE(
      array_agg(DISTINCT t.key) FILTER (WHERE t.key IS NOT NULL AND t.key <> ''),
      ARRAY[]::TEXT[]
    ) AS keys
    FROM unnest(COALESCE(p_keys, ARRAY[]::TEXT[])) AS t(key)
  )
  SELECT
    cardinality(i.keys) = 0
    OR public._auth_v2_is_owner(a.uid)
    OR NOT EXISTS (
      SELECT 1
      FROM unnest(i.keys) AS required(key)
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.staff_permissions sp
        WHERE sp.user_id = a.uid
          AND sp.permission_key = required.key
          AND sp.valid_from <= now()
          AND (sp.valid_until IS NULL OR sp.valid_until > now())
      )
    )
  FROM actor a, input i;
$$;

CREATE OR REPLACE FUNCTION public.has_any_permissions_for_branch(
  p_branch_id BIGINT,
  p_keys TEXT[]
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH actor AS (
    SELECT auth.uid() AS uid
  ),
  input AS (
    SELECT COALESCE(
      array_agg(DISTINCT t.key) FILTER (WHERE t.key IS NOT NULL AND t.key <> ''),
      ARRAY[]::TEXT[]
    ) AS keys
    FROM unnest(COALESCE(p_keys, ARRAY[]::TEXT[])) AS t(key)
  )
  SELECT
    cardinality(i.keys) > 0
    AND (
      public._auth_v2_is_owner(a.uid)
      OR EXISTS (
        SELECT 1
        FROM public.staff_permissions sp
        WHERE sp.user_id = a.uid
          AND sp.permission_key = ANY(i.keys)
          AND (sp.branch_id = p_branch_id OR sp.branch_id IS NULL)
          AND sp.valid_from <= now()
          AND (sp.valid_until IS NULL OR sp.valid_until > now())
      )
    )
  FROM actor a, input i;
$$;

CREATE OR REPLACE FUNCTION public.has_all_permissions_for_branch(
  p_branch_id BIGINT,
  p_keys TEXT[]
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH actor AS (
    SELECT auth.uid() AS uid
  ),
  input AS (
    SELECT COALESCE(
      array_agg(DISTINCT t.key) FILTER (WHERE t.key IS NOT NULL AND t.key <> ''),
      ARRAY[]::TEXT[]
    ) AS keys
    FROM unnest(COALESCE(p_keys, ARRAY[]::TEXT[])) AS t(key)
  )
  SELECT
    cardinality(i.keys) = 0
    OR public._auth_v2_is_owner(a.uid)
    OR NOT EXISTS (
      SELECT 1
      FROM unnest(i.keys) AS required(key)
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.staff_permissions sp
        WHERE sp.user_id = a.uid
          AND sp.permission_key = required.key
          AND (sp.branch_id = p_branch_id OR sp.branch_id IS NULL)
          AND sp.valid_from <= now()
          AND (sp.valid_until IS NULL OR sp.valid_until > now())
      )
    )
  FROM actor a, input i;
$$;

REVOKE ALL ON FUNCTION public.has_any_permissions_any(TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_all_permissions_any(TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_any_permissions_for_branch(BIGINT, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_all_permissions_for_branch(BIGINT, TEXT[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.has_any_permissions_any(TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_all_permissions_any(TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_permissions_for_branch(BIGINT, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_all_permissions_for_branch(BIGINT, TEXT[]) TO authenticated;

COMMENT ON FUNCTION public.has_any_permissions_any(TEXT[]) IS
  'Batch version of has_permission_any(key): true when current user has at least one active grant for any supplied key in any branch, with owner bypass.';
COMMENT ON FUNCTION public.has_all_permissions_any(TEXT[]) IS
  'Batch ALL version of has_permission_any(key): true when current user has every supplied key in any branch, with owner bypass.';
COMMENT ON FUNCTION public.has_any_permissions_for_branch(BIGINT, TEXT[]) IS
  'Batch version of has_permission(branch, key): true when current user has at least one supplied key for the branch or tenant-wide scope, with owner bypass.';
COMMENT ON FUNCTION public.has_all_permissions_for_branch(BIGINT, TEXT[]) IS
  'Batch ALL version of has_permission(branch, key): true when current user has every supplied key for the branch or tenant-wide scope, with owner bypass.';

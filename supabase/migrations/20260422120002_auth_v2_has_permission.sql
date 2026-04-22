-- =============================================================
-- Auth v2 — M1: RLS helpers
-- has_permission(branch_id, key) — STABLE + SECURITY DEFINER (plan-cacheable, bypass staff_permissions RLS)
-- has_position(code)             — STABLE + SECURITY DEFINER
--
-- Transition semantics (M1–M3):
--   Owner shortcut reads BOTH legacy profiles.role AND new profiles.position_id.
--   Non-owner check reads staff_permissions only (empty until M2 backfill → new RLS not yet live).
--
-- Post-cutover (M4+): legacy role column path removed when M5 drops it.
-- =============================================================

-- =====================
-- has_permission(branch_id, key)
-- Returns TRUE if current auth.uid() has the given permission for the given branch.
-- branch_id = NULL call means "check tenant-wide grant only" (callers should pass the row's branch_id).
-- A tenant-wide grant (staff_permissions.branch_id IS NULL) matches ANY p_branch_id.
-- Owner bypass: position='owner' OR legacy role='owner' ⇒ always TRUE.
-- =====================
CREATE OR REPLACE FUNCTION public.has_permission(
  p_branch_id BIGINT,
  p_key       TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    -- Owner bypass (reads profile directly; bypasses staff_permissions entirely)
    EXISTS (
      SELECT 1
      FROM public.profiles pr
      LEFT JOIN public.positions po ON po.id = pr.position_id
      WHERE pr.id = auth.uid()
        AND (pr.role::text = 'owner' OR po.code = 'owner')
    )
    OR
    -- Regular permission check
    EXISTS (
      SELECT 1
      FROM public.staff_permissions sp
      WHERE sp.user_id = auth.uid()
        AND sp.permission_key = p_key
        AND (sp.branch_id IS NULL OR sp.branch_id = p_branch_id)
    );
$$;

COMMENT ON FUNCTION public.has_permission(BIGINT, TEXT) IS
  'Authoritative authz check. Call from RLS policies as has_permission(row.branch_id, ''module:action'').';

GRANT EXECUTE ON FUNCTION public.has_permission(BIGINT, TEXT) TO authenticated;

-- =====================
-- has_position(code)
-- Returns TRUE if current auth.uid() holds the given HR position code.
-- Reads BOTH new position_id (preferred) AND legacy role during transition.
-- Use sparingly — most gating should go through has_permission(). Exists for structural checks
-- (e.g., "only chefs see KDS bump button" as a display hint, not a security gate).
-- =====================
CREATE OR REPLACE FUNCTION public.has_position(p_code TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles pr
    LEFT JOIN public.positions po ON po.id = pr.position_id
    WHERE pr.id = auth.uid()
      AND (po.code = p_code OR pr.role::text = p_code)
  );
$$;

COMMENT ON FUNCTION public.has_position(TEXT) IS
  'HR-position check. Prefer has_permission for authz. Use only for display hints or structural predicates.';

GRANT EXECUTE ON FUNCTION public.has_position(TEXT) TO authenticated;

-- =====================
-- current_position()
-- Convenience: returns position code for current user (NULL if unset).
-- Used by JWT hook in M3 and by client /employee self-service.
-- =====================
CREATE OR REPLACE FUNCTION public.current_position()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(po.code, pr.role::text)
  FROM public.profiles pr
  LEFT JOIN public.positions po ON po.id = pr.position_id
  WHERE pr.id = auth.uid()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.current_position() TO authenticated;

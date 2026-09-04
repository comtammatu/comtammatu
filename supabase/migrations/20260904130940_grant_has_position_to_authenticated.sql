-- Migration: grant_has_position_to_authenticated
-- Grant execute on public.has_position(text) to authenticated role.
-- Fixes HTTP 403 (insufficient_privilege on function has_position) when authenticated
-- roles perform operations on tables with RLS referencing has_position (e.g. ingredient_categories, units).

GRANT EXECUTE ON FUNCTION public.has_position(text) TO authenticated;

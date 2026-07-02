REVOKE EXECUTE ON FUNCTION public.current_position() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_position(text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.current_position() TO service_role;
GRANT EXECUTE ON FUNCTION public.has_position(text) TO service_role;

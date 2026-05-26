-- ============================================================================
-- Print template helper grant hardening
--
-- Supabase may keep explicit EXECUTE grants for exposed API roles even after
-- REVOKE FROM PUBLIC. These helpers are internal to the print-document
-- materialization path and should not be callable directly through REST RPC.
-- ============================================================================

REVOKE ALL ON FUNCTION public.print_template_order_header(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.print_template_payload_text(JSONB, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.print_template_interpolate(TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.print_template_default_content(TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.print_template_order_header(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.print_template_payload_text(JSONB, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.print_template_interpolate(TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.print_template_default_content(TEXT) TO service_role;

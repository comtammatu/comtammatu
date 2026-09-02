-- RPC-only mutate surface for pos_void_requests.
-- CREATE TABLE default privileges left authenticated with DML; revoke those so
-- clients can SELECT under RLS while INSERT/UPDATE/DELETE go through
-- request_pos_void_after_paid / resolve_pos_void_request only.

REVOKE ALL ON TABLE public.pos_void_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.pos_void_requests TO authenticated;
GRANT ALL ON TABLE public.pos_void_requests TO service_role;

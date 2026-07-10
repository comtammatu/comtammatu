REVOKE ALL PRIVILEGES ON TABLE public.self_order_requests
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.self_order_requests TO authenticated, service_role;
REVOKE ALL PRIVILEGES ON SEQUENCE public.self_order_requests_id_seq
  FROM PUBLIC, anon, authenticated, service_role;

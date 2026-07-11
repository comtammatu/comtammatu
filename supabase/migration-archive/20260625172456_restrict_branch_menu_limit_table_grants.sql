REVOKE ALL ON TABLE public.branch_menu_item_daily_limits
FROM PUBLIC, anon;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
ON TABLE public.branch_menu_item_daily_limits
FROM authenticated;

GRANT SELECT ON TABLE public.branch_menu_item_daily_limits
TO authenticated;

GRANT ALL ON TABLE public.branch_menu_item_daily_limits
TO service_role;

REVOKE ALL ON SEQUENCE public.branch_menu_item_daily_limits_id_seq
FROM PUBLIC, anon, authenticated;

GRANT ALL ON SEQUENCE public.branch_menu_item_daily_limits_id_seq
TO service_role;

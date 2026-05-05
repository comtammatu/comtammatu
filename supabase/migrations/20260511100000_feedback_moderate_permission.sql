-- =========================================================================
-- feedback module — Slice 3E: feedback:moderate permission key
-- =========================================================================

INSERT INTO public.permission_keys (key, module, description, scope) VALUES
  ('feedback:moderate', 'feedback', 'Đánh dấu phản ánh nghi spam / bỏ đánh dấu', 'branch')
ON CONFLICT (key) DO NOTHING;

-- Back-fill role_templates for existing tenants
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP

    -- owner, super_manager, area_manager
    UPDATE public.role_templates
    SET permission_keys = ARRAY(
      SELECT DISTINCT unnest(permission_keys || ARRAY['feedback:moderate']) ORDER BY 1
    )
    WHERE tenant_id = t.id
      AND position_code IN ('owner', 'super_manager', 'quan_ly_vung');

    -- branch_manager
    UPDATE public.role_templates
    SET permission_keys = ARRAY(
      SELECT DISTINCT unnest(permission_keys || ARRAY['feedback:moderate']) ORDER BY 1
    )
    WHERE tenant_id = t.id
      AND position_code = 'quan_ly_CN';

  END LOOP;
END $$;

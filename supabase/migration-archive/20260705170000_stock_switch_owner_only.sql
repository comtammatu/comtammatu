DROP POLICY feature_flags_write_settings ON public.branch_feature_flags;

CREATE POLICY feature_flags_write_settings ON public.branch_feature_flags TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.branches b
  WHERE ((b.id = branch_feature_flags.branch_id) AND (b.tenant_id = public.auth_tenant_id())))) AND (public.has_permission(branch_id, 'settings:branch'::text) OR public.has_permission(NULL::bigint, 'settings:tenant'::text)) AND ((flag_key <> 'pos_stock_outcome_posting'::text) OR (public.auth_role() = 'owner'::text)))) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.branches b
  WHERE ((b.id = branch_feature_flags.branch_id) AND (b.tenant_id = public.auth_tenant_id())))) AND (public.has_permission(branch_id, 'settings:branch'::text) OR public.has_permission(NULL::bigint, 'settings:tenant'::text)) AND ((flag_key <> 'pos_stock_outcome_posting'::text) OR (public.auth_role() = 'owner'::text))));

COMMENT ON POLICY feature_flags_write_settings ON public.branch_feature_flags IS 'Branch settings holders write feature flags, EXCEPT pos_stock_outcome_posting ("Trừ tồn khi bán") which only the owner may flip — owner decision 2026-07-04 (D065 addendum). service_role bypasses RLS.';

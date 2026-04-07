-- =============================================================
-- Seed: Initial tenant + branches
-- =============================================================

INSERT INTO public.tenants (name, slug, legal_name, tax_code, legal_address, representative)
VALUES (
  'Cơm Tấm Má Tư',
  'comtammatu',
  'Công ty Cổ Phần Cơm Tấm Má Tư',
  NULL,  -- Fill MST when registered
  NULL,  -- Fill legal address
  NULL   -- Fill representative name
);

-- Branches: đúng một HQ (trụ sở / văn phòng); còn lại là chi nhánh có POS/KDS.
-- Không hardcode tenant_id = 1 — map theo tenant vừa insert (slug).
INSERT INTO public.branches (tenant_id, name, address, is_headquarters)
VALUES
  (
    (SELECT id FROM public.tenants WHERE slug = 'comtammatu' LIMIT 1),
    'Trụ sở chính',
    'Ấp Phước Sơn, Xã Đất Đỏ, TP.HCM',
    TRUE
  ),
  (
    (SELECT id FROM public.tenants WHERE slug = 'comtammatu' LIMIT 1),
    'Chi nhánh Đất Đỏ',
    'Ấp Phước Sơn, Xã Đất Đỏ, TP.HCM',
    FALSE
  ),
  (
    (SELECT id FROM public.tenants WHERE slug = 'comtammatu' LIMIT 1),
    'Chi nhánh Phước Hải',
    'Tổ 1 Hải Phúc, Xã Phước Hải, TP.HCM',
    FALSE
  );

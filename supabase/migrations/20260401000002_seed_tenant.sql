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

-- Example branches (adjust to actual locations)
INSERT INTO public.branches (tenant_id, name, address, is_headquarters)
VALUES
  (1, 'Chi nhánh Quận 1', 'Số 123 Đường ABC, Quận 1, TP.HCM', true),
  (1, 'Chi nhánh Quận 3', 'Số 456 Đường XYZ, Quận 3, TP.HCM', false);

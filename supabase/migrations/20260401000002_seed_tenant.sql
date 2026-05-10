-- =============================================================
-- Seed: Initial tenant + branches
--
-- Branches (final shape sau toàn bộ migrations):
--   - Chi nhánh Đất Đỏ      (branch_kind='branch')          ← POS/KDS
--   - Chi nhánh Phước Hải   (branch_kind='branch')          ← POS/KDS
--   - Chi nhánh Bà Rịa      (branch_kind='branch')          ← POS/KDS
--   - Kho Tổng              (branch_kind='central_warehouse') ← procurement/storage
--   - Bếp Trung Tâm seed bằng migration 20260417020000_seed_central_kitchen.sql
--     (cần `branch_kind` column, được thêm ở 20260414081707).
--
-- Schema state tại timestamp này:
--   branches có cột: id, tenant_id, name, address, phone, is_active,
--                    is_headquarters, created_at, updated_at
--   Chưa có `branch_kind` (thêm ở 20260414081707).
--   Mig 20260424000000 rename: is_headquarters=TRUE → branch_kind='central_warehouse'.
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

-- Branches: 3 chi nhánh POS + 1 Kho Tổng (HQ via is_headquarters).
-- Bếp Trung Tâm seed riêng ở migration 20260417020000_seed_central_kitchen.sql.
INSERT INTO public.branches (tenant_id, name, address, is_headquarters)
VALUES
  (
    (SELECT id FROM public.tenants WHERE slug = 'comtammatu' LIMIT 1),
    'Kho Tổng',
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
  ),
  (
    (SELECT id FROM public.tenants WHERE slug = 'comtammatu' LIMIT 1),
    'Chi nhánh Bà Rịa',
    'TP. Bà Rịa, Tỉnh Bà Rịa - Vũng Tàu, TP.HCM',
    FALSE
  );

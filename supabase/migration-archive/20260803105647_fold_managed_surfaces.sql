-- Fold managed surfaces into the migration chain (D047).
-- Supabase Branching applies only migrations + seed (not the standalone
-- supabase/managed-surfaces.install.sql), so a preview branch needs these here
-- to be self-contained: extensions, storage buckets + storage.objects RLS,
-- supabase_realtime publication membership, pg_cron jobs, and global access
-- reference data omitted by the schema-only baseline.
-- Idempotent / re-runnable: safe to apply to prod where these already exist.
-- Section C (storage.objects policies) requires ownership of storage.objects
-- (the Supabase migration role / postgres has it; a less-privileged manual apply
-- path must run that section as supabase_storage_admin).

-- ── Section A: extensions ──
CREATE EXTENSION IF NOT EXISTS pgcrypto      WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp"   WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS hypopg        WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS index_advisor WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ── Section B: storage buckets ──
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('attendance-photos',     'attendance-photos',     false, 5242880,  ARRAY['image/jpeg','image/png','image/webp']),
  ('grn-evidence',          'grn-evidence',          false, NULL,     NULL),
  ('hddt-archive',          'hddt-archive',          false, 10485760, ARRAY['application/pdf','application/xml','text/xml']),
  ('inventory-attachments', 'inventory-attachments', true,  10485760, ARRAY['image/jpeg','image/png','image/webp','image/heic','application/pdf']),
  ('menu-images',           'menu-images',           true,  5242880,  ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- ── Section C: storage.objects RLS policies (require storage owner) ──
DROP POLICY IF EXISTS "grn_evidence_no_delete" ON storage.objects;
CREATE POLICY "grn_evidence_no_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id <> 'grn-evidence');
DROP POLICY IF EXISTS "grn_evidence_read" ON storage.objects;
CREATE POLICY "grn_evidence_read" ON storage.objects FOR SELECT TO authenticated
  USING ((bucket_id = 'grn-evidence') AND (has_permission(NULL::bigint, 'inventory:grn_hardblock_override') OR has_permission(NULL::bigint, 'reports:view_branch') OR has_permission(NULL::bigint, 'reports:view_tenant')));
DROP POLICY IF EXISTS "grn_evidence_upload" ON storage.objects;
CREATE POLICY "grn_evidence_upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'grn-evidence') AND has_permission(NULL::bigint, 'inventory:grn_hardblock_override'));
DROP POLICY IF EXISTS "hddt_archive_select" ON storage.objects;
CREATE POLICY "hddt_archive_select" ON storage.objects FOR SELECT TO authenticated
  USING ((bucket_id = 'hddt-archive') AND ((storage.foldername(name))[1] = (auth_tenant_id())::text) AND has_permission_any('finance:view'));
DROP POLICY IF EXISTS "inv_attach_delete" ON storage.objects;
CREATE POLICY "inv_attach_delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'inventory-attachments'
  AND (storage.foldername(storage.objects.name))[1] = (
    SELECT public.auth_tenant_id()::text
  )
  AND NOT (
    (storage.foldername(storage.objects.name))[2] = 'grn'
    AND (storage.foldername(storage.objects.name))[4] = 'rejected'
  )
);
DROP POLICY IF EXISTS "inv_attach_insert" ON storage.objects;
CREATE POLICY "inv_attach_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'inventory-attachments'
  AND (storage.foldername(storage.objects.name))[1] = (
    SELECT public.auth_tenant_id()::text
  )
  AND (
    (
      (storage.foldername(storage.objects.name))[2] = 'grn'
      AND (storage.foldername(storage.objects.name))[4] = 'rejected'
      AND pg_catalog.array_length(
        storage.foldername(storage.objects.name),
        1
      ) = 5
      AND coalesce(
        (storage.foldername(storage.objects.name))[5],
        ''
      ) ~ '^[1-9][0-9]*$'
      AND storage.objects.name ~* '\.(jpe?g|png|webp|heic)$'
      AND pg_catalog.lower(
        coalesce(storage.objects.metadata ->> 'mimetype', '')
      ) IN ('image/jpeg', 'image/png', 'image/webp', 'image/heic')
      AND EXISTS (
        SELECT 1
        FROM public.goods_received_notes AS grn
        JOIN public.grn_items AS grn_item
          ON grn_item.grn_id = grn.id
         AND grn_item.tenant_id = grn.tenant_id
         AND grn_item.id = CASE
           WHEN coalesce(
             (storage.foldername(storage.objects.name))[5],
             ''
           ) ~ '^[1-9][0-9]*$'
             THEN (storage.foldername(storage.objects.name))[5]::bigint
         END
        WHERE grn.id = CASE
            WHEN coalesce(
              (storage.foldername(storage.objects.name))[3],
              ''
            ) ~ '^[1-9][0-9]*$'
              THEN (storage.foldername(storage.objects.name))[3]::bigint
          END
          AND grn.tenant_id = (SELECT public.auth_tenant_id())
          AND (
            (
              grn.status = 'draft'
              AND public.has_permission(
                grn.branch_id,
                'procurement:grn_create'
              )
            )
            OR (
              grn.status = 'confirmed'
              AND grn.po_id IS NOT NULL
              AND public.has_permission(
                grn.branch_id,
                'procurement:grn_amend'
              )
            )
          )
      )
    )
    OR (
      (storage.foldername(storage.objects.name))[2] =
        'supplier-return-line'
      AND EXISTS (
        SELECT 1
        FROM public.supplier_return_items AS return_item
        JOIN public.supplier_returns AS supplier_return
          ON supplier_return.id = return_item.return_id
         AND supplier_return.tenant_id = return_item.tenant_id
        WHERE return_item.id = CASE
            WHEN coalesce(
              (storage.foldername(storage.objects.name))[3],
              ''
            ) ~ '^[1-9][0-9]*$'
              THEN (storage.foldername(storage.objects.name))[3]::bigint
          END
          AND return_item.tenant_id = (SELECT public.auth_tenant_id())
          AND supplier_return.status = 'draft'
          AND public.has_permission(
            supplier_return.branch_id,
            'supplier_return:create'
          )
      )
    )
    OR (
      (storage.foldername(storage.objects.name))[2] = 'stock-issues'
      AND EXISTS (
        SELECT 1
        FROM public.stock_issues AS issue
        WHERE issue.id = CASE
            WHEN coalesce(
              (storage.foldername(storage.objects.name))[3],
              ''
            ) ~ '^[1-9][0-9]*$'
              THEN (storage.foldername(storage.objects.name))[3]::bigint
          END
          AND issue.tenant_id = (SELECT public.auth_tenant_id())
          AND issue.status = 'draft'
          AND issue.issue_type = 'consumption'
          AND public.has_permission(issue.branch_id, 'inventory:write')
      )
    )
    OR (
      (storage.foldername(storage.objects.name))[2] = 'branches'
      AND (storage.foldername(storage.objects.name))[4] = 'waste'
      AND EXISTS (
        SELECT 1
        FROM public.branches AS branch
        WHERE branch.id = CASE
            WHEN coalesce(
              (storage.foldername(storage.objects.name))[3],
              ''
            ) ~ '^[1-9][0-9]*$'
              THEN (storage.foldername(storage.objects.name))[3]::bigint
          END
          AND branch.tenant_id = (SELECT public.auth_tenant_id())
          AND branch.is_active IS TRUE
          AND public.has_permission(branch.id, 'inventory:writeoff')
      )
    )
    OR (
      (storage.foldername(storage.objects.name))[2] = 'waste'
      AND public.auth_role() = 'owner'
    )
    OR (
      (storage.foldername(storage.objects.name))[2] = 'expenses'
      AND public.has_permission_any('finance:expense_create')
    )
  )
);
DROP POLICY IF EXISTS "inv_attach_read" ON storage.objects;
-- Public bucket object URL access does not require a storage.objects SELECT
-- policy. Keep object listing closed.
DROP POLICY IF EXISTS "inv_attach_update" ON storage.objects;
CREATE POLICY "inv_attach_update" ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'inventory-attachments'
  AND (storage.foldername(storage.objects.name))[1] = (
    SELECT public.auth_tenant_id()::text
  )
  AND NOT (
    (storage.foldername(storage.objects.name))[2] = 'grn'
    AND (storage.foldername(storage.objects.name))[4] = 'rejected'
  )
)
WITH CHECK (
  bucket_id = 'inventory-attachments'
  AND (storage.foldername(storage.objects.name))[1] = (
    SELECT public.auth_tenant_id()::text
  )
  AND NOT (
    (storage.foldername(storage.objects.name))[2] = 'grn'
    AND (storage.foldername(storage.objects.name))[4] = 'rejected'
  )
);
DROP POLICY IF EXISTS "menu_images_delete" ON storage.objects;
CREATE POLICY "menu_images_delete" ON storage.objects FOR DELETE TO authenticated
  USING ((bucket_id = 'menu-images') AND ((storage.foldername(name))[1] = (auth_tenant_id())::text) AND has_permission_any('menu:write'));
DROP POLICY IF EXISTS "menu_images_insert" ON storage.objects;
CREATE POLICY "menu_images_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'menu-images') AND ((storage.foldername(name))[1] = (auth_tenant_id())::text) AND has_permission_any('menu:write'));
DROP POLICY IF EXISTS "menu_images_read" ON storage.objects;
-- Public bucket object URL access does not require a storage.objects SELECT
-- policy. Keep object listing closed.
DROP POLICY IF EXISTS "menu_images_update" ON storage.objects;
CREATE POLICY "menu_images_update" ON storage.objects FOR UPDATE TO authenticated
  USING ((bucket_id = 'menu-images') AND ((storage.foldername(name))[1] = (auth_tenant_id())::text))
  WITH CHECK ((bucket_id = 'menu-images') AND ((storage.foldername(name))[1] = (auth_tenant_id())::text) AND has_permission_any('menu:write'));

DROP POLICY IF EXISTS "branch_ops_receive" ON realtime.messages;
CREATE POLICY "branch_ops_receive" ON realtime.messages
FOR SELECT TO authenticated
USING (
  CASE
    WHEN realtime.topic() ~ '^branch:[1-9][0-9]{0,18}:ops$' THEN
      CASE
        WHEN split_part(realtime.topic(), ':', 2)::numeric
             <= 9223372036854775807::numeric
          THEN public.can_read_branch_ops(
            split_part(realtime.topic(), ':', 2)::bigint
          )
        ELSE FALSE
      END
    ELSE FALSE
  END
);

CREATE OR REPLACE FUNCTION private.assign_invoice_allocation_grn_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_match_count integer;
BEGIN
  IF NEW.grn_item_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*), min(item.id)
  INTO v_match_count, NEW.grn_item_id
  FROM public.grn_items AS item
  WHERE item.tenant_id = NEW.tenant_id
    AND item.grn_id = NEW.grn_id
    AND item.received_quantity - item.rejected_quantity > 0
    AND (
      NEW.purchase_order_item_id IS NULL
      OR item.purchase_order_item_id = NEW.purchase_order_item_id
    );

  IF v_match_count <> 1 THEN
    RAISE EXCEPTION 'supplier_invoice_allocation_grn_item_missing'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.assign_invoice_allocation_grn_item() FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.guard_tax_invoice_payment_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND (OLD.provider_data ? 'invoiceSnapshot')
    AND NOT (coalesce(NEW.provider_data, '{}'::jsonb) ? 'invoiceSnapshot') THEN
    NEW.provider_data := coalesce(NEW.provider_data, '{}'::jsonb)
      || jsonb_build_object(
        'invoiceSnapshot',
        OLD.provider_data -> 'invoiceSnapshot'
      );
  END IF;

  IF TG_OP = 'UPDATE'
    AND jsonb_typeof(
      OLD.provider_data #> '{invoiceSnapshot,draftSnapshot}'
    ) = 'object'
    AND OLD.provider_data -> 'invoiceSnapshot'
      IS DISTINCT FROM NEW.provider_data -> 'invoiceSnapshot'
    AND NOT (
      jsonb_typeof(
        OLD.provider_data #> '{invoiceSnapshot,draftSnapshot,invoiceProfile}'
      ) IS DISTINCT FROM 'object'
      AND jsonb_typeof(
        NEW.provider_data #> '{invoiceSnapshot,draftSnapshot,invoiceProfile}'
      ) = 'object'
      AND jsonb_typeof(
        NEW.provider_data #> '{invoiceSnapshot,draftSnapshot,subtotal}'
      ) = 'number'
      AND jsonb_typeof(
        NEW.provider_data #> '{invoiceSnapshot,draftSnapshot,vatAmount}'
      ) = 'number'
      AND ((OLD.provider_data -> 'invoiceSnapshot')
            #- '{draftSnapshot,invoiceProfile}'
            #- '{draftSnapshot,subtotal}'
            #- '{draftSnapshot,vatAmount}')
        IS NOT DISTINCT FROM
          ((NEW.provider_data -> 'invoiceSnapshot')
            #- '{draftSnapshot,invoiceProfile}'
            #- '{draftSnapshot,subtotal}'
            #- '{draftSnapshot,vatAmount}')
    ) THEN
    RAISE EXCEPTION 'invoice_snapshot_immutable' USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_tax_invoice_payment_snapshot() FROM PUBLIC;

DROP FUNCTION IF EXISTS public.recreate_grn_at_receiving_site(
  bigint, bigint, bigint, text
);

DO $migration$
DECLARE
  v_definition text;
  v_before text;
BEGIN
  v_definition := pg_get_functiondef(
    'public.record_bank_transaction_cash_deposit(bigint)'::regprocedure
  );
  v_before := v_definition;
  v_definition := replace(
    v_definition,
    E'    amount,\n    payment_method,',
    E'    amount,\n    subtotal,\n    vat_breakdown,\n    vat_amount,\n    payment_method,'
  );
  v_definition := replace(
    v_definition,
    E'    v_transaction.amount,\n    \'cash\',',
    E'    v_transaction.amount,\n    v_transaction.amount,\n'
      || E'    jsonb_build_array(jsonb_build_object(\n'
      || E'      \'vat_rate\', 0,\n'
      || E'      \'taxable_amount\', v_transaction.amount,\n'
      || E'      \'vat_amount\', 0\n'
      || E'    )),\n    0,\n    \'cash\','
  );

  IF v_definition = v_before THEN
    RAISE EXCEPTION
      'record_bank_transaction_cash_deposit VAT patch did not match';
  END IF;

  EXECUTE v_definition;
END;
$migration$;

-- ── Section D: realtime publication membership (idempotent — add each table only if not already a member) ──
DO $$
DECLARE
  v_table text;
  v_tables text[] := ARRAY[
    'branch_menu_item_daily_limits', 'kds_tickets', 'notifications',
    'order_status_history', 'orders', 'payments', 'pos_sessions',
    'print_jobs', 'tables', 'webhook_events'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = v_table
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
    END IF;
  END LOOP;
END$$;

-- ── Section E: cron jobs (pg_cron; cron.schedule upserts by jobname) ──
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname IN ('refresh_mv_grn_price_baseline', 'refresh-finance-views-daily');

SELECT cron.schedule('auto_close_periods',                 '0 19 * * *',  'SELECT public.auto_close_periods();');
SELECT cron.schedule('check_cron_jobs_health_job',          '*/30 * * * *', 'SELECT public.check_cron_jobs_health();');
SELECT cron.schedule('cleanup-abandoned-payments',         '0 * * * *',   'SELECT public.cleanup_abandoned_payments()');
SELECT cron.schedule('compute_branch_daily_waste_caps',    '30 17 * * *', 'SELECT public.compute_branch_daily_waste_caps();');
SELECT cron.schedule('refresh_abc_classification',         '0 19 * * 6',  'SELECT public.refresh_abc_classification();');
SELECT cron.schedule('refresh_mv_inventory_stock_current', '*/15 * * * *', 'SET LOCAL statement_timeout = ''2min''; SELECT public.refresh_inventory_dashboard();');
SELECT cron.schedule('scan-inventory-alerts-daily',        '0 23 * * *',  'SELECT public.scan_inventory_alerts();');
SELECT cron.schedule('weekly_waste_report',                '0 2 * * 1',   'SELECT public.weekly_waste_report();');

-- ── Section F: global authorization reference data ──
INSERT INTO public.permission_keys (key, module, description, scope)
VALUES
  ('accounting:period_close','accounting','Close an inventory cost period after valuation reconciliation.','tenant'),
  ('accounting:period_reopen','accounting','Reopen a hard-closed accounting period (audited, 2FA at app layer).','tenant'),
  ('crm:campaign_send','crm','Gửi chiến dịch marketing','tenant'),
  ('crm:read','crm','Xem dữ liệu khách hàng','either'),
  ('crm:write','crm','Sửa dữ liệu khách hàng','either'),
  ('dashboard:view','dashboard','Xem dashboard tổng quan','either'),
  ('self:access','me','Access personal work, schedule, leave, payslip, and profile surfaces','tenant'),
  ('finance:ap_pay','finance','Thanh toán công nợ NCC','tenant'),
  ('finance:expense_approve','finance','Duyệt chi phí','tenant'),
  ('finance:expense_create','finance','Tạo chi phí','either'),
  ('finance:payroll_approve','finance','Duyệt bảng lương (owner only)','tenant'),
  ('finance:payroll_calculate','finance','Tính lương','tenant'),
  ('finance:view','finance','Xem báo cáo tài chính','either'),
  ('hr:approve_checkout','hr','Duyệt kết ca nhân viên theo chi nhánh','branch'),
  ('hr:approve_leave_request','hr','Duyệt yêu cầu nghỉ phép theo chi nhánh','branch'),
  ('hr:assign_shift','hr','Phân ca làm việc theo tuần cho nhân viên tại chi nhánh hoặc Văn phòng','either'),
  ('hr:correct_attendance','hr','Correct attendance through an audited RPC','tenant'),
  ('hr:force_close_attendance','hr','Close stale attendance with an audited reason','either'),
  ('hr:manage_leave_policy','hr','Manage tenant leave and workday policy','tenant'),
  ('hr:manage_employee','hr','Sửa hồ sơ nhân sự','tenant'),
  ('hr:manage_position_tasks','hr','Manage position and employee shift task templates','tenant'),
  ('hr:manage_shift_catalog','hr','Manage the tenant shift catalog','tenant'),
  ('hr:payroll_prepare','hr','Prepare payroll previews and adjustments','tenant'),
  ('hr:payroll_snapshot','hr','Finalize one immutable payroll snapshot per period','tenant'),
  ('hr:request_leave','hr','Gửi yêu cầu nghỉ phép','branch'),
  ('hr:view_employee','hr','Xem hồ sơ nhân sự','tenant'),
  ('hr:view_sensitive_employee','hr','View employee identity, contract, bank, and salary data','tenant'),
  ('inventory:adjust_approve','inventory','Approve stock adjustments (reason correction / shrink).','branch'),
  ('inventory:count_approve','inventory','Duyệt phiếu đếm tồn và điều chỉnh kho','branch'),
  ('inventory:count_assign','inventory','Phân công nhân viên đếm tồn nguyên liệu','branch'),
  ('inventory:production_confirm','inventory','Xác nhận hoàn thành sản xuất','branch'),
  ('inventory:production_create','inventory','Tạo lệnh sản xuất','branch'),
  ('inventory:read','inventory','Xem tồn kho & nguyên liệu','either'),
  ('inventory:valuation_read','inventory','Owner-only WAC and inventory valuation through the protected monetary boundary.','tenant'),
  ('inventory:stocktake_complete','inventory','Chốt phiếu kiểm kho','branch'),
  ('inventory:stocktake_create','inventory','Tạo phiếu kiểm kho','branch'),
  ('inventory:stocktake_recount','inventory','Trigger stocktake recount rounds and escalate to round 4.','branch'),
  ('inventory:stocktake_unblind','inventory','Admin break-glass to view system_qty during blind stocktake.','tenant'),
  ('inventory:transfer_create','inventory','Tạo phiếu điều chuyển','branch'),
  ('inventory:request_create','inventory','Tạo phiếu yêu cầu hàng','branch'),
  ('inventory:request_submit','inventory','Gửi phiếu yêu cầu hàng','branch'),
  ('inventory:request_cancel','inventory','Hủy phiếu yêu cầu hàng','branch'),
  ('inventory:request_fulfill','inventory','Đáp ứng phiếu yêu cầu hàng','branch'),
  ('inventory:transfer_receive','inventory','Nhận kho điều chuyển','branch'),
  ('inventory:transfer_ship','inventory','Xuất kho điều chuyển','branch'),
  ('inventory:units_master','inventory','Quản lý danh mục đơn vị đo (chuẩn + đóng gói)','tenant'),
  ('inventory:waste_approve','inventory','Approve waste entries tier-2 (value >= 500k, shift_cap, or found_missing).','branch'),
  ('inventory:waste_bypass_photo','inventory','Admin-only: bypass mandatory waste photo (audited).','tenant'),
  ('inventory:write','inventory','Điều chỉnh tồn, đếm kho','branch'),
  ('inventory:writeoff','inventory','Xoá sổ hàng hết hạn/hỏng','branch'),
  ('kds:mark_ready','kds','Đánh dấu món ready','branch'),
  ('kds:recall','kds','Thu hồi món đã ready','branch'),
  ('kds:use','kds','Xem màn hình bếp','branch'),
  ('menu:manage_category','menu','Quản lý danh mục món','either'),
  ('menu:publish','menu','Đẩy giá áp dụng (publish)','either'),
  ('menu:read','menu','Xem thực đơn & giá','either'),
  ('menu:write','menu','Tạo/sửa món & giá','either'),
  ('orders:read','orders','Xem đơn hàng','either'),
  ('orders:refund','orders','Hoàn tiền','branch'),
  ('orders:refund_approve','orders','Phê duyệt yêu cầu hoàn tiền (giải phóng GL + tồn kho)','branch'),
  ('orders:void','orders','Huỷ đơn','branch'),
  ('orders:write','orders','Sửa đơn hàng','either'),
  ('pos:apply_discount','pos','Áp giảm giá POS','branch'),
  ('pos:close_shift','pos','Đóng ca POS','branch'),
  ('pos:close_shift_variance_override','pos','Duyệt đóng ca khi chênh lệch tiền vượt ngưỡng','branch'),
  ('pos:confirm_payment','pos','Xác nhận thanh toán tiền mặt','branch'),
  ('pos:open_cashbox','pos','Mở két tiền','branch'),
  ('pos:print','pos','Tạo/tái in hoá đơn, huỷ hoặc thử lại tem in','branch'),
  ('pos:reprint_receipt','pos','In lại hoá đơn','branch'),
  ('pos:send_kitchen','pos','Gửi đơn xuống bếp (tạo tem bếp in tự động)','branch'),
  ('pos:use','pos','Sử dụng POS','branch'),
  ('pos:void_order','pos','Huỷ đơn POS','branch'),
  ('pos:void_paid_order','pos','Huỷ đơn đã thanh toán tại POS (hoàn tiền + huỷ HĐĐT); manager-gated','branch'),
  ('printer:manage','settings','Quản lý cấu hình máy in chi nhánh','branch'),
  ('procurement:grn_amend','inventory_procurement','Sửa trực tiếp dòng phiếu nhập đã chốt (Owner force-edit)','tenant'),
  ('procurement:grn_confirm','inventory_procurement','Xác nhận phiếu nhập kho','branch'),
  ('procurement:grn_create','inventory_procurement','Tạo phiếu nhập kho (GRN)','branch'),
  ('procurement:invoice_create','inventory_procurement','Tạo hoá đơn mua hàng','either'),
  ('procurement:invoice_match','inventory_procurement','Đối chiếu hoá đơn mua hàng','either'),
  ('procurement:po_approve','inventory_procurement','Duyệt đơn mua hàng','either'),
  ('procurement:po_create','inventory_procurement','Tạo đơn mua hàng (PO)','either'),
  ('procurement:request_manage','inventory_procurement','Tạo, sửa, gửi, hủy và đóng yêu cầu mua','branch'),
  ('procurement:price_list_read','procurement','Read purchase prices through the protected monetary boundary.','tenant'),
  ('procurement:price_list_write','procurement','Write supplier_price_list contract/quotation rows. grn_last is trigger-only.','tenant'),
  ('procurement:read','inventory_procurement','Xem đơn mua hàng & NCC','either'),
  ('procurement:supplier_manage','inventory_procurement','Quản lý NCC','tenant'),
  ('reports:export','reports','Xuất báo cáo','either'),
  ('reports:pit_export','reports','Xuất quyết toán TNCN','tenant'),
  ('reports:view_branch','reports','Xem báo cáo cấp chi nhánh','branch'),
  ('reports:view_tenant','reports','Xem báo cáo cấp tenant','tenant'),
  ('settings:branch','settings','Cấu hình chi nhánh (giờ, máy in...)','branch'),
  ('settings:branch_network','settings','Quản lý danh sách IP tin cậy của chi nhánh (cổng mạng POS/KDS)','branch'),
  ('settings:integrations','settings','Cấu hình tích hợp (HĐĐT, ngân hàng)','tenant'),
  ('settings:tenant','settings','Cấu hình tenant (pháp lý, MST)','tenant'),
  ('staff:assign_permission','staff','Gán/thu hồi quyền cho user','tenant'),
  ('staff:assign_position','staff','Gán chức vụ HR','tenant'),
  ('staff:manage','staff','CRUD nhân viên / ca / lịch','either'),
  ('staff:provision','staff','Create, lock, and restore staff accounts','tenant'),
  ('staff:view','staff','Xem danh sách nhân viên','either'),
  ('supplier_return:confirm','inventory_procurement','Xác nhận/gửi phiếu trả hàng NCC','branch'),
  ('supplier_return:create','inventory_procurement','Tạo phiếu trả hàng nhà cung cấp','branch'),
  ('supplier_return:read','inventory_procurement','Xem phiếu trả hàng nhà cung cấp','either'),
  ('feedback:view','feedback','Xem phản hồi khách hàng','branch'),
  ('feedback:manage_qr','feedback','Tạo/xoay/vô hiệu hoá mã QR phản hồi','branch'),
  ('auth:audit_read','auth','Read authorization audit history','tenant'),
  ('auth:binding_manage','auth','Grant and revoke access role bindings','tenant'),
  ('auth:binding_read','auth','Read access role bindings','tenant')
ON CONFLICT (key) DO NOTHING;

UPDATE public.permission_keys
SET is_delegable_to_staff = key = ANY (ARRAY[
  'dashboard:view',
  'hr:approve_checkout', 'hr:approve_leave_request', 'hr:assign_shift',
  'hr:correct_attendance', 'hr:force_close_attendance',
  'hr:manage_leave_policy', 'hr:manage_position_tasks',
  'hr:manage_shift_catalog', 'hr:payroll_prepare', 'hr:payroll_snapshot',
  'hr:request_leave', 'hr:view_employee', 'hr:view_sensitive_employee',
  'inventory:adjust_approve', 'inventory:count_approve', 'inventory:count_assign',
  'inventory:production_confirm', 'inventory:production_create', 'inventory:read',
  'inventory:request_cancel', 'inventory:request_create',
  'inventory:request_fulfill', 'inventory:request_submit',
  'inventory:valuation_read', 'inventory:stocktake_complete',
  'inventory:stocktake_create', 'inventory:stocktake_recount',
  'inventory:transfer_create', 'inventory:transfer_receive',
  'inventory:transfer_ship', 'inventory:waste_approve', 'inventory:write',
  'inventory:writeoff',
  'kds:mark_ready', 'kds:recall', 'kds:use',
  'menu:read',
  'orders:read', 'orders:void', 'orders:write',
  'pos:apply_discount', 'pos:close_shift', 'pos:close_shift_variance_override',
  'pos:confirm_payment', 'pos:open_cashbox', 'pos:print',
  'pos:reprint_receipt', 'pos:send_kitchen', 'pos:use', 'pos:void_order',
  'printer:manage',
  'procurement:grn_confirm', 'procurement:grn_create',
  'procurement:invoice_create', 'procurement:invoice_match',
  'procurement:po_approve', 'procurement:po_create',
  'procurement:request_manage', 'procurement:price_list_read',
  'procurement:read', 'procurement:supplier_manage',
  'reports:export', 'reports:view_branch',
  'settings:branch',
  'staff:provision', 'staff:view',
  'supplier_return:confirm', 'supplier_return:create', 'supplier_return:read',
  'feedback:view', 'feedback:manage_qr',
  'finance:view', 'finance:expense_create', 'finance:expense_approve',
  'finance:ap_pay', 'auth:audit_read', 'auth:binding_read'
]::text[]);

INSERT INTO public.auth_access_roles (code, label_vi, allowed_scope)
VALUES
  ('tenant_owner', 'Chủ sở hữu', 'tenant'),
  ('hr_manager', 'Quản lý nhân sự', 'tenant'),
  ('branch_manager', 'Quản lý chi nhánh', 'branch'),
  ('security_admin', 'Quản trị phân quyền', 'tenant'),
  ('self_service_member', 'Thành viên công ty', 'tenant')
ON CONFLICT (code) DO UPDATE SET
  label_vi = EXCLUDED.label_vi,
  allowed_scope = EXCLUDED.allowed_scope;

INSERT INTO public.auth_access_role_capabilities (role_code, permission_key)
SELECT 'tenant_owner', key
FROM public.permission_keys
WHERE key <> 'auth:binding_manage'
ON CONFLICT DO NOTHING;

INSERT INTO public.auth_access_role_capabilities (role_code, permission_key)
VALUES
  ('hr_manager', 'hr:view_employee'),
  ('hr_manager', 'hr:view_sensitive_employee'),
  ('hr_manager', 'hr:manage_employee'),
  ('hr_manager', 'hr:assign_shift'),
  ('hr_manager', 'hr:approve_checkout'),
  ('hr_manager', 'hr:approve_leave_request'),
  ('hr_manager', 'hr:force_close_attendance'),
  ('hr_manager', 'hr:correct_attendance'),
  ('hr_manager', 'hr:manage_leave_policy'),
  ('hr_manager', 'hr:manage_shift_catalog'),
  ('hr_manager', 'hr:manage_position_tasks'),
  ('hr_manager', 'hr:payroll_prepare'),
  ('hr_manager', 'hr:payroll_snapshot'),
  ('hr_manager', 'staff:view'),
  ('hr_manager', 'staff:manage'),
  ('hr_manager', 'staff:provision'),
  ('hr_manager', 'staff:assign_position'),
  ('hr_manager', 'auth:binding_read'),
  ('branch_manager', 'hr:view_employee'),
  ('branch_manager', 'hr:assign_shift'),
  ('branch_manager', 'hr:approve_checkout'),
  ('branch_manager', 'hr:approve_leave_request'),
  ('branch_manager', 'hr:force_close_attendance'),
  ('security_admin', 'auth:binding_read'),
  ('security_admin', 'auth:binding_manage'),
  ('security_admin', 'auth:audit_read'),
  ('self_service_member', 'self:access')
ON CONFLICT DO NOTHING;

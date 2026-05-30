-- =============================================================
-- Notification triggers — workflow events
-- =============================================================
-- Covered transitions:
--   purchase_orders:    status draft → sent         ⇒ workflow.po_sent
--   goods_received_notes: INSERT (status=draft)    ⇒ workflow.grn_pending
--   stock_transfers:    status → in_transit          ⇒ workflow.transfer_in_transit (notify to_branch)
--   stocktake_sessions: status → completed           ⇒ workflow.stocktake_submitted
-- Recipients: branch_manager + super_manager + owner (+ area_manager via tenant-wide RLS).

-- -----------------------------
-- purchase_orders: draft → sent
-- -----------------------------
CREATE OR REPLACE FUNCTION public.trg_notify_po_sent()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'sent' AND OLD.status IS DISTINCT FROM 'sent' THEN
    INSERT INTO public.notifications (
      tenant_id, target_branch_id, target_roles,
      kind, severity, title, body,
      entity_type, entity_id, action_url, meta
    )
    VALUES (
      NEW.tenant_id,
      NEW.branch_id,
      ARRAY['branch_manager', 'super_manager', 'owner']::TEXT[],
      'workflow.po_sent',
      'info',
      format('PO %s đã gửi NCC', NEW.po_number),
      'Chờ nhập hàng / đối soát GRN khi NCC giao',
      'purchase_order',
      NEW.id,
      format('/inventory/purchase-orders/%s', NEW.id),
      jsonb_build_object('po_number', NEW.po_number)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER notify_po_sent_after_update
  AFTER UPDATE OF status ON public.purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_notify_po_sent();

-- -----------------------------
-- goods_received_notes: new draft
-- -----------------------------
CREATE OR REPLACE FUNCTION public.trg_notify_grn_created()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'draft' THEN
    INSERT INTO public.notifications (
      tenant_id, target_branch_id, target_roles,
      kind, severity, title, body,
      entity_type, entity_id, action_url, meta
    )
    VALUES (
      NEW.tenant_id,
      NEW.branch_id,
      ARRAY['branch_manager', 'super_manager', 'owner']::TEXT[],
      'workflow.grn_pending',
      'info',
      format('GRN %s đang chờ chốt', NEW.grn_number),
      'Kiểm tra số lượng, giá, ảnh chứng từ rồi chốt nhập kho',
      'grn',
      NEW.id,
      format('/inventory/grn/%s', NEW.id),
      jsonb_build_object('grn_number', NEW.grn_number, 'po_id', NEW.po_id)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER notify_grn_created_after_insert
  AFTER INSERT ON public.goods_received_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_notify_grn_created();

-- -----------------------------
-- stock_transfers: status → in_transit / shipped
-- -----------------------------
CREATE OR REPLACE FUNCTION public.trg_notify_transfer_in_transit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status IN ('in_transit', 'shipped', 'confirmed_ship')
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.notifications (
      tenant_id, target_branch_id, target_roles,
      kind, severity, title, body,
      entity_type, entity_id, action_url, meta
    )
    VALUES (
      NEW.tenant_id,
      NEW.to_branch_id,
      ARRAY['branch_manager', 'super_manager', 'owner']::TEXT[],
      'workflow.transfer_in_transit',
      'info',
      format('Chuyển kho %s đang về', NEW.transfer_number),
      'Chuẩn bị nhận hàng từ chi nhánh đối ứng',
      'stock_transfer',
      NEW.id,
      format('/inventory/transfers/%s', NEW.id),
      jsonb_build_object(
        'transfer_number', NEW.transfer_number,
        'from_branch_id', NEW.from_branch_id
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER notify_transfer_in_transit_after_update
  AFTER UPDATE OF status ON public.stock_transfers
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_notify_transfer_in_transit();

-- -----------------------------
-- stocktake_sessions: → completed
-- -----------------------------
CREATE OR REPLACE FUNCTION public.trg_notify_stocktake_completed()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    INSERT INTO public.notifications (
      tenant_id, target_branch_id, target_roles,
      kind, severity, title, body,
      entity_type, entity_id, action_url, meta
    )
    VALUES (
      NEW.tenant_id,
      NEW.branch_id,
      ARRAY['branch_manager', 'super_manager', 'owner']::TEXT[],
      'workflow.stocktake_submitted',
      'warning',
      format('Kiểm kê #%s đã nộp', NEW.id),
      'Xem chênh lệch và điều chỉnh tồn kho',
      'stocktake',
      NEW.id,
      format('/inventory/stocktake/%s', NEW.id),
      jsonb_build_object('branch_id', NEW.branch_id)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER notify_stocktake_completed_after_update
  AFTER UPDATE OF status ON public.stocktake_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_notify_stocktake_completed();

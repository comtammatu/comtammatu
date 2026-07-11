-- Enforce role-specific printer routing.
--
-- Thu ngan printers may handle receipt/provisional/shift-close documents only.
-- Kitchen printers may handle kitchen/cancel tickets only. Category routing
-- stays kitchen-only through upsert_printer_with_routes.

DELETE FROM public.printer_print_types ppt
USING public.printers p
WHERE p.id = ppt.printer_id
  AND p.tenant_id = ppt.tenant_id
  AND p.branch_id = ppt.branch_id
  AND (
    (
      p.role = 'receipt'
      AND ppt.print_type NOT IN (
        'receipt',
        'provisional_bill',
        'shift_close_report'
      )
    )
    OR (
      p.role IN ('kitchen_1', 'kitchen_2')
      AND ppt.print_type NOT IN ('kitchen_ticket', 'cancel_ticket')
    )
  );

CREATE OR REPLACE FUNCTION public.enforce_printer_print_type_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role
  INTO v_role
  FROM public.printers
  WHERE id = NEW.printer_id
    AND tenant_id = NEW.tenant_id
    AND branch_id = NEW.branch_id;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'printer not found for route'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_role = 'receipt'
     AND NEW.print_type NOT IN (
       'receipt',
       'provisional_bill',
       'shift_close_report'
     ) THEN
    RAISE EXCEPTION 'invalid print type for receipt printer'
      USING ERRCODE = '23514';
  END IF;

  IF v_role IN ('kitchen_1', 'kitchen_2')
     AND NEW.print_type NOT IN ('kitchen_ticket', 'cancel_ticket') THEN
    RAISE EXCEPTION 'invalid print type for kitchen printer'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_printer_print_type_role
  ON public.printer_print_types;

CREATE TRIGGER trg_enforce_printer_print_type_role
  BEFORE INSERT OR UPDATE ON public.printer_print_types
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_printer_print_type_role();

REVOKE ALL ON FUNCTION public.enforce_printer_print_type_role() FROM PUBLIC;

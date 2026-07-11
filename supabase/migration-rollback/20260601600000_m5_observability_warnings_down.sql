-- Rollback for 20260601600000_m5_observability_warnings.sql
-- Restores fail-silent print template apply behavior.
-- WARNING: removes observability for malformed print templates.

-- ─── print_jobs_attach_document_trigger — restore silent catch ──
CREATE OR REPLACE FUNCTION public.print_jobs_attach_document_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.payload IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.job_type NOT IN (
    'receipt', 'provisional_bill', 'kitchen_ticket',
    'cancel_ticket', 'shift_close_report'
  ) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.payload ? 'document' THEN
      NEW.payload := NEW.payload - 'document' - 'template_version';
      NEW.payload := NEW.payload || jsonb_build_object('document', OLD.payload->'document');
      IF OLD.payload ? 'template_version' THEN
        NEW.payload := NEW.payload || jsonb_build_object(
          'template_version', OLD.payload->'template_version'
        );
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.payload ? 'document' THEN
    RETURN NEW;
  END IF;
  BEGIN
    NEW.payload := public.attach_print_document_to_payload(
      NEW.tenant_id, NEW.branch_id, NEW.job_type, NEW.payload
    );
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
  END;
  RETURN NEW;
END;
$$;

-- =============================================================
-- M5 — Observability: add RAISE WARNING to print template apply
--                     EXCEPTION WHEN OTHERS site
--
-- Driver: 4-agent security audit 2026-05-07. This retained section keeps
-- printing best-effort while surfacing malformed template/config issues.
--
-- Behavior change: ZERO functional change. Only adds a log line via
-- RAISE WARNING. Callers continue to receive the same return values.
--
-- See: tasks/regressions.md EXCEPTION-WHEN-OTHERS-MUST-LOG-OR-RERAISE
-- =============================================================

-- ─── print_jobs_attach_document_trigger — add WARNING to template apply catch ──
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
    'receipt',
    'provisional_bill',
    'kitchen_ticket',
    'cancel_ticket',
    'shift_close_report'
  ) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.payload ? 'document' THEN
      NEW.payload := NEW.payload - 'document' - 'template_version';
      NEW.payload := NEW.payload || jsonb_build_object('document', OLD.payload->'document');
      IF OLD.payload ? 'template_version' THEN
        NEW.payload := NEW.payload || jsonb_build_object(
          'template_version',
          OLD.payload->'template_version'
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
      NEW.tenant_id,
      NEW.branch_id,
      NEW.job_type,
      NEW.payload
    );
  EXCEPTION WHEN OTHERS THEN
    -- Printing must remain best-effort. If a custom template is malformed,
    -- keep the legacy payload so the agent can fall back instead of blocking
    -- payment/send-kitchen flows.
    --
    -- M5 observability: surface template-apply failures so ops can debug
    -- malformed templates / missing template versions. RETURN NEW preserves
    -- legacy payload (agent fallback unchanged).
    RAISE WARNING '[print_jobs_attach_document_trigger] template apply failed for tenant=% branch=% job_type=%: %',
      NEW.tenant_id, NEW.branch_id, NEW.job_type, SQLERRM;
    RETURN NEW;
  END;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.print_jobs_attach_document_trigger() IS
  'M5 observability (2026-05-07): template apply fail-soft now emits RAISE WARNING. Behavior unchanged — RETURN NEW preserves legacy payload for agent fallback.';

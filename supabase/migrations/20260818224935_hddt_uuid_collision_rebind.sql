-- One-shot: Viettel transactionUuid used order_id, then later tax_invoice.id
-- values reused the same HDDT pad namespace. 58 leftover signing rows already
-- have original invoices on S-invoice; 58 later issued rows bound those numbers.
-- Rebind the Viettel invoices onto the leftover rows, cancel the misbound
-- Má Tư rows locally (do not cancel on Viettel), clone a new draft for the
-- misbound orders, and requeue those jobs with allowBacklogSubmitDate.
-- Also retarget paid orders whose issue job is still pending_payment on a
-- failed payment while a completed payment exists.

DO $$
DECLARE
  v_pair_count integer;
  v_rebound integer := 0;
  v_leftover public.tax_invoices%ROWTYPE;
  v_stolen public.tax_invoices%ROWTYPE;
  v_leftover_job public.tax_invoice_issue_jobs%ROWTYPE;
  v_stolen_job public.tax_invoice_issue_jobs%ROWTYPE;
  v_new_id bigint;
  v_order_uuid text;
  r record;
BEGIN
  CREATE TEMP TABLE hddt_uuid_collision_pairs (
    leftover_tax_invoice_id bigint PRIMARY KEY,
    leftover_order_id bigint NOT NULL,
    invoice_number text NOT NULL,
    cqt_code text NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO hddt_uuid_collision_pairs (
    leftover_tax_invoice_id, leftover_order_id, invoice_number, cqt_code
  ) VALUES
    (6, 22, 'C26MCS2', 'M1-26-GFPMB-00000000002'),
    (7, 26, 'C26MCS4', 'M1-26-GFPMB-00000000004'),
    (8, 27, 'C26MCS3', 'M1-26-GFPMB-00000000003'),
    (10, 29, 'C26MCS5', 'M1-26-GFPMB-00000000005'),
    (11, 31, 'C26MCS6', 'M1-26-GFPMB-00000000006'),
    (13, 35, 'C26MCS7', 'M1-26-GFPMB-00000000007'),
    (17, 34, 'C26MCS8', 'M1-26-GFPMB-00000000008'),
    (19, 37, 'C26MCS9', 'M1-26-GFPMB-00000000009'),
    (21, 43, 'C26MCS10', 'M1-26-GFPMB-00000000010'),
    (23, 42, 'C26MCS11', 'M1-26-GFPMB-00000000011'),
    (25, 49, 'C26MCS12', 'M1-26-GFPMB-00000000012'),
    (28, 44, 'C26MCS14', 'M1-26-GFPMB-00000000014'),
    (32, 52, 'C26MCS17', 'M1-26-GFPMB-00000000017'),
    (39, 68, 'C26MCS21', 'M1-26-GFPMB-00000000021'),
    (41, 67, 'C26MCS20', 'M1-26-GFPMB-00000000020'),
    (56, 78, 'C26MCS26', 'M1-26-GFPMB-00000000026'),
    (57, 65, 'C26MCS28', 'M1-26-GFPMB-00000000028'),
    (59, 80, 'C26MCS27', 'M1-26-GFPMB-00000000027'),
    (60, 81, 'C26MCS29', 'M1-26-GFPMB-00000000029'),
    (61, 82, 'C26MCS30', 'M1-26-GFPMB-00000000030'),
    (63, 87, 'C26MCS31', 'M1-26-GFPMB-00000000031'),
    (70, 93, 'C26MCS33', 'M1-26-GFPMB-00000000033'),
    (84, 110, 'C26MCS36', 'M1-26-GFPMB-00000000036'),
    (86, 106, 'C26MCS37', 'M1-26-GFPMB-00000000037'),
    (88, 113, 'C26MCS39', 'M1-26-GFPMB-00000000039'),
    (90, 109, 'C26MCS41', 'M1-26-GFPMB-00000000041'),
    (92, 117, 'C26MCS42', 'M1-26-GFPMB-00000000042'),
    (94, 114, 'C26MCS43', 'M1-26-GFPMB-00000000043'),
    (96, 116, 'C26MCS44', 'M1-26-GFPMB-00000000044'),
    (98, 120, 'C26MCS45', 'M1-26-GFPMB-00000000045'),
    (102, 132, 'C26MCS47', 'M1-26-GFPMB-00000000047'),
    (101, 126, 'C26MCS46', 'M1-26-GFPMB-00000000046'),
    (108, 129, 'C26MCS51', 'M1-26-GFPMB-00000000051'),
    (112, 136, 'C26MCS54', 'M1-26-GFPMB-00000000054'),
    (121, 142, 'C26MCS57', 'M1-26-GFPMB-00000000057'),
    (122, 152, 'C26MCS59', 'M1-26-GFPMB-00000000059'),
    (123, 153, 'C26MCS58', 'M1-26-GFPMB-00000000058'),
    (127, 155, 'C26MCS60', 'M1-26-GFPMB-00000000060'),
    (124, 143, 'C26MCS61', 'M1-26-GFPMB-00000000061'),
    (128, 148, 'C26MCS62', 'M1-26-GFPMB-00000000062'),
    (134, 150, 'C26MCS67', 'M1-26-GFPMB-00000000067'),
    (141, 169, 'C26MCS70', 'M1-26-GFPMB-00000000070'),
    (139, 167, 'C26MCS69', 'M1-26-GFPMB-00000000069'),
    (156, 185, 'C26MCS73', 'M1-26-GFPMB-00000000073'),
    (157, 177, 'C26MCS74', 'M1-26-GFPMB-00000000074'),
    (164, 187, 'C26MCS75', 'M1-26-GFPMB-00000000075'),
    (166, 188, 'C26MCS76', 'M1-26-GFPMB-00000000076'),
    (170, 192, 'C26MCS78', 'M1-26-GFPMB-00000000078'),
    (171, 198, 'C26MCS79', 'M1-26-GFPMB-00000000079'),
    (172, 196, 'C26MCS80', 'M1-26-GFPMB-00000000080'),
    (174, 204, 'C26MCS83', 'M1-26-GFPMB-00000000083'),
    (176, 195, 'C26MCS81', 'M1-26-GFPMB-00000000081'),
    (173, 200, 'C26MCS82', 'M1-26-GFPMB-00000000082'),
    (178, 197, 'C26MCS85', 'M1-26-GFPMB-00000000085'),
    (179, 203, 'C26MCS87', 'M1-26-GFPMB-00000000087'),
    (180, 206, 'C26MCS88', 'M1-26-GFPMB-00000000088'),
    (181, 202, 'C26MCS86', 'M1-26-GFPMB-00000000086'),
    (183, 214, 'C26MCS90', 'M1-26-GFPMB-00000000090');

  SELECT COUNT(*) INTO v_pair_count FROM hddt_uuid_collision_pairs;
  IF v_pair_count IS DISTINCT FROM 58 THEN
    RAISE EXCEPTION 'hddt_uuid_collision_expected_pairs_invalid'
      USING ERRCODE = '22023';
  END IF;

  FOR r IN
    SELECT * FROM hddt_uuid_collision_pairs ORDER BY leftover_tax_invoice_id
  LOOP
    SELECT * INTO v_leftover
    FROM public.tax_invoices
    WHERE id = r.leftover_tax_invoice_id
    FOR UPDATE;
    SELECT * INTO v_stolen
    FROM public.tax_invoices
    WHERE id = r.leftover_order_id
    FOR UPDATE;
    SELECT * INTO v_leftover_job
    FROM public.tax_invoice_issue_jobs
    WHERE tax_invoice_id = r.leftover_tax_invoice_id
      AND operation = 'issue'
    FOR UPDATE;
    SELECT * INTO v_stolen_job
    FROM public.tax_invoice_issue_jobs
    WHERE tax_invoice_id = r.leftover_order_id
      AND operation = 'issue'
    FOR UPDATE;

    v_order_uuid := 'HDDT' || lpad(r.leftover_order_id::text, 28, '0');

    IF v_leftover.id IS NULL
      OR v_stolen.id IS NULL
      OR v_leftover_job.id IS NULL
      OR v_stolen_job.id IS NULL
      OR v_leftover.order_id IS DISTINCT FROM r.leftover_order_id
      OR v_stolen.order_id IS NULL
      OR v_stolen.order_id = r.leftover_order_id
      OR v_leftover.provider_ref IS DISTINCT FROM (
        'HDDT' || lpad(r.leftover_tax_invoice_id::text, 28, '0')
      )
      OR v_stolen.provider_ref IS DISTINCT FROM v_order_uuid
      OR v_leftover.status IS DISTINCT FROM 'signing'
      OR v_leftover.invoice_number IS NOT NULL
      OR v_stolen.status IS DISTINCT FROM 'issued'
      OR v_stolen.invoice_number IS DISTINCT FROM r.invoice_number
      OR v_stolen.cqt_code IS DISTINCT FROM r.cqt_code
      OR v_leftover_job.status IS DISTINCT FROM 'reconcile_required'
      OR v_leftover_job.last_error IS DISTINCT FROM 'invoice_write_failed'
      OR v_stolen_job.status IS DISTINCT FROM 'completed'
    THEN
      RAISE EXCEPTION 'hddt_uuid_collision_pair_mismatch:%', r.leftover_tax_invoice_id
        USING ERRCODE = '22023';
    END IF;

    UPDATE public.tax_invoices
    SET invoice_number = r.invoice_number,
        cqt_code = r.cqt_code,
        provider_ref = v_order_uuid,
        provider_data = COALESCE(v_stolen.provider_data, provider_data),
        issued_at = COALESCE(v_stolen.issued_at, v_leftover.signing_started_at, now()),
        status = 'issued',
        updated_at = now()
    WHERE id = v_leftover.id;

    INSERT INTO public.tax_invoice_events (
      tax_invoice_id, tenant_id, from_status, to_status, actor_id, payload, note
    ) VALUES (
      v_leftover.id,
      v_leftover.tenant_id,
      'signing',
      'issued',
      NULL,
      jsonb_build_object(
        'provider_ref', v_order_uuid,
        'invoice_number', r.invoice_number,
        'cqt_code', r.cqt_code,
        'rebound_from_tax_invoice_id', v_stolen.id,
        'trigger_source', 'uuid_collision_rebind'
      ),
      'Rebound Viettel original invoice from order-id transactionUuid'
    );

    UPDATE public.tax_invoice_issue_jobs
    SET status = 'completed',
        locked_until = NULL,
        last_error = NULL,
        updated_at = now()
    WHERE id = v_leftover_job.id;

    UPDATE public.tax_invoices
    SET status = 'cancelled',
        invoice_number = NULL,
        cqt_code = NULL,
        provider_ref = NULL,
        issued_at = NULL,
        cancelled_at = now(),
        provider_data = COALESCE(provider_data, '{}'::jsonb)
          || jsonb_build_object(
            'uuidCollisionDetach',
            jsonb_build_object(
              'detachedInvoiceNumber', r.invoice_number,
              'detachedCqtCode', r.cqt_code,
              'reboundToTaxInvoiceId', v_leftover.id
            )
          ),
        updated_at = now()
    WHERE id = v_stolen.id;

    INSERT INTO public.tax_invoice_events (
      tax_invoice_id, tenant_id, from_status, to_status, actor_id, payload, note
    ) VALUES (
      v_stolen.id,
      v_stolen.tenant_id,
      'issued',
      'cancelled',
      NULL,
      jsonb_build_object(
        'detached_invoice_number', r.invoice_number,
        'rebound_to_tax_invoice_id', v_leftover.id,
        'trigger_source', 'uuid_collision_rebind'
      ),
      'Detached misbound Viettel invoice; legal document belongs to leftover order'
    );

    INSERT INTO public.tax_invoices (
      tenant_id, branch_id, order_id, status, invoice_kind,
      buyer_name, buyer_tax_code, buyer_address, buyer_email,
      subtotal, vat_rate, vat_amount, total_amount,
      provider, created_by,
      invoice_profile_id, invoice_profile_version, template_code, invoice_series,
      seller_name, seller_tax_code, seller_address, invoice_snapshot,
      invoice_time
    ) VALUES (
      v_stolen.tenant_id, v_stolen.branch_id, v_stolen.order_id, 'draft',
      v_stolen.invoice_kind,
      v_stolen.buyer_name, v_stolen.buyer_tax_code, v_stolen.buyer_address,
      v_stolen.buyer_email,
      v_stolen.subtotal, v_stolen.vat_rate, v_stolen.vat_amount,
      v_stolen.total_amount,
      v_stolen.provider, v_stolen.created_by,
      v_stolen.invoice_profile_id, v_stolen.invoice_profile_version,
      v_stolen.template_code, v_stolen.invoice_series,
      v_stolen.seller_name, v_stolen.seller_tax_code, v_stolen.seller_address,
      v_stolen.invoice_snapshot,
      v_stolen.invoice_time
    )
    RETURNING id INTO v_new_id;

    INSERT INTO public.tax_invoice_events (
      tax_invoice_id, tenant_id, from_status, to_status, actor_id, payload, note
    ) VALUES (
      v_new_id,
      v_stolen.tenant_id,
      NULL,
      'draft',
      NULL,
      jsonb_build_object(
        'cloned_from_tax_invoice_id', v_stolen.id,
        'trigger_source', 'uuid_collision_rebind'
      ),
      'New draft after detaching misbound Viettel invoice'
    );

    UPDATE public.tax_invoice_issue_jobs
    SET tax_invoice_id = v_new_id,
        status = 'queued',
        locked_until = NULL,
        last_error = NULL,
        available_at = now(),
        invoice_payload = COALESCE(invoice_payload, '{}'::jsonb)
          || jsonb_build_object('allowBacklogSubmitDate', true),
        updated_at = now()
    WHERE id = v_stolen_job.id;

    v_rebound := v_rebound + 1;
  END LOOP;

  IF v_rebound IS DISTINCT FROM 58 THEN
    RAISE EXCEPTION 'hddt_uuid_collision_rebind_count_invalid:%', v_rebound
      USING ERRCODE = '22023';
  END IF;
END
$$;

CREATE UNIQUE INDEX uq_tax_invoices_issued_invoice_number
  ON public.tax_invoices (invoice_number)
  WHERE status = 'issued' AND invoice_number IS NOT NULL;

CREATE OR REPLACE FUNCTION public.reconcile_tax_invoice_provider_issued(
  p_tax_invoice_id bigint,
  p_provider_ref text,
  p_invoice_number text,
  p_cqt_code text DEFAULT NULL::text,
  p_provider_data jsonb DEFAULT NULL::jsonb,
  p_issued_at timestamp with time zone DEFAULT now(),
  p_trigger_source text DEFAULT 'manual'::text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_invoice public.tax_invoices%ROWTYPE;
  v_before_status text;
BEGIN
  IF p_trigger_source NOT IN ('manual', 'cron') THEN
    RAISE EXCEPTION 'invalid_reconcile_trigger_source' USING ERRCODE = '22023';
  END IF;
  IF auth.role() <> 'service_role' THEN
    IF v_actor IS NULL
      OR v_tenant IS NULL
      OR NOT (public.auth_is_owner(v_actor) OR public.has_position('accountant'))
      OR NOT public.has_permission_any('finance:view') THEN
      RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF NULLIF(btrim(p_provider_ref), '') IS NULL
    OR NULLIF(btrim(p_invoice_number), '') IS NULL THEN
    RAISE EXCEPTION 'provider_ref_and_invoice_number_required'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_invoice
  FROM public.tax_invoices invoice
  WHERE invoice.id = p_tax_invoice_id
    AND (auth.role() = 'service_role' OR invoice.tenant_id = v_tenant)
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tax_invoice_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_invoice.status NOT IN ('signing', 'submitted') THEN
    RAISE EXCEPTION 'tax_invoice_reconcile_status_invalid'
      USING ERRCODE = '22023';
  END IF;
  IF v_invoice.provider_ref IS DISTINCT FROM btrim(p_provider_ref) THEN
    RAISE EXCEPTION 'tax_invoice_provider_ref_mismatch'
      USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.tax_invoices other
    WHERE other.invoice_number = btrim(p_invoice_number)
      AND other.status = 'issued'
      AND other.id IS DISTINCT FROM p_tax_invoice_id
  ) THEN
    RAISE EXCEPTION 'tax_invoice_number_already_bound'
      USING ERRCODE = '23505';
  END IF;

  v_before_status := v_invoice.status;
  UPDATE public.tax_invoices
  SET invoice_number = btrim(p_invoice_number),
      cqt_code = NULLIF(btrim(p_cqt_code), ''),
      provider_data = COALESCE(p_provider_data, provider_data),
      issued_at = COALESCE(p_issued_at, now()),
      status = 'issued',
      updated_at = now()
  WHERE id = v_invoice.id;

  INSERT INTO public.tax_invoice_events (
    tax_invoice_id, tenant_id, from_status, to_status, actor_id, payload, note
  ) VALUES (
    v_invoice.id,
    v_invoice.tenant_id,
    v_before_status,
    'issued',
    v_actor,
    jsonb_build_object(
      'provider_ref', btrim(p_provider_ref),
      'invoice_number', btrim(p_invoice_number),
      'cqt_code', NULLIF(btrim(p_cqt_code), ''),
      'trigger_source', p_trigger_source
    ) || COALESCE(p_provider_data, '{}'::jsonb),
    'Provider-issued invoice reconciled'
  );

  INSERT INTO public.reconcile_run_log (
    tenant_id, branch_id, tax_invoice_id, trigger_source, triggered_by,
    before_status, after_status, provider_returned, outcome, error,
    attempt_age_seconds
  ) VALUES (
    v_invoice.tenant_id,
    v_invoice.branch_id,
    v_invoice.id,
    p_trigger_source,
    v_actor,
    v_before_status,
    'issued',
    'issued',
    'transitioned',
    NULL,
    GREATEST(
      0,
      EXTRACT(
        EPOCH FROM (
          now() - COALESCE(v_invoice.signing_started_at, v_invoice.updated_at)
        )
      )::integer
    )
  );

  UPDATE public.tax_invoice_issue_jobs job
  SET status = 'completed',
      locked_until = NULL,
      last_error = NULL,
      updated_at = now()
  WHERE job.tax_invoice_id = v_invoice.id
    AND job.status <> 'completed';

  RETURN jsonb_build_object(
    'id', v_invoice.id,
    'status', 'issued',
    'invoice_number', btrim(p_invoice_number)
  );
END;
$$;

DO $$
DECLARE
  v_job public.tax_invoice_issue_jobs%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_fixed integer := 0;
BEGIN
  FOR v_job IN
    SELECT job.*
    FROM public.tax_invoice_issue_jobs job
    JOIN public.orders o ON o.id = job.order_id
    WHERE job.status = 'pending_payment'
      AND job.operation = 'issue'
      AND o.payment_status = 'paid'
      AND o.status = 'completed'
    FOR UPDATE OF job
  LOOP
    SELECT payment.* INTO v_payment
    FROM public.payments payment
    WHERE payment.order_id = v_job.order_id
      AND payment.status = 'completed'
    ORDER BY payment.id DESC
    LIMIT 1;
    IF v_payment.id IS NULL THEN
      RAISE EXCEPTION 'hddt_pending_payment_completed_missing:%', v_job.id
        USING ERRCODE = 'P0002';
    END IF;
    PERFORM private.upsert_tax_invoice_issue_job(
      v_job.tenant_id,
      v_job.branch_id,
      v_job.order_id,
      v_payment.id,
      v_job.invoice_payload,
      'queued'
    );
    UPDATE public.tax_invoice_issue_jobs
    SET invoice_payload = COALESCE(invoice_payload, '{}'::jsonb)
          || jsonb_build_object('allowBacklogSubmitDate', true),
        available_at = now(),
        last_error = NULL,
        locked_until = NULL,
        updated_at = now()
    WHERE id = v_job.id;
    v_fixed := v_fixed + 1;
  END LOOP;

  IF v_fixed NOT IN (0, 1) THEN
    RAISE EXCEPTION 'hddt_pending_payment_rebind_count_invalid:%', v_fixed
      USING ERRCODE = '22023';
  END IF;
END
$$;

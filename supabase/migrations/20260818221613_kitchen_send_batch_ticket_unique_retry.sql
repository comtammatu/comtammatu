-- Kitchen tickets derive #NNN from the order sequence. Concurrent sends that
-- collapse to the same display code hit
-- kitchen_send_batches_branch_date_ticket_number_unique (23505) and roll back
-- append_order_items. Retry once with the already-allocated daily ticket_seq.

DO $patch_route$
DECLARE
  v_def text;
  v_updated text;
  v_insert text;
  v_wrapped text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(p.oid)
  INTO v_def
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n
    ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'route_order_to_kds'
    AND pg_catalog.pg_get_function_identity_arguments(p.oid) = 'p_order_id bigint';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'route_order_to_kds missing';
  END IF;

  v_def := replace(replace(v_def, E'\r\n', E'\n'), E'\r', E'\n');
  v_def := regexp_replace(
    v_def,
    '^CREATE (OR REPLACE )?FUNCTION',
    'CREATE OR REPLACE FUNCTION'
  );

  v_insert := $insert$INSERT INTO public.kitchen_send_batches (
          tenant_id, branch_id, order_id, counter_date, ticket_seq,
          kitchen_ticket_number, send_seq, kind, created_by
        )
        VALUES (
          v_order.tenant_id,
          v_order.branch_id,
          p_order_id,
          (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
          v_ticket_seq,
          v_ticket_number,
          v_send_seq,
          CASE WHEN v_send_seq = 1 THEN 'initial' ELSE 'append' END,
          auth.uid()
        )
        RETURNING id INTO v_batch_id;$insert$;

  v_wrapped := $wrapped$BEGIN
          INSERT INTO public.kitchen_send_batches (
            tenant_id, branch_id, order_id, counter_date, ticket_seq,
            kitchen_ticket_number, send_seq, kind, created_by
          )
          VALUES (
            v_order.tenant_id,
            v_order.branch_id,
            p_order_id,
            (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
            v_ticket_seq,
            v_ticket_number,
            v_send_seq,
            CASE WHEN v_send_seq = 1 THEN 'initial' ELSE 'append' END,
            auth.uid()
          )
          RETURNING id INTO v_batch_id;
        EXCEPTION
          WHEN unique_violation THEN
            v_ticket_number := '#' || v_ticket_base || '-' || v_ticket_seq::text;
            INSERT INTO public.kitchen_send_batches (
              tenant_id, branch_id, order_id, counter_date, ticket_seq,
              kitchen_ticket_number, send_seq, kind, created_by
            )
            VALUES (
              v_order.tenant_id,
              v_order.branch_id,
              p_order_id,
              (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
              v_ticket_seq,
              v_ticket_number,
              v_send_seq,
              CASE WHEN v_send_seq = 1 THEN 'initial' ELSE 'append' END,
              auth.uid()
            )
            RETURNING id INTO v_batch_id;
        END;$wrapped$;

  v_updated := replace(v_def, v_insert, v_wrapped);
  IF v_updated = v_def THEN
    RAISE EXCEPTION 'route_order_to_kds KDS-path ticket insert patch failed';
  END IF;

  v_insert := $insert$INSERT INTO public.kitchen_send_batches (
        tenant_id, branch_id, order_id, counter_date, ticket_seq,
        kitchen_ticket_number, send_seq, kind, created_by
      )
      VALUES (
        v_order.tenant_id,
        v_order.branch_id,
        p_order_id,
        (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
        v_ticket_seq,
        v_ticket_number,
        v_send_seq,
        CASE WHEN v_send_seq = 1 THEN 'initial' ELSE 'append' END,
        auth.uid()
      )
      RETURNING id INTO v_batch_id;$insert$;

  v_wrapped := $wrapped$BEGIN
        INSERT INTO public.kitchen_send_batches (
          tenant_id, branch_id, order_id, counter_date, ticket_seq,
          kitchen_ticket_number, send_seq, kind, created_by
        )
        VALUES (
          v_order.tenant_id,
          v_order.branch_id,
          p_order_id,
          (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
          v_ticket_seq,
          v_ticket_number,
          v_send_seq,
          CASE WHEN v_send_seq = 1 THEN 'initial' ELSE 'append' END,
          auth.uid()
        )
        RETURNING id INTO v_batch_id;
      EXCEPTION
        WHEN unique_violation THEN
          v_ticket_number := '#' || v_ticket_base || '-' || v_ticket_seq::text;
          INSERT INTO public.kitchen_send_batches (
            tenant_id, branch_id, order_id, counter_date, ticket_seq,
            kitchen_ticket_number, send_seq, kind, created_by
          )
          VALUES (
            v_order.tenant_id,
            v_order.branch_id,
            p_order_id,
            (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
            v_ticket_seq,
            v_ticket_number,
            v_send_seq,
            CASE WHEN v_send_seq = 1 THEN 'initial' ELSE 'append' END,
            auth.uid()
          )
          RETURNING id INTO v_batch_id;
      END;$wrapped$;

  IF pg_catalog.strpos(v_updated, v_insert) = 0 THEN
    RAISE EXCEPTION 'route_order_to_kds printer-path ticket insert not found';
  END IF;
  v_updated := replace(v_updated, v_insert, v_wrapped);

  IF v_updated !~ 'unique_violation' THEN
    RAISE EXCEPTION 'route_order_to_kds unique_violation retry missing';
  END IF;

  EXECUTE v_updated;
END;
$patch_route$;

-- Migration: finance_zero_opex_inventory_breakdown

BEGIN;

-- Preserve the mature cockpit implementation behind a private helper, then
-- enrich its stable jsonb contract without duplicating the full query body.
ALTER FUNCTION public.get_finance_operating_cockpit(text, date, date, bigint)
  RENAME TO get_finance_operating_cockpit_without_inventory_breakdown;
ALTER FUNCTION public.get_finance_operating_cockpit_without_inventory_breakdown(
  text,
  date,
  date,
  bigint
) SET SCHEMA private;

REVOKE ALL ON FUNCTION
  private.get_finance_operating_cockpit_without_inventory_breakdown(
    text,
    date,
    date,
    bigint
  )
  FROM PUBLIC;
REVOKE ALL ON FUNCTION
  private.get_finance_operating_cockpit_without_inventory_breakdown(
    text,
    date,
    date,
    bigint
  )
  FROM authenticated;

CREATE FUNCTION public.get_finance_operating_cockpit(
  p_location text,
  p_start_date date,
  p_end_date date,
  p_branch_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_payload jsonb;
  v_breakdown jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR public.auth_tenant_id() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission_any('finance:view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_payload := private.get_finance_operating_cockpit_without_inventory_breakdown(
    p_location,
    p_start_date,
    p_end_date,
    p_branch_id
  );

  IF lower(btrim(COALESCE(p_location, ''))) = 'all'
     AND COALESCE(
       (v_payload ->> 'inventory_change_included')::boolean,
       false
     )
  THEN
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'location_kind', grouped.location_kind,
          'site_count', grouped.site_count,
          'opening_value', grouped.opening_value::text,
          'closing_value', grouped.closing_value::text,
          'change', grouped.change::text
        )
        ORDER BY CASE grouped.location_kind
          WHEN 'branch' THEN 1
          WHEN 'central_supply' THEN 2
          WHEN 'central_kitchen' THEN 3
          ELSE 4
        END
      ),
      '[]'::jsonb
    )
    INTO v_breakdown
    FROM (
      SELECT
        branch.branch_kind AS location_kind,
        COUNT(*)::integer AS site_count,
        COALESCE(SUM(period.opening_value), 0) AS opening_value,
        COALESCE(SUM(period.closing_value), 0) AS closing_value,
        COALESCE(
          SUM(period.closing_value - period.opening_value),
          0
        ) AS change
      FROM public.get_inventory_valuation_period_value(
        p_start_date,
        p_end_date,
        NULL
      ) AS period
      JOIN public.branches AS branch
        ON branch.id = period.branch_id
       AND branch.tenant_id = public.auth_tenant_id()
      GROUP BY branch.branch_kind
    ) AS grouped;
  END IF;

  RETURN v_payload || jsonb_build_object(
    'inventory_breakdown', v_breakdown
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_finance_operating_cockpit(
  text,
  date,
  date,
  bigint
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_finance_operating_cockpit(
  text,
  date,
  date,
  bigint
) TO authenticated;

COMMENT ON FUNCTION public.get_finance_operating_cockpit(
  text,
  date,
  date,
  bigint
) IS
  'Period operating KPIs for /finance, including all-scope inventory change by operating-site kind.';

-- A month with no operating-expense row is review evidence, not proof that
-- the numeric total is unknown. Keep the finding but downgrade it so 0đ does
-- not block close readiness or the period-result identity.
ALTER FUNCTION public.get_finance_period_close_readiness(
  integer,
  integer,
  bigint
) RENAME TO get_finance_period_close_readiness_with_opex_gate;
ALTER FUNCTION public.get_finance_period_close_readiness_with_opex_gate(
  integer,
  integer,
  bigint
) SET SCHEMA private;

REVOKE ALL ON FUNCTION
  private.get_finance_period_close_readiness_with_opex_gate(
    integer,
    integer,
    bigint
  )
  FROM PUBLIC;
REVOKE ALL ON FUNCTION
  private.get_finance_period_close_readiness_with_opex_gate(
    integer,
    integer,
    bigint
  )
  FROM authenticated;

CREATE FUNCTION public.get_finance_period_close_readiness(
  p_year integer,
  p_month integer,
  p_branch_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_payload jsonb;
  v_blockers jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_opex_warnings jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR public.auth_tenant_id() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission_any('finance:view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_payload := private.get_finance_period_close_readiness_with_opex_gate(
    p_year,
    p_month,
    p_branch_id
  );

  SELECT
    COALESCE(
      jsonb_agg(finding.value)
        FILTER (
          WHERE finding.value ->> 'code' <> 'operating_expense_missing'
        ),
      '[]'::jsonb
    ),
    COALESCE(
      jsonb_agg(
        finding.value || jsonb_build_object('severity', 'warning')
      ) FILTER (
        WHERE finding.value ->> 'code' = 'operating_expense_missing'
      ),
      '[]'::jsonb
    )
  INTO v_blockers, v_opex_warnings
  FROM jsonb_array_elements(v_payload -> 'blockers') AS finding(value);

  v_warnings := COALESCE(v_payload -> 'warnings', '[]'::jsonb)
    || v_opex_warnings;

  RETURN v_payload || jsonb_build_object(
    'blocker_count', jsonb_array_length(v_blockers),
    'warning_count', jsonb_array_length(v_warnings),
    'can_close', jsonb_array_length(v_blockers) = 0,
    'blockers', v_blockers,
    'warnings', v_warnings
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_finance_period_close_readiness(
  integer,
  integer,
  bigint
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_finance_period_close_readiness(
  integer,
  integer,
  bigint
) TO authenticated;

COMMENT ON FUNCTION public.get_finance_period_close_readiness(
  integer,
  integer,
  bigint
) IS
  'Read-only close-readiness health check. Missing operating-expense rows are advisory because a 0đ period total is valid.';

COMMIT;

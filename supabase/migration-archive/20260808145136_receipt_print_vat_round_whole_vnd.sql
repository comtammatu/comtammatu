-- Align receipt/provisional bill VAT print amounts to whole VND.
-- Matches Viettel Sinvoice normalizeMoney / Math.round (half away from zero):
-- round net and gross to đồng, VAT is the residual so rate lines stay additive.

CREATE OR REPLACE FUNCTION public.bill_tax_breakdowns(p_order_id bigint)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'rate', rounded.vat_rate,
        'amount', rounded.amount
      )
      ORDER BY rounded.vat_rate DESC
    ),
    '[]'::jsonb
  )
  FROM (
    SELECT
      vat.vat_rate,
      (
        ROUND(vat.line_gross, 0)
        - ROUND(vat.line_gross / (1 + vat.vat_rate / 100.0), 0)
      )::numeric(15, 2) AS amount
    FROM public._compute_vat_breakdown(ARRAY[p_order_id]) AS vat
    WHERE vat.vat_rate IS NOT NULL
  ) AS rounded
  WHERE rounded.amount > 0;
$$;

COMMENT ON FUNCTION public.bill_tax_breakdowns(p_order_id bigint) IS
  'Payment-bill VAT lines for print payloads: [{rate, amount}] in whole VND. Net/gross ROUND half away from zero (Sinvoice-compatible); amount is residual; descending by rate; positive VAT only.';

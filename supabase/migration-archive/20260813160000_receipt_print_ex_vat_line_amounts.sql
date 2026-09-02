-- Payment-bill print Thành tiền is exclusive of VAT. bill_line_items must
-- snapshot order_items.vat_rate so print-render can convert GROSS POS prices
-- with the same whole-VND net as bill_tax_breakdowns.

CREATE OR REPLACE FUNCTION public.bill_line_items(p_order_id bigint)
    RETURNS jsonb
    LANGUAGE sql
    STABLE
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(jsonb_agg(line ORDER BY first_id), '[]'::jsonb)
  FROM (
    SELECT
      jsonb_build_object(
        'item_name',     oi.item_name,
        'variant_name',  oi.variant_name,
        'category_type', mc.type,
        'quantity',      SUM(oi.quantity),
        'unit_price',    oi.unit_price,
        'modifiers',     oi.modifiers,
        'sides',         oi.sides,
        'subtotal',      SUM(oi.subtotal),
        'vat_rate',      oi.vat_rate,
        'note',          NULL::text
      ) AS line,
      MIN(oi.id) AS first_id
    FROM public.order_items oi
    LEFT JOIN public.menu_items mi
      ON mi.id = oi.menu_item_id
     AND mi.tenant_id = oi.tenant_id
    LEFT JOIN public.menu_categories mc
      ON mc.id = mi.category_id
     AND mc.tenant_id = oi.tenant_id
    WHERE oi.order_id = p_order_id
      AND oi.status <> 'cancelled'
    GROUP BY
      oi.menu_item_id, oi.variant_id, oi.item_name, oi.variant_name,
      oi.unit_price, oi.modifiers, oi.sides, oi.vat_rate, mc.type
  ) grouped;
$$;

COMMENT ON FUNCTION public.bill_line_items(bigint) IS
  'Payment-bill (provisional + receipt) line items: one entry per distinct sold product (menu_item, variant, unit_price, modifiers, sides, vat_rate, category), quantity/subtotal summed. Item note is not part of the key — it is hidden on bills — so a noted and an un-noted portion of the same dish merge into one line. vat_rate is snapshotted so print-render can show ex-VAT Thành tiền. Not for HĐĐT (separate builder).';

REVOKE ALL ON FUNCTION public.bill_line_items(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bill_line_items(bigint) FROM anon;
GRANT EXECUTE ON FUNCTION public.bill_line_items(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bill_line_items(bigint) TO service_role;

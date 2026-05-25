-- Shift-close print: render item breakdown as "Mon | SL | Thanh tien".
--
-- Keep the print-agent primitive-only. The DB materializer emits fixed-width
-- text rows so old and new agents render the same 80mm layout.

CREATE OR REPLACE FUNCTION public.print_template_shift_item_breakdown_blocks(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_out JSONB := '[]'::jsonb;
  v_items JSONB := CASE
    WHEN jsonb_typeof(p_payload->'item_breakdown') = 'array' THEN p_payload->'item_breakdown'
    ELSE '[]'::jsonb
  END;
  v_row JSONB;
  v_name TEXT;
  v_display_name TEXT;
  v_qty NUMERIC;
  v_revenue NUMERIC;
  v_total NUMERIC := 0;
  v_name_width CONSTANT INT := 27;
  v_qty_width CONSTANT INT := 5;
  v_amount_width CONSTANT INT := 16;
BEGIN
  IF jsonb_array_length(v_items) = 0 THEN
    RETURN v_out;
  END IF;

  SELECT COALESCE(SUM(COALESCE(NULLIF(value->>'qty', '')::numeric, 0)), 0)
  INTO v_total
  FROM jsonb_array_elements(v_items);

  v_out := v_out || jsonb_build_array(
    public.print_template_divider_block('-'),
    public.print_template_text_block('SỐ LƯỢNG BÁN THEO MÓN', 'center', true),
    public.print_template_row_block('Tổng SL bán', trim(to_char(v_total, 'FM999999'))),
    public.print_template_divider_block('-'),
    public.print_template_text_block(
      rpad('Món', v_name_width)
      || lpad('SL', v_qty_width)
      || lpad('Thành tiền', v_amount_width),
      NULL,
      true
    ),
    public.print_template_divider_block('-')
  );

  FOR v_row IN
    SELECT value
    FROM jsonb_array_elements(v_items)
  LOOP
    v_name := COALESCE(NULLIF(v_row->>'name', ''), 'Món');
    v_display_name := CASE
      WHEN char_length(v_name) > v_name_width THEN left(v_name, v_name_width - 1) || '.'
      ELSE v_name
    END;
    v_qty := COALESCE(NULLIF(v_row->>'qty', '')::numeric, 0);
    v_revenue := COALESCE(NULLIF(v_row->>'revenue', '')::numeric, 0);

    v_out := v_out || jsonb_build_array(
      public.print_template_text_block(
        rpad(v_display_name, v_name_width)
        || lpad(trim(to_char(v_qty, 'FM999999')), v_qty_width)
        || lpad(public.print_template_money(v_revenue), v_amount_width)
      )
    );
  END LOOP;

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.print_template_shift_item_breakdown_blocks(JSONB) FROM PUBLIC;

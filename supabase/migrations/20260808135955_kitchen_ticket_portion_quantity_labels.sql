-- Kitchen ticket labels: Nx = portion count; side xN = quantity per portion.
-- Keep in sync with packages/print-render/src/composite-blocks.ts kitchenItemBlocks.

CREATE OR REPLACE FUNCTION public.print_template_kitchen_item_blocks(
  p_payload jsonb,
  p_strikethrough boolean DEFAULT false
) RETURNS jsonb
  LANGUAGE plpgsql
  IMMUTABLE
  SET search_path TO 'public'
AS $$
DECLARE
  v_out JSONB := '[]'::jsonb;
  v_item JSONB;
  v_modifier JSONB;
  v_side JSONB;
  v_idx INT := 0;
  v_qty NUMERIC;
  v_side_qty NUMERIC;
  v_side_name TEXT;
  v_border TEXT := '----+' || repeat('-', 43);
BEGIN
  v_out := v_out || jsonb_build_array(
    public.print_template_text_block(v_border),
    public.print_template_text_block(' SL | MÓN', NULL, true),
    public.print_template_text_block(v_border)
  );

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'items', '[]'::jsonb))
  LOOP
    v_idx := v_idx + 1;
    IF v_idx > 1 THEN
      v_out := v_out || jsonb_build_array(public.print_template_text_block(v_border));
    END IF;

    v_qty := COALESCE(NULLIF(v_item->>'quantity', '')::numeric, 0);
    v_out := v_out || jsonb_build_array(
      public.print_template_text_block(
        ' ' || trim(to_char(GREATEST(v_qty, 1), 'FM999999')) || 'x | ' || COALESCE(v_item->>'item_name', ''),
        NULL,
        true,
        true,
        false,
        p_strikethrough
      )
    );

    IF COALESCE(NULLIF(v_item->>'variant_name', ''), '') <> '' THEN
      v_out := v_out || jsonb_build_array(
        public.print_template_text_block(
          '    |   (' || (v_item->>'variant_name') || ')',
          NULL,
          false,
          false,
          false,
          p_strikethrough
        )
      );
    END IF;

    FOR v_modifier IN SELECT value FROM jsonb_array_elements(COALESCE(v_item->'modifiers', '[]'::jsonb))
    LOOP
      IF COALESCE(NULLIF(v_modifier->>'name', ''), '') <> '' THEN
        v_out := v_out || jsonb_build_array(
          public.print_template_text_block(
            '    |   + ' || (v_modifier->>'name'),
            NULL,
            false,
            false,
            false,
            p_strikethrough
          )
        );
      END IF;
    END LOOP;

    FOR v_side IN SELECT value FROM jsonb_array_elements(COALESCE(v_item->'sides', '[]'::jsonb))
    LOOP
      v_side_name := COALESCE(NULLIF(v_side->>'name', ''), v_side->>'side_item_name', '');
      IF v_side_name <> '' THEN
        -- Per portion only; parent Nx already carries the portion count.
        v_side_qty := COALESCE(NULLIF(v_side->>'quantity', '')::numeric, 1);
        IF v_side_qty <= 0 THEN
          v_side_qty := 1;
        END IF;
        v_out := v_out || jsonb_build_array(
          public.print_template_text_block(
            '    |   - ' || v_side_name || ' x' || trim(to_char(v_side_qty, 'FM999999')),
            NULL,
            true,
            true,
            false,
            p_strikethrough
          )
        );
      END IF;
    END LOOP;

    IF COALESCE(NULLIF(v_item->>'note', ''), '') <> '' THEN
      v_out := v_out || jsonb_build_array(
        public.print_template_text_block(
          '    |   * ' || (v_item->>'note'),
          NULL,
          true,
          true,
          false,
          p_strikethrough
        )
      );
    END IF;
  END LOOP;

  v_out := v_out || jsonb_build_array(public.print_template_text_block(v_border));
  RETURN v_out;
END;
$$;

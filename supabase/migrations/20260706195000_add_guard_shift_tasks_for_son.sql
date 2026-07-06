-- Add default per-position shift tasks for Bảo vệ (son@comtammatu.com).
-- Uses the current position assignment from profile, not a global position heuristic,
-- so task changes are scoped to the intended tenant/position.

DO $$
DECLARE
  v_tenant_id bigint;
  v_position_id bigint;
  v_next_sort_order integer;
BEGIN
  SELECT p.tenant_id, p.position_id
    INTO v_tenant_id, v_position_id
    FROM public.profiles p
    JOIN auth.users au ON au.id = p.id
    JOIN public.positions po ON po.id = p.position_id
   WHERE lower(au.email) = 'son@comtammatu.com'
     AND po.label_vi = 'Bảo vệ'
    LIMIT 1;

  IF NOT FOUND THEN
    RAISE NOTICE 'No active profile found for son@comtammatu.com with position label "Bảo vệ". Skipping task insert.';
    RETURN;
  END IF;

  SELECT COALESCE(MAX(sort_order), 0)
    INTO v_next_sort_order
    FROM public.position_shift_tasks
   WHERE tenant_id = v_tenant_id
     AND position_id = v_position_id;

  IF NOT EXISTS (
    SELECT 1
      FROM public.position_shift_tasks
     WHERE tenant_id = v_tenant_id
       AND position_id = v_position_id
       AND title = N'Quét dọn khu vực trước quán'
       AND phase = 'start_of_shift'
  ) THEN
    v_next_sort_order := v_next_sort_order + 1;
    INSERT INTO public.position_shift_tasks (
      tenant_id,
      position_id,
      title,
      kind,
      applicability,
      phase,
      is_required,
      done_definition,
      sort_order
    ) VALUES (
      v_tenant_id,
      v_position_id,
      N'Quét dọn khu vực trước quán',
      'standard',
      'every_shift',
      'start_of_shift',
      true,
      N'Quét dọn khu vực trước quán trước ca.',
      v_next_sort_order
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.position_shift_tasks
     WHERE tenant_id = v_tenant_id
       AND position_id = v_position_id
       AND title = N'5h kéo bạt cho thoáng không gian quán'
       AND phase = 'end_of_shift'
  ) THEN
    v_next_sort_order := v_next_sort_order + 1;
    INSERT INTO public.position_shift_tasks (
      tenant_id,
      position_id,
      title,
      kind,
      applicability,
      phase,
      is_required,
      done_definition,
      sort_order
    ) VALUES (
      v_tenant_id,
      v_position_id,
      N'5h kéo bạt cho thoáng không gian quán',
      'standard',
      'every_shift',
      'end_of_shift',
      true,
      N'Kéo bạt cho thoáng không gian quán trước khi kết ca.',
      v_next_sort_order
    );
  END IF;
END;
$$;

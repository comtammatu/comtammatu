-- Migration: attendance_workday_grace_minutes
-- Keep quarter-day buckets from 2026-09, but forgive up to 15 minutes late-in
-- or early-out when computing overlap against the frozen scheduled window.
BEGIN;

CREATE OR REPLACE FUNCTION public.attendance_shift_workdays(
  p_check_in timestamptz,
  p_check_out timestamptz,
  p_scheduled_start timestamptz,
  p_scheduled_end timestamptz
) RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $$
DECLARE
  v_grace interval := interval '15 minutes';
  v_effective_in timestamptz;
  v_effective_out timestamptz;
  v_overlap_start timestamptz;
  v_overlap_end timestamptz;
  v_worked_seconds numeric;
  v_shift_seconds numeric;
  v_ratio numeric;
BEGIN
  IF p_check_in IS NULL
     OR p_check_out IS NULL
     OR p_scheduled_start IS NULL
     OR p_scheduled_end IS NULL
     OR p_check_out <= p_check_in
     OR p_scheduled_end <= p_scheduled_start THEN
    RETURN 0;
  END IF;

  -- Late in / early out within grace counts as covering that edge of the window.
  IF p_check_in <= p_scheduled_start + v_grace THEN
    v_effective_in := p_scheduled_start;
  ELSE
    v_effective_in := p_check_in;
  END IF;

  IF p_check_out >= p_scheduled_end - v_grace THEN
    v_effective_out := p_scheduled_end;
  ELSE
    v_effective_out := p_check_out;
  END IF;

  IF v_effective_out <= v_effective_in THEN
    RETURN 0;
  END IF;

  v_overlap_start := GREATEST(v_effective_in, p_scheduled_start);
  v_overlap_end := LEAST(v_effective_out, p_scheduled_end);
  IF v_overlap_end <= v_overlap_start THEN
    RETURN 0;
  END IF;

  v_worked_seconds := EXTRACT(EPOCH FROM (v_overlap_end - v_overlap_start));
  v_shift_seconds := EXTRACT(EPOCH FROM (p_scheduled_end - p_scheduled_start));
  IF v_shift_seconds <= 0 THEN
    RETURN 0;
  END IF;

  v_ratio := v_worked_seconds / v_shift_seconds;
  IF p_scheduled_start >= timestamptz '2026-09-01 00:00:00+07' THEN
    RETURN LEAST(1.0, FLOOR(v_ratio * 4) / 4);
  END IF;

  RETURN LEAST(1.0, ROUND(v_ratio, 1));
END;
$$;

COMMENT ON FUNCTION public.attendance_shift_workdays(
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz
) IS 'Versioned attendance credit: legacy tenth-day rounding before September 2026; from September 2026 completed quarter-day buckets with a 15-minute late-in/early-out grace on the frozen scheduled window.';

CREATE OR REPLACE FUNCTION public.attendance_shift_workdays_for_record(
  p_record public.attendance_records
) RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $$
DECLARE
  v_grace interval := interval '15 minutes';
  v_w1_start timestamptz := p_record.scheduled_start_at;
  v_w1_end timestamptz := p_record.scheduled_end_at;
  v_w2_start timestamptz := p_record.scheduled_start_at_2;
  v_w2_end timestamptz := p_record.scheduled_end_at_2;
  v_punch1_start timestamptz := p_record.check_in;
  v_punch1_end timestamptz := COALESCE(p_record.window_1_out_at, p_record.check_out);
  v_punch2_start timestamptz := p_record.check_in_2;
  v_punch2_end timestamptz := p_record.check_out;
  v_effective1_start timestamptz;
  v_effective1_end timestamptz;
  v_effective2_start timestamptz;
  v_effective2_end timestamptz;
  v_overlap1 numeric := 0;
  v_overlap2 numeric := 0;
  v_shift_seconds numeric;
  v_ratio numeric;
BEGIN
  IF p_record.check_out IS NULL OR p_record.check_in IS NULL OR v_w1_start IS NULL OR v_w1_end IS NULL THEN
    RETURN 0;
  END IF;

  IF v_w2_start IS NULL OR v_w2_end IS NULL THEN
    RETURN public.attendance_shift_workdays(
      p_record.check_in,
      p_record.check_out,
      v_w1_start,
      v_w1_end
    );
  END IF;

  IF v_w1_end <= v_w1_start OR v_w2_end <= v_w2_start THEN
    RETURN 0;
  END IF;

  v_shift_seconds := EXTRACT(EPOCH FROM (v_w1_end - v_w1_start)) + EXTRACT(EPOCH FROM (v_w2_end - v_w2_start));
  IF v_shift_seconds <= 0 THEN
    RETURN 0;
  END IF;

  IF v_punch1_start IS NOT NULL AND v_punch1_end IS NOT NULL AND v_punch1_end > v_punch1_start THEN
    IF v_punch1_start <= v_w1_start + v_grace THEN
      v_effective1_start := v_w1_start;
    ELSE
      v_effective1_start := v_punch1_start;
    END IF;
    IF v_punch1_end >= v_w1_end - v_grace THEN
      v_effective1_end := v_w1_end;
    ELSE
      v_effective1_end := v_punch1_end;
    END IF;
    IF LEAST(v_effective1_end, v_w1_end) > GREATEST(v_effective1_start, v_w1_start) THEN
      v_overlap1 := EXTRACT(EPOCH FROM (
        LEAST(v_effective1_end, v_w1_end) - GREATEST(v_effective1_start, v_w1_start)
      ));
    END IF;
  END IF;

  IF v_punch2_start IS NOT NULL AND v_punch2_end IS NOT NULL AND v_punch2_end > v_punch2_start THEN
    IF v_punch2_start <= v_w2_start + v_grace THEN
      v_effective2_start := v_w2_start;
    ELSE
      v_effective2_start := v_punch2_start;
    END IF;
    IF v_punch2_end >= v_w2_end - v_grace THEN
      v_effective2_end := v_w2_end;
    ELSE
      v_effective2_end := v_punch2_end;
    END IF;
    IF LEAST(v_effective2_end, v_w2_end) > GREATEST(v_effective2_start, v_w2_start) THEN
      v_overlap2 := EXTRACT(EPOCH FROM (
        LEAST(v_effective2_end, v_w2_end) - GREATEST(v_effective2_start, v_w2_start)
      ));
    END IF;
  ELSIF (p_record.window_1_out_at IS NULL OR v_punch1_start >= v_w1_end)
        AND v_punch1_start IS NOT NULL AND v_punch1_end IS NOT NULL AND v_punch1_end > v_punch1_start THEN
    IF v_punch1_start <= v_w2_start + v_grace THEN
      v_effective2_start := v_w2_start;
    ELSE
      v_effective2_start := v_punch1_start;
    END IF;
    IF v_punch1_end >= v_w2_end - v_grace THEN
      v_effective2_end := v_w2_end;
    ELSE
      v_effective2_end := v_punch1_end;
    END IF;
    IF LEAST(v_effective2_end, v_w2_end) > GREATEST(v_effective2_start, v_w2_start) THEN
      v_overlap2 := EXTRACT(EPOCH FROM (
        LEAST(v_effective2_end, v_w2_end) - GREATEST(v_effective2_start, v_w2_start)
      ));
    END IF;
  END IF;

  IF (v_overlap1 + v_overlap2) <= 0 THEN
    RETURN 0;
  END IF;

  v_ratio := (v_overlap1 + v_overlap2) / v_shift_seconds;
  IF v_w1_start >= timestamptz '2026-09-01 00:00:00+07' THEN
    RETURN LEAST(1.0, FLOOR(v_ratio * 4) / 4);
  END IF;

  RETURN LEAST(1.0, ROUND(v_ratio, 1));
END;
$$;

COMMIT;

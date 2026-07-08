ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS birth_date date;

DROP FUNCTION IF EXISTS public.update_my_profile(text, text, text);

CREATE FUNCTION public.update_my_profile(
  p_full_name text DEFAULT NULL::text,
  p_phone text DEFAULT NULL::text,
  p_avatar_url text DEFAULT NULL::text,
  p_birth_date date DEFAULT NULL::date
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  UPDATE public.profiles
  SET full_name = COALESCE(p_full_name, full_name),
      phone = COALESCE(p_phone, phone),
      avatar_url = COALESCE(p_avatar_url, avatar_url),
      birth_date = COALESCE(p_birth_date, birth_date),
      updated_at = now()
  WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.update_my_profile(text, text, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_my_profile(text, text, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_my_profile(text, text, text, date) TO service_role;

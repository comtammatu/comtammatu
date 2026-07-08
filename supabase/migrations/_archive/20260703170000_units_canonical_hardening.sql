-- Canonical hardening for the units registry.
-- The registry is owner-editable via /inventory/settings/units; this migration keeps
-- the canonical shape (name = code, lowercase codes, accented packaging, symbol
-- standards) enforced going forward without hardcoding the list. Self-heal UPDATEs
-- converge any environment onto the canonical shape (no-ops on production, which is
-- already canonical); the CHECK constraint stops non-lowercase codes at write time.
-- Replay-safe: guarded self-heal, DO-guarded constraint add.

/* ─── 1. Self-heal: name mirrors code ───
   Bilingual/capitalized display names are dropped; name is always the code. */

UPDATE public.units
SET name = code
WHERE name IS DISTINCT FROM code;

/* ─── 2. Self-heal: re-accent known stripped packaging codes ───
   Only applied when the stripped code exists and its accented target is free
   for that tenant, so the rename can never collide with an existing row. */

UPDATE public.units u
SET code = v.accented, name = v.accented
FROM (
  VALUES
    ('goi', 'gói'),
    ('thung', 'thùng'),
    ('trai', 'trái'),
    ('vi', 'vỉ')
) AS v(stripped, accented)
WHERE u.code = v.stripped
  AND NOT EXISTS (
    SELECT 1 FROM public.units existing
    WHERE existing.tenant_id = u.tenant_id
      AND existing.code = v.accented
  );

/* ─── 3. Self-heal: recipe serving unit uses the canonical packaging code ─── */

UPDATE public.recipes
SET unit = 'cái'
WHERE unit = 'piece';

/* ─── 4. Enforce lowercase codes going forward ───
   Accents are allowed (gói, thùng, vỉ are canonical); only casing is
   constrained. Guarded so replay is a no-op once the constraint exists. */

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'units_code_lowercase_chk'
      AND conrelid = 'public.units'::regclass
  ) THEN
    ALTER TABLE public.units
      ADD CONSTRAINT units_code_lowercase_chk CHECK (code = lower(code));
  END IF;
END $$;

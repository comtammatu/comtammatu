-- =============================================================
-- Auth v3 — H3b: tenants.owner_user_id canonical owner identity
--
-- Driver: 4-agent security audit 2026-05-07. Original H3b spec proposed
-- adding `tenants.owner_user_id` AND extending has_permission() with a
-- second OR branch (defense-in-depth dual source). Architect synthesis
-- (Antithesis): H3a already enforces profiles.position_id NOT NULL with
-- FK ON DELETE RESTRICT, raising on every code path that could null
-- position (handle_new_user, admin_update_profile). The silent-demote
-- vector H3b would defend against IS ALREADY CLOSED at source by H3a.
-- Adding a hot-path EXISTS query for a class of bugs already prevented
-- duplicates state and creates a drift surface (positions.code='owner'
-- vs tenants.owner_user_id can desync).
--
-- Synthesis (minimum-regret): ship Migration 1 (column + backfill, NOT
-- NULL after verify) so the data foundation exists for future ownership
-- transfer UI/RPC. DEFER Migration 2 (has_permission function update) —
-- no functional regression to fix, no behavior change shipped here. If
-- a real second silent-demote incident occurs, flip Migration 2 in one
-- PR with the data already in place.
--
-- Three concepts kept SEPARATE per ADR 0005:
--   1. tenants.representative TEXT  — legal signatory name (CTCP docs)
--   2. positions.code='owner'       — HR label (display + JWT user_role)
--   3. tenants.owner_user_id UUID   — canonical auth identity (this file)
--
-- See: docs/plan/adr/0005-owner-identity-source-separation.md
-- See: tasks/regressions.md TENANT-OWNER-USER-ID-CANONICAL (new),
--      PROFILES-POSITION-ID-MUST-NOT-NULL (H3a sibling).
-- =============================================================

DO $$
DECLARE
  v_auth_user_count BIGINT;
  v_profile_count BIGINT;
  v_tenant_id BIGINT;
  v_owner_position_id BIGINT;
  v_keeper_id CONSTANT UUID := 'a0000002-0000-4000-8000-000000000002'::UUID;
BEGIN
  SELECT COUNT(*) INTO v_auth_user_count FROM auth.users;
  SELECT COUNT(*) INTO v_profile_count FROM public.profiles;

  IF v_auth_user_count = 0 OR v_profile_count = 0 THEN
    IF v_auth_user_count <> 0 OR v_profile_count <> 0 THEN
      RAISE EXCEPTION
        'H3b replay bootstrap refused asymmetric auth state: auth.users=%, profiles=%',
        v_auth_user_count,
        v_profile_count
        USING ERRCODE = 'P0001';
    END IF;

    IF (SELECT COUNT(*) FROM public.tenants) <> 1 THEN
      RAISE EXCEPTION
        'H3b replay bootstrap requires exactly one seeded tenant'
        USING ERRCODE = 'P0001';
    END IF;

    SELECT t.id
      INTO v_tenant_id
      FROM public.tenants t
     WHERE t.slug = 'comtammatu';

    IF v_tenant_id IS NULL THEN
      RAISE EXCEPTION
        'H3b replay bootstrap requires the comtammatu tenant'
        USING ERRCODE = 'P0001';
    END IF;

    SELECT MIN(po.id), COUNT(*)
      INTO v_owner_position_id, v_profile_count
      FROM public.positions po
     WHERE po.tenant_id = v_tenant_id
       AND po.code = 'owner'
       AND po.is_active = TRUE;

    IF v_profile_count <> 1 OR v_owner_position_id IS NULL THEN
      RAISE EXCEPTION
        'H3b replay bootstrap requires exactly one active owner position'
        USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change,
      is_sso_user,
      is_anonymous
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000'::UUID,
      v_keeper_id,
      'authenticated',
      'authenticated',
      jsonb_build_object(
        'tenant_id', v_tenant_id,
        'role', 'owner',
        'user_role', 'owner',
        'full_name', 'Owner (keeper)',
        'replay_sentinel', TRUE
      ),
      jsonb_build_object(
        'full_name', 'Owner (keeper)',
        'replay_sentinel', TRUE
      ),
      now(),
      now(),
      '',
      '',
      '',
      '',
      FALSE,
      FALSE
    );

    IF EXISTS (
      SELECT 1
        FROM auth.identities i
       WHERE i.user_id = v_keeper_id
    ) OR NOT EXISTS (
      SELECT 1
        FROM auth.users u
        JOIN public.profiles p ON p.id = u.id
       WHERE u.id = v_keeper_id
         AND u.email IS NULL
         AND u.phone IS NULL
         AND u.encrypted_password IS NULL
         AND u.email_confirmed_at IS NULL
         AND p.tenant_id = v_tenant_id
         AND p.position_id = v_owner_position_id
         AND p.is_active = TRUE
    ) THEN
      RAISE EXCEPTION
        'H3b replay bootstrap keeper invariant failed'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
END$$;

-- ─── 1. ADD COLUMN (initially nullable for backfill) ──────────
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS owner_user_id UUID
    REFERENCES auth.users(id) ON DELETE RESTRICT;

-- ─── 2. PRE-FLIGHT GATE — every tenant must have an active owner ──
-- Refuse to apply if any tenant lacks an active position='owner' holder.
-- Operator must seed before retry.
DO $$
DECLARE
  v_orphan_tenants INT;
  v_multi_owner_tenants INT;
BEGIN
  SELECT COUNT(*) INTO v_orphan_tenants
    FROM public.tenants t
   WHERE NOT EXISTS (
     SELECT 1 FROM public.profiles p
     JOIN public.positions po ON po.id = p.position_id
      WHERE p.tenant_id = t.id
        AND po.code = 'owner'
        AND p.is_active = TRUE
   );

  IF v_orphan_tenants > 0 THEN
    RAISE EXCEPTION
      'H3b pre-flight: % tenant(s) have no active position=owner holder. Backfill cannot proceed. Inspect: SELECT t.id, t.slug FROM tenants t WHERE NOT EXISTS (SELECT 1 FROM profiles p JOIN positions po ON po.id=p.position_id WHERE p.tenant_id=t.id AND po.code=''owner'' AND p.is_active=TRUE);',
      v_orphan_tenants
      USING ERRCODE = 'P0001';
  END IF;

  -- Surface multi-owner ambiguity loudly (backfill will pick oldest).
  SELECT COUNT(*) INTO v_multi_owner_tenants
    FROM (
      SELECT p.tenant_id
      FROM public.profiles p
      JOIN public.positions po ON po.id = p.position_id
      WHERE po.code = 'owner' AND p.is_active = TRUE
      GROUP BY p.tenant_id
      HAVING COUNT(*) > 1
    ) sub;

  IF v_multi_owner_tenants > 0 THEN
    RAISE WARNING
      'H3b backfill: % tenant(s) have MULTIPLE active position=owner holders. Backfill picks oldest by profiles.created_at. Verify selection post-apply: SELECT t.id, t.owner_user_id FROM tenants t.',
      v_multi_owner_tenants;
  END IF;
END$$;

-- ─── 3. BACKFILL ──────────────────────────────────────────────
-- Pick deterministic owner per tenant: oldest active owner profile.
UPDATE public.tenants t
   SET owner_user_id = sub.user_id
  FROM (
    SELECT DISTINCT ON (p.tenant_id)
      p.tenant_id,
      p.id AS user_id
    FROM public.profiles p
    JOIN public.positions po ON po.id = p.position_id
    WHERE po.code = 'owner'
      AND p.is_active = TRUE
    ORDER BY p.tenant_id, p.created_at ASC
  ) AS sub
 WHERE t.id = sub.tenant_id
   AND t.owner_user_id IS NULL;

-- ─── 4. POST-BACKFILL VERIFICATION ────────────────────────────
DO $$
DECLARE
  v_null_count INT;
BEGIN
  SELECT COUNT(*) INTO v_null_count
    FROM public.tenants WHERE owner_user_id IS NULL;

  IF v_null_count > 0 THEN
    RAISE EXCEPTION
      'H3b post-backfill: % tenant(s) still have owner_user_id IS NULL. Backfill incomplete. Inspect: SELECT id, slug FROM tenants WHERE owner_user_id IS NULL;',
      v_null_count
      USING ERRCODE = 'P0001';
  END IF;
END$$;

-- ─── 5. SET NOT NULL + INDEX ──────────────────────────────────
ALTER TABLE public.tenants
  ALTER COLUMN owner_user_id SET NOT NULL;

-- B-tree on FK column. Not partial (column now NOT NULL). Not UNIQUE
-- (multi-tenant founder scenario — same user could own multiple tenants
-- in future; no business rule against it for now).
CREATE INDEX IF NOT EXISTS idx_tenants_owner_user_id
  ON public.tenants (owner_user_id);

COMMENT ON COLUMN public.tenants.owner_user_id IS
  'Canonical auth identity of tenant owner — UUID FK to auth.users, ON DELETE RESTRICT. NOT NULL since H3b (2026-05-07). Distinct from `representative` (TEXT legal name) and `positions.code=''owner''` (HR label). has_permission() owner-bypass currently uses positions.code=''owner''; this column is data foundation for future ownership transfer RPC + UI. See docs/plan/adr/0005-owner-identity-source-separation.md, regressions.md TENANT-OWNER-USER-ID-CANONICAL.';

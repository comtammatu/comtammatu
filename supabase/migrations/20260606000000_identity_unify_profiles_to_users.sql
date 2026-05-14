-- =============================================================================
-- Phase A / Step A3 — Identity Unification: profiles → public.users
-- =============================================================================
-- PURPOSE
--   Make public.users the single canonical identity table.
--   • Backfill public.users from public.profiles (prod apply; local no-op).
--   • Repoint all 29 *_by / profile FK columns from public.profiles(id)
--     to public.users(uuid).
--   • Drop public.profiles table and recreate it as a SELECT VIEW so the
--     ~91 RPCs that read FROM profiles keep working with zero rewrites.
--   • Add INSTEAD OF INSERT/UPDATE/DELETE triggers on the view so the 4
--     live SECURITY DEFINER functions that write to profiles keep working:
--       handle_new_user    — INSERT INTO profiles
--       toggle_profile_active — UPDATE profiles
--       update_my_profile  — UPDATE profiles
--       admin_update_profile  — UPDATE profiles
--
-- PRODUCTION APPLY IS MANUAL (per CLAUDE.md policy).
-- Owner must review the user_role derivation in the backfill block below
-- before applying on prod — profiles has no role column; 'waiter' is a
-- best-effort placeholder.
--
-- WHAT DROP TABLE ... CASCADE REMOVES
--   Indexes  : idx_profiles_tenant_branch, idx_profiles_area,
--              idx_profiles_position_id
--   Triggers : trg_profiles_updated_at, trg_profiles_branch_required,
--              trg_profiles_area_scope
--              (business-logic triggers are reimplemented on public.users below)
--   RLS policies on profiles (3 — listed here for reference; view does not
--     support RLS so these cannot be directly re-created; access control for
--     the view relies on the underlying table's RLS on public.users):
--       "Users can update own safe fields"  FOR UPDATE (id = auth.uid())
--       "profiles_select_self"              FOR SELECT (id = auth.uid())
--       "profiles_select_admin"             FOR SELECT (tenant+has_permission)
--   All 29 FK constraints on child tables (they are immediately recreated
--     pointing to public.users(uuid) below).
--
-- OWNER REVIEW NOTES
--   1. user_role in backfill is set to 'waiter' — derive from positions if
--      needed: JOIN positions ON positions.id = profiles.position_id and
--      map legacy_role_code.
--   2. password_hash is set to '' (empty) because profiles never stored
--      passwords. The local auth.users stub only exposes id/email/created_at;
--      the real encrypted_password lives in Supabase auth internals.
--      Go BE must use uuid-based lookup against auth.users for login.
-- =============================================================================

BEGIN;

-- ============================================================
-- 0. SAFETY: ensure uuid index exists (created in A2, defensive)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'users' AND schemaname = 'public'
      AND indexname = 'idx_users_uuid'
  ) THEN
    CREATE UNIQUE INDEX idx_users_uuid ON public.users(uuid);
  END IF;
END$$;

-- ============================================================
-- 1. BACKFILL public.users from public.profiles
--    (prod-apply-time; locally a no-op — profiles is empty)
--    OWNER: review user_role derivation before prod apply.
-- ============================================================
INSERT INTO public.users (
  uuid, tenant_id, branch_id, full_name, phone,
  avatar_url, area_id, position_id,
  is_active, email, password_hash,
  user_role, created_at, updated_at
)
SELECT
  p.id,
  p.tenant_id,
  p.branch_id,
  p.full_name,
  p.phone,
  p.avatar_url,
  p.area_id,
  p.position_id,
  COALESCE(p.is_active, TRUE),
  -- email: prefer auth.users; fallback to placeholder so NOT NULL is satisfied
  COALESCE(au.email, p.id::text || '@placeholder.local'),
  -- password_hash: profiles never stored passwords; empty string placeholder.
  -- On prod, auth.users has encrypted_password but that column is not exposed
  -- in the local stub schema. Go BE auth uses auth.users as authoritative source.
  '',
  -- user_role: profiles has no role column; 'waiter' is best-effort placeholder
  -- OWNER REVIEW: derive from positions.legacy_role_code if needed
  'waiter',
  COALESCE(p.created_at, now()),
  COALESCE(p.updated_at, now())
FROM public.profiles p
LEFT JOIN auth.users au ON au.id = p.id
ON CONFLICT (uuid) DO NOTHING;

-- ============================================================
-- 2. REPOINT 29 FKs: drop old (→ profiles) + recreate (→ users)
--    ON DELETE / ON UPDATE actions preserved from originals:
--      a = NO ACTION, n = SET NULL, c = CASCADE, r = RESTRICT
-- ============================================================

-- orders.created_by  (ON DELETE NO ACTION)
ALTER TABLE public.orders DROP CONSTRAINT orders_created_by_fkey;
ALTER TABLE public.orders ADD CONSTRAINT orders_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.users(uuid);

-- order_status_history.changed_by  (ON DELETE NO ACTION)
ALTER TABLE public.order_status_history DROP CONSTRAINT order_status_history_changed_by_fkey;
ALTER TABLE public.order_status_history ADD CONSTRAINT order_status_history_changed_by_fkey
  FOREIGN KEY (changed_by) REFERENCES public.users(uuid);

-- pos_sessions.opened_by  (ON DELETE NO ACTION)
ALTER TABLE public.pos_sessions DROP CONSTRAINT pos_sessions_opened_by_fkey;
ALTER TABLE public.pos_sessions ADD CONSTRAINT pos_sessions_opened_by_fkey
  FOREIGN KEY (opened_by) REFERENCES public.users(uuid);

-- pos_sessions.closed_by  (ON DELETE NO ACTION)
ALTER TABLE public.pos_sessions DROP CONSTRAINT pos_sessions_closed_by_fkey;
ALTER TABLE public.pos_sessions ADD CONSTRAINT pos_sessions_closed_by_fkey
  FOREIGN KEY (closed_by) REFERENCES public.users(uuid);

-- pos_sessions.variance_approver_user_id  (ON DELETE NO ACTION)
ALTER TABLE public.pos_sessions DROP CONSTRAINT pos_sessions_variance_approver_user_id_fkey;
ALTER TABLE public.pos_sessions ADD CONSTRAINT pos_sessions_variance_approver_user_id_fkey
  FOREIGN KEY (variance_approver_user_id) REFERENCES public.users(uuid);

-- payments.created_by  (ON DELETE NO ACTION)
ALTER TABLE public.payments DROP CONSTRAINT payments_created_by_fkey;
ALTER TABLE public.payments ADD CONSTRAINT payments_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.users(uuid);

-- stock_movements.created_by  (ON DELETE NO ACTION)
ALTER TABLE public.stock_movements DROP CONSTRAINT stock_movements_created_by_fkey;
ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.users(uuid);

-- employees.profile_id  (ON DELETE CASCADE)
ALTER TABLE public.employees DROP CONSTRAINT employees_profile_id_fkey;
ALTER TABLE public.employees ADD CONSTRAINT employees_profile_id_fkey
  FOREIGN KEY (profile_id) REFERENCES public.users(uuid) ON DELETE CASCADE;

-- tax_invoices.created_by  (ON DELETE NO ACTION)
ALTER TABLE public.tax_invoices DROP CONSTRAINT tax_invoices_created_by_fkey;
ALTER TABLE public.tax_invoices ADD CONSTRAINT tax_invoices_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.users(uuid);

-- kds_tickets.bumped_by  (ON DELETE NO ACTION)
ALTER TABLE public.kds_tickets DROP CONSTRAINT kds_tickets_bumped_by_fkey;
ALTER TABLE public.kds_tickets ADD CONSTRAINT kds_tickets_bumped_by_fkey
  FOREIGN KEY (bumped_by) REFERENCES public.users(uuid);

-- purchase_orders.created_by  (ON DELETE NO ACTION)
ALTER TABLE public.purchase_orders DROP CONSTRAINT purchase_orders_created_by_fkey;
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.users(uuid);

-- goods_received_notes.created_by  (ON DELETE NO ACTION)
ALTER TABLE public.goods_received_notes DROP CONSTRAINT goods_received_notes_created_by_fkey;
ALTER TABLE public.goods_received_notes ADD CONSTRAINT goods_received_notes_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.users(uuid);

-- goods_received_notes.received_by  (ON DELETE NO ACTION)
ALTER TABLE public.goods_received_notes DROP CONSTRAINT goods_received_notes_received_by_fkey;
ALTER TABLE public.goods_received_notes ADD CONSTRAINT goods_received_notes_received_by_fkey
  FOREIGN KEY (received_by) REFERENCES public.users(uuid);

-- stock_transfers.created_by  (ON DELETE NO ACTION)
ALTER TABLE public.stock_transfers DROP CONSTRAINT stock_transfers_created_by_fkey;
ALTER TABLE public.stock_transfers ADD CONSTRAINT stock_transfers_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.users(uuid);

-- supplier_invoices.created_by  (ON DELETE NO ACTION)
ALTER TABLE public.supplier_invoices DROP CONSTRAINT supplier_invoices_created_by_fkey;
ALTER TABLE public.supplier_invoices ADD CONSTRAINT supplier_invoices_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.users(uuid);

-- production_orders.created_by  (ON DELETE SET NULL)
ALTER TABLE public.production_orders DROP CONSTRAINT production_orders_created_by_fkey;
ALTER TABLE public.production_orders ADD CONSTRAINT production_orders_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.users(uuid) ON DELETE SET NULL;

-- print_jobs.created_by  (ON DELETE SET NULL)
ALTER TABLE public.print_jobs DROP CONSTRAINT print_jobs_created_by_fkey;
ALTER TABLE public.print_jobs ADD CONSTRAINT print_jobs_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.users(uuid) ON DELETE SET NULL;

-- print_jobs.last_retried_by  (ON DELETE SET NULL)
ALTER TABLE public.print_jobs DROP CONSTRAINT print_jobs_last_retried_by_fkey;
ALTER TABLE public.print_jobs ADD CONSTRAINT print_jobs_last_retried_by_fkey
  FOREIGN KEY (last_retried_by) REFERENCES public.users(uuid) ON DELETE SET NULL;

-- inventory_qc_settings.updated_by  (ON DELETE NO ACTION)
ALTER TABLE public.inventory_qc_settings DROP CONSTRAINT inventory_qc_settings_updated_by_fkey;
ALTER TABLE public.inventory_qc_settings ADD CONSTRAINT inventory_qc_settings_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES public.users(uuid);

-- supplier_returns.created_by  (ON DELETE NO ACTION)
ALTER TABLE public.supplier_returns DROP CONSTRAINT supplier_returns_created_by_fkey;
ALTER TABLE public.supplier_returns ADD CONSTRAINT supplier_returns_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.users(uuid);

-- supplier_returns.confirmed_by  (ON DELETE NO ACTION)
ALTER TABLE public.supplier_returns DROP CONSTRAINT supplier_returns_confirmed_by_fkey;
ALTER TABLE public.supplier_returns ADD CONSTRAINT supplier_returns_confirmed_by_fkey
  FOREIGN KEY (confirmed_by) REFERENCES public.users(uuid);

-- supplier_credit_notes.created_by  (ON DELETE NO ACTION)
ALTER TABLE public.supplier_credit_notes DROP CONSTRAINT supplier_credit_notes_created_by_fkey;
ALTER TABLE public.supplier_credit_notes ADD CONSTRAINT supplier_credit_notes_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.users(uuid);

-- tax_invoice_events.actor_id  (ON DELETE SET NULL)
ALTER TABLE public.tax_invoice_events DROP CONSTRAINT tax_invoice_events_actor_id_fkey;
ALTER TABLE public.tax_invoice_events ADD CONSTRAINT tax_invoice_events_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES public.users(uuid) ON DELETE SET NULL;

-- branch_trusted_egress_ips.registered_by_user  (ON DELETE SET NULL)
ALTER TABLE public.branch_trusted_egress_ips DROP CONSTRAINT branch_trusted_egress_ips_registered_by_user_fkey;
ALTER TABLE public.branch_trusted_egress_ips ADD CONSTRAINT branch_trusted_egress_ips_registered_by_user_fkey
  FOREIGN KEY (registered_by_user) REFERENCES public.users(uuid) ON DELETE SET NULL;

-- branch_trusted_egress_ips.revoked_by_user  (ON DELETE SET NULL)
ALTER TABLE public.branch_trusted_egress_ips DROP CONSTRAINT branch_trusted_egress_ips_revoked_by_user_fkey;
ALTER TABLE public.branch_trusted_egress_ips ADD CONSTRAINT branch_trusted_egress_ips_revoked_by_user_fkey
  FOREIGN KEY (revoked_by_user) REFERENCES public.users(uuid) ON DELETE SET NULL;

-- summary_run_queue.triggered_by  (ON DELETE SET NULL)
ALTER TABLE public.summary_run_queue DROP CONSTRAINT summary_run_queue_triggered_by_fkey;
ALTER TABLE public.summary_run_queue ADD CONSTRAINT summary_run_queue_triggered_by_fkey
  FOREIGN KEY (triggered_by) REFERENCES public.users(uuid) ON DELETE SET NULL;

-- kitchen_send_batches.created_by  (ON DELETE NO ACTION)
ALTER TABLE public.kitchen_send_batches DROP CONSTRAINT kitchen_send_batches_created_by_fkey;
ALTER TABLE public.kitchen_send_batches ADD CONSTRAINT kitchen_send_batches_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.users(uuid);

-- print_template_versions.created_by  (ON DELETE SET NULL)
ALTER TABLE public.print_template_versions DROP CONSTRAINT print_template_versions_created_by_fkey;
ALTER TABLE public.print_template_versions ADD CONSTRAINT print_template_versions_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.users(uuid) ON DELETE SET NULL;

-- print_template_versions.updated_by  (ON DELETE SET NULL)
ALTER TABLE public.print_template_versions DROP CONSTRAINT print_template_versions_updated_by_fkey;
ALTER TABLE public.print_template_versions ADD CONSTRAINT print_template_versions_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES public.users(uuid) ON DELETE SET NULL;

-- ============================================================
-- 3. Add business-logic trigger functions on public.users
--    (replaces trg_profiles_branch_required + trg_profiles_area_scope
--     which are lost when the table is dropped)
-- ============================================================

-- Branch-required invariant: operational roles must have branch_id set
CREATE OR REPLACE FUNCTION public._users_check_branch_required()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_code TEXT;
BEGIN
  IF NEW.position_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT legacy_role_code INTO v_code
  FROM public.positions WHERE id = NEW.position_id;
  IF v_code IN ('cashier','waiter','chef','branch_manager','warehouse_manager','production_manager')
     AND NEW.branch_id IS NULL THEN
    RAISE EXCEPTION 'branch_required_for_operational_role: position=%', v_code
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_users_branch_required
  BEFORE INSERT OR UPDATE OF position_id, branch_id ON public.users
  FOR EACH ROW EXECUTE FUNCTION public._users_check_branch_required();

-- Area-scope invariant: area_id only valid for area/warehouse/production managers
CREATE OR REPLACE FUNCTION public._users_check_area_scope()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_code TEXT;
BEGIN
  IF NEW.area_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.position_id IS NULL THEN
    RAISE EXCEPTION 'area_id set but position_id is NULL'
      USING ERRCODE = '23514';
  END IF;
  SELECT legacy_role_code INTO v_code
  FROM public.positions WHERE id = NEW.position_id;
  IF v_code IS NULL OR v_code NOT IN ('area_manager','warehouse_manager','production_manager') THEN
    RAISE EXCEPTION 'area_id only allowed for area_manager / warehouse_manager / production_manager (got %)',
      COALESCE(v_code, '<null>')
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_users_area_scope
  BEFORE INSERT OR UPDATE OF position_id, area_id ON public.users
  FOR EACH ROW EXECUTE FUNCTION public._users_check_area_scope();

-- ============================================================
-- 4. DROP profiles table (CASCADE removes indexes, triggers,
--    RLS policies, own constraints — all listed in header)
-- ============================================================
DROP TABLE public.profiles CASCADE;

-- ============================================================
-- 5. Recreate public.profiles as a VIEW over public.users
--    Column mapping: users.uuid → profiles.id
-- ============================================================
CREATE VIEW public.profiles AS
  SELECT
    uuid          AS id,
    tenant_id,
    branch_id,
    full_name,
    phone,
    avatar_url,
    is_active,
    created_at,
    updated_at,
    area_id,
    position_id
  FROM public.users;

GRANT SELECT ON public.profiles TO authenticated;

-- ============================================================
-- 6. INSTEAD OF triggers so the 4 SECURITY DEFINER functions
--    that write to profiles keep working transparently.
--
--    INSERT: handle_new_user inserts (id, tenant_id, branch_id,
--      position_id, full_name). The view's INSERT INSTEAD OF
--      redirects to public.users — email/password_hash get
--      placeholder values since handle_new_user doesn't supply
--      them (auth.users is the real credential store).
--
--    UPDATE: toggle_profile_active, update_my_profile,
--      admin_update_profile all UPDATE WHERE id = <uuid>.
--      Redirect to UPDATE public.users WHERE uuid = NEW.id.
--
--    DELETE: not written by any live function but provided for
--      completeness so no write on the view silently fails.
-- ============================================================

CREATE OR REPLACE FUNCTION public._profiles_view_insert()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  INSERT INTO public.users (
    uuid, tenant_id, branch_id, position_id, full_name,
    phone, avatar_url, area_id, is_active,
    email, password_hash, user_role,
    created_at, updated_at
  ) VALUES (
    NEW.id,
    NEW.tenant_id,
    NEW.branch_id,
    NEW.position_id,
    COALESCE(NEW.full_name, ''),
    NEW.phone,
    NEW.avatar_url,
    NEW.area_id,
    COALESCE(NEW.is_active, TRUE),
    -- email: no email column on profiles view; use placeholder
    -- real email lives in auth.users; Go BE resolves via uuid
    NEW.id::text || '@placeholder.local',
    '',         -- password_hash placeholder; auth.users is authoritative
    'waiter',   -- user_role placeholder; set via JWT claim from auth.users
    COALESCE(NEW.created_at, now()),
    COALESCE(NEW.updated_at, now())
  )
  ON CONFLICT (uuid) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public._profiles_view_update()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  UPDATE public.users SET
    tenant_id   = NEW.tenant_id,
    branch_id   = NEW.branch_id,
    full_name   = NEW.full_name,
    phone       = NEW.phone,
    avatar_url  = NEW.avatar_url,
    is_active   = NEW.is_active,
    area_id     = NEW.area_id,
    position_id = NEW.position_id,
    updated_at  = now()
  WHERE uuid = OLD.id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public._profiles_view_delete()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  DELETE FROM public.users WHERE uuid = OLD.id;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_profiles_view_insert
  INSTEAD OF INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public._profiles_view_insert();

CREATE TRIGGER trg_profiles_view_update
  INSTEAD OF UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public._profiles_view_update();

CREATE TRIGGER trg_profiles_view_delete
  INSTEAD OF DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public._profiles_view_delete();

COMMIT;

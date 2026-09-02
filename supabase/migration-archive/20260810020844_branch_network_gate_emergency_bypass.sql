-- Per-branch emergency POS/KDS network-gate bypass (owner ops; not ENV kill-switch).

CREATE TABLE public.branch_network_gate_bypasses (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  branch_id bigint NOT NULL REFERENCES public.branches (id) ON DELETE CASCADE,
  duration_kind text NOT NULL,
  expires_at timestamptz NOT NULL,
  bound_pos_session_id bigint REFERENCES public.pos_sessions (id) ON DELETE SET NULL,
  activated_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  activated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  note text,
  CONSTRAINT branch_network_gate_bypasses_duration_kind_check
    CHECK (duration_kind = ANY (ARRAY['1h'::text, '2h'::text, '4h'::text, 'pos_shift'::text, 'business_day'::text])),
  CONSTRAINT branch_network_gate_bypasses_note_len_check
    CHECK (note IS NULL OR char_length(note) <= 200),
  CONSTRAINT branch_network_gate_bypasses_pos_shift_binding_check
    CHECK (
      (duration_kind = 'pos_shift' AND bound_pos_session_id IS NOT NULL)
      OR (duration_kind <> 'pos_shift' AND bound_pos_session_id IS NULL)
    ),
  CONSTRAINT branch_network_gate_bypasses_revoke_pair_check
    CHECK (
      (revoked_at IS NULL AND revoked_by IS NULL)
      OR (revoked_at IS NOT NULL)
    )
);

COMMENT ON TABLE public.branch_network_gate_bypasses IS
  'Owner-activated per-branch temporary suspension of POS/KDS egress IP gate. Ops break-glass; POS_NETWORK_GATE=off remains engineering-only.';

CREATE UNIQUE INDEX branch_network_gate_bypasses_one_open_per_branch_idx
  ON public.branch_network_gate_bypasses (branch_id)
  WHERE (revoked_at IS NULL);

CREATE INDEX branch_network_gate_bypasses_branch_active_idx
  ON public.branch_network_gate_bypasses (branch_id, expires_at DESC)
  WHERE (revoked_at IS NULL);

CREATE INDEX branch_network_gate_bypasses_tenant_idx
  ON public.branch_network_gate_bypasses (tenant_id);

CREATE INDEX branch_network_gate_bypasses_bound_session_idx
  ON public.branch_network_gate_bypasses (bound_pos_session_id)
  WHERE (bound_pos_session_id IS NOT NULL AND revoked_at IS NULL);

ALTER TABLE public.branch_network_gate_bypasses ENABLE ROW LEVEL SECURITY;

CREATE POLICY bngb_select ON public.branch_network_gate_bypasses
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      branch_id = public.auth_branch_id()
      OR public.auth_role() = 'owner'
    )
  );

CREATE POLICY bngb_insert ON public.branch_network_gate_bypasses
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1
      FROM public.branches b
      WHERE b.id = branch_network_gate_bypasses.branch_id
        AND b.tenant_id = public.auth_tenant_id()
    )
    AND public.has_permission(branch_id, 'settings:branch_network'::text)
  );

CREATE POLICY bngb_update ON public.branch_network_gate_bypasses
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1
      FROM public.branches b
      WHERE b.id = branch_network_gate_bypasses.branch_id
        AND b.tenant_id = public.auth_tenant_id()
    )
    AND public.has_permission(branch_id, 'settings:branch_network'::text)
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1
      FROM public.branches b
      WHERE b.id = branch_network_gate_bypasses.branch_id
        AND b.tenant_id = public.auth_tenant_id()
    )
    AND public.has_permission(branch_id, 'settings:branch_network'::text)
  );

COMMENT ON POLICY bngb_select ON public.branch_network_gate_bypasses IS
  'Branch-scoped staff may read bypass for their JWT branch; owner may read all tenant branches.';
COMMENT ON POLICY bngb_insert ON public.branch_network_gate_bypasses IS
  'settings:branch_network controls emergency bypass activation.';
COMMENT ON POLICY bngb_update ON public.branch_network_gate_bypasses IS
  'settings:branch_network controls early revoke / replace.';

REVOKE ALL ON TABLE public.branch_network_gate_bypasses FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.branch_network_gate_bypasses TO authenticated;
GRANT ALL ON TABLE public.branch_network_gate_bypasses TO service_role;

-- Auto-revoke pos_shift bypass when the bound POS session closes.
CREATE OR REPLACE FUNCTION public.trg_revoke_network_gate_bypass_on_pos_session_close()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.status <> 'open'
     AND OLD.status = 'open'
  THEN
    UPDATE public.branch_network_gate_bypasses
    SET revoked_at = now(),
        revoked_by = NULL
    WHERE bound_pos_session_id = NEW.id
      AND revoked_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_revoke_network_gate_bypass_on_pos_session_close() IS
  'System revoke of pos_shift network-gate bypass when bound pos_sessions leaves open. revoked_by NULL = automatic.';

REVOKE ALL ON FUNCTION public.trg_revoke_network_gate_bypass_on_pos_session_close() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_revoke_network_gate_bypass_on_pos_session_close() TO service_role;

CREATE TRIGGER revoke_network_gate_bypass_on_pos_session_close
  AFTER UPDATE OF status ON public.pos_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_revoke_network_gate_bypass_on_pos_session_close();

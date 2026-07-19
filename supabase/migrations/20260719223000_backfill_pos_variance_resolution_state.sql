-- Preserve legacy manager resolutions in the structured POS variance state.
-- Original close-time cash counts and differences remain immutable.

UPDATE public.pos_sessions
SET
  variance_resolution_type = 'accepted_adjustment',
  variance_settlement_amount = 0,
  variance_resolved_at = COALESCE(updated_at, closed_at, now())
WHERE status = 'closed'
  AND variance_approval_note IS NOT NULL
  AND variance_approver_user_id IS NOT NULL
  AND variance_resolution_type IS NULL;

ALTER TABLE public.pos_sessions
  DROP CONSTRAINT IF EXISTS pos_sessions_variance_resolution_shape_check;

ALTER TABLE public.pos_sessions
  ADD CONSTRAINT pos_sessions_variance_resolution_shape_check
  CHECK (
    (
      variance_resolution_type IS NULL
      AND variance_settlement_amount IS NULL
      AND variance_resolved_at IS NULL
    )
    OR (
      variance_resolution_type IS NOT NULL
      AND variance_settlement_amount IS NOT NULL
      AND variance_settlement_amount >= 0
      AND variance_resolved_at IS NOT NULL
      AND variance_approval_note IS NOT NULL
      AND variance_approver_user_id IS NOT NULL
    )
  );

COMMENT ON CONSTRAINT pos_sessions_variance_resolution_shape_check
  ON public.pos_sessions IS
  'Structured variance resolution fields are written and cleared as one state; close-time cash counts and differences stay unchanged.';

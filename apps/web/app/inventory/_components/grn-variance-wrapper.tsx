import { evaluateAutoApprove } from "../variance-actions";
import { AutoApproveEvalPanel } from "./auto-approve-eval-panel";

interface GrnVarianceWrapperProps {
  grnId: number;
  /** Render only when feature flag enabled. Server component caller decides. */
  enabled?: boolean;
}

/**
 * Drop-in server component — evaluates auto-approve on the given GRN
 * and renders an 8-condition breakdown panel. Safe to place anywhere
 * in a GRN detail page without modifying existing client logic.
 *
 * Feature-flag gated via `enabled` prop (caller reads from
 * `is_feature_enabled(branch_id, 'inv_s10_grn_variance')`).
 */
export async function GrnVarianceWrapper({
  grnId,
  enabled = true,
}: GrnVarianceWrapperProps) {
  if (!enabled) return null;

  const result = await evaluateAutoApprove(grnId);
  if (!result.success || !result.data) {
    // Fail-quiet: evaluator is an advisory surface, not a gate.
    return null;
  }

  return <AutoApproveEvalPanel evaluation={result.data} />;
}

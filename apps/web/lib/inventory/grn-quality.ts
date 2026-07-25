export type GrnQualityStatus = "accepted" | "partial" | "rejected";

export const GRN_BASELINE_REVIEW_PCT = 15;

export function isGrnBaselineReviewRequired(
  baselineVariancePct: number | null,
): boolean {
  return (
    baselineVariancePct != null &&
    Math.abs(baselineVariancePct) > GRN_BASELINE_REVIEW_PCT
  );
}

export function deriveGrnQualityStatus(
  received: number,
  rejected: number,
): GrnQualityStatus {
  if (rejected <= 0) return "accepted";
  return rejected >= received ? "rejected" : "partial";
}

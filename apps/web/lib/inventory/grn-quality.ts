export type GrnQualityStatus = "accepted" | "partial" | "rejected";

export function deriveGrnQualityStatus(
  received: number,
  rejected: number,
): GrnQualityStatus {
  if (rejected <= 0) return "accepted";
  return rejected >= received ? "rejected" : "partial";
}

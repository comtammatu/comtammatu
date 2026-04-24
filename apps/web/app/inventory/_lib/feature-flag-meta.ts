import { INVENTORY_FEATURE_FLAGS } from "./feature-flags";

/**
 * Human-readable metadata for every inventory feature flag — VN label,
 * sprint tag, short description. Used by the admin grid and the hub page.
 *
 * Lives outside the `"use server"` boundary in feature-flag-actions.ts so
 * it can be imported from client components (Next.js rule:
 * `"use server"` files only export async functions).
 */
export const INVENTORY_FEATURE_FLAG_META = [
  {
    key: INVENTORY_FEATURE_FLAGS.S10_GRN_VARIANCE,
    label: "GRN variance tier + hardblock",
    sprint: "S10",
    description:
      "Kiểm soát chênh giá GRN theo tier 0/1/2 + hardblock khi vượt ngưỡng.",
  },
  {
    key: INVENTORY_FEATURE_FLAGS.S11_WASTE_TIER,
    label: "Waste tier (hao hụt phân tầng)",
    sprint: "S11",
    description: "Phiếu hao hụt tier 0/1/2, chụp ảnh, duyệt QLV.",
  },
  {
    key: INVENTORY_FEATURE_FLAGS.S11_EXT_AUTO_WASTE,
    label: "Auto-waste từ POS/KDS",
    sprint: "S11-ext",
    description:
      "POS void + KDS cancel tự sinh phiếu waste (non-fatal khi fail).",
  },
  {
    key: INVENTORY_FEATURE_FLAGS.S12_DASHBOARD_V2,
    label: "Dashboard kho v2",
    sprint: "S12",
    description:
      "Dashboard mới với summary cards, alerts, location breakdown + period admin.",
  },
  {
    key: INVENTORY_FEATURE_FLAGS.S13A_STOCKTAKE_V2,
    label: "Kiểm kê v2 (blind + auto-save)",
    sprint: "S13a",
    description:
      "Stocktake blind mode, 30s auto-save draft, zone lock multi-counter.",
  },
  {
    key: INVENTORY_FEATURE_FLAGS.S13B_STOCKTAKE_RECOUNT,
    label: "Recount + escalation + conflict queue",
    sprint: "S13b",
    description:
      "Recount R2/R3, Round-4 QLV+Admin escalation, offline conflict resolver.",
  },
  {
    key: INVENTORY_FEATURE_FLAGS.S14_AUTO_APPROVE,
    label: "GRN auto-approve",
    sprint: "S14 (deferred)",
    description: "Cổng c1-c8 auto-approve GRN khi điều kiện đủ. Chưa ship.",
  },
] as const;

export type FeatureFlagMeta = (typeof INVENTORY_FEATURE_FLAG_META)[number];

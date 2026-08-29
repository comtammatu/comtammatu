import { SYSTEM_SETTING_KEYS } from "./index";

export interface WasteTierSettings {
  /** Cho phép bật/tắt toàn bộ cơ chế phân cấp rủi ro & duyệt hao hụt */
  tierEnabled: boolean;
  /** Ngưỡng giá trị kích hoạt Tier 1 (Cần ảnh chụp bằng chứng) - VND */
  tier1Threshold: number;
  /** Ngưỡng giá trị kích hoạt Tier 2 (Cần Quản lý duyệt) - VND */
  tier2Threshold: number;
  /** Trần hao hụt tối đa trong một ca - VND */
  shiftCap: number;
  /** Tỷ lệ hao hụt / Tồn kho kích hoạt Tier 1 (0..1, vd 0.8 = 80%; đặt 0 để tắt) */
  qtyRatioThreshold: number;
  /** Bắt buộc chụp ảnh theo danh sách lý do rủi ro vận hành (dropped, quality_fail...) */
  enforceReasonRules: boolean;
}

export const DEFAULT_WASTE_TIER_SETTINGS: WasteTierSettings = {
  tierEnabled: true,
  tier1Threshold: 500_000,
  tier2Threshold: 2_000_000,
  shiftCap: 5_000_000,
  qtyRatioThreshold: 0.8,
  enforceReasonRules: false,
};

export function parseWasteTierSettingsFromRows(
  rows: { key: string; value: string }[],
): WasteTierSettings {
  const map = new Map<string, string>();
  for (const r of rows) {
    map.set(r.key, r.value);
  }

  const tierEnabledStr = map.get(
    SYSTEM_SETTING_KEYS.INVENTORY_WASTE_TIER_ENABLED,
  );
  const tier1Str = map.get(
    SYSTEM_SETTING_KEYS.INVENTORY_WASTE_TIER1_THRESHOLD,
  );
  const tier2Str = map.get(
    SYSTEM_SETTING_KEYS.INVENTORY_WASTE_TIER2_THRESHOLD,
  );
  const shiftCapStr = map.get(
    SYSTEM_SETTING_KEYS.INVENTORY_WASTE_SHIFT_CAP,
  );
  const ratioStr = map.get(
    SYSTEM_SETTING_KEYS.INVENTORY_WASTE_QTY_RATIO_THRESHOLD,
  );
  const enforceReasonStr = map.get(
    SYSTEM_SETTING_KEYS.INVENTORY_WASTE_ENFORCE_REASON_RULES,
  );

  return {
    tierEnabled:
      tierEnabledStr !== undefined
        ? tierEnabledStr === "true"
        : DEFAULT_WASTE_TIER_SETTINGS.tierEnabled,
    tier1Threshold:
      tier1Str !== undefined && /^\d+$/.test(tier1Str)
        ? Number(tier1Str)
        : DEFAULT_WASTE_TIER_SETTINGS.tier1Threshold,
    tier2Threshold:
      tier2Str !== undefined && /^\d+$/.test(tier2Str)
        ? Number(tier2Str)
        : DEFAULT_WASTE_TIER_SETTINGS.tier2Threshold,
    shiftCap:
      shiftCapStr !== undefined && /^\d+$/.test(shiftCapStr)
        ? Number(shiftCapStr)
        : DEFAULT_WASTE_TIER_SETTINGS.shiftCap,
    qtyRatioThreshold:
      ratioStr !== undefined && !Number.isNaN(Number(ratioStr))
        ? Number(ratioStr)
        : DEFAULT_WASTE_TIER_SETTINGS.qtyRatioThreshold,
    enforceReasonRules:
      enforceReasonStr !== undefined
        ? enforceReasonStr === "true"
        : DEFAULT_WASTE_TIER_SETTINGS.enforceReasonRules,
  };
}

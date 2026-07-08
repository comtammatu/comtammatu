/**
 * Versioned Vietnam HKD sales-tax constants (GTGT % trên doanh thu + TNCN).
 *
 * Each entry has an `effectiveFrom` date (inclusive). When resolving the tax
 * profile for a transaction/period, pick the version whose `effectiveFrom` is
 * the latest date ≤ the target date — same convention as payroll
 * `legal-versions.ts`.
 *
 * Sources (đến 07/2026, mô hình Hộ Kinh Doanh, phương pháp trực tiếp):
 *   - NĐ 68/2026/NĐ-CP (05/03/2026): chia HKD 4 nhóm doanh thu/năm.
 *   - NĐ 141/2026/NĐ-CP (29/04/2026): nâng ngưỡng không chịu GTGT/TNCN lên
 *     1 tỷ/năm, hồi tố 01/01/2026.
 *   - Biểu tỷ lệ % GTGT/TNCN ngành ăn uống: GTGT 3%, TNCN 1,5% (nhóm 2);
 *     TNCN nhóm 3/4 = (doanh thu − chi phí) × 17%.
 *   - NQ 204/2025/QH15 + NĐ 174/2025/NĐ-CP: giảm 20% tỷ lệ GTGT trực tiếp
 *     (3% → 2,4% cho ăn uống) trong cửa sổ 01/07/2025–31/12/2026.
 *
 * Cửa sổ giảm tạm thời tự hết hạn theo ngày trong CHÍNH version này — khi
 * resolve cho ngày > 31/12/2026 mức gốc 3% quay lại tự động, KHÔNG cần thêm
 * version 2027 cho việc revert 2,4% → 3%. Chỉ thêm version mới khi tỷ lệ gốc,
 * ngưỡng phân nhóm, hoặc phương pháp TNCN thay đổi theo văn bản mới.
 *
 * Adding a new version:
 *   1. Append entry to SALES_TAX_VERSIONS in chronological order.
 *   2. Add a regression test that a previous period resolves unchanged.
 */

export type SalesTaxGroup = "exempt" | "group2" | "group3" | "group4";

export type TncnMode = "exempt" | "revenue_percent" | "net_income";

export type SalesTaxCategory =
  | "food_service"
  | "alcoholic_beverage"
  | "exempt_goods";

export interface SalesTaxTier {
  /** Lower bound of annual revenue (VND, inclusive) */
  readonly minAnnualRevenue: number;
  /** Upper bound of annual revenue (VND, exclusive) */
  readonly maxAnnualRevenue: number;
  /** HKD revenue-group classification (NĐ 68/2026) */
  readonly group: SalesTaxGroup;
  /** Whether GTGT is not chargeable for this tier (NĐ 141/2026 ≤1 tỷ) */
  readonly vatExempt: boolean;
  /** How TNCN is computed for this tier */
  readonly tncnMode: TncnMode;
  /** TNCN rate (decimal): 0.015 = 1.5% revenue, 0.17 = 17% net income */
  readonly tncnRate: number;
  /**
   * Base GTGT rate per category, as NUMERIC(5,2)-style percentage points
   * (e.g. 3.0 = 3%), BEFORE any temporary reduction window is applied.
   */
  readonly gtgtBaseRateByCategory: Readonly<
    Record<SalesTaxCategory, number>
  >;
}

export interface SalesTaxVersion {
  /** ISO date (YYYY-MM-DD); applies to dates ≥ this and < next version's. */
  readonly effectiveFrom: string;
  /** Human-readable source citation */
  readonly source: string;
  /**
   * Temporary GTGT reduction window (e.g. NQ 204/2025). `factor` is the
   * fractional reduction of the base rate (0.2 = giảm 20%). Applies only to
   * dates in [from, to] and only to non-exempt tiers with base > 0.
   */
  readonly tempReduction: {
    readonly from: string;
    readonly to: string;
    readonly factor: number;
  } | null;
  /** Revenue tiers in ascending order */
  readonly tiers: readonly SalesTaxTier[];
}

export const ONE_BILLION = 1_000_000_000;
export const THREE_BILLION = 3_000_000_000;
export const FIFTY_BILLION = 50_000_000_000;

/** GTGT base rates for the exempt tier — everything zero. */
export const EXEMPT_RATES: Readonly<Record<SalesTaxCategory, number>> = {
  food_service: 0,
  alcoholic_beverage: 0,
  exempt_goods: 0,
} as const;

/**
 * GTGT base rates (NUMERIC-style points) for chargeable HKD direct-method
 * tiers. Ăn uống trực tiếp = 3%. Rượu/bia dưới HKD trực tiếp đi theo tỷ lệ %
 * dịch vụ (3%) trừ khi đăng ký phương pháp khấu trừ. exempt_goods = 0.
 */
export const GROUP_RATES: Readonly<Record<SalesTaxCategory, number>> = {
  food_service: 3.0,
  alcoholic_beverage: 3.0,
  exempt_goods: 0,
} as const;

/**
 * Versions in chronological order. Lookup picks the LATEST version whose
 * effectiveFrom ≤ target date.
 */
export const SALES_TAX_VERSIONS: readonly SalesTaxVersion[] = [
  {
    effectiveFrom: "2026-01-01",
    source:
      "NĐ 68/2026 + NĐ 141/2026 (ngưỡng 1 tỷ, hồi tố 01/01/2026) + NQ 204/2025 + NĐ 174/2025 (giảm GTGT 20%, 01/07/2025–31/12/2026)",
    tempReduction: { from: "2025-07-01", to: "2026-12-31", factor: 0.2 },
    tiers: [
      {
        minAnnualRevenue: 0,
        maxAnnualRevenue: ONE_BILLION,
        group: "exempt",
        vatExempt: true,
        tncnMode: "exempt",
        tncnRate: 0,
        gtgtBaseRateByCategory: EXEMPT_RATES,
      },
      {
        minAnnualRevenue: ONE_BILLION,
        maxAnnualRevenue: THREE_BILLION,
        group: "group2",
        vatExempt: false,
        tncnMode: "revenue_percent",
        tncnRate: 0.015,
        gtgtBaseRateByCategory: GROUP_RATES,
      },
      {
        minAnnualRevenue: THREE_BILLION,
        maxAnnualRevenue: FIFTY_BILLION,
        group: "group3",
        vatExempt: false,
        tncnMode: "net_income",
        tncnRate: 0.17,
        gtgtBaseRateByCategory: GROUP_RATES,
      },
      {
        minAnnualRevenue: FIFTY_BILLION,
        maxAnnualRevenue: Number.POSITIVE_INFINITY,
        group: "group4",
        vatExempt: false,
        tncnMode: "net_income",
        tncnRate: 0.17,
        gtgtBaseRateByCategory: GROUP_RATES,
      },
    ],
  },
];

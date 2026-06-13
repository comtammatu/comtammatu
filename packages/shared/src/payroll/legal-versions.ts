import { getVNDateString, getVNMonthEndDateString } from "../time/vietnam";

/**
 * Versioned Vietnam payroll legal constants.
 *
 * Each entry has an `effectiveFrom` date (inclusive). When calculating a
 * payroll entry, resolve the version whose `effectiveFrom` is the latest
 * date ≤ the period's effective date.
 *
 * Sources:
 *   - TT 111/2013/TT-BTC: 7-bracket PIT, 11M personal / 4.4M dependent
 *   - NQ 954/2020/UBTVQH14 (2020-07-01): set 11M / 4.4M
 *   - NQ 110/2025/UBTVQH15 (2026-01-01): bump to 15.5M / 6.2M
 *   - Luật TNCN 109/2025/QH15 (2026-07-01): 5-bracket PIT (5/10/20/30/35% at 10/30/60/100M)
 *   - NĐ 65/2013 + amendments: BHXH/BHYT/BHTN rates (stable)
 *   - Statutory base salary 2.34M (NĐ 73/2024, effective 2024-07-01) → BHXH cap = 46.8M
 *
 * Adding a new version:
 *   1. Append entry to PAYROLL_LEGAL_VERSIONS in chronological order.
 *   2. Update `tasks/regressions.md` if numbers change mid-period.
 *   3. Add unit test that closing a previous period produces unchanged numbers.
 */

export interface PitBracket {
  /** Upper bound of taxable income in VND/month (inclusive) */
  readonly limit: number;
  /** Marginal tax rate (decimal, e.g. 0.15 = 15%) */
  readonly rate: number;
  /** Quick-formula deduction: tax = income × rate − deduction */
  readonly deduction: number;
}

export interface PayrollLegalVersion {
  /** ISO date (YYYY-MM-DD); the version applies to periods whose
   *  effective date is ≥ this and < the next version's effectiveFrom. */
  readonly effectiveFrom: string;
  /** Human-readable source citation */
  readonly source: string;

  /** Giảm trừ bản thân (VND/tháng) */
  readonly personalDeduction: number;
  /** Giảm trừ mỗi người phụ thuộc (VND/tháng) */
  readonly dependentDeduction: number;
  /** Mức trần BHXH (VND/tháng) — = 20× lương cơ sở */
  readonly insuranceCap: number;

  /** BH NLĐ đóng */
  readonly employeeBhxhRate: number;
  readonly employeeBhytRate: number;
  readonly employeeBhtnRate: number;

  /** BH NSDLĐ đóng */
  readonly employerBhxhRate: number;
  readonly employerBhytRate: number;
  readonly employerBhtnRate: number;

  /** Biểu thuế TNCN lũy tiến */
  readonly pitBrackets: readonly PitBracket[];
}

const STANDARD_BHXH_BHYT_BHTN_RATES = {
  employeeBhxhRate: 0.08,
  employeeBhytRate: 0.015,
  employeeBhtnRate: 0.01,
  employerBhxhRate: 0.175,
  employerBhytRate: 0.03,
  employerBhtnRate: 0.01,
} as const;

const PIT_BRACKETS_2007: readonly PitBracket[] = [
  { limit: 5_000_000, rate: 0.05, deduction: 0 },
  { limit: 10_000_000, rate: 0.1, deduction: 250_000 },
  { limit: 18_000_000, rate: 0.15, deduction: 750_000 },
  { limit: 32_000_000, rate: 0.2, deduction: 1_650_000 },
  { limit: 52_000_000, rate: 0.25, deduction: 3_250_000 },
  { limit: 80_000_000, rate: 0.3, deduction: 5_850_000 },
  { limit: Number.POSITIVE_INFINITY, rate: 0.35, deduction: 9_850_000 },
] as const;

// Luật Thuế TNCN 109/2025/QH15 — 5-bracket schedule effective 2026-07-01.
const PIT_BRACKETS_2026: readonly PitBracket[] = [
  { limit: 10_000_000, rate: 0.05, deduction: 0 },
  { limit: 30_000_000, rate: 0.1, deduction: 500_000 },
  { limit: 60_000_000, rate: 0.2, deduction: 3_500_000 },
  { limit: 100_000_000, rate: 0.3, deduction: 9_500_000 },
  { limit: Number.POSITIVE_INFINITY, rate: 0.35, deduction: 14_500_000 },
] as const;

/**
 * Versions in chronological order. Lookup picks the LATEST version whose
 * effectiveFrom ≤ target date.
 */
export const PAYROLL_LEGAL_VERSIONS: readonly PayrollLegalVersion[] = [
  {
    effectiveFrom: "2020-07-01",
    source:
      "NQ 954/2020/UBTVQH14 + TT 111/2013/TT-BTC (giảm trừ 11M / 4.4M, BHXH cap 29.8M)",
    personalDeduction: 11_000_000,
    dependentDeduction: 4_400_000,
    insuranceCap: 29_800_000, // 20 × statutory base salary 1.49M (pre 2024-07)
    ...STANDARD_BHXH_BHYT_BHTN_RATES,
    pitBrackets: PIT_BRACKETS_2007,
  },
  {
    effectiveFrom: "2024-07-01",
    source:
      "NĐ 73/2024 (lương cơ sở 2.34M → BHXH cap 46.8M); giảm trừ giữ 11M / 4.4M",
    personalDeduction: 11_000_000,
    dependentDeduction: 4_400_000,
    insuranceCap: 46_800_000,
    ...STANDARD_BHXH_BHYT_BHTN_RATES,
    pitBrackets: PIT_BRACKETS_2007,
  },
  {
    effectiveFrom: "2026-01-01",
    source:
      "NQ 110/2025/UBTVQH15 (giảm trừ 15.5M / 6.2M); BHXH cap giữ 46.8M cho đến NĐ mới",
    personalDeduction: 15_500_000,
    dependentDeduction: 6_200_000,
    insuranceCap: 46_800_000,
    ...STANDARD_BHXH_BHYT_BHTN_RATES,
    pitBrackets: PIT_BRACKETS_2007,
  },
  {
    effectiveFrom: "2026-07-01",
    source:
      "Luật Thuế TNCN 109/2025/QH15 (biểu 5 bậc, hiệu lực 01/07/2026); giảm trừ 15.5M / 6.2M giữ theo NQ 110/2025; BHXH cap giữ 46.8M",
    personalDeduction: 15_500_000,
    dependentDeduction: 6_200_000,
    insuranceCap: 46_800_000,
    ...STANDARD_BHXH_BHYT_BHTN_RATES,
    pitBrackets: PIT_BRACKETS_2026,
  },
];

/**
 * Resolve the legal version applicable to a given effective date.
 * @param effectiveDate ISO date string (YYYY-MM-DD) or Date object.
 *                      Defaults to current date.
 */
export function getLegalVersionFor(
  effectiveDate?: string | Date,
): PayrollLegalVersion {
  const targetIso = (() => {
    if (!effectiveDate) return getVNDateString();
    if (typeof effectiveDate === "string") return effectiveDate;
    return getVNDateString(effectiveDate);
  })();

  let chosen = PAYROLL_LEGAL_VERSIONS[0];
  for (const version of PAYROLL_LEGAL_VERSIONS) {
    if (version.effectiveFrom <= targetIso) {
      chosen = version;
    } else {
      break;
    }
  }
  if (!chosen) {
    throw new Error("getLegalVersionFor: no legal version registered");
  }
  return chosen;
}

/**
 * Resolve the legal version for a payroll period (year + month, 1-12).
 * Uses the LAST DAY of the period as the effective date — the rule that
 * applies to the period is the rule in effect on payroll cutoff.
 */
export function getLegalVersionForPeriod(
  periodYear: number,
  periodMonth: number,
): PayrollLegalVersion {
  return getLegalVersionFor(getVNMonthEndDateString(periodYear, periodMonth));
}

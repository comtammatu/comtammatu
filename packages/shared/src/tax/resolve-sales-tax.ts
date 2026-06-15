/**
 * Pure, versioned, tier-based resolver for HKD sales tax (GTGT % + TNCN).
 *
 * Constants are versioned via `sales-tax-versions.ts`. Pass `effectiveDate`
 * (Date or ISO string) to pick the correct rule set; defaults to current VN
 * date. The resolver applies the temporary GTGT reduction window (if the
 * target date is inside it) on top of the tier's base rate.
 *
 * Ref: docs/ref/einvoice-tax.md §1-2, docs/ref/legal-framework-2026.md
 */

import { getVNDateString } from "../time/vietnam";
import {
  SALES_TAX_VERSIONS,
  type SalesTaxCategory,
  type SalesTaxGroup,
  type SalesTaxVersion,
  type TncnMode,
} from "./sales-tax-versions";

export {
  SALES_TAX_VERSIONS,
  EXEMPT_RATES,
  GROUP_RATES,
  ONE_BILLION,
  THREE_BILLION,
  FIFTY_BILLION,
} from "./sales-tax-versions";
export type {
  SalesTaxVersion,
  SalesTaxTier,
  SalesTaxGroup,
  SalesTaxCategory,
  TncnMode,
} from "./sales-tax-versions";

/** Round to 2 decimals (NUMERIC(5,2) shape, e.g. 2.40, 3.00). */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Resolve the sales-tax version applicable to a given effective date.
 * @param effectiveDate ISO date string (YYYY-MM-DD) or Date object.
 *                      Defaults to current VN date.
 */
export function getSalesTaxVersionFor(
  effectiveDate?: string | Date,
): SalesTaxVersion {
  const targetIso = (() => {
    if (!effectiveDate) return getVNDateString();
    if (typeof effectiveDate === "string") return effectiveDate;
    return getVNDateString(effectiveDate);
  })();

  let chosen = SALES_TAX_VERSIONS[0];
  for (const version of SALES_TAX_VERSIONS) {
    if (version.effectiveFrom <= targetIso) {
      chosen = version;
    } else {
      break;
    }
  }
  if (!chosen) {
    throw new Error("getSalesTaxVersionFor: no sales-tax version registered");
  }
  return chosen;
}

export interface SalesTaxProfileInput {
  /** Annual revenue (VND) used for HKD group classification */
  annualRevenue: number;
  /**
   * Effective date for version + temp-window lookup. ISO string or Date.
   * Defaults to current VN date.
   */
  effectiveDate?: string | Date;
  /** Tax category; defaults to "food_service" */
  category?: SalesTaxCategory;
}

export interface SalesTaxProfile {
  /** HKD revenue-group classification */
  group: SalesTaxGroup;
  /** Whether GTGT is not chargeable */
  vatExempt: boolean;
  /** Effective GTGT rate as NUMERIC(5,2) points (e.g. 2.40, 3.00, 0) */
  gtgtRate: number;
  /** How TNCN is computed */
  tncnMode: TncnMode;
  /** TNCN rate (decimal) */
  tncnRate: number;
  /** Snapshot: which version's effectiveFrom was applied */
  versionEffectiveFrom: string;
  /** Whether the temporary GTGT reduction was applied to gtgtRate */
  tempReductionApplied: boolean;
}

/**
 * Resolve the full sales-tax profile for a transaction/period.
 *
 * Pick version by date → find the tier covering `annualRevenue`
 * (min inclusive, max exclusive) → take the category's base GTGT rate →
 * apply the temporary reduction window if the date is inside it AND the tier
 * is chargeable with a positive base → round to 2 decimals.
 */
export function resolveSalesTaxProfile(
  input: SalesTaxProfileInput,
): SalesTaxProfile {
  const version = getSalesTaxVersionFor(input.effectiveDate);

  const tier = version.tiers.find(
    (t) =>
      input.annualRevenue >= t.minAnnualRevenue &&
      input.annualRevenue < t.maxAnnualRevenue,
  );
  if (!tier) {
    throw new Error(
      `resolveSalesTaxProfile: no tier for annualRevenue=${input.annualRevenue}`,
    );
  }

  const category = input.category ?? "food_service";
  const base = tier.gtgtBaseRateByCategory[category];

  const dateIso = (() => {
    if (!input.effectiveDate) return getVNDateString();
    if (typeof input.effectiveDate === "string") return input.effectiveDate;
    return getVNDateString(input.effectiveDate);
  })();

  const reduction = version.tempReduction;
  const inWindow =
    reduction !== null &&
    reduction.from <= dateIso &&
    dateIso <= reduction.to &&
    !tier.vatExempt &&
    base > 0;

  const gtgtRate = inWindow ? round2(base * (1 - reduction.factor)) : base;

  return {
    group: tier.group,
    vatExempt: tier.vatExempt,
    gtgtRate,
    tncnMode: tier.tncnMode,
    tncnRate: tier.tncnRate,
    versionEffectiveFrom: version.effectiveFrom,
    tempReductionApplied: inWindow,
  };
}

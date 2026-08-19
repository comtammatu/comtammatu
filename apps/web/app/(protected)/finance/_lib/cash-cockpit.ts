import type { Json } from "@comtammatu/database";
import { loadAuthState } from "@/_lib/auth";

type FundsSupabaseClient = Awaited<ReturnType<typeof loadAuthState>>["supabase"];

export interface BranchCashBook {
  branchId: number;
  branchName: string;
  hasOpening: boolean;
  openingEntryId: number | null;
  openingBalance: number;
  openingEffectiveAt: string | null;
  cashCollections: number;
  cashRefunds: number;
  cashExpenses: number;
  cashSupplierPayments: number;
  cashAdjustments: number;
  cashInSince: number;
  cashOutSince: number;
  cashOnHand: number;
}

export interface CashSummary {
  hasOpening: boolean;
  hasCompanyOpening: boolean;
  branchesComplete: boolean;
  openingEntryId: number | null;
  openingBalance: number;
  bankOpeningBalance: number;
  openingEffectiveAt: string | null;
  cashCollections: number;
  cashRefunds: number;
  cashExpenses: number;
  cashSupplierPayments: number;
  cashAdjustments: number;
  cashInSince: number;
  cashOutSince: number;
  cashOnHand: number;
  bankInSince: number;
  bankOutSince: number;
  bankAdjustments: number;
  bankOnHand: number;
  legacySettingsPresent: boolean;
  branches: BranchCashBook[];
}

const EMPTY_FUNDS: Omit<CashSummary, "legacySettingsPresent" | "branches"> = {
  hasOpening: false,
  hasCompanyOpening: false,
  branchesComplete: false,
  openingEntryId: null,
  openingBalance: 0,
  bankOpeningBalance: 0,
  openingEffectiveAt: null,
  cashCollections: 0,
  cashRefunds: 0,
  cashExpenses: 0,
  cashSupplierPayments: 0,
  cashAdjustments: 0,
  cashInSince: 0,
  cashOutSince: 0,
  cashOnHand: 0,
  bankInSince: 0,
  bankOutSince: 0,
  bankAdjustments: 0,
  bankOnHand: 0,
};

function requireObject(value: Json): Record<string, Json | undefined> {
  if (value == null || Array.isArray(value) || typeof value !== "object") {
    throw new Error("Unable to load current funds");
  }
  return value;
}

function requireNumber(
  payload: Record<string, Json | undefined>,
  key: string,
): number {
  const parsed = Number(payload[key]);
  if (!Number.isFinite(parsed)) {
    console.error("[finance:funds] invalid numeric field", key);
    throw new Error("Unable to load current funds");
  }
  return parsed;
}

function parseBranchBooks(value: Json | undefined): BranchCashBook[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const payload = requireObject(entry);
    const cashCollections = requireNumber(payload, "cash_collections");
    const cashRefunds = requireNumber(payload, "cash_refunds");
    const cashExpenses = requireNumber(payload, "cash_expenses");
    const cashSupplierPayments = requireNumber(
      payload,
      "cash_supplier_payments",
    );
    const hasOpening = payload.has_opening === true;
    return {
      branchId: requireNumber(payload, "branch_id"),
      branchName:
        typeof payload.branch_name === "string" ? payload.branch_name : "",
      hasOpening,
      openingEntryId: hasOpening
        ? requireNumber(payload, "opening_entry_id")
        : null,
      openingBalance: requireNumber(payload, "opening_cash"),
      openingEffectiveAt:
        typeof payload.opening_effective_at === "string"
          ? payload.opening_effective_at
          : null,
      cashCollections,
      cashRefunds,
      cashExpenses,
      cashSupplierPayments,
      cashAdjustments: requireNumber(payload, "cash_adjustments"),
      cashInSince: cashCollections,
      cashOutSince: cashRefunds + cashExpenses + cashSupplierPayments,
      cashOnHand: requireNumber(payload, "cash_current"),
    };
  });
}

export async function fetchCashSummary(
  supabase?: FundsSupabaseClient,
): Promise<CashSummary> {
  const client = supabase ?? (await loadAuthState()).supabase;
  const { data, error } = await client.rpc("get_finance_current_funds");

  if (error) {
    console.error("[finance:funds] failed to load current funds", error.code);
    throw new Error("Unable to load current funds");
  }

  const payload = requireObject(data);
  const hasCompanyOpening = payload.has_company_opening === true;
  const hasOpening = payload.has_opening === true || hasCompanyOpening;
  const branchesComplete = payload.branches_complete === true;
  const legacySettingsPresent = payload.legacy_settings_present === true;
  const branches = parseBranchBooks(payload.branches);

  if (!hasOpening) {
    return {
      ...EMPTY_FUNDS,
      branchesComplete,
      legacySettingsPresent,
      branches,
    };
  }

  const cashCollections = requireNumber(payload, "cash_collections");
  const cashRefunds = requireNumber(payload, "cash_refunds");
  const cashExpenses = requireNumber(payload, "cash_expenses");
  const cashSupplierPayments = requireNumber(payload, "cash_supplier_payments");

  return {
    hasOpening: true,
    hasCompanyOpening,
    branchesComplete,
    openingEntryId: requireNumber(payload, "opening_entry_id"),
    openingBalance: requireNumber(payload, "opening_cash"),
    bankOpeningBalance: requireNumber(payload, "opening_bank"),
    openingEffectiveAt:
      typeof payload.opening_effective_at === "string"
        ? payload.opening_effective_at
        : null,
    cashCollections,
    cashRefunds,
    cashExpenses,
    cashSupplierPayments,
    cashAdjustments: requireNumber(payload, "cash_adjustments"),
    cashInSince: cashCollections,
    cashOutSince: cashRefunds + cashExpenses + cashSupplierPayments,
    cashOnHand: requireNumber(payload, "cash_current"),
    bankInSince: requireNumber(payload, "bank_in"),
    bankOutSince: requireNumber(payload, "bank_out"),
    bankAdjustments: requireNumber(payload, "bank_adjustments"),
    bankOnHand: requireNumber(payload, "bank_current"),
    legacySettingsPresent,
    branches,
  };
}

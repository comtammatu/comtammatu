import type { Json } from "@comtammatu/database";
import { loadAuthState } from "@/_lib/auth";

export interface CashSummary {
  hasOpening: boolean;
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
}

const EMPTY_FUNDS: CashSummary = {
  hasOpening: false,
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
  legacySettingsPresent: false,
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

export async function fetchCashSummary(): Promise<CashSummary> {
  const { supabase } = await loadAuthState();
  const { data, error } = await supabase.rpc("get_finance_current_funds");

  if (error) {
    console.error("[finance:funds] failed to load current funds", error.code);
    throw new Error("Unable to load current funds");
  }

  const payload = requireObject(data);
  const hasOpening = payload.has_opening === true;
  const legacySettingsPresent = payload.legacy_settings_present === true;

  if (!hasOpening) {
    return { ...EMPTY_FUNDS, legacySettingsPresent };
  }

  const cashCollections = requireNumber(payload, "cash_collections");
  const cashRefunds = requireNumber(payload, "cash_refunds");
  const cashExpenses = requireNumber(payload, "cash_expenses");
  const cashSupplierPayments = requireNumber(payload, "cash_supplier_payments");

  return {
    hasOpening: true,
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
  };
}

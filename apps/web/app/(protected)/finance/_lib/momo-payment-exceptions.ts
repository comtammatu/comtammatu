import { loadAuthState } from "@/_lib/auth";
import {
  mapMomoPaymentException,
  sortMomoPaymentExceptions,
  type MomoPaymentException,
  type MomoPaymentExceptionRow,
} from "./momo-payment-exception-model";

const MOMO_PAYMENT_SCAN_LIMIT = 200;

export interface MomoPaymentExceptionLoadResult {
  items: MomoPaymentException[];
  failed: boolean;
  scannedCount: number;
}

export async function fetchMomoPaymentExceptions(): Promise<MomoPaymentExceptionLoadResult> {
  const { supabase, claims } = await loadAuthState();
  const { data, error } = await supabase
    .from("payments")
    .select(
      "id, order_id, amount, status, paid_at, provider_ref, provider_data, created_at, updated_at",
    )
    .eq("tenant_id", claims.tenant_id)
    .eq("method", "momo")
    .order("updated_at", { ascending: false })
    .limit(MOMO_PAYMENT_SCAN_LIMIT);

  if (error) {
    console.error(
      "[finance:momo-exceptions] failed to load payments",
      error.code,
    );
    return { items: [], failed: true, scannedCount: 0 };
  }

  const rows = (data ?? []) as MomoPaymentExceptionRow[];
  const items = rows.flatMap((row) => {
    const mapped = mapMomoPaymentException(row);
    return mapped == null ? [] : [mapped];
  });

  return {
    items: sortMomoPaymentExceptions(items),
    failed: false,
    scannedCount: rows.length,
  };
}

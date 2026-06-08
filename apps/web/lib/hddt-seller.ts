/**
 * HĐĐT seller identity + VAT rate — sourced from system_settings, never
 * hardcoded (audit HDDT-03). Má Tư is a Hộ Kinh Doanh, so the legal seller
 * name on every e-invoice MUST come from settings (`seller_name`) and the
 * daily-summary VAT rate from settings (`vat_rate`) — a literal "CTCP" name or
 * a literal `8` rate would print the wrong legal entity / tax on a real HĐĐT.
 *
 * All readers go through here so there is exactly one place that resolves the
 * settings → default fallback. Used by the per-order createTaxInvoice action,
 * the replace-invoice action, and the daily B2C summary runner.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@comtammatu/database";
import {
  SYSTEM_SETTING_KEYS,
  SYSTEM_SETTING_DEFAULTS,
} from "@comtammatu/shared/settings";

/**
 * Resolve the legal seller name printed on HĐĐT for a tenant. Falls back to the
 * shared default (HKD legal name) when no `seller_name` row exists or it is
 * blank — never returns an empty string so the provider payload is always valid.
 */
export async function getSellerName(
  supabase: SupabaseClient<Database>,
  tenantId: number,
): Promise<string> {
  const { data } = await supabase
    .from("system_settings")
    .select("value")
    .eq("tenant_id", tenantId)
    .eq("key", SYSTEM_SETTING_KEYS.SELLER_NAME)
    .maybeSingle();

  const value = data?.value?.trim();
  return value && value.length > 0
    ? value
    : SYSTEM_SETTING_DEFAULTS[SYSTEM_SETTING_KEYS.SELLER_NAME];
}

/**
 * Resolve the VAT rate (percent, e.g. 8) for daily B2C summary HĐĐT from
 * settings. Falls back to the shared default. Used where there is no per-line
 * rate to aggregate (the daily-summary header rate).
 */
export async function getVatRate(
  supabase: SupabaseClient<Database>,
  tenantId: number,
): Promise<number> {
  const { data } = await supabase
    .from("system_settings")
    .select("value")
    .eq("tenant_id", tenantId)
    .eq("key", SYSTEM_SETTING_KEYS.VAT_RATE)
    .maybeSingle();

  const parsed = Number(data?.value);
  return Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : Number(SYSTEM_SETTING_DEFAULTS[SYSTEM_SETTING_KEYS.VAT_RATE]);
}

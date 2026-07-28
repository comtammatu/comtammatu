import "server-only";
import type { TenantSupabase } from "@lib/inventory/types";

export type QcSettings = {
  qty_short_tolerance_pct: number;
  price_variance_warn_pct: number;
  price_variance_review_pct: number;
  reject_requires_photo: boolean;
};

const DEFAULT_QC_SETTINGS: QcSettings = {
  qty_short_tolerance_pct: 5,
  price_variance_warn_pct: 5,
  price_variance_review_pct: 15,
  reject_requires_photo: true,
};

export async function fetchQcSettings(
  supabase: TenantSupabase,
  tenantId: number,
  includeMonetary = false,
): Promise<QcSettings> {
  const query = includeMonetary
    ? supabase
        .from("inventory_qc_settings")
        .select(
          "qty_short_tolerance_pct, price_variance_warn_pct, price_variance_review_pct, reject_requires_photo",
        )
    : supabase
        .from("inventory_qc_settings")
        .select("qty_short_tolerance_pct, reject_requires_photo");
  const { data } = await query
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!data) return DEFAULT_QC_SETTINGS;

  return {
    qty_short_tolerance_pct: Number(data.qty_short_tolerance_pct ?? 5),
    price_variance_warn_pct:
      includeMonetary && "price_variance_warn_pct" in data
        ? Number(data.price_variance_warn_pct ?? 5)
        : DEFAULT_QC_SETTINGS.price_variance_warn_pct,
    price_variance_review_pct:
      includeMonetary && "price_variance_review_pct" in data
        ? Number(data.price_variance_review_pct ?? 15)
        : DEFAULT_QC_SETTINGS.price_variance_review_pct,
    reject_requires_photo: Boolean(data.reject_requires_photo ?? true),
  };
}

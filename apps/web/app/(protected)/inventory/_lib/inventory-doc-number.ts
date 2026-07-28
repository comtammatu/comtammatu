import type { TenantSupabase } from "@lib/inventory/types";

export type InventoryDocKind =
  | "grn"
  | "transfer"
  | "issue"
  | "waste"
  | "production"
  | "stocktake"
  | "count_slip";

/** Allocate PREFIX-YYYY-#### via next_inventory_doc_number. */
export async function allocateInventoryDocNumber(
  supabase: TenantSupabase,
  tenantId: number,
  docKind: InventoryDocKind,
): Promise<{ ok: true; code: string } | { ok: false }> {
  const { data, error } = await supabase.rpc("next_inventory_doc_number", {
    p_tenant_id: tenantId,
    p_doc_kind: docKind,
  });
  if (error || typeof data !== "string" || data.length === 0) {
    return { ok: false };
  }
  return { ok: true, code: data };
}

import type { TenantSupabase } from "@lib/inventory/types";

type WasteLinkRow = {
  id: number;
  issue_number: string;
  source_ref: unknown;
};

function readLinkedSlipId(sourceRef: unknown): number | null {
  if (!sourceRef || typeof sourceRef !== "object" || Array.isArray(sourceRef)) {
    return null;
  }
  const record = sourceRef as Record<string, unknown>;
  const value = record.count_slip_id ?? record.countSlipId;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function loadCountSlipWasteIssueNumbers(
  supabase: TenantSupabase,
  tenantId: number,
  slipIds: number[],
): Promise<Map<number, string>> {
  if (slipIds.length === 0) return new Map();
  const values = `(${slipIds.join(",")})`;
  const query = (key: "count_slip_id" | "countSlipId") =>
    supabase
      .from("stock_issues")
      .select("id, issue_number, source_ref")
      .eq("tenant_id", tenantId)
      .eq("issue_type", "writeoff")
      .filter(`source_ref->>${key}` as never, "in", values)
      .order("id", { ascending: false });

  const [current, legacy] = await Promise.all([
    query("count_slip_id"),
    query("countSlipId"),
  ]);
  if (current.error || legacy.error) {
    console.error("inventory.count_slips.waste_links_fetch_failed", {
      code: current.error?.code ?? legacy.error?.code,
    });
  }

  const result = new Map<number, string>();
  for (const row of [
    ...((current.data ?? []) as WasteLinkRow[]),
    ...((legacy.data ?? []) as WasteLinkRow[]),
  ]) {
    const slipId = readLinkedSlipId(row.source_ref);
    if (slipId !== null && !result.has(slipId)) {
      result.set(slipId, row.issue_number);
    }
  }
  return result;
}

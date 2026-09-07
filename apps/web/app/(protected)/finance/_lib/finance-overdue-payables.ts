import { getVNDateString } from "@comtammatu/shared/time";
import type { loadInventoryMonetaryAccess } from "@lib/inventory/monetary-access";

export async function fetchOverduePayables({
  client,
  tenantId,
  branchId,
}: {
  client: NonNullable<
    Awaited<ReturnType<typeof loadInventoryMonetaryAccess>>["client"]
  >;
  tenantId: number;
  branchId?: number | null;
}): Promise<{ count: number; amount: number } | null> {
  const today = getVNDateString();
  const { data, error } =
    branchId != null
      ? await client
          .from("supplier_invoices")
          .select(
            "total_amount, paid_amount, credit_applied_amount, due_date, goods_received_notes!inner(branch_id)",
          )
          .eq("tenant_id", tenantId)
          .in("payment_status", ["unpaid", "partial"])
          .lt("due_date", today)
          .eq("goods_received_notes.branch_id", branchId)
      : await client
          .from("supplier_invoices")
          .select("total_amount, paid_amount, credit_applied_amount, due_date")
          .eq("tenant_id", tenantId)
          .in("payment_status", ["unpaid", "partial"])
          .lt("due_date", today);

  if (error || !data) {
    return null;
  }

  let count = 0;
  let amount = 0;
  for (const row of data as Array<{
    total_amount: number | string;
    paid_amount: number | string | null;
    credit_applied_amount: number | string | null;
  }>) {
    const tot = Number(row.total_amount ?? 0);
    const paid = Number(row.paid_amount ?? 0);
    const credit = Number(row.credit_applied_amount ?? 0);
    const outstanding = Math.max(0, tot - paid - credit);
    if (outstanding > 0) {
      count += 1;
      amount += outstanding;
    }
  }

  return { count, amount };
}

import { fetchExpiryAlerts } from "../actions";
import { formatDate } from "../_lib/format";
import { ExpiryClient } from "./expiry-client";
import type { ExpiryAlertRow } from "./expiry-client";

export default async function ExpiryPage() {
  const res = await fetchExpiryAlerts();
  const dbRows = res.success
    ? (res.data as Array<Record<string, unknown>>)
    : [];

  const alerts: ExpiryAlertRow[] = dbRows.map((row) => {
    const expiryDate = row.expiry_date as string | null;
    let daysLeft = 0;
    let urgency = "warning";

    if (expiryDate) {
      const now = new Date();
      const expiry = new Date(expiryDate);
      daysLeft = Math.ceil(
        (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (daysLeft <= 0) urgency = "expired";
      else if (daysLeft <= 3) urgency = "critical";
      else urgency = "warning";
    }

    return {
      id: row.id as number,
      ingredientName:
        ((row.ingredients as Record<string, unknown>)?.name as string) ?? "—",
      lot: (row.lot_number as string) ?? "—",
      expiryDate: expiryDate ? formatDate(expiryDate) : "—",
      daysLeft,
      urgency,
      grnCode:
        ((row.grns as Record<string, unknown>)?.grn_number as string) ?? "—",
      branchName:
        ((row.branches as Record<string, unknown>)?.name as string) ?? "—",
    };
  });

  return <ExpiryClient alerts={alerts} />;
}

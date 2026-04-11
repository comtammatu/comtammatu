import {
  fetchPurchaseOrders,
  fetchGrns,
  fetchSupplierInvoices,
  fetchRecentActivity,
} from "../procurement-actions";
import type { RecentActivityItem } from "../procurement-actions";
import { ReceivingClient } from "./receiving-client";

export default async function ReceivingPage() {
  const [poRes, grnRes, invoiceRes, activityRes] = await Promise.all([
    fetchPurchaseOrders(),
    fetchGrns(),
    fetchSupplierInvoices(),
    fetchRecentActivity(),
  ]);

  const poCount =
    poRes.success && poRes.data
      ? (poRes.data as Array<{ status: string }>).filter(
          (po) => po.status === "draft" || po.status === "sent",
        ).length
      : 0;

  const grnCount =
    grnRes.success && grnRes.data
      ? (grnRes.data as Array<{ status: string }>).filter(
          (g) => g.status === "draft" || g.status === "pending",
        ).length
      : 0;

  const invoiceCount =
    invoiceRes.success && invoiceRes.data
      ? (invoiceRes.data as Array<{ matching_status: string }>).filter(
          (inv) =>
            inv.matching_status === "pending" ||
            inv.matching_status === "discrepancy",
        ).length
      : 0;

  const recentActivity: RecentActivityItem[] =
    activityRes.success && activityRes.data ? activityRes.data : [];

  return (
    <ReceivingClient
      poCount={poCount}
      grnCount={grnCount}
      invoiceCount={invoiceCount}
      recentActivity={recentActivity}
    />
  );
}

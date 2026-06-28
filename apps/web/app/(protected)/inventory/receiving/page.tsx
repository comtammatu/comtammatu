import { fetchRecentActivity } from "../procurement-actions";
import type { RecentActivityItem } from "../procurement-actions";
import {
  countOpenGrns,
  countOpenPurchaseOrders,
  countOpenSupplierInvoices,
} from "./receiving-counts";
import { resolveRequestedBranchId } from "../_lib/inventory-scope";
import { ReceivingClient } from "./receiving-client";

export default async function ReceivingPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string | string[] }>;
}) {
  const params = await searchParams;
  const branchFilter =
    (await resolveRequestedBranchId(params.branchId)) ?? undefined;

  const [poCount, grnCount, invoiceCount, activityRes] = await Promise.all([
    countOpenPurchaseOrders(branchFilter),
    countOpenGrns(branchFilter),
    countOpenSupplierInvoices(branchFilter),
    fetchRecentActivity(branchFilter),
  ]);

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

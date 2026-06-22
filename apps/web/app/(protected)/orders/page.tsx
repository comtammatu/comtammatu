import Link from "next/link";
import { loadAuthState } from "@/_lib/auth";
import { fetchOrders } from "./actions";
import { fetchRefunds } from "./refund-actions";
import { OrdersClient } from "./orders-client";
import { RefundsClient } from "./refunds-client";
import { Button } from "@comtammatu/ui/components/button";
import { TabsContent } from "@comtammatu/ui/components/tabs";
import { AppPage, AppPageHeader, AppEmptyState } from "@/components/surface";
import { AppPageTabs } from "@/components/app-page-tabs";

import { ORDER_VI } from "@comtammatu/shared/messages";
import { ORDERS_COPY } from "./orders-copy";
export default async function OrdersPage() {
  const { claims } = await loadAuthState();

  const [ordersResult, refundsResult] = await Promise.all([
    fetchOrders(),
    fetchRefunds(),
  ]);

  if (!ordersResult.success || !ordersResult.data) {
    return (
      <AppPage width="wide">
        <AppPageHeader title={ORDER_VI.long} />
        <AppEmptyState
          mode="error"
          description={ordersResult.error ?? ORDERS_COPY.loadFailed}
        />
      </AppPage>
    );
  }

  const { orders, branches, summary } = ordersResult.data;
  const refunds = refundsResult.success
    ? (refundsResult.data?.refunds ?? [])
    : [];

  const isManagerOrAbove = claims.user_role === "owner";
  const canApproveRefund = claims.user_role === "owner";

  const pendingRefundCount = refunds.filter(
    (r) => r.status === "pending",
  ).length;

  return (
    <AppPage width="wide">
      <AppPageHeader
        eyebrow={ORDERS_COPY.eyebrow}
        title={ORDER_VI.long}
        description={ORDERS_COPY.description}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/reports">{ORDERS_COPY.reportsAction}</Link>
          </Button>
        }
        tabs={
          <AppPageTabs
            items={[
              { value: "orders", label: ORDERS_COPY.tabOrders },
              {
                value: "refunds",
                label: ORDERS_COPY.tabRefunds,
                count: pendingRefundCount > 0 ? pendingRefundCount : undefined,
              },
            ]}
          >
            <TabsContent value="orders" className="flex flex-col gap-4">
              <OrdersClient
                initialOrders={orders}
                initialSummary={summary}
                branches={branches}
                showBranchFilter={isManagerOrAbove}
              />
            </TabsContent>
            <TabsContent value="refunds" className="flex flex-col gap-4">
              <RefundsClient
                initialRefunds={refunds}
                canApprove={canApproveRefund}
              />
            </TabsContent>
          </AppPageTabs>
        }
      />
    </AppPage>
  );
}

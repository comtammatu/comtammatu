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
          description={ordersResult.error ?? "Không thể tải đơn hàng"}
        />
      </AppPage>
    );
  }

  const { orders, branches } = ordersResult.data;
  const refunds = refundsResult.success
    ? (refundsResult.data?.refunds ?? [])
    : [];

  const isManagerOrAbove = ["owner", "super_manager"].includes(
    claims.user_role,
  );
  const canApproveRefund = ["owner", "super_manager"].includes(
    claims.user_role,
  );

  const pendingRefundCount = refunds.filter(
    (r) => r.status === "pending",
  ).length;

  return (
    <AppPage width="wide">
      <AppPageHeader
        eyebrow="Điều phối giao dịch"
        title={ORDER_VI.long}
        description="Theo dõi đơn bán và hòan tiền trong cùng một nơi để xử lý nhanh."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/reports">Báo cáo</Link>
          </Button>
        }
        tabs={
          <AppPageTabs
            items={[
              { value: "orders", label: "Danh sách đơn" },
              {
                value: "refunds",
                label: "Hòan tiền",
                count: pendingRefundCount > 0 ? pendingRefundCount : undefined,
              },
            ]}
          >
            <TabsContent value="orders" className="mt-4 space-y-4">
              <OrdersClient
                initialOrders={orders}
                branches={branches}
                showBranchFilter={isManagerOrAbove}
              />
            </TabsContent>
            <TabsContent value="refunds" className="mt-4 space-y-4">
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

import Link from "next/link";
import { loadAuthState } from "@/_lib/auth";
import { fetchOrders } from "./actions";
import { fetchRefunds } from "./refund-actions";
import { OrdersClient } from "./orders-client";
import { RefundsClient } from "./refunds-client";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import {
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@comtammatu/ui/components/tabs";
import { PageHero } from "@/components/page-hero";
import { UrlTabs } from "@/_components/url-tabs";

import { ORDER_VI } from "@comtammatu/shared/messages";
export default async function OrdersPage() {
  const { claims } = await loadAuthState();

  const [ordersResult, refundsResult] = await Promise.all([
    fetchOrders(),
    fetchRefunds(),
  ]);

  if (!ordersResult.success || !ordersResult.data) {
    return (
      <div className="space-y-5 lg:space-y-6">
        <PageHero title={ORDER_VI.long} />
        <p className="text-sm text-destructive">
          {ordersResult.error ?? "Không thể tải đơn hàng"}
        </p>
      </div>
    );
  }

  const { orders, branches } = ordersResult.data;
  const refunds = refundsResult.success
    ? (refundsResult.data?.refunds ?? [])
    : [];

  const isManagerOrAbove = ["owner", "super_manager", "area_manager"].includes(
    claims.user_role,
  );
  const canApproveRefund = ["owner", "super_manager"].includes(
    claims.user_role,
  );

  const pendingRefundCount = refunds.filter(
    (r) => r.status === "pending",
  ).length;
  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHero
        eyebrow="Điều phối giao dịch"
        title={ORDER_VI.long}
        description="Theo dõi đơn bán và hòan tiền trong cùng một nơi để xử lý nhanh."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/reports">Báo cáo</Link>
          </Button>
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>Điều phối giao dịch</CardTitle>
          <p className="text-sm text-muted-foreground">
            Theo dõi trạng thái đơn bán và các yêu cầu hòan tiền.
          </p>
        </CardHeader>
        <CardContent>
          <UrlTabs defaultValue="orders">
            <TabsList variant="toolbar" className="bg-card shadow-sm">
              <TabsTrigger
                value="orders"
                className="rounded-full px-4 data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                Danh sách đơn
              </TabsTrigger>
              <TabsTrigger
                value="refunds"
                className="rounded-full px-4 data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                Hòan tiền
                {pendingRefundCount > 0 && (
                  <Badge variant="destructive" className="ml-1.5">
                    {pendingRefundCount}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="orders" className="mt-5 space-y-4">
              <OrdersClient
                initialOrders={orders}
                branches={branches}
                showBranchFilter={isManagerOrAbove}
              />
            </TabsContent>
            <TabsContent value="refunds" className="mt-5 space-y-4">
              <RefundsClient
                initialRefunds={refunds}
                canApprove={canApproveRefund}
              />
            </TabsContent>
          </UrlTabs>
        </CardContent>
      </Card>
    </div>
  );
}

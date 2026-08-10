"use client";

import Link from "next/link";
import { Button } from "@comtammatu/ui/components/button";
import { TabsContent } from "@comtammatu/ui/components/tabs";
import { AppPage, AppPageHeader } from "@/components/surface";
import { AppPageTabs } from "@/components/app-page-tabs";
import { ORDER_VI } from "@comtammatu/shared/messages";
import { orders as ORDERS_COPY } from "@lib/messages/orders";
import { OrdersClient } from "./orders-client";
import { RefundsClient } from "./refunds-client";
import type { OrderRow, OrdersSummary } from "./actions";
import type { RefundRow } from "./refund-actions";

interface OrdersPageBodyProps {
  orders: OrderRow[];
  summary: OrdersSummary;
  branches: { id: number; name: string }[];
  showBranchFilter: boolean;
  refunds: RefundRow[];
  canApproveRefund: boolean;
  initialSelectedOrder?: OrderRow | null;
  embedded?: boolean;
}

export function OrdersPageBody({
  orders,
  summary,
  branches,
  showBranchFilter,
  refunds,
  canApproveRefund,
  initialSelectedOrder = null,
  embedded = false,
}: OrdersPageBodyProps) {
  const pendingRefundCount = refunds.filter(
    (r) => r.status === "pending",
  ).length;

  const content = (
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
          showBranchFilter={showBranchFilter}
          initialSelectedOrder={initialSelectedOrder}
        />
      </TabsContent>
      <TabsContent value="refunds" className="flex flex-col gap-4">
        <RefundsClient
          initialRefunds={refunds}
          canApprove={canApproveRefund}
          branches={branches}
        />
      </TabsContent>
    </AppPageTabs>
  );

  if (embedded) {
    return <div className="flex w-full flex-col gap-3">{content}</div>;
  }

  return (
    <AppPage width="xwide" density="compact">
      <AppPageHeader
        title={ORDER_VI.long}
        description={ORDERS_COPY.description}
        actions={
          <Button
            variant="outline"
            size="touch"
            render={<Link href="/finance" />}
          >
            {ORDERS_COPY.reportsAction}
          </Button>
        }
      />
      {content}
    </AppPage>
  );
}

"use client";

import Link from "next/link";
import { Button } from "@comtammatu/ui/components/button";
import { TabsContent } from "@comtammatu/ui/components/tabs";
import { AppPage, AppPageHeader } from "@/components/surface";
import { AppPageTabs } from "@/components/app-page-tabs";
import { ORDER_VI } from "@comtammatu/shared/messages";
import { ORDERS_COPY } from "./orders-copy";
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
  embedded?: boolean;
}

export function OrdersPageBody({
  orders,
  summary,
  branches,
  showBranchFilter,
  refunds,
  canApproveRefund,
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
    <AppPage width="xwide">
      <AppPageHeader
        eyebrow={ORDERS_COPY.eyebrow}
        title={ORDER_VI.long}
        description={ORDERS_COPY.description}
        actions={
          <Button
            asChild
            variant="outline"
            size={embedded ? "touch" : "sm"}
          >
            <Link href="/finance">{ORDERS_COPY.reportsAction}</Link>
          </Button>
        }
        tabs={content}
      />
    </AppPage>
  );
}

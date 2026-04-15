import Link from "next/link";
import { getAuthContext } from "../_lib/auth";
import { fetchOrders } from "./actions";
import { fetchRefunds } from "./refund-actions";
import { OrdersClient } from "./orders-client";
import { RefundsClient } from "./refunds-client";
import { CircleAlert } from "lucide-react";
import type { StaffRole } from "@comtammatu/shared/auth";
import { Button } from "@comtammatu/ui/components/button";
import {
  EmptyState,
  PageContainer,
  PageHeader,
  SectionCard,
} from "@/components/foundation/ui-patterns";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@comtammatu/ui/components/tabs";

const ALLOWED_ROLES: StaffRole[] = [
  "owner",
  "super_manager",
  "area_manager",
  "branch_manager",
  "cashier",
];

export default async function OrdersPage() {
  const ctx = await getAuthContext(ALLOWED_ROLES);
  if (!ctx) {
    return (
      <PageContainer>
        <PageHeader
          eyebrow="Điều phối giao dịch"
          title="Đơn hàng"
        />
        <EmptyState
          icon={<CircleAlert className="size-5" />}
          title="Không có quyền truy cập"
          description="Vai trò hiện tại chưa được phép vào khu vực đơn hàng."
          density="touch"
        />
      </PageContainer>
    );
  }

  const [ordersResult, refundsResult] = await Promise.all([
    fetchOrders(),
    fetchRefunds(),
  ]);

  if (!ordersResult.success || !ordersResult.data) {
    return (
      <PageContainer>
        <PageHeader
          title="Đơn hàng"
        />
        <p className="text-sm text-destructive">
          {ordersResult.error ?? "Không thể tải đơn hàng"}
        </p>
      </PageContainer>
    );
  }

  const { orders, branches } = ordersResult.data;
  const refunds = refundsResult.success
    ? (refundsResult.data?.refunds ?? [])
    : [];

  const isManagerOrAbove = ["owner", "super_manager", "area_manager"].includes(
    ctx.claims.user_role,
  );
  const canApproveRefund = ["owner", "super_manager"].includes(
    ctx.claims.user_role,
  );

  const pendingRefundCount = refunds.filter(
    (r) => r.status === "pending",
  ).length;
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Điều phối giao dịch"
        title="Đơn hàng"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/reports">Báo cáo</Link>
          </Button>
        }
      />
      <SectionCard>
        <Tabs defaultValue="orders">
          <TabsList className="h-auto w-full justify-start gap-2 overflow-x-auto rounded-lg bg-muted/60 p-2 shadow-sm">
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
              Hoàn tiền
              {pendingRefundCount > 0 && (
                <span className="ml-1.5 rounded-full bg-destructive px-1.5 py-0.5 text-xs font-medium text-destructive-foreground">
                  {pendingRefundCount}
                </span>
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
        </Tabs>
      </SectionCard>
    </PageContainer>
  );
}

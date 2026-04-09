import { getAuthContext } from "../_lib/auth";
import { fetchOrders } from "./actions";
import { fetchRefunds } from "./refund-actions";
import { OrdersClient } from "./orders-client";
import { RefundsClient } from "./refunds-client";
import type { StaffRole } from "@comtammatu/shared/auth";
import { PageContainer, PageHeader } from "@/components/foundation/ui-patterns";
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
      <div className="flex items-center justify-center py-24">
        <p className="text-sm text-muted-foreground">Không có quyền truy cập</p>
      </div>
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
          description="Lịch sử và quản lý đơn hàng"
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
      <PageHeader title="Đơn hàng" description="Lịch sử và quản lý đơn hàng" />
      <Tabs defaultValue="orders">
        <TabsList>
          <TabsTrigger value="orders">Danh sách đơn</TabsTrigger>
          <TabsTrigger value="refunds">
            Hoàn tiền
            {pendingRefundCount > 0 && (
              <span className="ml-1.5 rounded-full bg-destructive px-1.5 py-0.5 text-xs font-medium text-destructive-foreground">
                {pendingRefundCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>
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
      </Tabs>
    </PageContainer>
  );
}

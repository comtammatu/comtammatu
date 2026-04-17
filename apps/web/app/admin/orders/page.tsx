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
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
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
      <div className="space-y-5 lg:space-y-6">
        <Card>
          <CardContent className="p-5 sm:p-6">
            <div className="space-y-3">
              <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                Điều phối giao dịch
              </span>
              <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Đơn hàng
              </h2>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-4 py-12 text-center">
            <div className="flex size-14 items-center justify-center rounded-full border bg-muted text-primary">
              <CircleAlert className="size-5" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-2xl font-semibold">
                Không có quyền truy cập
              </h3>
              <p className="max-w-md text-sm leading-6 text-muted-foreground">
                Vai trò hiện tại chưa được phép vào khu vực đơn hàng.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const [ordersResult, refundsResult] = await Promise.all([
    fetchOrders(),
    fetchRefunds(),
  ]);

  if (!ordersResult.success || !ordersResult.data) {
    return (
      <div className="space-y-5 lg:space-y-6">
        <Card>
          <CardContent className="p-5 sm:p-6">
            <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Đơn hàng
            </h2>
          </CardContent>
        </Card>
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
    ctx.claims.user_role,
  );
  const canApproveRefund = ["owner", "super_manager"].includes(
    ctx.claims.user_role,
  );

  const pendingRefundCount = refunds.filter(
    (r) => r.status === "pending",
  ).length;
  return (
    <div className="space-y-5 lg:space-y-6">
      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-3">
              <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                Điều phối giao dịch
              </span>
              <div className="space-y-2">
                <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                  Đơn hàng
                </h2>
                <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                  Theo dõi đơn bán và hoàn tiền trong cùng một nơi để xử lý
                  nhanh.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 self-start">
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/reports">Báo cáo</Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Điều phối giao dịch</CardTitle>
          <p className="text-sm text-muted-foreground">
            Theo dõi trạng thái đơn bán và các yêu cầu hoàn tiền.
          </p>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="orders">
            <TabsList className="rounded-lg border bg-card shadow-sm h-auto w-full justify-start gap-2 overflow-x-auto p-2">
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
        </CardContent>
      </Card>
    </div>
  );
}

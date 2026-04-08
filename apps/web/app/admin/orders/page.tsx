import { getAuthContext } from "../_lib/auth";
import { fetchOrders } from "./actions";
import { OrdersClient } from "./orders-client";
import type { StaffRole } from "@comtammatu/shared/auth";
import { PageContainer, PageHeader } from "@/components/foundation/ui-patterns";

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

  const result = await fetchOrders();

  if (!result.success || !result.data) {
    return (
      <PageContainer>
        <PageHeader
          title="Đơn hàng"
          description="Lịch sử và quản lý đơn hàng"
        />
        <p className="text-sm text-destructive">
          {result.error ?? "Không thể tải đơn hàng"}
        </p>
      </PageContainer>
    );
  }

  const { orders, branches } = result.data;
  const isManagerOrAbove = ["owner", "super_manager", "area_manager"].includes(
    ctx.claims.user_role,
  );

  return (
    <PageContainer>
      <PageHeader title="Đơn hàng" description="Lịch sử và quản lý đơn hàng" />
      <OrdersClient
        initialOrders={orders}
        branches={branches}
        showBranchFilter={isManagerOrAbove}
      />
    </PageContainer>
  );
}

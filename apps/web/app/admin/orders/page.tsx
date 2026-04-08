import { getAuthContext } from "../_lib/auth";
import { fetchOrders } from "./actions";
import { OrdersClient } from "./orders-client";
import type { StaffRole } from "@comtammatu/shared/auth";

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
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Đơn hàng</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Lịch sử và quản lý đơn hàng
          </p>
        </div>
        <p className="text-sm text-destructive">
          {result.error ?? "Không thể tải đơn hàng"}
        </p>
      </div>
    );
  }

  const { orders, branches } = result.data;
  const isManagerOrAbove = ["owner", "super_manager", "area_manager"].includes(
    ctx.claims.user_role,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Đơn hàng</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Lịch sử và quản lý đơn hàng
        </p>
      </div>
      <OrdersClient
        initialOrders={orders}
        branches={branches}
        showBranchFilter={isManagerOrAbove}
      />
    </div>
  );
}

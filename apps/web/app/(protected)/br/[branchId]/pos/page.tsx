import { Suspense } from "react";
import {
  Monitor as IconDeviceDesktop,
  TriangleAlert as IconAlertTriangle,
} from "lucide-react";
import {
  fetchMenuForPos,
  fetchTablesForBranch,
  fetchActiveSession,
  fetchPosTerminals,
  fetchPosPermissionFlags,
} from "./actions";
import {
  fetchPaymentMethodsForPos,
  fetchVietQrConfig,
  type VietQrConfig,
} from "./payment-actions";
import type { PaymentMethod } from "@comtammatu/shared/providers";
import { PosDesktopShell } from "./pos-desktop-shell";
import type { MenuCategory } from "./pos-menu-types";
import type { SessionOrder } from "./order-history";
import { SessionGate } from "./session-gate";
import type { OrderType } from "./types";
import { PosStatusShell } from "./pos-status-shell";
import { PosPageSkeleton } from "./pos-page-skeleton";

export default async function PosPage({
  params,
  searchParams,
}: {
  params: Promise<{ branchId: string }>;
  searchParams: Promise<{ order?: string; table?: string }>;
}) {
  const { branchId } = await params;
  const sp = await searchParams;

  const tableParam = sp.table;
  const orderParam = sp.order;
  const parsedTable =
    tableParam !== undefined ? Number.parseInt(tableParam, 10) : NaN;
  const parsedOrder =
    orderParam !== undefined ? Number.parseInt(orderParam, 10) : NaN;
  const initialTableId =
    Number.isFinite(parsedTable) && parsedTable > 0
      ? Math.trunc(parsedTable)
      : undefined;
  const initialOpenOrderId =
    Number.isFinite(parsedOrder) && parsedOrder > 0
      ? Math.trunc(parsedOrder)
      : undefined;

  const branchIdNum = Number(branchId);

  // Per-branch model (D7): a branch has 0 or 1 open session
  // (DB UNIQUE(branch_id) WHERE status='open').
  const [sessionResult, permFlags] = await Promise.all([
    fetchActiveSession(branchIdNum),
    fetchPosPermissionFlags(branchIdNum),
  ]);

  if (!sessionResult.success) {
    return (
      <PosStatusShell
        icon={<IconDeviceDesktop />}
        title="Không mở được POS"
        description={sessionResult.error ?? "Chưa lấy được ca làm hiện tại."}
        badge={{
          label: "Sự cố tải ca làm",
          icon: <IconAlertTriangle className="size-3.5" />,
          variant: "destructive",
        }}
      />
    );
  }

  const session = (sessionResult.data ?? null) as ActiveSession | null;

  // No open session → only cashbox-permission roles (cashier/branch_manager)
  // may open one. A waiter only has pos:use → block here and point them to
  // the cashier, instead of dead-ending in the open-shift form.
  if (session === null) {
    if (!permFlags.canOpenShift) {
      return (
        <PosStatusShell
          icon={<IconDeviceDesktop />}
          title="Chưa có ca mở"
          description="Bạn không có quyền mở ca. Liên hệ thu ngân hoặc quản lý chi nhánh để mở ca trước khi nhận đơn."
          badge={{
            label: "Chờ mở ca",
            icon: <IconAlertTriangle className="size-3.5" />,
            variant: "warning",
          }}
        />
      );
    }

    const terminalsResult = await fetchPosTerminals(branchIdNum);

    if (!terminalsResult.success) {
      return (
        <PosStatusShell
          icon={<IconDeviceDesktop />}
          title="Không thể tải máy POS"
          description={
            terminalsResult.error ?? "Chưa tải được danh sách máy POS."
          }
          badge={{
            label: "Lỗi tải máy POS",
            icon: <IconAlertTriangle className="size-3.5" />,
            variant: "warning",
          }}
        />
      );
    }

    return (
      <SessionGate
        branchId={branchIdNum}
        terminals={
          (terminalsResult.data ?? []) as {
            id: number;
            name: string;
            device_id: string | null;
            has_open_session: boolean;
          }[]
        }
      />
    );
  }

  const [menuResult, tablesResult, paymentMethodsResult, vietQrConfigResult] =
    await Promise.all([
      fetchMenuForPos(branchIdNum),
      fetchTablesForBranch(branchIdNum),
      // Tenant-stable settings seeded in RSC. The admin payment-settings save
      // must call `revalidatePath('/br/[branchId]/pos', 'page')` +
      // `revalidateTag('payment-config')` to bust this cache.
      fetchPaymentMethodsForPos(branchIdNum),
      fetchVietQrConfig(branchIdNum),
    ]);

  // Active orders are NOT seeded from RSC — every Server Action triggers a
  // route revalidation that re-runs page.tsx, and `fetchActiveOrders` was a
  // ~200ms hot-path tax with no real win (provider's realtime channel keeps
  // the list authoritative within sub-second of any mutation). The provider
  // sees `initialOrdersSeeded=false`, so its first SUBSCRIBED callback fires
  // one `refreshAll` to populate the list (~200ms after hydrate). Cold load
  // shows the POS shell with empty Orders panel for that brief window.
  const initialOrders: SessionOrder[] = [];
  const initialOrdersSeeded = false;

  const initialPaymentMethods: readonly PaymentMethod[] =
    paymentMethodsResult.success && paymentMethodsResult.data
      ? paymentMethodsResult.data.methods
      : [];
  const initialVietQrConfig: VietQrConfig | null =
    vietQrConfigResult.success && vietQrConfigResult.data !== undefined
      ? vietQrConfigResult.data
      : null;

  const tablesList = (tablesResult.data ?? []) as BranchTable[];
  const tableParamValidForDineIn =
    initialTableId != null &&
    tablesList.some((t) => t.id === initialTableId && t.status === "available");
  const initialOrderType: OrderType = tableParamValidForDineIn
    ? "dine_in"
    : tablesList.length > 0
      ? "dine_in"
      : "takeaway";

  if (!menuResult.success || !menuResult.data) {
    return (
      <PosStatusShell
        icon={<IconDeviceDesktop />}
        title="Không thể tải menu bán hàng"
        description={menuResult.error ?? "Ca đã mở nhưng chưa tải được menu."}
        badge={{
          label: "Gián đoạn dữ liệu bán hàng",
          icon: <IconAlertTriangle className="size-3.5" />,
          variant: "warning",
        }}
      />
    );
  }

  return (
    <Suspense fallback={<PosPageSkeleton />}>
      <PosDesktopShell
        branchId={branchIdNum}
        categories={menuResult.data as MenuCategory[]}
        tables={tablesList}
        session={session}
        initialOrderType={initialOrderType}
        initialOrders={initialOrders}
        initialOrdersSeeded={initialOrdersSeeded}
        initialOpenOrderId={initialOpenOrderId}
        canCloseShift={permFlags.canCloseShift}
        canConfirmCash={permFlags.canConfirmCash}
        canManageMenuLimits={permFlags.canManageMenuLimits}
        canSplitMerge={permFlags.canSplitMerge}
        initialPaymentMethods={initialPaymentMethods}
        initialVietQrConfig={initialVietQrConfig}
      />
    </Suspense>
  );
}

/** Table shape returned by fetchTablesForBranch */
export interface BranchTable {
  id: number;
  number: number;
  status: string;
  zone_id: number | null;
  branch_zones: { id: number; name: string } | null;
}

/** Active session shape returned by fetchActiveSession.
 *
 * Per-branch model: `terminal_id` nullable (NULL = ca chung của chi nhánh,
 * không liên kết terminal vật lý). Closed sessions từ trước D7 vẫn giữ
 * terminal_id cho audit. */
export interface ActiveSession {
  id: number;
  terminal_id: number | null;
  opened_by: string;
  opened_at: string;
  opening_cash: number;
  status: string;
  note: string | null;
  pos_terminals: { id: number; name: string } | null;
}

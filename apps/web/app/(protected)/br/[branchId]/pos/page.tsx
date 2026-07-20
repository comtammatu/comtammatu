import { Suspense } from "react";
import {
  Monitor as IconDeviceDesktop,
  TriangleAlert as IconAlertTriangle,
} from "lucide-react";
import { POS_VI } from "@comtammatu/shared/messages";
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
import { PosStatusPanel } from "./pos-status-panel";
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
  //
  // Session + permission flags are awaited here because they are the access
  // guard: they decide *which* surface renders (error panel, no-shift panel,
  // SessionGate, or the desktop). They must resolve before render and cannot
  // be streamed. The heavier menu/tables/payment fetches feeding the desktop
  // are deferred into <PosDesktopData> behind the Suspense boundary so the
  // shell streams first.
  const [sessionResult, permFlags] = await Promise.all([
    fetchActiveSession(branchIdNum),
    fetchPosPermissionFlags(branchIdNum),
  ]);

  if (!sessionResult.success) {
    return (
      <PosStatusPanel
        icon={<IconDeviceDesktop />}
        title={POS_VI.shellSessionErrorTitle}
        description={sessionResult.error ?? POS_VI.shellSessionErrorFallback}
        badge={{
          label: POS_VI.shellSessionErrorBadge,
          icon: <IconAlertTriangle className="size-3.5" />,
          variant: "destructive",
        }}
      />
    );
  }

  const session = (sessionResult.data ?? null) as ActiveSession | null;

  // No open session → only cashbox-permission roles (cashier/branch_manager)
  // may open one. Staff without pos:open_cashbox only has pos:use → block here and point them to
  // the cashier, instead of dead-ending in the open-shift form.
  if (session === null) {
    if (!permFlags.canOpenShift) {
      return (
        <PosStatusPanel
          icon={<IconDeviceDesktop />}
          title={POS_VI.shellNoShiftTitle}
          description={POS_VI.shellNoShiftDescription}
          badge={{
            label: POS_VI.shellNoShiftBadge,
            icon: <IconAlertTriangle className="size-3.5" />,
            variant: "warning",
          }}
        />
      );
    }

    const terminalsResult = await fetchPosTerminals(branchIdNum);

    if (!terminalsResult.success) {
      return (
        <PosStatusPanel
          icon={<IconDeviceDesktop />}
          title={POS_VI.shellTerminalsErrorTitle}
          description={
            terminalsResult.error ?? POS_VI.shellTerminalsErrorFallback
          }
          badge={{
            label: POS_VI.shellTerminalsErrorBadge,
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

  // Guard passed: an open session exists. The static POS shell (skeleton) can
  // paint immediately while the heavier desktop data streams in below.
  return (
    <Suspense fallback={<PosPageSkeleton />}>
      <PosDesktopData
        branchId={branchIdNum}
        session={session}
        permFlags={permFlags}
        initialTableId={initialTableId}
        initialOpenOrderId={initialOpenOrderId}
      />
    </Suspense>
  );
}

/** Streamed inside the page's Suspense boundary: runs the menu/tables/payment
 * fetches that feed the heavy desktop surface, so the shell renders without
 * blocking on the slowest of them. Identical queries/props to before — only
 * the timing (streamed) changed. */
async function PosDesktopData({
  branchId,
  session,
  permFlags,
  initialTableId,
  initialOpenOrderId,
}: {
  branchId: number;
  session: ActiveSession;
  permFlags: Awaited<ReturnType<typeof fetchPosPermissionFlags>>;
  initialTableId: number | undefined;
  initialOpenOrderId: number | undefined;
}) {
  const [menuResult, tablesResult, paymentMethodsResult, vietQrConfigResult] =
    await Promise.all([
      fetchMenuForPos(branchId),
      fetchTablesForBranch(branchId),
      // Tenant-stable settings seeded in RSC. The admin payment-settings save
      // must call `revalidatePath('/br/[branchId]/pos', 'page')` +
      // `revalidateTag('payment-config')` to bust this cache.
      fetchPaymentMethodsForPos(branchId),
      fetchVietQrConfig(branchId),
    ]);

  // Active orders are NOT seeded from RSC — every Server Action triggers a
  // route revalidation that re-runs page.tsx, and `fetchActiveOrders` was a
  // ~200ms hot-path tax with no real win (provider's realtime channel keeps
  // the list authoritative within sub-second of any mutation). The provider
  // sees `initialOrdersSeeded=false`, loads the first snapshot immediately,
  // and keeps the POS behind loading/error recovery until that read succeeds.
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

  if (!tablesResult.success || !tablesResult.data) {
    return (
      <PosStatusPanel
        icon={<IconDeviceDesktop />}
        title={POS_VI.shellTablesErrorTitle}
        description={POS_VI.shellTablesErrorFallback}
        badge={{
          label: POS_VI.shellTablesErrorBadge,
          icon: <IconAlertTriangle className="size-3.5" />,
          variant: "warning",
        }}
      />
    );
  }

  const tablesList = tablesResult.data as BranchTable[];
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
      <PosStatusPanel
        icon={<IconDeviceDesktop />}
        title={POS_VI.shellMenuErrorTitle}
        description={menuResult.error ?? POS_VI.shellMenuErrorFallback}
        badge={{
          label: POS_VI.shellMenuErrorBadge,
          icon: <IconAlertTriangle className="size-3.5" />,
          variant: "warning",
        }}
      />
    );
  }

  return (
    <PosDesktopShell
      branchId={branchId}
      categories={menuResult.data as MenuCategory[]}
      tables={tablesList}
      session={session}
      initialOrderType={initialOrderType}
      initialOrders={initialOrders}
      initialOrdersSeeded={initialOrdersSeeded}
      initialOpenOrderId={initialOpenOrderId}
      canCloseShift={permFlags.canCloseShift}
      canConfirmCash={permFlags.canConfirmCash}
      canSplitMerge={permFlags.canSplitMerge}
      initialPaymentMethods={initialPaymentMethods}
      initialVietQrConfig={initialVietQrConfig}
    />
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

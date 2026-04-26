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
  fetchActiveOrders,
} from "./actions";
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
  searchParams: Promise<{ table?: string }>;
}) {
  const { branchId } = await params;
  const sp = await searchParams;

  const tableParam = sp.table;
  const parsedTable =
    tableParam !== undefined ? Number.parseInt(tableParam, 10) : NaN;
  const initialTableId =
    Number.isFinite(parsedTable) && parsedTable > 0
      ? Math.trunc(parsedTable)
      : undefined;

  const branchIdNum = Number(branchId);

  // Per-branch model (Owner D7, 2026-04-27): branch chỉ có 0 hoặc 1 session
  // đang mở (DB enforce UNIQUE(branch_id) WHERE status='open'). Disambiguation
  // qua MultiSessionPicker / `?terminal=` URL param đã retired.
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
        steps={[
          {
            label: "Bước 1",
            title: "Kiểm tra phiên",
            description: "Đang xác minh ca làm.",
            tone: "current",
          },
          {
            label: "Bước 2",
            title: "Tải máy POS",
            description: "Đang tải máy POS.",
            tone: "pending",
          },
          {
            label: "Bước 3",
            title: "Mở màn hình bán hàng",
            description: "Mở quầy bán hàng.",
            tone: "pending",
          },
        ]}
      />
    );
  }

  const session = (sessionResult.data ?? null) as ActiveSession | null;

  // No open session → chỉ role có quyền thao tác két (cashier/branch_manager)
  // mới được tự mở ca. Waiter chỉ có pos:use → chặn tại đây, hướng dẫn liên hệ
  // thu ngân để tránh dead-end ở form "Mở ca".
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
          steps={[
            {
              label: "Bước 1",
              title: "Kiểm tra phiên",
              description: "Chưa có ca mở.",
              tone: "done",
            },
            {
              label: "Bước 2",
              title: "Thu ngân mở ca",
              description: "Yêu cầu thu ngân mở ca trên máy POS.",
              tone: "current",
            },
            {
              label: "Bước 3",
              title: "Vào bán hàng",
              description: "Quay lại sau khi ca đã mở.",
              tone: "pending",
            },
          ]}
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
          steps={[
            {
              label: "Bước 1",
              title: "Kiểm tra phiên",
              description: "Chưa có ca mở.",
              tone: "done",
            },
            {
              label: "Bước 2",
              title: "Tải máy POS",
              description: "Đang tải máy POS.",
              tone: "current",
            },
            {
              label: "Bước 3",
              title: "Mở ca",
              description: "Sẵn sàng mở ca.",
              tone: "pending",
            },
          ]}
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

  const [menuResult, tablesResult, ordersResult] = await Promise.all([
    fetchMenuForPos(branchIdNum),
    fetchTablesForBranch(branchIdNum),
    fetchActiveOrders(branchIdNum),
  ]);

  // Seed the POS provider from RSC so the client does not re-fetch on mount.
  // RSC seed is the active list ("Cần xử lý"). Archived ("Đã xử lý") is a
  // lazy lookup that only fetches when the cashier opens the sheet.
  // On RSC fetch failure, seed empty and let useOrderSync's first SUBSCRIBED
  // callback still fire a full refresh — preserves old behavior as fallback.
  const initialOrders = (
    ordersResult.success ? (ordersResult.data ?? []) : []
  ) as SessionOrder[];
  const initialOrdersSeeded = ordersResult.success;

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
        steps={[
          {
            label: "Bước 1",
            title: "Ca đang mở",
            description: "Phiên bán hàng đã sẵn sàng.",
            tone: "done",
          },
          {
            label: "Bước 2",
            title: "Đồng bộ menu",
            description: "Đang nạp món và bàn.",
            tone: "current",
          },
          {
            label: "Bước 3",
            title: "Sẵn sàng tạo đơn",
            description: "Sẵn sàng phục vụ khách.",
            tone: "pending",
          },
        ]}
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
        canCloseShift={permFlags.canCloseShift}
        canConfirmCash={permFlags.canConfirmCash}
        canOverrideVariance={permFlags.canOverrideVariance}
      />
    </Suspense>
  );
}

/** Table shape returned by fetchTablesForBranch */
export interface BranchTable {
  id: number;
  number: number;
  capacity: number;
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

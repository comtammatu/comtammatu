import { Suspense } from "react";
import { IconDeviceDesktop, IconAlertTriangle } from "@tabler/icons-react";
import { Spinner } from "@comtammatu/ui/components/spinner";
import {
  fetchMenuForPos,
  fetchTablesForBranch,
  fetchActiveSession,
  fetchPosTerminals,
  fetchSessionOrders,
} from "../pos/actions";
import type { MenuCategory } from "../pos/pos-menu";
import { SessionGate } from "../pos/session-gate";
import type { OrderType } from "../pos/types";
import type { SessionOrder } from "../pos/order-history";
import type { ActiveSession, BranchTable } from "../pos/page";
import { PosStatusShell } from "../pos/pos-status-shell";
import { PosMenuV2 } from "./pos-menu-v2";

export default async function PosV2Page({
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

  const sessionResult = await fetchActiveSession(branchIdNum);

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

  if (!sessionResult.data) {
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

  const session = sessionResult.data as ActiveSession;

  const [menuResult, tablesResult, ordersResult] = await Promise.all([
    fetchMenuForPos(branchIdNum),
    fetchTablesForBranch(branchIdNum),
    fetchSessionOrders(branchIdNum, session.id),
  ]);

  const tablesList = (tablesResult.data ?? []) as BranchTable[];
  const ordersList = (ordersResult.data ?? []) as SessionOrder[];
  const tableParamValidForDineIn =
    initialTableId != null &&
    tablesList.some(
      (t) => t.id === initialTableId && t.status === "available",
    );
  const initialOrderType: OrderType = tableParamValidForDineIn
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
    <Suspense
      fallback={
        <PosStatusShell
          icon={<IconDeviceDesktop />}
          title="Đang chuẩn bị quầy POS"
          description="Đang nạp ca làm, bàn và menu."
          badge={{
            label: "Đồng bộ quầy bán",
            icon: <Spinner className="size-3.5 motion-reduce:animate-none" />,
            variant: "info",
          }}
          steps={[
            {
              label: "Bước 1",
              title: "Phiên hợp lệ",
              description: "Ca làm và thiết bị đã sẵn sàng.",
              tone: "done",
            },
            {
              label: "Bước 2",
              title: "Dựng mặt bàn",
              description: "Đang nạp bàn và món.",
              tone: "current",
            },
            {
              label: "Bước 3",
              title: "Sẵn sàng nhận order",
              description: "Mở giao diện POS.",
              tone: "pending",
            },
          ]}
        />
      }
    >
      <PosMenuV2
        branchId={branchIdNum}
        categories={menuResult.data as MenuCategory[]}
        tables={tablesList}
        session={session}
        initialOrders={ordersList}
        initialTableId={initialTableId}
        initialOrderType={initialOrderType}
      />
    </Suspense>
  );
}

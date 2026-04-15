import { Suspense, type ReactNode } from "react";
import { Loader2, MonitorSpeaker, TriangleAlert } from "lucide-react";
import { FlowStatePanel } from "@/components/foundation/ui-patterns";
import {
  fetchMenuForPos,
  fetchTablesForBranch,
  fetchActiveSession,
  fetchPosTerminals,
} from "./actions";
import { PosMenu } from "./pos-menu";
import type { MenuCategory } from "./pos-menu";
import { SessionGate } from "./session-gate";
import type { OrderType } from "./types";

function PosRouteState({
  title,
  description,
  status,
  statusTone,
  steps,
}: {
  title: string;
  description: string;
  status: ReactNode;
  statusTone: "info" | "warning" | "danger";
  steps: Array<{
    label: string;
    description: string;
    state: "todo" | "current" | "done";
  }>;
}) {
  return (
    <FlowStatePanel
      surface="pos"
      icon={<MonitorSpeaker className="size-5" />}
      title={title}
      description={description}
      status={status}
      statusTone={statusTone}
      steps={steps}
      wrapperClassName="bg-background/40"
      className="max-w-5xl"
    />
  );
}

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

  // Check for active session first
  const sessionResult = await fetchActiveSession(branchIdNum);

  if (!sessionResult.success) {
    return (
      <PosRouteState
        title="Không thể dựng phiên POS"
        description={
          sessionResult.error ??
          "Chưa lấy được ca làm hiện tại."
        }
        status={
          <>
            <TriangleAlert className="size-3.5" />
            <span>Sự cố tải ca làm</span>
          </>
        }
        statusTone="danger"
        steps={[
          {
            label: "Kiểm tra phiên",
            description: "Đang xác minh ca làm.",
            state: "current",
          },
          {
            label: "Đồng bộ thiết bị",
            description: "Đang tải máy POS.",
            state: "todo",
          },
          {
            label: "Khởi tạo bán hàng",
            description: "Mở quầy bán hàng.",
            state: "todo",
          },
        ]}
      />
    );
  }

  // No open session → show session gate
  if (!sessionResult.data) {
    const terminalsResult = await fetchPosTerminals(branchIdNum);

    if (!terminalsResult.success) {
      return (
        <PosRouteState
          title="Không thể tải máy POS"
          description={
            terminalsResult.error ??
            "Chưa đồng bộ được danh sách thiết bị."
          }
          status={
            <>
              <TriangleAlert className="size-3.5" />
              <span>Gián đoạn đồng bộ thiết bị</span>
            </>
          }
          statusTone="warning"
          steps={[
            {
              label: "Kiểm tra phiên",
              description: "Chưa có ca mở.",
              state: "done",
            },
            {
              label: "Đồng bộ thiết bị",
              description: "Đang tải terminal.",
              state: "current",
            },
            {
              label: "Mở ca",
              description: "Sẵn sàng mở ca.",
              state: "todo",
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

  // Session exists → load menu + tables and show POS
  const session = sessionResult.data as ActiveSession;

  const [menuResult, tablesResult] = await Promise.all([
    fetchMenuForPos(branchIdNum),
    fetchTablesForBranch(branchIdNum),
  ]);

  const tablesList = (tablesResult.data ?? []) as BranchTable[];
  const tableParamValidForDineIn =
    initialTableId != null &&
    tablesList.some(
      (t) => t.id === initialTableId && t.status !== "maintenance",
    );
  const initialOrderType: OrderType = tableParamValidForDineIn
    ? "dine_in"
    : "takeaway";

  if (!menuResult.success || !menuResult.data) {
    return (
        <PosRouteState
          title="Không thể tải menu bán hàng"
          description={
            menuResult.error ??
            "Ca đã mở nhưng chưa tải được menu."
          }
        status={
          <>
            <TriangleAlert className="size-3.5" />
            <span>Gián đoạn dữ liệu bán hàng</span>
          </>
        }
          statusTone="warning"
        steps={[
          {
            label: "Ca đang mở",
            description: "Phiên bán hàng đã sẵn sàng.",
            state: "done",
          },
          {
            label: "Đồng bộ menu",
            description: "Đang nạp món và bàn.",
            state: "current",
          },
          {
            label: "Sẵn sàng tạo đơn",
            description: "Sẵn sàng phục vụ khách.",
            state: "todo",
          },
        ]}
      />
    );
  }

  return (
    <Suspense
      fallback={
        <PosRouteState
          title="Đang chuẩn bị quầy POS"
          description="Đang nạp ca làm, bàn và menu."
          status={
            <>
              <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" />
              <span>Đồng bộ quầy bán</span>
            </>
          }
          statusTone="info"
        steps={[
            {
              label: "Phiên hợp lệ",
              description: "Ca làm và thiết bị đã sẵn sàng.",
              state: "done",
            },
            {
              label: "Dựng mặt bàn",
              description: "Đang nạp bàn và món.",
              state: "current",
            },
            {
              label: "Sẵn sàng nhận order",
              description: "Mở giao diện POS.",
              state: "todo",
            },
          ]}
        />
      }
    >
      <PosMenu
        branchId={branchIdNum}
        categories={menuResult.data as MenuCategory[]}
        tables={tablesList}
        session={session}
        initialTableId={initialTableId}
        initialOrderType={initialOrderType}
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

/** Active session shape returned by fetchActiveSession */
export interface ActiveSession {
  id: number;
  terminal_id: number;
  opened_by: string;
  opened_at: string;
  opening_cash: number;
  status: string;
  note: string | null;
  pos_terminals: { id: number; name: string } | null;
}

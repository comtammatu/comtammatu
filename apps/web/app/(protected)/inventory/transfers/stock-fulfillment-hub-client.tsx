"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight as IconArrowRight } from "lucide-react";
import { formatVNDate } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { AppPageTabs, TabsContent } from "@/components/app-page-tabs";
import { AppListFrame } from "@/components/surface";
import { StatusBadge } from "@/components/status-badge";
import type { StockFulfillmentRow } from "@lib/inventory/stock-fulfillment-data";
import {
  STOCK_JOURNEY_OUTCOME_LABELS,
  STOCK_JOURNEY_STAGE_LABELS,
} from "@lib/inventory/stock-journey-model";

type BranchQueue = "active" | "receive" | "history";
type CentralQueue = "requests" | "dispatch" | "receive" | "history";
type Queue = BranchQueue | CentralQueue;

const NEXT_ACTION_LABELS = {
  edit: "Hoàn tất yêu cầu",
  prepare: "Xử lý yêu cầu",
  ship: "Giao hàng",
  receive: "Kiểm nhận",
  none: "Theo dõi",
} as const;

function getQueue(
  row: StockFulfillmentRow,
  mode: "branch" | "central",
  viewerBranchId: number | null,
): Queue | null {
  if (row.kind === "request") {
    if (mode === "central") {
      if (
        row.status === "cancelled" ||
        row.status === "closed" ||
        row.stage === "received" ||
        (!row.hasPendingLines &&
          row.activeTransfers === 0 &&
          row.outcome != null)
      ) {
        return "history";
      }
      return row.hasPendingLines ? "requests" : null;
    }
    return row.status === "cancelled" ||
      row.status === "closed" ||
      row.stage === "received" ||
      (!row.hasPendingLines && row.activeTransfers === 0 && row.outcome != null)
      ? "history"
      : "active";
  }

  if (["received", "cancelled", "completed"].includes(row.status)) {
    return "history";
  }
  const isInbound = viewerBranchId == null || row.toBranchId === viewerBranchId;
  if (
    ["in_transit", "confirmed_ship", "confirmed_receive"].includes(row.status)
  ) {
    return isInbound ? "receive" : mode === "branch" ? "active" : null;
  }
  if (row.status === "draft") {
    return mode === "central" ? "dispatch" : "active";
  }
  return "history";
}

function currentWork(
  row: StockFulfillmentRow,
  mode: "branch" | "central",
): string {
  if (row.kind === "request") {
    if (row.nextAction === "prepare" && mode === "branch") {
      return "Chờ chuẩn bị hàng";
    }
    if (row.nextAction === "ship" && mode === "branch") {
      return "Chờ giao hàng";
    }
    return NEXT_ACTION_LABELS[row.nextAction];
  }
  if (row.status === "draft") return "Chuẩn bị hàng";
  if (row.status === "confirmed_receive") return "Kiểm nhận hàng";
  if (["confirmed_ship", "in_transit"].includes(row.status)) {
    return "Chờ kiểm nhận";
  }
  if (row.status === "received") return "Đã nhận";
  return "Đã hủy";
}

function compactProgress(row: StockFulfillmentRow): string {
  if (row.kind === "transfer") {
    if (row.status === "draft") return "Chuẩn bị hàng";
    if (
      ["confirmed_ship", "in_transit", "confirmed_receive"].includes(row.status)
    ) {
      return "Đang giao";
    }
    if (row.status === "received") return "Đã nhận";
    return "Đã hủy";
  }
  const trips =
    row.activeTransfers > 0
      ? ` · ${row.receivedTransfers}/${row.activeTransfers} chuyến đã nhận`
      : "";
  return `${STOCK_JOURNEY_STAGE_LABELS[row.stage]}${trips}`;
}

export function StockFulfillmentHubClient({
  rows,
  mode,
  branchId,
}: {
  rows: StockFulfillmentRow[];
  mode: "branch" | "central";
  branchId: number | null;
}) {
  const router = useRouter();
  const queues: Queue[] =
    mode === "branch"
      ? ["active", "receive", "history"]
      : ["requests", "dispatch", "receive", "history"];
  const labels: Record<Queue, string> = {
    active: "Đang xử lý",
    requests: "Yêu cầu",
    dispatch: "Cần giao",
    receive: "Cần nhận",
    history: "Lịch sử",
  };
  const grouped = new Map(
    queues.map((queue) => [
      queue,
      rows.filter((row) => getQueue(row, mode, branchId) === queue),
    ]),
  );

  function href(row: StockFulfillmentRow): string {
    if (row.kind === "request") {
      return mode === "branch"
        ? `/br/${branchId}/stock/requests/${row.id}`
        : `/inventory/stock-requests/${row.id}`;
    }
    return mode === "branch"
      ? `/br/${branchId}/stock/transfer/${row.id}`
      : `/inventory/transfers/${row.id}${branchId == null ? "" : `?branchId=${branchId}`}`;
  }

  const columns: DataTableColumn<StockFulfillmentRow>[] = [
    {
      key: "work",
      header: "Việc cần làm",
      render: (row) => (
        <div className="min-w-0">
          <div className="font-medium">{row.title}</div>
          <div className="text-sm text-muted-foreground">
            {currentWork(row, mode)} ·{" "}
            <span className="font-mono tabular-nums">{row.documentNumber}</span>
          </div>
        </div>
      ),
    },
    {
      key: "progress",
      header: "Tiến độ",
      render: (row) => (
        <div>
          <div>{compactProgress(row)}</div>
          {row.kind === "request" && row.outcome ? (
            <Badge variant="warning" className="mt-1">
              {STOCK_JOURNEY_OUTCOME_LABELS[row.outcome]}
            </Badge>
          ) : null}
        </div>
      ),
    },
    {
      key: "action",
      header: "Trạng thái",
      render: (row) => (
        <StatusBadge domain="inventory" value={row.status} size="sm" />
      ),
    },
    {
      key: "needed_at",
      header: "Cần trước",
      render: (row) =>
        row.kind === "request" && row.neededAt
          ? formatVNDate(row.neededAt)
          : "—",
    },
  ];

  return (
    <AppPageTabs
      paramKey="queue"
      defaultValue={mode === "branch" ? "active" : "requests"}
      ariaLabel="Hàng đợi giao nhận hàng"
      stickyList
      items={queues.map((queue) => ({
        value: queue,
        label:
          mode === "branch" && queue === "receive"
            ? "Cần kiểm nhận"
            : labels[queue],
        count: grouped.get(queue)?.length ?? 0,
      }))}
    >
      {queues.map((queue) => {
        const queueRows = grouped.get(queue) ?? [];
        return (
          <TabsContent key={queue} value={queue} className="mt-3">
            <AppListFrame>
              <DataTable
                columns={columns}
                data={queueRows}
                pageSize={50}
                getRowKey={(row) => `${row.kind}-${row.id}`}
                onRowClick={(row) => router.push(href(row))}
                getRowAriaLabel={(row) =>
                  `${row.kind === "request" ? "Yêu cầu hàng" : "Điều chuyển"} ${row.documentNumber}`
                }
                emptyTitle={`Không có ${labels[queue].toLocaleLowerCase("vi")}`}
                emptyDescription={
                  mode === "branch" && queue === "active"
                    ? "Tạo yêu cầu hàng khi chi nhánh cần bổ sung nguyên liệu."
                    : "Không có chứng từ cần xử lý trong hàng đợi này."
                }
                mobileCardRender={(row) => (
                  <Item
                    variant="outline"
                    className="min-h-16"
                    render={<Link href={href(row)} />}
                  >
                    <ItemContent>
                      <ItemTitle className="line-clamp-none">
                        {row.title}
                      </ItemTitle>
                      <ItemDescription className="line-clamp-none">
                        {currentWork(row, mode)} · {compactProgress(row)}
                      </ItemDescription>
                      <ItemDescription className="font-mono tabular-nums">
                        {row.documentNumber}
                      </ItemDescription>
                    </ItemContent>
                    <IconArrowRight className="size-4 text-muted-foreground" />
                  </Item>
                )}
              />
            </AppListFrame>
          </TabsContent>
        );
      })}
    </AppPageTabs>
  );
}

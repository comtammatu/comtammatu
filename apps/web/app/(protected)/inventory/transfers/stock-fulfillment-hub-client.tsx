"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft as IconArrowLeft,
  ArrowRight as IconArrowRight,
} from "lucide-react";
import { formatVNDate } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
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
import { AppListFrame } from "@/components/surface";
import { AppDialog } from "@/components/form";
import { StockRequestDetailView } from "@/components/stock-request-detail-view";
import { matchesSearch } from "@lib/search";
import type { StockFulfillmentRow } from "@lib/inventory/stock-fulfillment-data";
import type { StockRequestFulfillmentDetailData } from "@lib/inventory/stock-request-fulfillment-detail-data";
import type { TransferDetailPageData } from "@lib/inventory/transfer-detail-data";
import { STOCK_JOURNEY_STAGE_LABELS } from "@lib/inventory/stock-journey-model";
import { messages } from "@lib/messages";
import { StockRequestFulfillClient } from "../stock-requests/[id]/stock-request-fulfill-client";
import { StockRequestBranchActions } from "@/(protected)/br/[branchId]/(operator)/stock/requests/[id]/stock-request-branch-actions";
import { TransferDetailClient } from "./[id]/transfer-detail-client";

type WorkFilter = "all" | "request" | "dispatch" | "receive";
type StateFilter = "active" | "completed" | "cancelled" | "all";

const SOURCE_LABELS = {
  central_supply: "Kho Tổng",
  central_kitchen: "Bếp TT",
} as const;
const LIFECYCLE_LABELS = {
  active: "Đang xử lý",
  completed: "Hoàn tất",
  cancelled: "Đã hủy",
} as const;
const copy = messages.inventory.stockRequests.journey;

function rowTitle(row: StockFulfillmentRow): string {
  return row.kind === "request"
    ? row.requesterSite.name
    : `${row.fromSite.name} → ${row.toSite.name}`;
}

function linkedTransferNumbers(row: StockFulfillmentRow): string[] {
  return row.kind === "request"
    ? row.sources.flatMap((source) =>
        source.transfers.map((transfer) => transfer.documentNumber),
      )
    : [];
}

function progressLines(row: StockFulfillmentRow): string[] {
  if (row.kind === "manual_transfer") {
    if (row.status === "draft") return ["Chuẩn bị hàng"];
    if (
      ["confirmed_ship", "in_transit", "confirmed_receive"].includes(row.status)
    ) {
      return ["Đang giao"];
    }
    return [row.status === "cancelled" ? "Đã hủy" : "Đã nhận"];
  }
  return row.sources.map((source) => {
    const trips =
      source.activeTransfers > 0
        ? ` · ${source.receivedTransfers}/${source.activeTransfers} chuyến`
        : "";
    return `${SOURCE_LABELS[source.siteKind]}: ${STOCK_JOURNEY_STAGE_LABELS[source.stage]}${trips}`;
  });
}

function rowHref(
  row: StockFulfillmentRow,
  mode: "branch" | "central",
  branchId: number | null,
  pathname: string,
  searchParams: URLSearchParams,
): string {
  if (mode === "branch") {
    return row.kind === "request"
      ? `/br/${branchId}/stock/requests/${row.requestId}`
      : `/br/${branchId}/stock/transfer/${row.transferId}`;
  }
  const params = new URLSearchParams(searchParams);
  if (row.kind === "request") {
    params.set("requestId", String(row.requestId));
    params.delete("transferId");
  } else {
    params.set("transferId", String(row.transferId));
    params.delete("requestId");
  }
  return `${pathname}?${params}`;
}

export function StockFulfillmentHubClient({
  rows,
  mode,
  branchId,
  selectedRequest = null,
  selectedTransfer = null,
}: {
  rows: StockFulfillmentRow[];
  mode: "branch" | "central";
  branchId: number | null;
  selectedRequest?: StockRequestFulfillmentDetailData | null;
  selectedTransfer?: TransferDetailPageData | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rawWork =
    searchParams.get("work") ??
    (searchParams.get("queue") === "receive" ? "receive" : null);
  const rawState = searchParams.get("state");
  const work: WorkFilter =
    rawWork === "request" || rawWork === "dispatch" || rawWork === "receive"
      ? rawWork
      : "all";
  const state: StateFilter =
    rawState === "active" ||
    rawState === "completed" ||
    rawState === "cancelled"
      ? rawState
      : "all";
  const search = searchParams.get("q") ?? "";
  const currentPage = Math.max(Number(searchParams.get("page")) || 1, 1);

  function replaceParam(key: string, value: string, defaultValue: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === defaultValue || value === "") params.delete(key);
    else params.set(key, value);
    if (key !== "page") params.delete("page");
    router.replace(`${pathname}?${params}`, { scroll: false });
  }

  function replaceDetail({
    requestId,
    transferId,
  }: {
    requestId?: number | null;
    transferId?: number | null;
  }) {
    const params = new URLSearchParams(searchParams.toString());
    if (requestId === null) params.delete("requestId");
    else if (requestId != null) params.set("requestId", String(requestId));
    if (transferId === null) params.delete("transferId");
    else if (transferId != null) params.set("transferId", String(transferId));
    router.replace(`${pathname}?${params}`, { scroll: false });
  }

  const filtered = rows.filter((row) => {
    const matchesWork =
      work === "all" ||
      (work === "request"
        ? row.kind === "request"
        : row.workKinds.includes(work));
    const matchesState = state === "all" || row.lifecycle === state;
    const searchable =
      row.kind === "request"
        ? [
            row.documentNumber,
            row.requesterSite.name,
            ...row.sources.flatMap((source) => [
              SOURCE_LABELS[source.siteKind],
              ...source.transfers.map((transfer) => transfer.documentNumber),
            ]),
          ]
        : [row.documentNumber, row.fromSite.name, row.toSite.name];
    return matchesWork && matchesState && matchesSearch(searchable, search);
  });

  const columns: DataTableColumn<StockFulfillmentRow>[] = [
    {
      key: "journey",
      header: "Phiếu",
      render: (row) => {
        const linkedTransfers = linkedTransferNumbers(row);
        return (
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                {row.kind === "request" ? "YCH" : "DC"}
              </Badge>
              <span className="font-mono font-medium tabular-nums">
                {row.documentNumber}
              </span>
              <Badge
                variant={
                  row.lifecycle === "cancelled"
                    ? "destructive"
                    : row.lifecycle === "completed"
                      ? "success"
                      : "warning"
                }
              >
                {LIFECYCLE_LABELS[row.lifecycle]}
              </Badge>
            </div>
            <div className="font-medium">{rowTitle(row)}</div>
            <div className="text-sm text-muted-foreground">
              {copy.ingredientCount(row.lineCount)}
              {row.kind === "request" && row.sources.length > 1
                ? ` · ${row.sources.length} nguồn`
                : ""}
            </div>
            {linkedTransfers.length > 0 ? (
              <div className="text-sm text-muted-foreground">
                {copy.linkedTransferLabel}: {linkedTransfers.join(", ")}
              </div>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "progress",
      header: "Nguồn và tiến độ",
      render: (row) => (
        <div className="flex flex-col gap-1">
          {progressLines(row).map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      ),
    },
    {
      key: "current_work",
      header: "Việc hiện tại",
      render: (row) =>
        row.currentWork.length === 0 ? (
          "Theo dõi"
        ) : (
          <span>
            {row.currentWork[0]}
            {row.currentWork.length > 1
              ? ` +${row.currentWork.length - 1} việc khác`
              : ""}
          </span>
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

  const dialogOpen =
    mode === "central" && (selectedRequest != null || selectedTransfer != null);
  const dialogTitle = selectedTransfer ? (
    <span className="flex items-center gap-2">
      {selectedRequest ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={copy.backToRequestAria}
          onClick={() => replaceDetail({ transferId: null })}
        >
          <IconArrowLeft />
        </Button>
      ) : null}
      <span className="font-mono">{selectedTransfer.transfer.code}</span>
    </span>
  ) : (
    <span className="font-mono">
      {selectedRequest?.data.requestNumber ?? "Giao nhận hàng"}
    </span>
  );
  const dialogDescription = selectedTransfer
    ? `${selectedTransfer.transfer.fromBranch} → ${selectedTransfer.transfer.toBranch}`
    : selectedRequest
      ? `${selectedRequest.data.branchName} · ${messages.inventory.stockRequests.statusLabel(selectedRequest.data.status)}${selectedRequest.data.neededAt ? ` · Cần trước ${formatVNDate(selectedRequest.data.neededAt)}` : ""}`
      : undefined;

  return (
    <>
      <AppListFrame>
        <DataTable
          columns={columns}
          data={filtered}
          getRowKey={(row) =>
            row.kind === "request"
              ? `request-${row.requestId}`
              : `transfer-${row.transferId}`
          }
          searchable
          searchPlaceholder="Tìm mã phiếu hoặc điểm vận hành"
          searchValue={search}
          onSearchChange={(value) => replaceParam("q", value, "")}
          filters={[
            {
              key: "work",
              label: "Phân loại",
              placeholder: "Phân loại",
              options: [
                { value: "all", label: "Tất cả" },
                { value: "request", label: "Yêu cầu" },
                { value: "dispatch", label: "Cần giao" },
                { value: "receive", label: "Cần nhận" },
              ],
            },
            {
              key: "state",
              label: "Trạng thái",
              placeholder: "Trạng thái",
              options: [
                { value: "all", label: "Tất cả" },
                { value: "active", label: "Đang xử lý" },
                { value: "completed", label: "Hoàn tất" },
                { value: "cancelled", label: "Đã hủy" },
              ],
            },
          ]}
          filterValues={{ work, state }}
          onFilterChange={(key, value) => replaceParam(key, value, "all")}
          pageSize={50}
          currentPage={currentPage}
          onPageChange={(page) =>
            replaceParam("page", page <= 1 ? "" : String(page), "")
          }
          onRowClick={(row) =>
            router.push(
              rowHref(
                row,
                mode,
                branchId,
                pathname,
                new URLSearchParams(searchParams.toString()),
              ),
              { scroll: false },
            )
          }
          getRowAriaLabel={(row) =>
            `${row.kind === "request" ? "Yêu cầu hàng" : "Điều chuyển"} ${row.documentNumber}`
          }
          emptyTitle="Không có hành trình phù hợp"
          emptyDescription={
            mode === "branch"
              ? "Tạo yêu cầu hàng khi điểm vận hành cần bổ sung nguyên liệu."
              : "Thử thay đổi phân loại, trạng thái hoặc từ khóa tìm kiếm."
          }
          mobileCardRender={(row) => {
            const linkedTransfers = linkedTransferNumbers(row);
            const href = rowHref(
              row,
              mode,
              branchId,
              pathname,
              new URLSearchParams(searchParams.toString()),
            );
            return (
              <Item
                variant="outline"
                className="min-h-16"
                render={<Link href={href} scroll={false} />}
              >
                <ItemContent>
                  <ItemTitle className="flex flex-wrap items-center gap-2 line-clamp-none">
                    <Badge variant="outline">
                      {row.kind === "request" ? "YCH" : "DC"}
                    </Badge>
                    <span className="font-mono tabular-nums">
                      {row.documentNumber}
                    </span>
                  </ItemTitle>
                  <ItemDescription className="line-clamp-none">
                    {rowTitle(row)}
                  </ItemDescription>
                  <ItemDescription className="line-clamp-none">
                    {progressLines(row).join(" · ")}
                  </ItemDescription>
                  {linkedTransfers.length > 0 ? (
                    <ItemDescription className="line-clamp-none font-mono tabular-nums">
                      {copy.linkedTransferLabel}: {linkedTransfers.join(", ")}
                    </ItemDescription>
                  ) : null}
                  <ItemDescription className="flex items-center gap-2">
                    <Badge
                      variant={
                        row.lifecycle === "cancelled"
                          ? "destructive"
                          : row.lifecycle === "completed"
                            ? "success"
                            : "warning"
                      }
                    >
                      {LIFECYCLE_LABELS[row.lifecycle]}
                    </Badge>
                  </ItemDescription>
                </ItemContent>
                <IconArrowRight className="size-4 text-muted-foreground" />
              </Item>
            );
          }}
        />
      </AppListFrame>
      <AppDialog
        variant="document"
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) replaceDetail({ requestId: null, transferId: null });
        }}
        title={dialogTitle}
        description={dialogDescription}
        bodyClassName={
          selectedTransfer ? "lg:overflow-hidden" : undefined
        }
      >
        {selectedTransfer ? (
          <TransferDetailClient
            {...selectedTransfer}
            embedded
            embeddedHeader={false}
          />
        ) : selectedRequest ? (
          <StockRequestDetailView
            data={selectedRequest.data}
            mode="central"
            embedded
            onTransferOpen={(nextTransferId) =>
              replaceDetail({
                requestId: selectedRequest.data.id,
                transferId: nextTransferId,
              })
            }
            actions={
              selectedRequest.groups.length > 0 ? (
                <StockRequestFulfillClient
                  requestId={selectedRequest.data.id}
                  requestNumber={selectedRequest.data.requestNumber}
                  status={selectedRequest.data.status}
                  branchLabel={selectedRequest.data.branchName}
                  groups={selectedRequest.groups}
                  embedded
                  canClose={selectedRequest.canClose}
                  onTransferCreated={(nextTransferId) =>
                    replaceDetail({
                      requestId: selectedRequest.data.id,
                      transferId: nextTransferId,
                    })
                  }
                />
              ) : branchId === selectedRequest.data.branchId ? (
                <StockRequestBranchActions
                  branchId={selectedRequest.data.branchId}
                  requestId={selectedRequest.data.id}
                  editable={
                    ["draft", "submitted"].includes(
                      selectedRequest.data.status,
                    ) &&
                    selectedRequest.data.items.every(
                      (item) => item.status === "pending",
                    )
                  }
                  editHref={`/inventory/stock-requests/new?branchId=${selectedRequest.data.branchId}&requestId=${selectedRequest.data.id}`}
                />
              ) : null
            }
          />
        ) : null}
      </AppDialog>
    </>
  );
}

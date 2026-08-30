"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft as IconArrowLeft,
  ArrowRight as IconArrowRight,
  Search as IconSearch,
} from "lucide-react";
import { formatCount } from "@comtammatu/shared/format";
import { formatVNDate } from "@comtammatu/shared/time";
import { FORM_VI } from "@comtammatu/shared/messages";
import { cn } from "@comtammatu/ui/lib/utils";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { AppListFrame, AppToolbar } from "@/components/surface";
import { AppDialog } from "@/components/form";
import { StatusBadge } from "@/components/status-badge";
import { inventoryListFilterSelectClassName } from "../_components/inventory-list-filters";
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
const inventoryCommon = messages.inventory.common;

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

function hubRequestEditHref({
  branchId,
  requestId,
  pathname,
  searchParams,
}: {
  branchId: number;
  requestId: number;
  pathname: string;
  searchParams: URLSearchParams;
}): string {
  const returnParams = new URLSearchParams(searchParams.toString());
  returnParams.set("requestId", String(requestId));
  returnParams.delete("transferId");
  const returnQuery = returnParams.toString();
  const returnTo = returnQuery ? `${pathname}?${returnQuery}` : pathname;
  return `/inventory/stock-requests/new?branch=${branchId}&requestId=${requestId}&returnTo=${encodeURIComponent(returnTo)}`;
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

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      const matchesWork =
        work === "all" ||
        (work === "request"
          ? row.kind === "request"
          : row.workKinds.includes(work));
      const matchesState = state === "all" || row.lifecycle === state;
      const searchValues =
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
      return matchesWork && matchesState && matchesSearch(searchValues, search);
    });
  }, [rows, work, state, search]);

  const columns: DataTableColumn<StockFulfillmentRow>[] = [
    {
      key: "journey",
      header: "Phiếu",
      sortable: true,
      sortValue: (row) => row.documentNumber,
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
      sortable: true,
      sortValue: (row) => (row.kind === "request" ? row.neededAt ?? "" : ""),
      render: (row) =>
        row.kind === "request" && row.neededAt
          ? formatVNDate(row.neededAt)
          : "—",
    },
  ];

  const dialogOpen =
    mode === "central" && (selectedRequest != null || selectedTransfer != null);
  const dialogTitle = selectedTransfer ? (
    <span className="flex flex-wrap items-center gap-2">
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
      <StatusBadge
        domain="inventory"
        value={selectedTransfer.transfer.status}
      />
    </span>
  ) : (
    <span className="flex flex-wrap items-center gap-2">
      <span className="font-mono">
        {selectedRequest?.data.requestNumber ?? copy.hubTitle}
      </span>
      {selectedRequest ? (
        <Badge variant="secondary">
          {messages.inventory.stockRequests.statusLabel(
            selectedRequest.data.status,
          )}
        </Badge>
      ) : null}
    </span>
  );
  const dialogDescription = selectedTransfer
    ? `${selectedTransfer.transfer.fromBranch} → ${selectedTransfer.transfer.toBranch}`
    : selectedRequest
      ? `${selectedRequest.data.branchName}${selectedRequest.data.neededAt ? ` · Cần trước ${formatVNDate(selectedRequest.data.neededAt)}` : ""}`
      : undefined;

  const toolbar = (
    <AppToolbar
      variant="inline"
      search={
        <InputGroup size="field" className="min-w-0 flex-1 sm:min-w-72">
          <InputGroupAddon>
            <IconSearch />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            aria-label={copy.hubSearchPlaceholder}
            value={search}
            onChange={(event) => replaceParam("q", event.target.value, "")}
            placeholder={copy.hubSearchPlaceholder}
          />
        </InputGroup>
      }
      filters={
        <>
          <Select
            value={work}
            onValueChange={(value) => replaceParam("work", value, "all")}
          >
            <SelectTrigger
              size="field"
              className={inventoryListFilterSelectClassName}
              aria-label={copy.hubWorkKindAria}
            >
              <SelectValue placeholder={copy.hubWorkKindPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{inventoryCommon.all}</SelectItem>
              <SelectItem value="request">{copy.hubWorkRequest}</SelectItem>
              <SelectItem value="dispatch">{copy.hubWorkDispatch}</SelectItem>
              <SelectItem value="receive">{copy.hubWorkReceive}</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={state}
            onValueChange={(value) => replaceParam("state", value, "all")}
          >
            <SelectTrigger
              size="field"
              className={inventoryListFilterSelectClassName}
              aria-label={FORM_VI.status}
            >
              <SelectValue placeholder={FORM_VI.status} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{inventoryCommon.all}</SelectItem>
              <SelectItem value="active">{copy.active}</SelectItem>
              <SelectItem value="completed">{copy.hubStateCompleted}</SelectItem>
              <SelectItem value="cancelled">{copy.hubStateCancelled}</SelectItem>
            </SelectContent>
          </Select>
        </>
      }
    />
  );

  const hubTotal = rows.length;
  const hubActive = rows.filter((r) => r.lifecycle === "active").length;
  const hubCompleted = rows.filter((r) => r.lifecycle === "completed").length;
  const hubCancelled = rows.filter((r) => r.lifecycle === "cancelled").length;

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Item
          variant="outline"
          onClick={() => replaceParam("state", "all", "all")}
          className={cn(
            "flex flex-col justify-between p-3 text-left cursor-pointer",
            state === "all"
              ? "border-primary ring-1 ring-primary shadow-xs"
              : "border-border",
          )}
        >
          <div className="flex items-center justify-between gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <span>{copy.metrics.total}</span>
            <span className="size-2 rounded-full bg-muted-foreground" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">
              {formatCount(hubTotal)}
            </span>
            <span className="text-xs text-muted-foreground">
              {copy.metrics.transfersUnit}
            </span>
          </div>
        </Item>

        <Item
          variant="outline"
          onClick={() =>
            replaceParam("state", state === "active" ? "all" : "active", "all")
          }
          className={cn(
            "flex flex-col justify-between p-3 text-left cursor-pointer",
            state === "active"
              ? "border-warning ring-1 ring-warning shadow-xs"
              : "border-border",
          )}
        >
          <div className="flex items-center justify-between gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <span>{copy.metrics.active}</span>
            <span className="size-2 rounded-full bg-warning" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-mono text-2xl font-semibold tabular-nums text-warning">
              {formatCount(hubActive)}
            </span>
            <span className="text-xs text-muted-foreground">
              {copy.metrics.activeHint}
            </span>
          </div>
        </Item>

        <Item
          variant="outline"
          onClick={() =>
            replaceParam(
              "state",
              state === "completed" ? "all" : "completed",
              "all",
            )
          }
          className={cn(
            "flex flex-col justify-between p-3 text-left cursor-pointer",
            state === "completed"
              ? "border-success ring-1 ring-success shadow-xs"
              : "border-border",
          )}
        >
          <div className="flex items-center justify-between gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <span>{copy.metrics.completed}</span>
            <span className="size-2 rounded-full bg-success" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-mono text-2xl font-semibold tabular-nums text-success">
              {formatCount(hubCompleted)}
            </span>
            <span className="text-xs text-muted-foreground">
              {copy.metrics.completedHint}
            </span>
          </div>
        </Item>

        <Item
          variant="outline"
          onClick={() =>
            replaceParam(
              "state",
              state === "cancelled" ? "all" : "cancelled",
              "all",
            )
          }
          className={cn(
            "flex flex-col justify-between p-3 text-left cursor-pointer",
            state === "cancelled"
              ? "border-destructive ring-1 ring-destructive shadow-xs"
              : "border-border",
          )}
        >
          <div className="flex items-center justify-between gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <span>{copy.metrics.cancelled}</span>
            <span className="size-2 rounded-full bg-destructive" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-mono text-2xl font-semibold tabular-nums text-destructive">
              {formatCount(hubCancelled)}
            </span>
            <span className="text-xs text-muted-foreground">
              {copy.metrics.transfersUnit}
            </span>
          </div>
        </Item>
      </div>

      <AppListFrame toolbar={toolbar}>
        <DataTable
          columns={columns}
          data={filtered}
          getRowKey={(row) =>
            row.kind === "request"
              ? `request-${row.requestId}`
              : `transfer-${row.transferId}`
          }
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
              ? "Tạo điều chuyển khi điểm vận hành cần bổ sung nguyên liệu."
              : "Thử thay đổi phân loại, trạng thái hoặc từ khóa tìm kiếm."
          }
          emptyMode={
            search || work !== "all" || state !== "all"
              ? "no-results"
              : "no-data"
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
    </div>
    <AppDialog
        variant="document"
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) replaceDetail({ requestId: null, transferId: null });
        }}
        title={dialogTitle}
        description={dialogDescription}
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
                  editHref={hubRequestEditHref({
                    branchId: selectedRequest.data.branchId,
                    requestId: selectedRequest.data.id,
                    pathname,
                    searchParams: new URLSearchParams(
                      searchParams.toString(),
                    ),
                  })}
                />
              ) : null
            }
          />
        ) : null}
      </AppDialog>
    </>
  );
}

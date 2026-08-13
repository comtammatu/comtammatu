/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator UI */
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ChevronRight as IconChevronRight,
  ListFilter as IconFilter,
  Search as IconSearch,
  Truck as IconTruck,
  X as IconX,
} from "lucide-react";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { formatVNDate } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";

import {
  ToggleGroup,
  ToggleGroupItem,
} from "@comtammatu/ui/components/toggle-group";
import {
  AppEmptyState,
  AppSheet,
} from "@/components/surface";
import { matchesSearch } from "@lib/search";
import type { StockFulfillmentRow } from "@lib/inventory/stock-fulfillment-data";
import {
  STOCK_FULFILLMENT_LIFECYCLE_LABELS,
  filterStockFulfillmentRows,
  stockFulfillmentBranchProgressLines,
  stockFulfillmentLinkedTransferNumbers,
  stockFulfillmentProgressLines,
  stockFulfillmentRowHref,
  stockFulfillmentRowTitle,
  type StockFulfillmentStateFilter,
  type StockFulfillmentWorkFilter,
} from "@lib/inventory/stock-fulfillment-hub-model";
import { BranchOperatorPanel } from "@lib/branch-operator/components/branch-operator-page";
import { messages } from "@lib/messages";

const copy = messages.inventory.stockRequests.journey;

function lifecycleVariant(
  lifecycle: StockFulfillmentRow["lifecycle"],
): "destructive" | "success" | "warning" {
  if (lifecycle === "cancelled") return "destructive";
  if (lifecycle === "completed") return "success";
  return "warning";
}

export function BranchStockFulfillmentHubClient({
  rows,
  mode,
  branchId,
}: {
  rows: StockFulfillmentRow[];
  mode: "branch" | "central";
  branchId: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [filterOpen, setFilterOpen] = useState(false);

  const rawWork =
    searchParams.get("work") ??
    (searchParams.get("queue") === "receive" ? "receive" : null);
  const rawState = searchParams.get("state");
  // Branch: ignore work=request/dispatch toggles. Keep work=receive as soft
  // focus from home /receive redirects — not a document-type toggle.
  // List = YCH journeys + inbound receive-ready manual DCs (from projection).
  const resolvedWork: StockFulfillmentWorkFilter =
    mode === "branch"
      ? rawWork === "receive"
        ? "receive"
        : "all"
      : rawWork === "request" ||
          rawWork === "dispatch" ||
          rawWork === "receive"
        ? rawWork
        : "all";
  const stateDefault: StockFulfillmentStateFilter =
    mode === "branch" ? "active" : "all";
  const state: StockFulfillmentStateFilter =
    rawState === "active" ||
    rawState === "completed" ||
    rawState === "cancelled" ||
    rawState === "all"
      ? rawState
      : stateDefault;
  const search = searchParams.get("q") ?? "";
  const receiveFocus = mode === "branch" && resolvedWork === "receive";

  function replaceParam(key: string, value: string, defaultValue: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === defaultValue || value === "") params.delete(key);
    else params.set(key, value);
    params.delete("page");
    params.delete("requestId");
    params.delete("transferId");
    if (key === "work") params.delete("queue");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }

  function clearReceiveFocus() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("work");
    params.delete("queue");
    params.delete("page");
    params.delete("requestId");
    params.delete("transferId");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }

  const filtered = useMemo(() => {
    // Branch projection already limits manual DCs to inbound receive-ready.
    const next = filterStockFulfillmentRows(rows, {
      work: resolvedWork,
      state,
      search,
      matchesSearch,
      omitLinkedTransferSearch: mode === "branch",
    });
    if (mode !== "branch") return next;
    // YCH-first, then inbound DCs; newest within each kind.
    return next.toSorted((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === "request" ? -1 : 1;
      }
      return right.createdAt.localeCompare(left.createdAt);
    });
  }, [mode, rows, search, state, resolvedWork]);

  const hasFilters =
    (mode === "branch"
      ? receiveFocus || state !== stateDefault || search.length > 0
      : resolvedWork !== "all" || state !== stateDefault || search.length > 0);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <InputGroup size="touch" className="w-full">
        <InputGroupAddon align="inline-start">
          <IconSearch />
        </InputGroupAddon>
        <InputGroupInput
          value={search}
          onChange={(event) => replaceParam("q", event.target.value, "")}
          placeholder={
            mode === "branch"
              ? "Tìm mã yêu cầu hoặc phiếu nhận"
              : "Tìm mã phiếu hoặc điểm vận hành"
          }
          aria-label={
            mode === "branch"
              ? "Tìm yêu cầu hàng hoặc phiếu nhận"
              : "Tìm hành trình giao nhận"
          }
        />
        {search ? (
          <InputGroupAddon align="inline-end">
            <Button
              type="button"
              variant="ghost"
              size="icon-touch"
              aria-label={ACTIONS_VI.clearFilter}
              onClick={() => replaceParam("q", "", "")}
            >
              <IconX />
            </Button>
          </InputGroupAddon>
        ) : null}
      </InputGroup>

      {mode === "branch" ? (
        <div className="flex items-center gap-2">
          {receiveFocus ? (
            <Button
              type="button"
              variant="secondary"
              size="touch"
              className="min-w-0 flex-1 justify-between"
              onClick={clearReceiveFocus}
            >
              <span className="truncate">Đang lọc: cần nhận</span>
              <IconX data-icon="inline-end" />
            </Button>
          ) : (
            <p className="min-w-0 flex-1 text-sm text-muted-foreground">
              Yêu cầu hàng và phiếu đang tới
            </p>
          )}
          <Button
            type="button"
            variant={state !== stateDefault ? "secondary" : "outline"}
            size="icon-touch"
            aria-label="Lọc trạng thái"
            onClick={() => setFilterOpen(true)}
          >
            <IconFilter />
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <ToggleGroup
            type="single"
            value={resolvedWork}
            onValueChange={(value) => {
              if (
                value === "all" ||
                value === "request" ||
                value === "dispatch" ||
                value === "receive"
              ) {
                replaceParam("work", value, "all");
              }
            }}
            size="touch"
            className="grid min-w-0 flex-1 grid-cols-4"
            aria-label="Phân loại hành trình"
          >
            <ToggleGroupItem value="all">Tất cả</ToggleGroupItem>
            <ToggleGroupItem value="request">YCH</ToggleGroupItem>
            <ToggleGroupItem value="dispatch">Giao</ToggleGroupItem>
            <ToggleGroupItem value="receive">Nhận</ToggleGroupItem>
          </ToggleGroup>
          <Button
            type="button"
            variant={state !== "all" ? "secondary" : "outline"}
            size="icon-touch"
            aria-label="Lọc trạng thái"
            onClick={() => setFilterOpen(true)}
          >
            <IconFilter />
          </Button>
        </div>
      )}

      <BranchOperatorPanel
        title={copy.hubTitle}
        description={
          mode === "branch"
            ? copy.branchHubDescription
            : copy.centralHubDescription
        }
        icon={IconTruck}
        badge={{ children: filtered.length }}
        size="sm"
        action={
          hasFilters ? (
            <Button
              type="button"
              variant="ghost"
              size="touch"
              onClick={() => {
                const params = new URLSearchParams(searchParams.toString());
                params.delete("work");
                params.delete("queue");
                params.delete("q");
                params.delete("page");
                params.delete("requestId");
                params.delete("transferId");
                if (stateDefault === "all") params.delete("state");
                else params.set("state", stateDefault);
                // Branch default state=active is implicit — drop it from URL.
                if (mode === "branch") params.delete("state");
                const query = params.toString();
                router.replace(query ? `${pathname}?${query}` : pathname, {
                  scroll: false,
                });
              }}
            >
              {ACTIONS_VI.clearFilters}
            </Button>
          ) : undefined
        }
      >
        {filtered.length === 0 ? (
          <AppEmptyState
            compact
            mode="no-data"
            title={
              receiveFocus
                ? "Không có phiếu cần nhận"
                : "Không có hành trình phù hợp"
            }
            description={
              mode === "branch"
                ? receiveFocus
                  ? "Khi hàng đang giao tới chi nhánh (YCH hoặc điều chuyển), phiếu sẽ hiện ở đây để xác nhận."
                  : "Tạo yêu cầu hàng khi điểm vận hành cần bổ sung nguyên liệu."
                : "Thử thay đổi phân loại, trạng thái hoặc từ khóa tìm kiếm."
            }
          />
        ) : (
          <ItemGroup className="grid gap-2">
            {filtered.map((row) => {
              const href = stockFulfillmentRowHref(row, branchId, {
                // Branch list opens YCH; receive pad only from receive focus
                // (home queue / /stock/receive redirect) or central filters.
                preferWork:
                  mode === "branch"
                    ? receiveFocus
                      ? "receive"
                      : undefined
                    : resolvedWork,
              });
              const progressLines =
                mode === "branch"
                  ? stockFulfillmentBranchProgressLines(row)
                  : stockFulfillmentProgressLines(row);
              const linkedTransfers =
                mode === "central"
                  ? stockFulfillmentLinkedTransferNumbers(row)
                  : [];
              const showReceiveCta = row.workKinds.includes("receive");
              return (
                <Item
                  key={
                    row.kind === "request"
                      ? `request-${row.requestId}`
                      : `transfer-${row.transferId}`
                  }
                  variant="outline"
                  className="min-h-20 touch-manipulation"
                  render={<Link href={href} scroll={false} />}
                >
                  <ItemContent className="min-w-0 gap-1 text-left">
                    <ItemTitle
                      size="heading"
                      className="flex flex-wrap items-center gap-2"
                    >
                    <Badge variant="outline">
                      {row.kind === "request" ? "YCH" : "DC"}
                    </Badge>
                    <span className="font-mono tabular-nums">
                      {row.documentNumber}
                    </span>
                  </ItemTitle>
                  {mode === "central" || row.kind === "manual_transfer" ? (
                    <ItemDescription className="line-clamp-none">
                      {stockFulfillmentRowTitle(row)}
                    </ItemDescription>
                  ) : null}
                    <ItemDescription className="line-clamp-2">
                      {progressLines.join(" · ")}
                    </ItemDescription>
                    {linkedTransfers.length > 0 ? (
                      <ItemDescription className="font-mono tabular-nums">
                        {copy.linkedTransferLabel}: {linkedTransfers.join(", ")}
                      </ItemDescription>
                    ) : null}
                    {row.kind === "request" && row.neededAt ? (
                      <ItemDescription>
                        Cần trước {formatVNDate(row.neededAt)}
                      </ItemDescription>
                    ) : null}
                  </ItemContent>
                  <ItemActions>
                    {showReceiveCta ? (
                      <Badge variant="default">{copy.receiveCta}</Badge>
                    ) : (
                      <Badge variant={lifecycleVariant(row.lifecycle)}>
                        {STOCK_FULFILLMENT_LIFECYCLE_LABELS[row.lifecycle]}
                      </Badge>
                    )}
                    <IconChevronRight className="size-4 text-muted-foreground" />
                  </ItemActions>
                </Item>
              );
            })}
          </ItemGroup>
        )}
      </BranchOperatorPanel>

      <AppSheet
        open={filterOpen}
        onOpenChange={setFilterOpen}
        title="Trạng thái"
        side="bottom"
        contentClassName="flex max-h-dvh-80 flex-col"
        headerClassName="text-left"
        footerClassName="border-t bg-background"
        footer={
          <Button
            type="button"
            size="touch"
            className="w-full"
            onClick={() => setFilterOpen(false)}
          >
            {ACTIONS_VI.close}
          </Button>
        }
      >
        <ToggleGroup
          type="single"
          value={state}
          onValueChange={(value) => {
            if (
              value === "all" ||
              value === "active" ||
              value === "completed" ||
              value === "cancelled"
            ) {
              replaceParam("state", value, stateDefault);
            }
          }}
          size="touch"
          className="grid w-full grid-cols-2 gap-2"
          aria-label="Lọc trạng thái hành trình"
        >
          <ToggleGroupItem value="all">Tất cả</ToggleGroupItem>
          <ToggleGroupItem value="active">Đang xử lý</ToggleGroupItem>
          <ToggleGroupItem value="completed">Hoàn tất</ToggleGroupItem>
          <ToggleGroupItem value="cancelled">Đã hủy</ToggleGroupItem>
        </ToggleGroup>
      </AppSheet>
    </div>
  );
}

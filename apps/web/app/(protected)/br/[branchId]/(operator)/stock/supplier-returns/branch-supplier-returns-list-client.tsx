"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowLeft as IconArrowLeft,
  ChevronRight as IconChevronRight,
  FileText as IconFileText,
  Search as IconSearch,
} from "lucide-react";
import { formatVNDateTime } from "@comtammatu/shared/time";
import { ACTIONS_VI, INVENTORY_VI } from "@comtammatu/shared/messages";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { AppEmptyState } from "@/components/surface";
import { StatusBadge } from "@/components/status-badge";
import {
  BranchOperatorControlBar,
  BranchOperatorPage,
  BranchOperatorPanel,
} from "@lib/branch-operator/components/branch-operator-page";
import {
  filterBranchSupplierReturns,
  type BranchSupplierReturn,
  type BranchSupplierReturnStatusFilter,
} from "@lib/inventory/supplier-return-model";
import { messages } from "@lib/messages";

const copy = messages.inventory.supplierReturns;

const statusOptions: Array<{
  value: BranchSupplierReturnStatusFilter;
  label: string;
}> = [
  { value: "all", label: copy.allStatuses },
  { value: "draft", label: copy.statusLabels.draft },
  { value: "sent", label: copy.statusLabels.sent },
  { value: "credited", label: copy.statusLabels.credited },
  { value: "refunded", label: copy.statusLabels.refunded },
  { value: "cancelled", label: copy.statusLabels.cancelled },
];

export function BranchSupplierReturnsListClient({
  branchId,
  branchName,
  returns,
  canCreate,
}: {
  branchId: number;
  branchName: string;
  returns: BranchSupplierReturn[];
  canCreate: boolean;
}) {
  const stockBasePath = `/br/${branchId}/stock`;
  const returnsBasePath = `${stockBasePath}/supplier-returns`;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<BranchSupplierReturnStatusFilter>("all");
  const filteredReturns = useMemo(
    () => filterBranchSupplierReturns(returns, { query: search, status }),
    [returns, search, status],
  );
  const hasFilter = search.trim().length > 0 || status !== "all";

  return (
    <BranchOperatorPage
      title={INVENTORY_VI.supplierReturnsTitle}
      description={branchName}
      hideHeaderOnMobile
      action={
        canCreate ? (
          <Button asChild size="touch">
            <Link href={`${returnsBasePath}/new`}>{ACTIONS_VI.create}</Link>
          </Button>
        ) : undefined
      }
    >
      <div className="flex min-w-0 touch-manipulation flex-col gap-3 pb-28">
        <BranchOperatorControlBar className="sm:hidden">
          <Button
            asChild
            variant="ghost"
            size="icon-touch"
            title={ACTIONS_VI.back}
          >
            <Link href={stockBasePath} aria-label={ACTIONS_VI.back}>
              <IconArrowLeft />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {INVENTORY_VI.supplierReturnsTitle}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {branchName}
            </p>
          </div>
          {canCreate ? (
            <Button asChild size="touch" className="shrink-0">
              <Link href={`${returnsBasePath}/new`}>{ACTIONS_VI.create}</Link>
            </Button>
          ) : null}
        </BranchOperatorControlBar>

        <BranchOperatorPanel
          title={INVENTORY_VI.supplierReturnsTitle}
          description={copy.branchQueueDescription}
          icon={IconFileText}
          size="sm"
          contentClassName="gap-3"
        >
          <div className="grid min-w-0 gap-2 lg:grid-cols-[minmax(0,1fr)_12rem]">
            <InputGroup className="min-w-0">
              <InputGroupAddon>
                <IconSearch />
              </InputGroupAddon>
              <InputGroupInput
                aria-label={copy.searchPlaceholder}
                autoComplete="off"
                inputMode="search"
                name="branch-supplier-return-search"
                placeholder={copy.searchPlaceholder}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </InputGroup>
            <Select
              value={status}
              onValueChange={(value) =>
                setStatus(value as BranchSupplierReturnStatusFilter)
              }
            >
              <SelectTrigger
                aria-label={copy.allStatuses}
                size="touch"
                className="w-full"
              >
                <SelectValue placeholder={copy.allStatuses} />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {returns.length > 0 ? (
            <Badge variant="outline" className="w-fit rounded-full">
              {filteredReturns.length}/{returns.length}
            </Badge>
          ) : null}

          {filteredReturns.length === 0 ? (
            <AppEmptyState
              compact
              mode={hasFilter ? "no-results" : "no-data"}
              icon={<IconFileText />}
              title={hasFilter ? copy.emptyFiltered : copy.emptyNoData}
              description={hasFilter ? undefined : copy.branchQueueDescription}
            />
          ) : (
            <ItemGroup className="gap-2" role="list">
              {filteredReturns.map((returnRecord) => (
                <div key={returnRecord.id} role="listitem">
                  <Item
                    asChild
                    variant="outline"
                    className={
                      returnRecord.status === "cancelled"
                        ? "min-h-16 touch-manipulation opacity-60"
                        : "min-h-16 touch-manipulation"
                    }
                  >
                    <Link href={`${returnsBasePath}/${returnRecord.id}`}>
                      <ItemContent className="min-w-0 gap-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <ItemTitle className="truncate font-mono text-sm font-semibold">
                            {returnRecord.code}
                          </ItemTitle>
                          <StatusBadge
                            domain="inventory"
                            value={returnRecord.status}
                            size="sm"
                          />
                        </div>
                        <ItemDescription className="line-clamp-none flex flex-wrap gap-x-2 gap-y-1 text-xs">
                          <span>{returnRecord.supplierName}</span>
                          {returnRecord.grnNumber ? (
                            <span className="font-mono">
                              {returnRecord.grnNumber}
                            </span>
                          ) : null}
                          <span>
                            {formatVNDateTime(returnRecord.createdAt)}
                          </span>
                        </ItemDescription>
                      </ItemContent>
                      <ItemActions className="self-center text-muted-foreground">
                        <IconChevronRight />
                      </ItemActions>
                    </Link>
                  </Item>
                </div>
              ))}
            </ItemGroup>
          )}
        </BranchOperatorPanel>
      </div>
    </BranchOperatorPage>
  );
}

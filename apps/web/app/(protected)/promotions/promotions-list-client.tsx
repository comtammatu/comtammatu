"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search as IconSearch, TicketPercent as IconTicket } from "lucide-react";
import { FORM_VI, PROMOTIONS_VI } from "@comtammatu/shared/messages";
import { formatPercent, formatVND } from "@comtammatu/shared/format";
import { formatVNDate } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import { InteractiveCard } from "@comtammatu/ui/components/interactive-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Tabs, TabsList, TabsTrigger } from "@comtammatu/ui/components/tabs";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  OWNER_SHELL_BREAKPOINT,
  useIsMobile,
} from "@comtammatu/ui/hooks/use-mobile";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { confirm } from "@/components/confirm-dialog";
import { KpiCard } from "@/components/kpi/kpi-card";
import {
  RowActionsContextMenuItems,
  RowActionsMenu,
  type RowActionItem,
} from "@/components/row-actions-menu";
import { StatusBadge } from "@/components/status-badge";
import { AppListFrame, AppToolbar, KpiRow } from "@/components/surface";
import { useDocumentOverlayUrl } from "@lib/navigation/use-document-overlay-url";
import { PROMOTION_KINDS, promotionKindLabel } from "@lib/promotions/kinds";
import { deletePromotion, setPromotionStatus } from "./actions";
import { PromotionQuickViewSheet } from "./promotion-quick-view-sheet";

export type PromotionListRow = {
  id: number;
  name: string;
  kind: string;
  status: string;
  discountType: string | null;
  discountValue: number | null;
  minSubtotal: number;
  maxDiscountAmount: number | null;
  bxgyBuyQty: number | null;
  bxgyGetQty: number | null;
  freeSideQty: number | null;
  freeItemQty: number | null;
  reusableCode: string | null;
  totalCodesCount: number;
  uniqueCodesCount: number;
  activeCodesCount: number;
  redeemedCodesCount: number;
  startsAt: string | null;
  endsAt: string | null;
  branchIds?: number[];
};

export function getPromotionBenefit(row: PromotionListRow): string {
  if (row.kind === "order_pct") {
    const val = row.discountValue ?? 0;
    const maxText =
      row.maxDiscountAmount != null && row.maxDiscountAmount > 0
        ? formatVND(row.maxDiscountAmount)
        : undefined;
    return PROMOTIONS_VI.benefitOrderPct(formatPercent(val), maxText);
  }
  if (row.kind === "order_vnd") {
    const val = row.discountValue ?? 0;
    return PROMOTIONS_VI.benefitOrderVnd(formatVND(val));
  }
  if (row.kind === "voucher_face") {
    const val = row.discountValue ?? 0;
    return PROMOTIONS_VI.benefitVoucherFace(formatVND(val));
  }
  if (row.kind === "auto_order") {
    const val = row.discountValue ?? 0;
    const isPct = row.discountType === "pct";
    const valText = isPct ? formatPercent(val) : formatVND(val);
    const maxText =
      isPct && row.maxDiscountAmount != null && row.maxDiscountAmount > 0
        ? formatVND(row.maxDiscountAmount)
        : undefined;
    return PROMOTIONS_VI.benefitAutoOrder(valText, maxText);
  }
  if (row.kind === "bxgy") {
    return PROMOTIONS_VI.benefitBxgy(row.bxgyBuyQty ?? 2, row.bxgyGetQty ?? 1);
  }
  if (row.kind === "free_side") {
    return PROMOTIONS_VI.benefitFreeSide(row.freeSideQty ?? 1);
  }
  if (row.kind === "free_item") {
    return PROMOTIONS_VI.benefitFreeItem(row.freeItemQty);
  }
  return "—";
}

export function PromotionsListClient({
  rows,
  branches = [],
}: {
  rows: PromotionListRow[];
  branches?: Array<{ id: number; name: string }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const { values: overlayValues, patchOverlay } = useDocumentOverlayUrl([
    "promotionId",
  ] as const);
  const selectedId = overlayValues.promotionId
    ? Number(overlayValues.promotionId)
    : null;
  const selectedPromotion = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? null,
    [rows, selectedId],
  );

  const isTouchLayout = useIsMobile(OWNER_SHELL_BREAKPOINT);
  const controlSize = isTouchLayout ? "touch" : "default";

  const branchMap = useMemo(
    () => new Map(branches.map((b) => [b.id, b.name])),
    [branches],
  );

  const selectedBranchNames = useMemo(() => {
    if (!selectedPromotion?.branchIds) return [];
    return selectedPromotion.branchIds.map(
      (id) => branchMap.get(id) ?? String(id),
    );
  }, [selectedPromotion, branchMap]);

  const counts = useMemo(() => {
    return {
      all: rows.length,
      active: rows.filter((r) => r.status === "active").length,
      paused: rows.filter((r) => r.status === "paused").length,
      ended: rows.filter((r) => r.status === "ended").length,
      draft: rows.filter((r) => r.status === "draft").length,
    };
  }, [rows]);

  const kpiMetrics = useMemo(() => {
    const activeCount = counts.active;
    const pausedOrDraftCount = counts.paused + counts.draft;
    const totalCodes = rows.reduce((sum, r) => sum + r.totalCodesCount, 0);
    const redeemedCodes = rows.reduce(
      (sum, r) => sum + r.redeemedCodesCount,
      0,
    );
    const rateStr =
      totalCodes > 0
        ? formatPercent((redeemedCodes / totalCodes) * 100, 0)
        : formatPercent(0, 0);

    return {
      activeCount,
      pausedOrDraftCount,
      totalCodes,
      redeemedCodes,
      rateStr,
    };
  }, [rows, counts]);

  const filteredRows = useMemo(() => {
    let list = rows;
    if (statusFilter !== "all") {
      list = list.filter((r) => r.status === statusFilter);
    }
    if (kindFilter !== "all") {
      list = list.filter((r) => r.kind === kindFilter);
    }
    if (branchFilter !== "all") {
      const bId = Number(branchFilter);
      list = list.filter((r) => r.branchIds?.includes(bId));
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((r) => {
        const nameMatch = r.name.toLowerCase().includes(q);
        const codeMatch = r.reusableCode?.toLowerCase().includes(q);
        const kindMatch = promotionKindLabel(r.kind).toLowerCase().includes(q);
        return nameMatch || codeMatch || kindMatch;
      });
    }
    return list;
  }, [rows, statusFilter, kindFilter, branchFilter, search]);

  function setStatus(
    row: PromotionListRow,
    status: "active" | "paused" | "ended",
  ) {
    startTransition(async () => {
      const result = await setPromotionStatus({ id: row.id, status });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(PROMOTIONS_VI.saved);
      router.refresh();
    });
  }

  async function handleDelete(row: PromotionListRow) {
    const ok = await confirm({
      title: PROMOTIONS_VI.deleteConfirmTitle,
      description: PROMOTIONS_VI.deleteConfirmDesc,
      variant: "destructive",
      confirmText: PROMOTIONS_VI.deleteAction,
    });
    if (!ok) return;

    startTransition(async () => {
      const result = await deletePromotion({ id: row.id });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      if (result.data?.action === "ended") {
        toast.success(PROMOTIONS_VI.archiveSuccess);
      } else {
        toast.success(PROMOTIONS_VI.deleteSuccess);
      }
      if (selectedPromotion?.id === row.id) {
        patchOverlay({ promotionId: null }, "replace");
      }
      router.refresh();
    });
  }

  function rowActions(row: PromotionListRow): RowActionItem[] {
    const items: RowActionItem[] = [
      {
        key: "edit",
        label: PROMOTIONS_VI.editTitle,
        href: `/promotions/${String(row.id)}`,
      },
    ];
    if (row.status !== "ended") {
      if (row.status !== "active") {
        items.push({
          key: "activate",
          label: PROMOTIONS_VI.activate,
          disabled: isPending,
          onSelect: () => setStatus(row, "active"),
        });
      } else {
        items.push({
          key: "pause",
          label: PROMOTIONS_VI.pause,
          disabled: isPending,
          onSelect: () => setStatus(row, "paused"),
        });
      }
      items.push({
        key: "end",
        label: PROMOTIONS_VI.end,
        disabled: isPending,
        destructive: true,
        separatorBefore: true,
        onSelect: () => setStatus(row, "ended"),
      });
    }
    items.push({
      key: "delete",
      label: PROMOTIONS_VI.deleteAction,
      disabled: isPending,
      destructive: true,
      separatorBefore: true,
      onSelect: () => handleDelete(row),
    });
    return items;
  }

  const columns: DataTableColumn<PromotionListRow>[] = [
    {
      key: "name",
      header: PROMOTIONS_VI.nameLabel,
      render: (row) => (
        <div className="flex flex-col gap-1">
          <Button
            variant="link"
            className="h-auto justify-start p-0 font-medium text-foreground"
            render={<Link href={`/promotions/${String(row.id)}`} />}
            onClick={(event) => event.stopPropagation()}
          >
            {row.name}
          </Button>
          <span className="text-xs text-muted-foreground">
            {promotionKindLabel(row.kind)}
          </span>
        </div>
      ),
    },
    {
      key: "benefit",
      header: PROMOTIONS_VI.benefitLabel,
      render: (row) => {
        const benefit = getPromotionBenefit(row);
        const minNum = row.minSubtotal;
        return (
          <div className="flex flex-col gap-1">
            <span className="font-medium text-foreground">{benefit}</span>
            {minNum > 0 ? (
              <span className="text-xs text-muted-foreground">
                {PROMOTIONS_VI.minOrderCond(formatVND(minNum))}
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "code",
      header: PROMOTIONS_VI.codeColumnTitle,
      render: (row) => {
        if (row.reusableCode) {
          return (
            <Badge variant="outline" className="font-mono text-xs uppercase">
              {row.reusableCode}
            </Badge>
          );
        }
        if (row.uniqueCodesCount > 0) {
          return (
            <Badge variant="secondary" className="text-xs">
              {PROMOTIONS_VI.codesCountLabel(
                row.uniqueCodesCount,
                row.redeemedCodesCount,
              )}
            </Badge>
          );
        }
        if (row.kind === "auto_order") {
          return (
            <span className="text-xs text-muted-foreground">
              {PROMOTIONS_VI.noCodeRequired}
            </span>
          );
        }
        return <span className="text-muted-foreground">—</span>;
      },
    },
    {
      key: "schedule",
      header: PROMOTIONS_VI.periodLabel,
      render: (row) => {
        if (!row.startsAt && !row.endsAt) {
          return (
            <span className="text-xs text-muted-foreground">
              {PROMOTIONS_VI.periodUnlimited}
            </span>
          );
        }
        return (
          <span className="text-xs tabular-nums text-muted-foreground">
            {row.startsAt ? formatVNDate(row.startsAt) : "—"}
            {" → "}
            {row.endsAt ? formatVNDate(row.endsAt) : "—"}
          </span>
        );
      },
    },
    {
      key: "status",
      header: PROMOTIONS_VI.statusLabel,
      render: (row) => <StatusBadge domain="promotion" value={row.status} />,
    },
    {
      key: "actions",
      header: <span className="sr-only">{FORM_VI.action}</span>,
      className: "w-12 text-right",
      render: (row) => (
        <div
          className="flex justify-end"
          onClick={(event) => event.stopPropagation()}
        >
          <RowActionsMenu
            label={`${FORM_VI.action} ${row.name}`}
            items={rowActions(row)}
            triggerSize="icon-sm"
          />
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <KpiRow
        density="compact"
        className="grid-cols-2 sm:grid-cols-2 lg:grid-cols-4"
      >
        <KpiCard
          density="compact"
          label={PROMOTIONS_VI.statActive}
          value={kpiMetrics.activeCount}
          tone="primary"
        />
        <KpiCard
          density="compact"
          label={PROMOTIONS_VI.statPausedOrDraft}
          value={kpiMetrics.pausedOrDraftCount}
          tone="neutral"
        />
        <KpiCard
          density="compact"
          label={PROMOTIONS_VI.statTotalCodes}
          value={kpiMetrics.totalCodes}
          tone="neutral"
        />
        <KpiCard
          density="compact"
          label={PROMOTIONS_VI.statRedeemedCodes}
          value={kpiMetrics.redeemedCodes}
          hint={PROMOTIONS_VI.redemptionRate(kpiMetrics.rateStr)}
          tone="success"
        />
      </KpiRow>

      <AppListFrame
        toolbar={
          <AppToolbar
            variant="inline"
            className="flex-wrap"
            search={
              <InputGroup size={controlSize} className="w-full sm:w-72">
                <InputGroupAddon>
                  <IconSearch className="size-4" />
                </InputGroupAddon>
                <InputGroupInput
                  type="search"
                  placeholder={PROMOTIONS_VI.searchPlaceholder}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </InputGroup>
            }
            filters={
              <div className="flex flex-wrap items-center gap-2">
                <Tabs
                  value={statusFilter}
                  onValueChange={(val) => setStatusFilter(val)}
                >
                  <TabsList size={controlSize} className="flex-wrap">
                    <TabsTrigger value="all">
                      {PROMOTIONS_VI.filterAll}
                      {counts.all > 0 ? ` (${String(counts.all)})` : ""}
                    </TabsTrigger>
                    <TabsTrigger value="active">
                      {PROMOTIONS_VI.filterActive}
                      {counts.active > 0 ? ` (${String(counts.active)})` : ""}
                    </TabsTrigger>
                    <TabsTrigger value="paused">
                      {PROMOTIONS_VI.filterPaused}
                      {counts.paused > 0 ? ` (${String(counts.paused)})` : ""}
                    </TabsTrigger>
                    <TabsTrigger value="ended">
                      {PROMOTIONS_VI.filterEnded}
                      {counts.ended > 0 ? ` (${String(counts.ended)})` : ""}
                    </TabsTrigger>
                    {counts.draft > 0 ? (
                      <TabsTrigger value="draft">
                        {PROMOTIONS_VI.filterDraft} ({String(counts.draft)})
                      </TabsTrigger>
                    ) : null}
                  </TabsList>
                </Tabs>

                <Select value={kindFilter} onValueChange={setKindFilter}>
                  <SelectTrigger
                    size={controlSize}
                    className="w-40"
                    aria-label={PROMOTIONS_VI.filterKind}
                  >
                    <SelectValue placeholder={PROMOTIONS_VI.filterKind} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {PROMOTIONS_VI.filterAllKinds}
                    </SelectItem>
                    {PROMOTION_KINDS.map((kind) => (
                      <SelectItem key={kind} value={kind}>
                        {promotionKindLabel(kind)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {branches.length > 0 ? (
                  <Select
                    value={branchFilter}
                    onValueChange={setBranchFilter}
                  >
                    <SelectTrigger
                      size={controlSize}
                      className="w-40"
                      aria-label={PROMOTIONS_VI.filterBranch}
                    >
                      <SelectValue placeholder={PROMOTIONS_VI.filterBranch} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        {PROMOTIONS_VI.filterAllBranches}
                      </SelectItem>
                      {branches.map((b) => (
                        <SelectItem key={b.id} value={String(b.id)}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
              </div>
            }
          />
        }
      >
        <DataTable
          columns={columns}
          data={filteredRows}
          getRowKey={(row) => row.id}
          emptyTitle={PROMOTIONS_VI.emptyTitle}
          emptyDescription={PROMOTIONS_VI.emptyDescription}
          emptyIcon={<IconTicket className="size-8 text-muted-foreground" />}
          rowClassName={() => (isPending ? "opacity-60" : undefined)}
          onRowClick={(row) => patchOverlay({ promotionId: row.id }, "push")}
          renderRowContextMenu={(row) => (
            <RowActionsContextMenuItems items={rowActions(row)} />
          )}
          mobileCardRender={(row) => (
            <PromotionMobileCard
              row={row}
              actions={rowActions(row)}
              onOpen={() => patchOverlay({ promotionId: row.id }, "push")}
            />
          )}
        />
      </AppListFrame>

      <PromotionQuickViewSheet
        open={selectedPromotion != null}
        onOpenChange={(open) => {
          if (!open) patchOverlay({ promotionId: null }, "replace");
        }}
        promotion={selectedPromotion}
        branchNames={selectedBranchNames}
        benefitText={
          selectedPromotion ? getPromotionBenefit(selectedPromotion) : ""
        }
        onStatusChange={setStatus}
        onDelete={handleDelete}
        isPending={isPending}
      />
    </div>
  );
}

function PromotionMobileCard({
  row,
  actions,
  onOpen,
}: {
  row: PromotionListRow;
  actions: RowActionItem[];
  onOpen: () => void;
}) {
  const isTouchLayout = useIsMobile(OWNER_SHELL_BREAKPOINT);
  const benefit = getPromotionBenefit(row);

  return (
    <InteractiveCard
      minHeight="mobile"
      padding="default"
      role="button"
      tabIndex={0}
      className="w-full flex-col items-stretch gap-2 text-left"
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              {row.name}
            </span>
            <StatusBadge domain="promotion" value={row.status} />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {promotionKindLabel(row.kind)}
          </p>
        </div>
        <div
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <RowActionsMenu
            items={actions}
            label={`${FORM_VI.action} ${row.name}`}
            triggerSize={isTouchLayout ? "icon-touch" : "icon"}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-foreground">{benefit}</span>
        {row.reusableCode ? (
          <Badge variant="outline" className="font-mono text-xs uppercase">
            {row.reusableCode}
          </Badge>
        ) : row.uniqueCodesCount > 0 ? (
          <Badge variant="secondary" className="text-xs">
            {PROMOTIONS_VI.codesCountLabel(
              row.uniqueCodesCount,
              row.redeemedCodesCount,
            )}
          </Badge>
        ) : null}
      </div>

      <div className="flex items-center justify-between border-t pt-2 text-xs text-muted-foreground">
        <span>
          {row.startsAt || row.endsAt
            ? `${row.startsAt ? formatVNDate(row.startsAt) : "—"} → ${row.endsAt ? formatVNDate(row.endsAt) : "—"}`
            : PROMOTIONS_VI.periodUnlimited}
        </span>
        {row.minSubtotal > 0 ? (
          <span>{PROMOTIONS_VI.minOrderCond(formatVND(row.minSubtotal))}</span>
        ) : null}
      </div>
    </InteractiveCard>
  );
}

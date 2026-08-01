"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronRight as IconChevronRight,
  FileText as IconFileText,
  Plus as IconPlus,
  Receipt as IconReceipt,
  RotateCcw as IconReset,
  Search as IconSearch,
  Trash as IconTrash,
} from "lucide-react";
import {
  ACTIONS_VI,
  FORM_VI,
  INVENTORY_VI,
  KDS_VI,
} from "@comtammatu/shared/messages";
import { formatVNDateTime } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
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
import { toast } from "@comtammatu/ui/components/sonner";
import { AppEmptyState } from "@/components/surface";
import { getStatusBadgeMeta, StatusBadge } from "@/components/status-badge";
import { discardGrnDraft } from "@/(protected)/inventory/grn-actions";
import {
  BranchOperatorPage,
  BranchOperatorPanel,
} from "@lib/branch-operator/components/branch-operator-page";
import {
  filterGrnListRows,
  GRN_LIST_STATUS_FILTER_VALUES,
  grnDetailHref,
  grnProcurementStepChip,
  grnProcurementStepChipLabel,
  type GrnDraftRow,
  type GrnListStatusFilter,
  type GrnRow,
} from "@lib/inventory/grn-list-model";
import { messages } from "@lib/messages";

const grnCopy = messages.inventory.grn;

type BranchGrnRow = Pick<
  GrnRow,
  | "id"
  | "code"
  | "supplierName"
  | "poId"
  | "poCode"
  | "poCount"
  | "poStatus"
  | "date"
  | "status"
  | "qcIssueCount"
>;

type BranchGrnDraftRow = Pick<
  GrnDraftRow,
  | "grnId"
  | "supplierId"
  | "poId"
  | "poCode"
  | "poCount"
  | "poStatus"
  | "supplierName"
  | "grnNumber"
  | "updatedAt"
  | "lineCount"
  | "qcIssueCount"
>;

const statusFilterLabels: Record<GrnListStatusFilter, string> = {
  all: KDS_VI.filterAll,
  draft: getStatusBadgeMeta("inventory", "draft").label,
  confirmed: getStatusBadgeMeta("inventory", "confirmed").label,
  cancelled: getStatusBadgeMeta("inventory", "cancelled").label,
};

const statusFilterOptions = GRN_LIST_STATUS_FILTER_VALUES.map((value) => ({
  value,
  label: statusFilterLabels[value],
}));

function BranchGrnDraftItem({
  branchId,
  draft,
  disabled,
  onDiscard,
}: {
  branchId: number;
  draft: BranchGrnDraftRow;
  disabled: boolean;
  onDiscard: (draft: BranchGrnDraftRow) => void;
}) {
  const basePath = `/br/${branchId}/stock/grn`;
  const href = `${basePath}/${draft.grnId}`;

  return (
    <Item
      role="listitem"
      variant="outline"
      className="min-h-20 items-center gap-2 p-0 touch-manipulation"
    >
      <Link
        href={href}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : undefined}
        onClick={(event) => {
          if (disabled) event.preventDefault();
        }}
        className={`flex min-w-0 flex-1 self-stretch items-center gap-3 px-3 py-2 ${
          disabled ? "pointer-events-none opacity-60" : ""
        }`}
      >
        <ItemContent className="min-w-0 gap-1">
          <ItemTitle size="heading" className="line-clamp-none">
            {draft.supplierName}
          </ItemTitle>
          <ItemDescription className="line-clamp-none flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono">{draft.grnNumber}</span>
            {draft.poCount > 0 && draft.poCode ? (
              <span className="font-mono">
                {draft.poCode}
                {draft.poCount > 1 ? ` · ${draft.poCount} PO` : ""}
              </span>
            ) : null}
            <span>
              {INVENTORY_VI.grnDraftUpdatedAt(
                formatVNDateTime(draft.updatedAt),
              )}
            </span>
          </ItemDescription>
        </ItemContent>
        <ItemActions className="shrink-0">
          <Badge variant="warning">
            {INVENTORY_VI.grnDraftLineCount(draft.lineCount)}
          </Badge>
          {(() => {
            const step = grnProcurementStepChip({
              status: "draft",
              poId: draft.poId,
              poCount: draft.poCount,
              poStatus: draft.poStatus,
            });
            return step ? (
              <Badge variant="outline">
                {grnProcurementStepChipLabel(step, grnCopy)}
              </Badge>
            ) : null;
          })()}
          {draft.qcIssueCount > 0 ? (
            <Badge variant="destructive">
              {messages.inventory.grn.qcIssueCount(draft.qcIssueCount)}
            </Badge>
          ) : null}
          <IconChevronRight className="size-4 text-muted-foreground" />
        </ItemActions>
      </Link>
      {draft.poId == null && draft.poCount === 0 ? (
        <Button
          type="button"
          variant="outline"
          size="icon-touch"
          className="mr-2 shrink-0 border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive"
          aria-label={`${ACTIONS_VI.delete} ${draft.grnNumber}`}
          title={ACTIONS_VI.delete}
          disabled={disabled}
          onClick={() => onDiscard(draft)}
        >
          <IconTrash className="size-4" />
        </Button>
      ) : null}
    </Item>
  );
}

function BranchGrnListItem({
  branchId,
  grn,
}: {
  branchId: number;
  grn: BranchGrnRow;
}) {
  return (
    <div role="listitem">
      <Item
        variant="outline"
        className={
          grn.status === "cancelled"
            ? "min-h-20 touch-manipulation opacity-60"
            : "min-h-20 touch-manipulation"
        }
        render={
          <Link href={grnDetailHref(`/br/${branchId}/stock/grn`, grn.id)} />
        }
      >
        <ItemContent className="min-w-0 gap-1">
          <ItemTitle size="heading" className="line-clamp-none font-mono">
            {grn.code}
          </ItemTitle>
          <ItemDescription className="line-clamp-none flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{grn.supplierName}</span>
            <span className="font-mono tabular-nums">{grn.date}</span>
            {grn.poCount > 0 && grn.poCode && grn.poCode !== "—" ? (
              <span className="font-mono">
                {grn.poCode}
                {grn.poCount > 1 ? ` · ${grn.poCount} PO` : ""}
              </span>
            ) : null}
          </ItemDescription>
        </ItemContent>
        <ItemActions className="shrink-0">
          <StatusBadge domain="inventory" value={grn.status} size="sm" />
          {(() => {
            const step = grnProcurementStepChip(grn);
            return step ? (
              <Badge variant="outline">
                {grnProcurementStepChipLabel(step, grnCopy)}
              </Badge>
            ) : null;
          })()}
          {grn.qcIssueCount > 0 ? (
            <Badge variant="warning">
              {messages.inventory.grn.qcIssueCount(grn.qcIssueCount)}
            </Badge>
          ) : null}
          <IconChevronRight className="size-4 text-muted-foreground" />
        </ItemActions>
      </Item>
    </div>
  );
}

interface BranchGrnListClientProps {
  branchId: number;
  canCreate: boolean;
  drafts: BranchGrnDraftRow[];
  draftsLoadFailed: boolean;
  grns: BranchGrnRow[];
  grnsLoadFailed: boolean;
}

export function BranchGrnListClient({
  branchId,
  canCreate,
  drafts,
  draftsLoadFailed,
  grns,
  grnsLoadFailed,
}: BranchGrnListClientProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<GrnListStatusFilter>("all");
  const [pendingDraftId, setPendingDraftId] = useState<number | null>(null);
  const filters = { query, status };
  const filtered = useMemo(
    () => filterGrnListRows(grns, filters),
    [grns, query, status],
  );
  const filtersActive = query.trim() !== "" || status !== "all";
  const showDraftPanel = draftsLoadFailed || drafts.length > 0;

  function resetFilters() {
    setQuery("");
    setStatus("all");
  }

  async function handleDiscard(draft: BranchGrnDraftRow) {
    const ok = await confirm({
      title: `${ACTIONS_VI.delete} ${draft.grnNumber}?`,
      variant: "destructive",
    });
    if (!ok) return;

    setPendingDraftId(draft.grnId);
    try {
      const result = await discardGrnDraft({
        grnId: draft.grnId,
        reason: "Người dùng hủy phiếu nháp.",
      });
      if (!result.success) {
        toast.error(result.error ?? messages.inventory.grn.loadFailed);
        return;
      }
      router.refresh();
    } finally {
      setPendingDraftId(null);
    }
  }

  return (
    <BranchOperatorPage
      title={messages.inventory.operatorFlow.grnListTitle}
      description={messages.inventory.operatorFlow.grnListDescription}
      hideHeaderOnMobile
    >
      {canCreate ? (
        <Button
          size="touch"
          className="w-full"
          render={<Link href={`/br/${branchId}/stock/grn/new`} />}
        >
          <IconPlus className="size-4" />
          {INVENTORY_VI.receivingEyebrow}
        </Button>
      ) : null}

      {showDraftPanel ? (
        <BranchOperatorPanel
          title={INVENTORY_VI.draft}
          icon={IconFileText}
          tone="warning"
          badge={
            draftsLoadFailed
              ? undefined
              : { children: drafts.length, variant: "warning" }
          }
          contentClassName="gap-3"
        >
          {draftsLoadFailed ? (
            <AppEmptyState
              compact
              mode="error"
              icon={<IconFileText />}
              title={messages.inventory.grn.draftListLoadFailed}
            >
              <Button
                type="button"
                size="touch"
                onClick={() => router.refresh()}
              >
                {ACTIONS_VI.retry}
              </Button>
            </AppEmptyState>
          ) : (
            <ItemGroup className="gap-2">
              {drafts.map((draft) => (
                <BranchGrnDraftItem
                  key={draft.grnId}
                  branchId={branchId}
                  draft={draft}
                  disabled={pendingDraftId != null}
                  onDiscard={handleDiscard}
                />
              ))}
            </ItemGroup>
          )}
        </BranchOperatorPanel>
      ) : null}

      <BranchOperatorPanel
        title={INVENTORY_VI.grnListTab}
        icon={IconReceipt}
        badge={
          grnsLoadFailed
            ? undefined
            : {
                children: `${filtered.length}/${grns.length}`,
                variant: "secondary",
              }
        }
        contentClassName="gap-3"
      >
        {grnsLoadFailed ? (
          <AppEmptyState
            compact
            mode="error"
            icon={<IconReceipt />}
            title={messages.inventory.grn.loadFailed}
          >
            <Button type="button" size="touch" onClick={() => router.refresh()}>
              {ACTIONS_VI.retry}
            </Button>
          </AppEmptyState>
        ) : (
          <>
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
              <InputGroup className="min-h-12 min-w-0 flex-1">
                <InputGroupAddon>
                  <IconSearch />
                </InputGroupAddon>
                <InputGroupInput
                  aria-label={INVENTORY_VI.grnSearchPlaceholder}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={INVENTORY_VI.grnSearchPlaceholder}
                  inputMode="search"
                />
              </InputGroup>
              <Select
                value={status}
                onValueChange={(value) =>
                  setStatus(value as GrnListStatusFilter)
                }
              >
                <SelectTrigger
                  aria-label={FORM_VI.status}
                  size="touch"
                  className="w-full sm:w-auto sm:min-w-44"
                >
                  <SelectValue placeholder={FORM_VI.status} />
                </SelectTrigger>
                <SelectContent>
                  {statusFilterOptions.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      size="touch"
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {filtersActive ? (
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-touch"
                  onClick={resetFilters}
                  aria-label={ACTIONS_VI.reset}
                  title={ACTIONS_VI.reset}
                >
                  <IconReset className="size-4" />
                </Button>
              </div>
            ) : null}

            {filtered.length === 0 ? (
              <AppEmptyState
                compact
                mode={filtersActive ? "no-results" : "no-data"}
                icon={<IconReceipt />}
                title={
                  filtersActive
                    ? INVENTORY_VI.grnNotFoundFiltered
                    : INVENTORY_VI.grnEmptyNoData
                }
              />
            ) : (
              <ItemGroup className="gap-2">
                {filtered.map((grn) => (
                  <BranchGrnListItem
                    key={grn.id}
                    branchId={branchId}
                    grn={grn}
                  />
                ))}
              </ItemGroup>
            )}
          </>
        )}
      </BranchOperatorPanel>
    </BranchOperatorPage>
  );
}

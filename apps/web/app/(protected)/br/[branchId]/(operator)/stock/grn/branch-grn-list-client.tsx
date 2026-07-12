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
import { SectionLabel } from "@comtammatu/ui/components/section-label";
import { AppEmptyState } from "@/components/surface";
import { getStatusBadgeMeta, StatusBadge } from "@/components/status-badge";
import { discardGrnDraft } from "@/(protected)/inventory/grn-actions";
import { BranchOperatorPage } from "@lib/branch-operator/components/branch-operator-page";
import {
  filterGrnListRows,
  grnDetailHref,
  hasGrnListFilters,
  type GrnDraftRow,
  type GrnListStatusFilter,
  type GrnRow,
} from "@lib/inventory/grn-list-model";
import { grnSourceSupplierHref } from "@lib/inventory/grn-source-model";
import { messages } from "@lib/messages";
import { useOperatorUrlState } from "@lib/branch-operator/use-operator-url-state";

type BranchGrnRow = Pick<
  GrnRow,
  "id" | "code" | "supplierName" | "poId" | "poCode" | "date" | "status"
>;

type BranchGrnDraftRow = Pick<
  GrnDraftRow,
  | "grnId"
  | "supplierId"
  | "poId"
  | "poCode"
  | "supplierName"
  | "grnNumber"
  | "updatedAt"
  | "lineCount"
>;

const statusFilterOptions: {
  value: GrnListStatusFilter;
  label: string;
}[] = [
  { value: "all", label: KDS_VI.filterAll },
  {
    value: "draft",
    label: getStatusBadgeMeta("inventory", "draft").label,
  },
  {
    value: "confirmed",
    label: getStatusBadgeMeta("inventory", "confirmed").label,
  },
  {
    value: "cancelled",
    label: getStatusBadgeMeta("inventory", "cancelled").label,
  },
];

function BranchGrnDraftItem({
  branchId,
  draft,
  disabled,
  onDiscard,
  returnTo,
}: {
  branchId: number;
  draft: BranchGrnDraftRow;
  disabled: boolean;
  onDiscard: (draft: BranchGrnDraftRow) => void;
  returnTo: string;
}) {
  const basePath = `/br/${branchId}/stock/grn`;
  const destination =
    draft.poId != null
      ? `${basePath}/${draft.grnId}`
      : grnSourceSupplierHref(`${basePath}/new`, draft.supplierId);
  const href = `${destination}?returnTo=${encodeURIComponent(returnTo)}`;

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
          <IconChevronRight className="size-4 text-muted-foreground" />
        </ItemActions>
      </Link>
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
    </Item>
  );
}

function BranchGrnListItem({
  branchId,
  grn,
  returnTo,
}: {
  branchId: number;
  grn: BranchGrnRow;
  returnTo: string;
}) {
  return (
    <div role="listitem">
      <Item
        asChild
        variant="outline"
        className={
          grn.status === "cancelled"
            ? "min-h-20 touch-manipulation opacity-60"
            : "min-h-20 touch-manipulation"
        }
      >
        <Link
          href={`${grnDetailHref(`/br/${branchId}/stock/grn`, grn.id)}?returnTo=${encodeURIComponent(returnTo)}`}
        >
          <ItemContent className="min-w-0 gap-1">
            <ItemTitle size="heading" className="line-clamp-none font-mono">
              {grn.code}
            </ItemTitle>
            <ItemDescription className="line-clamp-none flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>{grn.supplierName}</span>
              <span className="font-mono tabular-nums">{grn.date}</span>
            </ItemDescription>
          </ItemContent>
          <ItemActions className="shrink-0">
            <StatusBadge domain="inventory" value={grn.status} size="sm" />
            <IconChevronRight className="size-4 text-muted-foreground" />
          </ItemActions>
        </Link>
      </Item>
    </div>
  );
}

interface BranchGrnListClientProps {
  branchId: number;
  backHref: string;
  canCreate: boolean;
  drafts: BranchGrnDraftRow[];
  draftsLoadFailed: boolean;
  grns: BranchGrnRow[];
  grnsLoadFailed: boolean;
}

export function BranchGrnListClient({
  branchId,
  backHref,
  canCreate,
  drafts,
  draftsLoadFailed,
  grns,
  grnsLoadFailed,
}: BranchGrnListClientProps) {
  const router = useRouter();
  const { replaceParams, searchParams } = useOperatorUrlState();
  const query = searchParams.get("q") ?? "";
  const statusParam = searchParams.get("status");
  const status = statusFilterOptions.some(
    (option) => option.value === statusParam,
  )
    ? (statusParam as GrnListStatusFilter)
    : "all";
  const currentListParams = new URLSearchParams();
  if (backHref !== `/br/${branchId}/stock`) {
    currentListParams.set("returnTo", backHref);
  }
  if (query) currentListParams.set("q", query);
  if (status !== "all") currentListParams.set("status", status);
  const currentListQuery = currentListParams.toString();
  const currentListHref = `/br/${branchId}/stock/grn${
    currentListQuery ? `?${currentListQuery}` : ""
  }`;
  const [pendingDraftId, setPendingDraftId] = useState<number | null>(null);
  const filters = { query, status };
  const filtered = useMemo(
    () => filterGrnListRows(grns, filters),
    [grns, query, status],
  );
  const filtersActive = hasGrnListFilters(filters);
  const showDraftPanel = draftsLoadFailed || drafts.length > 0;

  function resetFilters() {
    replaceParams({ q: null, status: null });
  }

  async function handleDiscard(draft: BranchGrnDraftRow) {
    const ok = await confirm({
      title: `${ACTIONS_VI.delete} ${draft.grnNumber}?`,
      variant: "destructive",
    });
    if (!ok) return;

    setPendingDraftId(draft.grnId);
    try {
      const result = await discardGrnDraft({ grnId: draft.grnId });
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
      backHref={backHref}
      backLabel="Tồn"
      action={
        canCreate ? (
          <Button asChild size="touch">
            <Link
              href={`/br/${branchId}/stock/grn/new?returnTo=${encodeURIComponent(currentListHref)}`}
            >
              <IconPlus className="size-4" />
              {INVENTORY_VI.receivingEyebrow}
            </Link>
          </Button>
        ) : undefined
      }
    >
      {showDraftPanel ? (
        <section
          className="flex min-w-0 flex-col gap-2"
          aria-label={INVENTORY_VI.draft}
        >
          <div className="flex items-center justify-between gap-2">
            <SectionLabel density="dense">{INVENTORY_VI.draft}</SectionLabel>
            {!draftsLoadFailed ? (
              <Badge variant="warning">{drafts.length}</Badge>
            ) : null}
          </div>
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
                  returnTo={currentListHref}
                />
              ))}
            </ItemGroup>
          )}
        </section>
      ) : null}

      <section
        className="flex min-w-0 flex-col gap-3"
        aria-label={INVENTORY_VI.grnListTab}
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
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_11rem]">
              <InputGroup className="min-h-12 w-full">
                <InputGroupAddon>
                  <IconSearch />
                </InputGroupAddon>
                <InputGroupInput
                  value={query}
                  onChange={(event) =>
                    replaceParams({ q: event.target.value || null })
                  }
                  placeholder={INVENTORY_VI.grnSearchPlaceholder}
                  aria-label={INVENTORY_VI.grnSearchPlaceholder}
                  inputMode="search"
                />
              </InputGroup>
              <Select
                value={status}
                onValueChange={(value) =>
                  replaceParams({ status: value === "all" ? null : value })
                }
              >
                <SelectTrigger
                  size="touch"
                  className="w-full"
                  aria-label={FORM_VI.status}
                >
                  <SelectValue placeholder={FORM_VI.status} />
                </SelectTrigger>
                <SelectContent>
                  {statusFilterOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
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
                    returnTo={currentListHref}
                  />
                ))}
              </ItemGroup>
            )}
          </>
        )}
      </section>
    </BranchOperatorPage>
  );
}

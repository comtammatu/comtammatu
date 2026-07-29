"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRightToLine as IconArrowBarRight,
  FileText as IconFileText,
  Pencil as IconPencil,
  Plus as IconPlus,
  Receipt as IconReceipt,
  Search as IconSearch,
  Trash as IconTrash,
} from "lucide-react";
import {
  ACTIONS_VI,
  FORM_VI,
  INVENTORY_VI,
  KDS_VI,
  STATES_VI,
} from "@comtammatu/shared/messages";
import { formatVNDateTime } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { useFormControlSize } from "@/components/form/control-size";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  AppEmptyState,
  AppListFrame,
  AppPage,
  AppPageHeader,
  AppSection,
  AppToolbar,
} from "@/components/surface";
import { AppPageTabs, TabsContent } from "@/components/app-page-tabs";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { InteractiveCard } from "@/components/data-table/interactive-card";
import {
  RowActionsContextMenuItems,
  RowActionsMenu,
  type RowActionItem,
} from "@/components/row-actions-menu";
import { StatusBadge } from "@/components/status-badge";
import { discardGrnDraft } from "../grn-actions";
import { tNav } from "../_lib/dictionary";
import {
  filterGrnDraftRows,
  filterGrnListRows,
  GRN_LIST_STATUS_FILTER_VALUES,
  grnDetailHref,
  grnDraftHref,
  grnProcurementStepChip,
  grnProcurementStepChipLabel,
  hasGrnListFilters,
  supplierInvoiceHrefForGrn,
  type GrnDraftRow,
  type GrnListStatusFilter,
  type GrnRow,
} from "@lib/inventory/grn-list-model";
import { messages } from "@lib/messages";
import {
  inventoryListFilterSelectClassName,
} from "../_components/inventory-list-frame";

export type { GrnDraftRow, GrnRow } from "@lib/inventory/grn-list-model";

const grnCopy = messages.inventory.grn;
const noValue = messages.inventory.common.noValue;

const statusFilterLabels: Record<GrnListStatusFilter, string> = {
  all: KDS_VI.filterAll,
  review: grnCopy.qcQueue,
  draft: INVENTORY_VI.draft,
  confirmed: grnCopy.statusConfirmedLong,
  cancelled: STATES_VI.cancelled,
};

const statusFilterOptions = GRN_LIST_STATUS_FILTER_VALUES.map((value) => ({
  value,
  label: statusFilterLabels[value],
}));

export function GrnListClient({
  grns,
  basePath = "/inventory/grn",
  drafts,
  canCreate,
  canManageSupplierInvoice = false,
  draftsLoadFailed = false,
  grnsLoadFailed = false,
  withinOwnerTabs = false,
}: {
  grns: GrnRow[];
  basePath?: string;
  drafts?: GrnDraftRow[];
  canCreate: boolean;
  canManageSupplierInvoice?: boolean;
  draftsLoadFailed?: boolean;
  grnsLoadFailed?: boolean;
  withinOwnerTabs?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<GrnListStatusFilter>("all");
  const [openActionRowId, setOpenActionRowId] = useState<number | null>(null);
  const controlSize = useFormControlSize();
  const router = useRouter();

  const getGrnRowActions = (grn: GrnRow): RowActionItem[] => {
    const actions: RowActionItem[] = [
      {
        key: "view",
        label: ACTIONS_VI.viewDetails,
        icon: <IconArrowBarRight />,
        href: grnDetailHref(basePath, grn.id),
      },
    ];
    if (canManageSupplierInvoice && grn.status === "confirmed") {
      actions.push({
        key: "supplier-invoice",
        label: grn.invoiceId ? grnCopy.viewInvoice : grnCopy.createInvoice,
        icon: <IconReceipt />,
        href: supplierInvoiceHrefForGrn({
          grnId: grn.id,
          invoiceId: grn.invoiceId,
        }),
      });
    }
    return actions;
  };

  const openGrnDetail = (grn: GrnRow) => {
    router.push(grnDetailHref(basePath, grn.id));
  };

  const grnColumns: DataTableColumn<GrnRow>[] = [
    {
      key: "code",
      header: INVENTORY_VI.grnCode,
      render: (grn) => (
        <Link
          href={grnDetailHref(basePath, grn.id)}
          className="font-mono text-primary hover:underline"
        >
          {grn.code}
        </Link>
      ),
    },
    {
      key: "supplier",
      header: INVENTORY_VI.supplier,
      render: (grn) => grn.supplierName,
    },
    {
      key: "branch",
      header: messages.inventory.grn.receivingWarehouse,
      render: (grn) => grn.branchName,
    },
    {
      key: "po",
      header: INVENTORY_VI.linkedPo,
      render: (grn) =>
        grn.poCount > 0 && grn.poCode ? (
          <span className="font-mono">{grn.poCode}</span>
        ) : (
          noValue
        ),
    },
    {
      key: "date",
      header: INVENTORY_VI.receiveDate,
      render: (grn) =>
        grn.date ? (
          <span className="font-mono tabular-nums text-muted-foreground">
            {grn.date}
          </span>
        ) : (
          noValue
        ),
    },
    {
      key: "status",
      header: FORM_VI.status,
      render: (grn) => {
        const step = grnProcurementStepChip(grn);
        return (
        <div className="flex flex-wrap items-center gap-1">
          <StatusBadge domain="inventory" value={grn.status} size="sm" />
          {step ? (
            <Badge variant="outline">
              {grnProcurementStepChipLabel(step, grnCopy)}
            </Badge>
          ) : null}
          {grn.qcIssueCount > 0 ? (
            <Badge variant="warning">
              {messages.inventory.grn.qcIssueCount(grn.qcIssueCount)}
            </Badge>
          ) : null}
        </div>
        );
      },
    },
    {
      key: "actions",
      header: <span className="sr-only">{FORM_VI.action}</span>,
      className: "w-10 text-right",
      render: (grn) => {
        const items = getGrnRowActions(grn);
        return (
          <div
            className="flex justify-end"
            onClick={(event) => event.stopPropagation()}
          >
            <RowActionsMenu
              items={items}
              label={`${ACTIONS_VI.viewDetails} ${grn.code}`}
              triggerSize="icon-sm"
              open={openActionRowId === grn.id}
              onOpenChange={(open) => setOpenActionRowId(open ? grn.id : null)}
            />
          </div>
        );
      },
    },
  ];

  const filters = { query: search, status: statusFilter };
  const filtered = useMemo(
    () => filterGrnListRows(grns, filters),
    [grns, search, statusFilter],
  );
  const hasActiveFilters = hasGrnListFilters(filters);
  const desktopActions = canCreate ? (
    <Button
      size={withinOwnerTabs ? "field" : "lg"}
      render={<Link href={`${basePath}/new`} />}
    >
      <IconPlus className="size-4" />
      {INVENTORY_VI.newGrn}
    </Button>
  ) : null;

  const listToolbar = (
    <AppToolbar
      variant="inline"
      className="items-stretch max-sm:[&>[data-slot=separator]]:hidden max-sm:[&>[data-slot=toolbar-group]:first-child]:basis-full sm:items-center"
      search={
        <InputGroup size={controlSize} className="w-full">
          <InputGroupAddon>
            <IconSearch />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            aria-label={INVENTORY_VI.grnSearchPlaceholder}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={INVENTORY_VI.grnSearchPlaceholder}
            inputMode="search"
          />
        </InputGroup>
      }
      filters={
        <Select
          value={statusFilter}
          onValueChange={(value) =>
            setStatusFilter(value as GrnListStatusFilter)
          }
        >
          <SelectTrigger
            size={controlSize}
            className={
              controlSize === "touch"
                ? "w-full"
                : inventoryListFilterSelectClassName
            }
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
      }
      bulk={
        <Badge variant="outline">
          {INVENTORY_VI.grnListCount(filtered.length)}
        </Badge>
      }
      actions={withinOwnerTabs ? desktopActions : null}
    />
  );

  const listTable = grnsLoadFailed ? (
    <AppEmptyState
      compact
      mode="error"
      icon={<IconReceipt />}
      title={messages.inventory.grn.loadFailed}
    >
      <Button type="button" size="sm" onClick={() => router.refresh()}>
        {ACTIONS_VI.retry}
      </Button>
    </AppEmptyState>
  ) : (
    <DataTable
      columns={grnColumns}
      data={filtered}
      getRowKey={(grn) => grn.id}
      pageSize={50}
      emptyTitle={
        hasActiveFilters
          ? INVENTORY_VI.grnNotFoundFiltered
          : INVENTORY_VI.grnEmptyNoData
      }
      emptyMode={hasActiveFilters ? "no-results" : "no-data"}
      emptyIcon={<IconReceipt className="size-5" />}
      rowClassName={(grn) =>
        grn.status === "cancelled" ? "opacity-60" : undefined
      }
      onRowClick={openGrnDetail}
      getRowDataState={(grn) =>
        openActionRowId === grn.id ? "selected" : undefined
      }
      renderRowContextMenu={(grn) => (
        <RowActionsContextMenuItems items={getGrnRowActions(grn)} />
      )}
      mobileCardRender={(grn) => (
        <GrnMobileCard
          grn={grn}
          actions={getGrnRowActions(grn)}
          onOpen={openGrnDetail}
        />
      )}
    />
  );

  const listBody = (
    <AppListFrame toolbar={grnsLoadFailed ? undefined : listToolbar}>
      {listTable}
    </AppListFrame>
  );

  const draftsContent = draftsLoadFailed ? (
    <AppEmptyState
      compact
      mode="error"
      icon={<IconFileText />}
      title={messages.inventory.grn.draftListLoadFailed}
    >
      <Button type="button" size="sm" onClick={() => router.refresh()}>
        {ACTIONS_VI.retry}
      </Button>
    </AppEmptyState>
  ) : (
    <GrnDraftsTab drafts={drafts ?? []} basePath={basePath} />
  );

  const draftSectionWithinOwnerTabs =
    withinOwnerTabs && drafts && (drafts.length > 0 || draftsLoadFailed) ? (
      <AppSection
        title={INVENTORY_VI.draft}
        badge={
          draftsLoadFailed
            ? undefined
            : { children: drafts.length, variant: "warning" }
        }
      >
        {draftsContent}
      </AppSection>
    ) : null;

  const ownerBody = withinOwnerTabs ? (
    <>
      {draftSectionWithinOwnerTabs}
      {listBody}
    </>
  ) : drafts ? (
    <AppPageTabs
      items={[
        { value: "list", label: INVENTORY_VI.grnListTab },
        {
          value: "drafts",
          label: INVENTORY_VI.draft,
          count: drafts.length,
        },
      ]}
    >
      <TabsContent value="list">{listBody}</TabsContent>
      <TabsContent value="drafts">{draftsContent}</TabsContent>
    </AppPageTabs>
  ) : (
    listBody
  );

  if (withinOwnerTabs) {
    return <div className="flex w-full flex-col gap-3">{ownerBody}</div>;
  }

  return (
    <AppPage width="xwide" density="compact" contentClassName="max-md:max-w-xl">
      <AppPageHeader
        title={tNav("grn", "navigation")}
        actions={desktopActions}
      />
      {ownerBody}
    </AppPage>
  );
}

function GrnDraftsTab({
  drafts,
  basePath,
}: {
  drafts: GrnDraftRow[];
  basePath: string;
}) {
  const router = useRouter();
  const controlSize = useFormControlSize();
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState(false);
  const [openActionRowId, setOpenActionRowId] = useState<number | null>(null);

  const filtered = useMemo(
    () => filterGrnDraftRows(drafts, search),
    [drafts, search],
  );
  const hasActiveSearch = search.trim() !== "";

  function openDraft(draft: GrnDraftRow) {
    router.push(grnDraftHref(basePath, draft));
  }

  async function handleDiscard(draft: GrnDraftRow) {
    const ok = await confirm({
      title: grnCopy.discardDraftTitle(draft.supplierName),
      variant: "destructive",
    });
    if (!ok) return;

    setPending(true);
    try {
      const result = await discardGrnDraft({ grnId: draft.grnId });
      if (!result.success) {
        toast.error(result.error ?? grnCopy.discardDraftFailed);
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  const getDraftRowActions = (draft: GrnDraftRow): RowActionItem[] => {
    const actions: RowActionItem[] = [
      {
        key: "continue",
        label: INVENTORY_VI.grnDraftContinue,
        icon: <IconPencil />,
        href: grnDraftHref(basePath, draft),
        disabled: pending,
      },
    ];
    if (draft.poId == null && draft.poCount === 0) {
      actions.push({
        key: "discard",
        label: ACTIONS_VI.delete,
        icon: <IconTrash />,
        destructive: true,
        disabled: pending,
        separatorBefore: true,
        onSelect: () => {
          void handleDiscard(draft);
        },
      });
    }
    return actions;
  };

  const draftColumns: DataTableColumn<GrnDraftRow>[] = [
    {
      key: "code",
      header: INVENTORY_VI.grnCode,
      render: (draft) => (
        <Link
          href={grnDraftHref(basePath, draft)}
          className="font-mono text-primary hover:underline"
        >
          {draft.grnNumber}
        </Link>
      ),
    },
    {
      key: "supplier",
      header: INVENTORY_VI.supplier,
      render: (draft) => draft.supplierName,
    },
    {
      key: "branch",
      header: messages.inventory.grn.receivingWarehouse,
      render: (draft) => draft.branchName,
    },
    {
      key: "po",
      header: INVENTORY_VI.linkedPo,
      render: (draft) =>
        draft.poId != null && draft.poCode ? (
          <span className="font-mono">
            {draft.poCode}
            {draft.poCount > 1 ? ` · ${draft.poCount} PO` : ""}
          </span>
        ) : (
          noValue
        ),
    },
    {
      key: "updated",
      header: ACTIONS_VI.update,
      render: (draft) => (
        <span className="font-mono tabular-nums text-muted-foreground">
          {formatVNDateTime(draft.updatedAt)}
        </span>
      ),
    },
    {
      key: "lines",
      header: INVENTORY_VI.lineCountLabel,
      className: "text-right",
      render: (draft) => (
        <span className="font-mono tabular-nums">
          {INVENTORY_VI.grnDraftLineCount(draft.lineCount)}
        </span>
      ),
    },
    {
      key: "status",
      header: FORM_VI.status,
      render: (draft) => {
        const step = grnProcurementStepChip({
          status: "draft",
          poId: draft.poId,
          poStatus: draft.poStatus,
        });
        return (
        <div className="flex flex-wrap items-center gap-1">
          <StatusBadge domain="inventory" value="draft" size="sm" />
          {step ? (
            <Badge variant="outline">
              {grnProcurementStepChipLabel(step, grnCopy)}
            </Badge>
          ) : null}
          {draft.qcIssueCount > 0 ? (
            <Badge variant="warning">
              {messages.inventory.grn.qcIssueCount(draft.qcIssueCount)}
            </Badge>
          ) : null}
        </div>
        );
      },
    },
    {
      key: "actions",
      header: <span className="sr-only">{FORM_VI.action}</span>,
      className: "w-10 text-right",
      render: (draft) => {
        const items = getDraftRowActions(draft);
        return (
          <div
            className="flex justify-end"
            onClick={(event) => event.stopPropagation()}
          >
            <RowActionsMenu
              items={items}
              label={`${INVENTORY_VI.grnDraftContinue} ${draft.grnNumber}`}
              triggerSize="icon-sm"
              open={openActionRowId === draft.grnId}
              onOpenChange={(open) =>
                setOpenActionRowId(open ? draft.grnId : null)
              }
            />
          </div>
        );
      },
    },
  ];

  if (drafts.length === 0) {
    return (
      <AppEmptyState
        compact
        icon={<IconFileText />}
        title={INVENTORY_VI.grnDraftsEmptyTitle}
        description={INVENTORY_VI.grnDraftsEmptyDescription}
      />
    );
  }

  return (
    <AppListFrame
      toolbar={
        <AppToolbar
          variant="inline"
          className="items-stretch max-sm:[&>[data-slot=separator]]:hidden max-sm:[&>[data-slot=toolbar-group]:first-child]:basis-full sm:items-center"
          search={
            <InputGroup size={controlSize} className="w-full">
              <InputGroupAddon>
                <IconSearch />
              </InputGroupAddon>
              <InputGroupInput
                type="search"
                aria-label={INVENTORY_VI.grnSearchPlaceholder}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={INVENTORY_VI.grnSearchPlaceholder}
                inputMode="search"
              />
            </InputGroup>
          }
          bulk={
            <Badge variant="outline">
              {INVENTORY_VI.grnListCount(filtered.length)}
            </Badge>
          }
        />
      }
    >
      <DataTable
        columns={draftColumns}
        data={filtered}
        getRowKey={(draft) => draft.grnId}
        pageSize={50}
        emptyTitle={
          hasActiveSearch
            ? INVENTORY_VI.grnNotFoundFiltered
            : INVENTORY_VI.grnDraftsEmptyTitle
        }
        emptyMode={hasActiveSearch ? "no-results" : "no-data"}
        emptyIcon={<IconFileText className="size-5" />}
        onRowClick={openDraft}
        getRowDataState={(draft) =>
          openActionRowId === draft.grnId ? "selected" : undefined
        }
        renderRowContextMenu={(draft) => (
          <RowActionsContextMenuItems items={getDraftRowActions(draft)} />
        )}
        mobileCardRender={(draft) => (
          <GrnDraftMobileCard
            draft={draft}
            actions={getDraftRowActions(draft)}
            onOpen={openDraft}
          />
        )}
      />
    </AppListFrame>
  );
}

function GrnDraftMobileCard({
  draft,
  actions,
  onOpen,
}: {
  draft: GrnDraftRow;
  actions: RowActionItem[];
  onOpen: (draft: GrnDraftRow) => void;
}) {
  return (
    <InteractiveCard
      minHeight="mobile"
      padding="default"
      className="justify-between touch-manipulation cursor-pointer"
      role="button"
      tabIndex={0}
      onClick={() => onOpen(draft)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(draft);
        }
      }}
    >
      <div className="min-w-0 flex flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-semibold">
            {draft.grnNumber}
          </span>
          <StatusBadge domain="inventory" value="draft" size="sm" />
          {(() => {
            const step = grnProcurementStepChip({
              status: "draft",
              poId: draft.poId,
              poStatus: draft.poStatus,
            });
            return step ? (
              <Badge variant="outline">
                {grnProcurementStepChipLabel(step, grnCopy)}
              </Badge>
            ) : null;
          })()}
          {draft.qcIssueCount > 0 ? (
            <Badge variant="warning">
              {messages.inventory.grn.qcIssueCount(draft.qcIssueCount)}
            </Badge>
          ) : null}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {draft.supplierName}
          {` • ${draft.branchName}`}
          {draft.poCount > 0 && draft.poCode ? ` • Đơn ${draft.poCode}` : ""}
        </p>
        <p className="text-xs text-muted-foreground">
          {INVENTORY_VI.grnDraftUpdatedAt(formatVNDateTime(draft.updatedAt))}
          {` • ${INVENTORY_VI.grnDraftLineCount(draft.lineCount)}`}
        </p>
      </div>
      <div
        className="flex shrink-0 items-center"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <RowActionsMenu
          items={actions}
          label={`${INVENTORY_VI.grnDraftContinue} ${draft.grnNumber}`}
          triggerSize="icon-touch"
        />
      </div>
    </InteractiveCard>
  );
}

function GrnMobileCard({
  grn,
  actions,
  onOpen,
}: {
  grn: GrnRow;
  actions: RowActionItem[];
  onOpen: (grn: GrnRow) => void;
}) {
  return (
    <InteractiveCard
      minHeight="mobile"
      padding="default"
      className="justify-between touch-manipulation cursor-pointer"
      role="button"
      tabIndex={0}
      onClick={() => onOpen(grn)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(grn);
        }
      }}
    >
      <div className="min-w-0 flex flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-semibold">{grn.code}</span>
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
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {grn.supplierName}
          {` • ${grn.branchName}`}
          {grn.poCount > 0 && grn.poCode ? ` • Đơn ${grn.poCode}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <div className="flex flex-col items-end gap-1">
          <span className="text-xs text-muted-foreground">
            {grn.date || noValue}
          </span>
        </div>
        <div
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <RowActionsMenu
            items={actions}
            label={`${ACTIONS_VI.viewDetails} ${grn.code}`}
            triggerSize="icon-touch"
          />
        </div>
      </div>
    </InteractiveCard>
  );
}

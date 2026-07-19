/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator UI */
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  EllipsisVertical as IconDotsVertical,
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
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@comtammatu/ui/components/drawer";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemHeader,
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
import { useLongPress } from "@lib/hooks/use-long-press";
import {
  AppEmptyState,
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
import { StatusBadge } from "@/components/status-badge";
import { discardGrnDraft } from "../grn-actions";
import { formatVND } from "../_lib/format";
import { tNav } from "../_lib/dictionary";
import {
  filterGrnListRows,
  grnDetailHref,
  hasGrnListFilters,
  newGrnSupplierHref,
  type GrnDraftRow,
  type GrnListStatusFilter,
  type GrnRow,
} from "@lib/inventory/grn-list-model";
import { messages } from "@lib/messages";

export type { GrnDraftRow, GrnRow } from "@lib/inventory/grn-list-model";

const statusConfirmed = "Đã xác nhận";
const toastDiscardDraftFailed = "Không thể hủy phiếu nháp.";
const dialogDiscardTitlePrefix = "Xóa nháp của ";
const dialogDiscardTitleSuffix = "?";

const statusFilterOptions: { value: GrnListStatusFilter; label: string }[] = [
  { value: "all", label: KDS_VI.filterAll },
  { value: "draft", label: INVENTORY_VI.draft },
  { value: "confirmed", label: statusConfirmed },
  { value: "cancelled", label: STATES_VI.cancelled },
];

export function GrnListClient({
  grns,
  basePath = "/inventory/grn",
  drafts,
  canCreate,
  draftsLoadFailed = false,
  grnsLoadFailed = false,
  withinOwnerTabs = false,
}: {
  grns: GrnRow[];
  basePath?: string;
  drafts?: GrnDraftRow[];
  canCreate: boolean;
  draftsLoadFailed?: boolean;
  grnsLoadFailed?: boolean;
  withinOwnerTabs?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<GrnListStatusFilter>("all");
  const [drawerRow, setDrawerRow] = useState<GrnRow | null>(null);
  const router = useRouter();
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
        grn.poId != null && grn.poCode ? (
          <span className="font-mono">{grn.poCode}</span>
        ) : (
          "—"
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
          "—"
        ),
    },
    {
      key: "total",
      header: FORM_VI.totalAmount,
      className: "text-right",
      render: (grn) => (
        <span className="font-mono font-medium tabular-nums">
          {formatVND(grn.total)}
        </span>
      ),
    },
    {
      key: "status",
      header: FORM_VI.status,
      render: (grn) => (
        <StatusBadge domain="inventory" value={grn.status} size="sm" />
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-10",
      render: (grn) => (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`${ACTIONS_VI.viewDetails} ${grn.code}`}
          render={<Link href={grnDetailHref(basePath, grn.id)} />}
        >
          <IconDotsVertical className="size-4" />
        </Button>
      ),
    },
  ];

  const filters = { query: search, status: statusFilter };
  const filtered = useMemo(
    () => filterGrnListRows(grns, filters),
    [grns, search, statusFilter],
  );
  const hasActiveFilters = hasGrnListFilters(filters);
  const desktopActions = canCreate ? (
    <Button size="sm" render={<Link href={`${basePath}/new`} />}>
      <IconPlus className="size-4" />
      {INVENTORY_VI.newGrn}
    </Button>
  ) : null;

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
    <>
      <AppToolbar
        variant="inline"
        className="items-stretch sm:items-center"
        search={
          <InputGroup className="min-h-10 w-full sm:h-10">
            <InputGroupAddon>
              <IconSearch />
            </InputGroupAddon>
            <InputGroupInput
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
              size="default"
              className="min-h-10 w-full sm:h-10 sm:w-44"
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
            {filtered.length}/{grns.length}
          </Badge>
        }
        actions={withinOwnerTabs ? desktopActions : null}
      />

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
        mobileCardRender={(grn) => (
          <GrnMobileCard
            grn={grn}
            basePath={basePath}
            onOpenDrawer={setDrawerRow}
          />
        )}
      />
    </>
  );

  const listBody = (
    <>
      <AppSection className="overflow-hidden" contentFlush>
        {listTable}
      </AppSection>
      <Drawer
        open={drawerRow != null}
        onOpenChange={(open) => !open && setDrawerRow(null)}
      >
        <DrawerContent>
          {drawerRow ? (
            <>
              <DrawerHeader>
                <DrawerTitle>{drawerRow.code}</DrawerTitle>
                <DrawerDescription>
                  {drawerRow.supplierName} • {drawerRow.branchName}
                </DrawerDescription>
              </DrawerHeader>
              <div className="flex flex-col gap-3 p-4">
                <Button
                  variant="default"
                  className="w-full"
                  onClick={() =>
                    router.push(grnDetailHref(basePath, drawerRow.id))
                  }
                >
                  Xem chi tiết
                </Button>
              </div>
            </>
          ) : null}
        </DrawerContent>
      </Drawer>
    </>
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
    withinOwnerTabs &&
    drafts &&
    (drafts.length > 0 || draftsLoadFailed) ? (
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
    return (
      <div className="flex w-full flex-col gap-3">{ownerBody}</div>
    );
  }

  return (
    <AppPage width="xwide" density="compact" contentClassName="max-md:max-w-xl">
      <AppPageHeader
        eyebrow={messages.inventory.shell.moduleName}
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
  const [pending, setPending] = useState(false);

  function openDraft(draft: GrnDraftRow) {
    router.push(
      draft.poId != null
        ? `${basePath}/${draft.grnId}`
        : newGrnSupplierHref(basePath, draft.supplierId, draft.branchId),
    );
  }

  async function handleDiscard(draft: GrnDraftRow) {
    const ok = await confirm({
      title: `${dialogDiscardTitlePrefix}${draft.supplierName}${dialogDiscardTitleSuffix}`,
      variant: "destructive",
    });
    if (!ok) return;

    setPending(true);
    try {
      const result = await discardGrnDraft({ grnId: draft.grnId });
      if (!result.success) {
        toast.error(result.error ?? toastDiscardDraftFailed);
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

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
    <div className="flex flex-col gap-3">
      {drafts.map((draft) => (
        <Item key={draft.grnId} variant="outline">
          <ItemHeader>
            <div className="min-w-0">
              <ItemTitle className="text-base">{draft.supplierName}</ItemTitle>
              <ItemDescription>
                {draft.poCode
                  ? `${draft.grnNumber} • ${draft.branchName} • PO ${draft.poCode}`
                  : `${draft.grnNumber} • ${draft.branchName}`}
              </ItemDescription>
              <p className="mt-1 text-sm text-muted-foreground">
                {INVENTORY_VI.grnDraftUpdatedAt(
                  formatVNDateTime(draft.updatedAt),
                )}
              </p>
            </div>
            <Badge variant="outline" className="rounded-full px-3 py-1">
              {INVENTORY_VI.grnDraftLineCount(draft.lineCount)}
            </Badge>
          </ItemHeader>

          <ItemContent className="hidden" />
          <ItemFooter>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                className="flex-1"
                onClick={() => openDraft(draft)}
                disabled={pending}
              >
                <IconPencil className="size-4" />
                {INVENTORY_VI.grnDraftContinue}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => handleDiscard(draft)}
                disabled={pending}
              >
                <IconTrash className="size-4" />
                {ACTIONS_VI.delete}
              </Button>
            </div>
          </ItemFooter>
        </Item>
      ))}
    </div>
  );
}

function GrnMobileCard({
  grn,
  basePath,
  onOpenDrawer,
}: {
  grn: GrnRow;
  basePath: string;
  onOpenDrawer: (grn: GrnRow) => void;
}) {
  const router = useRouter();
  const longPress = useLongPress({
    onLongPress: () => onOpenDrawer(grn),
    onClick: () => router.push(grnDetailHref(basePath, grn.id)),
  });

  return (
    <InteractiveCard
      minHeight="mobile"
      padding="default"
      className="justify-between touch-manipulation select-none cursor-pointer"
      {...longPress}
    >
      <div className="min-w-0 flex flex-1 flex-col gap-1 pointer-events-none">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-semibold">{grn.code}</span>
          <StatusBadge domain="inventory" value={grn.status} size="sm" />
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {grn.supplierName}
          {` • ${grn.branchName}`}
          {grn.poId != null && grn.poCode ? ` • PO ${grn.poCode}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 pointer-events-none">
        <span className="text-xs text-muted-foreground">{grn.date || "—"}</span>
        <span className="font-mono text-sm font-semibold">
          {formatVND(grn.total)}
        </span>
      </div>
    </InteractiveCard>
  );
}

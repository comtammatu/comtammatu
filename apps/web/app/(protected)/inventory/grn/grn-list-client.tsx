"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ClipboardList as IconClipboardList,
  EllipsisVertical as IconDotsVertical,
  FileText as IconFileText,
  Pencil as IconPencil,
  Plus as IconPlus,
  Receipt as IconReceipt,
  Search as IconSearch,
  Trash as IconTrash,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
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
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemHeader,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import { toast } from "@comtammatu/ui/components/sonner";
import { useLongPress } from "@lib/hooks/use-long-press";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@comtammatu/ui/components/drawer";
import { matchesSearch } from "@lib/search";
import {
  AppEmptyState,
  AppPage,
  AppPageHeader,
  AppToolbar,
} from "@/components/surface";
import { OperatorFlowSteps } from "../_components/operator-flow-steps";
import { AppPageTabs, TabsContent } from "@/components/app-page-tabs";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { InteractiveCard } from "@/components/data-table/interactive-card";
import { StatusBadge } from "@/components/status-badge";
import { formatVND } from "../_lib/format";
import { tNav } from "../_lib/dictionary";
import { discardGrnDraft } from "../grn-actions";
import { messages } from "@lib/messages";

import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { formatVNDateTime } from "@comtammatu/shared/time";
import {
  FORM_VI,
  INVENTORY_VI,
  KDS_VI,
  STATES_VI,
} from "@comtammatu/shared/messages";
export type GrnRow = {
  id: number;
  code: string;
  supplierName: string;
  branchName: string;
  poId: number | null;
  poCode: string;
  date: string;
  total: number;
  status: string;
};

export type GrnDraftRow = {
  grnId: number;
  supplierId: number;
  supplierName: string;
  branchName: string;
  grnNumber: string;
  updatedAt: string;
  lineCount: number;
};

const statusConfirmed = "Đã xác nhận";
const toastDiscardDraftFailed = "Không thể hủy phiếu nháp.";
const dialogDiscardTitlePrefix = "Xóa nháp của ";
const dialogDiscardTitleSuffix = "?";

const statusFilterOptions = [
  { value: "all", label: KDS_VI.filterAll },
  { value: "draft", label: INVENTORY_VI.draft },
  { value: "confirmed", label: statusConfirmed },
  { value: "cancelled", label: STATES_VI.cancelled },
];

function grnDetailHref(basePath: string, id: number) {
  return `${basePath}/${id}`;
}

export function GrnListClient({
  grns,
  basePath = "/inventory/grn",
  purchaseOrdersPath = "/inventory/purchase-orders",
  drafts,
  embedded = false,
  canCreate = true,
}: {
  grns: GrnRow[];
  basePath?: string;
  purchaseOrdersPath?: string;
  drafts?: GrnDraftRow[];
  embedded?: boolean;
  canCreate?: boolean;
}) {
  const isOperator = basePath.startsWith("/br/");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [drawerRow, setDrawerRow] = useState<GrnRow | null>(null);
  const router = useRouter();
  const grnColumns: DataTableColumn<GrnRow>[] = [
    {
      key: "code",
      header: INVENTORY_VI.grnCode,
      render: (g) => (
        <Link
          href={grnDetailHref(basePath, g.id)}
          className="font-medium text-primary hover:underline"
        >
          {g.code}
        </Link>
      ),
    },
    {
      key: "supplier",
      header: INVENTORY_VI.supplier,
      className: "text-sm font-medium",
      render: (g) => g.supplierName,
    },
    {
      key: "branch",
      header: messages.inventory.grn.receivingWarehouse,
      className: "text-sm text-muted-foreground",
      render: (g) => g.branchName,
    },
    {
      key: "po",
      header: INVENTORY_VI.linkedPo,
      className: "text-sm text-muted-foreground",
      render: (g) =>
        g.poId != null && g.poCode ? (
          <Link
            href={`${purchaseOrdersPath}/${g.poId}`}
            className="font-medium text-primary hover:underline"
          >
            {g.poCode}
          </Link>
        ) : (
          "—"
        ),
    },
    {
      key: "date",
      header: INVENTORY_VI.receiveDate,
      className: "text-sm text-muted-foreground",
      render: (g) => g.date || "—",
    },
    {
      key: "total",
      header: FORM_VI.totalAmount,
      className: "text-sm font-medium",
      render: (g) => formatVND(g.total),
    },
    {
      key: "status",
      header: FORM_VI.status,
      render: (g) => (
        <StatusBadge domain="inventory" value={g.status} size="sm" />
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-10",
      render: (g) => (
        <Button asChild variant="ghost" size="icon-sm">
          <Link href={grnDetailHref(basePath, g.id)}>
            <IconDotsVertical className="size-4" />
          </Link>
        </Button>
      ),
    },
  ];

  const filtered = useMemo(() => {
    let result = grns;
    if (statusFilter !== "all") {
      result = result.filter((g) => g.status === statusFilter);
    }
    const q = search.trim();
    if (q) {
      result = result.filter((g) =>
        matchesSearch([g.code, g.supplierName, g.poCode], q),
      );
    }
    return result;
  }, [grns, search, statusFilter]);

  const hasActiveFilters = search.trim() !== "" || statusFilter !== "all";
  const operatorFlow = messages.inventory.operatorFlow;

  const listBody = (
    <>
      <AppToolbar variant={isOperator ? "inline" : "card"}>
        <InputGroup className="h-12 basis-full flex-1 md:h-7 md:basis-auto">
          <InputGroupAddon>
            <IconSearch />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={INVENTORY_VI.grnSearchPlaceholder}
            inputMode="search"
          />
        </InputGroup>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger
            size={isOperator ? "touch" : "default"}
            className={isOperator ? "w-full" : "min-w-40"}
          >
            <SelectValue placeholder={FORM_VI.status} />
          </SelectTrigger>
          <SelectContent>
            {statusFilterOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Badge variant="outline">
          {filtered.length}/{grns.length}
        </Badge>
      </AppToolbar>

      <DataTable
        columns={grnColumns}
        data={filtered}
        getRowKey={(g) => g.id}
        emptyTitle={
          hasActiveFilters
            ? INVENTORY_VI.grnNotFoundFiltered
            : INVENTORY_VI.grnEmptyNoData
        }
        emptyMode={hasActiveFilters ? "no-results" : "no-data"}
        emptyIcon={<IconReceipt className="size-5" />}
        rowClassName={(g) =>
          g.status === "cancelled" ? "opacity-60" : undefined
        }
        mobileCardRender={(g) => <GrnMobileCard grn={g} basePath={basePath} onOpenDrawer={setDrawerRow} />}
      />

      <Drawer open={!!drawerRow} onOpenChange={(open) => !open && setDrawerRow(null)}>
        <DrawerContent>
          {drawerRow && (
            <>
              <DrawerHeader>
                <DrawerTitle>{drawerRow.code}</DrawerTitle>
                <DrawerDescription>{drawerRow.supplierName} • {drawerRow.branchName}</DrawerDescription>
              </DrawerHeader>
              <div className="p-4 flex flex-col gap-3">
                <Button variant="default" className="w-full" onClick={() => router.push(grnDetailHref(basePath, drawerRow.id))}>
                  Xem chi tiết
                </Button>
              </div>
            </>
          )}
        </DrawerContent>
      </Drawer>

    </>
  );

  if (isOperator) {
    return (
      <div className="flex w-full flex-col gap-3">
        <OperatorFlowSteps
          title={operatorFlow.grnListTitle}
          description={operatorFlow.grnListDescription}
          steps={operatorFlow.grnSteps}
          currentStep={1}
        />

        {canCreate ? (
          <Button asChild size="touch" className="w-full">
            <Link href={`${basePath}/new`}>
              <IconPlus className="size-4" />
              {INVENTORY_VI.receivingEyebrow}
            </Link>
          </Button>
        ) : null}

        {drafts && drafts.length > 0 ? (
          <>
            <div className="flex items-center gap-2 px-1">
              <p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
                {INVENTORY_VI.draft}
              </p>
              <Badge variant="warning">{drafts.length}</Badge>
            </div>
            <GrnDraftsTab drafts={drafts} basePath={basePath} />
          </>
        ) : null}

        {listBody}
      </div>
    );
  }

  const desktopActions = (
    <div className="flex items-center gap-2">
      <Button asChild variant="outline" size={embedded ? "touch" : "sm"}>
        <Link href={purchaseOrdersPath}>
          <IconClipboardList className="size-4" />
          {INVENTORY_VI.choosePoToCreateGrn}
        </Link>
      </Button>
      <Button asChild size={embedded ? "touch" : "sm"}>
        <Link href={`${basePath}/new`}>
          <IconPlus className="size-4" />
          {INVENTORY_VI.newGrn}
        </Link>
      </Button>
    </div>
  );

  const officeBody = drafts ? (
    <AppPageTabs
      paramKey={embedded ? "grnTab" : undefined}
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
      <TabsContent value="drafts">
        <GrnDraftsTab drafts={drafts} basePath={basePath} />
      </TabsContent>
    </AppPageTabs>
  ) : (
    listBody
  );

  if (embedded) {
    return (
      <div className="flex w-full flex-col gap-3">
        <div className="flex justify-end">{desktopActions}</div>
        {officeBody}
      </div>
    );
  }

  return (
    <AppPage width="xwide" density="compact" contentClassName="max-md:max-w-xl">
      <AppPageHeader
        eyebrow={messages.inventory.shell.moduleName}
        title={tNav("grn", "navigation")}
        actions={desktopActions}
      />
      {officeBody}
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
    router.push(`${basePath}/new/${draft.supplierId}`);
  }

  async function handleDiscard(draft: GrnDraftRow) {
    const ok = await confirm({
      title: `${dialogDiscardTitlePrefix}${draft.supplierName}${dialogDiscardTitleSuffix}`,
      variant: "destructive",
    });
    if (!ok) return;
    setPending(true);
    try {
      const res = await discardGrnDraft({ grnId: draft.grnId });
      if (!res.success) {
        toast.error(res.error ?? toastDiscardDraftFailed);
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
                {draft.grnNumber} • {draft.branchName}
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
    <InteractiveCard minHeight="mobile" padding="default" className="justify-between touch-none select-none cursor-pointer" {...longPress}>
      <div className="min-w-0 flex-1 flex flex-col gap-1 pointer-events-none">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-semibold">{grn.code}</span>
          <StatusBadge domain="inventory" value={grn.status} size="sm" />
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {grn.supplierName}
          {` • ${grn.branchName}`}
          {grn.poCode && ` • PO ${grn.poCode}`}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 pointer-events-none">
        <span className="text-xs text-muted-foreground">
          {grn.date || "—"}
        </span>
        <span className="font-mono text-sm font-semibold">
          {formatVND(grn.total)}
        </span>
      </div>
    </InteractiveCard>
  );
}

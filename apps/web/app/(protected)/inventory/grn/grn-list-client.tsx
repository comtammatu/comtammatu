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
import { matchesSearch } from "@lib/search";
import {
  AppEmptyState,
  AppPage,
  AppPageHeader,
  AppToolbar,
} from "@/components/surface";
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
  grnNumber: string;
  updatedAt: string;
  lineCount: number;
};

const statusFilterOptions = [
  { value: "all", label: KDS_VI.filterAll },
  { value: "draft", label: INVENTORY_VI.draft },
  { value: "confirmed", label: "Đã xác nhận" },
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
}: {
  grns: GrnRow[];
  basePath?: string;
  purchaseOrdersPath?: string;
  drafts?: GrnDraftRow[];
  embedded?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
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

  const listBody = (
    <>
      <AppToolbar>
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
            size={embedded ? "touch" : "default"}
            className={embedded ? "w-full" : "min-w-40"}
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
        mobileCardRender={(g) => <GrnMobileCard grn={g} basePath={basePath} />}
      />
    </>
  );

  const content = (
    <>
      {!embedded ? (
        <AppPageHeader
          eyebrow={INVENTORY_VI.warehouse}
          title={tNav("grn", "navigation")}
          actions={
            <Button asChild size={embedded ? "touch" : "sm"}>
              <Link href={purchaseOrdersPath}>
                <IconPlus className="size-4" />
                {INVENTORY_VI.choosePoToCreateGrn}
              </Link>
            </Button>
          }
          tabs={
            drafts ? (
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
                <TabsContent value="drafts">
                  <GrnDraftsTab drafts={drafts} basePath={basePath} />
                </TabsContent>
              </AppPageTabs>
            ) : undefined
          }
        />
      ) : null}

      {embedded || !drafts ? listBody : null}
    </>
  );

  if (embedded) {
    return <div className="flex w-full flex-col gap-3">{content}</div>;
  }

  return (
    <AppPage width="xwide" contentClassName="max-md:max-w-xl">
      {content}
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
      title: `Xóa nháp của ${draft.supplierName}?`,
      variant: "destructive",
    });
    if (!ok) return;
    setPending(true);
    try {
      const res = await discardGrnDraft({ grnId: draft.grnId });
      if (!res.success) {
        toast.error(res.error ?? "Không thể hủy phiếu nháp.");
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
              <ItemTitle className="text-base">
                {draft.supplierName}
              </ItemTitle>
              <ItemDescription>{draft.grnNumber}</ItemDescription>
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

function GrnMobileCard({ grn, basePath }: { grn: GrnRow; basePath: string }) {
  return (
    <InteractiveCard asChild minHeight="mobile" padding="default">
      <Link href={grnDetailHref(basePath, grn.id)} className="block">
        <div className="min-w-0 flex-1 flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold">{grn.code}</span>
            <StatusBadge domain="inventory" value={grn.status} size="sm" />
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {grn.supplierName}
            {grn.poCode && ` • PO ${grn.poCode}`}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-xs text-muted-foreground">
            {grn.date || "—"}
          </span>
          <span className="font-mono text-sm font-semibold">
            {formatVND(grn.total)}
          </span>
        </div>
      </Link>
    </InteractiveCard>
  );
}

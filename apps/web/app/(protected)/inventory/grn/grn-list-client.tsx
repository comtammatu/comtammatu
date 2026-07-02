"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  EllipsisVertical as IconDotsVertical,
  Plus as IconPlus,
  Receipt as IconReceipt,
  Search as IconSearch,
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
import { matchesSearch } from "@lib/search";
import { AppPage, AppPageHeader, AppToolbar } from "@/components/surface";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { InteractiveCard } from "@/components/data-table/interactive-card";
import { StatusBadge } from "@/components/status-badge";
import { formatVND } from "../_lib/format";
import { tNav } from "../_lib/dictionary";

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
  poCode: string;
  date: string;
  total: number;
  status: string;
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
}: {
  grns: GrnRow[];
  basePath?: string;
  purchaseOrdersPath?: string;
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
      render: (g) => g.poCode || "—",
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

  return (
    <AppPage width="wide" contentClassName="max-md:max-w-xl">
      <AppPageHeader
        eyebrow={INVENTORY_VI.warehouse}
        title={tNav("grn", "navigation")}
        actions={
          <Button asChild size="sm">
            <Link href={purchaseOrdersPath}>
              <IconPlus className="size-4" />
              {INVENTORY_VI.choosePoToCreateGrn}
            </Link>
          </Button>
        }
      />
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
          <SelectTrigger className="min-w-40">
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
    </AppPage>
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

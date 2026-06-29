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
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { cn } from "@comtammatu/ui";
import { matchesSearch } from "@lib/search";
import { AppPage, AppPageHeader, AppToolbar } from "@/components/surface";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { InteractiveCard } from "../_components/interactive-card";
import { StatusBadge } from "../_components/status-badge";
import { formatVND } from "../_lib/format";
import { tNav } from "../_lib/dictionary";

import { FORM_VI, INVENTORY_VI, KDS_VI, STATES_VI } from "@comtammatu/shared/messages";
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

const GRN_COLUMNS: DataTableColumn<GrnRow>[] = [
  {
    key: "code",
    header: INVENTORY_VI.grnCode,
    render: (g) => (
      <Link
        href={`/inventory/grn/${g.id}`}
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
    render: (g) => <StatusBadge status={g.status} size="sm" />,
  },
  {
    key: "actions",
    header: "",
    className: "w-10",
    render: (g) => (
      <Button asChild variant="ghost" size="icon-sm">
        <Link href={`/inventory/grn/${g.id}`}>
          <IconDotsVertical className="size-4" />
        </Link>
      </Button>
    ),
  },
];

export function GrnListClient({ grns }: { grns: GrnRow[] }) {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

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
    <AppPage width={isMobile ? "narrow" : "wide"}>
      <AppPageHeader
        eyebrow={INVENTORY_VI.warehouse}
        title={tNav("grn", "navigation")}
        actions={
          <Button asChild size="sm">
            <Link href="/inventory/purchase-orders">
              <IconPlus className="size-4" />
              {INVENTORY_VI.choosePoToCreateGrn}
            </Link>
          </Button>
        }
      />
      <AppToolbar>
        <InputGroup className={cn("flex-1", isMobile && "h-12 basis-full")}>
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
        columns={GRN_COLUMNS}
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
        mobileCardRender={(g) => <GrnMobileCard grn={g} />}
      />
    </AppPage>
  );
}

function GrnMobileCard({ grn }: { grn: GrnRow }) {
  return (
    <InteractiveCard asChild minHeight="mobile" padding="default">
      <Link href={`/inventory/grn/${grn.id}`} className="block">
        <div className="min-w-0 flex-1 flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold">{grn.code}</span>
            <StatusBadge status={grn.status} size="sm" />
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

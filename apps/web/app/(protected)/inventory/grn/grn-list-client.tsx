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

import { FORM_VI } from "@comtammatu/shared/messages";
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
  { value: "all", label: "Tất cả" },
  { value: "draft", label: "Nháp" },
  { value: "confirmed", label: "Đã xác nhận" },
  { value: "cancelled", label: "Đã hủy" },
];

const GRN_COLUMNS: DataTableColumn<GrnRow>[] = [
  {
    key: "code",
    header: "Mã GRN",
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
    header: "Nhà cung cấp",
    className: "text-sm font-medium",
    render: (g) => g.supplierName,
  },
  {
    key: "po",
    header: "PO liên kết",
    className: "text-sm text-muted-foreground",
    render: (g) => g.poCode || "—",
  },
  {
    key: "date",
    header: "Ngày kiểm nhận",
    className: "text-sm text-muted-foreground",
    render: (g) => g.date || "—",
  },
  {
    key: "total",
    header: FORM_VI.totalAmount,
    className: "text-sm font-medium",
    render: (g) => <>{formatVND(g.total)} ₫</>,
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
        eyebrow="Kho hàng"
        title={tNav("grn", "navigation")}
        actions={
          <Button asChild size="sm">
            <Link href="/inventory/purchase-orders">
              <IconPlus className="size-4" />
              Chọn PO để tạo GRN
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
            placeholder="Tìm mã GRN, nhà cung cấp, PO..."
            inputMode="search"
          />
        </InputGroup>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="min-w-40">
            <SelectValue placeholder="Trạng thái" />
          </SelectTrigger>
          <SelectContent>
            {statusFilterOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Badge variant="outline" className="rounded-full">
          {filtered.length}/{grns.length}
        </Badge>
      </AppToolbar>

      <DataTable
        columns={GRN_COLUMNS}
        data={filtered}
        getRowKey={(g) => g.id}
        emptyTitle={
          hasActiveFilters
            ? "Không tìm thấy phiếu nhập phù hợp"
            : "Chưa có phiếu nhập kho nào"
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
        <div className="min-w-0 flex-1 space-y-1">
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
            {formatVND(grn.total)} ₫
          </span>
        </div>
      </Link>
    </InteractiveCard>
  );
}

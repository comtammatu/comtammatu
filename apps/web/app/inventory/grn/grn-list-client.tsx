"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MoreVertical, Plus, Receipt, Search } from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent } from "@comtammatu/ui/components/card";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { cn } from "@comtammatu/ui";
import { InventoryHeader } from "../_components/inventory-header";
import { InteractiveCard } from "../_components/interactive-card";
import { StatusBadge } from "../_components/status-badge";
import { TableEmptyStateRow } from "../_components/table-empty-state-row";
import { formatVND } from "../_lib/format";
import { tNav } from "../_lib/dictionary";

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

export function GrnListClient({ grns }: { grns: GrnRow[] }) {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = useMemo(() => {
    let result = grns;
    if (statusFilter !== "all") {
      result = result.filter((g) => g.status === statusFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (g) =>
          g.code.toLowerCase().includes(q) ||
          g.supplierName.toLowerCase().includes(q) ||
          g.poCode.toLowerCase().includes(q),
      );
    }
    return result;
  }, [grns, search, statusFilter]);

  return (
    <>
      <InventoryHeader
        title={tNav("grn", "navigation")}
        actions={
          <Button asChild size="sm">
            <Link href="/inventory/purchase-orders">
              <Plus className="size-4" />
              Chọn PO để tạo GRN
            </Link>
          </Button>
        }
      />
      <div className="flex-1 overflow-auto p-4">
        <div className={cn("mx-auto space-y-4", isMobile ? "max-w-xl" : "max-w-7xl")}>
          {/* Filters */}
          <Card className="py-0">
            <CardContent className="flex flex-wrap items-center gap-3 p-3">
              <InputGroup className={cn("flex-1", isMobile && "h-12 basis-full")}>
                <InputGroupAddon>
                  <Search />
                </InputGroupAddon>
                <InputGroupInput
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm mã GRN, nhà cung cấp, PO..."
                  inputMode="search"
                />
              </InputGroup>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px]">
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
            </CardContent>
          </Card>

          {/* Desktop: Table / Mobile: Cards */}
          {isMobile ? (
            <div className="flex flex-col gap-2">
              {filtered.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  {search.trim() || statusFilter !== "all"
                    ? "Không tìm thấy phiếu nhập phù hợp"
                    : "Chưa có phiếu nhập kho nào"}
                </div>
              ) : (
                filtered.map((g) => (
                  <InteractiveCard
                    key={g.id}
                    asChild
                    minHeight="mobile"
                    padding="default"
                  >
                    <Link href={`/inventory/grn/${g.id}`} className="block">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-semibold">
                            {g.code}
                          </span>
                          <StatusBadge status={g.status} size="sm" />
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {g.supplierName}
                          {g.poCode && ` • PO ${g.poCode}`}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="text-xs text-muted-foreground">
                          {g.date || "—"}
                        </span>
                        <span className="font-mono text-sm font-semibold">
                          {formatVND(g.total)} ₫
                        </span>
                      </div>
                    </Link>
                  </InteractiveCard>
                ))
              )}
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mã GRN</TableHead>
                      <TableHead>Nhà cung cấp</TableHead>
                      <TableHead>PO liên kết</TableHead>
                      <TableHead>Ngày kiểm nhận</TableHead>
                      <TableHead>Tổng tiền</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 && (
                      <TableEmptyStateRow
                        colSpan={7}
                        icon={<Receipt className="size-5" />}
                        title={
                          search.trim() || statusFilter !== "all"
                            ? "Không tìm thấy phiếu nhập phù hợp"
                            : "Chưa có phiếu nhập kho nào"
                        }
                      />
                    )}
                    {filtered.map((g) => (
                      <TableRow
                        key={g.id}
                        className={cn(
                          g.status === "cancelled" && "opacity-60",
                        )}
                      >
                        <TableCell>
                          <Link
                            href={`/inventory/grn/${g.id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {g.code}
                          </Link>
                        </TableCell>
                        <TableCell className="text-sm font-medium">
                          {g.supplierName}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {g.poCode || "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {g.date || "—"}
                        </TableCell>
                        <TableCell className="text-sm font-medium">
                          {formatVND(g.total)} ₫
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={g.status} size="sm" />
                        </TableCell>
                        <TableCell>
                          <Button asChild variant="ghost" size="icon-sm">
                            <Link href={`/inventory/grn/${g.id}`}>
                              <MoreVertical className="size-4" />
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

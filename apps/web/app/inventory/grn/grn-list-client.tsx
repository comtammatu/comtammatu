"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { EllipsisVertical as IconDotsVertical, Plus as IconPlus, Receipt as IconReceipt, Search as IconSearch } from "lucide-react";
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
import {
  InventoryFilterBar,
  InventoryPageContent,
} from "../_components/inventory-page-layout";
import { InteractiveCard } from "../_components/interactive-card";
import { StatusBadge } from "../_components/status-badge";
import { TableEmptyStateRow } from "../_components/table-empty-state-row";
import { formatVND } from "../_lib/format";
import { tNav } from "../_lib/dictionary";
import { PRICE_VARIANCE_THRESHOLD_PCT } from "../_lib/playbook-data";

export type GrnRow = {
  id: number;
  code: string;
  supplierName: string;
  poCode: string;
  date: string;
  total: number;
  status: string;
  /** Largest-magnitude variance % across line items, sign preserved. Null when no item has a populated baseline. */
  signedMaxVariancePct: number | null;
  maxAbsVariancePct: number | null;
};

function formatVariance(signed: number): string {
  const rounded = Math.round(signed * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

const statusFilterOptions = [
  { value: "all", label: "Tất cả" },
  { value: "draft", label: "Nháp" },
  { value: "confirmed", label: "Đã xác nhận" },
  { value: "cancelled", label: "Đã hủy" },
];

export function GrnListClient({
  grns,
  initialStatusFilter = null,
  initialPriceReviewFilter = false,
}: {
  grns: GrnRow[];
  initialStatusFilter?: string | null;
  initialPriceReviewFilter?: boolean;
}) {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(
    initialStatusFilter ?? "all",
  );
  const [priceReviewOnly, setPriceReviewOnly] = useState(
    initialPriceReviewFilter,
  );

  const filtered = useMemo(() => {
    let result = grns;
    if (statusFilter !== "all") {
      result = result.filter((g) => g.status === statusFilter);
    }
    if (priceReviewOnly) {
      result = result.filter(
        (g) =>
          g.maxAbsVariancePct != null &&
          g.maxAbsVariancePct > PRICE_VARIANCE_THRESHOLD_PCT,
      );
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
  }, [grns, search, statusFilter, priceReviewOnly]);

  const priceReviewCount = useMemo(
    () =>
      grns.filter(
        (g) =>
          g.maxAbsVariancePct != null &&
          g.maxAbsVariancePct > PRICE_VARIANCE_THRESHOLD_PCT,
      ).length,
    [grns],
  );

  return (
    <>
      <InventoryHeader
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
      <InventoryPageContent width={isMobile ? "narrow" : "wide"}>
        {/* Filters */}
        <InventoryFilterBar>
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

          <Button
            type="button"
            size="sm"
            variant={priceReviewOnly ? "default" : "outline"}
            onClick={() => setPriceReviewOnly((prev) => !prev)}
            disabled={priceReviewCount === 0 && !priceReviewOnly}
            aria-pressed={priceReviewOnly}
          >
            Chỉ cần kiểm giá
            <Badge variant="outline" className="ml-1 tabular-nums">
              {priceReviewCount}
            </Badge>
          </Button>

          <Badge variant="outline" className="rounded-full">
            {filtered.length}/{grns.length}
          </Badge>
        </InventoryFilterBar>

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
                        {g.signedMaxVariancePct != null &&
                        Math.abs(g.signedMaxVariancePct) >
                          PRICE_VARIANCE_THRESHOLD_PCT ? (
                          <Badge
                            variant={
                              g.signedMaxVariancePct > 0
                                ? "destructive"
                                : "secondary"
                            }
                            className="text-xs"
                          >
                            {formatVariance(g.signedMaxVariancePct)}
                          </Badge>
                        ) : null}
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
                    <TableHead>Lệch giá</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 && (
                    <TableEmptyStateRow
                      colSpan={8}
                      icon={<IconReceipt className="size-5" />}
                      title={
                        search.trim() ||
                        statusFilter !== "all" ||
                        priceReviewOnly
                          ? "Không tìm thấy phiếu nhập phù hợp"
                          : "Chưa có phiếu nhập kho nào"
                      }
                    />
                  )}
                  {filtered.map((g) => (
                    <TableRow
                      key={g.id}
                      className={cn(g.status === "cancelled" && "opacity-60")}
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
                        {g.signedMaxVariancePct != null &&
                        Math.abs(g.signedMaxVariancePct) >
                          PRICE_VARIANCE_THRESHOLD_PCT ? (
                          <Badge
                            variant={
                              g.signedMaxVariancePct > 0
                                ? "destructive"
                                : "secondary"
                            }
                            className="tabular-nums"
                          >
                            {formatVariance(g.signedMaxVariancePct)}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={g.status} size="sm" />
                      </TableCell>
                      <TableCell>
                        <Button asChild variant="ghost" size="icon-sm">
                          <Link href={`/inventory/grn/${g.id}`}>
                            <IconDotsVertical className="size-4" />
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
      </InventoryPageContent>
    </>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { IconPencil, IconSearch } from "@tabler/icons-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
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
import { StatusBadge } from "../_components/status-badge";
import { TableEmptyStateRow } from "../_components/table-empty-state-row";
import { InteractiveCard } from "../_components/interactive-card";
import { formatQty, formatVND } from "../_lib/format";
import { CATEGORY_TONE_CLASS } from "../_lib/constants";
import { AdjustStockDialog } from "./adjust-stock-dialog";

export type StockIngredient = {
  id: number;
  name: string;
  sku: string;
  unit: string;
  category: string;
  qty: number;
  cost: number;
  min: number;
  max: number;
  reorder: number;
  status: "normal" | "low" | "out" | "over";
  lastCount: string;
  temp: string | null;
};

type StockFilter = "all" | "in_stock" | "low" | "out";

const stockFilterOptions: { value: StockFilter; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "in_stock", label: "Còn hàng" },
  { value: "low", label: "Thấp" },
  { value: "out", label: "Hết hàng" },
];

const STATUS_PRIORITY: Record<StockIngredient["status"], number> = {
  out: 0,
  low: 1,
  normal: 2,
  over: 3,
};

export function StockClient({
  ingredients,
  branchId,
  branchValue,
  totalValue,
}: {
  ingredients: StockIngredient[];
  branchId: number;
  branchValue: number | null;
  totalValue: number | null;
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [adjustTarget, setAdjustTarget] = useState<StockIngredient | null>(
    null,
  );

  const categories = useMemo(() => {
    const values = [
      ...new Set(
        ingredients.map((ingredient) => ingredient.category).filter(Boolean),
      ),
    ];
    values.sort((left, right) => left.localeCompare(right, "vi"));
    return values;
  }, [ingredients]);

  const filtered = useMemo(() => {
    let result = ingredients;

    if (activeCategory !== "all") {
      result = result.filter(
        (ingredient) => ingredient.category === activeCategory,
      );
    }

    if (stockFilter === "in_stock") {
      result = result.filter(
        (ingredient) =>
          ingredient.status === "normal" || ingredient.status === "over",
      );
    } else if (stockFilter === "low") {
      result = result.filter((ingredient) => ingredient.status === "low");
    } else if (stockFilter === "out") {
      result = result.filter((ingredient) => ingredient.status === "out");
    }

    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();
      result = result.filter(
        (ingredient) =>
          ingredient.name.toLowerCase().includes(query) ||
          ingredient.sku.toLowerCase().includes(query),
      );
    }

    if (isMobile) {
      result = [...result].sort(
        (a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status],
      );
    }

    return result;
  }, [ingredients, activeCategory, stockFilter, searchQuery, isMobile]);

  const showValueSummary = branchValue != null || totalValue != null;

  return (
    <>
      <InventoryHeader title="Tồn kho" />
      <InventoryPageContent
        width={isMobile ? "narrow" : "wide"}
        contentClassName={isMobile ? undefined : "max-w-none"}
      >
        {showValueSummary ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {branchValue != null ? (
              <Card>
                <CardContent className="flex flex-col gap-1 p-4">
                  <p className="text-xs font-medium text-muted-foreground">
                    Giá trị tồn kho chi nhánh
                  </p>
                  <p className="text-2xl font-bold tabular-nums">
                    {formatVND(branchValue)}
                    <span className="ml-1 text-sm font-normal text-muted-foreground">
                      đ
                    </span>
                  </p>
                </CardContent>
              </Card>
            ) : null}
            {totalValue != null ? (
              <Card>
                <CardContent className="flex flex-col gap-1 p-4">
                  <p className="text-xs font-medium text-muted-foreground">
                    Giá trị tồn kho toàn bộ
                  </p>
                  <p className="text-2xl font-bold tabular-nums">
                    {formatVND(totalValue)}
                    <span className="ml-1 text-sm font-normal text-muted-foreground">
                      đ
                    </span>
                  </p>
                </CardContent>
              </Card>
            ) : null}
          </div>
        ) : null}

        {/* Filters */}
        <InventoryFilterBar>
          <Select value={activeCategory} onValueChange={setActiveCategory}>
            <SelectTrigger className="min-w-40">
              <SelectValue placeholder="Danh mục" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả danh mục</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={stockFilter}
            onValueChange={(v) => setStockFilter(v as StockFilter)}
          >
            <SelectTrigger className="min-w-36">
              <SelectValue placeholder="Trạng thái" />
            </SelectTrigger>
            <SelectContent>
              {stockFilterOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <InputGroup className={cn("flex-1", isMobile && "h-12 basis-full")}>
            <InputGroupAddon>
              <IconSearch />
            </InputGroupAddon>
            <InputGroupInput
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Tìm tên hoặc SKU"
              inputMode="search"
            />
          </InputGroup>

          <Badge variant="outline" className="rounded-full">
            {filtered.length}/{ingredients.length}
          </Badge>
        </InventoryFilterBar>

        {/* Desktop: Table / Mobile: Cards */}
        {isMobile ? (
          <div className="flex flex-col gap-2">
            {filtered.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                {searchQuery.trim()
                  ? "Không tìm thấy nguyên liệu phù hợp"
                  : "Chưa có dữ liệu tồn kho"}
              </div>
            ) : (
              filtered.map((item) => {
                const statusColor =
                  item.status === "out"
                    ? "bg-destructive"
                    : item.status === "low"
                      ? "bg-warning"
                      : item.status === "over"
                        ? "bg-info"
                        : "bg-success";

                return (
                  <InteractiveCard
                    key={item.id}
                    minHeight="mobile"
                    padding="default"
                    className="flex-col items-stretch gap-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              "size-2 shrink-0 rounded-full",
                              statusColor,
                            )}
                          />
                          <span className="truncate font-semibold">
                            {item.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            className={
                              CATEGORY_TONE_CLASS[item.category] ??
                              "bg-muted text-muted-foreground"
                            }
                          >
                            {item.category}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {item.sku}
                          </span>
                        </div>
                      </div>
                      <StatusBadge status={item.status} />
                    </div>
                    <div className="flex items-end justify-between gap-3">
                      <div className="space-y-0.5">
                        <p className="text-xs text-muted-foreground">
                          Tồn hiện tại
                        </p>
                        <p
                          className={cn(
                            "text-lg font-bold tabular-nums",
                            (item.status === "low" || item.status === "out") &&
                              "text-destructive",
                          )}
                        >
                          {formatQty(item.qty)}{" "}
                          <span className="text-sm font-normal text-muted-foreground">
                            {item.unit}
                          </span>
                        </p>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <p>
                          Giá trị:{" "}
                          <span className="font-medium text-foreground">
                            {formatVND(item.qty * item.cost)}đ
                          </span>
                        </p>
                        <p>WAC: {formatVND(item.cost)}đ</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between border-t pt-2">
                      <div className="flex gap-2">
                        <Badge variant="destructive" className="text-xs">
                          Min {item.min}
                        </Badge>
                        <Badge variant="success" className="text-xs">
                          Re {item.reorder}
                        </Badge>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setAdjustTarget(item)}
                        aria-label={`Điều chỉnh ${item.name}`}
                      >
                        <IconPencil className="mr-1 size-3.5" />
                        Điều chỉnh
                      </Button>
                    </div>
                  </InteractiveCard>
                );
              })
            )}
          </div>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/20 hover:bg-muted/20">
                      <TableHead className="min-w-56">Nguyên liệu</TableHead>
                      <TableHead className="min-w-28">Danh mục</TableHead>
                      <TableHead className="min-w-28">SKU</TableHead>
                      <TableHead className="min-w-24">Đơn vị</TableHead>
                      <TableHead className="min-w-28 text-right">
                        Tồn hiện tại
                      </TableHead>
                      <TableHead className="min-w-28 text-right">WAC</TableHead>
                      <TableHead className="min-w-28 text-right">
                        Giá trị
                      </TableHead>
                      <TableHead className="min-w-40">Ngưỡng tồn</TableHead>
                      <TableHead className="min-w-32">Kiểm kê cuối</TableHead>
                      <TableHead className="w-24 text-right">
                        Thao tác
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 ? (
                      <TableEmptyStateRow
                        colSpan={10}
                        title={
                          searchQuery.trim()
                            ? "Không tìm thấy nguyên liệu phù hợp"
                            : "Chưa có dữ liệu tồn kho"
                        }
                        description={
                          searchQuery.trim()
                            ? "Thử từ khóa hoặc bộ lọc khác."
                            : "Dữ liệu tồn kho sẽ xuất hiện khi có nguyên liệu và giao dịch phát sinh."
                        }
                      />
                    ) : null}

                    {filtered.map((item) => (
                      <TableRow key={item.id} className="hover:bg-muted/20">
                        <TableCell>
                          <div className="space-y-1">
                            <p className="font-semibold">{item.name}</p>
                            <div className="flex flex-wrap gap-2">
                              <StatusBadge status={item.status} />
                              {item.qty <= item.reorder ? (
                                <Badge variant="warning">Chạm reorder</Badge>
                              ) : null}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {item.category ? (
                            <Badge
                              className={
                                CATEGORY_TONE_CLASS[item.category] ??
                                "bg-muted text-muted-foreground"
                              }
                            >
                              {item.category}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-sm text-muted-foreground">
                          {item.sku}
                        </TableCell>
                        <TableCell>{item.unit}</TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-mono",
                            (item.status === "low" || item.status === "out") &&
                              "font-semibold text-destructive",
                          )}
                        >
                          {formatQty(item.qty)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatVND(item.cost)}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {formatVND(item.qty * item.cost)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="destructive">Min {item.min}</Badge>
                            <Badge variant="secondary">Max {item.max}</Badge>
                            <Badge variant="success">Re {item.reorder}</Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {item.lastCount}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => setAdjustTarget(item)}
                            aria-label={`Điều chỉnh ${item.name}`}
                          >
                            <IconPencil className="size-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {adjustTarget ? (
          <AdjustStockDialog
            open={adjustTarget !== null}
            onOpenChange={(open) => {
              if (!open) setAdjustTarget(null);
            }}
            branchId={branchId}
            ingredientId={adjustTarget.id}
            ingredientName={adjustTarget.name}
            unit={adjustTarget.unit}
            onAdjusted={() => {
              setAdjustTarget(null);
              router.refresh();
            }}
          />
        ) : null}
      </InventoryPageContent>
    </>
  );
}

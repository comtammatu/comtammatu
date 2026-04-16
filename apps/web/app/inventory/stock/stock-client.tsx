"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Search } from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import { Input } from "@comtammatu/ui/components/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { cn } from "@comtammatu/ui";
import { InventoryHeader } from "../_components/inventory-header";
import { TableEmptyStateRow } from "../_components/table-empty-state-row";
import { formatQty, formatVND } from "../_lib/format";
import {
  getInventoryStatusBadgeVariant,
  getInventoryStatusLabel,
} from "../_lib/ui";
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

const categoryClasses: Record<string, string> = {
  Thịt: "bg-destructive/10 text-destructive",
  Gạo: "bg-primary/10 text-primary",
  "Gia vị": "bg-success/10 text-success",
  "Rau củ": "bg-success/10 text-success",
  Trứng: "bg-primary/10 text-primary",
  "Chế biến": "bg-muted text-muted-foreground",
  Dầu: "bg-muted text-muted-foreground",
};

const stockFilterOptions: { value: StockFilter; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "in_stock", label: "Còn hàng" },
  { value: "low", label: "Sắp hết" },
  { value: "out", label: "Hết hàng" },
];

export function StockClient({
  ingredients,
  branchId,
}: {
  ingredients: StockIngredient[];
  branchId: number;
}) {
  const router = useRouter();
  const [activeCategory, setActiveCategory] = useState("Tất cả");
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
    return ["Tất cả", ...values];
  }, [ingredients]);

  const filtered = useMemo(() => {
    let result = ingredients;

    if (activeCategory !== "Tất cả") {
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

    return result;
  }, [ingredients, activeCategory, stockFilter, searchQuery]);

  return (
    <>
      <InventoryHeader title="Tồn kho" />
      <div className="flex-1 overflow-auto p-4">
      <div className="mx-auto max-w-7xl space-y-4">

      {/* Category filter + stock filter */}
      <div className="flex flex-wrap items-center gap-2">
        {categories.map((category) => (
          <Button
            key={category}
            type="button"
            size="sm"
            variant={activeCategory === category ? "default" : "outline"}
            onClick={() => setActiveCategory(category)}
          >
            {category}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {stockFilterOptions.map((option) => (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={stockFilter === option.value ? "default" : "outline"}
            onClick={() => setStockFilter(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {/* Search */}
      <Card className="py-0">
        <CardContent className="flex flex-wrap items-center gap-3 p-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Tìm tên hoặc SKU"
              className="pl-10"
            />
          </div>
          <Badge variant="outline" className="rounded-full">
            {filtered.length} / {ingredients.length}
          </Badge>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/20 hover:bg-muted/20">
                  <TableHead className="min-w-56">Nguyên liệu</TableHead>
                  <TableHead className="min-w-28">SKU</TableHead>
                  <TableHead className="min-w-24">Đơn vị</TableHead>
                  <TableHead className="min-w-28 text-right">
                    Tồn hiện tại
                  </TableHead>
                  <TableHead className="min-w-28 text-right">WAC</TableHead>
                  <TableHead className="min-w-28 text-right">Giá trị</TableHead>
                  <TableHead className="min-w-40">Ngưỡng tồn</TableHead>
                  <TableHead className="min-w-32">Kiểm kê cuối</TableHead>
                  <TableHead className="w-24 text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableEmptyStateRow
                    colSpan={9}
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
                        <div className="flex items-center gap-2">
                          <p className="font-semibold">{item.name}</p>
                          <Badge
                            className={
                              categoryClasses[item.category] ??
                              "bg-muted text-muted-foreground"
                            }
                          >
                            {item.category}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge
                            variant={getInventoryStatusBadgeVariant(
                              item.status,
                            )}
                          >
                            {getInventoryStatusLabel(item.status)}
                          </Badge>
                          {item.qty <= item.reorder ? (
                            <Badge variant="warning">Chạm reorder</Badge>
                          ) : null}
                        </div>
                      </div>
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
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => setAdjustTarget(item)}
                          aria-label={`Điều chỉnh ${item.name}`}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => setAdjustTarget(item)}
                          aria-label={`Thêm thao tác ${item.name}`}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>


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
    </div>
    </div>
    </>
  );
}

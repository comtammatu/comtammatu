"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  MoreHorizontal,
  Pencil,
  Search,
  Wallet,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { Input } from "@comtammatu/ui/components/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { Tabs, TabsList, TabsTrigger } from "@comtammatu/ui/components/tabs";
import { cn } from "@comtammatu/ui";
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
  const [viewMode, setViewMode] = useState<"stats" | "detail">("stats");
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

  const totalValue = ingredients.reduce(
    (sum, ingredient) => sum + ingredient.qty * ingredient.cost,
    0,
  );
  const lowCount = ingredients.filter(
    (ingredient) => ingredient.status === "low" || ingredient.status === "out",
  ).length;
  const inStockCount = ingredients.filter(
    (ingredient) =>
      ingredient.status === "normal" || ingredient.status === "over",
  ).length;
  const updatedAtLabel = new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date());

  return (
    <div className="space-y-6">
      <Card className="rounded-lg border bg-card text-card-foreground shadow-sm">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Van hanh chi nhanh
            </p>
            <div className="space-y-1">
              <CardTitle className="font-heading text-3xl">
                Ton kho chi nhanh
              </CardTitle>
              <CardDescription className="max-w-3xl leading-6">
                Theo doi ton hien tai sau khi nhan transfer, cap bep va kiem ke
                de branch manager nhin thay ngay viec can xu ly trong ca.
              </CardDescription>
            </div>
          </div>
          <Tabs
            value={viewMode}
            onValueChange={(value) => setViewMode(value as "stats" | "detail")}
          >
            <TabsList>
              <TabsTrigger value="stats">Thống kê</TabsTrigger>
              <TabsTrigger value="detail">Chi tiết</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="rounded-lg border bg-card text-card-foreground shadow-sm bg-primary text-primary-foreground">
          <CardHeader>
            <div className="flex items-center gap-2 text-primary-foreground/80">
              <Wallet className="size-4" />
              <CardTitle className="text-base">Gia tri ton hien tai</CardTitle>
            </div>
            <CardDescription className="text-primary-foreground/70">
              Cập nhật gần nhất: {updatedAtLabel}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="font-mono text-4xl font-semibold tracking-tight">
              {formatVND(totalValue)}đ
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-primary-foreground/10 p-4">
                <p className="text-xs uppercase tracking-widest text-primary-foreground/70">
                  Mặt hàng
                </p>
                <p className="mt-2 text-2xl font-semibold">
                  {ingredients.length}
                </p>
              </div>
              <div className="rounded-2xl bg-primary-foreground/10 p-4">
                <p className="text-xs uppercase tracking-widest text-primary-foreground/70">
                  Còn hàng
                </p>
                <p className="mt-2 text-2xl font-semibold">{inStockCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-lg border bg-card text-card-foreground shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Phân loại nhanh</CardTitle>
            <CardDescription>
              Tach nhanh theo nhom nguyen lieu dang van hanh tai chi nhanh.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
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
          </CardContent>
        </Card>

        <Card className="rounded-lg border bg-card text-card-foreground shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-4" />
              <CardTitle className="text-base">Canh bao can xu ly</CardTitle>
            </div>
            <CardDescription>
              Cac mat hang dang cham nguong an toan hoac da het ton.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-4xl font-semibold tracking-tight text-destructive">
              {String(lowCount).padStart(2, "0")}
            </p>
            <p className="text-sm leading-6 text-muted-foreground">
              Ưu tiên bổ sung các nguyên liệu `low` hoặc `out` trước khi chạm
              đỉnh ca vận hành tiếp theo.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-lg border bg-card text-card-foreground shadow-sm">
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <CardTitle>Danh sach ton kho chi nhanh</CardTitle>
              <CardDescription>
                Ket hop ton hien tai, WAC, nguong min/max va moc kiem ke gan
                nhat de branch flow khong bi dut mach.
              </CardDescription>
            </div>
            <div className="grid gap-3 xl:grid-cols-[minmax(0,320px)_auto]">
              <div className="rounded-lg border bg-muted/30 text-card-foreground flex h-11 items-center gap-3 px-3">
                <Search className="size-4 shrink-0 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Tìm tên hoặc SKU"
                  className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {stockFilterOptions.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    size="sm"
                    variant={
                      stockFilter === option.value ? "default" : "outline"
                    }
                    onClick={() => setStockFilter(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>{filtered.length} nguyên liệu phù hợp bộ lọc hiện tại</span>
            <div className="flex flex-wrap gap-2">
              <Badge variant="destructive">Hết / sắp hết</Badge>
              <Badge variant="warning">Chạm ngưỡng reorder</Badge>
            </div>
          </div>

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
  );
}

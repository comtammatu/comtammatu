"use client";

import { useMemo, useState } from "react";
import { Pencil, Search } from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { Input } from "@comtammatu/ui/components/input";
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
import { InventoryHeader } from "../_components/inventory-header";
import { TableEmptyStateRow } from "../_components/table-empty-state-row";
import { formatVND } from "../_lib/format";
import { fetchIngredients } from "../actions";
import { IngredientDialog } from "./ingredient-dialog";
import type { IngredientRow } from "./ingredient-dialog";

export type { IngredientRow };

const categoryOptions = [
  { value: "all", label: "Tất cả loại" },
  { value: "Thịt", label: "Thịt" },
  { value: "Rau củ", label: "Rau củ" },
  { value: "Gia vị", label: "Gia vị" },
  { value: "Gạo", label: "Gạo" },
];

const preservationOptions = [
  { value: "all", label: "Mọi bảo quản" },
  { value: "refrigerated", label: "Mát" },
  { value: "frozen", label: "Đông" },
  { value: "ambient", label: "Khô" },
];

const categoryToneClass: Record<string, string> = {
  Thịt: "bg-destructive/10 text-destructive",
  Gạo: "bg-primary/10 text-primary",
  "Gia vị": "bg-warning/10 text-warning",
  "Rau củ": "bg-success/10 text-success",
  Trứng: "bg-primary/10 text-primary",
  "Chế biến": "bg-info/10 text-info",
  Dầu: "bg-muted text-muted-foreground",
};

function storageLabel(type: string | null): string {
  if (type === "refrigerated") return "0-4°C";
  if (type === "frozen") return "-18°C";
  return "Nhiệt độ phòng";
}

export function IngredientsClient({ initial }: { initial: IngredientRow[] }) {
  const [rows, setRows] = useState(initial);
  const [searchQuery, setSearchQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [preservation, setPreservation] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingIngredient, setEditingIngredient] =
    useState<IngredientRow | null>(null);

  const filtered = useMemo(() => {
    let result = rows;
    if (category !== "all") {
      result = result.filter((item) => item.category === category);
    }
    if (preservation !== "all") {
      result = result.filter(
        (item) => (item.storage_type ?? "ambient") === preservation,
      );
    }
    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();
      result = result.filter(
        (item) =>
          item.name.toLowerCase().includes(query) ||
          (item.sku ?? "").toLowerCase().includes(query),
      );
    }
    return result;
  }, [rows, category, preservation, searchQuery]);

  const activeCount = rows.filter((item) => item.is_active).length;
  const chilledCount = rows.filter(
    (item) =>
      item.storage_type === "refrigerated" || item.storage_type === "frozen",
  ).length;

  async function reload() {
    const response = await fetchIngredients();
    if (response.success) {
      setRows((response.data ?? []) as IngredientRow[]);
    }
  }

  function openCreate() {
    setEditingIngredient(null);
    setDialogOpen(true);
  }

  function openEdit(row: IngredientRow) {
    setEditingIngredient(row);
    setDialogOpen(true);
  }

  return (
    <>
      <InventoryHeader
        title="Nguyên liệu"
        actions={
          <Button type="button" onClick={openCreate}>
            Tạo nguyên liệu
          </Button>
        }
      />
      <div className="space-y-6">

      <div className="grid gap-3 md:grid-cols-3">
        <Card><CardContent>
          <Badge variant="secondary">
            Tổng nguyên liệu
          </Badge>
          <p className="mt-3 text-3xl font-semibold">{rows.length}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Danh mục đang phục vụ nhập hàng, kho và recipe.
          </p>
        </CardContent></Card>
        <Card><CardContent>
          <Badge variant="secondary">
            Đang hoạt động
          </Badge>
          <p className="mt-3 text-3xl font-semibold">{activeCount}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Mặt hàng đang sẵn sàng sử dụng trong vận hành.
          </p>
        </CardContent></Card>
        <Card><CardContent>
          <Badge variant="secondary">
            Cần chuỗi lạnh
          </Badge>
          <p className="mt-3 text-3xl font-semibold">{chilledCount}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Nhóm nguyên liệu đòi hỏi bảo quản lạnh hoặc đông.
          </p>
        </CardContent></Card>
      </div>

      <Card className="py-0"><CardContent className="flex flex-wrap items-center gap-3 p-3">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Tìm theo tên hoặc SKU"
            className="pl-10"
          />
        </div>

        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="min-w-[13rem]">
            <SelectValue placeholder="Tất cả loại" />
          </SelectTrigger>
          <SelectContent>
            {categoryOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={preservation} onValueChange={setPreservation}>
          <SelectTrigger className="min-w-[13rem]">
            <SelectValue placeholder="Mọi bảo quản" />
          </SelectTrigger>
          <SelectContent>
            {preservationOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Badge variant="outline" className="rounded-full">
          {filtered.length} / {rows.length} nguyên liệu
        </Badge>
      </CardContent></Card>

      <Card className="overflow-hidden">
        <CardHeader className="gap-1">
          <CardTitle>Bảng nguyên liệu</CardTitle>
          <p className="text-sm text-muted-foreground">
            Tên chuẩn, SKU, bảo quản, ngưỡng tồn và trạng thái sử dụng.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-52">Nguyên liệu</TableHead>
                <TableHead className="min-w-28">SKU</TableHead>
                <TableHead className="min-w-28">Đơn vị</TableHead>
                <TableHead className="min-w-36">Bảo quản</TableHead>
                <TableHead className="min-w-32">Giá tham chiếu</TableHead>
                <TableHead className="min-w-44">Ngưỡng tồn</TableHead>
                <TableHead className="min-w-28">Trạng thái</TableHead>
                <TableHead className="w-24 text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableEmptyStateRow
                  colSpan={8}
                  title={
                    searchQuery.trim()
                      ? "Không tìm thấy nguyên liệu phù hợp"
                      : "Chưa có nguyên liệu"
                  }
                  description={
                    searchQuery.trim()
                      ? "Thử bộ lọc hoặc từ khóa khác."
                      : 'Nhấn "Tạo nguyên liệu" để bắt đầu danh mục.'
                  }
                />
              ) : null}

              {filtered.map((item) => {
                const categoryTone =
                  categoryToneClass[item.category ?? ""] ??
                  "bg-muted text-muted-foreground";
                const isActive = item.is_active;

                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold">{item.name}</p>
                          {item.category ? (
                            <Badge className={categoryTone}>
                              {item.category}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Dùng chung cho kho, nhập hàng và sản xuất.
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {item.sku || "—"}
                    </TableCell>
                    <TableCell>{item.unit}</TableCell>
                    <TableCell>{storageLabel(item.storage_type)}</TableCell>
                    <TableCell className="font-mono">
                      {item.unit_cost ? `${formatVND(item.unit_cost)}đ` : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="destructive">
                          Min {item.min_stock_level ?? 0}
                        </Badge>
                        <Badge variant="secondary">
                          Max {item.max_stock_level ?? 0}
                        </Badge>
                        <Badge variant="success">
                          Re {item.reorder_point ?? 0}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={isActive ? "success" : "secondary"}>
                        {isActive ? "Đang hoạt động" : "Tạm ngưng"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => openEdit(item)}
                        aria-label={`Sửa ${item.name}`}
                      >
                        <Pencil className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <IngredientDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        ingredient={editingIngredient}
        onSaved={reload}
      />
    </div>
    </>
  );
}

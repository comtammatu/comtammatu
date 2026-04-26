"use client";

import { useMemo, useState } from "react";
import { Pencil as IconPencil, Search as IconSearch } from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import { toast } from "@comtammatu/ui/components/sonner";
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
import { cn } from "@comtammatu/ui";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { matchesSearch } from "@lib/search";
import { InventoryHeader } from "../_components/inventory-header";
import { InteractiveCard } from "../_components/interactive-card";
import { StatusBadge } from "../_components/status-badge";
import { TableEmptyStateRow } from "../_components/table-empty-state-row";
import { formatVND } from "../_lib/format";
import { CATEGORY_TONE_CLASS } from "../_lib/constants";
import { fetchIngredients } from "../actions";
import { IngredientDialog } from "./ingredient-dialog";
import type { IngredientRow } from "../_lib/types";
import { IngredientImportExportMenu } from "./import-export-menu";

const preservationOptions = [
  { value: "all", label: "Mọi bảo quản" },
  { value: "refrigerated", label: "Mát" },
  { value: "frozen", label: "Đông lạnh" },
  { value: "ambient", label: "Khô" },
];

function storageLabel(type: string | null): string {
  if (type === "refrigerated") return "0–4°C";
  if (type === "frozen") return "−18°C";
  return "Nhiệt độ phòng";
}

const conversionNumberFormatter = new Intl.NumberFormat("vi-VN", {
  maximumFractionDigits: 6,
});

function conversionLabel(item: IngredientRow): string {
  return `1 ${item.purchase_unit} = ${conversionNumberFormatter.format(item.purchase_to_measure_factor ?? 1)} ${item.measure_unit}`;
}

export function IngredientsClient({ initial }: { initial: IngredientRow[] }) {
  const isMobile = useIsMobile();
  const [rows, setRows] = useState(initial);
  const [searchQuery, setSearchQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [preservation, setPreservation] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingIngredient, setEditingIngredient] =
    useState<IngredientRow | null>(null);

  const categoryOptions = useMemo(() => {
    const unique = [...new Set(rows.map((r) => r.category).filter(Boolean))];
    return [
      { value: "all", label: "Tất cả loại" },
      ...unique.map((c) => ({ value: c!, label: c! })),
    ];
  }, [rows]);

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
      result = result.filter((item) =>
        matchesSearch([item.name, item.sku], searchQuery),
      );
    }
    return result;
  }, [rows, category, preservation, searchQuery]);

  async function reload() {
    try {
      const response = await fetchIngredients();
      if (response.success) {
        setRows((response.data ?? []) as IngredientRow[]);
        return;
      }
      toast.error(response.error ?? "Không thể tải lại danh sách nguyên liệu.");
    } catch {
      toast.error("Không thể tải lại danh sách nguyên liệu.");
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

  const filterBar = (
    <Card className="py-0">
      <CardContent className="flex flex-wrap items-center gap-3 p-3">
        <InputGroup className="h-10 flex-1">
          <InputGroupAddon>
            <IconSearch />
          </InputGroupAddon>
          <InputGroupInput
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Tìm theo tên hoặc SKU"
          />
        </InputGroup>

        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-40">
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
          <SelectTrigger className="w-40">
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
      </CardContent>
    </Card>
  );

  if (isMobile) {
    return (
      <>
        <InventoryHeader
          title="Nguyên liệu"
          actions={
            <div className="flex items-center gap-2">
              <IngredientImportExportMenu onImported={reload} />
              <Button type="button" onClick={openCreate}>
                Tạo nguyên liệu
              </Button>
            </div>
          }
        />
        <div className="flex-1 overflow-auto p-4">
          <div className="space-y-4">
            {filterBar}

            {filtered.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center">
                  <p className="text-sm font-semibold">
                    {searchQuery.trim()
                      ? "Không tìm thấy nguyên liệu phù hợp"
                      : "Chưa có nguyên liệu"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {searchQuery.trim()
                      ? "Thử bộ lọc hoặc từ khóa khác."
                      : 'Nhấn "Tạo nguyên liệu" để bắt đầu danh mục.'}
                  </p>
                </CardContent>
              </Card>
            ) : null}

            <div className="space-y-2">
              {filtered.map((item) => {
                const categoryTone =
                  CATEGORY_TONE_CLASS[item.category ?? ""] ??
                  "bg-muted text-muted-foreground";

                return (
                  <InteractiveCard
                    key={item.id}
                    minHeight="tap"
                    className="flex-col items-stretch gap-0 p-0"
                  >
                    <div className="flex items-start justify-between gap-3 px-4 pt-3 pb-1">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-semibold">{item.name}</p>
                          {item.category ? (
                            <Badge className={cn("text-xs", categoryTone)}>
                              {item.category}
                            </Badge>
                          ) : null}
                          <StatusBadge
                            status={item.is_active ? "active" : "suspended"}
                            size="sm"
                          />
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {item.sku ?? "—"} &middot; {conversionLabel(item)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 px-4 pb-3 pt-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{storageLabel(item.storage_type)}</span>
                        {item.unit_cost ? (
                          <span className="font-mono">
                            {formatVND(item.unit_cost)}đ
                          </span>
                        ) : null}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => openEdit(item)}
                        aria-label={`Sửa ${item.name}`}
                        className="min-h-10"
                      >
                        <IconPencil className="size-4" />
                        <span className="ml-1">Sửa</span>
                      </Button>
                    </div>
                  </InteractiveCard>
                );
              })}
            </div>
          </div>
        </div>

        <IngredientDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          ingredient={editingIngredient}
          onSaved={reload}
        />
      </>
    );
  }

  return (
    <>
      <InventoryHeader
        title="Nguyên liệu"
        actions={
          <div className="flex items-center gap-2">
            <IngredientImportExportMenu onImported={reload} />
            <Button type="button" onClick={openCreate}>
              Tạo nguyên liệu
            </Button>
          </div>
        }
      />
      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto max-w-7xl space-y-4">
          {filterBar}

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-52">Nguyên liệu</TableHead>
                    <TableHead className="min-w-28">SKU</TableHead>
                    <TableHead className="min-w-40">Đơn vị</TableHead>
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
                      CATEGORY_TONE_CLASS[item.category ?? ""] ??
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
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm text-muted-foreground">
                          {item.sku || "—"}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1 text-sm">
                            <p>Nhập: {item.purchase_unit}</p>
                            <p className="text-muted-foreground">
                              Tính: {item.measure_unit}
                            </p>
                            <p className="text-muted-foreground">
                              {conversionLabel(item)}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>{storageLabel(item.storage_type)}</TableCell>
                        <TableCell className="font-mono">
                          {item.unit_cost
                            ? `${formatVND(item.unit_cost)}đ`
                            : "—"}
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
                          <StatusBadge
                            status={isActive ? "active" : "suspended"}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => openEdit(item)}
                            aria-label={`Sửa ${item.name}`}
                          >
                            <IconPencil className="size-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>

      <IngredientDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        ingredient={editingIngredient}
        onSaved={reload}
      />
    </>
  );
}

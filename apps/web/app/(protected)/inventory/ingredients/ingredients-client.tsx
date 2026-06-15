"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Ellipsis as IconDots,
  Eye as IconEye,
  EyeOff as IconEyeOff,
  Pencil as IconPencil,
  Search as IconSearch,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@comtammatu/ui/components/dropdown-menu";
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
import { cn } from "@comtammatu/ui";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { matchesSearch } from "@lib/search";
import { AppPageHeader, AppPage } from "@/components/surface";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { InteractiveCard } from "../_components/interactive-card";
import { StatusBadge } from "../_components/status-badge";
import { formatVND } from "../_lib/format";
import { CATEGORY_TONE_CLASS } from "../_lib/constants";
import { fetchIngredients, toggleIngredientActive } from "../ingredient-actions";
import { IngredientDialog } from "./ingredient-dialog";
import type { IngredientRow } from "../_lib/types";
import { IngredientImportExportMenu } from "./import-export-menu";

import { ACTIONS_VI, FORM_VI, PRODUCT_VI } from "@comtammatu/shared/messages";
const preservationOptions = [
  { value: "all", label: "Mọi bảo quản" },
  { value: "refrigerated", label: "Mát" },
  { value: "frozen", label: "Đông lạnh" },
  { value: "ambient", label: "Khô" },
];

const activeOptions = [
  { value: "active", label: "Đang dùng" },
  { value: "all", label: "Hiện cả đã ẩn" },
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

function categoryToneClass(category: string | null): string {
  return (
    CATEGORY_TONE_CLASS[category ?? ""] ?? "bg-muted text-muted-foreground"
  );
}

function ThresholdBadges({ item }: { item: IngredientRow }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Badge variant="destructive">Min {item.min_stock_level ?? 0}</Badge>
      <Badge variant="secondary">Max {item.max_stock_level ?? 0}</Badge>
      <Badge variant="success">Re {item.reorder_point ?? 0}</Badge>
    </div>
  );
}

function IngredientMobileCard({
  item,
  isPending,
  onToggleActive,
  onEdit,
}: {
  item: IngredientRow;
  isPending: boolean;
  onToggleActive: (item: IngredientRow) => void;
  onEdit: (item: IngredientRow) => void;
}) {
  return (
    <InteractiveCard minHeight="tap" className="flex-col items-stretch gap-0 p-0">
      <div className="flex items-start justify-between gap-3 px-4 pt-3 pb-1">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold">{item.name}</p>
            {item.category ? (
              <Badge className={cn("text-xs", categoryToneClass(item.category))}>
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
      <div className="px-4 py-1">
        <ThresholdBadges item={item} />
      </div>
      <div className="flex items-center justify-between gap-2 px-4 pb-3 pt-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{storageLabel(item.storage_type)}</span>
          {item.unit_cost != null ? (
            <span className="font-mono">{formatVND(item.unit_cost)}</span>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onToggleActive(item)}
            aria-label={
              item.is_active ? `Ẩn ${item.name}` : `Hiện lại ${item.name}`
            }
            disabled={isPending}
          >
            {item.is_active ? (
              <IconEyeOff className="size-4" />
            ) : (
              <IconEye className="size-4" />
            )}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onEdit(item)}
            aria-label={`Sửa ${item.name}`}
          >
            <IconPencil className="size-4" />
            <span className="ml-1">{ACTIONS_VI.edit}</span>
          </Button>
        </div>
      </div>
    </InteractiveCard>
  );
}

export function IngredientsClient({ initial }: { initial: IngredientRow[] }) {
  const isMobile = useIsMobile();
  const [rows, setRows] = useState(initial);
  const [searchQuery, setSearchQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [preservation, setPreservation] = useState("all");
  const [activeFilter, setActiveFilter] = useState<"active" | "all">("active");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingIngredient, setEditingIngredient] =
    useState<IngredientRow | null>(null);
  const [isPending, startTransition] = useTransition();

  const categoryOptions = useMemo(() => {
    const unique = [...new Set(rows.map((r) => r.category).filter(Boolean))];
    return [
      { value: "all", label: "Tất cả loại" },
      ...unique.map((c) => ({ value: c!, label: c! })),
    ];
  }, [rows]);

  const filtered = useMemo(() => {
    let result = rows;
    if (activeFilter === "active") {
      result = result.filter((item) => item.is_active);
    }
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
  }, [rows, activeFilter, category, preservation, searchQuery]);

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

  function handleToggleActive(item: IngredientRow) {
    startTransition(async () => {
      const result = await toggleIngredientActive({ id: item.id });
      if (!result.success) {
        toast.error(result.error ?? "Không thể đổi trạng thái nguyên liệu.");
        return;
      }
      setRows((prev) =>
        prev.map((r) =>
          r.id === item.id ? { ...r, is_active: !r.is_active } : r,
        ),
      );
      toast.success(
        item.is_active
          ? `Đã ẩn "${item.name}".`
          : `Đã hiện lại "${item.name}".`,
      );
    });
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

        <Select
          value={activeFilter}
          onValueChange={(value) => setActiveFilter(value as "active" | "all")}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {activeOptions.map((option) => (
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

  const columns: DataTableColumn<IngredientRow>[] = [
    {
      key: "name",
      header: PRODUCT_VI.rawIngredient,
      className: "min-w-52",
      render: (item) => (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <p className="font-semibold">{item.name}</p>
            {item.category ? (
              <Badge className={categoryToneClass(item.category)}>
                {item.category}
              </Badge>
            ) : null}
          </div>
        </div>
      ),
    },
    {
      key: "sku",
      header: "SKU",
      className: "min-w-28",
      render: (item) => (
        <span className="font-mono text-sm text-muted-foreground">
          {item.sku || "—"}
        </span>
      ),
    },
    {
      key: "unit",
      header: FORM_VI.unit,
      className: "min-w-40",
      render: (item) => (
        <div className="space-y-1 text-sm">
          <p>Nhập: {item.purchase_unit}</p>
          <p className="text-muted-foreground">Tính: {item.measure_unit}</p>
          <p className="text-muted-foreground">{conversionLabel(item)}</p>
        </div>
      ),
    },
    {
      key: "storage",
      header: "Bảo quản",
      className: "min-w-36",
      render: (item) => storageLabel(item.storage_type),
    },
    {
      key: "unit_cost",
      header: "Giá tham chiếu",
      className: "min-w-32",
      render: (item) => (
        <span className="font-mono">
          {item.unit_cost != null ? formatVND(item.unit_cost) : "—"}
        </span>
      ),
    },
    {
      key: "thresholds",
      header: "Ngưỡng tồn",
      className: "min-w-44",
      render: (item) => <ThresholdBadges item={item} />,
    },
    {
      key: "status",
      header: FORM_VI.status,
      className: "min-w-28",
      render: (item) => (
        <StatusBadge status={item.is_active ? "active" : "suspended"} />
      ),
    },
    {
      key: "actions",
      header: FORM_VI.action,
      className: "w-24 text-right",
      render: (item) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={`Tác vụ cho ${item.name}`}
              disabled={isPending}
            >
              <IconDots className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openEdit(item)}>
              <IconPencil className="mr-2 size-4" />
              {ACTIONS_VI.edit}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => handleToggleActive(item)}>
              {item.is_active ? (
                <>
                  <IconEyeOff className="mr-2 size-4" />
                  Ẩn nguyên liệu
                </>
              ) : (
                <>
                  <IconEye className="mr-2 size-4" />
                  Hiện lại
                </>
              )}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <AppPage mobile={isMobile} scroll>
      <AppPageHeader
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
      {filterBar}

      <DataTable
        columns={columns}
        data={filtered}
        getRowKey={(item) => item.id}
        emptyTitle={
          searchQuery.trim()
            ? "Không tìm thấy nguyên liệu phù hợp"
            : "Chưa có nguyên liệu"
        }
        emptyDescription={
          searchQuery.trim()
            ? "Thử bộ lọc hoặc từ khóa khác."
            : 'Nhấn "Tạo nguyên liệu" để bắt đầu danh mục.'
        }
        emptyMode={searchQuery.trim() ? "no-results" : "no-data"}
        mobileCardRender={(item) => (
          <IngredientMobileCard
            item={item}
            isPending={isPending}
            onToggleActive={handleToggleActive}
            onEdit={openEdit}
          />
        )}
      />

      <IngredientDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        ingredient={editingIngredient}
        onSaved={reload}
      />
    </AppPage>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import { PackageSearch, Pencil, Plus, Search } from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";
import { ACTIVE_STATE_LABELS_VI } from "@comtammatu/shared/labels";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { IngredientFormDialog } from "./ingredient-form-dialog";
import { TableEmptyStateRow } from "./_components/table-empty-state-row";
import type { IngredientRow } from "./page";

const STORAGE_LABELS: Record<string, string> = {
  ambient: "Thường",
  refrigerated: "Lạnh",
  frozen: "Đông lạnh",
};

const ITEM_KIND_LABELS: Record<string, string> = {
  raw_material: "Nguyên liệu",
  finished_good: "Thành phẩm",
};

interface IngredientTableProps {
  ingredients: IngredientRow[];
  onIngredientAdded: (ingredient: IngredientRow) => void;
  onIngredientUpdated: (ingredient: IngredientRow) => void;
  /** CRUD danh mục — chỉ Trụ sở (super_manager) */
  canManageCatalog: boolean;
}

export function IngredientTable({
  ingredients,
  onIngredientAdded,
  onIngredientUpdated,
  canManageCatalog,
}: IngredientTableProps) {
  const [search, setSearch] = useState("");
  const [editItem, setEditItem] = useState<IngredientRow | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [_isPending, startTransition] = useTransition();
  const isMobile = useIsMobile();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ingredients;
    return ingredients.filter(
      (ing) =>
        ing.name.toLowerCase().includes(q) ||
        (ing.sku ?? "").toLowerCase().includes(q) ||
        (ing.category ?? "").toLowerCase().includes(q),
    );
  }, [ingredients, search]);

  function handleSaved(saved: IngredientRow) {
    startTransition(() => {
      if (editItem) {
        onIngredientUpdated(saved);
      } else {
        onIngredientAdded(saved);
      }
    });
  }

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        {canManageCatalog && (
          <Button onClick={() => setAddOpen(true)} className="ml-auto">
            <Plus className="mr-2 size-4" />
            Thêm nguyên liệu
          </Button>
        )}
      </div>

      <Card className="overflow-hidden rounded-lg">
        <CardHeader>
          <CardTitle>Danh mục nguyên liệu</CardTitle>
          <p className="text-sm text-muted-foreground">
            Bộ dữ liệu dùng chung cho toàn hệ thống kho và settings.
          </p>
        </CardHeader>
        <CardContent className="px-4 sm:px-5">
          <Card className="mb-4 py-0"><CardContent className="flex flex-wrap items-center gap-3 p-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <Input
              placeholder="Tìm tên, SKU, danh mục…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-w-0 flex-1 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
            />
            <span className="shrink-0 text-xs text-muted-foreground">
              {filtered.length} / {ingredients.length}
            </span>
          </CardContent></Card>

          {isMobile ? (
            <div className="space-y-3">
              {filtered.length === 0 && (
                <div className="py-16 text-center">
                  <PackageSearch className="mx-auto size-8 text-muted-foreground" />
                  <p className="mt-2 text-sm font-medium text-muted-foreground">
                    {search
                      ? "Không tìm thấy nguyên liệu nào"
                      : "Chưa có nguyên liệu nào"}
                  </p>
                </div>
              )}
              {filtered.map((ing) => (
                <Card
                  key={ing.id}
                  className="bg-muted/30 flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {ing.name}
                      </span>
                      {!ing.is_active && (
                        <Badge variant="outline" className="text-xs shrink-0">
                          {ACTIVE_STATE_LABELS_VI.inactive}
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-xs shrink-0">
                        {ITEM_KIND_LABELS[ing.item_kind] ?? ing.item_kind}
                      </Badge>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {ing.sku && <>{ing.sku} · </>}
                      {ing.unit}
                      {ing.category && <> · {ing.category}</>}
                      {ing.unit_cost != null && (
                        <> · {formatVND(ing.unit_cost)}</>
                      )}
                      {" · "}
                      {STORAGE_LABELS[ing.storage_type] ?? ing.storage_type}
                    </p>
                  </div>
                  {canManageCatalog && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0"
                      aria-label={`Chỉnh sửa ${ing.name}`}
                      onClick={() => setEditItem(ing)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                  )}
                </Card>
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tên</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Đơn vị</TableHead>
                  <TableHead className="text-right">Giá nhập</TableHead>
                  <TableHead>Danh mục</TableHead>
                  <TableHead>Lưu trữ</TableHead>
                  {canManageCatalog && <TableHead className="w-12" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableEmptyStateRow
                    colSpan={canManageCatalog ? 7 : 6}
                    paddingClassName="py-16"
                    icon={
                      <PackageSearch className="mx-auto size-8 text-muted-foreground" />
                    }
                    title={
                      search
                        ? "Không tìm thấy nguyên liệu nào"
                        : "Chưa có nguyên liệu nào"
                    }
                  />
                )}
                {filtered.map((ing) => (
                  <TableRow key={ing.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{ing.name}</span>
                        {!ing.is_active && (
                          <Badge variant="outline" className="text-xs">
                            {ACTIVE_STATE_LABELS_VI.inactive}
                          </Badge>
                        )}
                        <Badge variant="secondary" className="text-xs">
                          {ITEM_KIND_LABELS[ing.item_kind] ?? ing.item_kind}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {ing.sku ?? "—"}
                    </TableCell>
                    <TableCell>{ing.unit}</TableCell>
                    <TableCell className="text-right font-mono">
                      {ing.unit_cost != null ? formatVND(ing.unit_cost) : "—"}
                    </TableCell>
                    <TableCell>
                      {ing.category ? (
                        <Badge variant="secondary">{ing.category}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {STORAGE_LABELS[ing.storage_type] ?? ing.storage_type}
                      </Badge>
                    </TableCell>
                    {canManageCatalog && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon-lg"
                          aria-label={`Chỉnh sửa ${ing.name}`}
                          onClick={() => setEditItem(ing)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {canManageCatalog && (
        <>
          <IngredientFormDialog
            open={addOpen}
            onOpenChange={setAddOpen}
            ingredient={null}
            onSaved={(saved) => {
              handleSaved(saved);
              setAddOpen(false);
            }}
          />

          <IngredientFormDialog
            open={!!editItem}
            onOpenChange={(open) => !open && setEditItem(null)}
            ingredient={editItem}
            onSaved={(saved) => {
              handleSaved(saved);
              setEditItem(null);
            }}
          />
        </>
      )}
    </>
  );
}

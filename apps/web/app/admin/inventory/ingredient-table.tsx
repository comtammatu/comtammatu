"use client";

import { useMemo, useState, useTransition } from "react";
import { PackageSearch, Pencil, Plus, Search } from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
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
import type { IngredientRow } from "./page";

const STORAGE_LABELS: Record<string, string> = {
  ambient: "Thường",
  refrigerated: "Lạnh",
  frozen: "Đông lạnh",
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

      {/* Table card */}
      <div className="rounded-lg border shadow-sm overflow-hidden">
        {/* Search bar */}
        <div className="flex items-center gap-3 border-b bg-muted/20 px-4 py-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            placeholder="Tìm tên, SKU, danh mục…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 min-w-0 flex-1 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
          />
          <span className="shrink-0 text-xs text-muted-foreground">
            {filtered.length} / {ingredients.length}
          </span>
        </div>

        {/* Mobile: card layout */}
        {isMobile ? (
          <div className="divide-y">
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
              <div
                key={ing.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">
                      {ing.name}
                    </span>
                    {!ing.is_active && (
                      <Badge variant="outline" className="text-xs shrink-0">
                        Ngừng
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
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
              </div>
            ))}
          </div>
        ) : (
          /* Desktop: table layout */
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/20 hover:bg-muted/20">
                <TableHead className="text-xs font-semibold uppercase tracking-wider">
                  Tên
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">
                  SKU
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">
                  Đơn vị
                </TableHead>
                <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">
                  Giá nhập
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">
                  Danh mục
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">
                  Lưu trữ
                </TableHead>
                {canManageCatalog && <TableHead className="w-12" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={canManageCatalog ? 7 : 6}
                    className="py-12 text-center"
                  >
                    <PackageSearch className="mx-auto size-8 text-muted-foreground" />
                    <p className="mt-2 text-sm text-muted-foreground">
                      {search
                        ? "Không tìm thấy nguyên liệu nào"
                        : "Chưa có nguyên liệu nào"}
                    </p>
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((ing) => (
                <TableRow
                  key={ing.id}
                  className="hover:bg-muted/30 transition-colors"
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{ing.name}</span>
                      {!ing.is_active && (
                        <Badge variant="outline" className="text-xs">
                          Ngừng
                        </Badge>
                      )}
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
                        size="icon"
                        className="size-8"
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
      </div>

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

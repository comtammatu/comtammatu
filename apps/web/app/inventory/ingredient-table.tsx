"use client";

import { useMemo, useState, useTransition } from "react";
import { PackageSearch, Pencil, Plus, Search } from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";
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
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="ml-auto inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-md transition-shadow hover:shadow-lg"
            style={{
              background:
                "linear-gradient(135deg, var(--md-primary), var(--md-primary-container))",
            }}
          >
            <Plus className="size-4" />
            Thêm nguyên liệu
          </button>
        )}
      </div>

      {/* Table card */}
      <div
        className="overflow-hidden rounded-3xl ambient-shadow"
        style={{
          backgroundColor: "var(--md-surface-lowest)",
          border:
            "1px solid color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
        }}
      >
        {/* Search bar */}
        <div
          className="flex items-center gap-3 border-b px-6 py-3"
          style={{
            borderColor:
              "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
          }}
        >
          <Search
            className="size-4 shrink-0"
            style={{ color: "var(--md-outline)" }}
          />
          <Input
            placeholder="Tìm tên, SKU, danh mục…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 min-w-0 flex-1 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
          />
          <span
            className="shrink-0 text-xs font-medium"
            style={{ color: "var(--md-outline)" }}
          >
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
                style={{
                  borderColor:
                    "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
                }}
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">
                      {ing.name}
                    </span>
                    {!ing.is_active && (
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold shrink-0"
                        style={{
                          backgroundColor: "var(--md-surface-high)",
                          color: "var(--md-on-surface-variant)",
                        }}
                      >
                        Ngừng
                      </span>
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
              <TableRow
                className="hover:bg-transparent"
                style={{
                  backgroundColor:
                    "color-mix(in srgb, var(--md-surface-low) 50%, transparent)",
                }}
              >
                <TableHead
                  className="px-6 py-4 text-xs font-bold uppercase tracking-widest"
                  style={{ color: "var(--md-outline)" }}
                >
                  Tên
                </TableHead>
                <TableHead
                  className="px-4 py-4 text-xs font-bold uppercase tracking-widest"
                  style={{ color: "var(--md-outline)" }}
                >
                  SKU
                </TableHead>
                <TableHead
                  className="px-4 py-4 text-xs font-bold uppercase tracking-widest"
                  style={{ color: "var(--md-outline)" }}
                >
                  Đơn vị
                </TableHead>
                <TableHead
                  className="text-right px-4 py-4 text-xs font-bold uppercase tracking-widest"
                  style={{ color: "var(--md-outline)" }}
                >
                  Giá nhập
                </TableHead>
                <TableHead
                  className="px-4 py-4 text-xs font-bold uppercase tracking-widest"
                  style={{ color: "var(--md-outline)" }}
                >
                  Danh mục
                </TableHead>
                <TableHead
                  className="px-4 py-4 text-xs font-bold uppercase tracking-widest"
                  style={{ color: "var(--md-outline)" }}
                >
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
                  className="group transition-colors"
                  style={{
                    borderColor:
                      "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
                  }}
                >
                  <TableCell className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{ing.name}</span>
                      {!ing.is_active && (
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
                          style={{
                            backgroundColor: "var(--md-surface-high)",
                            color: "var(--md-on-surface-variant)",
                          }}
                        >
                          Ngừng
                        </span>
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
                  <TableCell className="px-4">
                    {ing.category ? (
                      <span
                        className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
                        style={{
                          backgroundColor: "var(--md-secondary-container)",
                          color: "var(--md-on-secondary-container)",
                        }}
                      >
                        {ing.category}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="px-4">
                    <span
                      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
                      style={{
                        backgroundColor: "var(--md-surface-high)",
                        color: "var(--md-on-surface-variant)",
                      }}
                    >
                      {STORAGE_LABELS[ing.storage_type] ?? ing.storage_type}
                    </span>
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

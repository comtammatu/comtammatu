"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus, PackageSearch } from "lucide-react";
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
}

export function IngredientTable({
  ingredients,
  onIngredientAdded,
  onIngredientUpdated,
}: IngredientTableProps) {
  const [search, setSearch] = useState("");
  const [editItem, setEditItem] = useState<IngredientRow | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [_isPending, startTransition] = useTransition();

  const filtered = ingredients.filter((ing) =>
    ing.name.toLowerCase().includes(search.toLowerCase()),
  );

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
        <Input
          placeholder="Tìm theo tên..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 size-4" />
          Thêm nguyên liệu
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tên</TableHead>
              <TableHead className="hidden sm:table-cell">SKU</TableHead>
              <TableHead>Đơn vị</TableHead>
              <TableHead className="hidden md:table-cell text-right">
                Giá nhập
              </TableHead>
              <TableHead className="hidden lg:table-cell">Danh mục</TableHead>
              <TableHead className="hidden lg:table-cell">Lưu trữ</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center">
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
              <TableRow key={ing.id}>
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
                <TableCell className="hidden sm:table-cell font-mono text-sm text-muted-foreground">
                  {ing.sku ?? "—"}
                </TableCell>
                <TableCell>{ing.unit}</TableCell>
                <TableCell className="hidden md:table-cell text-right font-mono">
                  {ing.unit_cost != null ? formatVND(ing.unit_cost) : "—"}
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  {ing.category ? (
                    <Badge variant="secondary">{ing.category}</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <Badge variant="outline">
                    {STORAGE_LABELS[ing.storage_type] ?? ing.storage_type}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => setEditItem(ing)}
                  >
                    <Pencil className="size-4" />
                    <span className="sr-only">Chỉnh sửa</span>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Add dialog */}
      <IngredientFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        ingredient={null}
        onSaved={(saved) => {
          handleSaved(saved);
          setAddOpen(false);
        }}
      />

      {/* Edit dialog */}
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
  );
}

"use client";

import { useState, useTransition } from "react";
import {
  IconDots,
  IconPencil,
  IconToggleLeft,
  IconToggleRight,
  IconFolderOpen,
} from "@tabler/icons-react";
import { ACTIVE_STATE_LABELS_VI } from "@comtammatu/shared/labels";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@comtammatu/ui/components/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { toggleCategoryActive } from "./actions";
import { CategoryFormDialog } from "./category-form-dialog";
import { toast } from "@comtammatu/ui/components/sonner";
import { CATEGORY_TYPE_LABELS } from "./category-labels";
import { TableEmptyStateRow } from "@/admin/components/table-empty-state-row";

export interface CategoryRow {
  id: number;
  name: string;
  type: string;
  sort_order: number;
  is_active: boolean;
}

interface CategoryTableProps {
  categories: CategoryRow[];
}

export function CategoryTable({ categories }: CategoryTableProps) {
  const [editCategory, setEditCategory] = useState<CategoryRow | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleToggleActive(id: number) {
    startTransition(async () => {
      const result = await toggleCategoryActive({ id });
      if (!result.success) {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tên danh mục</TableHead>
              <TableHead className="hidden sm:table-cell">Loại</TableHead>
              <TableHead className="hidden md:table-cell">Thứ tự</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.length === 0 && (
              <TableEmptyStateRow
                colSpan={5}
                title="Chưa có danh mục nào"
                icon={
                  <IconFolderOpen className="mx-auto size-8 text-muted-foreground" />
                }
              />
            )}
            {categories.map((cat) => (
              <TableRow key={cat.id} className={isPending ? "opacity-60" : ""}>
                <TableCell>
                  <div className="space-y-1">
                    <span className="font-medium">{cat.name}</span>
                    <div className="space-y-1 sm:hidden">
                      <p className="text-xs text-muted-foreground">
                        {CATEGORY_TYPE_LABELS[cat.type] ?? cat.type}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Thứ tự {cat.sort_order}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <Badge variant="secondary">
                    {CATEGORY_TYPE_LABELS[cat.type] ?? cat.type}
                  </Badge>
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {cat.sort_order}
                </TableCell>
                <TableCell>
                  <Badge variant={cat.is_active ? "default" : "outline"}>
                    {cat.is_active
                      ? ACTIVE_STATE_LABELS_VI.active
                      : ACTIVE_STATE_LABELS_VI.inactive}
                  </Badge>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-9 rounded-full"
                      >
                        <IconDots className="size-4" />
                        <span className="sr-only">Menu</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditCategory(cat)}>
                        <IconPencil className="mr-2 size-4" />
                        Chỉnh sửa
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleToggleActive(cat.id)}
                      >
                        {cat.is_active ? (
                          <>
                            <IconToggleLeft className="mr-2 size-4" />
                            Vô hiệu hóa
                          </>
                        ) : (
                          <>
                            <IconToggleRight className="mr-2 size-4" />
                            Kích hoạt
                          </>
                        )}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <CategoryFormDialog
        open={!!editCategory}
        onOpenChange={(open) => !open && setEditCategory(null)}
        category={editCategory}
      />
    </>
  );
}

"use client";

import { useState, useTransition } from "react";
import {
  MoreHorizontal,
  Pencil,
  ToggleLeft,
  ToggleRight,
  FolderOpen,
} from "lucide-react";
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
      const result = await toggleCategoryActive(id);
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
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center">
                  <FolderOpen className="mx-auto size-8 text-muted-foreground" />
                  <p className="mt-2 text-sm text-muted-foreground">
                    Chưa có danh mục nào
                  </p>
                </TableCell>
              </TableRow>
            )}
            {categories.map((cat) => (
              <TableRow key={cat.id} className={isPending ? "opacity-60" : ""}>
                <TableCell>
                  <span className="font-medium">{cat.name}</span>
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
                    {cat.is_active ? "Hoạt động" : "Ngừng"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-8">
                        <MoreHorizontal className="size-4" />
                        <span className="sr-only">Menu</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditCategory(cat)}>
                        <Pencil className="mr-2 size-4" />
                        Chỉnh sửa
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleToggleActive(cat.id)}
                      >
                        {cat.is_active ? (
                          <>
                            <ToggleLeft className="mr-2 size-4" />
                            Vô hiệu hóa
                          </>
                        ) : (
                          <>
                            <ToggleRight className="mr-2 size-4" />
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

"use client";

import { useState, useTransition } from "react";
import {
  MoreHorizontal,
  Pencil,
  ToggleLeft,
  ToggleRight,
  Settings2,
  UtensilsCrossed,
} from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { toggleItemActive } from "./actions";
import { ItemFormDialog } from "./item-form-dialog";
import { ItemDetailDialog } from "./item-detail-dialog";
import { toast } from "@comtammatu/ui/components/sonner";
import type { CategoryRow } from "./category-table";

export interface ItemRow {
  id: number;
  name: string;
  description: string | null;
  base_price: number;
  category_id: number;
  category_name: string;
  category_type: string;
  is_active: boolean;
  sort_order: number;
}

interface ItemTableProps {
  items: ItemRow[];
  categories: CategoryRow[];
}

export function ItemTable({ items, categories }: ItemTableProps) {
  const [editItem, setEditItem] = useState<ItemRow | null>(null);
  const [detailItem, setDetailItem] = useState<ItemRow | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleToggleActive(id: number) {
    startTransition(async () => {
      const result = await toggleItemActive(id);
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
              <TableHead>Tên món</TableHead>
              <TableHead className="hidden sm:table-cell">Danh mục</TableHead>
              <TableHead className="hidden md:table-cell text-right">
                Giá
              </TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center">
                  <UtensilsCrossed className="mx-auto size-8 text-muted-foreground" />
                  <p className="mt-2 text-sm text-muted-foreground">
                    Chưa có món ăn nào
                  </p>
                </TableCell>
              </TableRow>
            )}
            {items.map((item) => (
              <TableRow key={item.id} className={isPending ? "opacity-60" : ""}>
                <TableCell>
                  <div>
                    <span className="font-medium">{item.name}</span>
                    {item.description && (
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {item.description}
                      </p>
                    )}
                  </div>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <Badge variant="secondary">{item.category_name}</Badge>
                </TableCell>
                <TableCell className="hidden md:table-cell text-right font-mono">
                  {formatVND(item.base_price)}
                </TableCell>
                <TableCell>
                  <Badge variant={item.is_active ? "default" : "outline"}>
                    {item.is_active ? "Hoạt động" : "Ngừng"}
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
                      <DropdownMenuItem onClick={() => setEditItem(item)}>
                        <Pencil className="mr-2 size-4" />
                        Chỉnh sửa
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setDetailItem(item)}>
                        <Settings2 className="mr-2 size-4" />
                        Biến thể & Tùy chọn
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => handleToggleActive(item.id)}
                      >
                        {item.is_active ? (
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

      <ItemFormDialog
        open={!!editItem}
        onOpenChange={(open) => !open && setEditItem(null)}
        item={editItem}
        categories={categories}
      />

      <ItemDetailDialog
        open={!!detailItem}
        onOpenChange={(open) => !open && setDetailItem(null)}
        item={detailItem}
        allItems={items}
      />
    </>
  );
}

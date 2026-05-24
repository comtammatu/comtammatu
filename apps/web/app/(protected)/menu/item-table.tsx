"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { Ellipsis as IconDots, Pencil as IconPencil, ToggleLeft as IconToggleLeft, ToggleRight as IconToggleRight, SlidersHorizontal as IconSettings2, Utensils as IconToolsKitchen, Image as IconImage } from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";
import { ACTIVE_STATE_LABELS_VI } from "@comtammatu/shared/labels";
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
import { TableEmptyStateRow } from "@/components/table-empty-state-row";

import { FORM_VI } from "@comtammatu/shared/messages";
export interface ItemRow {
  id: number;
  name: string;
  description: string | null;
  base_price: number;
  category_id: number;
  category_name: string;
  category_type: string;
  image_url: string | null;
  is_active: boolean;
  sort_order: number;
}

interface ItemTableProps {
  items: ItemRow[];
  categories: CategoryRow[];
  tenantId: number;
}

export function ItemTable({ items, categories, tenantId }: ItemTableProps) {
  const [editItem, setEditItem] = useState<ItemRow | null>(null);
  const [detailItem, setDetailItem] = useState<ItemRow | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleToggleActive(id: number) {
    startTransition(async () => {
      const result = await toggleItemActive({ id });
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
              <TableHead className="w-16">Ảnh</TableHead>
              <TableHead>Tên món</TableHead>
              <TableHead className="hidden sm:table-cell">{FORM_VI.category}</TableHead>
              <TableHead className="hidden md:table-cell text-right">
                {FORM_VI.price}
              </TableHead>
              <TableHead>{FORM_VI.status}</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableEmptyStateRow
                colSpan={6}
                title="Chưa có món ăn nào"
                icon={
                  <IconToolsKitchen className="mx-auto size-8 text-muted-foreground" />
                }
              />
            )}
            {items.map((item) => (
              <TableRow key={item.id} className={isPending ? "opacity-60" : ""}>
                <TableCell>
                  {item.image_url ? (
                    <Image
                      src={item.image_url}
                      alt={item.name}
                      width={48}
                      height={48}
                      className="size-12 rounded object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="flex size-12 items-center justify-center rounded bg-muted text-muted-foreground">
                      <IconImage className="size-5" />
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <div>
                    <span className="font-medium">{item.name}</span>
                    {item.description && (
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {item.description}
                      </p>
                    )}
                    <div className="mt-1 space-y-1 sm:hidden">
                      <p className="text-xs text-muted-foreground">
                        {item.category_name}
                      </p>
                      <p className="text-xs font-medium text-foreground">
                        {formatVND(item.base_price)}
                      </p>
                    </div>
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
                    {item.is_active
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
                        className="rounded-full"
                      >
                        <IconDots className="size-4" />
                        <span className="sr-only">Menu</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditItem(item)}>
                        <IconPencil className="mr-2 size-4" />
                        Chỉnh sửa
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setDetailItem(item)}>
                        <IconSettings2 className="mr-2 size-4" />
                        Biến thể & Tùy chọn
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => handleToggleActive(item.id)}
                      >
                        {item.is_active ? (
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

      <ItemFormDialog
        open={!!editItem}
        onOpenChange={(open) => !open && setEditItem(null)}
        item={editItem}
        categories={categories}
        tenantId={tenantId}
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

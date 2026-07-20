"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: menu category table keeps management copy inline */

import { useState, useTransition } from "react";
import {
  Pencil as IconPencil,
  ToggleLeft as IconToggleLeft,
  ToggleRight as IconToggleRight,
  FolderOpen as IconFolderOpen,
} from "lucide-react";
import { ACTIVE_STATE_LABELS_VI } from "@comtammatu/shared/labels";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { toggleCategoryActive } from "./actions";
import { CategoryFormDialog } from "./category-form-dialog";
import { toast } from "@comtammatu/ui/components/sonner";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import { CATEGORY_TYPE_LABELS } from "./category-labels";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { RowActionsMenu } from "@/components/row-actions-menu";

import { FORM_VI } from "@comtammatu/shared/messages";
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

  async function handleToggleActive(cat: CategoryRow) {
    if (cat.is_active) {
      const ok = await confirm({
        title: "Vô hiệu hóa danh mục này?",
        description: `"${cat.name}" sẽ bị ẩn khỏi POS cho tới khi kích hoạt lại.`,
        confirmText: "Vô hiệu hóa",
        variant: "destructive",
      });
      if (!ok) return;
    }
    startTransition(async () => {
      const result = await toggleCategoryActive({ id: cat.id });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(
        cat.is_active ? "Đã vô hiệu hóa danh mục" : "Đã kích hoạt danh mục",
      );
    });
  }

  function renderActions(cat: CategoryRow, touch = false) {
    return (
      <RowActionsMenu
        label="Menu"
        triggerSize={touch ? "icon-touch" : "icon"}
        triggerClassName="rounded-full"
        items={[
          {
            key: "edit",
            label: "Chỉnh sửa",
            icon: <IconPencil data-icon="inline-start" />,
            onSelect: () => setEditCategory(cat),
          },
          {
            key: cat.is_active ? "deactivate" : "activate",
            label: cat.is_active ? "Vô hiệu hóa" : "Kích hoạt",
            icon: cat.is_active ? (
              <IconToggleLeft data-icon="inline-start" />
            ) : (
              <IconToggleRight data-icon="inline-start" />
            ),
            onSelect: () => void handleToggleActive(cat),
          },
        ]}
      />
    );
  }

  const columns: DataTableColumn<CategoryRow>[] = [
    {
      key: "name",
      header: "Tên danh mục",
      render: (cat) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium">{cat.name}</span>
          <div className="flex flex-col gap-1 sm:hidden">
            <p className="text-xs text-muted-foreground">
              {CATEGORY_TYPE_LABELS[cat.type] ?? cat.type}
            </p>
            <p className="text-xs text-muted-foreground">
              Thứ tự {cat.sort_order}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "type",
      header: FORM_VI.type,
      className: "hidden sm:table-cell",
      render: (cat) => (
        <Badge variant="secondary">
          {CATEGORY_TYPE_LABELS[cat.type] ?? cat.type}
        </Badge>
      ),
    },
    {
      key: "sort",
      header: "Thứ tự",
      className: "hidden text-muted-foreground md:table-cell",
      render: (cat) => cat.sort_order,
    },
    {
      key: "status",
      header: FORM_VI.status,
      render: (cat) => (
        <Badge variant={cat.is_active ? "default" : "outline"}>
          {cat.is_active
            ? ACTIVE_STATE_LABELS_VI.active
            : ACTIVE_STATE_LABELS_VI.inactive}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-12",
      render: (cat) => renderActions(cat),
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={categories}
        getRowKey={(cat) => cat.id}
        emptyTitle="Chưa có danh mục nào"
        emptyIcon={<IconFolderOpen className="size-8 text-muted-foreground" />}
        rowClassName={() => (isPending ? "opacity-60" : undefined)}
        mobileCardRender={(cat) => (
          <Item variant="outline">
            <ItemContent>
              <ItemTitle>{cat.name}</ItemTitle>
              <ItemDescription>
                {CATEGORY_TYPE_LABELS[cat.type] ?? cat.type} · Thứ tự{" "}
                {cat.sort_order}
              </ItemDescription>
            </ItemContent>
            <ItemFooter>
              <Badge variant={cat.is_active ? "default" : "outline"}>
                {cat.is_active
                  ? ACTIVE_STATE_LABELS_VI.active
                  : ACTIVE_STATE_LABELS_VI.inactive}
              </Badge>
              <ItemActions>{renderActions(cat, true)}</ItemActions>
            </ItemFooter>
          </Item>
        )}
      />

      <CategoryFormDialog
        open={!!editCategory}
        onOpenChange={(open) => !open && setEditCategory(null)}
        category={editCategory}
      />
    </>
  );
}

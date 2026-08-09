"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import {
  Pencil as IconPencil,
  ToggleLeft as IconToggleLeft,
  ToggleRight as IconToggleRight,
  SlidersHorizontal as IconSettings2,
  Utensils as IconToolsKitchen,
  Image as IconImage,
} from "lucide-react";
import { formatPercent, formatVND } from "@comtammatu/shared/format";
import { ACTIVE_STATE_LABELS_VI } from "@comtammatu/shared/labels";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemMedia,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { toggleItemActive } from "./actions";
import { ItemFormDialog } from "./item-form-dialog";
import { ItemDetailDialog } from "./item-detail-dialog";
import { toast } from "@comtammatu/ui/components/sonner";
import { confirm } from "@/components/confirm-dialog";
import type { CategoryRow } from "./category-table";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { RowActionsMenu } from "@/components/row-actions-menu";
import {
  filterAndSortItems,
  type ItemFilterValues,
} from "./item-table-filters";

import { FORM_VI, MENU_VI } from "@comtammatu/shared/messages";
export interface ItemRow {
  id: number;
  name: string;
  description: string | null;
  base_price: number;
  vat_rate: number;
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
  const [searchValue, setSearchValue] = useState("");
  const [filterValues, setFilterValues] = useState<ItemFilterValues>({
    category: "all",
    status: "all",
    sort: "menu_order",
  });
  const visibleItems = useMemo(
    () => filterAndSortItems(items, searchValue, filterValues),
    [items, searchValue, filterValues],
  );
  const hasActiveFilter =
    searchValue.trim() !== "" ||
    filterValues.category !== "all" ||
    filterValues.status !== "all";

  async function handleToggleActive(item: ItemRow) {
    if (item.is_active) {
      const ok = await confirm({
        title: "Vô hiệu hóa món này?",
        description: `"${item.name}" sẽ bị ẩn khỏi POS cho tới khi kích hoạt lại.`,
        confirmText: "Vô hiệu hóa",
        variant: "destructive",
      });
      if (!ok) return;
    }
    startTransition(async () => {
      const result = await toggleItemActive({ id: item.id });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(item.is_active ? "Đã vô hiệu hóa món" : "Đã kích hoạt món");
    });
  }

  function renderImage(item: ItemRow) {
    return item.image_url ? (
      <Image
        src={item.image_url}
        alt={item.name}
        width={48}
        height={48}
        className="size-12 rounded-md object-cover"
        unoptimized
      />
    ) : (
      <div className="flex size-12 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <IconImage className="size-5" />
      </div>
    );
  }

  function renderActions(item: ItemRow, touch = false) {
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
            onSelect: () => setEditItem(item),
          },
          {
            key: "detail",
            label: "Biến thể & Tùy chọn",
            icon: <IconSettings2 data-icon="inline-start" />,
            onSelect: () => setDetailItem(item),
          },
          {
            key: item.is_active ? "deactivate" : "activate",
            label: item.is_active ? "Vô hiệu hóa" : "Kích hoạt",
            icon: item.is_active ? (
              <IconToggleLeft data-icon="inline-start" />
            ) : (
              <IconToggleRight data-icon="inline-start" />
            ),
            separatorBefore: true,
            onSelect: () => void handleToggleActive(item),
          },
        ]}
      />
    );
  }

  const columns: DataTableColumn<ItemRow>[] = [
    {
      key: "image",
      header: "Ảnh",
      className: "w-16",
      render: (item) => renderImage(item),
    },
    {
      key: "name",
      header: "Tên món",
      render: (item) => (
        <div>
          <span className="font-medium">{item.name}</span>
          {item.description && (
            <p className="text-xs text-muted-foreground line-clamp-1">
              {item.description}
            </p>
          )}
          <div className="mt-1 flex flex-col gap-1 sm:hidden">
            <p className="text-xs text-muted-foreground">
              {item.category_name}
            </p>
            <p className="text-xs font-medium text-foreground">
              {MENU_VI.vatInclusivePriceSummary(
                formatVND(item.base_price),
                formatPercent(item.vat_rate),
              )}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "category",
      header: FORM_VI.category,
      className: "hidden sm:table-cell",
      render: (item) => <Badge variant="secondary">{item.category_name}</Badge>,
    },
    {
      key: "price",
      header: MENU_VI.basePriceTableLabel,
      className: "hidden text-right font-mono md:table-cell",
      render: (item) => formatVND(item.base_price),
    },
    {
      key: "vat",
      header: "Thuế GTGT",
      className: "hidden text-right font-mono md:table-cell",
      render: (item) => formatPercent(item.vat_rate),
    },
    {
      key: "status",
      header: FORM_VI.status,
      render: (item) => (
        <Badge variant={item.is_active ? "default" : "outline"}>
          {item.is_active
            ? ACTIVE_STATE_LABELS_VI.active
            : ACTIVE_STATE_LABELS_VI.inactive}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-12",
      render: (item) => renderActions(item),
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={visibleItems}
        pageSize={25}
        getRowKey={(item) => item.id}
        searchable
        searchPlaceholder={MENU_VI.itemSearchPlaceholder}
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        filters={[
          {
            key: "category",
            label: FORM_VI.category,
            placeholder: MENU_VI.allCategories,
            options: [
              { value: "all", label: MENU_VI.allCategories },
              ...categories.map((category) => ({
                value: category.id.toString(),
                label: category.name,
              })),
            ],
          },
          {
            key: "status",
            label: FORM_VI.status,
            placeholder: MENU_VI.allStatuses,
            options: [
              { value: "all", label: MENU_VI.allStatuses },
              { value: "active", label: ACTIVE_STATE_LABELS_VI.active },
              { value: "inactive", label: ACTIVE_STATE_LABELS_VI.inactive },
            ],
          },
          {
            key: "sort",
            label: MENU_VI.sortBy,
            placeholder: MENU_VI.menuOrder,
            options: [
              { value: "menu_order", label: MENU_VI.menuOrder },
              { value: "name_asc", label: MENU_VI.nameAscending },
              { value: "price_asc", label: MENU_VI.priceAscending },
              { value: "price_desc", label: MENU_VI.priceDescending },
            ],
          },
        ]}
        filterValues={filterValues}
        onFilterChange={(key, value) =>
          setFilterValues((current) => ({ ...current, [key]: value }))
        }
        emptyTitle={
          hasActiveFilter ? MENU_VI.noMatchingItems : "Chưa có món ăn nào"
        }
        emptyMode={hasActiveFilter ? "no-results" : "no-data"}
        emptyIcon={
          <IconToolsKitchen className="size-8 text-muted-foreground" />
        }
        rowClassName={() => (isPending ? "opacity-60" : undefined)}
        mobileCardRender={(item) => (
          <Item variant="outline">
            <ItemMedia variant="image">{renderImage(item)}</ItemMedia>
            <ItemContent>
              <ItemTitle>{item.name}</ItemTitle>
              <ItemDescription>
                {item.category_name} ·{" "}
                {MENU_VI.vatInclusivePriceSummary(
                  formatVND(item.base_price),
                  formatPercent(item.vat_rate),
                )}
              </ItemDescription>
              {item.description ? (
                <ItemDescription>{item.description}</ItemDescription>
              ) : null}
            </ItemContent>
            <ItemFooter>
              <Badge variant={item.is_active ? "default" : "outline"}>
                {item.is_active
                  ? ACTIVE_STATE_LABELS_VI.active
                  : ACTIVE_STATE_LABELS_VI.inactive}
              </Badge>
              <ItemActions>{renderActions(item, true)}</ItemActions>
            </ItemFooter>
          </Item>
        )}
      />

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

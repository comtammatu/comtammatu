"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: HR consumption default setup copy */

import { useState, useTransition } from "react";
import { ClipboardList as IconClipboardList } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { toast } from "@comtammatu/ui/components/sonner";
import { DataTable, type DataTableColumn } from "@/components/data-table/data-table";
import { setConsumptionDefaultIngredients } from "./checklist-actions";
import type {
  ConsumptionChecklistItemRow,
  ConsumptionDefaultIngredientRow,
  ConsumptionDefaultItemRow,
} from "./checklist-types";

interface ConsumptionDefaultItemsTableProps {
  items: ConsumptionChecklistItemRow[];
  ingredients: ConsumptionDefaultIngredientRow[];
  defaults: ConsumptionDefaultItemRow[];
}

function initialSelected(defaults: ConsumptionDefaultItemRow[]) {
  const selected: Record<number, number[]> = {};
  for (const item of defaults) {
    selected[item.templateItemId] = [
      ...(selected[item.templateItemId] ?? []),
      item.ingredientId,
    ];
  }
  return selected;
}

export function ConsumptionDefaultItemsTable({
  items,
  ingredients,
  defaults,
}: ConsumptionDefaultItemsTableProps) {
  const [selected, setSelected] = useState(() => initialSelected(defaults));
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle(templateItemId: number, ingredientId: number, checked: boolean) {
    setSelected((current) => {
      const existing = current[templateItemId] ?? [];
      const next = checked
        ? Array.from(new Set([...existing, ingredientId]))
        : existing.filter((id) => id !== ingredientId);
      return { ...current, [templateItemId]: next };
    });
  }

  function save(templateItemId: number) {
    setPendingId(templateItemId);
    startTransition(async () => {
      const result = await setConsumptionDefaultIngredients({
        templateItemId,
        ingredientIds: selected[templateItemId] ?? [],
      });
      setPendingId(null);
      if (!result.success) {
        toast.error(result.error ?? "Không thể lưu nguyên liệu mặc định.");
        return;
      }
      toast.success("Đã lưu nguyên liệu mặc định.");
    });
  }

  function renderIngredients(item: ConsumptionChecklistItemRow) {
    const checked = new Set(selected[item.templateItemId] ?? []);
    return (
      <div className="grid max-h-56 gap-2 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
        {ingredients.map((ingredient) => (
          <label
            key={ingredient.id}
            className="flex min-h-10 items-center gap-2 rounded-md px-2 text-sm hover:bg-muted/50"
          >
            <Checkbox
              checked={checked.has(ingredient.id)}
              disabled={isPending}
              onCheckedChange={(value) =>
                toggle(item.templateItemId, ingredient.id, value === true)
              }
            />
            <span className="min-w-0">
              <span className="block truncate font-medium">{ingredient.name}</span>
              <span className="block text-xs text-muted-foreground">
                {ingredient.unit}
              </span>
            </span>
          </label>
        ))}
      </div>
    );
  }

  const columns: DataTableColumn<ConsumptionChecklistItemRow>[] = [
    {
      key: "template",
      header: "Checklist",
      render: (item) => (
        <div>
          <p className="font-medium">{item.templateName}</p>
          <p className="text-xs text-muted-foreground">
            {item.branchName ?? "Global"}
          </p>
        </div>
      ),
    },
    {
      key: "ingredients",
      header: "Nguyên liệu mặc định",
      render: renderIngredients,
    },
    {
      key: "actions",
      header: "Lưu",
      className: "w-24 text-right",
      render: (item) => (
        <Button
          type="button"
          size="sm"
          disabled={isPending && pendingId === item.templateItemId}
          onClick={() => save(item.templateItemId)}
        >
          Lưu
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-medium">
          Nguyên liệu mặc định cho tiêu hao bếp
        </h3>
        <p className="text-sm text-muted-foreground">
          Nhân viên vẫn có thể thêm dòng ngoài danh sách khi báo cáo ca.
        </p>
      </div>
      <DataTable
        columns={columns}
        data={items}
        getRowKey={(item) => item.templateItemId}
        emptyTitle="Chưa có checklist tiêu hao bếp"
        emptyIcon={<IconClipboardList />}
        mobileCardRender={(item) => (
          <Item variant="outline">
            <ItemContent>
              <ItemTitle className="line-clamp-none text-sm font-semibold">
                {item.templateName}
              </ItemTitle>
              <ItemDescription className="line-clamp-none">
                {item.branchName ?? "Global"}
              </ItemDescription>
              <div>{renderIngredients(item)}</div>
            </ItemContent>
            <ItemActions>
              <Button
                type="button"
                size="sm"
                disabled={isPending && pendingId === item.templateItemId}
                onClick={() => save(item.templateItemId)}
              >
                Lưu
              </Button>
            </ItemActions>
          </Item>
        )}
      />
    </div>
  );
}

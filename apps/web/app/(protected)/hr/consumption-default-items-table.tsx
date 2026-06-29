"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: HR consumption default setup copy */

import { useMemo, useState, useTransition } from "react";
import {
  ClipboardList as IconClipboardList,
  X as IconX,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { toast } from "@comtammatu/ui/components/sonner";
import { MultiSelectCombobox } from "@/components/form";
import { AppEmptyState } from "@/components/surface";
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

function sameSet(a: number[], b: number[]) {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((id) => setB.has(id));
}

export function ConsumptionDefaultItemsTable({
  items,
  ingredients,
  defaults,
}: ConsumptionDefaultItemsTableProps) {
  const [selected, setSelected] = useState(() => initialSelected(defaults));
  const [baseline, setBaseline] = useState(() => initialSelected(defaults));
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  const ingredientById = useMemo(
    () => new Map(ingredients.map((ing) => [ing.id, ing])),
    [ingredients],
  );

  function add(templateItemId: number, ingredientIds: string[]) {
    setSelected((current) => {
      const existing = current[templateItemId] ?? [];
      const next = Array.from(
        new Set([...existing, ...ingredientIds.map(Number)]),
      );
      return { ...current, [templateItemId]: next };
    });
  }

  function remove(templateItemId: number, ingredientId: number) {
    setSelected((current) => ({
      ...current,
      [templateItemId]: (current[templateItemId] ?? []).filter(
        (id) => id !== ingredientId,
      ),
    }));
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
      setBaseline((b) => ({
        ...b,
        [templateItemId]: selected[templateItemId] ?? [],
      }));
      toast.success("Đã lưu nguyên liệu mặc định.");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-medium">
          Nguyên liệu mặc định cho tiêu hao bếp
        </h3>
        <p className="text-sm text-muted-foreground">
          Mỗi checklist chọn sẵn các nguyên liệu cần báo tiêu hao. Nhân viên vẫn
          có thể thêm dòng ngoài danh sách khi báo cáo ca.
        </p>
      </div>

      {items.length === 0 ? (
        <AppEmptyState
          compact
          icon={<IconClipboardList />}
          title="Chưa có checklist tiêu hao bếp"
        />
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => {
            const current = selected[item.templateItemId] ?? [];
            const currentSet = new Set(current);
            const dirty = !sameSet(current, baseline[item.templateItemId] ?? []);
            const saving = isPending && pendingId === item.templateItemId;
            const options = ingredients.map((ing) => ({
              value: String(ing.id),
              label: ing.name,
              hint: ing.unit,
              alreadySelected: currentSet.has(ing.id),
              keywords: [ing.name, ing.category ?? ""],
            }));

            return (
              <Item key={item.templateItemId} variant="outline">
                <ItemContent className="gap-3">
                  <div>
                    <ItemTitle className="text-sm font-semibold">
                      {item.templateName}
                    </ItemTitle>
                    <ItemDescription>
                      {item.branchName ?? "Global"} · {current.length} nguyên
                      liệu
                    </ItemDescription>
                  </div>

                  {current.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {current.map((id) => {
                        const ing = ingredientById.get(id);
                        return (
                          <Badge key={id} variant="secondary" className="gap-1 pr-1">
                            {ing?.name ?? `#${id}`}
                            <button
                              type="button"
                              aria-label={`Bỏ ${ing?.name ?? id}`}
                              disabled={isPending}
                              onClick={() => remove(item.templateItemId, id)}
                              className="rounded-full p-0.5 hover:bg-muted-foreground/20 disabled:opacity-50"
                            >
                              <IconX className="size-3" />
                            </button>
                          </Badge>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Chưa chọn nguyên liệu.
                    </p>
                  )}

                  <MultiSelectCombobox
                    options={options}
                    onConfirm={(ids) => add(item.templateItemId, ids)}
                    triggerLabel="Thêm nguyên liệu"
                    confirmLabel={(n) => `Thêm ${n}`}
                    searchPlaceholder="Tìm nguyên liệu..."
                    emptyMessage="Không tìm thấy nguyên liệu."
                    alreadyAppliedHint="Đã chọn"
                    disabled={isPending}
                    triggerClassName="w-full sm:w-72"
                  />
                </ItemContent>
                <ItemActions>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!dirty || saving}
                    onClick={() => save(item.templateItemId)}
                  >
                    Lưu
                  </Button>
                </ItemActions>
              </Item>
            );
          })}
        </div>
      )}
    </div>
  );
}

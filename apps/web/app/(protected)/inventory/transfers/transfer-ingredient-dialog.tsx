"use client";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@comtammatu/ui/components/command";
import { tTerm } from "../_lib/dictionary";
import type { IngredientRow } from "../page";

export function IngredientSearchDialog({
  open,
  onOpenChange,
  ingredients,
  onPick,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  ingredients: IngredientRow[];
  onPick: (ingredient: IngredientRow) => void;
}) {
  const active = ingredients.filter((i) => i.is_active);
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Tìm theo tên, SKU, danh mục…" />
      <CommandList className="max-h-96">
        <CommandEmpty>Không tìm thấy nguyên liệu.</CommandEmpty>
        <CommandGroup heading={tTerm("ingredientsList")}>
          {active.map((i) => (
            <CommandItem
              key={i.id}
              value={`ingredient-${i.id} ${i.name} ${i.sku ?? ""} ${i.category ?? ""}`}
              onSelect={() => {
                onPick(i);
                onOpenChange(false);
              }}
            >
              <span className="flex flex-col gap-0.5 text-left">
                <span className="font-medium">{i.name}</span>
                <span className="text-xs text-muted-foreground">
                  Đơn vị: {i.unit}
                  {i.sku ? ` · SKU: ${i.sku}` : ""}
                  {i.category ? ` · ${i.category}` : ""}
                </span>
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

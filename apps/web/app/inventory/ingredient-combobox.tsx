"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@comtammatu/ui";
import { Button } from "@comtammatu/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@comtammatu/ui/components/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@comtammatu/ui/components/command";

interface IngredientOption {
  id: number;
  name: string;
  unit: string;
}

interface IngredientComboboxProps {
  /** Array of ingredients to display */
  ingredients: IngredientOption[];
  /** Currently selected ingredient id (as string) */
  value: string;
  /** Called when selection changes */
  onValueChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function IngredientCombobox({
  ingredients,
  value,
  onValueChange,
  placeholder = "Chọn nguyên liệu…",
  className,
}: IngredientComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = ingredients.find((i) => String(i.id) === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between font-normal",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          {selected ? (
            <span className="truncate">
              {selected.name}{" "}
              <span className="text-muted-foreground">({selected.unit})</span>
            </span>
          ) : (
            placeholder
          )}
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0"
        style={{ width: "var(--radix-popover-trigger-width)" }}
      >
        <Command
          filter={(val, search) => {
            const ing = ingredients.find((i) => String(i.id) === val);
            if (!ing) return 0;
            const haystack = `${ing.name} ${ing.unit}`.toLowerCase();
            return haystack.includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Tìm nguyên liệu…" />
          <CommandList style={{ maxHeight: 240 }}>
            <CommandEmpty>Không tìm thấy nguyên liệu.</CommandEmpty>
            <CommandGroup>
              {ingredients.map((i) => (
                <CommandItem
                  key={i.id}
                  value={String(i.id)}
                  onSelect={(v) => {
                    onValueChange(v);
                    setOpen(false);
                  }}
                >
                  <span className="flex-1 truncate">
                    {i.name}{" "}
                    <span className="text-muted-foreground">({i.unit})</span>
                  </span>
                  {value === String(i.id) && (
                    <Check className="ml-2 size-4 shrink-0" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

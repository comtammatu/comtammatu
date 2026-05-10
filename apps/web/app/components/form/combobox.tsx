"use client";

import { useMemo, useState } from "react";
import { ChevronsUpDown as IconSelector } from "lucide-react";
import { cn } from "@comtammatu/ui";
import { matchesSearch } from "@lib/search";
import { Button } from "@comtammatu/ui/components/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@comtammatu/ui/components/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@comtammatu/ui/components/popover";
import type { ComboboxFieldOption } from "./combobox-field";

export interface ComboboxProps {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly ComboboxFieldOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  size?: "sm" | "default" | "touch" | "touch-lg";
  className?: string;
  triggerClassName?: string;
  id?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
}

/** Standalone controlled Combobox (no RHF). Use `ComboboxField` when inside
 * a react-hook-form. Shared UI primitive. */
export function Combobox({
  value,
  onValueChange,
  options,
  placeholder = "Chọn...",
  searchPlaceholder = "Tìm...",
  emptyMessage = "Không tìm thấy.",
  disabled,
  size = "default",
  className,
  triggerClassName,
  id,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);

  const selected = useMemo(
    () => options.find((opt) => opt.value === value),
    [options, value],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={ariaInvalid}
          aria-label={ariaLabel}
          disabled={disabled}
          size={size}
          className={cn(
            "w-full justify-between font-normal",
            !selected && "text-muted-foreground",
            triggerClassName ?? className,
          )}
        >
          <span className="truncate">
            {selected ? selected.label : placeholder}
          </span>
          <IconSelector className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" width="trigger" padding="none">
        <Command
          filter={(v, search, keywords) => {
            return matchesSearch([v, ...(keywords ?? [])], search) ? 1 : 0;
          }}
        >
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={opt.label}
                  keywords={opt.keywords}
                  disabled={opt.disabled}
                  checked={value === opt.value}
                  onSelect={() => {
                    onValueChange(opt.value);
                    setOpen(false);
                  }}
                >
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{opt.label}</span>
                    {opt.hint ? (
                      <span className="truncate text-xs text-muted-foreground">
                        {opt.hint}
                      </span>
                    ) : null}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

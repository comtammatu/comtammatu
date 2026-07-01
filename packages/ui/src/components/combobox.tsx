"use client";

import * as React from "react";
import {
  Check as IconCheck,
  ChevronsUpDown as IconChevronsUpDown,
} from "lucide-react";

import { cn } from "../lib/utils";
import { Button } from "./button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

export type ComboboxOption = {
  value: string;
  label: string;
  disabled?: boolean;
  keywords?: string[];
};

type ComboboxProps = Omit<
  React.ComponentProps<typeof Button>,
  "children" | "onChange" | "value"
> & {
  options: ComboboxOption[];
  value?: string;
  onValueChange?: (value: string, option: ComboboxOption) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  contentClassName?: string;
};

function Combobox({
  options,
  value,
  onValueChange,
  placeholder = "Chọn...",
  searchPlaceholder = "Tìm...",
  emptyText = "Không có kết quả",
  contentClassName,
  className,
  disabled,
  ...props
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between",
            !selected && "text-muted-foreground",
            className,
          )}
          {...props}
        >
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <IconChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn(
          "w-[var(--radix-popover-trigger-width)] p-0",
          contentClassName,
        )}
        align="start"
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  keywords={[option.value, ...(option.keywords ?? [])]}
                  disabled={option.disabled}
                  data-checked={option.value === value}
                  onSelect={() => {
                    if (option.disabled) return;
                    onValueChange?.(option.value, option);
                    setOpen(false);
                  }}
                >
                  <IconCheck
                    className={cn(
                      "size-3.5",
                      option.value === value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate">{option.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export { Combobox };

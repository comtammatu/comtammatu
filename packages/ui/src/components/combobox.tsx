"use client";

import * as React from "react";
import {
  Check as IconCheck,
  ChevronDown as IconChevronDown,
} from "lucide-react";

import { cn } from "../lib/utils";
import {
  fieldTriggerChrome,
  fieldTriggerSize,
  type FieldTriggerSize,
} from "../lib/field-trigger";
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
  React.ComponentProps<"button">,
  "children" | "onChange" | "value"
> & {
  options: ComboboxOption[];
  value?: string;
  onValueChange?: (value: string, option: ComboboxOption) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  contentClassName?: string;
  size?: FieldTriggerSize;
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
  size = "default",
  ...props
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          data-placeholder={selected ? undefined : true}
          disabled={disabled}
          className={cn(
            "flex w-full items-center justify-between gap-1.5 px-2 py-1.5 text-xs/relaxed whitespace-nowrap",
            fieldTriggerChrome,
            fieldTriggerSize({ size }),
            className,
          )}
          {...props}
        >
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <IconChevronDown className="pointer-events-none size-3.5 shrink-0 text-muted-foreground" />
        </button>
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

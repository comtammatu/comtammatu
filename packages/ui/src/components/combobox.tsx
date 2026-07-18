"use client";

import * as React from "react";
import { Combobox as BaseCombobox } from "@base-ui/react/combobox";
import {
  Check as IconCheck,
  ChevronDown as IconChevronDown,
  Search as IconSearch,
} from "lucide-react";

import { cn } from "../lib/utils";
import {
  fieldTriggerChrome,
  fieldTriggerSize,
  type FieldTriggerSize,
} from "../lib/field-trigger";

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
    <BaseCombobox.Root
      items={options}
      value={selected ?? null}
      open={open}
      disabled={disabled}
      itemToStringLabel={(option) => option.label}
      itemToStringValue={(option) => option.value}
      isItemEqualToValue={(left, right) => left.value === right.value}
      filter={(option, query) => {
        const normalizedQuery = query.trim().toLocaleLowerCase();
        return (
          !normalizedQuery ||
          [option.label, option.value, ...(option.keywords ?? [])].some(
            (candidate) =>
              candidate.toLocaleLowerCase().includes(normalizedQuery),
          )
        );
      }}
      onValueChange={(option) => {
        if (!option) return;
        onValueChange?.(option.value, option);
        setOpen(false);
      }}
      onOpenChange={setOpen}
    >
      <BaseCombobox.Trigger
        type="button"
        data-placeholder={selected ? undefined : true}
        className={cn(
          "flex w-full items-center justify-between gap-1.5 px-2 py-1.5 text-xs/relaxed whitespace-nowrap",
          fieldTriggerChrome,
          fieldTriggerSize({ size }),
          className,
        )}
        {...props}
      >
        <span className="truncate">{selected?.label ?? placeholder}</span>
        <IconChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
      </BaseCombobox.Trigger>
      <BaseCombobox.Portal>
        <BaseCombobox.Positioner align="start" sideOffset={4}>
          <BaseCombobox.Popup
            className={cn("w-(--anchor-width) overflow-hidden rounded-lg bg-popover p-1 text-popover-foreground shadow-effect-popover", contentClassName)}
            aria-label={placeholder}
          >
            <div className="flex h-8 items-center gap-2 rounded-md bg-input/20 px-2 dark:bg-input/30">
              <BaseCombobox.Input
                className="min-w-0 flex-1 bg-transparent text-xs/relaxed outline-hidden placeholder:text-muted-foreground"
                placeholder={searchPlaceholder}
              />
              <IconSearch className="size-3.5 shrink-0 opacity-50" />
            </div>
            <BaseCombobox.Empty className="py-6 text-center text-xs/relaxed">
              {emptyText}
            </BaseCombobox.Empty>
            <BaseCombobox.List className="no-scrollbar max-h-72 scroll-py-1 overflow-x-hidden overflow-y-auto p-1 outline-none">
              {(option: ComboboxOption) => (
                <BaseCombobox.Item
                  key={option.value}
                  value={option}
                  disabled={option.disabled}
                  className="flex min-h-7 cursor-default items-center gap-2 rounded-md px-2.5 py-1.5 text-xs/relaxed outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-muted data-[highlighted]:text-foreground"
                >
                  <BaseCombobox.ItemIndicator keepMounted>
                    <IconCheck className="size-3.5 data-[selected=false]:opacity-0" />
                  </BaseCombobox.ItemIndicator>
                  <span className="truncate">{option.label}</span>
                </BaseCombobox.Item>
              )}
            </BaseCombobox.List>
          </BaseCombobox.Popup>
        </BaseCombobox.Positioner>
      </BaseCombobox.Portal>
    </BaseCombobox.Root>
  );
}

const ComboboxPrimitive = BaseCombobox;

export { Combobox, ComboboxPrimitive };

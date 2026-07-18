"use client";

import * as React from "react";
import { Combobox as BaseCombobox } from "@base-ui/react/combobox";
import { Check as IconCheck, X as IconX } from "lucide-react";

import { cn } from "../lib/utils";
import { fieldTriggerChrome } from "../lib/field-trigger";
import { Badge } from "./badge";

export type TagInputOption = {
  value: string;
  label: string;
  disabled?: boolean;
  keywords?: string[];
};

type TagInputProps = Omit<React.ComponentProps<"div">, "onChange"> & {
  options?: TagInputOption[];
  value?: string[];
  defaultValue?: string[];
  onValueChange?: (
    value: string[],
    meta?: TagInputOption | { removed: string },
  ) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  allowCreate?: boolean;
  disabled?: boolean;
  "aria-invalid"?: boolean;
};

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <Badge variant="secondary" className="gap-1 pr-1">
      <span className="truncate">{children}</span>
    </Badge>
  );
}

function TagInput({
  options = [],
  value,
  defaultValue = [],
  onValueChange,
  placeholder = "Thêm tag...",
  searchPlaceholder = "Tìm tag...",
  emptyText = "Không có kết quả",
  allowCreate = true,
  disabled = false,
  className,
  "aria-invalid": ariaInvalid,
  ...props
}: TagInputProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [uncontrolledValue, setUncontrolledValue] =
    React.useState(defaultValue);
  const selectedValues = value ?? uncontrolledValue;
  const selectedSet = new Set(selectedValues);
  const selectedOptions: TagInputOption[] = selectedValues.map((item) => ({
    value: item,
    label: options.find((option) => option.value === item)?.label ?? item,
  }));
  const normalizedQuery = query.trim();
  const canCreate =
    allowCreate &&
    normalizedQuery.length > 0 &&
    !selectedSet.has(normalizedQuery) &&
    !options.some(
      (option) =>
        option.value.toLowerCase() === normalizedQuery.toLowerCase() ||
        option.label.toLowerCase() === normalizedQuery.toLowerCase(),
    );
  const visibleOptions = options.filter(
    (option) => !selectedSet.has(option.value),
  );
  const menuOptions: TagInputOption[] = canCreate
    ? [
        { value: normalizedQuery, label: `Tạo "${normalizedQuery}"` },
        ...visibleOptions,
      ]
    : visibleOptions;

  const setValues = (
    next: string[],
    meta?: TagInputOption | { removed: string },
  ) => {
    if (value == null) setUncontrolledValue(next);
    onValueChange?.(next, meta);
  };
  return (
    <div
      data-slot="tag-input"
      className={cn("flex flex-col gap-1.5", className)}
      {...props}
    >
      <BaseCombobox.Root
        items={menuOptions}
        multiple
        value={selectedOptions}
        open={open}
        disabled={disabled}
        inputValue={query}
        itemToStringLabel={(option) => option.label}
        itemToStringValue={(option) => option.value}
        isItemEqualToValue={(left, right) => left.value === right.value}
        filter={(option, nextQuery) => {
          const normalizedNextQuery = nextQuery.trim().toLocaleLowerCase();
          return (
            !normalizedNextQuery ||
            [option.label, option.value, ...(option.keywords ?? [])].some(
              (candidate) =>
                candidate.toLocaleLowerCase().includes(normalizedNextQuery),
            )
          );
        }}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (nextOpen) setQuery("");
        }}
        onInputValueChange={setQuery}
        onValueChange={(nextOptions) => {
          const nextValues = nextOptions.map((option) => option.value);
          const added = nextOptions.find(
            (option) => !selectedSet.has(option.value),
          );
          const removed = selectedValues.find(
            (item) => !nextValues.includes(item),
          );

          setValues(nextValues, added ?? (removed ? { removed } : undefined));
          if (added) {
            setQuery("");
            setOpen(false);
          }
        }}
      >
        <BaseCombobox.InputGroup
          aria-invalid={ariaInvalid}
          className={cn(
            "flex min-h-8 w-full flex-wrap items-center gap-1.5 px-2 py-1 text-left text-xs",
            fieldTriggerChrome,
          )}
        >
          <BaseCombobox.Chips>
            <BaseCombobox.Value placeholder={placeholder}>
              {(selected: TagInputOption[]) =>
                selected.map((option) => (
                  <BaseCombobox.Chip
                    key={option.value}
                    className="inline-flex max-w-full items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
                  >
                    <span className="truncate">{option.label}</span>
                    <BaseCombobox.ChipRemove
                      className="inline-flex size-4 shrink-0 items-center justify-center rounded-full outline-none hover:bg-muted focus-visible:ring-1 focus-visible:ring-foreground"
                      aria-label={`Xóa ${option.label}`}
                    >
                      <IconX className="size-3" />
                    </BaseCombobox.ChipRemove>
                  </BaseCombobox.Chip>
                ))
              }
            </BaseCombobox.Value>
          </BaseCombobox.Chips>
          <BaseCombobox.Input
            className="min-w-20 flex-1 bg-transparent outline-hidden placeholder:text-muted-foreground"
            placeholder={selectedOptions.length ? undefined : placeholder}
          />
        </BaseCombobox.InputGroup>
        <BaseCombobox.Portal>
          <BaseCombobox.Positioner
            align="start"
            sideOffset={4}
            className="isolate z-50"
          >
            <BaseCombobox.Popup className="w-(--anchor-width) overflow-hidden rounded-lg bg-popover p-1 text-popover-foreground shadow-effect-popover">
              <div className="flex h-8 items-center gap-2 rounded-md bg-input/20 px-2 dark:bg-input/30">
                <BaseCombobox.Input
                  className="min-w-0 flex-1 bg-transparent text-xs/relaxed outline-hidden placeholder:text-muted-foreground"
                  placeholder={searchPlaceholder}
                />
              </div>
              <BaseCombobox.Empty className="py-6 text-center text-xs/relaxed">
                {emptyText}
              </BaseCombobox.Empty>
              <BaseCombobox.List className="no-scrollbar max-h-72 scroll-py-1 overflow-x-hidden overflow-y-auto p-1 outline-none">
                {(option: TagInputOption) => (
                  <BaseCombobox.Item
                    key={option.value}
                    value={option}
                    disabled={option.disabled}
                    className="flex min-h-7 cursor-default items-center gap-2 rounded-md px-2.5 py-1.5 text-xs/relaxed outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-muted data-[highlighted]:text-foreground"
                  >
                    <IconCheck className="size-3.5 opacity-0" />
                    <span className="truncate">{option.label}</span>
                  </BaseCombobox.Item>
                )}
              </BaseCombobox.List>
            </BaseCombobox.Popup>
          </BaseCombobox.Positioner>
        </BaseCombobox.Portal>
      </BaseCombobox.Root>
    </div>
  );
}

export { Tag, TagInput };

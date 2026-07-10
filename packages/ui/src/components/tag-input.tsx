"use client";

import * as React from "react";
import { Check as IconCheck, X as IconX } from "lucide-react";

import { cn } from "../lib/utils";
import { fieldTriggerChrome } from "../lib/field-trigger";
import { Badge } from "./badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

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

function Tag({
  children,
  onRemove,
}: {
  children: React.ReactNode;
  onRemove?: () => void;
}) {
  return (
    <Badge variant="secondary" className="gap-1 pr-1">
      <span className="truncate">{children}</span>
      {onRemove ? (
        <button
          type="button"
          className="inline-flex size-4 items-center justify-center rounded-full outline-none hover:bg-muted focus-visible:ring-1 focus-visible:ring-foreground"
          onClick={onRemove}
          aria-label={`Xóa ${children}`}
        >
          <IconX className="size-3" />
        </button>
      ) : null}
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
  const selectedOptions = selectedValues.map((item) => ({
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
  const addOption = (option: TagInputOption) => {
    if (option.disabled || selectedSet.has(option.value)) return;
    setValues([...selectedValues, option.value], option);
    setQuery("");
    setOpen(false);
  };
  const removeValue = (removed: string) => {
    setValues(
      selectedValues.filter((item) => item !== removed),
      { removed },
    );
  };

  return (
    <div
      data-slot="tag-input"
      className={cn("flex flex-col gap-1.5", className)}
      {...props}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-invalid={ariaInvalid}
            data-placeholder={selectedOptions.length ? undefined : true}
            className={cn(
              "flex min-h-8 w-full flex-wrap items-center gap-1.5 px-2 py-1 text-left text-xs",
              fieldTriggerChrome,
            )}
          >
            {selectedOptions.length ? (
              selectedOptions.map((option) => (
                <Tag
                  key={option.value}
                  onRemove={() => removeValue(option.value)}
                >
                  {option.label}
                </Tag>
              ))
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] p-0"
          align="start"
        >
          <Command shouldFilter>
            <CommandInput
              placeholder={searchPlaceholder}
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              <CommandEmpty>{emptyText}</CommandEmpty>
              <CommandGroup>
                {menuOptions.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    keywords={[option.value, ...(option.keywords ?? [])]}
                    disabled={option.disabled}
                    onSelect={() => addOption(option)}
                  >
                    <IconCheck className="size-3.5 opacity-0" />
                    <span className="truncate">{option.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export { Tag, TagInput };

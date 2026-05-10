"use client";

import { useMemo, useState } from "react";
import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { useController } from "react-hook-form";
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
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@comtammatu/ui/components/field";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@comtammatu/ui/components/popover";

export interface ComboboxFieldOption {
  value: string;
  label: string;
  /** Optional secondary text shown below label (e.g. SKU, unit) */
  hint?: string;
  /** Tokens searched in addition to `label` (e.g. sku, category) */
  keywords?: string[];
  disabled?: boolean;
}

export interface ComboboxFieldProps<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
  options: readonly ComboboxFieldOption[];
  description?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  size?: "sm" | "default" | "touch" | "touch-lg";
  className?: string;
  id?: string;
  required?: boolean;
}

export function ComboboxField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  options,
  description,
  placeholder = "Chọn...",
  searchPlaceholder = "Tìm...",
  emptyMessage = "Không tìm thấy.",
  disabled,
  size = "default",
  className,
  id,
  required,
}: ComboboxFieldProps<TFieldValues>) {
  const { field, fieldState } = useController({ control, name });
  const fieldId = id ?? `field-${String(name)}`;
  const hasError = !!fieldState.error;
  const descriptionId = description ? `${fieldId}-description` : undefined;
  const errorId = fieldState.error ? `${fieldId}-error` : undefined;
  const describedBy =
    [descriptionId, errorId].filter(Boolean).join(" ") || undefined;
  const [open, setOpen] = useState(false);

  const selected = useMemo(
    () => options.find((opt) => opt.value === field.value),
    [options, field.value],
  );

  return (
    <Field data-invalid={hasError || undefined}>
      <FieldLabel htmlFor={fieldId}>
        {label}
        {required ? " *" : null}
      </FieldLabel>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={fieldId}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-describedby={describedBy}
            aria-invalid={hasError || undefined}
            aria-required={required || undefined}
            disabled={disabled}
            size={size}
            onBlur={field.onBlur}
            ref={field.ref}
            className={cn(
              "w-full justify-between font-normal",
              !selected && "text-muted-foreground",
              className,
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
            filter={(value, search, keywords) => {
              return matchesSearch([value, ...(keywords ?? [])], search)
                ? 1
                : 0;
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
                    checked={field.value === opt.value}
                    onSelect={() => {
                      field.onChange(opt.value);
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
      {description ? (
        <FieldDescription id={descriptionId}>{description}</FieldDescription>
      ) : null}
      {fieldState.error ? (
        <FieldError id={errorId} errors={[fieldState.error]} />
      ) : null}
    </Field>
  );
}

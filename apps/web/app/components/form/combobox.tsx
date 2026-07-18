"use client";

import { forwardRef, useMemo, useState, type ComponentProps } from "react";
import { Check as IconCheck, ChevronDown as IconSelector } from "lucide-react";
import { cn } from "@comtammatu/ui";
import { fieldTriggerChrome } from "@comtammatu/ui/lib/field-trigger";
import { matchesSearch } from "@lib/search";
import { Button } from "@comtammatu/ui/components/button";
import { ComboboxPrimitive } from "@comtammatu/ui/components/combobox";
import type { ComboboxFieldOption } from "./combobox-field";

export interface ComboboxProps {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly ComboboxFieldOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  size?: ComponentProps<typeof Button>["size"];
  id?: string;
  onBlur?: ComponentProps<typeof Button>["onBlur"];
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  "aria-errormessage"?: string;
  "aria-required"?: boolean;
}

/** Standalone controlled Combobox (no RHF). Shared UI primitive. */
export const Combobox = forwardRef<HTMLButtonElement, ComboboxProps>(
  function Combobox(
    {
      value,
      onValueChange,
      options,
      placeholder = "Chọn...",
      searchPlaceholder = "Tìm...",
      emptyMessage = "Không tìm thấy.",
      disabled,
      className,
      triggerClassName,
      size = "field",
      id,
      onBlur,
      "aria-label": ariaLabel,
      "aria-invalid": ariaInvalid,
      "aria-describedby": ariaDescribedBy,
      "aria-errormessage": ariaErrorMessage,
      "aria-required": ariaRequired,
    },
    ref,
  ) {
    const [open, setOpen] = useState(false);

    const selected = useMemo(
      () => options.find((opt) => opt.value === value),
      [options, value],
    );

    return (
      <ComboboxPrimitive.Root
        items={options}
        value={selected ?? null}
        open={open}
        disabled={disabled}
        itemToStringLabel={(option) => option.label}
        itemToStringValue={(option) => option.value}
        isItemEqualToValue={(left, right) => left.value === right.value}
        filter={(option, query) =>
          matchesSearch(
            [option.label, option.value, ...(option.keywords ?? [])],
            query,
          )
        }
        onOpenChange={setOpen}
        onValueChange={(option) => {
          if (!option) return;
          onValueChange(option.value);
          setOpen(false);
        }}
      >
        <ComboboxPrimitive.Trigger
          render={
            <Button
              ref={ref}
              id={id}
              type="button"
              variant="outline"
              size={size}
              aria-invalid={ariaInvalid}
              aria-label={ariaLabel}
              aria-describedby={ariaDescribedBy}
              aria-errormessage={ariaErrorMessage}
              aria-required={ariaRequired}
              onBlur={onBlur}
              className={cn(
                "w-full justify-between font-normal",
                fieldTriggerChrome,
                "hover:bg-input/20 aria-expanded:bg-input/30",
                !selected && "text-muted-foreground",
                triggerClassName ?? className,
              )}
            >
              <span className="truncate">
                {selected ? selected.label : placeholder}
              </span>
              <IconSelector className="ml-2 size-3.5 shrink-0 text-muted-foreground" />
            </Button>
          }
        />
        <ComboboxPrimitive.Portal>
          <ComboboxPrimitive.Positioner align="start" sideOffset={4}>
            <ComboboxPrimitive.Popup
              className="w-(--anchor-width) overflow-hidden rounded-lg bg-popover p-1 text-popover-foreground shadow-effect-popover"
              aria-label={ariaLabel ?? placeholder}
            >
              <ComboboxPrimitive.Input
                className="h-8 w-full rounded-md bg-input/20 px-2 text-xs/relaxed outline-hidden placeholder:text-muted-foreground dark:bg-input/30"
                placeholder={searchPlaceholder}
              />
              <ComboboxPrimitive.Empty className="py-6 text-center text-xs/relaxed">
                {emptyMessage}
              </ComboboxPrimitive.Empty>
              <ComboboxPrimitive.List className="no-scrollbar max-h-72 scroll-py-1 overflow-x-hidden overflow-y-auto p-1 outline-none">
                {(option: ComboboxFieldOption) => (
                  <ComboboxPrimitive.Item
                    key={option.value}
                    value={option}
                    disabled={option.disabled}
                    className="flex min-h-7 cursor-default items-center gap-2 rounded-md px-2.5 py-1.5 text-xs/relaxed outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-muted data-[highlighted]:text-foreground"
                  >
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{option.label}</span>
                      {option.hint ? (
                        <span className="truncate text-xs text-muted-foreground">
                          {option.hint}
                        </span>
                      ) : null}
                    </div>
                    <ComboboxPrimitive.ItemIndicator keepMounted>
                      <IconCheck className="ml-2 size-4 shrink-0 data-[selected=false]:opacity-0" />
                    </ComboboxPrimitive.ItemIndicator>
                  </ComboboxPrimitive.Item>
                )}
              </ComboboxPrimitive.List>
            </ComboboxPrimitive.Popup>
          </ComboboxPrimitive.Positioner>
        </ComboboxPrimitive.Portal>
      </ComboboxPrimitive.Root>
    );
  },
);

Combobox.displayName = "Combobox";

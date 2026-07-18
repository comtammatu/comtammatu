"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus as IconPlus, ChevronDown as IconSelector } from "lucide-react";
import { cn } from "@comtammatu/ui";
import { matchesSearch } from "@lib/search";
import { fieldTriggerChrome } from "@comtammatu/ui/lib/field-trigger";
import { Button } from "@comtammatu/ui/components/button";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import { ComboboxPrimitive } from "@comtammatu/ui/components/combobox";

interface MultiSelectComboboxOption {
  value: string;
  label: string;
  hint?: string;
  /** Already-applied option: rendered checked + unselectable. */
  alreadySelected?: boolean;
  /** Locked option (e.g. ingredient deactivated). */
  disabled?: boolean;
  disabledReason?: string;
  keywords?: string[];
}

export interface MultiSelectComboboxProps {
  options: readonly MultiSelectComboboxOption[];
  /** Final callback when user confirms the picker; receives selected values (excluding already-applied). */
  onConfirm: (selected: string[]) => void;
  /** Trigger label / placeholder when nothing pending. */
  triggerLabel: string;
  confirmLabel: (count: number) => string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  /** Hint shown next to options that are already applied in the parent form. */
  alreadyAppliedHint?: string;
  /** Footer hint when no items are pending. */
  pickHint?: string;
  /** Footer hint when N items are pending — receives count. */
  pendingHint?: (count: number) => string;
  disabled?: boolean;
  triggerClassName?: string;
}

/**
 * Multi-select combobox for bulk-add flows using the shared Base UI behavior.
 *
 * Pending selection is held internally and flushed to the parent only on
 * confirm; cancel/dismiss discards. Use `alreadySelected` on options to
 * surface already-applied ingredients (rendered checked + disabled).
 */
export function MultiSelectCombobox({
  options,
  onConfirm,
  triggerLabel,
  confirmLabel,
  searchPlaceholder = "Tìm...",
  emptyMessage = "Không tìm thấy.",
  alreadyAppliedHint = "Đã có",
  pickHint = "Tích để chọn",
  pendingHint = (n: number) => `${n} đang chọn`,
  disabled,
  triggerClassName,
}: MultiSelectComboboxProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<Set<string>>(() => new Set());

  // Reset pending whenever popover opens (no leakage between sessions).
  useEffect(() => {
    if (!open) return;
    setPending(new Set());
  }, [open]);

  const selectableCount = useMemo(
    () => options.filter((o) => !o.alreadySelected && !o.disabled).length,
    [options],
  );

  const pendingOptions = useMemo(
    () =>
      [...pending].map(
        (value) =>
          options.find((option) => option.value === value) ?? {
            value,
            label: value,
          },
      ),
    [options, pending],
  );

  function handleConfirm() {
    const arr = [...pending];
    if (arr.length === 0) return;
    onConfirm(arr);
    setOpen(false);
  }

  return (
    <ComboboxPrimitive.Root
      items={options}
      multiple
      value={pendingOptions}
      open={open}
      disabled={disabled || selectableCount === 0}
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
      onValueChange={(nextOptions) =>
        setPending(new Set(nextOptions.map((option) => option.value)))
      }
    >
      <ComboboxPrimitive.Trigger
        render={
          <Button
            type="button"
            variant="outline"
            size="field"
            className={cn(
              "justify-between font-normal",
              fieldTriggerChrome,
              "hover:bg-input/20 aria-expanded:bg-input/30",
              triggerClassName,
            )}
          >
            <span className="inline-flex items-center gap-2 truncate">
              <IconPlus className="size-4 shrink-0" />
              {triggerLabel}
            </span>
            <IconSelector className="ml-2 size-3.5 shrink-0 text-muted-foreground" />
          </Button>
        }
      />
      <ComboboxPrimitive.Portal>
        <ComboboxPrimitive.Positioner
          align="start"
          sideOffset={4}
          className="isolate z-50"
        >
          <ComboboxPrimitive.Popup className="w-(--anchor-width) overflow-hidden rounded-lg bg-popover p-1 text-popover-foreground shadow-effect-popover">
            <ComboboxPrimitive.Input
              className="h-8 w-full rounded-md bg-input/20 px-2 text-xs/relaxed outline-hidden placeholder:text-muted-foreground dark:bg-input/30"
              placeholder={searchPlaceholder}
            />
            <ComboboxPrimitive.Empty className="py-6 text-center text-xs/relaxed">
              {emptyMessage}
            </ComboboxPrimitive.Empty>
            <ComboboxPrimitive.List className="no-scrollbar max-h-72 scroll-py-1 overflow-x-hidden overflow-y-auto p-1 outline-none">
              {(option: MultiSelectComboboxOption) => {
                const isAlready = !!option.alreadySelected;
                const isLocked = !!option.disabled;
                const isPending = pending.has(option.value);
                const checked = isAlready || isPending;

                return (
                  <ComboboxPrimitive.Item
                    key={option.value}
                    value={option}
                    disabled={isAlready || isLocked}
                    className={cn(
                      "flex min-h-7 cursor-default items-center gap-2 rounded-md px-2.5 py-1.5 text-xs/relaxed outline-hidden select-none data-[highlighted]:bg-muted data-[highlighted]:text-foreground",
                      (isAlready || isLocked) &&
                        "cursor-not-allowed opacity-60",
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      disabled={isAlready || isLocked}
                      tabIndex={-1}
                      aria-hidden="true"
                      className="mr-2"
                    />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{option.label}</span>
                      {option.hint || (isLocked && option.disabledReason) ? (
                        <span className="truncate text-xs text-muted-foreground">
                          {isLocked && option.disabledReason
                            ? option.disabledReason
                            : option.hint}
                        </span>
                      ) : null}
                    </div>
                    {isAlready ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {alreadyAppliedHint}
                      </span>
                    ) : null}
                  </ComboboxPrimitive.Item>
                );
              }}
            </ComboboxPrimitive.List>
            <div className="flex items-center justify-between border-t px-2 py-2">
              <span className="text-xs text-muted-foreground">
                {pending.size > 0 ? pendingHint(pending.size) : pickHint}
              </span>
              <Button
                type="button"
                size="sm"
                disabled={pending.size === 0}
                onClick={handleConfirm}
              >
                {confirmLabel(pending.size)}
              </Button>
            </div>
          </ComboboxPrimitive.Popup>
        </ComboboxPrimitive.Positioner>
      </ComboboxPrimitive.Portal>
    </ComboboxPrimitive.Root>
  );
}

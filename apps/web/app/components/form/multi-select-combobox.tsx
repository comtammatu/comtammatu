"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus as IconPlus, ChevronsUpDown as IconSelector } from "lucide-react";
import { cn } from "@comtammatu/ui";
import { matchesSearch } from "@lib/search";
import { Button } from "@comtammatu/ui/components/button";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
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

export interface MultiSelectComboboxOption {
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
 * Multi-select combobox for bulk-add flows. Composes
 * `Popover + Command + Checkbox` from the UI primitive layer.
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

  function toggle(value: string) {
    setPending((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  function handleConfirm() {
    const arr = [...pending];
    if (arr.length === 0) return;
    onConfirm(arr);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || selectableCount === 0}
          className={cn("h-10 justify-between font-normal", triggerClassName)}
        >
          <span className="inline-flex items-center gap-2 truncate">
            <IconPlus className="size-4 shrink-0" />
            {triggerLabel}
          </span>
          <IconSelector className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) p-0"
        align="start"
      >
        <Command
          filter={(v, search, keywords) => {
            return matchesSearch([v, ...(keywords ?? [])], search) ? 1 : 0;
          }}
        >
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList className="max-h-72">
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => {
                const isAlready = !!opt.alreadySelected;
                const isLocked = !!opt.disabled;
                const isPending = pending.has(opt.value);
                const checked = isAlready || isPending;
                return (
                  <CommandItem
                    key={opt.value}
                    value={opt.label}
                    keywords={opt.keywords}
                    disabled={isAlready || isLocked}
                    onSelect={() => {
                      if (isAlready || isLocked) return;
                      toggle(opt.value);
                    }}
                    className={cn(
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
                      <span className="truncate">{opt.label}</span>
                      {opt.hint || (isLocked && opt.disabledReason) ? (
                        <span className="truncate text-xs text-muted-foreground">
                          {isLocked && opt.disabledReason
                            ? opt.disabledReason
                            : opt.hint}
                        </span>
                      ) : null}
                    </div>
                    {isAlready ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {alreadyAppliedHint}
                      </span>
                    ) : null}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
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
        </Command>
      </PopoverContent>
    </Popover>
  );
}

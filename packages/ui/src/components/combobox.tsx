"use client";

import * as React from "react";
import { Combobox as BaseCombobox } from "@base-ui/react/combobox";
import {
  Check as IconCheck,
  ChevronDown as IconSelector,
  Plus as IconPlus,
} from "lucide-react";

import { cn } from "../lib/utils";
import { fieldTriggerChrome } from "../lib/field-trigger";
import { Button } from "./button";
import { Checkbox } from "./checkbox";

export interface ComboboxOption {
  value: string;
  label: string;
  hint?: string;
  keywords?: string[];
  disabled?: boolean;
}

export type ComboboxFilter<TOption extends ComboboxOption = ComboboxOption> = (
  option: TOption,
  query: string,
) => boolean;

export interface ComboboxProps extends Omit<
  React.ComponentProps<typeof Button>,
  "children" | "onChange" | "value"
> {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  contentClassName?: string;
  triggerClassName?: string;
  filter: ComboboxFilter;
}

const Combobox = React.forwardRef<HTMLButtonElement, ComboboxProps>(
  function Combobox(
    {
      value,
      onValueChange,
      options,
      placeholder = "Chọn...",
      searchPlaceholder = "Tìm...",
      emptyMessage = "Không tìm thấy.",
      contentClassName,
      triggerClassName,
      filter,
      className,
      disabled,
      size = "field",
      id,
      onBlur,
      "aria-label": ariaLabel,
      "aria-invalid": ariaInvalid,
      "aria-describedby": ariaDescribedBy,
      "aria-errormessage": ariaErrorMessage,
      "aria-required": ariaRequired,
      ...props
    },
    ref,
  ) {
    const [open, setOpen] = React.useState(false);
    const selected = React.useMemo(
      () => options.find((option) => option.value === value),
      [options, value],
    );

    return (
      <BaseCombobox.Root
        items={options}
        value={selected ?? null}
        open={open}
        disabled={disabled}
        itemToStringLabel={(option) => option.label}
        itemToStringValue={(option) => option.value}
        isItemEqualToValue={(left, right) => left.value === right.value}
        filter={filter}
        onOpenChange={setOpen}
        onValueChange={(option) => {
          if (!option) return;
          onValueChange(option.value);
          setOpen(false);
        }}
      >
        <BaseCombobox.Trigger
          render={
            <Button
              ref={ref}
              id={id}
              type="button"
              variant="outline"
              size={size}
              disabled={disabled}
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
              {...props}
            >
              <span className="truncate">
                {selected ? selected.label : placeholder}
              </span>
              <IconSelector className="ml-2 size-3.5 shrink-0 text-muted-foreground" />
            </Button>
          }
        />
        <BaseCombobox.Portal>
          <BaseCombobox.Positioner
            align="start"
            sideOffset={4}
            className="isolate z-50"
          >
            <BaseCombobox.Popup
              className={cn(
                "w-(--anchor-width) overflow-hidden rounded-lg bg-popover p-1 text-popover-foreground shadow-effect-popover",
                contentClassName,
              )}
              aria-label={ariaLabel ?? placeholder}
            >
              <BaseCombobox.Input
                className="h-8 w-full rounded-md bg-input/20 px-2 text-xs/relaxed outline-hidden placeholder:text-muted-foreground dark:bg-input/30"
                placeholder={searchPlaceholder}
              />
              <BaseCombobox.Empty className="py-4 text-center text-xs/relaxed">
                {emptyMessage}
              </BaseCombobox.Empty>
              <BaseCombobox.List className="no-scrollbar max-h-72 scroll-py-1 overflow-x-hidden overflow-y-auto p-1 outline-none">
                {(option: ComboboxOption) => (
                  <BaseCombobox.Item
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
                    <BaseCombobox.ItemIndicator keepMounted>
                      <IconCheck className="ml-2 size-4 shrink-0 data-[selected=false]:opacity-0" />
                    </BaseCombobox.ItemIndicator>
                  </BaseCombobox.Item>
                )}
              </BaseCombobox.List>
            </BaseCombobox.Popup>
          </BaseCombobox.Positioner>
        </BaseCombobox.Portal>
      </BaseCombobox.Root>
    );
  },
);

Combobox.displayName = "Combobox";

export interface MultiSelectComboboxOption extends ComboboxOption {
  alreadySelected?: boolean;
  disabledReason?: string;
}

export interface MultiSelectComboboxProps {
  options: readonly MultiSelectComboboxOption[];
  onConfirm: (selected: string[]) => void;
  triggerLabel: string;
  confirmLabel: (count: number) => string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  alreadyAppliedHint?: string;
  pickHint?: string;
  pendingHint?: (count: number) => string;
  disabled?: boolean;
  triggerClassName?: string;
  filter: ComboboxFilter<MultiSelectComboboxOption>;
}

function MultiSelectCombobox({
  options,
  onConfirm,
  triggerLabel,
  confirmLabel,
  searchPlaceholder = "Tìm...",
  emptyMessage = "Không tìm thấy.",
  alreadyAppliedHint = "Đã có",
  pickHint = "Tích để chọn",
  pendingHint = (count: number) => `${count} đang chọn`,
  disabled,
  triggerClassName,
  filter,
}: MultiSelectComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState<Set<string>>(() => new Set());

  React.useEffect(() => {
    if (!open) return;
    setPending(new Set());
  }, [open]);

  const selectableCount = React.useMemo(
    () =>
      options.filter((option) => !option.alreadySelected && !option.disabled)
        .length,
    [options],
  );
  const pendingOptions = React.useMemo(
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
    const selected = [...pending];
    if (selected.length === 0) return;
    onConfirm(selected);
    setOpen(false);
  }

  return (
    <BaseCombobox.Root
      items={options}
      multiple
      value={pendingOptions}
      open={open}
      disabled={disabled || selectableCount === 0}
      itemToStringLabel={(option) => option.label}
      itemToStringValue={(option) => option.value}
      isItemEqualToValue={(left, right) => left.value === right.value}
      filter={filter}
      onOpenChange={setOpen}
      onValueChange={(nextOptions) =>
        setPending(new Set(nextOptions.map((option) => option.value)))
      }
    >
      <BaseCombobox.Trigger
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
      <BaseCombobox.Portal>
        <BaseCombobox.Positioner
          align="start"
          sideOffset={4}
          className="isolate z-50"
        >
          <BaseCombobox.Popup className="w-(--anchor-width) overflow-hidden rounded-lg bg-popover p-1 text-popover-foreground shadow-effect-popover">
            <BaseCombobox.Input
              className="h-8 w-full rounded-md bg-input/20 px-2 text-xs/relaxed outline-hidden placeholder:text-muted-foreground dark:bg-input/30"
              placeholder={searchPlaceholder}
            />
            <BaseCombobox.Empty className="py-4 text-center text-xs/relaxed">
              {emptyMessage}
            </BaseCombobox.Empty>
            <BaseCombobox.List className="no-scrollbar max-h-72 scroll-py-1 overflow-x-hidden overflow-y-auto p-1 outline-none">
              {(option: MultiSelectComboboxOption) => {
                const isAlready = !!option.alreadySelected;
                const isLocked = !!option.disabled;
                const isPending = pending.has(option.value);

                return (
                  <BaseCombobox.Item
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
                      checked={isAlready || isPending}
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
                  </BaseCombobox.Item>
                );
              }}
            </BaseCombobox.List>
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
          </BaseCombobox.Popup>
        </BaseCombobox.Positioner>
      </BaseCombobox.Portal>
    </BaseCombobox.Root>
  );
}

export { Combobox, MultiSelectCombobox };

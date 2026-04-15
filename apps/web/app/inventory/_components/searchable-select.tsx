"use client";

import { useState, type CSSProperties } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@comtammatu/ui";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@comtammatu/ui/components/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@comtammatu/ui/components/command";

interface SelectOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  options: SelectOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  style?: CSSProperties;
  variant?: "default" | "ghost" | "pill";
}

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "Chọn...",
  searchPlaceholder = "Tìm kiếm...",
  emptyText = "Không tìm thấy.",
  className,
  style,
  variant = "default",
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "inline-flex items-center gap-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            variant === "default" &&
              "rounded-xl border-none px-4 py-3 font-medium focus:outline-none focus:ring-0",
            variant === "ghost" &&
              "cursor-pointer border-none bg-transparent p-0 pr-1 focus:ring-0",
            variant === "pill" &&
              "rounded-lg border-none px-4 py-2 focus:outline-none focus:ring-0",
            className,
          )}
          style={style}
        >
          <span className={cn(!selected && "opacity-60")}>
            {selected?.label ?? placeholder}
          </span>
          <ChevronDown
            className={cn(
              "size-3.5 shrink-0 opacity-50 transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="rounded-xl border border-border bg-card p-0 shadow-lg"
        align="start"
        style={{
          width: "var(--radix-popover-trigger-width)",
          minWidth: 220,
        }}
      >
        <Command
          className="bg-transparent"
          filter={(optionValue, search) => {
            const option = options.find((item) => item.value === optionValue);
            if (!option) return 0;
            return option.label.toLowerCase().includes(search.toLowerCase())
              ? 1
              : 0;
          }}
        >
          <CommandInput
            placeholder={searchPlaceholder}
            className="h-10 bg-transparent text-sm focus:ring-0"
          />
          <CommandList className="max-h-60">
            <CommandEmpty className="py-4 text-center text-sm text-muted-foreground">
              {emptyText}
            </CommandEmpty>
            <CommandGroup className="p-1">
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={(nextValue) => {
                    onValueChange(nextValue);
                    setOpen(false);
                  }}
                  className="cursor-pointer rounded-lg px-3 py-2 text-sm text-foreground"
                >
                  <span className="flex-1">{option.label}</span>
                  {value === option.value ? (
                    <Check className="size-4 shrink-0 text-primary" />
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

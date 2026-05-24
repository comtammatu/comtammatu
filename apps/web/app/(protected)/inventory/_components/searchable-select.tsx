"use client";

import { useState, type CSSProperties } from "react";
import { Check as IconCheck, ChevronDown as IconChevronDown } from "lucide-react";
import { cn } from "@comtammatu/ui";
import { matchesSearch } from "@lib/search";
import { Button } from "@comtammatu/ui/components/button";
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
        <Button
          type="button"
          role="combobox"
          aria-expanded={open}
          variant={variant === "ghost" ? "ghost" : "outline"}
          className={cn("justify-between", className)}
          style={style}
        >
          <span className={cn(!selected && "opacity-60")}>
            {selected?.label ?? placeholder}
          </span>
          <IconChevronDown
            className={cn(
              "size-3.5 shrink-0 opacity-50 transition-transform",
              open && "rotate-180",
            )}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0"
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
            return matchesSearch([option.label], search) ? 1 : 0;
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
                    <IconCheck className="size-4 shrink-0 text-primary" />
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

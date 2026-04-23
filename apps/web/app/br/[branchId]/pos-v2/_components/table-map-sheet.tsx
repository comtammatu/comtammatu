"use client";

import { useMemo } from "react";
import { cn } from "@comtammatu/ui";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { Badge } from "@comtammatu/ui/components/badge";
import { IconUsers } from "@tabler/icons-react";
import type { BranchTable } from "../../pos/page";

interface TableMapSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tables: BranchTable[];
  selectedTableId: number | null;
  onSelect: (id: number) => void;
}

const STATUS_STYLE: Record<
  string,
  { ring: string; bg: string; label: string; tone: "ok" | "busy" | "warn" }
> = {
  available: {
    ring: "ring-success/40 hover:ring-success",
    bg: "bg-success/10 text-success-foreground",
    label: "Trống",
    tone: "ok",
  },
  occupied: {
    ring: "ring-destructive/40",
    bg: "bg-destructive/10 text-destructive",
    label: "Đang dùng",
    tone: "busy",
  },
  reserved: {
    ring: "ring-warning/40",
    bg: "bg-warning/15 text-warning-foreground",
    label: "Đã đặt",
    tone: "warn",
  },
  cleaning: {
    ring: "ring-muted-foreground/30",
    bg: "bg-muted text-muted-foreground",
    label: "Dọn bàn",
    tone: "warn",
  },
  maintenance: {
    ring: "ring-muted-foreground/30",
    bg: "bg-muted text-muted-foreground",
    label: "Bảo trì",
    tone: "warn",
  },
};

function groupByZone(tables: BranchTable[]) {
  const map = new Map<string, { zoneName: string; items: BranchTable[] }>();
  for (const t of tables) {
    const key = t.branch_zones?.name ?? "Khu khác";
    const existing = map.get(key);
    if (existing) existing.items.push(t);
    else map.set(key, { zoneName: key, items: [t] });
  }
  return Array.from(map.values()).map((g) => ({
    ...g,
    items: g.items.sort((a, b) => a.number - b.number),
  }));
}

export function TableMapSheet({
  open,
  onOpenChange,
  tables,
  selectedTableId,
  onSelect,
}: TableMapSheetProps) {
  const zones = useMemo(() => groupByZone(tables), [tables]);
  const availableCount = tables.filter((t) => t.status === "available").length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0">
        <SheetHeader className="border-b border-border/60 px-5 py-4">
          <SheetTitle className="text-lg">Chọn bàn</SheetTitle>
          <SheetDescription>
            {availableCount}/{tables.length} bàn đang trống.
          </SheetDescription>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <Legend color="bg-success/20 ring-success/40" label="Trống" />
            <Legend color="bg-destructive/15 ring-destructive/40" label="Đang dùng" />
            <Legend color="bg-warning/20 ring-warning/40" label="Đã đặt" />
            <Legend color="bg-muted ring-muted-foreground/30" label="Khác" />
          </div>
        </SheetHeader>
        <ScrollArea className="h-[calc(100dvh-8.5rem)]">
          <div className="flex flex-col gap-6 p-5">
            {zones.map((zone) => (
              <section key={zone.zoneName}>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    {zone.zoneName}
                  </h3>
                  <Badge variant="outline" className="text-xs">
                    {zone.items.filter((t) => t.status === "available").length}/{zone.items.length} trống
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                  {zone.items.map((t) => {
                    const style = STATUS_STYLE[t.status] ?? STATUS_STYLE.maintenance!;
                    const isSelected = selectedTableId === t.id;
                    const disabled = t.status !== "available" && !isSelected;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          onSelect(t.id);
                          onOpenChange(false);
                        }}
                        className={cn(
                          "flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl p-3 text-center ring-1 transition",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                          style.bg,
                          style.ring,
                          disabled && "cursor-not-allowed opacity-60",
                          isSelected && "ring-2 ring-primary shadow-md",
                        )}
                        aria-pressed={isSelected}
                        aria-label={`Bàn ${String(t.number)}, ${style.label}, sức chứa ${String(t.capacity)}`}
                      >
                        <span className="text-lg font-bold leading-none">
                          {t.number}
                        </span>
                        <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide">
                          <IconUsers className="size-3" />
                          {t.capacity}
                        </span>
                        <span className="text-[10px] font-medium">
                          {style.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("inline-block size-3 rounded ring-1", color)} />
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

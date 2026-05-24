"use client";

import { AppToolbar } from "@/components/surface";
import { Badge } from "@comtammatu/ui/components/badge";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@comtammatu/ui/components/toggle-group";
import { messages } from "@lib/messages";
import type { KdsStation } from "../types";

interface StationToggleBarProps {
  stations: KdsStation[];
  activeStationId: number | null;
  stationCounts: Map<number, number>;
  totalActiveCount: number;
  onChange: (value: string | null) => void;
}

export function StationToggleBar({
  stations,
  activeStationId,
  stationCounts,
  totalActiveCount,
  onChange,
}: StationToggleBarProps) {
  return (
    <div className="border-y px-3 py-1.5 md:px-4">
      <AppToolbar className="min-w-0 p-1.5">
        <ScrollArea className="min-w-0 flex-1">
          <ToggleGroup
            type="single"
            value={activeStationId === null ? "all" : String(activeStationId)}
            onValueChange={(value) => {
              if (!value) return;
              onChange(value === "all" ? null : value);
            }}
            variant="outline"
            className="h-auto justify-start gap-1.5"
          >
            <ToggleGroupItem
              value="all"
              className="shrink-0 gap-2 px-3 py-2 text-sm font-semibold"
              aria-label={messages.pos.kds.allStationsAria}
            >
              {messages.pos.kds.allStations}
              <Badge
                variant="secondary"
                className="rounded-full px-2 py-0.5 text-xs font-semibold"
              >
                {totalActiveCount}
              </Badge>
            </ToggleGroupItem>
            {stations.map((station) => (
              <ToggleGroupItem
                key={station.id}
                value={String(station.id)}
                className="shrink-0 gap-2 px-3 py-2 text-sm font-semibold"
                aria-label={messages.pos.kds.stationAria(station.name)}
              >
                {station.name}
                <Badge
                  variant="secondary"
                  className="rounded-full px-2 py-0.5 text-xs font-semibold"
                >
                  {stationCounts.get(station.id) ?? 0}
                </Badge>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </ScrollArea>
      </AppToolbar>
    </div>
  );
}

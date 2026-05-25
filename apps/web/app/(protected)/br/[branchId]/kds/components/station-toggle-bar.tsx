"use client";

import { Button } from "@comtammatu/ui/components/button";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
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
    <div className="min-w-0 flex-1">
      <ScrollArea className="w-full min-w-0 whitespace-nowrap">
        <div className="flex min-w-max items-center gap-1">
          <Button
            type="button"
            variant={activeStationId === null ? "secondary" : "ghost"}
            size="default"
            className="gap-1.5 px-2.5 text-sm font-semibold"
            aria-label={messages.pos.kds.allStationsAria}
            aria-pressed={activeStationId === null}
            onClick={() => onChange(null)}
          >
            {messages.pos.kds.allStations}
            <span className="font-mono text-sm font-semibold tabular-nums text-muted-foreground">
              {totalActiveCount}
            </span>
          </Button>
          {stations.map((station) => (
            <Button
              key={station.id}
              type="button"
              variant={activeStationId === station.id ? "secondary" : "ghost"}
              size="default"
              className="gap-1.5 px-2.5 text-sm font-semibold"
              aria-label={messages.pos.kds.stationAria(station.name)}
              aria-pressed={activeStationId === station.id}
              onClick={() => onChange(String(station.id))}
            >
              {station.name}
              <span className="font-mono text-sm font-semibold tabular-nums text-muted-foreground">
                {stationCounts.get(station.id) ?? 0}
              </span>
            </Button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

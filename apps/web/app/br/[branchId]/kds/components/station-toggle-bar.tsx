"use client";

import { AppToolbar } from "@/components/surface";
import { Badge } from "@comtammatu/ui/components/badge";
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
    <div className="border-b px-2 py-1.5 md:px-4 md:py-2">
      <AppToolbar className="w-full min-w-0 overflow-hidden p-1.5 md:p-2">
        <div className="w-full min-w-0 overflow-x-auto">
          <ToggleGroup
            type="single"
            value={activeStationId === null ? "all" : String(activeStationId)}
            onValueChange={(value) => {
              if (!value) return;
              onChange(value === "all" ? null : value);
            }}
            variant="outline"
            size="touch"
            spacing="md"
            className="h-auto w-max min-w-full justify-start pr-2"
          >
            <ToggleGroupItem
              value="all"
              className="shrink-0 gap-2 font-semibold"
              aria-label={messages.pos.kds.allStationsAria}
            >
              {messages.pos.kds.allStations}
              <Badge
                variant="secondary"
                className="text-xs font-semibold"
              >
                {totalActiveCount}
              </Badge>
            </ToggleGroupItem>
            {stations.map((station) => (
              <ToggleGroupItem
                key={station.id}
                value={String(station.id)}
                className="shrink-0 gap-2 font-semibold"
                aria-label={messages.pos.kds.stationAria(station.name)}
              >
                {station.name}
                <Badge
                  variant="secondary"
                  className="text-xs font-semibold"
                >
                  {stationCounts.get(station.id) ?? 0}
                </Badge>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </AppToolbar>
    </div>
  );
}

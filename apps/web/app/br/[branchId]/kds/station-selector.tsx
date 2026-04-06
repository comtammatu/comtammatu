"use client";

import { useRouter } from "next/navigation";
import { Button } from "@comtammatu/ui/components/button";
import type { KdsStation } from "./types";

interface StationSelectorProps {
  stations: KdsStation[];
  selectedStationId: number;
  branchId: number;
}

export function StationSelector({
  stations,
  selectedStationId,
  branchId,
}: StationSelectorProps) {
  const router = useRouter();

  return (
    <div className="flex gap-1 overflow-x-auto">
      {stations.map((station) => (
        <Button
          key={station.id}
          variant={station.id === selectedStationId ? "default" : "ghost"}
          size="sm"
          onClick={() =>
            router.push(`/br/${branchId}/kds?station=${station.id}`)
          }
        >
          {station.name}
        </Button>
      ))}
    </div>
  );
}

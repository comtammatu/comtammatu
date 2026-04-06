import { ChefHat } from "lucide-react";
import { fetchKdsStations, fetchKdsQueue } from "./actions";
import { KdsBoard } from "./kds-board";
import { StationSelector } from "./station-selector";
import type { KdsStation, KdsOrderItem } from "./types";

export default async function KdsPage({
  params,
  searchParams,
}: {
  params: Promise<{ branchId: string }>;
  searchParams: Promise<{ station?: string }>;
}) {
  const { branchId } = await params;
  const branchIdNum = Number(branchId);
  const { station: stationParam } = await searchParams;

  // Fetch stations for this branch
  const stationsResult = await fetchKdsStations(branchIdNum);

  if (!stationsResult.success || !stationsResult.data) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <ChefHat className="mx-auto size-16 text-muted-foreground" />
          <p className="mt-4 text-lg font-medium text-destructive">
            {stationsResult.error ?? "Không thể tải trạm bếp"}
          </p>
        </div>
      </div>
    );
  }

  const stations = stationsResult.data as KdsStation[];

  if (stations.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <ChefHat className="mx-auto size-16 text-muted-foreground" />
          <h1 className="mt-4 text-xl font-bold">Chưa cấu hình trạm bếp</h1>
          <p className="mt-2 text-muted-foreground">
            Quản lý cần tạo trạm bếp trong phần Cài đặt trước.
          </p>
        </div>
      </div>
    );
  }

  // Select station from URL param or default to first
  const firstStation = stations[0];
  if (!firstStation) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-lg text-destructive">Không có trạm bếp</p>
      </div>
    );
  }

  const selectedStationId = stationParam
    ? Number(stationParam)
    : firstStation.id;

  const selectedStation = stations.find((s) => s.id === selectedStationId);
  if (!selectedStation) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-lg text-destructive">Trạm bếp không tồn tại</p>
      </div>
    );
  }

  // Fetch queue for selected station
  const queueResult = await fetchKdsQueue(branchIdNum, selectedStationId);
  const items = (queueResult.success ? queueResult.data : []) as KdsOrderItem[];

  // We need tenant_id for realtime subscription — extract from first station's context
  // The auth context already validated tenant, so we pass it from the server
  const tenantId = await getTenantId();

  return (
    <div className="flex h-full flex-col">
      {/* Station tabs */}
      <div className="flex items-center gap-2 border-b bg-muted/50 px-3 py-2">
        <ChefHat className="size-5 text-muted-foreground" />
        <StationSelector
          stations={stations}
          selectedStationId={selectedStationId}
          branchId={branchIdNum}
        />
      </div>

      {/* KDS Board */}
      <div className="flex-1 overflow-auto">
        <KdsBoard
          branchId={branchIdNum}
          initialItems={items}
          selectedStationId={selectedStationId}
          tenantId={tenantId}
        />
      </div>
    </div>
  );
}

async function getTenantId(): Promise<number> {
  const { createClient } = await import(
    "@comtammatu/database/supabase/server"
  );
  const { extractClaims } = await import("@comtammatu/shared/auth");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const claims = user ? extractClaims(user.app_metadata) : null;
  return claims?.tenant_id ?? 0;
}

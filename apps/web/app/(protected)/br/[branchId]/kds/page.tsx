import { CircleAlert as IconAlertCircle } from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { KDS_VI } from "@comtammatu/shared/messages";
import { AppEmptyState } from "@/components/surface";
import { loadAuthState } from "@/_lib/auth";
import { currentUserHasPermission } from "@/_lib/permissions";
import { KdsBoard } from "./kds-board";
import type { KdsStation } from "./types";

function KdsStatusShell({ description }: { description: string }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-4">
      <AppEmptyState
        mode="error"
        description={description}
        descriptionClassName="max-w-md text-sm"
        icon={<IconAlertCircle />}
        iconClassName="size-12 border border-border/70 bg-background/80 text-destructive"
        title={KDS_VI.statusErrorTitle}
        titleClassName="text-xl font-semibold tracking-tight sm:text-2xl"
      >
        <Badge variant="destructive">
          <IconAlertCircle className="size-3.5" />
          <span>{KDS_VI.statusErrorBadge}</span>
        </Badge>
      </AppEmptyState>
    </div>
  );
}

export default async function KdsPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { supabase } = await loadAuthState();

  const { branchId } = await params;
  const branchIdNum = Number(branchId);

  // Stations + permissions are mutually independent of tickets and resolve fast,
  // so the board shell (station columns, bump/recall affordances) paints
  // immediately. The ticket snapshot is fetched on the client once the realtime
  // channel subscribes (seeded=false), instead of blocking the whole page behind
  // the two-stage ticket→orders/items await chain.
  const [stationsRes, [canMarkReady, canRecall]] = await Promise.all([
    supabase
      .from("kds_stations")
      .select("id, name, position, is_active")
      .eq("branch_id", branchIdNum)
      .eq("is_active", true)
      .order("position"),
    Promise.all([
      currentUserHasPermission(branchIdNum, "kds:mark_ready"),
      currentUserHasPermission(branchIdNum, "kds:recall"),
    ]),
  ]);

  const { data: rawStations, error: stationsError } = stationsRes;

  if (stationsError) {
    return <KdsStatusShell description={KDS_VI.stationsLoadFailed} />;
  }

  const stations = (rawStations ?? []) as KdsStation[];

  // Resolve fallback stations (those without a category mapping) so the shell
  // shows the correct column layout before tickets hydrate.
  const mappingRows =
    stations.length > 0
      ? await supabase
          .from("kds_station_categories")
          .select("station_id")
          .in(
            "station_id",
            stations.map((s) => s.id),
          )
          .then((res) => res.data)
      : null;
  const mapped = new Set(
    ((mappingRows ?? []) as { station_id: number }[]).map(
      (r) => r.station_id,
    ),
  );
  const fallbackStationIds = stations
    .filter((s) => !mapped.has(s.id))
    .map((s) => s.id);

  return (
    <KdsBoard
      branchId={branchIdNum}
      initialNowMs={Date.now()}
      stations={stations}
      fallbackStationIds={fallbackStationIds}
      canMarkReady={canMarkReady}
      canRecall={canRecall}
      initialTickets={[]}
      initialOrders={[]}
      initialOrderItems={[]}
      initialKitchenBatches={[]}
      seeded={false}
    />
  );
}

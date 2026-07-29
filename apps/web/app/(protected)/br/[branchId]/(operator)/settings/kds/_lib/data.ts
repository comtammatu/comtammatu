import type {
  CategoryOption,
  StationRow,
} from "@/(protected)/br/_shared/settings/kds/stations-client";

/** Raw shape of the kds_stations select with the joined category rows. */
export interface KdsStationQueryRow {
  id: number;
  name: string;
  branch_id: number;
  position: number;
  is_active: boolean;
  kds_station_categories: { id: number; category_id: number }[] | null;
}

/** Flatten the station->category join into the category_ids the client expects. */
export function mapStationRows(rows: KdsStationQueryRow[]): StationRow[] {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    branch_id: row.branch_id,
    position: row.position,
    is_active: row.is_active,
    category_ids: row.kds_station_categories?.map((sc) => sc.category_id) ?? [],
  }));
}

export type { CategoryOption, StationRow };

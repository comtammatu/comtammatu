export type StaffCountLocationRow = {
  id: number;
  location_kind: string | null;
};

export type StaffCountLocationOption = {
  id: number;
  kind: string | null;
};

export function selectStaffCountLocations<T extends StaffCountLocationRow>(
  rows: readonly T[],
): T[] {
  const hasKitchen = rows.some((row) => row.location_kind === "kitchen");
  if (!hasKitchen) return [...rows];
  return rows.filter((row) => row.location_kind === "kitchen");
}

export function pickDefaultStaffCountLocationId(
  locations: readonly StaffCountLocationOption[],
  requestedId: number | null,
): number | null {
  if (
    requestedId != null &&
    locations.some((location) => location.id === requestedId)
  ) {
    return requestedId;
  }
  return (
    locations.find((location) => location.kind === "kitchen")?.id ??
    locations.find((location) => location.kind === "warehouse")?.id ??
    locations[0]?.id ??
    null
  );
}

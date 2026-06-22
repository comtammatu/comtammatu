import type { TableRow } from "@/(protected)/branch-settings/_shared/tables/table-table";

// Shape of a row returned by the tables query in page.tsx. The embedded
// branch_zones relation can arrive as an object or null depending on PostgREST.
interface TableQueryRow {
  id: number;
  branch_id: number;
  zone_id: number | null;
  number: number;
  status: string;
  branch_zones: { name: string } | null;
}

export function shapeTableRows(rows: readonly TableQueryRow[]): TableRow[] {
  return rows.map((row) => ({
    id: row.id,
    branch_id: row.branch_id,
    zone_id: row.zone_id,
    number: row.number,
    status: row.status,
    zone_name: row.branch_zones?.name ?? null,
  }));
}

export function resolveDisplayName(input: {
  fullName: unknown;
  email: string | null | undefined;
  fallback: string;
}): string {
  if (typeof input.fullName === "string" && input.fullName.length > 0) {
    return input.fullName;
  }
  if (input.email) return input.email;
  return input.fallback;
}

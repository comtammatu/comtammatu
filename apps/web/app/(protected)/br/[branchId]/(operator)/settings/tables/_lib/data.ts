import type { TableRow } from "@/(protected)/branch-settings/_shared/tables/table-table";

// Shape of a row returned by the tables query in page.tsx. The embedded
// branch_zones relation can arrive as an object or null depending on PostgREST.
interface TableQueryRow {
  id: number;
  branch_id: number;
  zone_id: number | null;
  number: number;
  status: string;
  self_order_token: string | null;
  self_order_enabled: boolean;
  self_order_token_rotated_at: string | null;
  branch_zones: { name: string } | null;
}

export function shapeTableRows(rows: readonly TableQueryRow[]): TableRow[] {
  return rows.map((row) => ({
    id: row.id,
    branch_id: row.branch_id,
    zone_id: row.zone_id,
    number: row.number,
    status: row.status,
    self_order_token: row.self_order_token,
    self_order_enabled: row.self_order_enabled,
    self_order_token_rotated_at: row.self_order_token_rotated_at,
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

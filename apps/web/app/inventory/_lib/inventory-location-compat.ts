import type { Database, SupabaseClient } from "@comtammatu/database";

type TenantSupabase = SupabaseClient<Database>;

type CompatError = {
  code?: string;
  details?: string | null;
  hint?: string | null;
  message?: string;
};

type QueryResult<T> = {
  data: T | null;
  error: CompatError | null;
};

export type InventoryLocationMode = "receive" | "issue" | "consumption";

const LOCATION_DEFAULT_FLAG: Record<InventoryLocationMode, string> = {
  receive: "is_default_receive",
  issue: "is_default_issue",
  consumption: "is_default_consumption",
};

const LOCATION_COMPAT_CODES = new Set([
  "42P01",
  "42703",
  "42883",
  "PGRST100",
  "PGRST202",
  "PGRST204",
  "PGRST205",
]);

const LOCATION_COMPAT_PATTERNS = [
  "inventory_locations",
  "location_id",
  "source_location_id",
  "target_location_id",
  "from_location_id",
  "to_location_id",
  "p_location_id",
  "p_from_location_id",
  "p_to_location_id",
];

function formatCompatError(error: CompatError | null): string {
  return [error?.message, error?.details, error?.hint]
    .filter((part) => typeof part === "string" && part.length > 0)
    .join(" ");
}

export function isInventoryLocationCompatError(
  error: CompatError | null,
): boolean {
  if (!error) return false;
  if (error.code && LOCATION_COMPAT_CODES.has(error.code)) return true;

  const message = formatCompatError(error).toLowerCase();
  return LOCATION_COMPAT_PATTERNS.some((pattern) =>
    message.includes(pattern.toLowerCase()),
  );
}

export async function withInventoryLocationCompatFallback<T>(
  primary: () => Promise<QueryResult<T>>,
  fallback: () => Promise<QueryResult<T>>,
): Promise<QueryResult<T>> {
  const result = await primary();
  if (!isInventoryLocationCompatError(result.error)) {
    return result;
  }
  return fallback();
}

export async function resolveDefaultInventoryLocation(
  supabase: TenantSupabase,
  tenantId: number,
  branchId: number,
  mode: InventoryLocationMode,
): Promise<number | null> {
  const defaultFlag = LOCATION_DEFAULT_FLAG[mode];
  const { data, error } = await supabase
    .from("inventory_locations")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("branch_id", branchId)
    .eq(defaultFlag, true)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    // Only swallow compat errors (table/column not yet migrated).
    // Surface real failures so callers don't proceed with unscoped location_id.
    if (isInventoryLocationCompatError(error)) {
      return null;
    }
    throw error;
  }

  return data?.id ?? null;
}

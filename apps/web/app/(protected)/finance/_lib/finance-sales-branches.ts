/**
 * Sales Chi nhánh ids only (`branch_kind = branch`).
 * Kho Tổng / Bếp Trung Tâm are operable sites but not sales branches —
 * Finance `location=branches` must not include them.
 */
export async function fetchSalesBranchIds(
  // Tenant supabase client — keep loose to avoid PostgREST builder depth errors.
  supabase: {
    from: (table: string) => {
      select: (columns: string) => unknown;
    };
  },
  tenantId: number,
): Promise<number[]> {
  let query = supabase.from("branches").select("id") as {
    eq: (column: string, value: unknown) => unknown;
  };
  query = query.eq("tenant_id", tenantId) as typeof query;
  query = query.eq("branch_kind", "branch") as typeof query;
  const activeQuery = query.eq("is_active", true) as Promise<{
    data: Array<{ id: number }> | null;
    error: unknown;
  }>;
  const { data, error } = await activeQuery;
  if (error) return [];
  return (data ?? []).map((row) => row.id);
}

/** Apply sales-CN-only filter; empty list forces zero rows. */
export function applySalesBranchesFilter<
  T extends {
    in: (column: string, values: readonly number[]) => T;
    eq: (column: string, value: number) => T;
  },
>(query: T, column: string, salesBranchIds: readonly number[]): T {
  if (salesBranchIds.length === 0) {
    return query.eq(column, -1);
  }
  return query.in(column, salesBranchIds);
}

import { fetchAllPagedRows } from "./supabase-page";

/** Paid orders with no recipe lines are 0đ food cost — they still cover the KPI. */
export function orderHasNoRecipeNeed(
  itemMenuItemIds: readonly number[],
  recipeMenuItemIds: ReadonlySet<number>,
): boolean {
  return itemMenuItemIds.every((id) => !recipeMenuItemIds.has(id));
}

type QueryResult<T> = Promise<{
  data: T[] | null;
  error: { code?: string } | null;
}>;

type FilterBuilder<T> = {
  eq: (column: string, value: unknown) => FilterBuilder<T>;
  neq: (column: string, value: unknown) => FilterBuilder<T>;
  in: (column: string, values: readonly unknown[]) => FilterBuilder<T>;
  gte: (column: string, value: unknown) => FilterBuilder<T>;
  lt: (column: string, value: unknown) => FilterBuilder<T>;
  order: (column: string) => FilterBuilder<T>;
  range: (from: number, to: number) => FilterBuilder<T>;
};

function asFilter<T>(query: unknown): FilterBuilder<T> {
  return query as FilterBuilder<T>;
}

function asResult<T>(query: FilterBuilder<T>): QueryResult<T> {
  return query as unknown as QueryResult<T>;
}

/**
 * Adds paid sales-CN orders in range whose non-cancelled items have no menu
 * recipe. Those orders never create sale_consumption and must not hide
 * Giá vốn món.
 */
export async function addPaidOrdersWithoutRecipeNeed({
  supabase,
  tenantId,
  allowedBranchIds,
  startIso,
  endIso,
  coveredOrderIds,
}: {
  supabase: {
    from: (table: string) => { select: (columns: string) => unknown };
  };
  tenantId: number;
  allowedBranchIds: readonly number[];
  startIso: string;
  endIso: string;
  coveredOrderIds: Set<number>;
}): Promise<void> {
  if (allowedBranchIds.length === 0) return;

  const { data: payments, error: payError } = await fetchAllPagedRows((from, to) =>
    asResult(
      asFilter<{
        order_id: number | null;
        orders: { id: number } | Array<{ id: number }> | null;
      }>(
        supabase
          .from("payments")
          .select(
            "order_id, orders!inner(id, branch_id, status, payment_status, tenant_id)",
          ),
      )
        .eq("status", "completed")
        .eq("orders.tenant_id", tenantId)
        .eq("orders.payment_status", "paid")
        .neq("orders.status", "cancelled")
        .in("orders.branch_id", allowedBranchIds)
        .gte("paid_at", startIso)
        .lt("paid_at", endIso)
        .order("id")
        .range(from, to),
    ),
  );
  if (payError || !payments) return;

  const missing = new Set<number>();
  for (const row of payments) {
    const order = Array.isArray(row.orders) ? row.orders[0] : row.orders;
    const id = Number(row.order_id ?? order?.id);
    if (!Number.isFinite(id) || id <= 0) continue;
    if (!coveredOrderIds.has(id)) missing.add(id);
  }
  if (missing.size === 0) return;

  const missingIds = [...missing];
  const { data: items, error: itemError } = await fetchAllPagedRows((from, to) =>
    asResult(
      asFilter<{ order_id: number; menu_item_id: number }>(
        supabase.from("order_items").select("order_id, menu_item_id"),
      )
        .eq("tenant_id", tenantId)
        .in("order_id", missingIds)
        .neq("status", "cancelled")
        .order("id")
        .range(from, to),
    ),
  );
  if (itemError) return;

  const itemsByOrder = new Map<number, number[]>();
  for (const id of missingIds) itemsByOrder.set(id, []);
  const menuIds = new Set<number>();
  for (const item of items ?? []) {
    const orderId = Number(item.order_id);
    const menuId = Number(item.menu_item_id);
    if (!Number.isFinite(orderId) || !Number.isFinite(menuId)) continue;
    const list = itemsByOrder.get(orderId);
    if (!list) continue;
    list.push(menuId);
    menuIds.add(menuId);
  }

  const recipeMenuIds = new Set<number>();
  if (menuIds.size > 0) {
    const { data: recipes, error: recipeError } = await asResult(
      asFilter<{ menu_item_id: number }>(
        supabase.from("recipes").select("menu_item_id"),
      )
        .eq("tenant_id", tenantId)
        .in("menu_item_id", [...menuIds]),
    );
    if (recipeError) return;
    for (const row of recipes ?? []) {
      const id = Number(row.menu_item_id);
      if (Number.isFinite(id)) recipeMenuIds.add(id);
    }
  }

  for (const [orderId, itemMenuIds] of itemsByOrder) {
    if (orderHasNoRecipeNeed(itemMenuIds, recipeMenuIds)) {
      coveredOrderIds.add(orderId);
    }
  }
}

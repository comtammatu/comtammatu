import type { PosSessionOrder, PosSessionRow } from "../pos-sessions-client";

// Supabase returns numeric/decimal columns as strings; coerce to number at the
// trust boundary so downstream components receive the typed shapes they expect.
// The raw rows are intentionally `unknown`-cast because the generated row type
// nests embedded relations differently from the client-facing interfaces.

export function normalizeSessionRows(
  rows: readonly unknown[] | null,
): PosSessionRow[] {
  return ((rows ?? []) as unknown as PosSessionRow[]).map((session) => ({
    ...session,
    opening_cash: Number(session.opening_cash),
    closing_cash:
      session.closing_cash == null ? null : Number(session.closing_cash),
    expected_cash:
      session.expected_cash == null ? null : Number(session.expected_cash),
    cash_difference:
      session.cash_difference == null ? null : Number(session.cash_difference),
  }));
}

export function normalizeOrderRows(
  rows: readonly unknown[] | null,
): PosSessionOrder[] {
  return ((rows ?? []) as unknown as PosSessionOrder[]).map((order) => ({
    ...order,
    subtotal: Number(order.subtotal),
    tax_amount: Number(order.tax_amount),
    service_charge: Number(order.service_charge),
    discount_amount: Number(order.discount_amount),
    total_amount: Number(order.total_amount),
    order_items: order.order_items.map((item) => ({
      ...item,
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
      subtotal: Number(item.subtotal),
      modifiers: Array.isArray(item.modifiers) ? item.modifiers : [],
      sides: Array.isArray(item.sides) ? item.sides : [],
    })),
  }));
}

export function resolveSelectedSessionId(
  requested: string | undefined,
  sessions: readonly PosSessionRow[],
): number | null {
  if (sessions.length === 0) return null;

  const parsed = requested != null ? Number(requested) : NaN;
  if (
    Number.isInteger(parsed) &&
    sessions.some((session) => session.id === parsed)
  ) {
    return parsed;
  }

  return sessions[0]?.id ?? null;
}

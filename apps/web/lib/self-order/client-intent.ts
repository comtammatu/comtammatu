import type { SelfOrderCartItem } from "./contracts";

export interface SelfOrderClientIntent {
  key: string;
  clientOpId: string;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}

function intentKey(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function buildBatchIntentKey(input: {
  items: readonly SelfOrderCartItem[];
  customerNote?: string;
}): string {
  return intentKey({
    items: input.items.map(({ key: _key, ...item }) => item),
    customerNote: input.customerNote?.trim() || null,
  });
}

export function buildPaymentIntentKey(input: {
  method: "cash_call" | "vietqr";
  orderNumber: string;
  totalAmount: number;
}): string {
  return intentKey(input);
}

export function resolveClientIntent(
  current: SelfOrderClientIntent | null,
  key: string,
  createId: () => string,
): SelfOrderClientIntent {
  if (current?.key === key) return current;
  return { key, clientOpId: createId() };
}

export function clearClientIntent(
  current: SelfOrderClientIntent | null,
  clientOpId: string,
): SelfOrderClientIntent | null {
  return current?.clientOpId === clientOpId ? null : current;
}

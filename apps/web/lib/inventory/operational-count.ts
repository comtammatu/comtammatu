export type OperationalCount =
  | { status: "ready"; count: number }
  | { status: "unavailable" }
  | { status: "forbidden" };

export function operationalCount(
  value: unknown,
  error: unknown,
): OperationalCount {
  if (
    error ||
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    return { status: "unavailable" };
  }
  return { status: "ready", count: value };
}

export async function settleOperationalCount(
  load: () => Promise<OperationalCount>,
): Promise<OperationalCount> {
  try {
    return await load();
  } catch {
    return { status: "unavailable" };
  }
}
